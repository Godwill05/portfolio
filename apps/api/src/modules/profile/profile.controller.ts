import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser, Public, OptionalAuth } from '../../common/decorators';
import type { AuthenticatedUser } from '../auth/types';
import { ProfileService } from './profile.service';
import {
  EducationDto,
  ExperienceDto,
  LanguageDto,
  ProjectDto,
  ReorderDto,
  SkillDto,
  UpdateProfileDto,
} from './dto/profile.dto';

@ApiTags('Profile')
@ApiBearerAuth()
@Controller('me/profile')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Profil professionnel complet (compétences, projets, expériences…)' })
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.profiles.getFull(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Mettre à jour le profil professionnel' })
  async update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    const profile = await this.profiles.update(user.id, dto);
    return { profile };
  }

  // ── Skills ──
  @Post('skills')
  createSkill(@CurrentUser() user: AuthenticatedUser, @Body() dto: SkillDto) {
    return this.profiles.createSkill(user.id, dto);
  }

  @Patch('skills/:id')
  updateSkill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SkillDto,
  ) {
    return this.profiles.updateSkill(user.id, id, dto);
  }

  @Delete('skills/:id')
  async deleteSkill(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.profiles.deleteSkill(user.id, id);
    return { success: true };
  }

  @Put('skills/order')
  async reorderSkills(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReorderDto) {
    await this.profiles.reorderSkills(user.id, dto.ids);
    return { success: true };
  }

  // ── Projects ──
  @Post('projects')
  createProject(@CurrentUser() user: AuthenticatedUser, @Body() dto: ProjectDto) {
    return this.profiles.createProject(user.id, dto);
  }

  @Patch('projects/:id')
  updateProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProjectDto,
  ) {
    return this.profiles.updateProject(user.id, id, dto);
  }

  @Delete('projects/:id')
  async deleteProject(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.profiles.deleteProject(user.id, id);
    return { success: true };
  }

  @Put('projects/order')
  async reorderProjects(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReorderDto) {
    await this.profiles.reorderProjects(user.id, dto.ids);
    return { success: true };
  }

  // ── Experiences ──
  @Post('experiences')
  createExperience(@CurrentUser() user: AuthenticatedUser, @Body() dto: ExperienceDto) {
    return this.profiles.createExperience(user.id, dto);
  }

  @Patch('experiences/:id')
  updateExperience(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExperienceDto,
  ) {
    return this.profiles.updateExperience(user.id, id, dto);
  }

  @Delete('experiences/:id')
  async deleteExperience(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.profiles.deleteExperience(user.id, id);
    return { success: true };
  }

  @Put('experiences/order')
  async reorderExperiences(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReorderDto) {
    await this.profiles.reorderExperiences(user.id, dto.ids);
    return { success: true };
  }

  // ── Education ──
  @Post('educations')
  createEducation(@CurrentUser() user: AuthenticatedUser, @Body() dto: EducationDto) {
    return this.profiles.createEducation(user.id, dto);
  }

  @Patch('educations/:id')
  updateEducation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EducationDto,
  ) {
    return this.profiles.updateEducation(user.id, id, dto);
  }

  @Delete('educations/:id')
  async deleteEducation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.profiles.deleteEducation(user.id, id);
    return { success: true };
  }

  // ── Languages ──
  @Post('languages')
  createLanguage(@CurrentUser() user: AuthenticatedUser, @Body() dto: LanguageDto) {
    return this.profiles.createLanguage(user.id, dto);
  }

  @Patch('languages/:id')
  updateLanguage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LanguageDto,
  ) {
    return this.profiles.updateLanguage(user.id, id, dto);
  }

  @Delete('languages/:id')
  async deleteLanguage(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.profiles.deleteLanguage(user.id, id);
    return { success: true };
  }
}

@ApiTags('Portfolio')
@Controller('portfolio')
export class PublicPortfolioController {
  constructor(private readonly profiles: ProfileService) {}

  @Public()
  @Throttle({ default: { limit: 90, ttl: 60_000 } })
  @Get(':slug')
  @ApiOperation({ summary: 'Portfolio public par slug' })
  async get(
    @Param('slug') slug: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.profiles.getPublic(slug);
    // Short cache: portfolio content is public and rarely changes minute to minute.
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.setHeader('X-Robots-Tag', data.indexable ? 'index, follow' : 'noindex, nofollow');
    void this.profiles.trackView(slug).catch(() => undefined);
    return data;
  }

  @Public()
  @Get('slugs/list')
  @ApiOperation({ summary: 'Liste des slugs publics (sitemap)' })
  async slugs(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=600');
    return { slugs: await this.profiles.listPublicSlugs() };
  }
}
