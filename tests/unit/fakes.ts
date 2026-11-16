import type { Db, DbContext } from '../../src/common/db';

/** A DbContext for unit tests: services run their callbacks directly, repositories are mocked. */
export function fakeDbContext(): DbContext {
  const db = {} as Db;
  return {
    tenant: (_orgId, fn) => fn(db),
    system: () => db,
  };
}

/** Builds an object whose listed methods are jest mocks, typed as the real class. */
export function mockOf<T>(...methods: (keyof T)[]): jest.Mocked<T> {
  return Object.fromEntries(methods.map((m) => [m, jest.fn()])) as unknown as jest.Mocked<T>;
}
