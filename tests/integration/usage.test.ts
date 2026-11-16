import request from 'supertest';
import { createApp } from '../../src/app';
import { createOrg, disconnectDb, registerUser, resetDb, type TestUser } from './helpers';

const app = createApp();

let owner: TestUser;
let orgId: string;

beforeEach(async () => {
  await resetDb();
  owner = await registerUser(app, 'Owner');
  orgId = await createOrg(app, owner, 'acme');
});
afterAll(disconnectDb);

function record(metric: string, quantity: number) {
  return request(app).post(`/orgs/${orgId}/usage`).set(owner.auth).send({ metric, quantity });
}

describe('usage', () => {
  it('records usage, lists it newest first and filters by metric', async () => {
    await record('api_calls', 5).expect(201);
    await record('exports', 1).expect(201);

    const all = await request(app).get(`/orgs/${orgId}/usage`).set(owner.auth).expect(200);
    expect(all.body.data.map((r: { metric: string }) => r.metric)).toEqual([
      'exports',
      'api_calls',
    ]);

    const filtered = await request(app)
      .get(`/orgs/${orgId}/usage?metric=api_calls`)
      .set(owner.auth)
      .expect(200);
    expect(filtered.body.meta.total).toBe(1);
  });

  it('summarises this month against the plan quota', async () => {
    await record('api_calls', 250).expect(201);
    const res = await request(app).get(`/orgs/${orgId}/usage/summary`).set(owner.auth).expect(200);
    expect(res.body.data).toMatchObject({ plan: 'free', used: 250, quota: 1000, remaining: 750 });
  });

  it('blocks usage that would exceed the monthly quota', async () => {
    await record('api_calls', 1000).expect(201);
    const res = await record('api_calls', 1).expect(403);
    expect(res.body.error).toMatchObject({
      code: 'PLAN_LIMIT_EXCEEDED',
      details: { used: 1000, max: 1000 },
    });
  });
});
