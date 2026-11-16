import { createAuthMiddleware } from './common/auth-middleware';
import { getConfig } from './common/config';
import { dbContext } from './common/db';
import { AuthController } from './modules/auth/auth.controller';
import { UserRepository } from './modules/auth/auth.repository';
import { AuthService } from './modules/auth/auth.service';
import { createAuthProvider } from './providers/auth';

/** Composition root: builds every provider, repository, service and controller in one place. */
export function buildContainer() {
  const config = getConfig();
  const authProvider = createAuthProvider(config);

  const users = new UserRepository();

  const authService = new AuthService(dbContext, users, authProvider);

  return {
    authenticate: createAuthMiddleware(authService.resolveUser),
    controllers: {
      auth: new AuthController(authService),
    },
  };
}

export type Container = ReturnType<typeof buildContainer>;
