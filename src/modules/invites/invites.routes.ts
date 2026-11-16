import { Router, type RequestHandler } from 'express';
import { validate } from '../../common/validate';
import type { RequireOrgRole } from '../memberships/membership.guard';
import { orgParams } from '../organisations/organisations.schemas';
import type { EnforcePlanLimit } from '../subscriptions/plan-limits';
import type { InvitesController } from './invites.controller';
import {
  acceptInviteBody,
  createInviteBody,
  inviteParams,
  listInvitesQuery,
} from './invites.schemas';

/** Mounted at /orgs/:orgId/invites. */
export function invitesRoutes(
  controller: InvitesController,
  authenticate: RequestHandler,
  requireOrgRole: RequireOrgRole,
  enforcePlanLimit: EnforcePlanLimit,
): Router {
  const router = Router({ mergeParams: true });
  router.use(authenticate);

  router.post(
    '/',
    validate({ params: orgParams, body: createInviteBody }),
    requireOrgRole('ADMIN'),
    enforcePlanLimit('members'),
    controller.create,
  );
  router.get(
    '/',
    validate({ params: orgParams, query: listInvitesQuery }),
    requireOrgRole('ADMIN'),
    controller.list,
  );
  router.delete(
    '/:inviteId',
    validate({ params: inviteParams }),
    requireOrgRole('ADMIN'),
    controller.revoke,
  );
  // The caller is not a member yet, so there is no role check; the service checks the token.
  router.post(
    '/accept',
    validate({ params: orgParams, body: acceptInviteBody }),
    controller.accept,
  );
  return router;
}
