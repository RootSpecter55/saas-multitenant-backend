import { BaseRepository } from '../../common/base-repository';
import type { Db } from '../../common/db';
import type { Prisma, Subscription } from '../../generated/prisma/client';

export class SubscriptionRepository extends BaseRepository<
  Subscription,
  Prisma.SubscriptionUncheckedCreateInput,
  Prisma.SubscriptionUncheckedUpdateInput,
  Prisma.SubscriptionWhereInput
> {
  protected delegate(db: Db) {
    return db.subscription;
  }

  findByOrg(db: Db, orgId: string) {
    return db.subscription.findUnique({ where: { orgId }, include: { plan: true } });
  }

  updateByOrg(db: Db, orgId: string, data: Prisma.SubscriptionUncheckedUpdateInput) {
    return db.subscription.update({ where: { orgId }, data, include: { plan: true } });
  }
}

export class ProcessedWebhookEventRepository {
  create(db: Db, data: { provider: string; eventId: string; type: string }) {
    return db.processedWebhookEvent.create({ data });
  }
}
