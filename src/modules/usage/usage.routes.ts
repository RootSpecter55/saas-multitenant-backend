import { Router, type RequestHandler } from 'express';
import { validate } from '../../common/validate';
import type { RequireOrgRole } from '../memberships/membership.guard';
import { orgParams } from '../organisations/organisations.schemas';
import type { EnforcePlanLimit } from '../subscriptions/plan-limits';
import type { UsageController } from './usage.controller';
import { listUsageQuery, recordUsageBody, type RecordUsageInput } from './usage.schemas';

/** Mounted at /orgs/:orgId/usage. */
export function usageRoutes(
  controller: UsageController,
  authenticate: RequestHandler,
  requireOrgRole: RequireOrgRole,
  enforcePlanLimit: EnforcePlanLimit,
): Router {
  const router = Router({ mergeParams: true });
  router.use(authenticate);

  router.post(
    '/',
    validate({ params: orgParams, body: recordUsageBody }),
    requireOrgRole('MEMBER'),
    enforcePlanLimit('monthlyUsage', (req) => (req.validated.body as RecordUsageInput).quantity),
    controller.record,
  );
  router.get(
    '/',
    validate({ params: orgParams, query: listUsageQuery }),
    requireOrgRole('MEMBER'),
    controller.list,
  );
  router.get(
    '/summary',
    validate({ params: orgParams }),
    requireOrgRole('MEMBER'),
    controller.summary,
  );
  return router;
}
