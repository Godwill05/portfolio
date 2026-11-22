import type { DataSource } from 'typeorm';
import { CvSectionType, CvTemplateCategory } from '../../common/constants/domain';
import { CvTemplate } from '../entities/cv.entity';

interface TemplateSeed {
  key: string;
  name: string;
  description: string;
  category: CvTemplateCategory;
  layout: string;
  atsFriendly: boolean;
  supportsSidebar: boolean;
  isPremium: boolean;
  sortOrder: number;
  defaults: CvTemplate['defaults'];
}

const BASE_ORDER: CvSectionType[] = [
  CvSectionType.SUMMARY,
  CvSectionType.EXPERIENCE,
  CvSectionType.EDUCATION,
  CvSectionType.SKILLS,
  CvSectionType.PROJECTS,
  CvSectionType.CERTIFICATIONS,
  CvSectionType.LANGUAGES,
];

const t = (
  accent: string,
  fontFamily: string,
  overrides: Partial<CvTemplate['defaults']> = {},
): CvTemplate['defaults'] => ({
  accentColor: accent,
  fontFamily,
  fontScale: 1,
  headingCase: 'upper',
  showPhoto: false,
  columns: 1,
  dividerStyle: 'line',
  sectionOrder: BASE_ORDER,
  ...overrides,
});

/**
 * Twelve genuinely distinct CV templates.
 * Each `layout` maps to a dedicated HTML/CSS renderer shared by the Angular
 * preview and the PDF engine, so what users see is what they export.
 */
export const CV_TEMPLATES: TemplateSeed[] = [
  {
    key: 'meridian',
    name: 'Méridien',
    description:
      'Le classique intemporel : une colonne, hiérarchie claire, lecture linéaire. Le choix sûr pour les secteurs traditionnels.',
    category: CvTemplateCategory.CLASSIC,
    layout: 'classic-single',
    atsFriendly: true,
    supportsSidebar: false,
    isPremium: false,
    sortOrder: 1,
    defaults: t('#1f3341', 'Inter Variable', { headingCase: 'upper', dividerStyle: 'line' }),
  },
  {
    key: 'atlas',
    name: 'Atlas',
    description:
      'Moderne et aéré : bandeau d’en-tête coloré, titres en capitales espacées, blocs bien séparés.',
    category: CvTemplateCategory.MODERN,
    layout: 'modern-header',
    atsFriendly: true,
    supportsSidebar: false,
    isPremium: false,
    sortOrder: 2,
    defaults: t('#035c80', 'Inter Variable', { dividerStyle: 'none', fontScale: 1.02 }),
  },
  {
    key: 'carthage',
    name: 'Carthage',
    description:
      'Minimalisme radical : beaucoup de blanc, aucune fioriture, typographie finement calibrée.',
    category: CvTemplateCategory.MINIMAL,
    layout: 'minimal',
    atsFriendly: true,
    supportsSidebar: false,
    isPremium: false,
    sortOrder: 3,
    defaults: t('#111827', 'Inter Variable', {
      headingCase: 'none',
      dividerStyle: 'dotted',
      fontScale: 0.98,
    }),
  },
  {
    key: 'colbert',
    name: 'Colbert',
    description:
      'Codes du corporate : en-tête sobre, accents bleu nuit, sections numérotées. Idéal banque, conseil, audit.',
    category: CvTemplateCategory.CORPORATE,
    layout: 'corporate-numbered',
    atsFriendly: true,
    supportsSidebar: false,
    isPremium: false,
    sortOrder: 4,
    defaults: t('#12263f', 'Fraunces Variable', { headingCase: 'upper', dividerStyle: 'line' }),
  },
  {
    key: 'vector',
    name: 'Vector',
    description:
      'Pensé pour les profils techniques : barre latérale des compétences, stack mise en avant, projet en premier plan.',
    category: CvTemplateCategory.TECH,
    layout: 'tech-sidebar',
    atsFriendly: true,
    supportsSidebar: true,
    isPremium: false,
    sortOrder: 5,
    defaults: t('#0b7285', 'JetBrains Mono Variable', {
      columns: 2,
      headingCase: 'none',
      dividerStyle: 'none',
      sectionOrder: [
        CvSectionType.SUMMARY,
        CvSectionType.SKILLS,
        CvSectionType.EXPERIENCE,
        CvSectionType.PROJECTS,
        CvSectionType.EDUCATION,
        CvSectionType.CERTIFICATIONS,
        CvSectionType.LANGUAGES,
      ],
    }),
  },
  {
    key: 'palette',
    name: 'Palette',
    description:
      'CV créatif : large bandeau latéral coloré, portrait, composition éditoriale. Pour design, marketing, communication.',
    category: CvTemplateCategory.CREATIVE,
    layout: 'creative-band',
    atsFriendly: false,
    supportsSidebar: true,
    isPremium: true,
    sortOrder: 6,
    defaults: t('#b5442c', 'Fraunces Variable', {
      columns: 2,
      showPhoto: true,
      headingCase: 'none',
      dividerStyle: 'none',
    }),
  },
  {
    key: 'sorbonne',
    name: 'Sorbonne',
    description:
      'Académique : typographie sérif, publications et formations en vedette, structure de CV scientifique.',
    category: CvTemplateCategory.ACADEMIC,
    layout: 'academic-serif',
    atsFriendly: true,
    supportsSidebar: false,
    isPremium: false,
    sortOrder: 7,
    defaults: t('#3b3b58', 'Fraunces Variable', {
      headingCase: 'none',
      dividerStyle: 'line',
      sectionOrder: [
        CvSectionType.SUMMARY,
        CvSectionType.EDUCATION,
        CvSectionType.EXPERIENCE,
        CvSectionType.CERTIFICATIONS,
        CvSectionType.SKILLS,
        CvSectionType.PROJECTS,
        CvSectionType.LANGUAGES,
      ],
    }),
  },
  {
    key: 'narrative',
    name: 'Narrative',
    description:
      'Orienté parcours : chronologie continue, dates en marge, récit professionnel fluide.',
    category: CvTemplateCategory.EXPERIENCE_FIRST,
    layout: 'timeline',
    atsFriendly: true,
    supportsSidebar: false,
    isPremium: false,
    sortOrder: 8,
    defaults: t('#2d6a4f', 'Inter Variable', {
      headingCase: 'none',
      dividerStyle: 'none',
      sectionOrder: [
        CvSectionType.SUMMARY,
        CvSectionType.EXPERIENCE,
        CvSectionType.PROJECTS,
        CvSectionType.EDUCATION,
        CvSectionType.SKILLS,
        CvSectionType.CERTIFICATIONS,
        CvSectionType.LANGUAGES,
      ],
    }),
  },
  {
    key: 'matrix',
    name: 'Matrix',
    description:
      'Orienté compétences : grille de compétences en tête, expériences condensées en preuves.',
    category: CvTemplateCategory.SKILLS_FIRST,
    layout: 'skills-grid',
    atsFriendly: true,
    supportsSidebar: true,
    isPremium: false,
    sortOrder: 9,
    defaults: t('#5b3fa8', 'Inter Variable', {
      columns: 2,
      headingCase: 'upper',
      dividerStyle: 'none',
      sectionOrder: [
        CvSectionType.SUMMARY,
        CvSectionType.SKILLS,
        CvSectionType.PROJECTS,
        CvSectionType.EXPERIENCE,
        CvSectionType.EDUCATION,
        CvSectionType.CERTIFICATIONS,
        CvSectionType.LANGUAGES,
      ],
    }),
  },
  {
    key: 'sprout',
    name: 'Sprout',
    description:
      'Pour les juniors et jeunes diplômés : formation en avant, projets académiques valorisés, mise en page encourageante.',
    category: CvTemplateCategory.JUNIOR,
    layout: 'junior',
    atsFriendly: true,
    supportsSidebar: false,
    isPremium: false,
    sortOrder: 10,
    defaults: t('#c8811a', 'Inter Variable', {
      headingCase: 'none',
      dividerStyle: 'dotted',
      sectionOrder: [
        CvSectionType.SUMMARY,
        CvSectionType.EDUCATION,
        CvSectionType.PROJECTS,
        CvSectionType.SKILLS,
        CvSectionType.EXPERIENCE,
        CvSectionType.CERTIFICATIONS,
        CvSectionType.LANGUAGES,
      ],
    }),
  },
  {
    key: 'summit',
    name: 'Summit',
    description:
      'Pour profils seniors et direction : synthèse exécutive, résultats chiffrés, grande élégance sobre.',
    category: CvTemplateCategory.SENIOR,
    layout: 'executive',
    atsFriendly: true,
    supportsSidebar: false,
    isPremium: true,
    sortOrder: 11,
    defaults: t('#1c3d5a', 'Fraunces Variable', {
      headingCase: 'upper',
      dividerStyle: 'line',
      fontScale: 1.03,
    }),
  },
  {
    key: 'orient',
    name: 'Orient',
    description:
      'Format international sobre et bilingue-ready : pas de photo, sections standardisées, lisible par tous les ATS.',
    category: CvTemplateCategory.INTERNATIONAL,
    layout: 'international',
    atsFriendly: true,
    supportsSidebar: false,
    isPremium: false,
    sortOrder: 12,
    defaults: t('#0f766e', 'Inter Variable', {
      headingCase: 'upper',
      dividerStyle: 'line',
      fontScale: 0.99,
    }),
  },
];

export async function seedCvTemplates(ds: DataSource): Promise<number> {
  const repo = ds.getRepository(CvTemplate);
  let touched = 0;
  for (const template of CV_TEMPLATES) {
    const existing = await repo.findOne({ where: { key: template.key } });
    if (existing) {
      // Keep content in sync with code without losing admin toggles.
      await repo.update(existing.id, {
        name: template.name,
        description: template.description,
        category: template.category,
        layout: template.layout,
        atsFriendly: template.atsFriendly,
        supportsSidebar: template.supportsSidebar,
        defaults: template.defaults,
        sortOrder: template.sortOrder,
      });
    } else {
      await repo.insert({ ...template, isActive: true });
    }
    touched += 1;
  }
  return touched;
}
