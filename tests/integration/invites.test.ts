import request from 'supertest';
import { createApp } from '../../src/app';
import { getPrisma } from '../../src/common/db';
import { createOrg, disconnectDb, registerUser, resetDb, type TestUser } from './helpers';

const app = createApp();

let owner: TestUser;
let orgId: string;

async function invite(email: string, role = 'MEMBER') {
  return request(app).post(`/orgs/${orgId}/invites`).set(owner.auth).send({ email, role });
}

beforeEach(async () => {
  await resetDb();
  owner = await registerUser(app, 'Owner');
  orgId = await createOrg(app, owner, 'acme');
});
afterAll(disconnectDb);

describe('invites', () => {
  it('invites a user who then accepts and becomes a member', async () => {
    const created = await invite('carol@example.com', 'ADMIN');
    expect(created.status).toBe(201);
    expect(created.body.data.invite).toMatchObject({
      email: 'carol@example.com',
      status: 'pending',
    });
    expect(created.body.data.invite).not.toHaveProperty('tokenHash');

    const carol = await registerUser(app, 'Carol');
    const accepted = await request(app)
      .post(`/orgs/${orgId}/invites/accept`)
      .set(carol.auth)
      .send({ token: created.body.data.token })
      .expect(201);
    expect(accepted.body.data).toMatchObject({ userId: carol.id, role: 'ADMIN' });

    await request(app).get(`/orgs/${orgId}`).set(carol.auth).expect(200);
  });

  it('stores only a hash of the token', async () => {
    const created = await invite('carol@example.com');
    const row = await getPrisma().invite.findFirstOrThrow();
    expect(row.tokenHash).not.toBe(created.body.data.token);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects an invite used by someone with a different email', async () => {
    const created = await invite('carol@example.com');
    const mallory = await registerUser(app, 'Mallory');
    await request(app)
      .post(`/orgs/${orgId}/invites/accept`)
      .set(mallory.auth)
      .send({ token: created.body.data.token })
      .expect(403);
  });

  it('rejects an expired or already used invite', async () => {
    const created = await invite('carol@example.com');
    const carol = await registerUser(app, 'Carol');
    const accept = () =>
      request(app)
        .post(`/orgs/${orgId}/invites/accept`)
        .set(carol.auth)
        .send({ token: created.body.data.token });

    await getPrisma().invite.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await accept()).status).toBe(410);

    await getPrisma().invite.updateMany({ data: { expiresAt: new Date(Date.now() + 60_000) } });
    expect((await accept()).status).toBe(201);
    expect((await accept()).status).toBe(409);
  });

  it('rejects a duplicate pending invite and lets admins revoke one', async () => {
    const created = await invite('carol@example.com');
    expect((await invite('carol@example.com')).status).toBe(409);

    await request(app)
      .delete(`/orgs/${orgId}/invites/${created.body.data.invite.id}`)
      .set(owner.auth)
      .expect(204);
    const list = await request(app).get(`/orgs/${orgId}/invites`).set(owner.auth).expect(200);
    expect(list.body.meta.total).toBe(0);
  });

  it('enforces the plan member limit, counting pending invites as seats', async () => {
    // Free plan allows 3 members: the owner plus 2 invites.
    expect((await invite('a@example.com')).status).toBe(201);
    expect((await invite('b@example.com')).status).toBe(201);

    const third = await invite('c@example.com');
    expect(third.status).toBe(403);
    expect(third.body.error).toEqual({
      code: 'PLAN_LIMIT_EXCEEDED',
      message: 'Plan limit reached: members',
      details: { used: 3, max: 3 },
    });
  });
});
