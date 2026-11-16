import type { Request, Response } from 'express';
import { sendData, sendPage } from '../../common/response';
import { currentActor } from './membership.guard';
import type { ChangeRoleInput, ListMembersQuery, MemberParams } from './memberships.schemas';
import type { MembershipsService } from './memberships.service';

export class MembershipsController {
  constructor(private readonly service: MembershipsService) {}

  list = async (req: Request, res: Response) => {
    const actor = currentActor(req);
    sendPage(res, await this.service.list(actor.orgId, req.validated.query as ListMembersQuery));
  };

  changeRole = async (req: Request, res: Response) => {
    const { memberId } = req.validated.params as MemberParams;
    const { role } = req.validated.body as ChangeRoleInput;
    sendData(res, await this.service.changeRole(currentActor(req), memberId, role));
  };

  remove = async (req: Request, res: Response) => {
    const { memberId } = req.validated.params as MemberParams;
    await this.service.remove(currentActor(req), memberId);
    res.status(204).end();
  };
}
