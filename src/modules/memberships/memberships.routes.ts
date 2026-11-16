import { Router, type RequestHandler } from 'express';
import { validate } from '../../common/validate';
import type { RequireOrgRole } from './membership.guard';
import type { MembershipsController } from './memberships.controller';
import { orgParams } from '../organisations/organisations.schemas';
import { changeRoleBody, listMembersQuery, memberParams } from './memberships.schemas';

/** Mounted at /orgs/:orgId/members. */
export function membershipsRoutes(
  controller: MembershipsController,
  authenticate: RequestHandler,
  requireOrgRole: RequireOrgRole,
): Router {
  const router = Router({ mergeParams: true });
  router.use(authenticate);

  router.get(
    '/',
    validate({ params: orgParams, query: listMembersQuery }),
    requireOrgRole('MEMBER'),
    controller.list,
  );
  router.patch(
    '/:memberId',
    validate({ params: memberParams, body: changeRoleBody }),
    requireOrgRole('ADMIN'),
    controller.changeRole,
  );
  // Any member may call this; the service allows self-removal or admin removal.
  router.delete(
    '/:memberId',
    validate({ params: memberParams }),
    requireOrgRole('MEMBER'),
    controller.remove,
  );
  return router;
}
