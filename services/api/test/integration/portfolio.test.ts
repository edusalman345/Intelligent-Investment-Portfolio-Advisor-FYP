import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import type { Pool } from 'pg';
import { createApp } from '../../src/app.js';
import { createTestPool, resetDatabase, testConfig } from './helpers.js';

const config = testConfig();
const password = 'a sufficiently long test password';
let pool: Pool; let app: ReturnType<typeof createApp>;
let assets: { fresh: string; stale: string; missing: string; inactive: string; foreign: string };
interface Investor { cookie: string; csrf: string; id: string }
let alice: Investor;
let portfolioId: string;
const date = (hoursAgo = 0) => new Date(Date.now() - hoursAgo * 3600000).toISOString();
function cookie(response: request.Response): string {
  return (response.headers['set-cookie'] as string[]).find(item => item.startsWith('ifms_session='))!.split(';')[0]!;
}
async function register(email: string): Promise<Investor> {
  const response = await request(app).post('/api/v1/auth/register').set('Origin', config.frontendOrigin).send({ email, password, displayName: 'Portfolio Investor' });
  assert.equal(response.status, 201); return { cookie: cookie(response), csrf: response.body.data.csrfToken, id: response.body.data.user.id };
}
function api(method: 'get' | 'post' | 'patch' | 'delete', path: string, user = alice) {
  return request(app)[method](`/api/v1${path}`).set('Origin', config.frontendOrigin).set('Cookie', user.cookie).set('X-CSRF-Token', user.csrf);
}
async function createPortfolio(name = 'Demo portfolio', user = alice): Promise<string> {
  const response = await api('post', '/portfolios', user).send({ name, description: null, baseCurrency: 'USD' });
  assert.equal(response.status, 201); return response.body.data.id as string;
}
function buy(overrides: Record<string, unknown> = {}) {
  return { type: 'BUY', assetId: assets.fresh, quantity: '1', price: '10', currency: 'USD', fees: '0', occurredAt: date(3), idempotencyKey: randomUUID(), ...overrides };
}
function cash(type: string, amount: string, overrides: Record<string, unknown> = {}) {
  return { type, amount, currency: 'USD', fees: '0', occurredAt: date(1), idempotencyKey: randomUUID(), ...overrides };
}
async function addTransaction(body: Record<string, unknown>, id = portfolioId, user = alice) { return api('post', `/portfolios/${id}/transactions`, user).send(body); }
async function holding(id = portfolioId) { const response = await api('get', `/portfolios/${id}/holdings`); assert.equal(response.status, 200); return response.body.data; }

before(() => { pool = createTestPool(); });
beforeEach(async () => {
  await resetDatabase(pool); app = createApp({ pool, config, sendReset: async () => undefined });
  const inserted = await pool.query(`INSERT INTO assets(symbol,name,exchange,currency,is_active) VALUES
    ('TEST_FRESH','Fresh asset','TEST','USD',true),('TEST_STALE','Stale asset','TEST','USD',true),('TEST_MISSING','Unpriced asset','TEST','USD',true),
    ('TEST_INACTIVE','Inactive asset','TEST','USD',false),('TEST_FOREIGN','Foreign asset','TEST','EUR',true) RETURNING id,symbol`);
  const lookup = new Map(inserted.rows.map(row => [row.symbol as string, row.id as string]));
  assets = { fresh: lookup.get('TEST_FRESH')!, stale: lookup.get('TEST_STALE')!, missing: lookup.get('TEST_MISSING')!, inactive: lookup.get('TEST_INACTIVE')!, foreign: lookup.get('TEST_FOREIGN')! };
  const source = await pool.query(`INSERT INTO data_sources(name,source_type,config) VALUES('Portfolio test fixture','MARKET','{"isDemo":true}') RETURNING id`);
  await pool.query(`INSERT INTO market_quotes(asset_id,source_id,price,currency,as_of,volume) VALUES($1,$2,12,'USD',NOW()-INTERVAL '1 minute',1000),($3,$2,25,'USD',NOW()-INTERVAL '100 hours',2000)`,
    [assets.fresh, source.rows[0].id, assets.stale]);
  alice = await register('alice-portfolio@example.test'); portfolioId = await createPortfolio();
});
after(async () => { await pool.end(); });

test('portfolio CRUD validates ownership, name uniqueness, archive behavior and request fields', async () => {
  assert.equal((await request(app).get('/api/v1/portfolios')).status, 401);
  assert.equal((await request(app).post('/api/v1/portfolios').set('Origin', config.frontendOrigin).set('Cookie', alice.cookie).send({ name: 'No CSRF' })).status, 403);
  assert.equal((await api('post', '/portfolios').send({ name: 'demo PORTFOLIO' })).status, 409);
  assert.equal((await api('post', '/portfolios').send({ name: 'Invalid owner', userId: randomUUID() })).status, 400);
  assert.equal((await api('patch', `/portfolios/${portfolioId}`).send({ name: 'Renamed', description: 'Description', baseCurrency: 'USD' })).status, 200);
  const details = await api('get', `/portfolios/${portfolioId}`); assert.equal(details.body.data.name, 'Renamed'); assert.equal(details.body.data.description, 'Description');
  const bob = await register('bob-portfolio@example.test');
  assert.equal((await api('get', `/portfolios/${portfolioId}`, bob)).status, 404);
  assert.equal((await api('patch', `/portfolios/${portfolioId}`, bob).send({ name: 'Taken over' })).status, 404);
  assert.equal((await api('delete', `/portfolios/${portfolioId}`, bob)).status, 404);
  const archived = await api('delete', `/portfolios/${portfolioId}`); assert.equal(archived.status, 200); assert.equal(archived.body.data.status, 'ARCHIVED');
  assert.equal((await api('get', `/portfolios/${portfolioId}`)).status, 200);
  assert.equal((await api('patch', `/portfolios/${portfolioId}`).send({ name: 'Forbidden update' })).status, 409);
  assert.equal((await addTransaction(buy())).status, 409);
  const filtered = await api('get', '/portfolios?status=ARCHIVED'); assert.equal(filtered.body.data.length, 1);
  assert.equal((await api('post', '/portfolios').send({ name: 'Renamed' })).status, 201);
  assert.equal((await pool.query('SELECT id FROM portfolios WHERE id=$1', [portfolioId])).rowCount, 1);
});

test('all nested portfolio resources and reversals enforce object ownership', async () => {
  const original = await addTransaction(buy()); assert.equal(original.status, 201);
  const bob = await register('bob-portfolio@example.test'); const bobPortfolio = await createPortfolio('Bob portfolio', bob);
  for (const resource of ['holdings', 'transactions', 'valuation', 'valuation/history']) {
    assert.equal((await api('get', `/portfolios/${portfolioId}/${resource}`, bob)).status, 404, resource);
  }
  assert.equal((await addTransaction(buy(), portfolioId, bob)).status, 404);
  assert.equal((await api('post', `/portfolios/${portfolioId}/transactions/${original.body.data.id}/reverse`, bob).send({ idempotencyKey: randomUUID() })).status, 404);
  assert.equal((await api('post', `/portfolios/${bobPortfolio}/transactions/${original.body.data.id}/reverse`, bob).send({ idempotencyKey: randomUUID() })).status, 404);
  assert.equal((await api('get', '/portfolios')).body.data.length, 1);
  assert.equal((await api('get', '/portfolios', bob)).body.data.length, 1);
});

test('fractional trades rebuild exact weighted average cost and atomic valuation snapshots', async () => {
  assert.equal((await addTransaction(buy({ quantity: '0.1', price: '10', fees: '0.01', occurredAt: date(3) }))).status, 201);
  assert.equal((await addTransaction(buy({ quantity: '0.2', price: '20', occurredAt: date(2) }))).status, 201);
  assert.equal((await addTransaction(buy({ type: 'SELL', quantity: '0.05', price: '25', occurredAt: date(1) }))).status, 201);
  const holdings = await holding(); assert.equal(holdings.length, 1); assert.equal(holdings[0].quantity, '0.25000000'); assert.equal(holdings[0].averageCost, '16.70000000');
  const valuation = await api('get', `/portfolios/${portfolioId}/valuation`);
  assert.equal(valuation.body.data.totalMarketValue, '3.00000000'); assert.equal(valuation.body.data.cashValue, '0.00000000');
  const history = await api('get', `/portfolios/${portfolioId}/valuation/history`); assert.equal(history.status, 200);
  assert.ok(history.body.data.length >= 2); assert.ok(history.body.data.every((snapshot: { id?: string; asOf?: string }) => snapshot.id && snapshot.asOf));
  assert.equal(history.body.data.at(-1).totalValue, '3.00000000');
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM transactions WHERE portfolio_id=$1', [portfolioId])).rows[0].count, 3);
});

test('oversells, invalid backdating and invalid financial inputs leave the ledger and holdings unchanged', async () => {
  assert.equal((await addTransaction(buy({ occurredAt: date(3) }))).status, 201);
  assert.equal((await addTransaction(buy({ type: 'SELL', quantity: '0.8', occurredAt: date(1) }))).status, 201);
  const before = await holding();
  assert.equal((await addTransaction(buy({ type: 'SELL', quantity: '0.3', occurredAt: date(2) }))).status, 409);
  assert.equal((await addTransaction(buy({ type: 'SELL', quantity: '0.3', occurredAt: date() }))).status, 409);
  assert.equal((await addTransaction(buy({ occurredAt: new Date(Date.now() + 60000).toISOString() }))).status, 400);
  assert.equal((await addTransaction(buy({ quantity: '1000000001' }))).status, 400);
  assert.equal((await addTransaction(buy({ quantity: '0.123456789' }))).status, 400);
  assert.equal((await addTransaction(buy({ quantity: 1 }))).status, 400);
  assert.equal((await addTransaction(buy({ quantity: 'not-a-decimal' }))).status, 400);
  assert.equal((await addTransaction(buy({ price: 'not-a-decimal' }))).status, 400);
  assert.equal((await addTransaction(buy({ amount: '100' }))).status, 400);
  assert.equal((await addTransaction(buy({ currency: 'EUR' }))).status, 400);
  assert.equal((await addTransaction(buy({ assetId: assets.inactive }))).status, 409);
  assert.equal((await addTransaction(buy({ assetId: assets.foreign }))).status, 400);
  assert.deepEqual(await holding(), before);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM transactions WHERE portfolio_id=$1', [portfolioId])).rows[0].count, 2);
});

test('unsupported derived average cost returns a validation error and rolls back every derived record', async () => {
  const counts = async () => (await pool.query(`SELECT (SELECT count(*)::int FROM transactions WHERE portfolio_id=$1) AS transactions,
    (SELECT count(*)::int FROM holdings WHERE portfolio_id=$1) AS holdings,
    (SELECT count(*)::int FROM portfolio_valuation_snapshots WHERE portfolio_id=$1) AS snapshots`,[portfolioId])).rows[0];
  const before = await counts();
  const response = await addTransaction(buy({quantity:'0.00000001',price:'1',fees:'100000000'}));
  assert.equal(response.status,400);assert.equal(response.body.error.code,'FINANCIAL_LIMIT');
  assert.deepEqual(await counts(),before);
});

test('concurrent sales serialize on the portfolio and cannot oversell', async () => {
  assert.equal((await addTransaction(buy())).status, 201);
  const time = date(1);
  const responses = await Promise.all([addTransaction(buy({ type: 'SELL', quantity: '0.75', occurredAt: time })), addTransaction(buy({ type: 'SELL', quantity: '0.75', occurredAt: time }))]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  assert.equal((await holding())[0].quantity, '0.25000000');
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM transactions WHERE portfolio_id=$1', [portfolioId])).rows[0].count, 2);
});

test('idempotency is canonical, concurrent-safe and rejects payload or operation mismatches', async () => {
  const payload = buy({ quantity: '0.1' });
  const responses = await Promise.all([addTransaction(payload), addTransaction(payload)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]); assert.equal(responses[0]!.body.data.id, responses[1]!.body.data.id);
  const canonical = await addTransaction({ ...payload, quantity: '0.10000000', price: '10.00000000', fees: '0.00000000' });
  assert.equal(canonical.status, 200); assert.equal(canonical.body.data.id, responses[0]!.body.data.id);
  assert.equal((await addTransaction({ ...payload, price: '11' })).status, 409);
  assert.equal((await api('post', `/portfolios/${portfolioId}/transactions/${responses[0]!.body.data.id}/reverse`).send({ idempotencyKey: payload.idempotencyKey })).status, 409);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM transactions WHERE portfolio_id=$1', [portfolioId])).rows[0].count, 1);
  const another = await createPortfolio('Another'); assert.equal((await addTransaction(payload, another)).status, 201);
});

test('immutable reversals restore positions and reject reversals that invalidate later transactions', async () => {
  const bought = await addTransaction(buy()); const sold = await addTransaction(buy({ type: 'SELL', quantity: '0.2', occurredAt: date(1) }));
  assert.equal(sold.status, 201);
  assert.equal((await api('post', `/portfolios/${portfolioId}/transactions/${bought.body.data.id}/reverse`).send({ idempotencyKey: randomUUID() })).status, 409);
  assert.equal((await holding())[0].quantity, '0.80000000');
  const body = { idempotencyKey: randomUUID(), notes: 'Correct erroneous sale' };
  const reversed = await api('post', `/portfolios/${portfolioId}/transactions/${sold.body.data.id}/reverse`).send(body);
  assert.equal(reversed.status, 201); assert.equal(reversed.body.data.type, 'REVERSAL'); assert.equal(reversed.body.data.reversesTransactionId, sold.body.data.id);
  assert.equal((await holding())[0].quantity, '1.00000000');
  const retry = await api('post', `/portfolios/${portfolioId}/transactions/${sold.body.data.id}/reverse`).send(body);
  assert.equal(retry.status, 200); assert.equal(retry.body.data.id, reversed.body.data.id);
  assert.equal((await api('post', `/portfolios/${portfolioId}/transactions/${sold.body.data.id}/reverse`).send({ idempotencyKey: randomUUID() })).status, 409);
  assert.equal((await api('post', `/portfolios/${portfolioId}/transactions/${reversed.body.data.id}/reverse`).send({ idempotencyKey: randomUUID() })).status, 409);
  const history = await api('get', `/portfolios/${portfolioId}/transactions`);
  assert.equal(history.body.data.find((entry: { id: string }) => entry.id === sold.body.data.id).reversed, true);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM transactions WHERE portfolio_id=$1', [portfolioId])).rows[0].count, 3);
});

test('cash is recorded separately from trades, balances enforce replay and fee shapes are explicit', async () => {
  assert.equal((await addTransaction(buy())).status, 201);
  assert.equal((await api('get', `/portfolios/${portfolioId}/valuation`)).body.data.cashValue, '0.00000000');
  const deposit = await addTransaction(cash('DEPOSIT', '100', { occurredAt: date(2) })); assert.equal(deposit.status, 201);
  assert.equal((await addTransaction(cash('FEE', '10'))).status, 201);
  assert.equal((await addTransaction(cash('WITHDRAWAL', '20'))).status, 201);
  assert.equal((await addTransaction(cash('DIVIDEND', '5', { assetId: assets.fresh }))).status, 201);
  assert.equal((await addTransaction(buy({ type: 'SELL', quantity: '0.5', occurredAt: date() }))).status, 201);
  const value = await api('get', `/portfolios/${portfolioId}/valuation`); assert.equal(value.body.data.cashValue, '75.00000000'); assert.equal(value.body.data.totalValue, '81.00000000');
  assert.equal((await addTransaction(cash('WITHDRAWAL', '1000'))).status, 409);
  assert.equal((await addTransaction(cash('FEE', '1', { fees: '2' }))).status, 400);
  assert.equal((await api('post', `/portfolios/${portfolioId}/transactions/${deposit.body.data.id}/reverse`).send({ idempotencyKey: randomUUID() })).status, 409);
  assert.equal((await api('get', `/portfolios/${portfolioId}/valuation`)).body.data.cashValue, '75.00000000');
});

test('valuation identifies missing and stale prices with source/demo provenance', async () => {
  assert.equal((await addTransaction(buy({ quantity: '2' }))).status, 201);
  assert.equal((await addTransaction(buy({ assetId: assets.stale }))).status, 201);
  assert.equal((await addTransaction(buy({ assetId: assets.missing, quantity: '3' }))).status, 201);
  assert.equal((await addTransaction(cash('DEPOSIT', '20'))).status, 201);
  const response = await api('get', `/portfolios/${portfolioId}/valuation`); assert.equal(response.status, 200);
  const value = response.body.data;
  assert.equal(value.totalMarketValue, '49.00000000'); assert.equal(value.cashValue, '20.00000000'); assert.equal(value.totalValue, '69.00000000');
  assert.equal(value.unpricedPositionCount, 1); assert.equal(value.stalePositionCount, 1); assert.equal(value.isDemo, true);
  const fresh = value.positions.find((line: { assetId: string }) => line.assetId === assets.fresh);
  const stale = value.positions.find((line: { assetId: string }) => line.assetId === assets.stale);
  const missing = value.positions.find((line: { assetId: string }) => line.assetId === assets.missing);
  assert.equal(fresh.source, 'Portfolio test fixture'); assert.equal(fresh.isDemo, true); assert.equal(fresh.isStale, false); assert.ok(fresh.asOf);
  assert.equal(stale.isStale, true); assert.equal(stale.price, '25.00000000'); assert.ok(stale.asOf);
  assert.equal(missing.price, null); assert.equal(missing.marketValue, null); assert.equal(missing.source, null); assert.equal(missing.asOf, null);
});

test('watchlists and their nested items enforce ownership, validation and duplicate handling', async () => {
  const created = await api('post', '/watchlists').send({ name: 'My watchlist' }); assert.equal(created.status, 201); const id = created.body.data.id as string;
  assert.deepEqual(created.body.data.items, []);
  assert.equal((await api('post', '/watchlists').send({ name: 'my WATCHLIST' })).status, 409);
  assert.equal((await api('post', `/watchlists/${id}/items`).send({ assetId: assets.fresh })).status, 200);
  assert.equal((await api('post', `/watchlists/${id}/items`).send({ assetId: assets.fresh })).body.data.items.length, 1);
  assert.equal((await api('post', `/watchlists/${id}/items`).send({ assetId: assets.inactive })).status, 409);
  assert.equal((await api('post', `/watchlists/${id}/items`).send({ assetId: randomUUID() })).status, 404);
  const bob = await register('bob-watchlist@example.test');
  assert.equal((await api('get', '/watchlists', bob)).body.data.length, 0);
  assert.equal((await api('get', `/watchlists/${id}`, bob)).status, 404);
  assert.equal((await api('patch', `/watchlists/${id}`, bob).send({ name: 'Hijacked' })).status, 404);
  assert.equal((await api('delete', `/watchlists/${id}`, bob)).status, 404);
  assert.equal((await api('post', `/watchlists/${id}/items`, bob).send({ assetId: assets.stale })).status, 404);
  assert.equal((await api('delete', `/watchlists/${id}/items/${assets.fresh}`, bob)).status, 404);
  const changed = await api('patch', `/watchlists/${id}`).send({ name: 'Renamed watchlist' }); assert.equal(changed.status, 200); assert.equal(changed.body.data.name, 'Renamed watchlist');
  const lists = await api('get', '/watchlists'); assert.equal(lists.body.data[0].items[0].assetId, assets.fresh);
  assert.equal((await api('delete', `/watchlists/${id}/items/${assets.fresh}`)).body.data.items.length, 0);
  assert.equal((await api('delete', `/watchlists/${id}`)).status, 200);
  assert.equal((await api('get', `/watchlists/${id}`)).status, 404);
});

test('malformed identifiers and unsupported queries are rejected without SQL execution effects', async () => {
  assert.equal((await api('get', "/portfolios/' OR 1=1--")).status, 400);
  assert.equal((await api('get', `/portfolios/${randomUUID()}`)).status, 404);
  assert.equal((await api('get', '/portfolios?status=ALL')).status, 400);
  assert.equal((await api('get', `/portfolios/${portfolioId}/transactions?limit=100000`)).status, 400);
  assert.equal((await api('post', '/watchlists').send({ name: 'Safe list', userId: randomUUID() })).status, 400);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM portfolios WHERE user_id=$1', [alice.id])).rows[0].count, 1);
});
