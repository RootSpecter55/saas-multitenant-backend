import type { RequestHandler } from 'express';
import { UnauthorizedError } from './errors';

export type AuthUser = { id: string; email: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Turns a bearer token into a user. Supplied by the auth module, so this file stays provider-agnostic. */
export type ResolveUser = (token: string) => Promise<AuthUser>;

export function createAuthMiddleware(resolveUser: ResolveUser): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return next(new UnauthorizedError());
    try {
      req.user = await resolveUser(header.slice('Bearer '.length));
      next();
    } catch {
      next(new UnauthorizedError('Invalid or expired token'));
    }
  };
}

/** The authenticated user. Only call after the auth middleware has run. */
export function currentUser(req: Express.Request): AuthUser {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}
