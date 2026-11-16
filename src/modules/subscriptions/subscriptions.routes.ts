import express, { Router, type RequestHandler } from 'express';
import { validate } from '../../common/validate';
import type { RequireOrgRole } from '../memberships/membership.guard';
import { orgParams } from '../organisations/organisations.schemas';
import type { SubscriptionsController } from './subscriptions.controller';
import { checkoutBody } from './subscriptions.schemas';

/** Mounted at /orgs/:orgId/subscription. */
export function subscriptionsRoutes(
  controller: SubscriptionsController,
  authenticate: RequestHandler,
  requireOrgRole: RequireOrgRole,
): Router {
  const router = Router({ mergeParams: true });
  router.use(authenticate);

  router.get('/', validate({ params: orgParams }), requireOrgRole('MEMBER'), controller.get);
  router.post(
    '/checkout',
    validate({ params: orgParams, body: checkoutBody }),
    requireOrgRole('OWNER'),
    controller.checkout,
  );
  return router;
}

/**
 * Mounted at /webhooks, before the global JSON parser, so the body stays raw bytes.
 * No auth: the provider's signature is the authentication.
 */
export function webhooksRoutes(controller: SubscriptionsController): Router {
  const router = Router();
  router.post('/payments', express.raw({ type: '*/*', limit: '1mb' }), controller.webhook);
  return router;
}
