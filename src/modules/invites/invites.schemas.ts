import { z } from 'zod';
import { paginationQuerySchema } from '../../common/pagination';
import { orgParams } from '../organisations/organisations.schemas';

export const inviteParams = orgParams.extend({ inviteId: z.uuid() });

export const createInviteBody = z.object({
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  // Owners are made by promoting an existing member, never by invite.
  role: z.enum(['ADMIN', 'MEMBER']),
});

export const acceptInviteBody = z.object({ token: z.string().min(20).max(200) });

export const listInvitesQuery = paginationQuerySchema;

export type InviteParams = z.infer<typeof inviteParams>;
export type CreateInviteInput = z.infer<typeof createInviteBody>;
export type AcceptInviteInput = z.infer<typeof acceptInviteBody>;
export type ListInvitesQuery = z.infer<typeof listInvitesQuery>;
