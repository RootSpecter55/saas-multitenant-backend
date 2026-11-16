import { z } from 'zod';

const email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

export const registerBody = z.object({
  email,
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(128),
});

export const loginBody = z.object({
  email,
  password: z.string().min(1).max(128),
});

export type RegisterInput = z.infer<typeof registerBody>;
export type LoginInput = z.infer<typeof loginBody>;
