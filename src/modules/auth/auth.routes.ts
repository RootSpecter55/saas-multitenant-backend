import { Router, type RequestHandler } from 'express';
import { validate } from '../../common/validate';
import type { AuthController } from './auth.controller';
import { loginBody, registerBody } from './auth.schemas';

export function authRoutes(controller: AuthController, authenticate: RequestHandler): Router {
  const router = Router();
  router.post('/register', validate({ body: registerBody }), controller.register);
  router.post('/login', validate({ body: loginBody }), controller.login);
  router.get('/me', authenticate, controller.me);
  return router;
}
