import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, mock, test } from 'node:test';
import request from 'supertest';
import type { Pool } from 'pg';
import { createApp } from '../../src/app.js';
import { tokenHash } from '../../src/auth-context.js';
import { ALPHA_VANTAGE_SOURCE, alphaVantageProvider } from '../../src/market-provider.js';
import { createTestPool, resetDatabase, testConfig } from './helpers.js';

const config = { ...testConfig(), marketProvider: 'alpha-vantage' as const, alphaVantageApiKey: 'non-secret-test-placeholder' };
let pool: Pool; let app: ReturnType<typeof createApp>;
let calls: { endpoint: string; query: string }[];
let searchFailure: Record<string, unknown> | undefined;
let searchMatches: Record<string, unknown>[] | undefined;
interface Investor { cookie: string; csrf: string; id: string }
let investor: Investor;
function match(symbol: string, name: string) { return { '1. symbol': symbol, '2. name': name, '3. type': 'Equity', '4. region': 'United States', '8. currency': 'USD', '9. matchScore': '1.0000' }; }
async function user(): Promise<Investor> {
  const token = randomBytes(32).toString('base64url'); const csrf = randomBytes(32).toString('base64url');
  const created = await pool.query('INSERT INTO users(email) VALUES($1) RETURNING id', [`${randomUUID()}@example.test`]);
  await pool.query("INSERT INTO auth_sessions(user_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '1 hour')", [created.rows[0].id, tokenHash(token), csrf]);
  return { id: created.rows[0].id, cookie: `ifms_session=${token}`, csrf };
}
function post(path: string, body: unknown, actor = investor) { return request(app).post(`/api/v1${path}`).set('Origin', config.frontendOrigin).set('Cookie', actor.cookie).set('X-CSRF-Token', actor.csrf).send(body); }
function discover(query: string) { return post('/assets/discover', { query }); }
function initialize(id: string) { return post(`/assets/${id}/market-data`, {}); }

before(() => { pool = createTestPool(); });
beforeEach(async () => {
  await resetDatabase(pool); calls = []; searchFailure = undefined; searchMatches = undefined;
  mock.method(globalThis, 'fetch', () => { throw new Error('No external requests are permitted in discovery tests.'); });
  let clock = 0;
  const fetcher = (async (input: URL | string | Request) => {
    const url = new URL(String(input)); const endpoint = url.searchParams.get('function')!;
    const query = url.searchParams.get(endpoint === 'SYMBOL_SEARCH' ? 'keywords' : 'symbol')!;
    calls.push({ endpoint, query });
    if (endpoint === 'SYMBOL_SEARCH') {
      if (searchFailure) return Response.json(searchFailure);
      const known = /apple/i.test(query) ? [match('AAPL', 'Apple Inc')]
        : /broadcom|avgo/i.test(query) ? [match('AVGO', 'Broadcom Inc')]
          : /tesla|tsla/i.test(query) ? [match('TSLA', 'Tesla Inc')] : [];
      return Response.json({ bestMatches: searchMatches ?? known });
    }
    if (endpoint === 'GLOBAL_QUOTE') return Response.json({ 'Global Quote': { '01. symbol': query, '05. price': '250', '06. volume': '1000', '07. latest trading day': '2025-01-03' } });
    return Response.json({ 'Meta Data': { '2. Symbol': query }, 'Time Series (Daily)': {
      '2025-01-03': { '1. open': '245', '2. high': '255', '3. low': '240', '4. close': '250', '5. volume': '1000' },
      '2025-01-02': { '1. open': '240', '2. high': '250', '3. low': '235', '4. close': '245', '5. volume': '900' },
    } });
  }) as typeof fetch;
  app = createApp({ pool, config, marketProvider: alphaVantageProvider(config, fetcher, { now: () => clock, sleep: async milliseconds => { clock += milliseconds; } }) });
  investor = await user();
});
afterEach(() => { mock.restoreAll(); });
after(async () => { await pool.end(); });

test('investors discover Tesla and Broadcom, initialize real cache and use registered assets in portfolios and watchlists', async () => {
  const tesla = await discover('Tesla'); assert.equal(tesla.status, 200); assert.equal(tesla.body.data[0].symbol, 'TSLA');
  const broadcom = await discover('Broadcom'); assert.equal(broadcom.status, 200); assert.equal(broadcom.body.data[0].symbol, 'AVGO');
  const tslaId = tesla.body.data[0].id as string; const avgoId = broadcom.body.data[0].id as string;
  assert.equal(tesla.body.data[0].exchange, 'US');
  const metadata = await pool.query('SELECT provider_identifiers FROM assets WHERE id=$1', [tslaId]);
  assert.equal(metadata.rows[0].provider_identifiers.exchangeUnknown, true); assert.equal(metadata.rows[0].provider_identifiers.region, 'United States');
  const loaded = await initialize(tslaId); assert.equal(loaded.status, 200); assert.equal(loaded.body.data.cacheUsed, false); assert.equal(loaded.body.data.run.status, 'COMPLETED');
  assert.equal((await request(app).get(`/api/v1/assets/${tslaId}/quote`).set('Cookie', investor.cookie)).body.data.isDemo, false);
  const cached = await initialize(tslaId); assert.equal(cached.status, 200); assert.deepEqual(cached.body.data, { cacheUsed: true, run: null });
  assert.equal(calls.filter(call => call.query === 'TSLA').length, 2);
  const portfolio = await post('/portfolios', { name: 'Dynamic stocks' }); assert.equal(portfolio.status, 201);
  const trade = await post(`/portfolios/${portfolio.body.data.id}/transactions`, { type: 'BUY', assetId: tslaId, quantity: '0.5', price: '200', fees: '0', currency: 'USD', occurredAt: '2025-01-02T01:00:00.000Z', idempotencyKey: randomUUID() });
  assert.equal(trade.status, 201);
  const value = await request(app).get(`/api/v1/portfolios/${portfolio.body.data.id}/valuation`).set('Cookie', investor.cookie);
  assert.equal(value.body.data.totalValue, '125.00000000'); assert.equal(value.body.data.positions[0].symbol, 'TSLA');
  const watchlist = await post('/watchlists', { name: 'Dynamic favorites' }); assert.equal(watchlist.status, 201);
  const item = await post(`/watchlists/${watchlist.body.data.id}/items`, { assetId: avgoId }); assert.equal(item.status, 200); assert.equal(item.body.data.items[0].symbol, 'AVGO');
});

test('repeated and concurrent discovery reuses identities and the existing seeded Apple listing', async () => {
  const [first, second] = await Promise.all([discover('Tesla'), discover('Tesla')]);
  assert.equal(first.status, 200); assert.equal(second.status, 200); assert.equal(first.body.data[0].id, second.body.data[0].id);
  assert.equal(calls.filter(call => call.endpoint === 'SYMBOL_SEARCH').length, 1);
  assert.equal((await discover('TSLA')).body.data[0].id, first.body.data[0].id); assert.equal(calls.length, 1);
  const [one, two] = await Promise.all([discover('Broadcom'), discover('AVGO')]);
  assert.equal(one.status, 200); assert.equal(two.status, 200); assert.equal(one.body.data[0].id, two.body.data[0].id);
  assert.equal((await pool.query("SELECT count(*)::int AS total FROM assets WHERE symbol='AVGO'")).rows[0].total, 1);
  const apple = await discover('Apple Incorporated'); assert.equal(apple.status, 200); assert.equal(apple.body.data[0].exchange, 'NASDAQ');
  assert.equal((await pool.query("SELECT count(*)::int AS total FROM assets WHERE symbol='AAPL'")).rows[0].total, 1);
});

test('search filters foreign, non-USD, non-equity and malicious matches; negative results cache without reserving another request', async () => {
  searchMatches = [match('SAFE', '<script>alert(1)</script>'), match('BAD/URL', 'Invalid symbol'),
    { ...match('FOREIGN', 'Foreign'), '4. region': 'United Kingdom' }, { ...match('EURO', 'Euro'), '8. currency': 'EUR' },
    { ...match('FUND', 'Fund'), '3. type': 'Mutual Fund' }];
  const first = await discover('No valid equities'); assert.equal(first.status, 200); assert.deepEqual(first.body.data, []);
  const second = await discover('no valid equities'); assert.equal(second.status, 200); assert.deepEqual(second.body.data, []); assert.equal(calls.length, 1);
  assert.equal((await pool.query("SELECT count(*)::int AS total FROM assets WHERE exchange='US'")).rows[0].total, 0);
});

test('discovery and market initialization require authentication, CSRF, allowed origins and strict shapes', async () => {
  assert.equal((await request(app).post('/api/v1/assets/discover').set('Origin', config.frontendOrigin).send({ query: 'Tesla' })).status, 401);
  assert.equal((await request(app).post('/api/v1/assets/discover').set('Origin', config.frontendOrigin).set('Cookie', investor.cookie).send({ query: 'Tesla' })).status, 403);
  assert.equal((await request(app).post('/api/v1/assets/discover').set('Origin', 'https://evil.example').set('Cookie', investor.cookie).set('X-CSRF-Token', investor.csrf).send({ query: 'Tesla' })).status, 403);
  assert.equal((await discover('<script>')).status, 400); assert.equal((await post('/assets/discover', { query: 'Tesla', symbol: 'FAKE' })).status, 400);
  assert.equal((await initialize(randomUUID())).status, 404);
  assert.equal((await request(app).post(`/api/v1/assets/${randomUUID()}/market-data`).set('Origin', config.frontendOrigin).send({})).status, 401);
  const unmapped = await pool.query("INSERT INTO assets(symbol,name,exchange) VALUES('UNTRUSTED','Unvalidated stock','US') RETURNING id");
  assert.equal((await initialize(unmapped.rows[0].id)).status, 404);
  assert.equal(calls.length, 0);
  assert.equal((await request(app).get('/api/v1/market/runs').set('Cookie', investor.cookie)).status, 403);
});

test('provider failures are not negative-cached and disabled positive-cache entries do not return or reactivate assets', async () => {
  searchFailure = { Information: 'Daily request quota reached provider-secret-sentinel' };
  const failure = await discover('Tesla'); assert.equal(failure.status, 429); assert.equal(failure.body.error.code, 'MARKET_PROVIDER_QUOTA'); assert.equal(JSON.stringify(failure.body).includes('provider-secret-sentinel'), false);
  searchFailure = undefined; const recovered = await discover('Tesla'); assert.equal(recovered.status, 200); assert.equal(calls.length, 2);
  const id = recovered.body.data[0].id as string; await pool.query('UPDATE assets SET is_active=false WHERE id=$1', [id]);
  const disabled = await discover('Tesla'); assert.equal(disabled.status, 200); assert.deepEqual(disabled.body.data, []); assert.equal(calls.length, 2);
  assert.equal((await initialize(id)).status, 404); assert.equal((await pool.query('SELECT is_active FROM assets WHERE id=$1', [id])).rows[0].is_active, false);
});

test('search and initialization share the global request budget and completed caches bypass quota without outbound calls', async () => {
  const source = await pool.query(`INSERT INTO data_sources(name,source_type,config) VALUES($1,'MARKET','{"isDemo":false}') RETURNING id`, [ALPHA_VANTAGE_SOURCE]);
  await pool.query(`INSERT INTO ingestion_runs(source_id,job_type,status,finished_at,started_at)
    SELECT $1,'PROVIDER_REQUEST','COMPLETED',NOW()-INTERVAL '5 minutes',NOW()-INTERVAL '5 minutes' FROM generate_series(1,24)`, [source.rows[0].id]);
  const unavailable = await discover('Tesla'); assert.equal(unavailable.status, 429); assert.equal(unavailable.body.error.code, 'MARKET_REQUEST_BUDGET'); assert.equal(calls.length, 0);
  const apple = await discover('AAPL'); assert.equal(apple.status, 200); const id = apple.body.data[0].id as string;
  await pool.query(`INSERT INTO market_quotes(asset_id,source_id,price,currency,as_of) VALUES($1,$2,100,'USD',NOW()-INTERVAL '1 day')`, [id, source.rows[0].id]);
  await pool.query(`INSERT INTO market_price_bars(asset_id,source_id,bar_time,open,high,low,close) VALUES($1,$2,NOW()-INTERVAL '1 day',100,101,99,100)`, [id, source.rows[0].id]);
  const cached = await initialize(id); assert.equal(cached.status, 200); assert.deepEqual(cached.body.data, { cacheUsed: true, run: null }); assert.equal(calls.length, 0);
  const missing = await initialize('10000000-0000-4000-8000-000000000002'); assert.equal(missing.status, 429); assert.equal(missing.body.error.code, 'MARKET_REQUEST_BUDGET'); assert.equal(calls.length, 0);
});

test('concurrent initialization fetches a real quote/history once and preserves the 65-second refresh cooldown for another stock', async () => {
  const tsla = await discover('Tesla'); const avgo = await discover('Broadcom');
  const id = tsla.body.data[0].id as string;
  const [first, second] = await Promise.all([initialize(id), initialize(id)]);
  assert.equal(first.status, 200); assert.equal(second.status, 200); assert.equal(calls.filter(call => call.query === 'TSLA').length, 2);
  const blocked = await initialize(avgo.body.data[0].id); assert.equal(blocked.status, 429); assert.equal(blocked.body.error.code, 'MARKET_RATE_LIMIT');
  assert.equal(calls.filter(call => call.query === 'AVGO').length, 0);
  const count = await pool.query("SELECT count(*)::int AS total FROM ingestion_runs WHERE job_type='PROVIDER_REQUEST'"); assert.equal(count.rows[0].total, 4);
});


test('partial catalog matches do not hide an undiscovered exact stock symbol', async () => {
  searchMatches = [match('F', 'Ford Motor Company')];
  const result = await discover('F');
  assert.equal(result.status, 200); assert.equal(result.body.data[0].symbol, 'F');
  assert.equal(calls.filter(call => call.endpoint === 'SYMBOL_SEARCH').length, 1);
});
