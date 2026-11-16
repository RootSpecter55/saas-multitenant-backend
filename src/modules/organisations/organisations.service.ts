import { randomUUID } from 'node:crypto';
import { isUniqueViolation, type DbContext } from '../../common/db';
import { AppError, ConflictError, NotFoundError } from '../../common/errors';
import { toPage, toSkipTake } from '../../common/pagination';
import { Role, SubscriptionStatus } from '../../generated/prisma/client';
import type { MembershipRepository } from '../memberships/memberships.repository';
import type { PlanRepository } from '../plans/plans.repository';
import type { SubscriptionRepository } from '../subscriptions/subscriptions.repository';
import type { OrganisationRepository } from './organisations.repository';
import type { CreateOrgInput, ListOrgsQuery, UpdateOrgInput } from './organisations.schemas';

const DEFAULT_PLAN_CODE = 'free';

export class OrganisationsService {
  constructor(
    private readonly db: DbContext,
    private readonly orgs: OrganisationRepository,
    private readonly memberships: MembershipRepository,
    private readonly plans: PlanRepository,
    private readonly subscriptions: SubscriptionRepository,
  ) {}

  /** Creates the org, makes the creator its owner and starts it on the free plan, atomically. */
  async create(userId: string, input: CreateOrgInput) {
    const freePlan = await this.plans.findByCode(this.db.system(), DEFAULT_PLAN_CODE);
    if (!freePlan) throw new AppError(500, 'PLANS_NOT_SEEDED', 'Run the plan seed first');

    // The id is generated here so the tenant context can be set before the row exists.
    const orgId = randomUUID();
    try {
      return await this.db.tenant(orgId, async (db) => {
        const org = await this.orgs.create(db, { id: orgId, ...input });
        await this.memberships.create(db, { orgId, userId, role: Role.OWNER });
        await this.subscriptions.create(db, {
          orgId,
          planId: freePlan.id,
          status: SubscriptionStatus.ACTIVE,
        });
        return org;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('Slug is already taken');
      throw err;
    }
  }

  /** Orgs the user belongs to, with their role. The only cross-tenant read in the app. */
  async listForUser(userId: string, query: ListOrgsQuery) {
    const { items, total } = await this.memberships.listOrgsForUser(
      this.db.system(),
      userId,
      toSkipTake(query),
    );
    const orgs = items.map(({ organisation, role }) => ({ ...organisation, role }));
    return toPage(orgs, total, query);
  }

  get(orgId: string) {
    return this.db.tenant(orgId, async (db) => {
      const org = await this.orgs.findById(db, orgId);
      if (!org) throw new NotFoundError('Organisation');
      return org;
    });
  }

  async update(orgId: string, input: UpdateOrgInput) {
    try {
      return await this.db.tenant(orgId, (db) => this.orgs.update(db, orgId, input));
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('Slug is already taken');
      throw err;
    }
  }

  /** Deleting the org cascades to its memberships, invites, subscription and usage. */
  async delete(orgId: string) {
    await this.db.tenant(orgId, (db) => this.orgs.delete(db, orgId));
  }
}
