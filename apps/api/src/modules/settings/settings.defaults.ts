import { AiFeature, AiTaskType, QuotaPeriod, SettingKey } from '../../common/constants/domain';

export interface BrandingSettings {
  platformName: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  linkColor: string;
  successColor: string;
  warningColor: string;
  dangerColor: string;
  logoFileId: string | null;
  faviconFileId: string | null;
  logoDarkFileId: string | null;
  defaultTheme: 'light' | 'dark' | 'system';
  allowThemeToggle: boolean;
  borderRadius: number;
  fontPair: 'inter-fraunces' | 'inter' | 'serif';
}

export interface SeoSettings {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  ogImageFileId: string | null;
  twitterHandle: string;
  robotsIndexable: boolean;
  googleSiteVerification: string;
  canonicalBaseUrl: string;
}

export interface ThemeSettings {
  lightBackground: string;
  lightSurface: string;
  darkBackground: string;
  darkSurface: string;
  darkAccentSoft: string;
  enableTransparency: boolean;
  reduceMotion: boolean;
}

export interface QuotaSettings {
  enabled: boolean;
  defaultLimit: number;
  period: QuotaPeriod;
  /** Per-feature overrides; absent = use defaultLimit. */
  featureLimits: Partial<Record<AiFeature, number>>;
  /** Extra uses granted by one rewarded-video view. */
  rewardedAdBonus: number;
  rewardedAdsEnabled: boolean;
  rewardedAdMaxPerDay: number;
  donationBonusEnabled: boolean;
  donationBonusCredits: number;
  /** Anti-abuse: max accounts created per IP per day. */
  maxSignupsPerIpPerDay: number;
}

export interface FeatureFlags {
  portfolioPublic: boolean;
  cvGenerator: boolean;
  cvExports: boolean;
  aiAssistant: boolean;
  jobAnalysis: boolean;
  coverLetters: boolean;
  contactForm: boolean;
  donations: boolean;
  rewardedAds: boolean;
  registration: boolean;
  emailVerificationRequired: boolean;
  blog: boolean;
}

export interface BillingSettings {
  currency: string;
  donationEnabled: boolean;
  donationPresetsMinor: number[];
  donationMinMinor: number;
  donationMessage: string;
  donationThankYou: string;
  paypal: {
    enabled: boolean;
    environment: 'sandbox' | 'live';
    clientId: string;
    donationUrl: string;
    /** Stored encrypted by the settings service when non-empty. */
    clientSecretConfigured: boolean;
  };
  fedapay: {
    enabled: boolean;
    environment: 'sandbox' | 'live';
    publicKey: string;
    secretConfigured: boolean;
  };
  creditPacks: { id: string; label: string; credits: number; amountMinor: number }[];
}

export interface UploadSettings {
  maxAvatarMb: number;
  maxImageMb: number;
  maxDocumentMb: number;
  allowedImageTypes: string[];
  allowedDocumentTypes: string[];
}

export interface MailSettings {
  fromName: string;
  fromAddress: string;
  replyTo: string;
  contactNotifications: boolean;
  welcomeEmails: boolean;
}

export interface SecuritySettings {
  maxLoginAttempts: number;
  lockoutMinutes: number;
  sessionIdleMinutes: number;
  requireEmailVerification: boolean;
  allowPublicSignup: boolean;
  contentSecurityPolicy: string;
}

export interface MaintenanceSettings {
  enabled: boolean;
  message: string;
  allowAdminAccess: boolean;
  endsAt: string | null;
}

export interface AiRoutingSettings {
  /** task -> { provider/model display hint }. Actual FK mapping lives in ai_task_routes. */
  slots: Record<AiTaskType, string | null>;
  allowUserModelChoice: boolean;
  defaultTemperature: number;
  systemPromptLanguage: string;
}

export interface AiLimitSettings {
  maxInputChars: number;
  maxOutputTokens: number;
  requestTimeoutMs: number;
  requestsPerMinutePerUser: number;
  dailyCostCeilingUsd: number;
  logPrompts: boolean;
}

export interface LegalSettings {
  companyName: string;
  contactEmail: string;
  address: string;
  privacyUpdatedAt: string;
  termsUpdatedAt: string;
  dpoEmail: string;
  aiDisclosure: string;
}

export interface AllSettings {
  [SettingKey.BRANDING]: BrandingSettings;
  [SettingKey.SEO]: SeoSettings;
  [SettingKey.THEME]: ThemeSettings;
  [SettingKey.QUOTAS]: QuotaSettings;
  [SettingKey.FEATURES]: FeatureFlags;
  [SettingKey.BILLING]: BillingSettings;
  [SettingKey.UPLOADS]: UploadSettings;
  [SettingKey.MAIL]: MailSettings;
  [SettingKey.SECURITY]: SecuritySettings;
  [SettingKey.MAINTENANCE]: MaintenanceSettings;
  [SettingKey.AI_ROUTING]: AiRoutingSettings;
  [SettingKey.AI_LIMITS]: AiLimitSettings;
  [SettingKey.LEGAL]: LegalSettings;
}

export const DEFAULT_SETTINGS: AllSettings = {
  [SettingKey.BRANDING]: {
    platformName: 'FolioForge',
    tagline: 'Votre carrière, forgée avec précision.',
    primaryColor: '#035c80',
    secondaryColor: '#0f2f3d',
    accentColor: '#e8a33d',
    linkColor: '#035c80',
    successColor: '#1d8f6f',
    warningColor: '#c8811a',
    dangerColor: '#c0392b',
    logoFileId: null,
    faviconFileId: null,
    logoDarkFileId: null,
    defaultTheme: 'system',
    allowThemeToggle: true,
    borderRadius: 12,
    fontPair: 'inter-fraunces',
  },
  [SettingKey.SEO]: {
    metaTitle: 'FolioForge — Portfolio, CV et assistant carrière propulsés par l’IA',
    metaDescription:
      'Construisez un portfolio professionnel, générez des CV sur mesure et préparez vos candidatures avec un assistant IA responsable.',
    keywords: ['portfolio', 'cv', 'assistant carrière', 'ia', 'recherche emploi'],
    ogImageFileId: null,
    twitterHandle: '',
    robotsIndexable: true,
    googleSiteVerification: '',
    canonicalBaseUrl: 'http://localhost:4200',
  },
  [SettingKey.THEME]: {
    lightBackground: '#f7f9fa',
    lightSurface: '#ffffff',
    darkBackground: '#0b1519',
    darkSurface: '#12232a',
    darkAccentSoft: '#1b3c4a',
    enableTransparency: true,
    reduceMotion: false,
  },
  [SettingKey.QUOTAS]: {
    enabled: true,
    defaultLimit: 3,
    period: QuotaPeriod.DAILY,
    featureLimits: {
      [AiFeature.CHAT]: 20,
      [AiFeature.CV_GENERATE]: 3,
      [AiFeature.CV_OPTIMIZE]: 3,
      [AiFeature.JOB_ANALYSIS]: 3,
      [AiFeature.CAREER_COACH]: 5,
      [AiFeature.COVER_LETTER]: 3,
    },
    rewardedAdBonus: 1,
    rewardedAdsEnabled: false,
    rewardedAdMaxPerDay: 5,
    donationBonusEnabled: true,
    donationBonusCredits: 20,
    maxSignupsPerIpPerDay: 10,
  },
  [SettingKey.FEATURES]: {
    portfolioPublic: true,
    cvGenerator: true,
    cvExports: true,
    aiAssistant: true,
    jobAnalysis: true,
    coverLetters: true,
    contactForm: true,
    donations: true,
    rewardedAds: false,
    registration: true,
    emailVerificationRequired: false,
    blog: false,
  },
  [SettingKey.BILLING]: {
    currency: 'XOF',
    donationEnabled: true,
    donationPresetsMinor: [1000, 2500, 5000, 10000],
    donationMinMinor: 500,
    donationMessage: 'FolioForge est gratuit pour les chercheurs d’emploi. Votre soutien finance l’hébergement, les modèles IA et le développement.',
    donationThankYou: 'Merci infiniment pour votre soutien — chaque contribution compte.',
    paypal: {
      enabled: false,
      environment: 'sandbox',
      clientId: '',
      donationUrl: '',
      clientSecretConfigured: false,
    },
    fedapay: {
      enabled: false,
      environment: 'sandbox',
      publicKey: '',
      secretConfigured: false,
    },
    creditPacks: [],
  },
  [SettingKey.UPLOADS]: {
    maxAvatarMb: 3,
    maxImageMb: 8,
    maxDocumentMb: 10,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    allowedDocumentTypes: ['application/pdf'],
  },
  [SettingKey.MAIL]: {
    fromName: 'FolioForge',
    fromAddress: 'no-reply@folioforge.local',
    replyTo: '',
    contactNotifications: true,
    welcomeEmails: true,
  },
  [SettingKey.SECURITY]: {
    maxLoginAttempts: 8,
    lockoutMinutes: 15,
    sessionIdleMinutes: 43200,
    requireEmailVerification: false,
    allowPublicSignup: true,
    contentSecurityPolicy: '',
  },
  [SettingKey.MAINTENANCE]: {
    enabled: false,
    message: 'La plateforme est en maintenance. Nous revenons très vite.',
    allowAdminAccess: true,
    endsAt: null,
  },
  [SettingKey.AI_ROUTING]: {
    slots: {
      [AiTaskType.SIMPLE]: null,
      [AiTaskType.COMPLEX]: null,
      [AiTaskType.CV]: null,
      [AiTaskType.JOB_ANALYSIS]: null,
      [AiTaskType.CHAT]: null,
      [AiTaskType.FALLBACK]: null,
    },
    allowUserModelChoice: true,
    defaultTemperature: 0.7,
    systemPromptLanguage: 'fr',
  },
  [SettingKey.AI_LIMITS]: {
    maxInputChars: 24000,
    maxOutputTokens: 2048,
    requestTimeoutMs: 60000,
    requestsPerMinutePerUser: 12,
    dailyCostCeilingUsd: 5,
    logPrompts: false,
  },
  [SettingKey.LEGAL]: {
    companyName: 'FolioForge',
    contactEmail: 'contact@folioforge.local',
    address: '',
    privacyUpdatedAt: '2026-01-01',
    termsUpdatedAt: '2026-01-01',
    dpoEmail: 'privacy@folioforge.local',
    aiDisclosure:
      'Les contenus générés par l’assistant IA sont des suggestions. Vous devez en vérifier l’exactitude et ne jamais accepter d’informations qui ne correspondent pas à votre parcours réel.',
  },
};

export const SECRET_SETTING_KEYS: string[] = [
  'paypal.clientSecret',
  'fedapay.secretKey',
];
