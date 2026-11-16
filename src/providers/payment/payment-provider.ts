export type CheckoutRequest = {
  orgId: string;
  planCode: string;
  /** Provider's price id for the plan (e.g. a Stripe Price). Null for the fake provider. */
  providerPriceId: string | null;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
};

/** Provider-neutral webhook event. Each provider maps its own payloads to this shape. */
export type PaymentEvent =
  | {
      id: string;
      type: 'subscription.activated';
      orgId: string;
      planCode: string;
      providerCustomerId?: string;
      providerSubscriptionId?: string;
      currentPeriodEnd?: Date;
    }
  | { id: string; type: 'subscription.canceled'; orgId: string }
  /** An event type this app does not act on. Acknowledged so the provider stops retrying. */
  | { id: string; type: 'ignored'; providerType: string };

export interface PaymentProvider {
  readonly name: 'fake' | 'stripe';
  /** HTTP header that carries the webhook signature. */
  readonly signatureHeader: string;
  createCheckout(request: CheckoutRequest): Promise<{ url: string }>;
  /** Verifies the signature over the raw body, then parses. Throws InvalidSignatureError. */
  parseWebhook(rawBody: Buffer, signature: string | undefined): PaymentEvent;
}
