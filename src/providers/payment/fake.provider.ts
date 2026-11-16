import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../common/errors';
import type { CheckoutRequest, PaymentEvent, PaymentProvider } from './payment-provider';

/** HMAC-SHA256 of the raw body, hex encoded. Exported for tests and the dev webhook script. */
export function signFakeWebhook(rawBody: string | Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

const fakeEventSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string().min(1),
    type: z.literal('subscription.activated'),
    data: z.object({
      orgId: z.uuid(),
      planCode: z.string().min(1),
      customerId: z.string().optional(),
      subscriptionId: z.string().optional(),
      currentPeriodEnd: z.iso.datetime().optional(),
    }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('subscription.canceled'),
    data: z.object({ orgId: z.uuid() }),
  }),
]);

/**
 * Local stand-in for a payment provider: no account or network needed.
 * Signatures are real HMACs, so webhook verification is exercised the same way as with Stripe.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake' as const;
  readonly signatureHeader = 'x-fake-signature';

  constructor(private readonly webhookSecret: string) {}

  async createCheckout(request: CheckoutRequest) {
    const params = new URLSearchParams({ org: request.orgId, plan: request.planCode });
    return { url: `${request.successUrl}?fake_checkout=1&${params.toString()}` };
  }

  parseWebhook(rawBody: Buffer, signature: string | undefined): PaymentEvent {
    const expected = Buffer.from(signFakeWebhook(rawBody, this.webhookSecret));
    const given = Buffer.from(signature ?? '');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new AppError(400, 'INVALID_SIGNATURE', 'Webhook signature verification failed');
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new AppError(400, 'INVALID_WEBHOOK', 'Webhook body is not valid JSON');
    }
    const parsed = fakeEventSchema.safeParse(json);
    if (!parsed.success) {
      throw new AppError(
        400,
        'INVALID_WEBHOOK',
        'Unrecognised webhook payload',
        parsed.error.issues,
      );
    }
    const event = parsed.data;
    if (event.type === 'subscription.canceled') {
      return { id: event.id, type: event.type, orgId: event.data.orgId };
    }
    return {
      id: event.id,
      type: event.type,
      orgId: event.data.orgId,
      planCode: event.data.planCode,
      providerCustomerId: event.data.customerId,
      providerSubscriptionId: event.data.subscriptionId,
      currentPeriodEnd: event.data.currentPeriodEnd
        ? new Date(event.data.currentPeriodEnd)
        : undefined,
    };
  }
}
