import { z } from 'zod';
import { paginationQuerySchema } from '../../common/pagination';
import { Role } from '../../generated/prisma/client';
import { orgParams } from '../organisations/organisations.schemas';

export const memberParams = orgParams.extend({ memberId: z.uuid() });
export const listMembersQuery = paginationQuerySchema;
export const changeRoleBody = z.object({ role: z.enum(Role) });

export type MemberParams = z.infer<typeof memberParams>;
export type ListMembersQuery = z.infer<typeof listMembersQuery>;
export type ChangeRoleInput = z.infer<typeof changeRoleBody>;
