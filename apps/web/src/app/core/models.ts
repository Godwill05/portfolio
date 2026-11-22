/**
 * Types du domaine — miroir exact de ce que renvoie l'API.
 *
 * Règle : ces types décrivent le JSON réel, pas les entités TypeORM.
 * Les timestamps arrivent en ISO 8601, les montants en unités mineures.
 */

/* ── Énumérations (identiques à apps/api/src/common/constants/domain.ts) ── */

export type UserRole = 'super_admin' | 'admin' | 'user';

export type AccountStatus = 'active' | 'suspended' | 'disabled' | 'pending_verification';

export type Permission =
  | 'users:read'
  | 'users:write'
  | 'users:roles'
  | 'users:quota'
  | 'ai:providers:read'
  | 'ai:providers:write'
  | 'ai:usage:read'
  | 'quotas:read'
  | 'quotas:write'
  | 'settings:read'
  | 'settings:write'
  | 'billing:read'
  | 'billing:write'
  | 'blog:write'
  | 'audit:read'
  | 'stats:read';

export type AiFeature =
  | 'chat'
  | 'cv.generate'
  | 'cv.optimize'
  | 'job.analysis'
  | 'career.coach'
  | 'cover_letter';

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type ProjectStatus = 'planned' | 'in_progress' | 'completed' | 'archived';

export type ExperienceType =
  | 'full_time'
  | 'part_time'
  | 'contract'
  | 'freelance'
  | 'internship'
  | 'apprenticeship'
  | 'volunteer';

export type EducationKind = 'degree' | 'certification' | 'training' | 'academic_project';

export type CvStatus = 'draft' | 'published' | 'archived';

export type CvSectionType =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'languages'
  | 'certifications'
  | 'custom';

export type PortfolioVisibility = 'public' | 'unlisted' | 'private';

/* ── Authentification ── */

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: AccountStatus;
  locale: string;
  themePreference: string | null;
  emailVerified: boolean;
  avatarFileId: string | null;
  permissions: Permission[];
  createdAt: string;
}

/**
 * Réponse de login / register / refresh.
 *
 * Le refresh token n'apparaît jamais ici : l'API le pose dans un cookie
 * httpOnly. Le champ `accessToken` est à plat, pas imbriqué.
 */
export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  expiresIn: number;
}

/** `GET /api/auth/me` renvoie l'utilisateur et son résumé de quotas. */
export interface MeResult {
  user: PublicUser;
  quota: QuotaSummary;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  locale?: string;
}

export interface SessionInfo {
  id: string;
  device: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

/* ── Profil ── */

export interface Profile {
  id: string;
  userId: string;
  slug: string;
  displayName: string;
  headline: string | null;
  professionalTitle: string | null;
  summary: string | null;
  bio: string | null;
  location: string | null;
  countryCode: string | null;
  publicEmail: string | null;
  phone: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  twitterUrl: string | null;
  dribbbleUrl: string | null;
  gitlabUrl: string | null;
  stackoverflowUrl: string | null;
  extraLinks: { label: string; url: string }[] | null;
  metaTitle: string | null;
  metaDescription: string | null;
  accentColor: string | null;
  portfolioTemplate: string;
  visibility: PortfolioVisibility;
  indexable: boolean;
  showEmail: boolean;
  showPhone: boolean;
  showProjects: boolean;
  showExperience: boolean;
  showEducation: boolean;
  showSkills: boolean;
  showCvDownload: boolean;
  contactEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Skill {
  id: string;
  profileId: string;
  name: string;
  category: string | null;
  description: string | null;
  level: SkillLevel;
  rating: number | null;
  sortOrder: number;
  featured: boolean;
  visible: boolean;
  yearsOfExperience: number | null;
}

export interface ProjectMetric {
  label: string;
  value: string;
}

export interface Project {
  id: string;
  profileId: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  problem: string | null;
  solution: string | null;
  outcome: string | null;
  technologies: string[] | null;
  imageFileIds: string[] | null;
  demoUrl: string | null;
  repositoryUrl: string | null;
  videoUrl: string | null;
  category: string | null;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  isHighlighted: boolean;
  visible: boolean;
  sortOrder: number;
  metrics: ProjectMetric[] | null;
  skills?: { id: string; name: string }[];
}

export interface Experience {
  id: string;
  profileId: string;
  role: string;
  company: string;
  companyUrl: string | null;
  location: string | null;
  type: ExperienceType;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
  highlights: string[] | null;
  technologies: string[] | null;
  sortOrder: number;
}

export interface Education {
  id: string;
  profileId: string;
  kind: EducationKind;
  institution: string;
  institutionUrl: string | null;
  title: string;
  field: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
  grade: string | null;
  sortOrder: number;
}

export interface Language {
  id: string;
  profileId: string;
  name: string;
  level: string;
  proficiency: number | null;
  isNative: boolean;
  sortOrder: number;
}

/** Charge complète du profil, telle que renvoyée par `GET /api/me/profile`. */
export interface ProfileBundle {
  profile: Profile;
  skills: Skill[];
  projects: Project[];
  experiences: Experience[];
  educations: Education[];
  languages: Language[];
}

/** Réponse publique `GET /api/portfolio/:slug`. */
export interface PublicPortfolio {
  profile: Profile;
  skills: Skill[];
  projects: Project[];
  experiences: Experience[];
  educations: Education[];
  languages: Language[];
  cv?: { id: string; title: string } | null;
}

/* ── CV ── */

export interface CvHeader {
  fullName: string;
  headline?: string;
  email?: string;
  phone?: string;
  location?: string;
  website?: string;
  linkedin?: string;
  github?: string;
  photoFileId?: string | null;
  extraLinks?: { label: string; url: string }[];
}

export interface CvSectionItem {
  id: string;
  title?: string;
  subtitle?: string;
  meta?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  bullets?: string[];
  tags?: string[];
  level?: number;
  url?: string;
}

export interface CvSection {
  id: string;
  type: CvSectionType;
  title: string;
  visible: boolean;
  items: CvSectionItem[];
  body?: string;
}

export interface CvDocument {
  header: CvHeader;
  sections: CvSection[];
  footerNote?: string;
}

export interface CvStyle {
  accentColor?: string;
  fontFamily?: string;
  fontScale?: number;
  headingCase?: 'none' | 'upper';
  showPhoto?: boolean;
  sectionOrder?: CvSectionType[];
  density?: 'compact' | 'normal' | 'relaxed';
}

export interface Cv {
  id: string;
  userId: string;
  title: string;
  templateKey: string;
  targetRole: string | null;
  status: CvStatus;
  document: CvDocument;
  style: CvStyle;
  aiAssisted: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CvTemplate {
  key: string;
  name: string;
  description: string;
  category: string;
  accentColor: string;
  fontFamily: string;
  supportsPhoto: boolean;
  previewFileId?: string | null;
}

export interface CvStats {
  total: number;
  published: number;
  drafts: number;
  archived: number;
  aiAssisted: number;
}

/* ── IA ── */

export interface QuotaFeatureStatus {
  feature: AiFeature;
  limit: number;
  used: number;
  remaining: number;
  period: string;
}

export interface QuotaSummary {
  unlimited: boolean;
  features: QuotaFeatureStatus[];
  bonusCredits: number;
}

export interface QuotaHistoryPoint {
  day: string;
  feature: AiFeature;
  consumed: number;
}

export interface AiConversationSummary {
  id: string;
  title: string;
  pinned: boolean;
  messageCount: number;
  totalTokens: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  createdAt: string;
}

export interface AiConversation extends AiConversationSummary {
  messages: AiMessage[];
}

/** Événements émis par `POST /api/ai/chat/stream` (SSE). */
export type ChatStreamEvent =
  | { type: 'meta'; conversationId: string; userMessageId: string; assistantMessageId: string }
  | { type: 'delta'; content: string }
  | { type: 'done'; content: string; promptTokens: number; completionTokens: number }
  | { type: 'error'; code: string; message: string };

export interface CvOptimization {
  summary?: string;
  bullets?: string[];
  keywords?: string[];
  suggestions?: string[];
  [key: string]: unknown;
}

export interface JobAnalysis {
  matchScore: number;
  matchedSkills?: string[];
  missingSkills?: string[];
  strengths?: string[];
  gaps?: string[];
  recommendations?: string[];
  keywords?: string[];
  summary?: string;
  source?: { fetched: boolean; url?: string; title?: string; truncated?: boolean };
  [key: string]: unknown;
}

export interface CoverLetter {
  subject?: string;
  body: string;
  wordCount?: number;
  [key: string]: unknown;
}

export interface CareerPlan {
  horizonMonths?: number;
  summary?: string;
  milestones?: { title: string; description?: string; timeframe?: string }[];
  skillsToAcquire?: string[];
  resources?: { title: string; url?: string }[];
  [key: string]: unknown;
}

export interface JobOpportunity {
  id: string;
  userId: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  description: string | null;
  matchScore: number | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ── Console d'administration ── */

export interface AdminUserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: AccountStatus;
  permissions: Permission[];
  emailVerified: boolean;
  locale: string;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUserSummary {
  aiRequests: number;
  activeSessions: number;
  quota: QuotaSummary;
  recentAiUsage: {
    id: string;
    feature: AiFeature;
    model: string | null;
    success: boolean;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number | null;
    createdAt: string;
  }[];
}

export interface AnalyticsOverview {
  users: {
    total: number;
    active: number;
    verified: number;
    suspended: number;
    newInWindow: number;
    byRole: Record<string, number>;
  };
  content: {
    profiles: number;
    publishedProfiles: number;
    cvCount: number;
    skills: number;
    projects: number;
    experiences: number;
    educations: number;
    opportunities: number;
  };
  ai: {
    requests: number;
    promptTokens: number;
    completionTokens: number;
    estimatedCostUsd: number;
    successRate: number;
    failures: number;
    byFeature: { feature: AiFeature; requests: number; tokens: number }[];
    byDay: { day: string; requests: number; tokens: number }[];
  };
  billing: {
    paidTotal: number;
    currency: string;
    byStatus: Record<string, number>;
    rewardedAdClaims: number;
  };
  quota: {
    byFeature: { feature: AiFeature; consumed: number; distinctUsers: number }[];
  };
}

export interface TimeseriesPoint {
  day: string;
  signups: number;
  aiRequests: number;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  changes: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

/* ── Enveloppes de transport ── */

/** Toute réponse non paginée arrive sous `{ data }`. */
export interface ApiEnvelope<T> {
  data: T;
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/** Les listes paginées ne sont pas enveloppées : `{ items, meta }` à la racine. */
export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

/** Forme d'erreur garantie par le filtre global de l'API. */
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  path: string;
  timestamp: string;
  requestId?: string;
}
