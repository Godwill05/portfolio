/**
 * Canonical enums shared by persistence, API contracts and the Angular client.
 * Kept in the API and mirrored in `apps/web/src/app/core/models`.
 */

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  USER = 'user',
}

/** Granular permissions. Roles map to permission sets; extendable from the DB. */
export enum Permission {
  USERS_READ = 'users:read',
  USERS_WRITE = 'users:write',
  USERS_ROLES = 'users:roles',
  USERS_QUOTA = 'users:quota',
  AI_PROVIDERS_READ = 'ai:providers:read',
  AI_PROVIDERS_WRITE = 'ai:providers:write',
  AI_USAGE_READ = 'ai:usage:read',
  QUOTAS_READ = 'quotas:read',
  QUOTAS_WRITE = 'quotas:write',
  SETTINGS_READ = 'settings:read',
  SETTINGS_WRITE = 'settings:write',
  BILLING_READ = 'billing:read',
  BILLING_WRITE = 'billing:write',
  BLOG_WRITE = 'blog:write',
  AUDIT_READ = 'audit:read',
  STATS_READ = 'stats:read',
}

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.SUPER_ADMIN]: Object.values(Permission),
  [UserRole.ADMIN]: [
    Permission.USERS_READ,
    Permission.USERS_WRITE,
    Permission.USERS_QUOTA,
    Permission.AI_PROVIDERS_READ,
    Permission.AI_PROVIDERS_WRITE,
    Permission.AI_USAGE_READ,
    Permission.QUOTAS_READ,
    Permission.QUOTAS_WRITE,
    Permission.SETTINGS_READ,
    Permission.SETTINGS_WRITE,
    Permission.BILLING_READ,
    Permission.BILLING_WRITE,
    Permission.BLOG_WRITE,
    Permission.AUDIT_READ,
    Permission.STATS_READ,
  ],
  [UserRole.USER]: [],
};

export enum AccountStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DISABLED = 'disabled',
  PENDING_VERIFICATION = 'pending_verification',
}

/** Features that can consume AI quota. Also used as settings/quota keys. */
export enum AiFeature {
  CHAT = 'chat',
  CV_GENERATE = 'cv.generate',
  CV_OPTIMIZE = 'cv.optimize',
  JOB_ANALYSIS = 'job.analysis',
  CAREER_COACH = 'career.coach',
  COVER_LETTER = 'cover_letter',
}

/** Semantic model routing slots — an admin maps each slot to a provider+model. */
export enum AiTaskType {
  SIMPLE = 'simple',
  COMPLEX = 'complex',
  CV = 'cv',
  JOB_ANALYSIS = 'job_analysis',
  CHAT = 'chat',
  FALLBACK = 'fallback',
}

export const FEATURE_LABELS: Record<AiFeature, string> = {
  [AiFeature.CHAT]: 'Assistant conversationnel',
  [AiFeature.CV_GENERATE]: 'Génération de CV',
  [AiFeature.CV_OPTIMIZE]: 'Optimisation de CV',
  [AiFeature.JOB_ANALYSIS]: "Analyse d'offre d'emploi",
  [AiFeature.CAREER_COACH]: 'Coach carrière',
  [AiFeature.COVER_LETTER]: 'Lettre de motivation',
};

export enum SkillLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert',
}

export enum ProjectStatus {
  PLANNED = 'planned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}

export enum ExperienceType {
  FULL_TIME = 'full_time',
  PART_TIME = 'part_time',
  CONTRACT = 'contract',
  FREELANCE = 'freelance',
  INTERNSHIP = 'internship',
  APPRENTICESHIP = 'apprenticeship',
  VOLUNTEER = 'volunteer',
}

export enum EducationKind {
  DEGREE = 'degree',
  CERTIFICATION = 'certification',
  TRAINING = 'training',
  ACADEMIC_PROJECT = 'academic_project',
}

export enum CvTemplateCategory {
  CLASSIC = 'classic',
  MODERN = 'modern',
  MINIMAL = 'minimal',
  CORPORATE = 'corporate',
  TECH = 'tech',
  CREATIVE = 'creative',
  ACADEMIC = 'academic',
  EXPERIENCE_FIRST = 'experience_first',
  SKILLS_FIRST = 'skills_first',
  JUNIOR = 'junior',
  SENIOR = 'senior',
  INTERNATIONAL = 'international',
}

export enum CvStatus {
  DRAFT = 'draft',
  FINAL = 'final',
  ARCHIVED = 'archived',
}

/** Ordered, toggleable CV sections. */
export enum CvSectionType {
  SUMMARY = 'summary',
  EXPERIENCE = 'experience',
  EDUCATION = 'education',
  SKILLS = 'skills',
  PROJECTS = 'projects',
  CERTIFICATIONS = 'certifications',
  LANGUAGES = 'languages',
  CUSTOM = 'custom',
}

export enum PortfolioVisibility {
  PRIVATE = 'private',
  UNLISTED = 'unlisted',
  PUBLIC = 'public',
}

export enum ContactStatus {
  NEW = 'new',
  READ = 'read',
  REPLIED = 'replied',
  ARCHIVED = 'archived',
  SPAM = 'spam',
}

export enum OpportunityStatus {
  SAVED = 'saved',
  ANALYZED = 'analyzed',
  APPLIED = 'applied',
  INTERVIEW = 'interview',
  OFFER = 'offer',
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
}

export enum AiProviderKind {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GEMINI = 'gemini',
  OPENROUTER = 'openrouter',
  /** Any OpenAI-compatible endpoint: Groq, Together, Ollama, vLLM, LM Studio… */
  OPENAI_COMPATIBLE = 'openai_compatible',
  MISTRAL = 'mistral',
  DEEPSEEK = 'deepseek',
}

export const PROVIDER_LABELS: Record<AiProviderKind, string> = {
  [AiProviderKind.OPENAI]: 'OpenAI',
  [AiProviderKind.ANTHROPIC]: 'Anthropic Claude',
  [AiProviderKind.GEMINI]: 'Google Gemini',
  [AiProviderKind.OPENROUTER]: 'OpenRouter',
  [AiProviderKind.OPENAI_COMPATIBLE]: 'Compatible OpenAI (self-hosted)',
  [AiProviderKind.MISTRAL]: 'Mistral AI',
  [AiProviderKind.DEEPSEEK]: 'DeepSeek',
};

export enum AiMessageRole {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant',
}

export enum PaymentProvider {
  FEDAPAY = 'fedapay',
  PAYPAL = 'paypal',
}

export enum TransactionStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELED = 'canceled',
}

export enum TransactionKind {
  DONATION = 'donation',
  CREDIT_PACK = 'credit_pack',
  SUBSCRIPTION = 'subscription',
}

export enum QuotaPeriod {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export enum QuotaLedgerReason {
  CONSUME = 'consume',
  GRANT = 'grant',
  RESET = 'reset',
  REFUND = 'refund',
  BONUS_AD = 'bonus_ad',
  BONUS_DONATION = 'bonus_donation',
}

export enum FilePurpose {
  AVATAR = 'avatar',
  PROJECT_IMAGE = 'project_image',
  CV_EXPORT = 'cv_export',
  DOCUMENT = 'document',
  BRANDING = 'branding',
}

/** Setting definition keys — the admin-editable registry. */
export enum NotificationType {
  SYSTEM = 'system',
  ACCOUNT = 'account',
  SECURITY = 'security',
  CONTACT = 'contact',
  AI = 'ai',
  BILLING = 'billing',
}

export enum ContactDeliverableState {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  BLOCKED = 'blocked',
}

export enum SettingKey {
  BRANDING = 'branding',
  SEO = 'seo',
  THEME = 'theme',
  QUOTAS = 'quotas',
  FEATURES = 'features',
  BILLING = 'billing',
  UPLOADS = 'uploads',
  MAIL = 'mail',
  SECURITY = 'security',
  MAINTENANCE = 'maintenance',
  AI_ROUTING = 'ai.routing',
  AI_LIMITS = 'ai.limits',
  LEGAL = 'legal',
}
