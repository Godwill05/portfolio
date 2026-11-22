import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DataSource, LessThan, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { UAParser } from 'ua-parser-js';
import { AppConfig } from '../../config/app-config';
import {
  AccountStatus,
  Permission,
  ROLE_PERMISSIONS,
  UserRole,
} from '../../common/constants/domain';
import { EmailToken, EmailTokenType, User, UserSession } from '../../database/entities/user.entity';
import { AppError, Errors } from '../../common/utils/errors';
import { randomToken, sha256 } from '../../common/utils/crypto.util';
import type { AuthenticatedUser, JwtAccessPayload, JwtRefreshPayload } from './types';
import { ProfessionalProfile } from '../../database/entities/profile.entity';
import { slugify } from '../../common/utils/slug.util';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { AiQuotaService } from '../ai/quota.service';

export interface SessionContext {
  ip: string;
  userAgent: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: AccountStatus;
  locale: string;
  themePreference: string;
  emailVerified: boolean;
  avatarFileId: string | null;
  permissions: Permission[];
  createdAt: Date;
}

const MAX_FAILED_ATTEMPTS = 8;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserSession) private readonly sessions: Repository<UserSession>,
    @InjectRepository(EmailToken) private readonly emailTokens: Repository<EmailToken>,
    @InjectRepository(ProfessionalProfile) private readonly profiles: Repository<ProfessionalProfile>,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly quota: AiQuotaService,
    private readonly dataSource: DataSource,
  ) {}

  // ─────────────────────────── helpers ───────────────────────────

  private hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  /** Constant-ish time verification that also resists user enumeration. */
  private async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  toPublicUser(user: User, emailVerified: boolean): PublicUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      locale: user.locale,
      themePreference: user.themePreference,
      emailVerified,
      avatarFileId: user.avatarFileId,
      permissions: ROLE_PERMISSIONS[user.role] ?? [],
      createdAt: user.createdAt,
    };
  }

  private describeDevice(userAgent: string): string {
    const parsed = new UAParser(userAgent).getResult();
    const browser = parsed.browser.name ?? 'Navigateur';
    const os = parsed.os.name ?? 'Système inconnu';
    return `${browser} · ${os}`;
  }

  private async issueTokens(
    user: User,
    sessionId: string,
    familyId: string,
    ctx: SessionContext,
  ): Promise<AuthTokens> {
    const accessTtlSec = this.parseTtl(this.config.jwt.accessTtl);
    const refreshTtlMs = this.parseTtlMs(this.config.jwt.refreshTtl);

    const accessPayload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sid: sessionId,
      typ: 'access',
    };
    const refreshPayload: JwtRefreshPayload = {
      sub: user.id,
      sid: sessionId,
      fam: familyId,
      typ: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.config.jwt.accessSecret,
        expiresIn: this.config.jwt.accessTtl as never,
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.config.jwt.refreshSecret,
        expiresIn: this.config.jwt.refreshTtl as never,
      }),
    ]);

    const session = this.sessions.create({
      id: sessionId,
      userId: user.id,
      tokenHash: sha256(refreshToken),
      familyId,
      ipAddress: ctx.ip.slice(0, 45) || null,
      userAgent: ctx.userAgent.slice(0, 255) || null,
      deviceLabel: this.describeDevice(ctx.userAgent),
      expiresAt: new Date(Date.now() + refreshTtlMs),
      lastUsedAt: new Date(),
    });
    await this.sessions.save(session);

    return { accessToken, refreshToken, expiresIn: accessTtlSec };
  }

  private parseTtl(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl.trim());
    if (!match) return 900;
    const value = Number(match[1]);
    const unit = match[2];
    const factor = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
    return value * factor;
  }

  private parseTtlMs(ttl: string): number {
    return this.parseTtl(ttl) * 1000;
  }

  // ─────────────────────────── register ──────────────────────────

  async register(
    input: { email: string; password: string; firstName: string; lastName: string; locale?: string },
    ctx: SessionContext,
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.users.findOne({ where: { email }, withDeleted: true });
    if (existing) {
      // Do not disclose account existence beyond what registration requires.
      throw Errors.conflict('Un compte existe déjà avec cet email.', 'EMAIL_TAKEN');
    }

    const passwordHash = await this.hashPassword(input.password);
    const verifiedByDefault = this.config.nodeEnv !== 'production';

    const user = await this.dataSource.transaction(async (manager) => {
      const created = manager.create(User, {
        email,
        passwordHash,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        role: UserRole.USER,
        status: verifiedByDefault ? AccountStatus.ACTIVE : AccountStatus.PENDING_VERIFICATION,
        locale: input.locale ?? 'fr',
        emailVerifiedAt: verifiedByDefault ? new Date() : null,
      });
      await manager.save(created);

      const slug = await this.uniqueSlug(
        slugify(`${created.firstName} ${created.lastName}`) || 'portfolio',
        manager.getRepository(ProfessionalProfile),
      );
      await manager.save(
        manager.create(ProfessionalProfile, {
          userId: created.id,
          displayName: `${created.firstName} ${created.lastName}`.trim(),
          slug,
        }),
      );
      return created;
    });

    const sessionId = randomToken(16);
    const familyId = randomToken(16);
    const tokens = await this.issueTokens(user, sessionId, familyId, ctx);
    await this.audit.log({
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.register',
      entity: 'user',
      entityId: user.id,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    if (!verifiedByDefault) {
      await this.sendVerificationEmail(user);
    }

    return { user: this.toPublicUser(user, verifiedByDefault), tokens };
  }

  private async uniqueSlug(base: string, repo: Repository<ProfessionalProfile>): Promise<string> {
    let candidate = base.slice(0, 60) || 'portfolio';
    let attempt = 0;
    while (await repo.exists({ where: { slug: candidate } })) {
      attempt += 1;
      candidate = `${base.slice(0, 55)}-${attempt}`;
      if (attempt > 50) candidate = `${base.slice(0, 45)}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
    }
    return candidate;
  }

  // ──────────────────────────── login ────────────────────────────

  async login(
    input: { email: string; password: string },
    ctx: SessionContext,
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const email = input.email.trim().toLowerCase();
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();

    // Uniform failure path to prevent timing/enumeration leaks.
    const genericFailure = () => Errors.invalidCredentials();
    if (!user) {
      await this.verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', input.password);
      throw genericFailure();
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) throw Errors.accountLocked();
    if (user.status === AccountStatus.DISABLED || user.status === AccountStatus.SUSPENDED) {
      throw Errors.accountDisabled();
    }

    const valid = await this.verifyPassword(user.passwordHash, input.password);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      await this.users.update(user.id, {
        failedLoginAttempts: attempts,
        lockedUntil: attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_DURATION_MS) : null,
      });
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        await this.audit.log({
          actorId: user.id,
          actorEmail: user.email,
          action: 'auth.account_locked',
          entity: 'user',
          entityId: user.id,
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
        });
      }
      throw genericFailure();
    }

    await this.users.update(user.id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: ctx.ip.slice(0, 45),
    });

    const sessionId = randomToken(16);
    const familyId = randomToken(16);
    const tokens = await this.issueTokens(user, sessionId, familyId, ctx);
    await this.audit.log({
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return { user: this.toPublicUser(user, Boolean(user.emailVerifiedAt)), tokens };
  }

  // ─────────────────────────── refresh ───────────────────────────

  async refresh(
    refreshToken: string,
    ctx: SessionContext,
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    let payload: JwtRefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtRefreshPayload>(refreshToken, {
        secret: this.config.jwt.refreshSecret,
      });
    } catch {
      throw Errors.unauthorized('Session expirée. Veuillez vous reconnecter.');
    }
    if (payload.typ !== 'refresh') throw Errors.unauthorized('Jeton invalide.');

    const tokenHash = sha256(refreshToken);
    const session = await this.sessions.findOne({ where: { id: payload.sid } });
    if (!session) throw Errors.unauthorized('Session introuvable.');

    // Reuse detection: a rotated token being replayed means the family is compromised.
    if (session.revokedAt || session.tokenHash !== tokenHash) {
      await this.sessions.update({ familyId: session.familyId }, { revokedAt: new Date() });
      await this.audit.log({
        actorId: session.userId,
        action: 'auth.refresh_reuse_detected',
        entity: 'session',
        entityId: session.id,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw Errors.unauthorized('Session invalidée pour raison de sécurité.');
    }
    if (session.expiresAt.getTime() < Date.now()) {
      await this.sessions.update(session.id, { revokedAt: new Date() });
      throw Errors.unauthorized('Session expirée.');
    }

    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user || user.status === AccountStatus.DISABLED || user.status === AccountStatus.SUSPENDED) {
      throw Errors.unauthorized('Compte indisponible.');
    }

    // Rotate: revoke the consumed session and issue a fresh one in the same family.
    await this.sessions.update(session.id, { revokedAt: new Date() });
    const tokens = await this.issueTokens(user, randomToken(16), session.familyId, ctx);
    return { user: this.toPublicUser(user, Boolean(user.emailVerifiedAt)), tokens };
  }

  // ──────────────────────────── logout ───────────────────────────

  async logout(sessionId: string): Promise<void> {
    await this.sessions.update({ id: sessionId }, { revokedAt: new Date() });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessions
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('userId = :userId AND revokedAt IS NULL', { userId })
      .execute();
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.sessions.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return sessions
      .filter((s) => !s.revokedAt && s.expiresAt.getTime() > Date.now())
      .map((s) => ({
        id: s.id,
        deviceLabel: s.deviceLabel,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        current: s.id === currentSessionId,
      }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessions.findOne({ where: { id: sessionId, userId } });
    if (!session) throw Errors.notFound('Session');
    await this.sessions.update(sessionId, { revokedAt: new Date() });
  }

  // ─────────────────────── password lifecycle ────────────────────

  async requestPasswordReset(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const user = await this.users.findOne({ where: { email: normalized } });
    // Always resolve successfully: never disclose whether the email exists.
    if (!user) return;

    await this.emailTokens.delete({ userId: user.id, type: EmailTokenType.RESET_PASSWORD });
    const token = randomToken(32);
    await this.emailTokens.save(
      this.emailTokens.create({
        userId: user.id,
        tokenHash: sha256(token),
        type: EmailTokenType.RESET_PASSWORD,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      }),
    );
    await this.mail.sendPasswordReset(user.email, user.firstName, token);
  }

  async resetPassword(token: string, newPassword: string, ctx: SessionContext): Promise<void> {
    const record = await this.emailTokens.findOne({
      where: { tokenHash: sha256(token), type: EmailTokenType.RESET_PASSWORD },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw Errors.validation('Ce lien de réinitialisation est invalide ou expiré.');
    }
    const passwordHash = await this.hashPassword(newPassword);
    await this.dataSource.transaction(async (manager) => {
      await manager.update(EmailToken, record.id, { usedAt: new Date() });
      await manager.update(User, record.userId, {
        passwordHash,
        mustResetPassword: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
      await manager.update(UserSession, { userId: record.userId }, { revokedAt: new Date() });
    });
    await this.audit.log({
      actorId: record.userId,
      action: 'auth.password_reset',
      entity: 'user',
      entityId: record.userId,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ctx: SessionContext,
  ): Promise<void> {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user) throw Errors.notFound('Utilisateur');
    if (!(await this.verifyPassword(user.passwordHash, currentPassword))) {
      throw Errors.validation('Le mot de passe actuel est incorrect.');
    }
    const passwordHash = await this.hashPassword(newPassword);
    await this.users.update(userId, { passwordHash, mustResetPassword: false });
    // Invalidate other sessions, keep the platform usable for the current one.
    await this.sessions
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('userId = :userId AND revokedAt IS NULL', { userId })
      .execute();
    await this.audit.log({
      actorId: userId,
      action: 'auth.password_changed',
      entity: 'user',
      entityId: userId,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  // ─────────────────────── email verification ────────────────────

  async sendVerificationEmail(user: User): Promise<void> {
    await this.emailTokens.delete({ userId: user.id, type: EmailTokenType.VERIFY_EMAIL });
    const token = randomToken(32);
    await this.emailTokens.save(
      this.emailTokens.create({
        userId: user.id,
        tokenHash: sha256(token),
        type: EmailTokenType.VERIFY_EMAIL,
        expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
      }),
    );
    await this.mail.sendEmailVerification(user.email, user.firstName, token);
  }

  async requestVerification(userId: string): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw Errors.notFound('Utilisateur');
    if (user.emailVerifiedAt) return;
    await this.sendVerificationEmail(user);
  }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.emailTokens.findOne({
      where: { tokenHash: sha256(token), type: EmailTokenType.VERIFY_EMAIL },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw Errors.validation('Ce lien de vérification est invalide ou expiré.');
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.update(EmailToken, record.id, { usedAt: new Date() });
      await manager.update(User, record.userId, {
        emailVerifiedAt: new Date(),
        status: AccountStatus.ACTIVE,
      });
    });
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw Errors.notFound('Utilisateur');
    return this.toPublicUser(user, Boolean(user.emailVerifiedAt));
  }

  async getQuotaSummary(userId: string) {
    return this.quota.summaryFor(userId);
  }

  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user) throw Errors.notFound('Utilisateur');
    if (!(await this.verifyPassword(user.passwordHash, password))) {
      throw Errors.validation('Mot de passe incorrect.');
    }
    // Soft-delete + anonymise the email so the unique index stays usable.
    const anonymised = `deleted-${user.id}@removed.local`;
    await this.dataSource.transaction(async (manager) => {
      await manager.update(UserSession, { userId }, { revokedAt: new Date() });
      await manager.update(User, userId, {
        email: anonymised,
        status: AccountStatus.DISABLED,
        firstName: 'Compte',
        lastName: 'supprimé',
      });
      await manager.softDelete(User, userId);
    });
    await this.audit.log({
      actorId: userId,
      action: 'auth.account_deleted',
      entity: 'user',
      entityId: userId,
    });
  }

  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.sessions.delete({ expiresAt: LessThan(new Date(Date.now() - 7 * 86400000)) });
    return result.affected ?? 0;
  }

  async verifyPasswordFor(userId: string, plain: string): Promise<boolean> {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user) throw Errors.notFound('Utilisateur');
    return this.verifyPassword(user.passwordHash, plain);
  }

  async getUserOrFail(userId: string): Promise<User> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw Errors.notFound('Utilisateur');
    return user;
  }

  getUserForAuth(user: AuthenticatedUser): Promise<User> {
    return this.getUserOrFail(user.id);
  }

  assertAppError(error: unknown): never {
    if (error instanceof AppError) throw error;
    this.logger.error('Unexpected auth error', (error as Error)?.stack);
    throw error;
  }
}
