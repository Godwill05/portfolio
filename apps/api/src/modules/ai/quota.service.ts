import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AiFeature,
  QuotaLedgerReason,
  QuotaPeriod,
  ROLE_PERMISSIONS,
  Permission,
  UserRole,
} from '../../common/constants/domain';
import { QuotaLedger, QuotaPolicy } from '../../database/entities/platform.entity';
import { User } from '../../database/entities/user.entity';
import { Errors } from '../../common/utils/errors';
import { SettingsService } from '../settings/settings.service';

/** Ledger reasons that represent real usage (consume/refund pairs). */
const USAGE_REASONS = [QuotaLedgerReason.CONSUME, QuotaLedgerReason.REFUND];

/** Ledger reasons that represent extra credits granted to the user. */
const GRANT_REASONS = [
  QuotaLedgerReason.GRANT,
  QuotaLedgerReason.BONUS_AD,
  QuotaLedgerReason.BONUS_DONATION,
];

export interface QuotaFeatureStatus {
  feature: AiFeature;
  limit: number;
  used: number;
  remaining: number;
}

export interface QuotaSummary {
  enabled: boolean;
  period: QuotaPeriod;
  unlimited: boolean;
  features: QuotaFeatureStatus[];
  bonusCredits: number;
  resetsAt: string;
  rewardedAds: { enabled: boolean; bonus: number; maxPerDay: number; usedToday: number };
  donationBonus: { enabled: boolean; credits: number };
}

/**
 * Backend-enforced usage quota. The frontend merely *displays* this state;
 * every consuming action is checked server-side before any provider call.
 *
 * Accounting: `quota_ledger` rows with delta>0 consume, delta<0 grant bonus.
 * The day bucket is UTC-based so limits reset predictably.
 */
@Injectable()
export class AiQuotaService {
  private readonly logger = new Logger(AiQuotaService.name);

  constructor(
    @InjectRepository(QuotaLedger) private readonly ledger: Repository<QuotaLedger>,
    @InjectRepository(QuotaPolicy) private readonly policies: Repository<QuotaPolicy>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly settings: SettingsService,
  ) {}

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private periodStart(period: QuotaPeriod): string {
    const now = new Date();
    if (period === QuotaPeriod.DAILY) return now.toISOString().slice(0, 10);
    if (period === QuotaPeriod.WEEKLY) {
      const day = (now.getUTCDay() + 6) % 7;
      const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
      return monday.toISOString().slice(0, 10);
    }
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  }

  private nextReset(period: QuotaPeriod): Date {
    const now = new Date();
    if (period === QuotaPeriod.DAILY) {
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    }
    if (period === QuotaPeriod.WEEKLY) {
      const day = (now.getUTCDay() + 6) % 7;
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (7 - day)));
    }
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }

  /** Resolve the effective limit for a user/feature, honouring scope precedence. */
  async resolveLimit(user: User, feature: AiFeature): Promise<{ limit: number; period: QuotaPeriod; unlimited: boolean }> {
    const quotaSettings = this.settings.quotas;

    // Admins are never quota-blocked (they need to test the platform).
    if (ROLE_PERMISSIONS[user.role]?.includes(Permission.AI_PROVIDERS_WRITE)) {
      return { limit: Number.MAX_SAFE_INTEGER, period: quotaSettings.period, unlimited: true };
    }

    const policies = await this.policies.find({ where: { isActive: true } });
    const pick = (scope: 'user' | 'role' | 'global') =>
      policies.find(
        (p) =>
          p.scope === scope &&
          (p.feature === feature || p.feature === '*') &&
          (scope === 'user' ? p.userId === user.id : scope === 'role' ? p.role === user.role : true),
      );

    const candidate =
      pick('user') ??
      pick('role') ??
      pick('global');

    if (candidate) {
      return { limit: candidate.limit, period: candidate.period, unlimited: false };
    }

    const featureLimit = quotaSettings.featureLimits?.[feature];
    return {
      limit: typeof featureLimit === 'number' ? featureLimit : quotaSettings.defaultLimit,
      period: quotaSettings.period,
      unlimited: !quotaSettings.enabled,
    };
  }

  /**
   * Usage inside the current period. Only *usage* rows count: a consume adds,
   * a refund (our provider failed) subtracts. Grants are deliberately excluded —
   * they are extra head-room tracked by `bonusBalance`, otherwise a refund would
   * be indistinguishable from a granted credit.
   */
  private async usedInPeriod(userId: string, feature: AiFeature, period: QuotaPeriod): Promise<number> {
    const start = this.periodStart(period);
    const row = await this.ledger
      .createQueryBuilder('l')
      .select('COALESCE(SUM(l.delta), 0)', 'total')
      .where('l.userId = :userId', { userId })
      .andWhere('l.feature = :feature', { feature })
      .andWhere('l.day >= :start', { start })
      .andWhere('l.reason IN (:...usageReasons)', { usageReasons: USAGE_REASONS })
      .getRawOne<{ total: string }>();
    return Math.max(0, Number(row?.total ?? 0));
  }

  /** Extra credits granted through rewarded ads, donations or admin adjustment. */
  private async bonusBalance(userId: string, feature: AiFeature): Promise<number> {
    const row = await this.ledger
      .createQueryBuilder('l')
      .select('COALESCE(SUM(-l.delta), 0)', 'total')
      .where('l.userId = :userId', { userId })
      .andWhere('l.feature = :feature', { feature })
      .andWhere('l.reason IN (:...grantReasons)', { grantReasons: GRANT_REASONS })
      .getRawOne<{ total: string }>();
    return Math.max(0, Number(row?.total ?? 0));
  }

  async bonusCreditsTotal(userId: string): Promise<number> {
    const row = await this.ledger
      .createQueryBuilder('l')
      .select('COALESCE(SUM(-l.delta), 0)', 'total')
      .where('l.userId = :userId', { userId })
      .andWhere('l.reason IN (:...grantReasons)', { grantReasons: GRANT_REASONS })
      .getRawOne<{ total: string }>();
    return Math.max(0, Number(row?.total ?? 0));
  }

  async summaryFor(userId: string): Promise<QuotaSummary> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw Errors.notFound('Utilisateur');
    const quotaSettings = this.settings.quotas;

    const features = Object.values(AiFeature);
    const statuses: QuotaFeatureStatus[] = [];
    let period: QuotaPeriod = quotaSettings.period;
    let unlimited = false;

    for (const feature of features) {
      const resolved = await this.resolveLimit(user, feature);
      period = resolved.period;
      unlimited = resolved.unlimited;
      const used = await this.usedInPeriod(userId, feature, resolved.period);
      const bonus = await this.bonusBalance(userId, feature);
      statuses.push({
        feature,
        limit: resolved.limit,
        used,
        remaining: resolved.unlimited
          ? Number.MAX_SAFE_INTEGER
          : Math.max(0, resolved.limit - used) + bonus,
      });
    }

    const rewardedUsed = await this.ledger.count({
      where: { userId, reason: QuotaLedgerReason.BONUS_AD, day: this.today() },
    });

    return {
      enabled: quotaSettings.enabled,
      period,
      unlimited,
      features: statuses,
      bonusCredits: await this.bonusCreditsTotal(userId),
      resetsAt: this.nextReset(period).toISOString(),
      rewardedAds: {
        enabled: quotaSettings.rewardedAdsEnabled,
        bonus: quotaSettings.rewardedAdBonus,
        maxPerDay: quotaSettings.rewardedAdMaxPerDay,
        usedToday: rewardedUsed,
      },
      donationBonus: {
        enabled: quotaSettings.donationBonusEnabled,
        credits: quotaSettings.donationBonusCredits,
      },
    };
  }

  /**
   * Atomically verify & consume one unit. Throws `QUOTA_EXCEEDED` when the
   * user is out of credits — strictly server-side.
   */
  async consume(userId: string, feature: AiFeature, amount = 1): Promise<{ remaining: number }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw Errors.notFound('Utilisateur');

    const { limit, period, unlimited } = await this.resolveLimit(user, feature);
    if (unlimited) {
      await this.ledger.insert({
        userId,
        feature,
        day: this.today(),
        reason: QuotaLedgerReason.CONSUME,
        delta: amount,
        note: 'unlimited',
      });
      return { remaining: Number.MAX_SAFE_INTEGER };
    }

    const used = await this.usedInPeriod(userId, feature, period);
    const bonus = await this.bonusBalance(userId, feature);
    const available = limit - used + bonus;

    if (available < amount) {
      throw Errors.quotaExceeded({
        feature,
        limit,
        used,
        bonus,
        period,
        resetsAt: this.nextReset(period).toISOString(),
        rewardedAdsAvailable: this.settings.quotas.rewardedAdsEnabled,
        donationBonusAvailable: this.settings.quotas.donationBonusEnabled,
      });
    }

    await this.ledger.insert({ userId, feature, day: this.today(), reason: QuotaLedgerReason.CONSUME, delta: amount });
    return { remaining: available - amount };
  }

  /** Refund a consumption when the provider call failed — users don't pay for our errors. */
  async refund(userId: string, feature: AiFeature, amount = 1): Promise<void> {
    await this.ledger.insert({
      userId,
      feature,
      day: this.today(),
      reason: QuotaLedgerReason.REFUND,
      delta: -amount,
      note: 'provider_failure',
    });
  }

  async grantBonus(
    userId: string,
    feature: string,
    amount: number,
    reason: QuotaLedgerReason,
    note?: string,
  ): Promise<void> {
    if (!GRANT_REASONS.includes(reason)) {
      throw Errors.validation('Motif d’octroi de crédits invalide.');
    }
    await this.ledger.insert({
      userId,
      feature,
      day: this.today(),
      reason,
      delta: -Math.abs(amount),
      note: note ?? null,
    });
  }

  /** Admin adjustment of a single user's credits (audited by the caller). */
  async adminAdjust(userId: string, feature: string, delta: number, note: string): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw Errors.notFound('Utilisateur');
    // Positive delta consumes, negative delta grants extra credits.
    await this.ledger.insert({
      userId,
      feature,
      day: this.today(),
      reason: delta > 0 ? QuotaLedgerReason.CONSUME : QuotaLedgerReason.GRANT,
      delta,
      note: note.slice(0, 200),
    });
  }

  async history(userId: string, limit = 50) {
    return this.ledger.find({ where: { userId }, order: { createdAt: 'DESC' }, take: limit });
  }

  /** Aggregated consumption for the admin analytics view. */
  async usageByFeature(days = 30) {
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    return this.ledger
      .createQueryBuilder('l')
      .select('l.feature', 'feature')
      .addSelect("SUM(CASE WHEN l.delta > 0 THEN l.delta ELSE 0 END)", 'consumed')
      .addSelect("SUM(CASE WHEN l.reason = :consume THEN l.delta ELSE 0 END)", 'gross')
      .addSelect('COUNT(DISTINCT l.userId)', 'users')
      .where('l.day >= :since', { since })
      .andWhere('l.reason IN (:...usageReasons)', { usageReasons: USAGE_REASONS })
      .setParameter('consume', QuotaLedgerReason.CONSUME)
      .groupBy('l.feature')
      .orderBy('consumed', 'DESC')
      .getRawMany<{ feature: string; consumed: string; gross: string; users: string }>();
  }

  /** Remaining quota for every feature in one query — used by the AI guard. */
  async canConsume(userId: string, feature: AiFeature): Promise<boolean> {
    try {
      const user = await this.users.findOne({ where: { id: userId } });
      if (!user) return false;
      const { limit, period, unlimited } = await this.resolveLimit(user, feature);
      if (unlimited) return true;
      const used = await this.usedInPeriod(userId, feature, period);
      const bonus = await this.bonusBalance(userId, feature);
      return limit - used + bonus > 0;
    } catch (error) {
      this.logger.error(`Quota check failed: ${(error as Error).message}`);
      return false;
    }
  }
}
