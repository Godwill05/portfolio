import { describe, expect, it, beforeEach } from 'vitest';
import type { Repository } from 'typeorm';
import { AiQuotaService } from '../src/modules/ai/quota.service';
import { AiFeature, QuotaLedgerReason, QuotaPeriod, UserRole } from '../src/common/constants/domain';

/**
 * Regression tests for the ledger accounting.
 *
 * A refund was originally written as `delta = -1` and the bonus balance summed
 * every negative delta, so each provider failure silently *granted* a free
 * credit (observed: 5 failed calls turned a 3/day limit into 8 remaining).
 * These tests pin the corrected semantics:
 *   usage  = consume (+1) and refund (−1) only
 *   bonus  = grant / bonus_ad / bonus_donation only
 */

type Row = {
  id: string;
  userId: string;
  feature: string;
  day: string;
  reason: QuotaLedgerReason;
  delta: number;
  note?: string | null;
  createdAt: Date;
};

/** Minimal in-memory stand-in for the TypeORM query builder used by the service. */
function makeLedgerRepo() {
  const rows: Row[] = [];
  let seq = 0;

  const filterRows = (params: Record<string, unknown>, conds: string[]) => {
    return rows.filter((row) => {
      if (conds.includes('userId') && params.userId && row.userId !== params.userId) return false;
      if (conds.includes('feature') && params.feature && row.feature !== params.feature) return false;
      if (conds.includes('day') && params.start && row.day < String(params.start)) return false;
      if (conds.includes('reason')) {
        const allowed = (params.usageReasons ?? params.grantReasons ?? []) as string[];
        if (allowed.length && !allowed.includes(row.reason)) return false;
      }
      return true;
    });
  };

  const builder = () => {
    const params: Record<string, unknown> = {};
    const conds: string[] = [];
    let sumExpr = 'SUM(l.delta)';

    const api = {
      select(expr: string) {
        sumExpr = expr;
        return api;
      },
      addSelect() {
        return api;
      },
      where(_sql: string, p?: Record<string, unknown>) {
        if (p && 'userId' in p) conds.push('userId');
        if (p) Object.assign(params, p);
        return api;
      },
      andWhere(sql: string, p?: Record<string, unknown>) {
        if (sql.includes('l.feature')) conds.push('feature');
        if (sql.includes('l.day')) conds.push('day');
        if (sql.includes('reason IN')) conds.push('reason');
        if (p) Object.assign(params, p);
        return api;
      },
      setParameter() {
        return api;
      },
      groupBy() {
        return api;
      },
      orderBy() {
        return api;
      },
      async getRawOne() {
        const selected = filterRows(params, conds);
        let total: number;
        if (sumExpr.includes('-l.delta')) {
          total = selected.reduce((sum, r) => sum + -r.delta, 0);
        } else {
          total = selected.reduce((sum, r) => sum + r.delta, 0);
        }
        return { total: String(total) };
      },
      async getRawMany() {
        return [];
      },
    };
    return api;
  };

  const repo = {
    createQueryBuilder: () => builder(),
    async insert(value: Partial<Row>) {
      rows.push({
        id: String(++seq),
        userId: String(value.userId),
        feature: String(value.feature),
        day: String(value.day),
        reason: value.reason as QuotaLedgerReason,
        delta: Number(value.delta ?? 1),
        note: value.note ?? null,
        createdAt: new Date(),
      });
    },
    async count({ where }: { where: Partial<Row> }) {
      return rows.filter((r) =>
        Object.entries(where).every(([k, v]) => (r as never as Record<string, unknown>)[k] === v),
      ).length;
    },
    async find() {
      return [...rows];
    },
  };

  return { repo: repo as unknown as Repository<never>, rows };
}

const USER = {
  id: 'u-1',
  email: 'u@test.local',
  role: UserRole.USER,
};

function makeService(overrides?: { enabled?: boolean; limits?: Record<string, number> }) {
  const { repo, rows } = makeLedgerRepo();

  const policies = {
    async find() {
      return [];
    },
  };

  const users = {
    async findOne() {
      return USER;
    },
  };

  const settings = {
    quotas: {
      enabled: overrides?.enabled ?? true,
      period: QuotaPeriod.DAILY,
      defaultLimit: 3,
      featureLimits: overrides?.limits ?? { [AiFeature.CHAT]: 20, [AiFeature.CV_OPTIMIZE]: 3 },
      rewardedAdsEnabled: false,
      rewardedAdBonus: 1,
      rewardedAdMaxPerDay: 5,
      donationBonusEnabled: true,
      donationBonusCredits: 5,
    },
  };

  const service = new AiQuotaService(
    repo as never,
    policies as never,
    users as never,
    settings as never,
  );

  return { service, rows };
}

describe('AI quota ledger', () => {
  let service: AiQuotaService;
  let rows: Row[];

  beforeEach(() => {
    ({ service, rows } = makeService());
  });

  it('consumes a unit and reduces the remaining count', async () => {
    const first = await service.consume(USER.id, AiFeature.CV_OPTIMIZE, 1);
    expect(first.remaining).toBe(2);
    const second = await service.consume(USER.id, AiFeature.CV_OPTIMIZE, 1);
    expect(second.remaining).toBe(1);
  });

  it('never grants bonus credit when a unit is refunded (regression)', async () => {
    await service.consume(USER.id, AiFeature.CV_OPTIMIZE, 1);
    await service.consume(USER.id, AiFeature.CV_OPTIMIZE, 1);
    await service.refund(USER.id, AiFeature.CV_OPTIMIZE, 1);

    const summary = await service.summaryFor(USER.id);
    const feature = summary.features.find((f) => f.feature === AiFeature.CV_OPTIMIZE)!;

    // 2 used − 1 refunded = 1 used, 2 remaining. A phantom bonus would show 3.
    expect(feature.used).toBe(1);
    expect(feature.remaining).toBe(2);
    expect(summary.bonusCredits).toBe(0);
  });

  it('refund after a failed call leaves the user where they started', async () => {
    // Exactly the production scenario: 5 failures in a row.
    for (let i = 0; i < 5; i++) {
      await expect(service.consume(USER.id, AiFeature.CV_OPTIMIZE, 1)).resolves.toBeDefined();
      await service.refund(USER.id, AiFeature.CV_OPTIMIZE, 1);
    }
    const summary = await service.summaryFor(USER.id);
    const feature = summary.features.find((f) => f.feature === AiFeature.CV_OPTIMIZE)!;
    expect(feature.used).toBe(0);
    expect(feature.remaining).toBe(3);
    expect(summary.bonusCredits).toBe(0);
  });

  it('throws QUOTA_EXCEEDED once the limit is reached', async () => {
    await service.consume(USER.id, AiFeature.CV_OPTIMIZE, 1);
    await service.consume(USER.id, AiFeature.CV_OPTIMIZE, 1);
    await service.consume(USER.id, AiFeature.CV_OPTIMIZE, 1);

    await expect(service.consume(USER.id, AiFeature.CV_OPTIMIZE, 1)).rejects.toMatchObject({
      status: 429,
    });
  });

  it('granted credits do raise the ceiling', async () => {
    for (let i = 0; i < 3; i++) await service.consume(USER.id, AiFeature.CV_OPTIMIZE, 1);
    await service.grantBonus(
      USER.id,
      AiFeature.CV_OPTIMIZE,
      2,
      QuotaLedgerReason.BONUS_AD,
      'rewarded ad',
    );

    const summary = await service.summaryFor(USER.id);
    const feature = summary.features.find((f) => f.feature === AiFeature.CV_OPTIMIZE)!;
    expect(feature.remaining).toBe(2);
    expect(summary.bonusCredits).toBe(2);

    // And the extra units are actually usable.
    await expect(service.consume(USER.id, AiFeature.CV_OPTIMIZE, 1)).resolves.toBeDefined();
  });

  it('refuses to record a bonus with a usage reason', async () => {
    await expect(
      service.grantBonus(USER.id, AiFeature.CV_OPTIMIZE, 1, QuotaLedgerReason.CONSUME),
    ).rejects.toBeDefined();
  });

  it('reports a reset time in the future', async () => {
    const summary = await service.summaryFor(USER.id);
    expect(new Date(summary.resetsAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('does not block admins', async () => {
    const admin = { ...USER, role: UserRole.SUPER_ADMIN };
    const { service: adminService } = makeService();
    // Swap the user repository result for this assertion.
    (adminService as never as { users: { findOne: () => Promise<unknown> } }).users.findOne = async () =>
      admin;

    for (let i = 0; i < 10; i++) {
      await expect(adminService.consume('u-1', AiFeature.CV_OPTIMIZE, 1)).resolves.toBeDefined();
    }
  });

  it('keeps one ledger row per accounting event', async () => {
    await service.consume(USER.id, AiFeature.CV_OPTIMIZE, 1);
    await service.refund(USER.id, AiFeature.CV_OPTIMIZE, 1);
    expect(rows).toHaveLength(2);
    expect(rows[0].delta).toBe(1);
    expect(rows[1].delta).toBe(-1);
    expect(rows[1].reason).toBe(QuotaLedgerReason.REFUND);
  });
});
