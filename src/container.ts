import { createAuthMiddleware } from './common/auth-middleware';
import { getConfig } from './common/config';
import { dbContext } from './common/db';
import { AuthController } from './modules/auth/auth.controller';
import { UserRepository } from './modules/auth/auth.repository';
import { AuthService } from './modules/auth/auth.service';
import { InvitesController } from './modules/invites/invites.controller';
import { InviteRepository } from './modules/invites/invites.repository';
import { InvitesService } from './modules/invites/invites.service';
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
import { createEnforcePlanLimit, PlanLimitService } from './modules/subscriptions/plan-limits';
import { SubscriptionsController } from './modules/subscriptions/subscriptions.controller';
import {
  ProcessedWebhookEventRepository,
  SubscriptionRepository,
} from './modules/subscriptions/subscriptions.repository';
import { SubscriptionsService } from './modules/subscriptions/subscriptions.service';
import { UsageController } from './modules/usage/usage.controller';
import { UsageRepository } from './modules/usage/usage.repository';
import { UsageService } from './modules/usage/usage.service';
import { createAuthProvider } from './providers/auth';
import { createPaymentProvider } from './providers/payment';

/** Composition root: builds every provider, repository, service and controller in one place. */
export function buildContainer() {
  const config = getConfig();
  const authProvider = createAuthProvider(config);
  const paymentProvider = createPaymentProvider(config);

  const repos = {
    users: new UserRepository(),
    orgs: new OrganisationRepository(),
    memberships: new MembershipRepository(),
    plans: new PlanRepository(),
    subscriptions: new SubscriptionRepository(),
    invites: new InviteRepository(),
    usage: new UsageRepository(),
    webhookEvents: new ProcessedWebhookEventRepository(),
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
  const invitesService = new InvitesService(
    dbContext,
    repos.invites,
    repos.memberships,
    repos.users,
    config.INVITE_TTL_HOURS,
  );
  const usageService = new UsageService(dbContext, repos.usage, repos.subscriptions);
  const subscriptionsService = new SubscriptionsService(
    dbContext,
    repos.subscriptions,
    repos.plans,
    repos.webhookEvents,
    paymentProvider,
    { successUrl: config.CHECKOUT_SUCCESS_URL, cancelUrl: config.CHECKOUT_CANCEL_URL },
  );
  const planLimitService = new PlanLimitService(
    dbContext,
    repos.subscriptions,
    repos.memberships,
    repos.invites,
    repos.usage,
  );

  return {
    authenticate: createAuthMiddleware(authService.resolveUser),
    requireOrgRole: createRequireOrgRole(membershipsService),
    enforcePlanLimit: createEnforcePlanLimit(planLimitService),
    controllers: {
      auth: new AuthController(authService),
      organisations: new OrganisationsController(organisationsService),
      memberships: new MembershipsController(membershipsService),
      plans: new PlansController(plansService),
      invites: new InvitesController(invitesService),
      usage: new UsageController(usageService),
      subscriptions: new SubscriptionsController(subscriptionsService),
    },
  };
}

export type Container = ReturnType<typeof buildContainer>;
