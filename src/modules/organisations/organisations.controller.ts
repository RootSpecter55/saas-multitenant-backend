import type { Request, Response } from 'express';
import { currentUser } from '../../common/auth-middleware';
import { sendData, sendPage } from '../../common/response';
import { currentActor } from '../memberships/membership.guard';
import type { CreateOrgInput, ListOrgsQuery, UpdateOrgInput } from './organisations.schemas';
import type { OrganisationsService } from './organisations.service';

export class OrganisationsController {
  constructor(private readonly service: OrganisationsService) {}

  create = async (req: Request, res: Response) => {
    const org = await this.service.create(
      currentUser(req).id,
      req.validated.body as CreateOrgInput,
    );
    sendData(res, org, 201);
  };

  listMine = async (req: Request, res: Response) => {
    const query = req.validated.query as ListOrgsQuery;
    sendPage(res, await this.service.listForUser(currentUser(req).id, query));
  };

  get = async (req: Request, res: Response) => {
    sendData(res, await this.service.get(currentActor(req).orgId));
  };

  update = async (req: Request, res: Response) => {
    const input = req.validated.body as UpdateOrgInput;
    sendData(res, await this.service.update(currentActor(req).orgId, input));
  };

  delete = async (req: Request, res: Response) => {
    await this.service.delete(currentActor(req).orgId);
    res.status(204).end();
  };
}
