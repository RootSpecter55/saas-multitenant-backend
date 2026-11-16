import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import { errorHandler, notFoundHandler } from './common/error-handler';
import { logger } from './common/logger';
import { sendData } from './common/response';
import { buildContainer, type Container } from './container';
import { authRoutes } from './modules/auth/auth.routes';
import { invitesRoutes } from './modules/invites/invites.routes';
import { membershipsRoutes } from './modules/memberships/memberships.routes';
import { organisationsRoutes } from './modules/organisations/organisations.routes';
import { plansRoutes } from './modules/plans/plans.routes';
import { subscriptionsRoutes, webhooksRoutes } from './modules/subscriptions/subscriptions.routes';
import { usageRoutes } from './modules/usage/usage.routes';

export function createApp(container: Container = buildContainer()): Express {
  const { controllers: c, authenticate, requireOrgRole, enforcePlanLimit } = container;
  const app = express();
  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => sendData(res, { status: 'ok' }));

  // Before express.json(): webhook signatures are verified over the raw body.
  app.use('/webhooks', webhooksRoutes(c.subscriptions));

  app.use(express.json({ limit: '100kb' }));

  app.use('/auth', authRoutes(c.auth, authenticate));
  app.use('/plans', plansRoutes(c.plans));
  // Nested org routers first: each authenticates once and ends the request.
  app.use('/orgs/:orgId/members', membershipsRoutes(c.memberships, authenticate, requireOrgRole));
  app.use(
    '/orgs/:orgId/invites',
    invitesRoutes(c.invites, authenticate, requireOrgRole, enforcePlanLimit),
  );
  app.use(
    '/orgs/:orgId/usage',
    usageRoutes(c.usage, authenticate, requireOrgRole, enforcePlanLimit),
  );
  app.use(
    '/orgs/:orgId/subscription',
    subscriptionsRoutes(c.subscriptions, authenticate, requireOrgRole),
  );
  app.use('/orgs', organisationsRoutes(c.organisations, authenticate, requireOrgRole));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
