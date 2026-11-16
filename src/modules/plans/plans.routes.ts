import { Router } from 'express';
import { validate } from '../../common/validate';
import type { PlansController } from './plans.controller';
import { listPlansQuery, planParams } from './plans.schemas';

/** Public: the plan catalogue is readable without logging in. */
export function plansRoutes(controller: PlansController): Router {
  const router = Router();
  router.get('/', validate({ query: listPlansQuery }), controller.list);
  router.get('/:planId', validate({ params: planParams }), controller.get);
  return router;
}
