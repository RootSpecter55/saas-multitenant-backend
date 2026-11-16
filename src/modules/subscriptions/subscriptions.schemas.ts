import { z } from 'zod';

export const checkoutBody = z.object({ planCode: z.string().min(1).max(50) });

export type CheckoutInput = z.infer<typeof checkoutBody>;
