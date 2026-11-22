import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuotaLedgerReason } from '../../common/constants/domain';
import { RewardedAdClaim } from '../../database/entities/platform.entity';
import { randomToken, sha256 } from '../../common/utils/crypto.util';
import { Errors } from '../../common/utils/errors';
import { SettingsService } from '../settings/settings.service';
import { AiQuotaService } from './quota.service';
import { AuditService } from '../audit/audit.service';

/**
 * Rewarded-video quota refill.
 *
 * Deliberate design: a credit is **never** granted because the client clicked
 * something. The flow is
 *   1. `start()` — issues a one-time signed token (server-side, rate limited),
 *   2. the ad network calls our postback webhook with a provider signature,
 *   3. `verifyAndCredit()` validates the signature + token + daily cap.
 *
 * When no rewarded-ad provider is configured the feature reports itself as
 * unavailable instead of pretending to work.
 */
@Injectable()
export class RewardedAdService {
  private readonly logger = new Logger(RewardedAdService.name);

  constructor(
    @InjectRepository(RewardedAdClaim) private readonly claims: Repository<RewardedAdClaim>,
    private readonly settings: SettingsService,
    private readonly quota: AiQuotaService,
    private readonly audit: AuditService,
  ) {}

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** True only when an actual rewarded-ad provider is configured. */
  isAvailable(): boolean {
    const quota = this.settings.quotas;
    const features = this.settings.features;
    const providerConfigured = Boolean(process.env['REWARDED_AD_PROVIDER'] && process.env['REWARDED_AD_SECRET']);
    return quota.rewardedAdsEnabled && features.rewardedAds && providerConfigured;
  }

  async status(userId: string) {
    const quota = this.settings.quotas;
    const usedToday = this.isAvailable()
      ? await this.claims.count({ where: { userId, day: this.today(), status: 'verified' } })
      : 0;
    return {
      available: this.isAvailable(),
      reason: this.isAvailable()
        ? null
        : 'Aucun fournisseur de publicité récompensée n’est configuré sur cette instance.',
      bonusCredits: quota.rewardedAdBonus,
      maxPerDay: quota.rewardedAdMaxPerDay,
      usedToday,
      remainingToday: Math.max(0, quota.rewardedAdMaxPerDay - usedToday),
    };
  }

  async start(userId: string) {
    if (!this.isAvailable()) {
      throw Errors.forbidden(
        'Le déblocage par vidéo publicitaire n’est pas disponible sur cette instance.',
      );
    }
    const quota = this.settings.quotas;
    const usedToday = await this.claims.count({ where: { userId, day: this.today(), status: 'verified' } });
    if (usedToday >= quota.rewardedAdMaxPerDay) {
      throw Errors.rateLimited('Vous avez atteint le nombre maximum de vidéos pour aujourd’hui.');
    }
    const pending = await this.claims.count({ where: { userId, day: this.today(), status: 'pending' } });
    if (pending >= 3) {
      throw Errors.rateLimited('Une session publicitaire est déjà en cours.');
    }

    const token = randomToken(32);
    const claim = await this.claims.save(
      this.claims.create({
        userId,
        token: sha256(token),
        day: this.today(),
        status: 'pending',
        creditsGranted: 0,
      }),
    );

    // The ad SDK appends this token to its postback URL (server-to-server).
    return {
      claimId: claim.id,
      token,
      postbackUrl: `${process.env['PUBLIC_APP_URL'] ?? ''}/api/ai/quota/rewarded-ad/postback`,
    };
  }

  /**
   * Provider → server postback. Must be signature-verified; a bare client call
   * can never reach this with a valid signature because the secret is server-side.
   */
  async verifyAndCredit(input: {
    token: string;
    signature: string;
    providerTransactionId: string;
    ip?: string;
  }): Promise<{ credited: boolean; credits: number }> {
    if (!this.isAvailable()) throw Errors.forbidden('Publicité récompensée non configurée.');

    const secret = process.env['REWARDED_AD_SECRET'] ?? '';
    const expected = sha256(`${input.token}:${input.providerTransactionId}:${secret}`);
    if (expected !== input.signature) {
      this.logger.warn(`Signature publicitaire invalide (ip=${input.ip ?? '?'})`);
      throw Errors.forbidden('Signature publicitaire invalide.');
    }

    const claim = await this.claims.findOne({ where: { token: sha256(input.token) } });
    if (!claim) throw Errors.notFound('Session publicitaire');
    if (claim.status !== 'pending') {
      // Idempotent: a duplicate postback never double-credits.
      return { credited: false, credits: claim.creditsGranted };
    }

    const quota = this.settings.quotas;
    const verifiedToday = await this.claims.count({
      where: { userId: claim.userId, day: this.today(), status: 'verified' },
    });
    if (verifiedToday >= quota.rewardedAdMaxPerDay) {
      throw Errors.rateLimited('Limite journalière de vidéos récompensées atteinte.');
    }

    await this.claims.update(claim.id, {
      status: 'verified',
      creditsGranted: quota.rewardedAdBonus,
      providerSignature: input.signature.slice(0, 200),
      verifiedAt: new Date(),
    });
    await this.quota.grantBonus(
      claim.userId,
      '*',
      quota.rewardedAdBonus,
      QuotaLedgerReason.BONUS_AD,
      `rewarded_ad:${input.providerTransactionId}`,
    );
    await this.audit.log({
      actorId: claim.userId,
      action: 'quota.rewarded_ad_verified',
      entity: 'rewarded_ad_claim',
      entityId: claim.id,
      ipAddress: input.ip,
    });

    return { credited: true, credits: quota.rewardedAdBonus };
  }
}
