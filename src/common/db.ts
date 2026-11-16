import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { getConfig } from './config';

// Singleton: one PrismaClient means one connection pool for the whole process.
let client: PrismaClient | undefined;
export function getPrisma(): PrismaClient {
  client ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: getConfig().DATABASE_URL }),
  });
  return client;
}

/** A database handle that services pass to repositories: the root client or a transaction. */
export type Db = PrismaClient | Prisma.TransactionClient;

export interface DbContext {
  /**
   * Runs `fn` in a transaction where Postgres row-level security only exposes rows of `orgId`.
   * `SET LOCAL ROLE app_tenant` drops superuser/owner rights (which would bypass RLS), and
   * `set_config(..., true)` sets the org for this transaction only. Both reset on commit/rollback.
   */
  tenant<T>(orgId: string, fn: (db: Db) => Promise<T>): Promise<T>;
  /** Handle for global tables (users, plans, webhook events) and the one cross-tenant read. */
  system(): Db;
}

export const dbContext: DbContext = {
  tenant: (orgId, fn) =>
    getPrisma().$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE app_tenant`;
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
      return fn(tx);
    }),
  system: () => getPrisma(),
};

/** True when a Prisma error is a unique-constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
