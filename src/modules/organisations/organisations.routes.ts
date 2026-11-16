import { Router, type RequestHandler } from 'express';
import { validate } from '../../common/validate';
import type { RequireOrgRole } from '../memberships/membership.guard';
import type { OrganisationsController } from './organisations.controller';
import { createOrgBody, listOrgsQuery, orgParams, updateOrgBody } from './organisations.schemas';

export function organisationsRoutes(
  controller: OrganisationsController,
  authenticate: RequestHandler,
  requireOrgRole: RequireOrgRole,
): Router {
  const router = Router();
  router.use(authenticate);

  router.post('/', validate({ body: createOrgBody }), controller.create);
  router.get('/', validate({ query: listOrgsQuery }), controller.listMine);
  router.get('/:orgId', validate({ params: orgParams }), requireOrgRole('MEMBER'), controller.get);
  router.patch(
    '/:orgId',
    validate({ params: orgParams, body: updateOrgBody }),
    requireOrgRole('ADMIN'),
    controller.update,
  );
  router.delete(
    '/:orgId',
    validate({ params: orgParams }),
    requireOrgRole('OWNER'),
    controller.delete,
  );
  return router;
}
