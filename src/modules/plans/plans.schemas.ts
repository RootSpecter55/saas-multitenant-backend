import { z } from 'zod';
import { paginationQuerySchema } from '../../common/pagination';

export const planParams = z.object({ planId: z.uuid() });
export const listPlansQuery = paginationQuerySchema;

export type PlanParams = z.infer<typeof planParams>;
export type ListPlansQuery = z.infer<typeof listPlansQuery>;
