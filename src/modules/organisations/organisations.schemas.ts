import { z } from 'zod';
import { paginationQuerySchema } from '../../common/pagination';

/** Shared by every route under /orgs/:orgId. */
export const orgParams = z.object({ orgId: z.uuid() });

const slug = z
  .string()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase letters, numbers and single hyphens only');

export const createOrgBody = z.object({
  name: z.string().trim().min(1).max(100),
  slug,
});

export const updateOrgBody = createOrgBody
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update');

export const listOrgsQuery = paginationQuerySchema;

export type OrgParams = z.infer<typeof orgParams>;
export type CreateOrgInput = z.infer<typeof createOrgBody>;
export type UpdateOrgInput = z.infer<typeof updateOrgBody>;
export type ListOrgsQuery = z.infer<typeof listOrgsQuery>;
