import request from 'supertest';
import { createApp } from '../../src/app';
import { getPrisma } from '../../src/common/db';
import { signFakeWebhook } from '../../src/providers/payment/fake.provider';
import { createOrg, disconnectDb, registerUser, resetDb, type TestUser } from './helpers';

const app = createApp();
const SECRET = process.env.PAYMENT_WEBHOOK_SECRET!;

let owner: TestUser;
let orgId: string;

function sendWebhook(event: object, signature?: string) {
  const body = JSON.stringify(event);
  return request(app)
    .post('/webhooks/payments')
    .set('Content-Type', 'application/json')
    .set('x-fake-signature', signature ?? signFakeWebhook(body, SECRET))
    .send(body);
}

function activated(id: string, planCode = 'pro') {
  return {
    id,
    type: 'subscription.activated',
    data: { orgId, planCode, customerId: 'cus_1', subscriptionId: 'sub_1' },
  };
}

async function currentPlan() {
  const res = await request(app).get(`/orgs/${orgId}/subscription`).set(owner.auth).expect(200);
  return { plan: res.body.data.plan.code, status: res.body.data.status };
}

beforeEach(async () => {
  await resetDb();
  owner = await registerUser(app, 'Owner');
  orgId = await createOrg(app, owner, 'acme');
});
afterAll(disconnectDb);

describe('subscriptions', () => {
  it('starts every org on the free plan', async () => {
    expect(await currentPlan()).toEqual({ plan: 'free', status: 'ACTIVE' });
  });

  it('returns a checkout URL for paid plans, owner only', async () => {
    const res = await request(app)
      .post(`/orgs/${orgId}/subscription/checkout`)
      .set(owner.auth)
      .send({ planCode: 'pro' })
      .expect(201);
    expect(res.body.data.url).toContain('fake_checkout=1');

    await request(app)
      .post(`/orgs/${orgId}/subscription/checkout`)
      .set(owner.auth)
      .send({ planCode: 'free' })
      .expect(400);
  });
});

describe('payment webhooks', () => {
  it('upgrades the plan when a signed activation event arrives', async () => {
    const res = await sendWebhook(activated('evt_1')).expect(200);
    expect(res.body.data).toEqual({ status: 'processed' });
    expect(await currentPlan()).toEqual({ plan: 'pro', status: 'ACTIVE' });
  });

  it('processes a replayed event only once', async () => {
    await sendWebhook(activated('evt_1', 'pro')).expect(200);
    // A later event moves the org to business...
    await sendWebhook(activated('evt_2', 'business')).expect(200);
    // ...then evt_1 is redelivered. It must not roll the plan back to pro.
    const replay = await sendWebhook(activated('evt_1', 'pro')).expect(200);

    expect(replay.body.data).toEqual({ status: 'duplicate' });
    expect(await currentPlan()).toEqual({ plan: 'business', status: 'ACTIVE' });
    expect(await getPrisma().processedWebhookEvent.count()).toBe(2);
  });

  it('rejects an invalid signature without touching the subscription', async () => {
    const res = await sendWebhook(activated('evt_1'), 'not-the-signature').expect(400);
    expect(res.body.error.code).toBe('INVALID_SIGNATURE');
    expect(await currentPlan()).toEqual({ plan: 'free', status: 'ACTIVE' });
  });

  it('moves a canceled subscription back to the free plan', async () => {
    await sendWebhook(activated('evt_1')).expect(200);
    await sendWebhook({ id: 'evt_2', type: 'subscription.canceled', data: { orgId } }).expect(200);
    expect(await currentPlan()).toEqual({ plan: 'free', status: 'CANCELED' });
  });

  it('raises plan limits after an upgrade', async () => {
    const invite = (email: string) =>
      request(app).post(`/orgs/${orgId}/invites`).set(owner.auth).send({ email, role: 'MEMBER' });
    await invite('a@example.com').expect(201);
    await invite('b@example.com').expect(201);
    await invite('c@example.com').expect(403);

    await sendWebhook(activated('evt_1', 'pro')).expect(200);
    await invite('c@example.com').expect(201);
  });
});
