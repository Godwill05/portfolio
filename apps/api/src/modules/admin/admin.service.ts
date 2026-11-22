import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AccountStatus,
  AiFeature,
  ContactStatus,
  PortfolioVisibility,
  ROLE_PERMISSIONS,
  TransactionStatus,
  UserRole,
} from '../../common/constants/domain';
import {
  AiUsageLog,
  ContactMessage,
  Cv,
  JobOpportunity,
  QuotaLedger,
  RewardedAdClaim,
  Transaction,
  UserSession,
} from '../../database/entities';
import {
  Education,
  Experience,
  ProfessionalProfile,
  Project,
  Skill,
} from '../../database/entities/profile.entity';
import { User } from '../../database/entities/user.entity';
import { AuditLog } from '../../database/entities/platform.entity';
import { Errors } from '../../common/utils/errors';
import { AuditService } from '../audit/audit.service';
import { AiQuotaService } from '../ai/quota.service';

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserSession) private readonly sessionRepo: Repository<UserSession>,
    @InjectRepository(AiUsageLog) private readonly usage: Repository<AiUsageLog>,
    @InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>,
    private readonly audit: AuditService,
    private readonly quota: AiQuotaService,
  ) {}

  /** Paginated, searchable, filterable user directory. Never returns passwordHash. */
  async list(params: {
    page: number;
    limit: number;
    search?: string;
    role?: UserRole;
    status?: AccountStatus;
  }) {
    const qb = this.users.createQueryBuilder('u').orderBy('u.createdAt', 'DESC');

    if (params.search) {
      qb.andWhere('(u.email LIKE :q OR u.firstName LIKE :q OR u.lastName LIKE :q)', {
        q: `%${params.search}%`,
      });
    }
    if (params.role) qb.andWhere('u.role = :role', { role: params.role });
    if (params.status) qb.andWhere('u.status = :status', { status: params.status });

    const [rows, total] = await qb
      .skip((params.page - 1) * params.limit)
      .take(params.limit)
      .getManyAndCount();

    return {
      items: rows.map((u) => this.toSummary(u)),
      meta: this.meta(total, params.page, params.limit),
    };
  }

  async detail(id: string) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw Errors.notFound('Utilisateur');

    const [sessions, usageCount, lastUsage, quotaSummary] = await Promise.all([
      this.sessionRepo.count({ where: { userId: id } }),
      this.usage.count({ where: { userId: id } }),
      this.usage.find({ where: { userId: id }, order: { createdAt: 'DESC' }, take: 10 }),
      this.quota.summaryFor(id),
    ]);

    return {
      ...this.toSummary(user),
      activeSessions: sessions,
      aiRequests: usageCount,
      recentAiUsage: lastUsage.map((u) => ({
        id: u.id,
        feature: u.feature,
        model: u.modelRef,
        success: u.success,
        promptTokens: u.promptTokens,
        completionTokens: u.completionTokens,
        latencyMs: u.latencyMs,
        createdAt: u.createdAt,
      })),
      quota: quotaSummary,
    };
  }

  async update(
    actorId: string,
    actorEmail: string,
    id: string,
    patch: { role?: UserRole; status?: AccountStatus; firstName?: string; lastName?: string },
  ) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw Errors.notFound('Utilisateur');

    // An admin must not be able to lock themselves out of the platform.
    if (id === actorId && (patch.role && patch.role !== user.role)) {
      throw Errors.validation('Vous ne pouvez pas modifier votre propre rôle.');
    }
    if (id === actorId && patch.status && patch.status !== AccountStatus.ACTIVE) {
      throw Errors.validation('Vous ne pouvez pas désactiver votre propre compte.');
    }
    // Never allow the last remaining active super admin to be demoted.
    if (user.role === UserRole.SUPER_ADMIN && patch.role && patch.role !== UserRole.SUPER_ADMIN) {
      const remaining = await this.users.count({
        where: { role: UserRole.SUPER_ADMIN, status: AccountStatus.ACTIVE },
      });
      if (remaining <= 1) {
        throw Errors.validation('Impossible de rétrograder le dernier super administrateur actif.');
      }
    }

    const changes: Record<string, unknown> = {};
    for (const key of ['role', 'status', 'firstName', 'lastName'] as const) {
      if (patch[key] !== undefined && patch[key] !== user[key]) {
        changes[key] = { from: user[key], to: patch[key] };
      }
    }

    if (Object.keys(changes).length === 0) {
      return this.toSummary(user);
    }

    await this.users.update(id, patch as never);

    // Suspension or a role change must invalidate existing sessions immediately,
    // otherwise a demoted user keeps their elevated token until it expires.
    if (patch.status === AccountStatus.SUSPENDED || patch.status === AccountStatus.DISABLED || patch.role) {
      await this.sessionRepo.delete({ userId: id });
    }

    await this.audit.log({
      actorId,
      actorEmail,
      action: 'user.update',
      entity: 'user',
      entityId: id,
      changes,
    });

    const fresh = await this.users.findOne({ where: { id } });
    return this.toSummary(fresh!);
  }

  /** Administrative credit adjustment, journalled and audited. */
  async adjustQuota(
    actorId: string,
    actorEmail: string,
    id: string,
    input: { feature: string; delta: number; note: string },
  ) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw Errors.notFound('Utilisateur');

    const known = new Set<string>([...Object.values(AiFeature), '*']);
    if (!known.has(input.feature)) throw Errors.validation('Fonctionnalité inconnue.');
    if (!Number.isInteger(input.delta) || input.delta === 0) {
      throw Errors.validation('Le nombre de crédits doit être un entier non nul.');
    }
    if (Math.abs(input.delta) > 500) {
      throw Errors.validation('Ajustement trop important (maximum 500 crédits).');
    }

    await this.quota.adminAdjust(id, input.feature, input.delta, input.note);
    await this.audit.log({
      actorId,
      actorEmail,
      action: 'user.quota.adjust',
      entity: 'user',
      entityId: id,
      changes: { feature: input.feature, delta: input.delta, note: input.note },
    });

    return this.quota.summaryFor(id);
  }

  async sessions(id: string) {
    const rows = await this.sessionRepo.find({
      where: { userId: id },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return rows.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      expiresAt: s.expiresAt,
      revokedAt: s.revokedAt,
    }));
  }

  async revokeSessions(actorId: string, actorEmail: string, id: string) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw Errors.notFound('Utilisateur');
    const result = await this.sessionRepo.delete({ userId: id });
    await this.audit.log({
      actorId,
      actorEmail,
      action: 'user.sessions.revoke',
      entity: 'user',
      entityId: id,
      changes: { revoked: result.affected ?? 0 },
    });
    return { revoked: result.affected ?? 0 };
  }

  /** Soft delete: keeps audit trail and prevents address reuse blocking. */
  async remove(actorId: string, actorEmail: string, id: string) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw Errors.notFound('Utilisateur');
    if (id === actorId) throw Errors.validation('Vous ne pouvez pas supprimer votre propre compte ici.');
    if (user.role === UserRole.SUPER_ADMIN) {
      const remaining = await this.users.count({
        where: { role: UserRole.SUPER_ADMIN, status: AccountStatus.ACTIVE },
      });
      if (remaining <= 1) throw Errors.validation('Impossible de supprimer le dernier super administrateur.');
    }

    await this.sessionRepo.delete({ userId: id });
    await this.users.softDelete({ id });
    await this.audit.log({
      actorId,
      actorEmail,
      action: 'user.delete',
      entity: 'user',
      entityId: id,
      changes: { email: user.email },
    });
    return { deleted: true };
  }

  async auditLog(params: { page: number; limit: number; action?: string; search?: string }) {
    const { items, total } = await this.audit.list(params);
    return {
      items,
      meta: this.meta(total, params.page, params.limit),
    };
  }

  /** Shared pagination envelope — must match ResponseInterceptor's `{items, meta}` shape. */
  private meta(total: number, page: number, limit: number) {
    const pages = Math.max(1, Math.ceil(total / limit));
    return {
      total,
      page,
      limit,
      pages,
      totalPages: pages,
      hasNext: page < pages,
      hasPrev: page > 1,
    };
  }

  private toSummary(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      permissions: ROLE_PERMISSIONS[user.role] ?? [],
      emailVerified: Boolean(user.emailVerifiedAt),
      locale: user.locale,
      lastLoginAt: user.lastLoginAt,
      lastLoginIp: user.lastLoginIp,
      createdAt: user.createdAt,
    };
  }
}

@Injectable()
export class AdminAnalyticsService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(ProfessionalProfile) private readonly profiles: Repository<ProfessionalProfile>,
    @InjectRepository(Cv) private readonly cvs: Repository<Cv>,
    @InjectRepository(AiUsageLog) private readonly usage: Repository<AiUsageLog>,
    @InjectRepository(JobOpportunity) private readonly opportunities: Repository<JobOpportunity>,
    @InjectRepository(ContactMessage) private readonly contacts: Repository<ContactMessage>,
    @InjectRepository(Transaction) private readonly transactions: Repository<Transaction>,
    @InjectRepository(RewardedAdClaim) private readonly adClaims: Repository<RewardedAdClaim>,
    @InjectRepository(Skill) private readonly skills: Repository<Skill>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Experience) private readonly experiences: Repository<Experience>,
    @InjectRepository(Education) private readonly educations: Repository<Education>,
    @InjectRepository(QuotaLedger) private readonly quotaLedger: Repository<QuotaLedger>,
    private readonly quotaService: AiQuotaService,
  ) {}

  /** Everything the dashboard needs, computed from real rows — no placeholders. */
  async overview(days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const sinceDay = since.toISOString().slice(0, 10);

    const [
      totalUsers,
      activeUsers,
      verifiedUsers,
      suspendedUsers,
      usersByRole,
      newUsers,
      profileCount,
      publishedProfiles,
      cvCount,
      opportunityCount,
      contactCount,
      unreadContacts,
      skillCount,
      projectCount,
      experienceCount,
      educationCount,
    ] = await Promise.all([
      this.users.count(),
      this.users.count({ where: { status: AccountStatus.ACTIVE } }),
      this.users.createQueryBuilder('u').where('u.emailVerifiedAt IS NOT NULL').getCount(),
      this.users.count({ where: { status: AccountStatus.SUSPENDED } }),
      this.countByRole(),
      this.users.createQueryBuilder('u').where('u.createdAt >= :since', { since }).getCount(),
      this.profiles.count(),
      this.profiles.count({ where: { visibility: PortfolioVisibility.PUBLIC } }),
      this.cvs.count(),
      this.opportunities.count(),
      this.contacts.count(),
      this.contacts.count({ where: { status: ContactStatus.NEW } }),
      this.skills.count(),
      this.projects.count(),
      this.experiences.count(),
      this.educations.count(),
    ]);

    const [aiTotals, aiByFeature, aiByDay, aiSuccess] = await Promise.all([
      this.aiTokenTotals(since),
      this.usageByFeature(since),
      this.usageByDay(sinceDay),
      this.aiSuccessRate(since),
    ]);

    const [paidRevenue, transactionsByStatus, adClaimsWindow, quotaByFeature] = await Promise.all([
      this.revenue(),
      this.transactionsByStatus(),
      this.adClaims.count({ where: {} }),
      this.quotaService.usageByFeature(days),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      windowDays: days,
      users: {
        total: totalUsers,
        active: activeUsers,
        verified: verifiedUsers,
        suspended: suspendedUsers,
        newInWindow: newUsers,
        byRole: usersByRole,
      },
      content: {
        profiles: profileCount,
        publishedProfiles: publishedProfiles,
        cvCount,
        skills: skillCount,
        projects: projectCount,
        experiences: experienceCount,
        educations: educationCount,
        opportunities: opportunityCount,
      },
      contacts: { total: contactCount, unread: unreadContacts },
      ai: {
        requests: aiTotals.requests,
        promptTokens: aiTotals.promptTokens,
        completionTokens: aiTotals.completionTokens,
        estimatedCostUsd: Number(aiTotals.cost.toFixed(6)),
        successRate: aiSuccess.rate,
        failures: aiSuccess.failures,
        byFeature: aiByFeature,
        byDay: aiByDay,
      },
      billing: {
        paidTotal: paidRevenue.total,
        currency: paidRevenue.currency,
        byStatus: transactionsByStatus,
        rewardedAdClaims: adClaimsWindow,
      },
      quota: {
        byFeature: quotaByFeature.map((q) => ({
          feature: q.feature,
          consumed: Number(q.consumed ?? 0),
          distinctUsers: Number(q.users ?? 0),
        })),
      },
    };
  }

  /** Daily signups + AI activity, for the dashboard trend chart. */
  async timeseries(days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const rows = await this.users
      .createQueryBuilder('u')
      .select("DATE_FORMAT(u.createdAt, '%Y-%m-%d')", 'day')
      .addSelect('COUNT(*)', 'count')
      .where('u.createdAt >= :since', { since })
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany<{ day: string; count: string }>();

    const ai = await this.usageByDay(since.toISOString().slice(0, 10));
    const aiMap = new Map(ai.map((a) => [a.day, a]));

    return rows.map((r) => ({
      day: r.day,
      signups: Number(r.count),
      aiRequests: aiMap.get(r.day)?.requests ?? 0,
    }));
  }

  private async countByRole() {
    const rows = await this.users
      .createQueryBuilder('u')
      .select('u.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .groupBy('u.role')
      .getRawMany<{ role: UserRole; count: string }>();
    return rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.role] = Number(r.count);
      return acc;
    }, {});
  }

  private async aiTokenTotals(since: Date) {
    const row = await this.usage
      .createQueryBuilder('l')
      .select('COUNT(*)', 'requests')
      .addSelect('COALESCE(SUM(l.promptTokens),0)', 'promptTokens')
      .addSelect('COALESCE(SUM(l.completionTokens),0)', 'completionTokens')
      .addSelect('COALESCE(SUM(l.estimatedCostUsd),0)', 'cost')
      .where('l.createdAt >= :since', { since })
      .getRawOne<{ requests: string; promptTokens: string; completionTokens: string; cost: string }>();

    return {
      requests: Number(row?.requests ?? 0),
      promptTokens: Number(row?.promptTokens ?? 0),
      completionTokens: Number(row?.completionTokens ?? 0),
      cost: Number(row?.cost ?? 0),
    };
  }

  private async usageByFeature(since: Date) {
    const rows = await this.usage
      .createQueryBuilder('l')
      .select('l.feature', 'feature')
      .addSelect('COUNT(*)', 'requests')
      .addSelect('COALESCE(SUM(l.promptTokens + l.completionTokens),0)', 'tokens')
      .where('l.createdAt >= :since', { since })
      .groupBy('l.feature')
      .orderBy('requests', 'DESC')
      .getRawMany<{ feature: string; requests: string; tokens: string }>();

    return rows.map((r) => ({
      feature: r.feature,
      requests: Number(r.requests),
      tokens: Number(r.tokens),
    }));
  }

  private async usageByDay(sinceDay: string) {
    const rows = await this.usage
      .createQueryBuilder('l')
      .select("DATE_FORMAT(l.createdAt, '%Y-%m-%d')", 'day')
      .addSelect('COUNT(*)', 'requests')
      .where('l.createdAt >= :since', { since: new Date(`${sinceDay}T00:00:00Z`) })
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany<{ day: string; requests: string }>();

    return rows.map((r) => ({ day: r.day, requests: Number(r.requests) }));
  }

  private async aiSuccessRate(since: Date) {
    const row = await this.usage
      .createQueryBuilder('l')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN l.success = 1 THEN 1 ELSE 0 END)', 'ok')
      .where('l.createdAt >= :since', { since })
      .getRawOne<{ total: string; ok: string }>();

    const total = Number(row?.total ?? 0);
    const ok = Number(row?.ok ?? 0);
    return {
      rate: total === 0 ? null : Math.round((ok / total) * 1000) / 10,
      failures: total - ok,
    };
  }

  private async revenue() {
    const row = await this.transactions
      .createQueryBuilder('t')
      .select('COALESCE(SUM(CASE WHEN t.status = :paid THEN t.amountMinor ELSE 0 END),0)', 'total')
      .setParameter('paid', TransactionStatus.SUCCEEDED)
      .addSelect("COALESCE(MAX(t.currency),'USD')", 'currency')
      .getRawOne<{ total: string; currency: string }>();

    // Amounts are stored in minor units to avoid float drift.
    return {
      total: Number(row?.total ?? 0) / 100,
      currency: row?.currency ?? 'USD',
    };
  }

  private async transactionsByStatus() {
    const rows = await this.transactions
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.status')
      .getRawMany<{ status: string; count: string }>();

    return rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = Number(r.count);
      return acc;
    }, {});
  }
}
