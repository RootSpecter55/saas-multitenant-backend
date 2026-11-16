import Stripe from 'stripe';
import { AppError } from '../../common/errors';
import type { CheckoutRequest, PaymentEvent, PaymentProvider } from './payment-provider';

/** Stripe ids can arrive as a plain id or an expanded object. */
function idOf(value: string | { id: string } | null): string | undefined {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.id;
}

/**
 * Stripe Checkout (subscription mode) and webhook verification.
 * orgId and planCode travel in metadata, set at checkout and copied onto the subscription.
 * Not covered by the test suite: it needs a Stripe account. The fake provider is the default.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe' as const;
  readonly signatureHeader = 'stripe-signature';
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
  ) {
    this.stripe = new Stripe(secretKey);
  }

  async createCheckout(request: CheckoutRequest) {
    if (!request.providerPriceId) {
      throw new AppError(400, 'PLAN_NOT_PURCHASABLE', 'Plan has no Stripe price configured');
    }
    const metadata = { orgId: request.orgId, planCode: request.planCode };
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: request.providerPriceId, quantity: 1 }],
      customer_email: request.customerEmail,
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      metadata,
      subscription_data: { metadata },
    });
    if (!session.url) throw new AppError(502, 'CHECKOUT_FAILED', 'Stripe returned no URL');
    return { url: session.url };
  }

  parseWebhook(rawBody: Buffer, signature: string | undefined): PaymentEvent {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature ?? '', this.webhookSecret);
    } catch {
      throw new AppError(400, 'INVALID_SIGNATURE', 'Webhook signature verification failed');
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { orgId, planCode } = session.metadata ?? {};
        if (!orgId || !planCode) break;
        return {
          id: event.id,
          type: 'subscription.activated',
          orgId,
          planCode,
          providerCustomerId: idOf(session.customer),
          providerSubscriptionId: idOf(session.subscription),
        };
      }
      case 'customer.subscription.deleted': {
        const orgId = event.data.object.metadata?.orgId;
        if (!orgId) break;
        return { id: event.id, type: 'subscription.canceled', orgId };
      }
    }
    return { id: event.id, type: 'ignored', providerType: event.type };
  }
}
