import { createAuthMiddleware } from './common/auth-middleware';
import { getConfig } from './common/config';
import { dbContext } from './common/db';
import { AuthController } from './modules/auth/auth.controller';
import { UserRepository } from './modules/auth/auth.repository';
import { AuthService } from './modules/auth/auth.service';
import { createRequireOrgRole } from './modules/memberships/membership.guard';
import { MembershipsController } from './modules/memberships/memberships.controller';
import { MembershipRepository } from './modules/memberships/memberships.repository';
import { MembershipsService } from './modules/memberships/memberships.service';
import { OrganisationsController } from './modules/organisations/organisations.controller';
import { OrganisationRepository } from './modules/organisations/organisations.repository';
import { OrganisationsService } from './modules/organisations/organisations.service';
import { PlansController } from './modules/plans/plans.controller';
import { PlanRepository } from './modules/plans/plans.repository';
import { PlansService } from './modules/plans/plans.service';
import { SubscriptionRepository } from './modules/subscriptions/subscriptions.repository';
import { createAuthProvider } from './providers/auth';

/** Composition root: builds every provider, repository, service and controller in one place. */
export function buildContainer() {
  const config = getConfig();
  const authProvider = createAuthProvider(config);

  const repos = {
    users: new UserRepository(),
    orgs: new OrganisationRepository(),
    memberships: new MembershipRepository(),
    plans: new PlanRepository(),
    subscriptions: new SubscriptionRepository(),
  };

  const authService = new AuthService(dbContext, repos.users, authProvider);
  const membershipsService = new MembershipsService(dbContext, repos.memberships);
  const organisationsService = new OrganisationsService(
    dbContext,
    repos.orgs,
    repos.memberships,
    repos.plans,
    repos.subscriptions,
  );
  const plansService = new PlansService(dbContext, repos.plans);

  return {
    authenticate: createAuthMiddleware(authService.resolveUser),
    requireOrgRole: createRequireOrgRole(membershipsService),
    controllers: {
      auth: new AuthController(authService),
      organisations: new OrganisationsController(organisationsService),
      memberships: new MembershipsController(membershipsService),
      plans: new PlansController(plansService),
    },
  };
}

export type Container = ReturnType<typeof buildContainer>;
