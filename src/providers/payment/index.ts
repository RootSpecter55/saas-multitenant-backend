import type { Config } from '../../common/config';
import { FakePaymentProvider } from './fake.provider';
import type { PaymentProvider } from './payment-provider';
import { StripePaymentProvider } from './stripe.provider';

export * from './payment-provider';

// Factory: picks the payment implementation from config, so the rest of the app is provider-agnostic.
export function createPaymentProvider(config: Config): PaymentProvider {
  if (config.PAYMENT_PROVIDER === 'stripe') {
    // Presence is guaranteed by the config schema when PAYMENT_PROVIDER=stripe.
    return new StripePaymentProvider(config.STRIPE_SECRET_KEY!, config.PAYMENT_WEBHOOK_SECRET);
  }
  return new FakePaymentProvider(config.PAYMENT_WEBHOOK_SECRET);
}
