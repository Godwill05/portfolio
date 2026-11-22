import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CvSectionType } from '../../common/constants/domain';
import {
  Education,
  Experience,
  Language_,
  ProfessionalProfile,
  Project,
  Skill,
} from '../../database/entities/profile.entity';
import type { CvDocument, CvSection, CvSectionItem } from '../../database/entities/cv.entity';
import { resolveTemplate } from './template-registry';

const MONTHS_FR = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

export function formatPeriod(start?: string | null, end?: string | null, current?: boolean): string {
  const fmt = (value?: string | null): string => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${MONTHS_FR[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  };
  const from = fmt(start);
  const to = current ? 'Aujourd’hui' : fmt(end);
  if (!from && !to) return '';
  if (!from) return to;
  if (!to) return `${from} — aujourd’hui`;
  return `${from} — ${to}`;
}

/**
 * Builds a CV document **only** from data the user actually recorded.
 * Nothing is invented: empty sources produce empty sections, not placeholders.
 */
@Injectable()
export class CvBuilderService {
  constructor(
    @InjectRepository(ProfessionalProfile) private readonly profiles: Repository<ProfessionalProfile>,
    @InjectRepository(Skill) private readonly skills: Repository<Skill>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Experience) private readonly experiences: Repository<Experience>,
    @InjectRepository(Education) private readonly educations: Repository<Education>,
    @InjectRepository(Language_) private readonly languages: Repository<Language_>,
  ) {}

  async buildFromProfile(
    userId: string,
    templateKey: string,
    options: { targetRole?: string; summaryOverride?: string } = {},
  ): Promise<{ document: CvDocument; templateKey: string }> {
    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) throw new Error('Profil introuvable');

    const [skills, projects, experiences, educations, languages] = await Promise.all([
      this.skills.find({ where: { profileId: profile.id, visible: true }, order: { featured: 'DESC', sortOrder: 'ASC' } }),
      this.projects.find({ where: { profileId: profile.id, visible: true }, order: { isHighlighted: 'DESC', sortOrder: 'ASC' } }),
      this.experiences.find({ where: { profileId: profile.id, visible: true }, order: { sortOrder: 'ASC', startDate: 'DESC' } }),
      this.educations.find({ where: { profileId: profile.id, visible: true }, order: { sortOrder: 'ASC', endDate: 'DESC' } }),
      this.languages.find({ where: { profileId: profile.id }, order: { sortOrder: 'ASC' } }),
    ]);

    const template = resolveTemplate(templateKey);

    const header: CvDocument['header'] = {
      fullName: profile.displayName,
      headline: options.targetRole || profile.professionalTitle || profile.headline || undefined,
      email: profile.publicEmail ?? undefined,
      phone: profile.phone ?? undefined,
      location: profile.location ?? undefined,
      website: profile.websiteUrl ?? undefined,
      linkedin: profile.linkedinUrl ?? undefined,
      github: profile.githubUrl ?? undefined,
      extraLinks: profile.extraLinks ?? undefined,
    };

    const sections: CvSection[] = [];

    const summaryText = options.summaryOverride ?? profile.summary;
    if (summaryText) {
      sections.push({
        id: 'summary',
        type: CvSectionType.SUMMARY,
        title: 'Profil',
        visible: true,
        items: [],
        body: summaryText,
      });
    }

    if (experiences.length) {
      sections.push({
        id: 'experience',
        type: CvSectionType.EXPERIENCE,
        title: 'Expérience professionnelle',
        visible: true,
        items: experiences.map<CvSectionItem>((exp) => ({
          id: exp.id,
          title: exp.role,
          subtitle: exp.company,
          meta: exp.location ?? undefined,
          startDate: formatPeriod(exp.startDate, exp.endDate, exp.isCurrent),
          description: exp.description ?? undefined,
          bullets: exp.achievements?.filter(Boolean) ?? undefined,
          tags: exp.technologies?.filter(Boolean) ?? undefined,
          url: exp.companyUrl ?? undefined,
        })),
      });
    }

    if (educations.length) {
      const degrees = educations.filter((e) => e.kind === 'degree' || e.kind === 'training');
      const certifications = educations.filter((e) => e.kind === 'certification');
      const academic = educations.filter((e) => e.kind === 'academic_project');

      if (degrees.length || academic.length) {
        sections.push({
          id: 'education',
          type: CvSectionType.EDUCATION,
          title: 'Formation',
          visible: true,
          items: [...degrees, ...academic].map<CvSectionItem>((edu) => ({
            id: edu.id,
            title: edu.degree || edu.title || edu.fieldOfStudy || 'Formation',
            subtitle: edu.institution,
            meta: [edu.grade, edu.fieldOfStudy].filter(Boolean).join(' · ') || undefined,
            startDate: formatPeriod(edu.startDate, edu.endDate, edu.isCurrent),
            description: edu.description ?? undefined,
            url: edu.credentialUrl ?? undefined,
          })),
        });
      }
      if (certifications.length) {
        sections.push({
          id: 'certifications',
          type: CvSectionType.CERTIFICATIONS,
          title: 'Certifications',
          visible: true,
          items: certifications.map<CvSectionItem>((cert) => ({
            id: cert.id,
            title: cert.title || cert.degree || 'Certification',
            subtitle: cert.institution,
            startDate: formatPeriod(cert.startDate, cert.endDate, cert.isCurrent),
            url: cert.credentialUrl ?? undefined,
          })),
        });
      }
    }

    if (skills.length) {
      // Group by category so skill-heavy templates can render a grid.
      sections.push({
        id: 'skills',
        type: CvSectionType.SKILLS,
        title: 'Compétences',
        visible: true,
        items: skills.map<CvSectionItem>((skill) => ({
          id: skill.id,
          title: skill.name,
          subtitle: skill.category,
          level: skill.rating,
          description: skill.description ?? undefined,
        })),
      });
    }

    if (projects.length) {
      sections.push({
        id: 'projects',
        type: CvSectionType.PROJECTS,
        title: 'Projets',
        visible: true,
        items: projects.slice(0, 6).map<CvSectionItem>((project) => ({
          id: project.id,
          title: project.title,
          subtitle: project.subtitle ?? project.category ?? undefined,
          startDate: formatPeriod(project.startDate, project.endDate, false),
          description: project.description ?? undefined,
          bullets: project.outcome ? [project.outcome] : undefined,
          tags: project.technologies?.filter(Boolean) ?? undefined,
          url: project.demoUrl ?? project.repositoryUrl ?? undefined,
        })),
      });
    }

    if (languages.length) {
      sections.push({
        id: 'languages',
        type: CvSectionType.LANGUAGES,
        title: 'Langues',
        visible: true,
        items: languages.map<CvSectionItem>((lang) => ({
          id: lang.id,
          title: lang.name,
          subtitle: lang.proficiency,
        })),
      });
    }

    // Apply the template's preferred section order.
    const order = template.defaults.sectionOrder;
    sections.sort((a, b) => {
      const indexA = order.indexOf(a.type);
      const indexB = order.indexOf(b.type);
      return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
    });

    return { document: { header, sections }, templateKey: template.key };
  }
}
