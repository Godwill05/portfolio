import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/platform.entity';

export interface AuditEntry {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  changes?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Sensitive actions are always journalised; failures never break the request. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.repo.insert({
        actorId: entry.actorId ?? null,
        actorEmail: entry.actorEmail ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        changes: (entry.changes ?? null) as never,
        ipAddress: entry.ipAddress?.slice(0, 45) ?? null,
        userAgent: entry.userAgent?.slice(0, 300) ?? null,
      });
    } catch (error) {
      this.logger.error(`Audit write failed for ${entry.action}: ${(error as Error).message}`);
    }
  }

  async list(params: { page: number; limit: number; action?: string; actorId?: string; search?: string }) {
    const qb = this.repo.createQueryBuilder('log').orderBy('log.createdAt', 'DESC');
    if (params.action) qb.andWhere('log.action LIKE :action', { action: `${params.action}%` });
    if (params.actorId) qb.andWhere('log.actorId = :actorId', { actorId: params.actorId });
    if (params.search) {
      qb.andWhere('(log.actorEmail LIKE :q OR log.entity LIKE :q OR log.action LIKE :q)', {
        q: `%${params.search}%`,
      });
    }
    const [items, total] = await qb
      .skip((params.page - 1) * params.limit)
      .take(params.limit)
      .getManyAndCount();
    return { items, total };
  }
}
