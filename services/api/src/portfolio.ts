import { createHash } from 'node:crypto';
import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import { HttpError, parse } from './errors.js';
import { requireAuth, requireCsrf } from './auth-context.js';
import { replayLedger } from './ledger.js';
import { ledgerEntries, saveValuation, valuePortfolio } from './valuation.js';

type DB = Pick<PoolClient, 'query'>;
const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(120);
const description = z.string().trim().max(1000).nullable();
const notes = z.string().trim().max(1000).optional();
const decimal = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,8})?$/, 'Use a decimal string with at most 8 decimal places.')
  .pipe(z.string().refine(value => new Decimal(value).lte('9999999999999999'), 'Value exceeds the supported demo limit.'));
const positive = decimal.pipe(z.string().refine(value => new Decimal(value).gt(0), 'Use a positive amount.'));
const quantity = positive.pipe(z.string().refine(value => new Decimal(value).lte('1000000000'), 'Quantity exceeds the supported demo limit.'));
const occurredAt = z.string().datetime({ offset: true }).refine(value => new Date(value).getTime() <= Date.now(), 'Future transactions are not supported.');
const common = { currency: z.literal('USD').default('USD'), occurredAt, idempotencyKey: uuid, notes };
const trade = z.object({ ...common, type: z.enum(['BUY', 'SELL']), assetId: uuid, quantity, price: positive, fees: decimal.default('0') }).strict();
const cash = z.object({ ...common, type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'FEE']), assetId: uuid.nullable().optional(), amount: positive,
  fees: decimal.pipe(z.string().refine(value => new Decimal(value).isZero(), 'Cash movements use amount; fees must be zero.')).default('0') }).strict();
const transactionInput = z.union([trade, cash]);
const portfolioSelect = `id, name, description, base_currency AS "baseCurrency", status, created_at AS "createdAt", updated_at AS "updatedAt"`;
const transactionSelect = `t.id, t.asset_id AS "assetId", a.symbol, t.transaction_type AS type, t.quantity::text, t.price::text, t.amount::text,
  t.currency, t.fees::text, t.occurred_at AS "occurredAt", t.notes, t.reverses_transaction_id AS "reversesTransactionId",
  EXISTS(SELECT 1 FROM transactions r WHERE r.reverses_transaction_id = t.id) AS reversed`;

async function atomic<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const value = await operation(client); await client.query('COMMIT'); return value; }
  catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
function uniqueConflict(error: unknown, code: string, message: string): never {
  if ((error as { code?: string } | null)?.code === '23505') throw new HttpError(409, code, message);
  throw error;
}
async function ownPortfolio(db: DB, portfolioId: string, userId: string, lock = false) {
  const result = await db.query(`SELECT ${portfolioSelect} FROM portfolios WHERE id = $1 AND user_id = $2${lock ? ' FOR UPDATE' : ''}`, [portfolioId, userId]);
  if (!result.rowCount) throw new HttpError(404, 'PORTFOLIO_NOT_FOUND', 'Portfolio was not found.');
  return result.rows[0];
}
function active(portfolio: { status: string }): void {
  if (portfolio.status !== 'ACTIVE') throw new HttpError(409, 'PORTFOLIO_ARCHIVED', 'Archived portfolios cannot be changed.');
}
async function asset(db: DB, assetId: string): Promise<void> {
  const found = await db.query('SELECT currency, is_active FROM assets WHERE id = $1', [assetId]);
  if (!found.rowCount) throw new HttpError(404, 'ASSET_NOT_FOUND', 'Asset was not found.');
  if (!found.rows[0].is_active) throw new HttpError(409, 'ASSET_INACTIVE', 'This asset is no longer available.');
  if (found.rows[0].currency !== 'USD') throw new HttpError(400, 'CURRENCY_UNSUPPORTED', 'This demo supports USD assets only.');
}
async function audit(db: DB, userId: string, action: string, entityType: string, entityId: string): Promise<void> {
  await db.query('INSERT INTO audit_logs(actor_user_id, action, entity_type, entity_id) VALUES($1,$2,$3,$4)', [userId, action, entityType, entityId]);
}
async function oneTransaction(db: DB, portfolioId: string, id: string) {
  const result = await db.query(`SELECT ${transactionSelect} FROM transactions t LEFT JOIN assets a ON a.id = t.asset_id
    WHERE t.portfolio_id = $1 AND t.id = $2`, [portfolioId, id]);
  return result.rows[0];
}
async function priorRequest(db: DB, portfolioId: string, key: string, fingerprint: string) {
  const prior = await db.query('SELECT id, request_fingerprint FROM transactions WHERE portfolio_id = $1 AND idempotency_key = $2', [portfolioId, key]);
  if (!prior.rowCount) return null;
  if (prior.rows[0].request_fingerprint !== fingerprint) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'That request key was already used for a different transaction.');
  return oneTransaction(db, portfolioId, prior.rows[0].id);
}
function fingerprint(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
async function updateDerived(client: DB, portfolioId: string, userId: string, quoteMaxAgeHours: number): Promise<void> {
  const { positions } = replayLedger(await ledgerEntries(client, portfolioId));
  // Holdings are a materialized view of the append-only transaction ledger.
  await client.query('DELETE FROM holdings WHERE portfolio_id = $1', [portfolioId]);
  for (const [assetId, position] of positions) {
    if (position.quantity.isZero()) continue;
    const averageCost = position.costTotal.div(position.quantity);
    if (averageCost.gt('9999999999999999')) throw new HttpError(400, 'FINANCIAL_LIMIT', 'Average cost exceeds the supported demo limits.');
    await client.query(`INSERT INTO holdings(portfolio_id, asset_id, quantity, average_cost, cost_currency)
      VALUES($1,$2,$3,$4,'USD')`, [portfolioId, assetId, position.quantity.toFixed(8), averageCost.toFixed(8)]);
  }
  await saveValuation(client, portfolioId, quoteMaxAgeHours);
  await client.query('UPDATE portfolios SET updated_at = NOW() WHERE id = $1 AND user_id = $2', [portfolioId, userId]);
}

async function ownWatchlist(db: DB, id: string, userId: string, lock = false) {
  const result = await db.query(`SELECT id, name, created_at AS "createdAt" FROM watchlists WHERE id = $1 AND user_id = $2${lock ? ' FOR UPDATE' : ''}`, [id, userId]);
  if (!result.rowCount) throw new HttpError(404, 'WATCHLIST_NOT_FOUND', 'Watchlist was not found.');
  return result.rows[0];
}
async function watchlistDetails(db: DB, id: string, userId: string) {
  const list = await ownWatchlist(db, id, userId);
  const result = await db.query(`SELECT a.id AS "assetId", a.symbol, a.name, i.created_at AS "createdAt" FROM watchlist_items i
    JOIN assets a ON a.id = i.asset_id WHERE i.watchlist_id = $1 ORDER BY a.symbol, a.id`, [id]);
  return { ...list, items: result.rows };
}

export function createPortfolioRouter({ pool, config }: { pool: Pool; config: AppConfig }): Router {
  const router = Router();
  router.use(['/portfolios', '/watchlists'], requireAuth);

  router.get('/portfolios', async (request, response) => {
    const query = parse(z.object({ status: z.enum(['ACTIVE', 'ARCHIVED']).optional() }).strict(), request.query);
    const result = await pool.query(`SELECT ${portfolioSelect} FROM portfolios WHERE user_id = $1
      AND ($2::text IS NULL OR status = $2) ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END, updated_at DESC, id`, [request.auth!.user.id, query.status ?? null]);
    response.json({ data: result.rows });
  });
  router.post('/portfolios', requireCsrf, async (request, response) => {
    const input = parse(z.object({ name, description: description.optional(), baseCurrency: z.literal('USD').default('USD') }).strict(), request.body);
    try {
      const value = await atomic(pool, async client => {
        const created = await client.query(`INSERT INTO portfolios(user_id, name, description, base_currency) VALUES($1,$2,$3,$4) RETURNING ${portfolioSelect}`,
          [request.auth!.user.id, input.name, input.description || null, input.baseCurrency]);
        await saveValuation(client, created.rows[0].id, config.quoteMaxAgeHours);
        await audit(client, request.auth!.user.id, 'PORTFOLIO_CREATE', 'portfolio', created.rows[0].id); return created.rows[0];
      }); response.status(201).json({ data: value });
    } catch (error) { uniqueConflict(error, 'PORTFOLIO_NAME_IN_USE', 'An active portfolio with that name already exists.'); }
  });
  router.get('/portfolios/:id', async (request, response) => {
    response.json({ data: await ownPortfolio(pool, parse(uuid, request.params.id), request.auth!.user.id) });
  });
  router.patch('/portfolios/:id', requireCsrf, async (request, response) => {
    const id = parse(uuid, request.params.id);
    const input = parse(z.object({ name: name.optional(), description: description.optional(), baseCurrency: z.literal('USD').optional() }).strict()
      .refine(value => Object.keys(value).length > 0, 'Provide at least one portfolio field.'), request.body);
    try {
      const value = await atomic(pool, async client => {
        active(await ownPortfolio(client, id, request.auth!.user.id, true));
        const result = await client.query(`UPDATE portfolios SET name = COALESCE($3,name), description = CASE WHEN $4 THEN $5 ELSE description END, updated_at = NOW()
          WHERE id = $1 AND user_id = $2 RETURNING ${portfolioSelect}`, [id, request.auth!.user.id, input.name ?? null, input.description !== undefined, input.description || null]);
        await audit(client, request.auth!.user.id, 'PORTFOLIO_UPDATE', 'portfolio', id); return result.rows[0];
      }); response.json({ data: value });
    } catch (error) { uniqueConflict(error, 'PORTFOLIO_NAME_IN_USE', 'An active portfolio with that name already exists.'); }
  });
  router.delete('/portfolios/:id', requireCsrf, async (request, response) => {
    const id = parse(uuid, request.params.id); parse(z.object({}).strict(), request.body ?? {});
    const value = await atomic(pool, async client => {
      await ownPortfolio(client, id, request.auth!.user.id, true);
      const result = await client.query(`UPDATE portfolios SET status = 'ARCHIVED', archived_at = COALESCE(archived_at,NOW()), updated_at = NOW()
        WHERE id = $1 AND user_id = $2 RETURNING ${portfolioSelect}`, [id, request.auth!.user.id]);
      await audit(client, request.auth!.user.id, 'PORTFOLIO_ARCHIVE', 'portfolio', id); return result.rows[0];
    }); response.json({ data: value });
  });

  router.get('/portfolios/:id/holdings', async (request, response) => {
    const id = parse(uuid, request.params.id); await ownPortfolio(pool, id, request.auth!.user.id);
    const result = await pool.query(`SELECT a.id AS "assetId", a.symbol, a.name, h.quantity::text, h.average_cost::text AS "averageCost", h.cost_currency AS "costCurrency"
      FROM holdings h JOIN assets a ON a.id = h.asset_id WHERE h.portfolio_id = $1 AND h.quantity > 0 ORDER BY a.symbol, a.id`, [id]);
    response.json({ data: result.rows });
  });
  router.get('/portfolios/:id/transactions', async (request, response) => {
    const id = parse(uuid, request.params.id); await ownPortfolio(pool, id, request.auth!.user.id);
    const query = parse(z.object({ limit: z.coerce.number().int().min(1).max(500).default(200), offset: z.coerce.number().int().min(0).max(1000000).default(0) }).strict(), request.query);
    const result = await pool.query(`SELECT ${transactionSelect} FROM transactions t LEFT JOIN assets a ON a.id = t.asset_id
      WHERE t.portfolio_id = $1 ORDER BY t.occurred_at DESC, t.created_at DESC, t.id DESC LIMIT $2 OFFSET $3`, [id, query.limit, query.offset]);
    response.json({ data: result.rows });
  });
  router.post('/portfolios/:id/transactions', requireCsrf, async (request, response) => {
    const id = parse(uuid, request.params.id); const input = parse(transactionInput, request.body);
    const isTrade = input.type === 'BUY' || input.type === 'SELL';
    const normalized = { type: input.type, assetId: input.assetId ?? null,
      quantity: isTrade ? new Decimal((input as z.infer<typeof trade>).quantity).toFixed(8) : null,
      price: isTrade ? new Decimal((input as z.infer<typeof trade>).price).toFixed(8) : null,
      amount: !isTrade ? new Decimal((input as z.infer<typeof cash>).amount).toFixed(8) : null,
      currency: input.currency, fees: new Decimal(input.fees).toFixed(8), occurredAt: new Date(input.occurredAt).toISOString(), notes: input.notes || null };
    const hash = fingerprint(normalized);
    const result = await atomic(pool, async client => {
      const portfolio = await ownPortfolio(client, id, request.auth!.user.id, true);
      const existing = await priorRequest(client, id, input.idempotencyKey, hash); if (existing) return { value: existing, created: false };
      active(portfolio); if (normalized.assetId) await asset(client, normalized.assetId);
      const inserted = await client.query(`INSERT INTO transactions(portfolio_id, asset_id, transaction_type, quantity, price, amount, currency, fees, occurred_at, notes, idempotency_key, request_fingerprint)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [id, normalized.assetId, normalized.type, normalized.quantity, normalized.price, normalized.amount, normalized.currency, normalized.fees, normalized.occurredAt, normalized.notes, input.idempotencyKey, hash]);
      await updateDerived(client, id, request.auth!.user.id, config.quoteMaxAgeHours);
      await audit(client, request.auth!.user.id, 'TRANSACTION_CREATE', 'transaction', inserted.rows[0].id);
      return { value: await oneTransaction(client, id, inserted.rows[0].id), created: true };
    }); response.status(result.created ? 201 : 200).json({ data: result.value });
  });
  router.post('/portfolios/:id/transactions/:transactionId/reverse', requireCsrf, async (request, response) => {
    const id = parse(uuid, request.params.id); const targetId = parse(uuid, request.params.transactionId);
    const input = parse(z.object({ idempotencyKey: uuid, occurredAt: occurredAt.optional(), notes }).strict(), request.body);
    const hash = fingerprint({ type: 'REVERSAL', targetId, occurredAt: input.occurredAt ? new Date(input.occurredAt).toISOString() : null, notes: input.notes || null });
    const result = await atomic(pool, async client => {
      const portfolio = await ownPortfolio(client, id, request.auth!.user.id, true);
      const existing = await priorRequest(client, id, input.idempotencyKey, hash); if (existing) return { value: existing, created: false };
      active(portfolio);
      const target = await oneTransaction(client, id, targetId);
      if (!target) throw new HttpError(404, 'TRANSACTION_NOT_FOUND', 'Transaction was not found.');
      if (target.type === 'REVERSAL' || target.reversed) throw new HttpError(409, 'REVERSAL_INVALID', 'This transaction cannot be reversed.');
      const date = input.occurredAt ? new Date(input.occurredAt) : new Date();
      if (date.getTime() < new Date(target.occurredAt).getTime()) throw new HttpError(400, 'REVERSAL_DATE_INVALID', 'A reversal cannot occur before its original transaction.');
      const inserted = await client.query(`INSERT INTO transactions(portfolio_id, transaction_type, currency, fees, occurred_at, notes, idempotency_key, request_fingerprint, reverses_transaction_id)
        VALUES($1,'REVERSAL','USD',0,$2,$3,$4,$5,$6) RETURNING id`, [id, date, input.notes || null, input.idempotencyKey, hash, targetId]);
      await updateDerived(client, id, request.auth!.user.id, config.quoteMaxAgeHours);
      await audit(client, request.auth!.user.id, 'TRANSACTION_REVERSE', 'transaction', inserted.rows[0].id);
      return { value: await oneTransaction(client, id, inserted.rows[0].id), created: true };
    }); response.status(result.created ? 201 : 200).json({ data: result.value });
  });
  router.get('/portfolios/:id/valuation', async (request, response) => {
    const id = parse(uuid, request.params.id); await ownPortfolio(pool, id, request.auth!.user.id);
    response.json({ data: await valuePortfolio(pool, id, config.quoteMaxAgeHours) });
  });
  router.get('/portfolios/:id/valuation/history', async (request, response) => {
    const id = parse(uuid, request.params.id); await ownPortfolio(pool, id, request.auth!.user.id);
    const query = parse(z.object({ limit: z.coerce.number().int().min(1).max(500).default(200) }).strict(), request.query);
    const result = await pool.query(`SELECT id, details FROM (SELECT id, details, as_of FROM portfolio_valuation_snapshots WHERE portfolio_id = $1 ORDER BY as_of DESC LIMIT $2) recent ORDER BY as_of`, [id, query.limit]);
    response.json({ data: result.rows.map(row => ({ id: row.id, ...row.details })) });
  });

  router.get('/watchlists', async (request, response) => {
    parse(z.object({}).strict(), request.query);
    const lists = await pool.query('SELECT id FROM watchlists WHERE user_id = $1 ORDER BY created_at, id', [request.auth!.user.id]);
    const details = await Promise.all(lists.rows.map(row => watchlistDetails(pool, row.id, request.auth!.user.id)));
    response.json({ data: details });
  });
  router.post('/watchlists', requireCsrf, async (request, response) => {
    const input = parse(z.object({ name }).strict(), request.body);
    try {
      const value = await atomic(pool, async client => {
        const inserted = await client.query('INSERT INTO watchlists(user_id,name) VALUES($1,$2) RETURNING id', [request.auth!.user.id, input.name]);
        await audit(client, request.auth!.user.id, 'WATCHLIST_CREATE', 'watchlist', inserted.rows[0].id);
        return watchlistDetails(client, inserted.rows[0].id, request.auth!.user.id);
      }); response.status(201).json({ data: value });
    } catch (error) { uniqueConflict(error, 'WATCHLIST_NAME_IN_USE', 'A watchlist with that name already exists.'); }
  });
  router.get('/watchlists/:id', async (request, response) => { response.json({ data: await watchlistDetails(pool, parse(uuid, request.params.id), request.auth!.user.id) }); });
  router.patch('/watchlists/:id', requireCsrf, async (request, response) => {
    const id = parse(uuid, request.params.id); const input = parse(z.object({ name }).strict(), request.body);
    try {
      const value = await atomic(pool, async client => {
        await ownWatchlist(client, id, request.auth!.user.id, true);
        await client.query('UPDATE watchlists SET name = $3, updated_at = NOW() WHERE id = $1 AND user_id = $2', [id, request.auth!.user.id, input.name]);
        await audit(client, request.auth!.user.id, 'WATCHLIST_UPDATE', 'watchlist', id); return watchlistDetails(client, id, request.auth!.user.id);
      }); response.json({ data: value });
    } catch (error) { uniqueConflict(error, 'WATCHLIST_NAME_IN_USE', 'A watchlist with that name already exists.'); }
  });
  router.delete('/watchlists/:id', requireCsrf, async (request, response) => {
    const id = parse(uuid, request.params.id);
    await atomic(pool, async client => {
      await ownWatchlist(client, id, request.auth!.user.id, true);
      await client.query('DELETE FROM watchlists WHERE id = $1 AND user_id = $2', [id, request.auth!.user.id]);
      await audit(client, request.auth!.user.id, 'WATCHLIST_DELETE', 'watchlist', id);
    }); response.json({ data: { deleted: true } });
  });
  router.post('/watchlists/:id/items', requireCsrf, async (request, response) => {
    const id = parse(uuid, request.params.id); const input = parse(z.object({ assetId: uuid }).strict(), request.body);
    const value = await atomic(pool, async client => {
      await ownWatchlist(client, id, request.auth!.user.id, true); await asset(client, input.assetId);
      await client.query('INSERT INTO watchlist_items(watchlist_id,asset_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [id, input.assetId]);
      await client.query('UPDATE watchlists SET updated_at = NOW() WHERE id = $1', [id]);
      await audit(client, request.auth!.user.id, 'WATCHLIST_ADD_ITEM', 'watchlist', id); return watchlistDetails(client, id, request.auth!.user.id);
    }); response.json({ data: value });
  });
  router.delete('/watchlists/:id/items/:assetId', requireCsrf, async (request, response) => {
    const id = parse(uuid, request.params.id); const assetId = parse(uuid, request.params.assetId);
    const value = await atomic(pool, async client => {
      await ownWatchlist(client, id, request.auth!.user.id, true);
      const removed = await client.query('DELETE FROM watchlist_items WHERE watchlist_id = $1 AND asset_id = $2 RETURNING asset_id', [id, assetId]);
      if (!removed.rowCount) throw new HttpError(404, 'WATCHLIST_ITEM_NOT_FOUND', 'Watchlist item was not found.');
      await client.query('UPDATE watchlists SET updated_at = NOW() WHERE id = $1', [id]);
      await audit(client, request.auth!.user.id, 'WATCHLIST_REMOVE_ITEM', 'watchlist', id); return watchlistDetails(client, id, request.auth!.user.id);
    }); response.json({ data: value });
  });
  return router;
}
