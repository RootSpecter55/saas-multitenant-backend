import type { Request, Response } from 'express';
import { sendData, sendPage } from '../../common/response';
import type { ListPlansQuery, PlanParams } from './plans.schemas';
import type { PlansService } from './plans.service';

export class PlansController {
  constructor(private readonly service: PlansService) {}

  list = async (req: Request, res: Response) => {
    sendPage(res, await this.service.list(req.validated.query as ListPlansQuery));
  };

  get = async (req: Request, res: Response) => {
    const { planId } = req.validated.params as PlanParams;
    sendData(res, await this.service.get(planId));
  };
}
