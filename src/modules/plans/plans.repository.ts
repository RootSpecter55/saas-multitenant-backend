import { BaseRepository } from '../../common/base-repository';
import type { Db } from '../../common/db';
import type { Plan, Prisma } from '../../generated/prisma/client';

export class PlanRepository extends BaseRepository<
  Plan,
  Prisma.PlanUncheckedCreateInput,
  Prisma.PlanUncheckedUpdateInput,
  Prisma.PlanWhereInput
> {
  protected delegate(db: Db) {
    return db.plan;
  }

  findByCode(db: Db, code: string) {
    return db.plan.findUnique({ where: { code } });
  }
}
