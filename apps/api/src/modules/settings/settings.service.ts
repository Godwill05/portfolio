import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../../database/entities/platform.entity';
import { SettingKey } from '../../common/constants/domain';
import { SecretCipher } from '../../common/utils/crypto.util';
import { AppConfig } from '../../config/app-config';
import { DEFAULT_SETTINGS, type AllSettings } from './settings.defaults';
import { AuditService } from '../audit/audit.service';

/**
 * Settings are persisted in MySQL and cached in memory; edits invalidate the
 * cache immediately, so the admin panel changes behaviour without a restart.
 *
 * Secret sub-keys (payment credentials) are encrypted at rest and never
 * serialised to the client — only a `*Configured` boolean is exposed.
 */
@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private cache = new Map<string, unknown>();
  private readonly cipher: SecretCipher;

  /** Dot-paths inside settings objects that must never leave the server. */
  private static readonly SECRET_PATHS = new Set([
    'billing.paypal.clientSecret',
    'billing.fedapay.secretKey',
  ]);

  constructor(
    @InjectRepository(Setting) private readonly repo: Repository<Setting>,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {
    this.cipher = new SecretCipher(config.encryptionKey);
  }

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    const rows = await this.repo.find();
    this.cache.clear();
    for (const row of rows) {
      this.cache.set(row.key, this.deserialize(row.value));
    }
    this.logger.log(`Paramètres chargés (${rows.length} entrées).`);
  }

  private deserialize(value: unknown): unknown {
    if (value && typeof value === 'object' && '__enc' in (value as Record<string, unknown>)) {
      try {
        return this.cipher.decrypt((value as { __enc: string }).__enc);
      } catch {
        this.logger.error('Impossible de déchiffrer un paramètre secret — vérifiez ENCRYPTION_KEY.');
        return null;
      }
    }
    return value;
  }

  private serialize(value: unknown, isSecret: boolean): unknown {
    return isSecret ? { __enc: this.cipher.encrypt(String(value)) } : value;
  }

  /** Deep-merge stored overrides on top of defaults (defaults win for missing keys). */
  private mergeDeep<T>(base: T, override: unknown): T {
    if (Array.isArray(base) || Array.isArray(override) || override === null || override === undefined) {
      return (override === undefined ? base : override) as T;
    }
    if (typeof base !== 'object' || typeof override !== 'object') {
      return (override === undefined ? base : override) as T;
    }
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
      out[key] = this.mergeDeep((base as Record<string, unknown>)[key], value);
    }
    return out as T;
  }

  get<K extends keyof AllSettings>(key: K): AllSettings[K] {
    const stored = this.cache.get(key);
    return this.mergeDeep(DEFAULT_SETTINGS[key], stored) as AllSettings[K];
  }

  async getSecret(key: string): Promise<string> {
    const [group, subKey] = key.split('.');
    const stored = this.cache.get(`_secret.${key}`) ?? this.cache.get(group!);
    if (stored && typeof stored === 'object' && subKey && subKey in (stored as Record<string, unknown>)) {
      const value = (stored as Record<string, unknown>)[subKey];
      if (typeof value === 'string' && value.startsWith('v1:')) return this.cipher.decrypt(value);
      if (typeof value === 'string') return value;
    }
    return '';
  }

  /**
   * Strip secret values before returning settings to any client.
   * `*Configured` flags tell the admin UI whether a secret already exists.
   */
  sanitizeForClient(): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      output[key] = this.get(key as keyof AllSettings);
    }
    const billing = output['billing'] as Record<string, unknown>;
    const paypal = billing['paypal'] as Record<string, unknown>;
    const fedapay = billing['fedapay'] as Record<string, unknown>;
    delete paypal['clientSecret'];
    delete fedapay['secretKey'];
    paypal['clientSecretConfigured'] = Boolean(paypal['clientSecretConfigured']);
    fedapay['secretConfigured'] = Boolean(fedapay['secretConfigured']);
    return output;
  }

  async update(
    key: keyof AllSettings,
    patch: Record<string, unknown>,
    actor: { id: string; email: string; ip?: string; userAgent?: string },
  ): Promise<AllSettings[keyof AllSettings]> {
    const currentRow = await this.repo.findOne({ where: { key } });
    const currentValue = (currentRow?.value as Record<string, unknown> | undefined) ?? {};
    const incoming: Record<string, unknown> = { ...currentValue };

    for (const [path, rawValue] of Object.entries(patch)) {
      const fullPath = `${key}.${path}`;
      if (SettingsService.SECRET_PATHS.has(fullPath)) {
        if (rawValue === '' || rawValue === null || rawValue === undefined) {
          delete incoming[path.split('.').pop()!];
        } else {
          incoming[path.split('.').pop()!] = this.serialize(String(rawValue), true);
          this.cache.set(`_secret.${fullPath}`, String(rawValue));
        }
        continue;
      }
      this.setDeep(incoming, path, rawValue);
    }

    // Maintain "configured" booleans so the UI can show partial configuration.
    if (key === SettingKey.BILLING) {
      const billing = this.mergeDeep(DEFAULT_SETTINGS[SettingKey.BILLING], incoming) as Record<string, any>;
      billing['paypal']['clientSecretConfigured'] = Boolean(
        billing['paypal']['clientSecret'] ||
          (incoming['paypal'] as Record<string, unknown> | undefined)?.clientSecret,
      );
      billing['fedapay']['secretConfigured'] = Boolean(
        billing['fedapay']['secretKey'] ||
          (incoming['fedapay'] as Record<string, unknown> | undefined)?.secretKey,
      );
      delete billing['paypal']['clientSecret'];
      delete billing['fedapay']['secretKey'];
      incoming['paypal'] = billing['paypal'];
      incoming['fedapay'] = billing['fedapay'];
    }

    await this.repo.upsert(
      { key, value: incoming, updatedById: actor.id },
      { conflictPaths: ['key'] },
    );
    this.cache.set(key, incoming);

    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'settings.update',
      entity: 'settings',
      entityId: key,
      changes: this.redactForAudit(patch),
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
    });

    return this.get(key as keyof AllSettings);
  }

  private redactForAudit(patch: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      redacted[key] = /secret|key|password|token/i.test(key) && value ? '[REDACTED]' : value;
    }
    return redacted;
  }

  private setDeep(target: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let cursor: Record<string, unknown> = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i]!;
      if (typeof cursor[part] !== 'object' || cursor[part] === null) cursor[part] = {};
      cursor = cursor[part] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]!] = value;
  }

  /** Cheap accessors used on hot paths. */
  get isMaintenance() {
    return this.get(SettingKey.MAINTENANCE).enabled;
  }

  get features() {
    return this.get(SettingKey.FEATURES);
  }

  get quotas() {
    return this.get(SettingKey.QUOTAS);
  }

  get aiLimits() {
    return this.get(SettingKey.AI_LIMITS);
  }

  get aiRouting() {
    return this.get(SettingKey.AI_ROUTING);
  }

  get maintenance() {
    return this.get(SettingKey.MAINTENANCE);
  }

  get branding() {
    return this.get(SettingKey.BRANDING);
  }

  /** Public, unauthenticated subset used by the Angular shell before login. */
  publicBootstrap() {
    const branding = this.get(SettingKey.BRANDING);
    const seo = this.get(SettingKey.SEO);
    const theme = this.get(SettingKey.THEME);
    const features = this.get(SettingKey.FEATURES);
    const billing = this.get(SettingKey.BILLING);
    const legal = this.get(SettingKey.LEGAL);
    const maintenance = this.get(SettingKey.MAINTENANCE);
    const quotas = this.get(SettingKey.QUOTAS);

    return {
      branding: {
        platformName: branding.platformName,
        tagline: branding.tagline,
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor,
        accentColor: branding.accentColor,
        linkColor: branding.linkColor,
        successColor: branding.successColor,
        warningColor: branding.warningColor,
        dangerColor: branding.dangerColor,
        logoUrl: branding.logoFileId ? `/api/files/public/${branding.logoFileId}` : null,
        faviconUrl: branding.faviconFileId ? `/api/files/public/${branding.faviconFileId}` : null,
        defaultTheme: branding.defaultTheme,
        allowThemeToggle: branding.allowThemeToggle,
        borderRadius: branding.borderRadius,
        fontPair: branding.fontPair,
      },
      theme: {
        lightBackground: theme.lightBackground,
        lightSurface: theme.lightSurface,
        darkBackground: theme.darkBackground,
        darkSurface: theme.darkSurface,
        darkAccentSoft: theme.darkAccentSoft,
        reduceMotion: theme.reduceMotion,
      },
      seo: {
        metaTitle: seo.metaTitle,
        metaDescription: seo.metaDescription,
        robotsIndexable: seo.robotsIndexable,
        twitterHandle: seo.twitterHandle,
      },
      features: {
        portfolioPublic: features.portfolioPublic,
        cvGenerator: features.cvGenerator,
        aiAssistant: features.aiAssistant,
        jobAnalysis: features.jobAnalysis,
        coverLetters: features.coverLetters,
        contactForm: features.contactForm,
        donations: features.donations && billing.donationEnabled || features.donations,
        rewardedAds: features.rewardedAds && quotas.rewardedAdsEnabled,
        registration: features.registration,
        blog: features.blog,
      },
      billing: {
        donationEnabled: billing.donationEnabled,
        donationPresetsMinor: billing.donationPresetsMinor,
        donationMinMinor: billing.donationMinMinor,
        donationMessage: billing.donationMessage,
        donationThankYou: billing.donationThankYou,
        currency: billing.currency,
        paypalEnabled: billing.paypal.enabled && Boolean(billing.paypal.donationUrl || billing.paypal.clientId),
        fedapayEnabled: billing.fedapay.enabled,
        rewardedAdsEnabled: quotas.rewardedAdsEnabled,
      },
      quota: {
        enabled: quotas.enabled,
        defaultLimit: quotas.defaultLimit,
        period: quotas.period,
        featureLimits: quotas.featureLimits,
        donationBonusCredits: quotas.donationBonusCredits,
        donationBonusEnabled: quotas.donationBonusEnabled,
        rewardedAdBonus: quotas.rewardedAdBonus,
      },
      legal: {
        companyName: legal.companyName,
        contactEmail: legal.contactEmail,
        dpoEmail: legal.dpoEmail,
        privacyUpdatedAt: legal.privacyUpdatedAt,
        termsUpdatedAt: legal.termsUpdatedAt,
        aiDisclosure: legal.aiDisclosure,
      },
      maintenance: {
        enabled: maintenance.enabled,
        message: maintenance.message,
      },
    };
  }
}
