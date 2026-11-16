import { Prisma } from '../../src/generated/prisma/client';
import type { PlanRepository } from '../../src/modules/plans/plans.repository';
import type {
  ProcessedWebhookEventRepository,
  SubscriptionRepository,
} from '../../src/modules/subscriptions/subscriptions.repository';
import { SubscriptionsService } from '../../src/modules/subscriptions/subscriptions.service';
import type { PaymentEvent, PaymentProvider } from '../../src/providers/payment';
import { fakeDbContext, mockOf } from './fakes';

const ORG = '7f1c1e2a-9a39-4c55-8a3b-0d2d7d0d8e11';

function providerReturning(event: PaymentEvent): PaymentProvider {
  return {
    name: 'fake',
    signatureHeader: 'x-fake-signature',
    createCheckout: jest.fn(),
    parseWebhook: () => event,
  };
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('SubscriptionsService.handleWebhook', () => {
  let subscriptions: jest.Mocked<SubscriptionRepository>;
  let plans: jest.Mocked<PlanRepository>;
  let events: jest.Mocked<ProcessedWebhookEventRepository>;

  const activation: PaymentEvent = {
    id: 'evt_1',
    type: 'subscription.activated',
    orgId: ORG,
    planCode: 'pro',
  };
  const urls = { successUrl: 'http://x/s', cancelUrl: 'http://x/c' };

  beforeEach(() => {
    subscriptions = mockOf<SubscriptionRepository>('findByOrg', 'updateByOrg');
    plans = mockOf<PlanRepository>('findByCode');
    events = mockOf<ProcessedWebhookEventRepository>('create');
    subscriptions.findByOrg.mockResolvedValue({ id: 'sub-1' } as never);
    plans.findByCode.mockResolvedValue({ id: 'plan-pro', code: 'pro' } as never);
  });

  function service(event: PaymentEvent) {
    return new SubscriptionsService(
      fakeDbContext(),
      subscriptions,
      plans,
      events,
      providerReturning(event),
      urls,
    );
  }

  it('records the event id, then applies the change', async () => {
    const result = await service(activation).handleWebhook(Buffer.from('{}'), 'sig');

    expect(result).toEqual({ status: 'processed' });
    expect(events.create).toHaveBeenCalledWith(expect.anything(), {
      provider: 'fake',
      eventId: 'evt_1',
      type: 'subscription.activated',
    });
    expect(subscriptions.updateByOrg).toHaveBeenCalledWith(
      expect.anything(),
      ORG,
      expect.objectContaining({ planId: 'plan-pro', status: 'ACTIVE' }),
    );
  });

  it('reports a duplicate and applies nothing when the event id already exists', async () => {
    events.create.mockRejectedValue(uniqueViolation());

    const result = await service(activation).handleWebhook(Buffer.from('{}'), 'sig');

    expect(result).toEqual({ status: 'duplicate' });
    expect(subscriptions.updateByOrg).not.toHaveBeenCalled();
  });

  it('acknowledges event types it does not handle', async () => {
    const result = await service({
      id: 'evt_9',
      type: 'ignored',
      providerType: 'invoice.created',
    }).handleWebhook(Buffer.from('{}'), 'sig');

    expect(result).toEqual({ status: 'ignored' });
    expect(events.create).not.toHaveBeenCalled();
  });
});
