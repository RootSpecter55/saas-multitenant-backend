import request from 'supertest';
import { createApp } from '../../src/app';
import { dbContext, getPrisma } from '../../src/common/db';
import { createOrg, disconnectDb, registerUser, resetDb, type TestUser } from './helpers';

/**
 * Proves Postgres row-level security keeps organisations apart at the database level,
 * independent of any WHERE clause in application code.
 */
const app = createApp();

let alice: TestUser;
let bob: TestUser;
let orgA: string;
let orgB: string;

beforeAll(async () => {
  await resetDb();
  alice = await registerUser(app, 'Alice');
  bob = await registerUser(app, 'Bob');
  orgA = await createOrg(app, alice, 'org-a');
  orgB = await createOrg(app, bob, 'org-b');
  // Give both orgs rows in every tenant table.
  await request(app).post(`/orgs/${orgA}/usage`).set(alice.auth).send({ metric: 'api_calls' });
  await request(app).post(`/orgs/${orgB}/usage`).set(bob.auth).send({ metric: 'api_calls' });
  await request(app)
    .post(`/orgs/${orgB}/invites`)
    .set(bob.auth)
    .send({ email: 'carol@example.com', role: 'MEMBER' });
});
afterAll(disconnectDb);

describe('row-level security', () => {
  it("cannot read another org's rows even when the query asks for them by id", async () => {
    const rows = await dbContext.tenant(orgA, async (db) => ({
      orgs: await db.organisation.findMany({ where: { id: orgB } }),
      memberships: await db.membership.findMany({ where: { orgId: orgB } }),
      invites: await db.invite.findMany({ where: { orgId: orgB } }),
      subscriptions: await db.subscription.findMany({ where: { orgId: orgB } }),
      usage: await db.usageRecord.findMany({ where: { orgId: orgB } }),
    }));

    expect(rows).toEqual({ orgs: [], memberships: [], invites: [], subscriptions: [], usage: [] });
  });

  it('only sees its own org when the query has no filter at all', async () => {
    const rows = await dbContext.tenant(orgA, async (db) => ({
      orgs: await db.organisation.findMany(),
      memberships: await db.membership.findMany(),
      usage: await db.usageRecord.findMany(),
    }));

    expect(rows.orgs.map((o) => o.id)).toEqual([orgA]);
    expect(rows.memberships.every((m) => m.orgId === orgA)).toBe(true);
    expect(rows.usage.length).toBeGreaterThan(0);
    expect(rows.usage.every((u) => u.orgId === orgA)).toBe(true);
  });

  it("rejects writing a row into another org's tenant", async () => {
    const attempt = dbContext.tenant(orgA, (db) =>
      db.usageRecord.create({ data: { orgId: orgB, metric: 'api_calls', quantity: 1 } }),
    );
    await expect(attempt).rejects.toThrow(/row-level security/);
  });

  it("cannot update or delete another org's rows", async () => {
    const result = await dbContext.tenant(orgA, async (db) => ({
      updated: await db.usageRecord.updateMany({ where: { orgId: orgB }, data: { quantity: 99 } }),
      deleted: await db.membership.deleteMany({ where: { orgId: orgB } }),
    }));
    expect(result).toEqual({ updated: { count: 0 }, deleted: { count: 0 } });
  });

  it('sees nothing when no org is set (fails closed)', async () => {
    const count = await getPrisma().$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE app_tenant`;
      return tx.membership.count();
    });
    expect(count).toBe(0);
  });

  it("returns 404 through the API for another org's resources", async () => {
    await request(app).get(`/orgs/${orgB}`).set(alice.auth).expect(404);
    await request(app).get(`/orgs/${orgB}/members`).set(alice.auth).expect(404);
    await request(app).get(`/orgs/${orgB}/usage`).set(alice.auth).expect(404);
  });
});
