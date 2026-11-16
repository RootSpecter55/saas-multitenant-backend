import type { DbContext } from '../../common/db';
import { NotFoundError } from '../../common/errors';
import { toPage, toSkipTake } from '../../common/pagination';
import type { PlanRepository } from './plans.repository';
import type { ListPlansQuery } from './plans.schemas';

export class PlansService {
  constructor(
    private readonly db: DbContext,
    private readonly plans: PlanRepository,
  ) {}

  async list(query: ListPlansQuery) {
    const { items, total } = await this.plans.list(this.db.system(), {
      ...toSkipTake(query),
      orderBy: { priceCents: 'asc' },
    });
    return toPage(items, total, query);
  }

  async get(planId: string) {
    const plan = await this.plans.findById(this.db.system(), planId);
    if (!plan) throw new NotFoundError('Plan');
    return plan;
  }
}
