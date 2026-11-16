import { z } from 'zod';
import { paginationQuerySchema } from '../../common/pagination';

const metric = z
  .string()
  .regex(/^[a-z0-9_.-]{1,64}$/, 'lowercase letters, numbers, dots, dashes and underscores');

export const recordUsageBody = z.object({
  metric,
  quantity: z.number().int().min(1).max(100_000).default(1),
});

export const listUsageQuery = paginationQuerySchema.extend({ metric: metric.optional() });

export type RecordUsageInput = z.infer<typeof recordUsageBody>;
export type ListUsageQuery = z.infer<typeof listUsageQuery>;
