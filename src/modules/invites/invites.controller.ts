import type { Request, Response } from 'express';
import { currentUser } from '../../common/auth-middleware';
import { sendData, sendPage } from '../../common/response';
import { currentActor } from '../memberships/membership.guard';
import type { OrgParams } from '../organisations/organisations.schemas';
import type {
  AcceptInviteInput,
  CreateInviteInput,
  InviteParams,
  ListInvitesQuery,
} from './invites.schemas';
import type { InvitesService } from './invites.service';

export class InvitesController {
  constructor(private readonly service: InvitesService) {}

  create = async (req: Request, res: Response) => {
    const input = req.validated.body as CreateInviteInput;
    sendData(res, await this.service.create(currentActor(req), input), 201);
  };

  list = async (req: Request, res: Response) => {
    const query = req.validated.query as ListInvitesQuery;
    sendPage(res, await this.service.list(currentActor(req).orgId, query));
  };

  revoke = async (req: Request, res: Response) => {
    const { inviteId } = req.validated.params as InviteParams;
    await this.service.revoke(currentActor(req).orgId, inviteId);
    res.status(204).end();
  };

  accept = async (req: Request, res: Response) => {
    const { orgId } = req.validated.params as OrgParams;
    const { token } = req.validated.body as AcceptInviteInput;
    sendData(res, await this.service.accept(orgId, currentUser(req), token), 201);
  };
}
