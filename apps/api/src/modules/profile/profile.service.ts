import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Education,
  Experience,
  ExperienceSkill,
  Language_,
  ProfessionalProfile,
  Project,
  ProjectSkill,
  Skill,
} from '../../database/entities/profile.entity';
import { Errors } from '../../common/utils/errors';
import { slugify } from '../../common/utils/slug.util';
import { PortfolioVisibility } from '../../common/constants/domain';
import type {
  EducationDto,
  ExperienceDto,
  LanguageDto,
  ProjectDto,
  SkillDto,
  UpdateProfileDto,
} from './dto/profile.dto';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(ProfessionalProfile) private readonly profiles: Repository<ProfessionalProfile>,
    @InjectRepository(Skill) private readonly skills: Repository<Skill>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Experience) private readonly experiences: Repository<Experience>,
    @InjectRepository(Education) private readonly educations: Repository<Education>,
    @InjectRepository(Language_) private readonly languages: Repository<Language_>,
    private readonly dataSource: DataSource,
  ) {}

  async getOrCreate(userId: string): Promise<ProfessionalProfile> {
    const profile = await this.profiles.findOne({ where: { userId } });
    if (profile) return profile;
    const created = this.profiles.create({
      userId,
      displayName: 'Mon profil',
      slug: `portfolio-${userId.slice(0, 8)}`,
    });
    return this.profiles.save(created);
  }

  /** Full aggregate used by the dashboard editor. */
  async getFull(userId: string) {
    const profile = await this.getOrCreate(userId);
    const [skills, projects, experiences, educations, languages] = await Promise.all([
      this.skills.find({ where: { profileId: profile.id }, order: { sortOrder: 'ASC', name: 'ASC' } }),
      this.projects.find({
        where: { profileId: profile.id },
        relations: { projectSkills: true },
        order: { sortOrder: 'ASC', startDate: 'DESC' },
      }),
      this.experiences.find({
        where: { profileId: profile.id },
        relations: { experienceSkills: true },
        order: { sortOrder: 'ASC', startDate: 'DESC' },
      }),
      this.educations.find({ where: { profileId: profile.id }, order: { sortOrder: 'ASC', endDate: 'DESC' } }),
      this.languages.find({ where: { profileId: profile.id }, order: { sortOrder: 'ASC' } }),
    ]);

    const completeness = this.completeness(profile, { skills, projects, experiences, educations, languages });

    return {
      profile,
      skills,
      projects: projects.map((p) => ({
        ...p,
        skillIds: p.projectSkills?.map((ps) => ps.skillId) ?? [],
        projectSkills: undefined,
      })),
      experiences: experiences.map((e) => ({
        ...e,
        skillIds: e.experienceSkills?.map((es) => es.skillId) ?? [],
        experienceSkills: undefined,
      })),
      educations,
      languages,
      completeness,
    };
  }

  /** Human-readable profile score — drives the dashboard progress widget. */
  completeness(
    profile: ProfessionalProfile,
    data: { skills: Skill[]; projects: Project[]; experiences: Experience[]; educations: Education[]; languages: Language_[] },
  ) {
    const checks = [
      { key: 'headline', label: 'Titre professionnel', done: Boolean(profile.headline || profile.professionalTitle), weight: 10 },
      { key: 'summary', label: 'Résumé professionnel', done: (profile.summary?.length ?? 0) > 80, weight: 15 },
      { key: 'location', label: 'Localisation', done: Boolean(profile.location), weight: 5 },
      { key: 'contact', label: 'Email ou téléphone public', done: Boolean(profile.publicEmail || profile.phone), weight: 5 },
      { key: 'links', label: 'Au moins un lien professionnel', done: Boolean(profile.linkedinUrl || profile.githubUrl || profile.websiteUrl), weight: 10 },
      { key: 'skills', label: '5 compétences minimum', done: data.skills.length >= 5, weight: 15 },
      { key: 'experiences', label: 'Expérience professionnelle', done: data.experiences.length > 0, weight: 15 },
      { key: 'education', label: 'Formation ou certification', done: data.educations.length > 0, weight: 10 },
      { key: 'projects', label: 'Au moins un projet', done: data.projects.length > 0, weight: 10 },
      { key: 'languages', label: 'Langues parlées', done: data.languages.length > 0, weight: 5 },
    ];
    const score = checks.filter((c) => c.done).reduce((sum, c) => sum + c.weight, 0);
    return {
      score,
      checks,
      nextSteps: checks.filter((c) => !c.done).slice(0, 3).map((c) => c.label),
    };
  }

  // ─────────────────────────── profile ───────────────────────────

  async update(userId: string, dto: UpdateProfileDto): Promise<ProfessionalProfile> {
    const profile = await this.getOrCreate(userId);
    const payload: Partial<ProfessionalProfile> = { ...dto } as Partial<ProfessionalProfile>;

    if (dto.slug) {
      const slug = slugify(dto.slug);
      if (slug.length < 3) throw Errors.validation('Le slug doit contenir au moins 3 caractères.');
      const taken = await this.profiles
        .createQueryBuilder('p')
        .where('p.slug = :slug AND p.userId != :userId', { slug, userId })
        .getOne();
      if (taken) throw Errors.conflict('Ce lien public est déjà utilisé.', 'SLUG_TAKEN');
      payload.slug = slug;
    }

    if (dto.accentColor && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(dto.accentColor)) {
      throw Errors.validation('Couleur d’accent invalide (format hexadécimal attendu).');
    }

    if (dto.visibility && dto.visibility !== PortfolioVisibility.PRIVATE && !profile.publishedAt) {
      payload.publishedAt = new Date();
    }

    await this.profiles.update(profile.id, payload);
    return this.profiles.findOneOrFail({ where: { id: profile.id } });
  }

  async listPublicSlugs(): Promise<string[]> {
    const rows = await this.profiles.find({
      where: { visibility: PortfolioVisibility.PUBLIC },
      select: { slug: true, updatedAt: true },
      order: { updatedAt: 'DESC' },
      take: 5000,
    });
    return rows.map((r) => r.slug);
  }

  /** Public portfolio payload — strictly filtered by the owner's visibility flags. */
  async getPublic(slug: string) {
    const profile = await this.profiles.findOne({ where: { slug } });
    if (!profile || profile.visibility === PortfolioVisibility.PRIVATE) {
      throw Errors.notFound('Portfolio');
    }
    const [skills, projects, experiences, educations, languages] = await Promise.all([
      profile.showSkills
        ? this.skills.find({
            where: { profileId: profile.id, visible: true },
            order: { featured: 'DESC', sortOrder: 'ASC' },
          })
        : Promise.resolve([]),
      profile.showProjects
        ? this.projects.find({
            where: { profileId: profile.id, visible: true },
            order: { isHighlighted: 'DESC', sortOrder: 'ASC' },
          })
        : Promise.resolve([]),
      profile.showExperience
        ? this.experiences.find({
            where: { profileId: profile.id, visible: true },
            order: { sortOrder: 'ASC', startDate: 'DESC' },
          })
        : Promise.resolve([]),
      profile.showEducation
        ? this.educations.find({
            where: { profileId: profile.id, visible: true },
            order: { sortOrder: 'ASC', endDate: 'DESC' },
          })
        : Promise.resolve([]),
      this.languages.find({ where: { profileId: profile.id }, order: { sortOrder: 'ASC' } }),
    ]);

    // Never leak private contact details.
    const safe = {
      ...profile,
      publicEmail: profile.showEmail ? profile.publicEmail : null,
      phone: profile.showPhone ? profile.phone : null,
      userId: undefined,
      showEmail: undefined,
      showPhone: undefined,
    };

    return {
      profile: safe,
      skills,
      projects,
      experiences,
      educations,
      languages,
      contactEnabled: profile.contactEnabled,
      cvDownloadEnabled: profile.showCvDownload,
      indexable: profile.indexable && profile.visibility === PortfolioVisibility.PUBLIC,
    };
  }

  async trackView(slug: string): Promise<void> {
    await this.profiles
      .createQueryBuilder()
      .update()
      .set({ profileViews: () => 'profileViews + 1' })
      .where('slug = :slug', { slug })
      .execute();
  }

  // ──────────────────────────── skills ───────────────────────────

  async createSkill(userId: string, dto: SkillDto): Promise<Skill> {
    const profile = await this.getOrCreate(userId);
    const name = dto.name.trim();
    const duplicate = await this.skills
      .createQueryBuilder('s')
      .where('s.profileId = :profileId AND LOWER(s.name) = LOWER(:name)', { profileId: profile.id, name })
      .getOne();
    if (duplicate) throw Errors.conflict('Vous avez déjà ajouté cette compétence.', 'SKILL_EXISTS');

    const count = await this.skills.count({ where: { profileId: profile.id } });
    return this.skills.save(
      this.skills.create({
        profileId: profile.id,
        name,
        category: dto.category?.trim() || 'Général',
        description: dto.description ?? null,
        level: dto.level,
        rating: dto.rating ?? 3,
        sortOrder: dto.sortOrder ?? count,
        featured: dto.featured ?? false,
        visible: dto.visible ?? true,
        yearsOfExperience: dto.yearsOfExperience ?? 0,
      }),
    );
  }

  async updateSkill(userId: string, skillId: string, dto: Partial<SkillDto>): Promise<Skill> {
    const skill = await this.assertSkillOwner(userId, skillId);
    await this.skills.update(skill.id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.category !== undefined ? { category: dto.category || 'Général' } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.level !== undefined ? { level: dto.level } : {}),
      ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.featured !== undefined ? { featured: dto.featured } : {}),
      ...(dto.visible !== undefined ? { visible: dto.visible } : {}),
      ...(dto.yearsOfExperience !== undefined ? { yearsOfExperience: dto.yearsOfExperience } : {}),
    });
    return this.skills.findOneOrFail({ where: { id: skill.id } });
  }

  async deleteSkill(userId: string, skillId: string): Promise<void> {
    const skill = await this.assertSkillOwner(userId, skillId);
    await this.skills.delete(skill.id);
  }

  private async assertSkillOwner(userId: string, skillId: string): Promise<Skill> {
    const skill = await this.skills.findOne({ where: { id: skillId }, relations: { profile: true } });
    // IDOR guard: the skill must belong to the caller's own profile.
    if (!skill || skill.profile?.userId !== userId) throw Errors.notFound('Compétence');
    return skill;
  }

  async reorderSkills(userId: string, ids: string[]): Promise<void> {
    const profile = await this.getOrCreate(userId);
    await this.dataSource.transaction(async (manager) => {
      for (const [index, id] of ids.entries()) {
        await manager.update(Skill, { id, profileId: profile.id }, { sortOrder: index });
      }
    });
  }

  // ─────────────────────────── projects ──────────────────────────

  async createProject(userId: string, dto: ProjectDto): Promise<Project> {
    const profile = await this.getOrCreate(userId);
    if (dto.skillIds?.length) await this.assertSkillsOwned(profile.id, dto.skillIds);

    const count = await this.projects.count({ where: { profileId: profile.id } });
    return this.dataSource.transaction(async (manager) => {
      const project = manager.create(Project, {
        profileId: profile.id,
        title: dto.title.trim(),
        subtitle: dto.subtitle ?? null,
        description: dto.description ?? null,
        problem: dto.problem ?? null,
        solution: dto.solution ?? null,
        outcome: dto.outcome ?? null,
        technologies: dto.technologies ?? null,
        imageFileIds: dto.imageFileIds ?? null,
        demoUrl: dto.demoUrl ?? null,
        repositoryUrl: dto.repositoryUrl ?? null,
        videoUrl: dto.videoUrl ?? null,
        category: dto.category ?? null,
        status: dto.status,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
        isHighlighted: dto.isHighlighted ?? false,
        visible: dto.visible ?? true,
        sortOrder: dto.sortOrder ?? count,
        metrics: dto.metrics ?? null,
      });
      await manager.save(project);
      if (dto.skillIds?.length) {
        await manager.insert(
          ProjectSkill,
          dto.skillIds.map((skillId) => ({ projectId: project.id, skillId })),
        );
      }
      return project;
    });
  }

  async updateProject(userId: string, projectId: string, dto: Partial<ProjectDto>): Promise<Project> {
    const project = await this.assertProjectOwner(userId, projectId);
    if (dto.skillIds) await this.assertSkillsOwned(project.profileId, dto.skillIds);

    await this.dataSource.transaction(async (manager) => {
      const { skillIds, ...fields } = dto;
      const update: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) update[key] = value;
      }
      if (Object.keys(update).length) await manager.update(Project, project.id, update as never);
      if (skillIds) {
        await manager.delete(ProjectSkill, { projectId: project.id });
        if (skillIds.length) {
          await manager.insert(
            ProjectSkill,
            skillIds.map((skillId) => ({ projectId: project.id, skillId })),
          );
        }
      }
    });
    return this.projects.findOneOrFail({ where: { id: project.id } });
  }

  async deleteProject(userId: string, projectId: string): Promise<void> {
    const project = await this.assertProjectOwner(userId, projectId);
    await this.projects.delete(project.id);
  }

  private async assertProjectOwner(userId: string, projectId: string): Promise<Project> {
    const project = await this.projects.findOne({ where: { id: projectId }, relations: { profile: true } });
    if (!project || project.profile?.userId !== userId) throw Errors.notFound('Projet');
    return project;
  }

  private async assertSkillsOwned(profileId: string, skillIds: string[]): Promise<void> {
    if (skillIds.length === 0) return;
    const owned = await this.skills
      .createQueryBuilder('s')
      .where('s.id IN (:...ids) AND s.profileId = :profileId', { ids: skillIds, profileId })
      .getCount();
    if (owned !== new Set(skillIds).size) {
      throw Errors.validation('Une des compétences sélectionnées n’existe pas dans votre profil.');
    }
  }

  async reorderProjects(userId: string, ids: string[]): Promise<void> {
    const profile = await this.getOrCreate(userId);
    await this.dataSource.transaction(async (manager) => {
      for (const [index, id] of ids.entries()) {
        await manager.update(Project, { id, profileId: profile.id }, { sortOrder: index });
      }
    });
  }

  // ────────────────────────── experiences ────────────────────────

  async createExperience(userId: string, dto: ExperienceDto): Promise<Experience> {
    const profile = await this.getOrCreate(userId);
    if (dto.skillIds?.length) await this.assertSkillsOwned(profile.id, dto.skillIds);
    if (dto.endDate && dto.startDate && dto.endDate < dto.startDate) {
      throw Errors.validation('La date de fin ne peut pas précéder la date de début.');
    }
    const count = await this.experiences.count({ where: { profileId: profile.id } });
    return this.dataSource.transaction(async (manager) => {
      const experience = manager.create(Experience, {
        profileId: profile.id,
        role: dto.role.trim(),
        company: dto.company.trim(),
        companyUrl: dto.companyUrl ?? null,
        location: dto.location ?? null,
        type: dto.type,
        startDate: dto.startDate,
        endDate: dto.isCurrent ? null : (dto.endDate ?? null),
        isCurrent: dto.isCurrent ?? false,
        description: dto.description ?? null,
        achievements: dto.achievements ?? null,
        technologies: dto.technologies ?? null,
        visible: dto.visible ?? true,
        sortOrder: dto.sortOrder ?? count,
      });
      await manager.save(experience);
      if (dto.skillIds?.length) {
        await manager.insert(
          ExperienceSkill,
          dto.skillIds.map((skillId) => ({ experienceId: experience.id, skillId })),
        );
      }
      return experience;
    });
  }

  async updateExperience(
    userId: string,
    experienceId: string,
    dto: Partial<ExperienceDto>,
  ): Promise<Experience> {
    const experience = await this.experiences.findOne({
      where: { id: experienceId },
      relations: { profile: true },
    });
    if (!experience || experience.profile?.userId !== userId) throw Errors.notFound('Expérience');
    if (dto.skillIds) await this.assertSkillsOwned(experience.profileId, dto.skillIds);

    await this.dataSource.transaction(async (manager) => {
      const { skillIds, ...fields } = dto;
      const update: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) update[key] = value;
      }
      if (update['isCurrent'] === true) update['endDate'] = null;
      if (Object.keys(update).length) await manager.update(Experience, experience.id, update as never);
      if (skillIds) {
        await manager.delete(ExperienceSkill, { experienceId: experience.id });
        if (skillIds.length) {
          await manager.insert(
            ExperienceSkill,
            skillIds.map((skillId) => ({ experienceId: experience.id, skillId })),
          );
        }
      }
    });
    return this.experiences.findOneOrFail({ where: { id: experience.id } });
  }

  async deleteExperience(userId: string, experienceId: string): Promise<void> {
    const experience = await this.experiences.findOne({
      where: { id: experienceId },
      relations: { profile: true },
    });
    if (!experience || experience.profile?.userId !== userId) throw Errors.notFound('Expérience');
    await this.experiences.delete(experience.id);
  }

  async reorderExperiences(userId: string, ids: string[]): Promise<void> {
    const profile = await this.getOrCreate(userId);
    await this.dataSource.transaction(async (manager) => {
      for (const [index, id] of ids.entries()) {
        await manager.update(Experience, { id, profileId: profile.id }, { sortOrder: index });
      }
    });
  }

  // ─────────────────────────── education ─────────────────────────

  async createEducation(userId: string, dto: EducationDto): Promise<Education> {
    const profile = await this.getOrCreate(userId);
    const count = await this.educations.count({ where: { profileId: profile.id } });
    return this.educations.save(
      this.educations.create({
        profileId: profile.id,
        kind: dto.kind,
        degree: dto.degree ?? null,
        title: dto.title ?? null,
        institution: dto.institution.trim(),
        location: dto.location ?? null,
        fieldOfStudy: dto.fieldOfStudy ?? null,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
        isCurrent: dto.isCurrent ?? false,
        grade: dto.grade ?? null,
        description: dto.description ?? null,
        credentialUrl: dto.credentialUrl ?? null,
        credentialId: dto.credentialId ?? null,
        visible: dto.visible ?? true,
        sortOrder: dto.sortOrder ?? count,
      }),
    );
  }

  async updateEducation(userId: string, id: string, dto: Partial<EducationDto>): Promise<Education> {
    const row = await this.educations.findOne({ where: { id }, relations: { profile: true } });
    if (!row || row.profile?.userId !== userId) throw Errors.notFound('Formation');
    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) if (value !== undefined) update[key] = value;
    if (Object.keys(update).length) await this.educations.update(row.id, update as never);
    return this.educations.findOneOrFail({ where: { id: row.id } });
  }

  async deleteEducation(userId: string, id: string): Promise<void> {
    const row = await this.educations.findOne({ where: { id }, relations: { profile: true } });
    if (!row || row.profile?.userId !== userId) throw Errors.notFound('Formation');
    await this.educations.delete(row.id);
  }

  // ─────────────────────────── languages ─────────────────────────

  async createLanguage(userId: string, dto: LanguageDto): Promise<Language_> {
    const profile = await this.getOrCreate(userId);
    const count = await this.languages.count({ where: { profileId: profile.id } });
    return this.languages.save(
      this.languages.create({
        profileId: profile.id,
        name: dto.name.trim(),
        proficiency: dto.proficiency ?? 'B2',
        sortOrder: dto.sortOrder ?? count,
      }),
    );
  }

  async updateLanguage(userId: string, id: string, dto: Partial<LanguageDto>): Promise<Language_> {
    const row = await this.languages.findOne({ where: { id }, relations: { profile: true } });
    if (!row || row.profile?.userId !== userId) throw Errors.notFound('Langue');
    await this.languages.update(row.id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.proficiency !== undefined ? { proficiency: dto.proficiency } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
    });
    return this.languages.findOneOrFail({ where: { id: row.id } });
  }

  async deleteLanguage(userId: string, id: string): Promise<void> {
    const row = await this.languages.findOne({ where: { id }, relations: { profile: true } });
    if (!row || row.profile?.userId !== userId) throw Errors.notFound('Langue');
    await this.languages.delete(row.id);
  }
}
