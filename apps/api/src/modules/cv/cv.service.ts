import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cv, CvTemplate, type CvDocument } from '../../database/entities/cv.entity';
import { CvStatus } from '../../common/constants/domain';
import { Errors } from '../../common/utils/errors';
import { CvBuilderService } from './cv-builder.service';
import { renderCvPdf } from './pdf-renderer';
import { TEMPLATE_DEFINITIONS, resolveTemplate } from './template-registry';
import { AuditService } from '../audit/audit.service';
import type { CreateCvDto, UpdateCvDto } from './dto/cv.dto';

@Injectable()
export class CvService {
  private readonly logger = new Logger(CvService.name);

  constructor(
    @InjectRepository(Cv) private readonly cvs: Repository<Cv>,
    @InjectRepository(CvTemplate) private readonly templates: Repository<CvTemplate>,
    private readonly builder: CvBuilderService,
    private readonly audit: AuditService,
  ) {}

  async listTemplates() {
    const rows = await this.templates.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      category: row.category,
      layout: row.layout,
      atsFriendly: row.atsFriendly,
      isPremium: row.isPremium,
      defaults: row.defaults,
    }));
  }

  /** Metadata + pagination for the user's CV library. */
  async list(userId: string, params: { page: number; limit: number; search?: string; status?: CvStatus }) {
    const qb = this.cvs
      .createQueryBuilder('cv')
      .where('cv.userId = :userId', { userId })
      .orderBy('cv.updatedAt', 'DESC');

    if (params.search) qb.andWhere('cv.title LIKE :search', { search: `%${params.search}%` });
    if (params.status) qb.andWhere('cv.status = :status', { status: params.status });

    const [items, total] = await qb
      .skip((params.page - 1) * params.limit)
      .take(params.limit)
      .getManyAndCount();

    return {
      items: items.map((cv) => ({
        id: cv.id,
        title: cv.title,
        templateKey: cv.templateKey,
        status: cv.status,
        targetRole: cv.targetRole,
        updatedAt: cv.updatedAt,
        createdAt: cv.createdAt,
        downloadCount: cv.downloadCount,
        version: cv.version,
        aiAssisted: cv.aiAssisted,
        // Lightweight preview data for library tiles.
        preview: {
          fullName: cv.document?.header?.fullName ?? '',
          headline: cv.document?.header?.headline ?? '',
          sectionCount: cv.document?.sections?.length ?? 0,
        },
      })),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
        hasNext: params.page * params.limit < total,
        hasPrev: params.page > 1,
      },
    };
  }

  async get(userId: string, id: string): Promise<Cv> {
    const cv = await this.cvs.findOne({ where: { id } });
    // IDOR guard: ownership is enforced here, not in the controller.
    if (!cv || cv.userId !== userId) throw Errors.notFound('CV');
    return cv;
  }

  async create(userId: string, dto: CreateCvDto): Promise<Cv> {
    const templateKey = resolveTemplate(dto.templateKey ?? 'atlas').key;
    let document = dto.document as CvDocument | undefined;

    if (!document) {
      const built = await this.builder.buildFromProfile(userId, templateKey, {
        targetRole: dto.targetRole ?? undefined,
      });
      document = built.document;
    }

    const cv = this.cvs.create({
      userId,
      title: dto.title?.trim() || document.header.fullName || 'Mon CV',
      templateKey,
      status: CvStatus.DRAFT,
      document,
      style: dto.style ?? null,
      targetRole: dto.targetRole ?? null,
      aiAssisted: dto.aiAssisted ?? false,
    });
    return this.cvs.save(cv);
  }

  async update(userId: string, id: string, dto: UpdateCvDto): Promise<Cv> {
    const cv = await this.get(userId, id);
    const update: Partial<Cv> = {};

    if (dto.title !== undefined) update.title = dto.title.trim().slice(0, 160) || cv.title;
    if (dto.templateKey !== undefined) update.templateKey = resolveTemplate(dto.templateKey).key;
    if (dto.status !== undefined) update.status = dto.status;
    if (dto.style !== undefined) update.style = dto.style;
    if (dto.targetRole !== undefined) update.targetRole = dto.targetRole;
    if (dto.document !== undefined) {
      update.document = dto.document as CvDocument;
      update.version = cv.version + 1;
    }

    await this.cvs.update(cv.id, update);
    return this.get(userId, id);
  }

  async duplicate(userId: string, id: string): Promise<Cv> {
    const cv = await this.get(userId, id);
    const copy = this.cvs.create({
      userId,
      title: `${cv.title} (copie)`.slice(0, 160),
      templateKey: cv.templateKey,
      status: CvStatus.DRAFT,
      document: cv.document,
      style: cv.style,
      targetRole: cv.targetRole,
      aiAssisted: cv.aiAssisted,
    });
    return this.cvs.save(copy);
  }

  /** Rebuild the document from the current profile, preserving style/template. */
  async refreshFromProfile(userId: string, id: string): Promise<Cv> {
    const cv = await this.get(userId, id);
    const built = await this.builder.buildFromProfile(userId, cv.templateKey, {
      targetRole: cv.targetRole ?? undefined,
    });
    await this.cvs.update(cv.id, {
      document: built.document,
      version: cv.version + 1,
    });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const cv = await this.get(userId, id);
    await this.cvs.softDelete(cv.id);
  }

  async restore(userId: string, id: string): Promise<void> {
    const cv = await this.cvs.findOne({ where: { id }, withDeleted: true });
    if (!cv || cv.userId !== userId) throw Errors.notFound('CV');
    await this.cvs.restore(cv.id);
  }

  /** Real PDF generation — same document model as the on-screen preview. */
  async exportPdf(
    userId: string,
    id: string,
    ctx: { ip?: string; userAgent?: string },
  ): Promise<{ buffer: Buffer; filename: string; cv: Cv }> {
    const cv = await this.get(userId, id);
    const template = TEMPLATE_DEFINITIONS.find((t) => t.key === cv.templateKey);

    const buffer = await renderCvPdf({
      document: cv.document,
      templateKey: cv.templateKey,
      style: cv.style,
    });

    await this.cvs.update(cv.id, {
      downloadCount: cv.downloadCount + 1,
      lastExportedAt: new Date(),
    });

    await this.audit.log({
      actorId: userId,
      action: 'cv.export',
      entity: 'cv',
      entityId: cv.id,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    const slug = (cv.document.header.fullName || 'cv')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();

    void template;
    return { buffer, filename: `${slug || 'cv'}-${cv.id.slice(0, 6)}.pdf`, cv };
  }

  async updateTemplate(
    id: string,
    patch: { isActive?: boolean; isPremium?: boolean; sortOrder?: number },
  ) {
    const template = await this.templates.findOne({ where: { id } });
    if (!template) throw Errors.notFound('Modèle de CV');
    await this.templates.update(id, {
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.isPremium !== undefined ? { isPremium: patch.isPremium } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    });
    return this.templates.findOneOrFail({ where: { id } });
  }

  async stats(userId: string) {
    const [total, drafts, finals, downloads] = await Promise.all([
      this.cvs.count({ where: { userId } }),
      this.cvs.count({ where: { userId, status: CvStatus.DRAFT } }),
      this.cvs.count({ where: { userId, status: CvStatus.FINAL } }),
      this.cvs
        .createQueryBuilder('cv')
        .select('COALESCE(SUM(cv.downloadCount), 0)', 'sum')
        .where('cv.userId = :userId', { userId })
        .getRawOne<{ sum: string }>()
        .then((row) => Number(row?.sum ?? 0)),
    ]);
    const templatesUsed = await this.cvs
      .createQueryBuilder('cv')
      .select('cv.templateKey', 'key')
      .addSelect('COUNT(*)', 'count')
      .where('cv.userId = :userId', { userId })
      .groupBy('cv.templateKey')
      .getRawMany<{ key: string; count: string }>();
    return { total, drafts, finals, downloads, templatesUsed };
  }
}
