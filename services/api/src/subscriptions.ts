import { Router } from 'express';
import type { Pool } from 'pg';
import type { SubscriptionPlan } from '@ifms/contracts';
import { requireAuth } from './auth-context.js';

/** Informational catalog only; no billing or entitlement checks exist. */
export function createSubscriptionRouter(pool: Pool) {
  const router = Router();
  router.get('/subscription-plans', requireAuth, async (_request, response) => {
    const result = await pool.query<SubscriptionPlan>(`SELECT id,code,name,description,
      price_monthly::text AS "priceMonthly",currency,status,display_order AS "displayOrder"
      FROM subscription_plans ORDER BY display_order,code`);
    response.json({ data: result.rows });
  });
  return router;
}
