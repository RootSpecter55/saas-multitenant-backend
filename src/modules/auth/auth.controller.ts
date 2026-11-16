import type { Request, Response } from 'express';
import { currentUser } from '../../common/auth-middleware';
import { sendData } from '../../common/response';
import type { LoginInput, RegisterInput } from './auth.schemas';
import type { AuthService } from './auth.service';

export class AuthController {
  constructor(private readonly service: AuthService) {}

  register = async (req: Request, res: Response) => {
    sendData(res, await this.service.register(req.validated.body as RegisterInput), 201);
  };

  login = async (req: Request, res: Response) => {
    sendData(res, await this.service.login(req.validated.body as LoginInput));
  };

  me = async (req: Request, res: Response) => {
    sendData(res, await this.service.me(currentUser(req).id));
  };
}
