import { FakePaymentProvider, signFakeWebhook } from '../../src/providers/payment/fake.provider';

const SECRET = 'unit-secret';
const ORG = '7f1c1e2a-9a39-4c55-8a3b-0d2d7d0d8e11';
const provider = new FakePaymentProvider(SECRET);

describe('FakePaymentProvider.parseWebhook', () => {
  const body = Buffer.from(
    JSON.stringify({
      id: 'evt_1',
      type: 'subscription.activated',
      data: { orgId: ORG, planCode: 'pro' },
    }),
  );

  it('accepts a correctly signed body', () => {
    expect(provider.parseWebhook(body, signFakeWebhook(body, SECRET))).toMatchObject({
      id: 'evt_1',
      type: 'subscription.activated',
      orgId: ORG,
      planCode: 'pro',
    });
  });

  it('rejects a body signed with another secret', () => {
    expect(() => provider.parseWebhook(body, signFakeWebhook(body, 'other'))).toThrow(
      'Webhook signature verification failed',
    );
  });

  it('rejects a body changed after signing', () => {
    const signature = signFakeWebhook(body, SECRET);
    const tampered = Buffer.from(body.toString().replace('pro', 'business'));
    expect(() => provider.parseWebhook(tampered, signature)).toThrow(/signature/);
  });

  it('rejects a missing signature', () => {
    expect(() => provider.parseWebhook(body, undefined)).toThrow(/signature/);
  });
});
