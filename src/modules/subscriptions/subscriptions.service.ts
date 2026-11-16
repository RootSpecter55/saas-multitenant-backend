import type { AuthUser } from '../../common/auth-middleware';
import { isUniqueViolation, type Db, type DbContext } from '../../common/db';
import { AppError, NotFoundError } from '../../common/errors';
import { SubscriptionStatus } from '../../generated/prisma/client';
import type { PaymentEvent, PaymentProvider } from '../../providers/payment';
import type { PlanRepository } from '../plans/plans.repository';
import type {
  ProcessedWebhookEventRepository,
  SubscriptionRepository,
} from './subscriptions.repository';

export type WebhookResult = { status: 'processed' | 'duplicate' | 'ignored' };

export class SubscriptionsService {
  constructor(
    private readonly db: DbContext,
    private readonly subscriptions: SubscriptionRepository,
    private readonly plans: PlanRepository,
    private readonly webhookEvents: ProcessedWebhookEventRepository,
    private readonly provider: PaymentProvider,
    private readonly urls: { successUrl: string; cancelUrl: string },
  ) {}

  get signatureHeader(): string {
    return this.provider.signatureHeader;
  }

  get(orgId: string) {
    return this.db.tenant(orgId, async (db) => {
      const subscription = await this.subscriptions.findByOrg(db, orgId);
      if (!subscription) throw new NotFoundError('Subscription');
      return subscription;
    });
  }

  /** Starts a provider checkout. The subscription changes only when the webhook confirms payment. */
  async checkout(orgId: string, user: AuthUser, planCode: string) {
    const plan = await this.plans.findByCode(this.db.system(), planCode);
    if (!plan) throw new NotFoundError('Plan');
    if (plan.priceCents === 0) {
      throw new AppError(400, 'PLAN_NOT_PURCHASABLE', 'The free plan does not need checkout');
    }
    return this.provider.createCheckout({
      orgId,
      planCode: plan.code,
      providerPriceId: plan.providerPriceId,
      customerEmail: user.email,
      successUrl: this.urls.successUrl,
      cancelUrl: this.urls.cancelUrl,
    });
  }

  /**
   * Idempotent webhook handling. The event id is inserted under a unique (provider, event_id)
   * constraint in the same transaction as the subscription change. A replayed event fails that
   * insert, the transaction rolls back, and nothing is applied twice.
   */
  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<WebhookResult> {
    const event = this.provider.parseWebhook(rawBody, signature);
    if (event.type === 'ignored') return { status: 'ignored' };

    try {
      await this.db.tenant(event.orgId, async (db) => {
        await this.webhookEvents.create(db, {
          provider: this.provider.name,
          eventId: event.id,
          type: event.type,
        });
        await this.apply(db, event);
      });
      return { status: 'processed' };
    } catch (err) {
      if (isUniqueViolation(err)) return { status: 'duplicate' };
      throw err;
    }
  }

  private async apply(db: Db, event: Exclude<PaymentEvent, { type: 'ignored' }>) {
    if (!(await this.subscriptions.findByOrg(db, event.orgId))) {
      throw new NotFoundError('Subscription');
    }

    if (event.type === 'subscription.activated') {
      const plan = await this.plans.findByCode(db, event.planCode);
      if (!plan) throw new AppError(400, 'UNKNOWN_PLAN', `Unknown plan ${event.planCode}`);
      await this.subscriptions.updateByOrg(db, event.orgId, {
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        providerCustomerId: event.providerCustomerId,
        providerSubscriptionId: event.providerSubscriptionId,
        currentPeriodEnd: event.currentPeriodEnd,
      });
      return;
    }

    // Canceled: fall back to the free plan so the org keeps working within free limits.
    const freePlan = await this.plans.findByCode(db, 'free');
    if (!freePlan) throw new AppError(500, 'PLANS_NOT_SEEDED', 'Run the plan seed first');
    await this.subscriptions.updateByOrg(db, event.orgId, {
      planId: freePlan.id,
      status: SubscriptionStatus.CANCELED,
      providerSubscriptionId: null,
      currentPeriodEnd: null,
    });
  }
}
