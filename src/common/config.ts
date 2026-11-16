import { z } from 'zod';

const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: z.string().url(),

    AUTH_PROVIDER: z.enum(['local', 'cognito']).default('local'),
    JWT_SECRET: z.string().min(32).optional(),
    JWT_EXPIRES_IN: z.string().default('1h'),
    COGNITO_USER_POOL_ID: z.string().optional(),
    COGNITO_CLIENT_ID: z.string().optional(),

    PAYMENT_PROVIDER: z.enum(['fake', 'stripe']).default('fake'),
    PAYMENT_WEBHOOK_SECRET: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().optional(),
    CHECKOUT_SUCCESS_URL: z.string().url(),
    CHECKOUT_CANCEL_URL: z.string().url(),

    INVITE_TTL_HOURS: z.coerce.number().int().positive().default(168),
  })
  .superRefine((env, ctx) => {
    const requireKey = (key: keyof typeof env, reason: string) => {
      if (!env[key])
        ctx.addIssue({ code: 'custom', path: [key], message: `required when ${reason}` });
    };
    if (env.AUTH_PROVIDER === 'local') requireKey('JWT_SECRET', 'AUTH_PROVIDER=local');
    if (env.AUTH_PROVIDER === 'cognito') {
      requireKey('COGNITO_USER_POOL_ID', 'AUTH_PROVIDER=cognito');
      requireKey('COGNITO_CLIENT_ID', 'AUTH_PROVIDER=cognito');
    }
    if (env.PAYMENT_PROVIDER === 'stripe')
      requireKey('STRIPE_SECRET_KEY', 'PAYMENT_PROVIDER=stripe');
  });

export type Config = z.infer<typeof configSchema>;

/** Parses and validates env vars. Throws one error listing every problem, so startup fails fast. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${problems.join('\n')}`);
  }
  return result.data;
}

// Singleton: config is read once and shared, so every module sees the same validated values.
let cached: Config | undefined;
export function getConfig(): Config {
  cached ??= loadConfig();
  return cached;
}
