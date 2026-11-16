import type { DbContext } from '../../common/db';
import { NotFoundError } from '../../common/errors';
import { toPage, toSkipTake } from '../../common/pagination';
import type { SubscriptionRepository } from '../subscriptions/subscriptions.repository';
import type { UsageRepository } from './usage.repository';
import type { ListUsageQuery, RecordUsageInput } from './usage.schemas';

/** Usage quotas reset on the first day of each calendar month (UTC). */
export function currentBillingPeriod(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export class UsageService {
  constructor(
    private readonly db: DbContext,
    private readonly usage: UsageRepository,
    private readonly subscriptions: SubscriptionRepository,
  ) {}

  record(orgId: string, input: RecordUsageInput) {
    return this.db.tenant(orgId, (db) => this.usage.create(db, { orgId, ...input }));
  }

  async list(orgId: string, query: ListUsageQuery) {
    const { items, total } = await this.db.tenant(orgId, (db) =>
      this.usage.list(db, {
        where: query.metric ? { metric: query.metric } : {},
        orderBy: { recordedAt: 'desc' },
        ...toSkipTake(query),
      }),
    );
    return toPage(items, total, query);
  }

  /** This month's usage against the plan's quota. */
  summary(orgId: string) {
    return this.db.tenant(orgId, async (db) => {
      const subscription = await this.subscriptions.findByOrg(db, orgId);
      if (!subscription) throw new NotFoundError('Subscription');
      const { start, end } = currentBillingPeriod();
      const used = await this.usage.sumBetween(db, start, end);
      const quota = subscription.plan.monthlyUsageQuota;
      return {
        plan: subscription.plan.code,
        periodStart: start,
        periodEnd: end,
        used,
        quota,
        remaining: Math.max(0, quota - used),
      };
    });
  }
}
