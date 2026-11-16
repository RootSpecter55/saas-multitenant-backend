import { BaseRepository } from '../../common/base-repository';
import type { Db } from '../../common/db';
import type { Prisma, UsageRecord } from '../../generated/prisma/client';

export class UsageRepository extends BaseRepository<
  UsageRecord,
  Prisma.UsageRecordUncheckedCreateInput,
  Prisma.UsageRecordUncheckedUpdateInput,
  Prisma.UsageRecordWhereInput
> {
  protected delegate(db: Db) {
    return db.usageRecord;
  }

  /** Total quantity recorded in [from, to). RLS limits it to the current org. */
  async sumBetween(db: Db, from: Date, to: Date): Promise<number> {
    const result = await db.usageRecord.aggregate({
      _sum: { quantity: true },
      where: { recordedAt: { gte: from, lt: to } },
    });
    return result._sum.quantity ?? 0;
  }
}
