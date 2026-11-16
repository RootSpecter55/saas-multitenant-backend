import type { Request, Response } from 'express';
import { currentUser } from '../../common/auth-middleware';
import { AppError } from '../../common/errors';
import { sendData } from '../../common/response';
import { currentActor } from '../memberships/membership.guard';
import type { CheckoutInput } from './subscriptions.schemas';
import type { SubscriptionsService } from './subscriptions.service';

export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  get = async (req: Request, res: Response) => {
    sendData(res, await this.service.get(currentActor(req).orgId));
  };

  checkout = async (req: Request, res: Response) => {
    const { planCode } = req.validated.body as CheckoutInput;
    const result = await this.service.checkout(currentActor(req).orgId, currentUser(req), planCode);
    sendData(res, result, 201);
  };

  /** Needs the raw body: signatures are computed over the exact bytes the provider sent. */
  webhook = async (req: Request, res: Response) => {
    if (!Buffer.isBuffer(req.body)) {
      throw new AppError(400, 'INVALID_WEBHOOK', 'Expected a raw request body');
    }
    const signature = req.get(this.service.signatureHeader);
    sendData(res, await this.service.handleWebhook(req.body, signature));
  };
}
