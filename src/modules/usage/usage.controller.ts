import type { Request, Response } from 'express';
import { sendData, sendPage } from '../../common/response';
import { currentActor } from '../memberships/membership.guard';
import type { ListUsageQuery, RecordUsageInput } from './usage.schemas';
import type { UsageService } from './usage.service';

export class UsageController {
  constructor(private readonly service: UsageService) {}

  record = async (req: Request, res: Response) => {
    const input = req.validated.body as RecordUsageInput;
    sendData(res, await this.service.record(currentActor(req).orgId, input), 201);
  };

  list = async (req: Request, res: Response) => {
    const query = req.validated.query as ListUsageQuery;
    sendPage(res, await this.service.list(currentActor(req).orgId, query));
  };

  summary = async (req: Request, res: Response) => {
    sendData(res, await this.service.summary(currentActor(req).orgId));
  };
}
