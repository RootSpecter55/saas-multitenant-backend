import type { RequestHandler } from 'express';
import { currentUser } from '../../common/auth-middleware';
import { ForbiddenError, NotFoundError } from '../../common/errors';
import type { Role } from '../../generated/prisma/client';
import { hasRole, type Actor, type MembershipsService } from './memberships.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}

export type RequireOrgRole = (minimum: Role) => RequestHandler;

/**
 * Checks the caller belongs to `:orgId` with at least `minimum` role, then sets `req.actor`.
 * Non-members get 404 rather than 403 so org ids cannot be probed.
 * Must run after authentication and after params validation (orgId is a valid uuid).
 */
export function createRequireOrgRole(memberships: MembershipsService): RequireOrgRole {
  return (minimum) => async (req, _res, next) => {
    const { orgId } = req.validated.params as { orgId: string };
    const user = currentUser(req);
    const membership = await memberships.findMembership(orgId, user.id);
    if (!membership) return next(new NotFoundError('Organisation'));
    if (!hasRole(membership.role, minimum)) {
      return next(new ForbiddenError(`Requires ${minimum.toLowerCase()} role or higher`));
    }
    req.actor = { orgId, userId: user.id, role: membership.role };
    next();
  };
}

/** The caller's membership. Only call after requireOrgRole has run. */
export function currentActor(req: Express.Request): Actor {
  if (!req.actor) throw new ForbiddenError();
  return req.actor;
}
