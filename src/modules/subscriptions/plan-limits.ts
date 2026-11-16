import type { Request, RequestHandler } from 'express';
import type { DbContext } from '../../common/db';
import { NotFoundError, PlanLimitError } from '../../common/errors';
import type { InviteRepository } from '../invites/invites.repository';
import { currentActor } from '../memberships/membership.guard';
import type { MembershipRepository } from '../memberships/memberships.repository';
import type { UsageRepository } from '../usage/usage.repository';
import { currentBillingPeriod } from '../usage/usage.service';
import type { SubscriptionRepository } from './subscriptions.repository';

export type PlanLimit = 'members' | 'monthlyUsage';

export class PlanLimitService {
  constructor(
    private readonly db: DbContext,
    private readonly subscriptions: SubscriptionRepository,
    private readonly memberships: MembershipRepository,
    private readonly invites: InviteRepository,
    private readonly usage: UsageRepository,
  ) {}

  /** Throws PlanLimitError if adding `requested` units would go over the org's plan. */
  check(orgId: string, limit: PlanLimit, requested: number) {
    return this.db.tenant(orgId, async (db) => {
      const subscription = await this.subscriptions.findByOrg(db, orgId);
      if (!subscription) throw new NotFoundError('Subscription');
      const { plan } = subscription;

      let used: number;
      let max: number;
      if (limit === 'members') {
        // Pending invites count as seats, so accepting one never needs a second check.
        used =
          (await this.memberships.countAll(db)) + (await this.invites.countPending(db, new Date()));
        max = plan.maxMembers;
      } else {
        const { start, end } = currentBillingPeriod();
        used = await this.usage.sumBetween(db, start, end);
        max = plan.monthlyUsageQuota;
      }

      if (used + requested > max) throw new PlanLimitError(limit, { used, max });
    });
  }
}

export type EnforcePlanLimit = (
  limit: PlanLimit,
  requested?: (req: Request) => number,
) => RequestHandler;

/** Middleware factory. Runs after requireOrgRole, so the org is known and access is checked. */
export function createEnforcePlanLimit(service: PlanLimitService): EnforcePlanLimit {
  return (limit, requested = () => 1) =>
    async (req, _res, next) => {
      await service.check(currentActor(req).orgId, limit, requested(req));
      next();
    };
}
