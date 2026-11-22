/**
 * Formatage localisé, en français, sans dépendance externe.
 * `Intl` est natif : inutile d'embarquer une bibliothèque de dates.
 */

const LOCALE = 'fr-FR';

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const relativeFormatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

const numberFormatter = new Intl.NumberFormat(LOCALE);

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return numberFormatter.format(value);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits).replace('.', ',')} %`;
}

export function formatCurrency(
  amount: number,
  currency = 'USD',
  options: { minorUnits?: boolean } = {},
): string {
  const value = options.minorUnits ? amount / 100 : amount;
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

/** « il y a 3 minutes », « hier », « dans 2 heures ». */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);

  if (abs < 60) return relativeFormatter.format(seconds, 'second');
  if (abs < 3600) return relativeFormatter.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relativeFormatter.format(Math.round(seconds / 3600), 'hour');
  if (abs < 2592000) return relativeFormatter.format(Math.round(seconds / 86400), 'day');
  if (abs < 31536000) return relativeFormatter.format(Math.round(seconds / 2592000), 'month');
  return relativeFormatter.format(Math.round(seconds / 31536000), 'year');
}

/** « janv. 2024 — aujourd'hui » pour les périodes d'expérience. */
export function formatPeriod(start: string | null, end: string | null): string {
  const from = start ? formatMonthYear(start) : '—';
  if (!end) return `${from} — aujourd’hui`;
  return `${from} — ${formatMonthYear(end)}`;
}

function formatMonthYear(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric' }).format(date);
}

/** Initiales pour les avatars, tolérant aux noms vides. */
export function initials(firstName?: string | null, lastName?: string | null): string {
  const a = (firstName ?? '').trim().charAt(0);
  const b = (lastName ?? '').trim().charAt(0);
  const result = `${a}${b}`.toUpperCase();
  return result || '?';
}

/** `aria-label` lisible pour les niveaux de compétence. */
export const SKILL_LEVEL_LABELS: Record<string, string> = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  advanced: 'Avancé',
  expert: 'Expert',
};

export const EXPERIENCE_TYPE_LABELS: Record<string, string> = {
  full_time: 'CDI',
  part_time: 'Temps partiel',
  contract: 'Contrat',
  freelance: 'Freelance',
  internship: 'Stage',
  apprenticeship: 'Alternance',
  volunteer: 'Bénévolat',
};

export const EDUCATION_KIND_LABELS: Record<string, string> = {
  degree: 'Diplôme',
  certification: 'Certification',
  training: 'Formation',
  academic_project: 'Projet académique',
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  planned: 'Prévu',
  in_progress: 'En cours',
  completed: 'Terminé',
  archived: 'Archivé',
};

export const CV_STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  archived: 'Archivé',
};

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super administrateur',
  admin: 'Administrateur',
  user: 'Utilisateur',
};

export const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  active: 'Actif',
  suspended: 'Suspendu',
  disabled: 'Désactivé',
  pending_verification: 'En attente de vérification',
};

export const AI_FEATURE_LABELS: Record<string, string> = {
  chat: 'Assistant',
  'cv.generate': 'Génération de CV',
  'cv.optimize': 'Optimisation de CV',
  'job.analysis': 'Analyse d’offre',
  'career.coach': 'Coach carrière',
  cover_letter: 'Lettre de motivation',
};

export const SECTION_TYPE_LABELS: Record<string, string> = {
  summary: 'Résumé',
  experience: 'Expérience',
  education: 'Formation',
  skills: 'Compétences',
  projects: 'Projets',
  languages: 'Langues',
  certifications: 'Certifications',
  custom: 'Personnalisé',
};
