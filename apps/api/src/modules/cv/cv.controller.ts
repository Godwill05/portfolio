import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, RequirePermissions, RequestContext } from '../../common/decorators';
import { Permission } from '../../common/constants/domain';
import type { AuthenticatedUser } from '../auth/types';
import { CvService } from './cv.service';
import { CreateCvDto, CvListQueryDto, UpdateCvDto } from './dto/cv.dto';

@ApiTags('CV')
@ApiBearerAuth()
@Controller('cvs')
export class CvController {
  constructor(private readonly cvs: CvService) {}

  @Get('templates')
  @ApiOperation({ summary: 'Bibliothèque des modèles de CV disponibles' })
  templates() {
    return this.cvs.listTemplates();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Statistiques de la bibliothèque personnelle' })
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.cvs.stats(user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Lister mes CV (pagination, recherche, filtre)' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: CvListQueryDto) {
    return this.cvs.list(user.id, {
      page: query.page ?? 1,
      limit: query.limit ?? 12,
      search: query.search,
      status: query.status,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Créer un CV (pré-rempli depuis le profil)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCvDto) {
    return this.cvs.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail complet d’un CV' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cvs.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Enregistrer les modifications du CV' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCvDto,
  ) {
    return this.cvs.update(user.id, id, dto);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Dupliquer un CV' })
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cvs.duplicate(user.id, id);
  }

  @Post(':id/refresh')
  @ApiOperation({ summary: 'Régénérer le contenu depuis le profil actuel' })
  refresh(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cvs.refreshFromProfile(user.id, id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restaurer un CV supprimé' })
  async restore(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.cvs.restore(user.id, id);
    return { success: true };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un CV (soft delete)' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.cvs.remove(user.id, id);
    return { success: true };
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Exporter le CV en PDF (rendu serveur)' })
  async pdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @RequestContext() ctx: { ip: string; userAgent: string },
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.cvs.exportPdf(user.id, id, ctx);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'no-store');
    res.end(buffer);
  }

  @Get(':id/preview.pdf')
  @Header('Content-Type', 'application/pdf')
  @ApiOperation({ summary: 'Aperçu PDF inline' })
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @RequestContext() ctx: { ip: string; userAgent: string },
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.cvs.exportPdf(user.id, id, ctx);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }

  // ── Admin: template management ──

  @Patch('admin/templates/:id')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  @ApiOperation({ summary: 'Activer / désactiver un modèle de CV (admin)' })
  async toggleTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { isActive?: boolean; isPremium?: boolean; sortOrder?: number },
  ) {
    return this.cvs.updateTemplate(id, body);
  }
}
