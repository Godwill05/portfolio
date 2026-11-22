/**
 * Template registry: the single source of truth for CV layouts.
 *
 * Both the Angular preview and the server PDF renderer consume the same
 * layout descriptor so a user's export always matches their screen.
 * Layout families are HTML/CSS driven (see `cv-renderer.ts`).
 */

import { CvSectionType } from '../../common/constants/domain';

export interface TemplateStyleDefaults {
  accentColor: string;
  fontFamily: string;
  fontScale: number;
  headingCase: 'none' | 'upper';
  showPhoto: boolean;
  columns: 1 | 2;
  dividerStyle: 'line' | 'none' | 'dotted';
  sectionOrder: CvSectionType[];
}

export interface TemplateDefinition {
  key: string;
  layout: string;
  pageMargin: number;
  /** Google-font-free stack shipped with the app for offline PDF fidelity. */
  fontStack: Record<'body' | 'heading' | 'mono', string>;
  defaults: TemplateStyleDefaults;
}

const INTER = '"Inter Variable", "Inter", "Helvetica Neue", Arial, sans-serif';
const FRAUNCES = '"Fraunces Variable", "Fraunces", Georgia, "Times New Roman", serif';
const MONO = '"JetBrains Mono Variable", "JetBrains Mono", "SFMono-Regular", Consolas, monospace';

const CLASSIC_ORDER: CvSectionType[] = [
  CvSectionType.SUMMARY,
  CvSectionType.EXPERIENCE,
  CvSectionType.EDUCATION,
  CvSectionType.SKILLS,
  CvSectionType.PROJECTS,
  CvSectionType.CERTIFICATIONS,
  CvSectionType.LANGUAGES,
];

const TECH_ORDER: CvSectionType[] = [
  CvSectionType.SUMMARY,
  CvSectionType.SKILLS,
  CvSectionType.EXPERIENCE,
  CvSectionType.PROJECTS,
  CvSectionType.EDUCATION,
  CvSectionType.CERTIFICATIONS,
  CvSectionType.LANGUAGES,
];

const ACADEMIC_ORDER: CvSectionType[] = [
  CvSectionType.SUMMARY,
  CvSectionType.EDUCATION,
  CvSectionType.EXPERIENCE,
  CvSectionType.CERTIFICATIONS,
  CvSectionType.SKILLS,
  CvSectionType.PROJECTS,
  CvSectionType.LANGUAGES,
];

const NARRATIVE_ORDER: CvSectionType[] = [
  CvSectionType.SUMMARY,
  CvSectionType.EXPERIENCE,
  CvSectionType.PROJECTS,
  CvSectionType.EDUCATION,
  CvSectionType.SKILLS,
  CvSectionType.CERTIFICATIONS,
  CvSectionType.LANGUAGES,
];

const SKILLS_ORDER: CvSectionType[] = [
  CvSectionType.SUMMARY,
  CvSectionType.SKILLS,
  CvSectionType.PROJECTS,
  CvSectionType.EXPERIENCE,
  CvSectionType.EDUCATION,
  CvSectionType.CERTIFICATIONS,
  CvSectionType.LANGUAGES,
];

const JUNIOR_ORDER: CvSectionType[] = [
  CvSectionType.SUMMARY,
  CvSectionType.EDUCATION,
  CvSectionType.PROJECTS,
  CvSectionType.SKILLS,
  CvSectionType.EXPERIENCE,
  CvSectionType.CERTIFICATIONS,
  CvSectionType.LANGUAGES,
];

export const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    key: 'meridian',
    layout: 'classic-single',
    pageMargin: 48,
    fontStack: { body: INTER, heading: INTER, mono: MONO },
    defaults: { accentColor: '#1f3341', fontFamily: 'Inter', fontScale: 1, headingCase: 'upper', showPhoto: false, columns: 1, dividerStyle: 'line', sectionOrder: CLASSIC_ORDER },
  },
  {
    key: 'atlas',
    layout: 'modern-header',
    pageMargin: 44,
    fontStack: { body: INTER, heading: INTER, mono: MONO },
    defaults: { accentColor: '#035c80', fontFamily: 'Inter', fontScale: 1.02, headingCase: 'upper', showPhoto: false, columns: 1, dividerStyle: 'none', sectionOrder: CLASSIC_ORDER },
  },
  {
    key: 'carthage',
    layout: 'minimal',
    pageMargin: 56,
    fontStack: { body: INTER, heading: INTER, mono: MONO },
    defaults: { accentColor: '#111827', fontFamily: 'Inter', fontScale: 0.98, headingCase: 'none', showPhoto: false, columns: 1, dividerStyle: 'dotted', sectionOrder: CLASSIC_ORDER },
  },
  {
    key: 'colbert',
    layout: 'corporate-numbered',
    pageMargin: 48,
    fontStack: { body: INTER, heading: FRAUNCES, mono: MONO },
    defaults: { accentColor: '#12263f', fontFamily: 'Fraunces', fontScale: 1, headingCase: 'upper', showPhoto: false, columns: 1, dividerStyle: 'line', sectionOrder: CLASSIC_ORDER },
  },
  {
    key: 'vector',
    layout: 'tech-sidebar',
    pageMargin: 36,
    fontStack: { body: INTER, heading: MONO, mono: MONO },
    defaults: { accentColor: '#0b7285', fontFamily: 'JetBrains Mono', fontScale: 1, headingCase: 'none', showPhoto: false, columns: 2, dividerStyle: 'none', sectionOrder: TECH_ORDER },
  },
  {
    key: 'palette',
    layout: 'creative-band',
    pageMargin: 0,
    fontStack: { body: INTER, heading: FRAUNCES, mono: MONO },
    defaults: { accentColor: '#b5442c', fontFamily: 'Fraunces', fontScale: 1, headingCase: 'none', showPhoto: true, columns: 2, dividerStyle: 'none', sectionOrder: CLASSIC_ORDER },
  },
  {
    key: 'sorbonne',
    layout: 'academic-serif',
    pageMargin: 54,
    fontStack: { body: FRAUNCES, heading: FRAUNCES, mono: MONO },
    defaults: { accentColor: '#3b3b58', fontFamily: 'Fraunces', fontScale: 1, headingCase: 'none', showPhoto: false, columns: 1, dividerStyle: 'line', sectionOrder: ACADEMIC_ORDER },
  },
  {
    key: 'narrative',
    layout: 'timeline',
    pageMargin: 46,
    fontStack: { body: INTER, heading: INTER, mono: MONO },
    defaults: { accentColor: '#2d6a4f', fontFamily: 'Inter', fontScale: 1, headingCase: 'none', showPhoto: false, columns: 1, dividerStyle: 'none', sectionOrder: NARRATIVE_ORDER },
  },
  {
    key: 'matrix',
    layout: 'skills-grid',
    pageMargin: 44,
    fontStack: { body: INTER, heading: INTER, mono: MONO },
    defaults: { accentColor: '#5b3fa8', fontFamily: 'Inter', fontScale: 1, headingCase: 'upper', showPhoto: false, columns: 2, dividerStyle: 'none', sectionOrder: SKILLS_ORDER },
  },
  {
    key: 'sprout',
    layout: 'junior',
    pageMargin: 46,
    fontStack: { body: INTER, heading: INTER, mono: MONO },
    defaults: { accentColor: '#c8811a', fontFamily: 'Inter', fontScale: 1, headingCase: 'none', showPhoto: false, columns: 1, dividerStyle: 'dotted', sectionOrder: JUNIOR_ORDER },
  },
  {
    key: 'summit',
    layout: 'executive',
    pageMargin: 50,
    fontStack: { body: INTER, heading: FRAUNCES, mono: MONO },
    defaults: { accentColor: '#1c3d5a', fontFamily: 'Fraunces', fontScale: 1.03, headingCase: 'upper', showPhoto: false, columns: 1, dividerStyle: 'line', sectionOrder: CLASSIC_ORDER },
  },
  {
    key: 'orient',
    layout: 'international',
    pageMargin: 48,
    fontStack: { body: INTER, heading: INTER, mono: MONO },
    defaults: { accentColor: '#0f766e', fontFamily: 'Inter', fontScale: 0.99, headingCase: 'upper', showPhoto: false, columns: 1, dividerStyle: 'line', sectionOrder: CLASSIC_ORDER },
  },
];

export const TEMPLATE_BY_KEY = new Map(TEMPLATE_DEFINITIONS.map((t) => [t.key, t]));

export function resolveTemplate(key: string): TemplateDefinition {
  return TEMPLATE_BY_KEY.get(key) ?? TEMPLATE_BY_KEY.get('atlas')!;
}
