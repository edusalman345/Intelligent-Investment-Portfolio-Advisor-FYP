import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, afterEach, before, beforeEach, mock, test } from 'node:test';
import request from 'supertest';
import type { Pool } from 'pg';
import { createApp } from '../../src/app.js';
import { tokenHash } from '../../src/auth-context.js';
import { HttpError } from '../../src/errors.js';
import { DEMO_ASSETS } from '../../src/market.js';
import { alphaVantageProvider, type MarketAsset, type MarketBatch, type MarketProvider } from '../../src/market-provider.js';
import { createTestPool, resetDatabase, testConfig } from './helpers.js';

const config = testConfig();
const assetId = DEMO_ASSETS[0]!.id;
const missingAssetId = '90000000-0000-4000-8000-000000000099';
let pool: Pool;
let provider: FakeMarketProvider;
let app: ReturnType<typeof createApp>;

class FakeMarketProvider implements MarketProvider {
  name = 'Integration market fixture';
  isDemo = true;
  batch: MarketBatch = { quotes: [], bars: [] };
  failure: Error | undefined;
  calls: MarketAsset[] = [];
  async fetch(asset: MarketAsset): Promise<MarketBatch> {
    this.calls.push(asset);
    if (this.failure) throw this.failure;
    return this.batch;
  }
}

function hoursAgo(hours: number): string { return new Date(Date.now() - hours * 3_600_000).toISOString(); }
function quote(asOf = hoursAgo(1), volume: string | null = null, price = '201.50') {
  return { price, currency: 'USD', volume, asOf };
}
function bar(time = hoursAgo(2), volume: string | null = null) {
  return { time, open: '200', high: '203', low: '199', close: '201.50', volume };
}

// Exercise the real session loader with DB fixtures; password hashing is covered
// independently in the auth suite and need not be repeated for market behavior.
async function session(role: 'ADMIN' | 'INVESTOR' = 'ADMIN') {
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(32).toString('base64url');
  const user = await pool.query('INSERT INTO users(email,role) VALUES($1,$2) RETURNING id', [`${token.toLowerCase()}@example.test`, role]);
  await pool.query("INSERT INTO auth_sessions(user_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '1 hour')",
    [user.rows[0].id, tokenHash(token), csrf]);
  return { cookie: `ifms_session=${token}`, csrf };
}

async function refresh(actor: Awaited<ReturnType<typeof session>>) {
  return request(app).post('/api/v1/market/refresh').set('Origin', config.frontendOrigin)
    .set('Cookie', actor.cookie).set('X-CSRF-Token', actor.csrf).send({ assetId });
}

async function readQuote(actor: Awaited<ReturnType<typeof session>>) {
  const response = await request(app).get(`/api/v1/assets/${assetId}/quote`).set('Cookie', actor.cookie);
  assert.equal(response.status, 200);
  return response.body.data;
}

before(() => { pool = createTestPool(); });
beforeEach(async () => {
  await resetDatabase(pool);
  provider = new FakeMarketProvider();
  app = createApp({ pool, config, marketProvider: provider });
  mock.method(globalThis, 'fetch', () => { throw new Error('Integration tests must not make outbound provider calls.'); });
});
afterEach(() => { mock.restoreAll(); });
after(async () => { await pool.end(); });

test('mismatched external asset identity leaves cached quotes and history unchanged', async () => {
  const admin = await session();
  const cachedQuote = await readQuote(admin);
  const cachedHistory = await pool.query('SELECT * FROM market_price_bars WHERE asset_id=$1 ORDER BY bar_time', [assetId]);
  const fetcher: typeof fetch = async input => {
    const fn = new URL(String(input)).searchParams.get('function');
    return Response.json(fn === 'GLOBAL_QUOTE'
      ? { 'Global Quote': { '01. symbol': 'MSFT', '05. price': '999', '07. latest trading day': '2025-01-02' } }
      : { 'Meta Data': { '2. Symbol': 'AAPL' }, 'Time Series (Daily)': {} });
  };
  app = createApp({ pool, config, marketProvider: alphaVantageProvider({ ...config, alphaVantageApiKey: 'non-secret-test-sentinel' }, fetcher) });
  const response = await refresh(admin);
  assert.equal(response.status, 502);
  assert.equal(response.body.error.code, 'MARKET_IDENTITY_INVALID');
  assert.deepEqual(await readQuote(admin), cachedQuote);
  assert.deepEqual((await pool.query('SELECT * FROM market_price_bars WHERE asset_id=$1 ORDER BY bar_time', [assetId])).rows, cachedHistory.rows);
  const runs = await pool.query("SELECT status,records_written FROM ingestion_runs WHERE status='FAILED'");
  assert.equal(runs.rows.length, 1);
  assert.equal(runs.rows[0].records_written, 0);
});

test('market reads require a session, are available to investors, and never fetch from providers', async () => {
  const paths = ['/api/v1/assets', `/api/v1/assets/${assetId}`, `/api/v1/assets/${assetId}/quote`,
    `/api/v1/assets/${assetId}/history`, '/api/v1/market/economic', '/api/v1/market/status'];
  for (const path of paths) assert.equal((await request(app).get(path)).status, 401, path);
  const investor = await session('INVESTOR');
  for (const path of paths) assert.equal((await request(app).get(path).set('Cookie', investor.cookie)).status, 200, path);
  const search = await request(app).get('/api/v1/assets').query({ q: 'aApL' }).set('Cookie', investor.cookie);
  assert.deepEqual(search.body.data.map((asset: { symbol: string }) => asset.symbol), ['AAPL']);
  const wildcard = await request(app).get('/api/v1/assets').query({ q: '%' }).set('Cookie', investor.cookie);
  assert.deepEqual(wildcard.body.data, []);
  const economic = await request(app).get('/api/v1/market/economic').set('Cookie', investor.cookie);
  assert.ok(economic.body.data.length > 0);
  assert.ok(economic.body.data.every((item: { isDemo: boolean; asOf: string }) => item.isDemo && Date.parse(item.asOf) <= Date.now()));
  const status = await request(app).get('/api/v1/market/status').set('Cookie', investor.cookie);
  assert.equal(status.body.data.isDemo, true);
  assert.equal(status.body.data.configured, true);
  assert.deepEqual(provider.calls, []);
});

test('refresh and diagnostics require administrators and refresh requires CSRF and allowed origin', async () => {
  const investor = await session('INVESTOR');
  const admin = await session();
  for (const path of ['/api/v1/market/runs', '/api/v1/market/issues']) {
    assert.equal((await request(app).get(path)).status, 401);
    assert.equal((await request(app).get(path).set('Cookie', investor.cookie)).status, 403);
    assert.equal((await request(app).get(path).set('Cookie', admin.cookie)).status, 200);
  }
  assert.equal((await request(app).post('/api/v1/market/refresh').set('Origin', config.frontendOrigin).send({ assetId })).status, 401);
  assert.equal((await refresh(investor)).status, 403);
  const withoutCsrf = await request(app).post('/api/v1/market/refresh').set('Origin', config.frontendOrigin).set('Cookie', admin.cookie).send({ assetId });
  assert.equal(withoutCsrf.status, 403);
  assert.equal(withoutCsrf.body.error.code, 'CSRF_INVALID');
  assert.equal((await request(app).post('/api/v1/market/refresh').set('Origin', config.frontendOrigin).set('Cookie', admin.cookie)
    .set('X-CSRF-Token', 'wrong').send({ assetId })).status, 403);
  assert.equal((await request(app).post('/api/v1/market/refresh').set('Origin', 'https://evil.example').set('Cookie', admin.cookie)
    .set('X-CSRF-Token', admin.csrf).send({ assetId })).status, 403);
  assert.deepEqual(provider.calls, []);
  assert.equal((await refresh(admin)).status, 200);
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0]!.id, assetId);
});

test('ingestion persists exact decimals and distinguishes missing volume from zero', async () => {
  const admin = await session();
  const latest = hoursAgo(1), earlier = hoursAgo(2);
  provider.batch = { quotes: [quote(latest, null, '201.12345678'), quote(earlier, '0')],
    bars: [bar(hoursAgo(4), null), bar(hoursAgo(3), '0')] };
  const response = await refresh(admin);
  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, 'COMPLETED');
  assert.equal(response.body.data.recordsReceived, 4);
  assert.equal(response.body.data.recordsWritten, 4);
  assert.equal(response.body.data.issueCount, 0);
  const storedQuotes = await pool.query(`SELECT price::text,volume::text,as_of FROM market_quotes q JOIN data_sources s ON s.id=q.source_id
    WHERE s.name=$1 ORDER BY as_of DESC`, [provider.name]);
  assert.equal(storedQuotes.rows[0].price, '201.12345678');
  assert.equal(storedQuotes.rows[0].volume, null);
  assert.equal(storedQuotes.rows[1].volume, '0.0000');
  const storedBars = await pool.query(`SELECT volume::text FROM market_price_bars b JOIN data_sources s ON s.id=b.source_id
    WHERE s.name=$1 ORDER BY bar_time`, [provider.name]);
  assert.deepEqual(storedBars.rows.map(row => row.volume), [null, '0.0000']);
  const cached = await readQuote(admin);
  assert.equal(cached.price, '201.12345678');
  assert.equal(cached.volume, null);
  assert.equal(cached.asOf, latest);
  assert.equal(cached.source, provider.name);
  assert.equal(cached.isStale, false);
});

test('duplicates preserve original records and stale or out-of-order data yields durable issues', async () => {
  const admin = await session();
  const old = hoursAgo(100), newerBar = hoursAgo(5), olderBar = hoursAgo(6);
  provider.batch = { quotes: [quote(old, '0', '100'), quote(old, '0', '999')],
    bars: [bar(newerBar), bar(olderBar), { ...bar(newerBar), close: '202' }] };
  const response = await refresh(admin);
  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, 'COMPLETED');
  assert.equal(response.body.data.recordsWritten, 3);
  const issues = await pool.query('SELECT issue_code,severity FROM data_quality_issues WHERE ingestion_run_id=$1', [response.body.data.id]);
  assert.equal(issues.rows.filter(row => row.issue_code === 'DUPLICATE_RECORD').length, 2);
  assert.equal(issues.rows.filter(row => row.issue_code === 'STALE_RECORD').length, 2);
  assert.equal(issues.rows.filter(row => row.issue_code === 'OUT_OF_ORDER').length, 1);
  const stored = await pool.query(`SELECT price::text FROM market_quotes q JOIN data_sources s ON s.id=q.source_id WHERE s.name=$1`, [provider.name]);
  assert.equal(stored.rows.length, 1);
  assert.equal(stored.rows[0].price, '100.00000000');
  const bars = await pool.query(`SELECT close::text FROM market_price_bars b JOIN data_sources s ON s.id=b.source_id WHERE s.name=$1 AND bar_time=$2`, [provider.name, newerBar]);
  assert.equal(bars.rows[0].close, '201.50000000');
  const repeat = await refresh(admin);
  assert.equal(repeat.body.data.recordsWritten, 0);
  assert.equal((await pool.query(`SELECT count(*)::int AS total FROM market_price_bars b JOIN data_sources s ON s.id=b.source_id WHERE s.name=$1`, [provider.name])).rows[0].total, 2);
});

test('mixed batches quarantine invalid records, commit valid records and retain failure diagnostics', async () => {
  const admin = await session();
  const latest = hoursAgo(1);
  provider.batch = { quotes: [quote(latest), { ...quote(hoursAgo(2)), price: '-1' }, { ...quote(hoursAgo(3)), currency: 'EUR' }],
    bars: [bar(hoursAgo(4)), { ...bar(hoursAgo(5)), high: '1' }, { ...bar(hoursAgo(6)), volume: '-10' }] };
  const response = await refresh(admin);
  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, 'FAILED');
  assert.equal(response.body.data.recordsReceived, 6);
  assert.equal(response.body.data.recordsWritten, 2);
  assert.equal(response.body.data.issueCount, 4);
  const issues = await request(app).get('/api/v1/market/issues').set('Cookie', admin.cookie);
  const runIssues = issues.body.data.filter((issue: { ingestionRunId: string }) => issue.ingestionRunId === response.body.data.id);
  assert.equal(runIssues.length, 4);
  assert.ok(runIssues.every((issue: { severity: string }) => issue.severity === 'ERROR'));
  assert.equal((await readQuote(admin)).asOf, latest);
  const counts = await pool.query(`SELECT (SELECT count(*)::int FROM market_quotes WHERE source_id=s.id) AS quotes,
    (SELECT count(*)::int FROM market_price_bars WHERE source_id=s.id) AS bars FROM data_sources s WHERE name=$1`, [provider.name]);
  assert.deepEqual(counts.rows[0], { quotes: 1, bars: 1 });
});

test('malformed batches and provider failure preserve the last good quote and history', async () => {
  const admin = await session();
  const cached = await readQuote(admin);
  const originalHistory = await request(app).get(`/api/v1/assets/${assetId}/history`).set('Cookie', admin.cookie);
  const future = new Date(Date.now() + 86_400_000).toISOString();
  provider.batch = { quotes: [quote(future), { ...quote(), price: 'not-a-price', rawSecret: 'provider-secret-sentinel' }],
    bars: [bar(future), { ...bar(), high: '1' }] };
  const invalid = await refresh(admin);
  assert.equal(invalid.status, 200);
  assert.equal(invalid.body.data.status, 'FAILED');
  assert.equal(invalid.body.data.recordsWritten, 0);
  assert.equal(invalid.body.data.issueCount, 4);
  assert.deepEqual(await readQuote(admin), cached);
  provider.batch = { quotes: Array.from({ length: 6 }, () => quote()), bars: [] };
  const oversized = await refresh(admin);
  assert.equal(oversized.status, 502);
  assert.equal(oversized.body.error.code, 'MARKET_BATCH_INVALID');
  provider.failure = new HttpError(502, 'MARKET_PROVIDER_UNAVAILABLE', 'Market provider unavailable. Cached data remains available.');
  const unavailable = await refresh(admin);
  assert.equal(unavailable.status, 502);
  assert.equal(unavailable.body.error.code, 'MARKET_PROVIDER_UNAVAILABLE');
  assert.deepEqual(await readQuote(admin), cached);
  const history = await request(app).get(`/api/v1/assets/${assetId}/history`).set('Cookie', admin.cookie);
  assert.deepEqual(history.body.data, originalHistory.body.data);
  const runs = await pool.query(`SELECT status,finished_at,error_summary FROM ingestion_runs r JOIN data_sources s ON s.id=r.source_id WHERE s.name=$1`, [provider.name]);
  assert.equal(runs.rows.length, 3);
  assert.ok(runs.rows.every(run => run.status === 'FAILED' && run.finished_at && run.error_summary));
  const diagnostics = await request(app).get('/api/v1/market/issues').set('Cookie', admin.cookie);
  assert.equal(JSON.stringify(diagnostics.body).includes('provider-secret-sentinel'), false);
});

test('latest quote and historical/economic reads exclude future observations already stored in the DB', async () => {
  const investor = await session('INVESTOR');
  const cached = await readQuote(investor);
  const source = await pool.query("SELECT id FROM data_sources WHERE source_type='MARKET' ORDER BY name LIMIT 1");
  await pool.query(`INSERT INTO market_quotes(asset_id,source_id,price,currency,volume,as_of) VALUES($1,$2,999,'USD',0,NOW()+INTERVAL '1 day')`, [assetId, source.rows[0].id]);
  await pool.query(`INSERT INTO market_quotes(asset_id,source_id,price,currency,volume,as_of,is_valid) VALUES($1,$2,888,'USD',0,NOW()-INTERVAL '1 second',false)`, [assetId, source.rows[0].id]);
  await pool.query(`INSERT INTO market_price_bars(asset_id,source_id,bar_time,open,high,low,close,volume) VALUES($1,$2,NOW()+INTERVAL '1 day',900,999,800,950,0)`, [assetId, source.rows[0].id]);
  await pool.query(`INSERT INTO economic_observations(indicator_id,observation_time,value) SELECT id,NOW()+INTERVAL '1 day',999 FROM economic_indicators LIMIT 1`);
  assert.deepEqual(await readQuote(investor), cached);
  const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const history = await request(app).get(`/api/v1/assets/${assetId}/history`).query({ to: tomorrow }).set('Cookie', investor.cookie);
  assert.equal(history.status, 200);
  assert.ok(history.body.data.length > 0);
  assert.ok(history.body.data.every((item: { time: string }) => Date.parse(item.time) <= Date.now()));
  const economic = await request(app).get('/api/v1/market/economic').set('Cookie', investor.cookie);
  assert.ok(economic.body.data.every((item: { asOf: string }) => Date.parse(item.asOf) <= Date.now()));
  assert.deepEqual(provider.calls, []);
});

test('invalid assets and unordered, excessive or nonexistent calendar ranges are rejected', async () => {
  const admin = await session();
  assert.equal((await request(app).get('/api/v1/assets/not-a-uuid').set('Cookie', admin.cookie)).status, 400);
  for (const suffix of ['', '/quote', '/history']) {
    assert.equal((await request(app).get(`/api/v1/assets/${missingAssetId}${suffix}`).set('Cookie', admin.cookie)).status, 404);
  }
  for (const range of [{ from: '2025-02-30' }, { from: '2025-05-02', to: '2025-05-01' },
    { from: '2000-01-01', to: '2025-01-01' }, { interval: '1m' }]) {
    assert.equal((await request(app).get(`/api/v1/assets/${assetId}/history`).query(range).set('Cookie', admin.cookie)).status, 400);
  }
  assert.equal((await request(app).post('/api/v1/market/refresh').set('Origin', config.frontendOrigin).set('Cookie', admin.cookie)
    .set('X-CSRF-Token', admin.csrf).send({ assetId, apiKey: 'untrusted' })).status, 400);
  assert.equal((await request(app).post('/api/v1/market/refresh').set('Origin', config.frontendOrigin).set('Cookie', admin.cookie)
    .set('X-CSRF-Token', admin.csrf).send({ assetId: missingAssetId })).status, 404);
  assert.deepEqual(provider.calls, []);
});

test('free provider cooldown and rolling budget count failed attempts before permitting more work', async () => {
  const admin = await session();
  provider.isDemo = false;
  provider.failure = new HttpError(502, 'MARKET_PROVIDER_UNAVAILABLE', 'Provider unavailable.');
  assert.equal((await refresh(admin)).status, 502);
  assert.equal(provider.calls.length, 1);
  const cooldown = await refresh(admin);
  assert.equal(cooldown.status, 429);
  assert.equal(cooldown.body.error.code, 'MARKET_RATE_LIMIT');
  assert.equal(provider.calls.length, 1);
  await pool.query(`UPDATE ingestion_runs SET started_at=NOW()-INTERVAL '66 seconds' WHERE source_id=(SELECT id FROM data_sources WHERE name=$1)`, [provider.name]);
  provider.failure = undefined;
  provider.batch = { quotes: [quote()], bars: [] };
  assert.equal((await refresh(admin)).status, 200);
  assert.equal(provider.calls.length, 2);
  await pool.query(`UPDATE ingestion_runs SET started_at=NOW()-INTERVAL '2 minutes' WHERE source_id=(SELECT id FROM data_sources WHERE name=$1)`, [provider.name]);
  await pool.query(`INSERT INTO ingestion_runs(source_id,job_type,status,started_at,finished_at)
    SELECT s.id,'ASSET_REFRESH','FAILED',NOW()-INTERVAL '10 minutes',NOW()-INTERVAL '9 minutes'
    FROM data_sources s CROSS JOIN generate_series(1,10) WHERE s.name=$1`, [provider.name]);
  const exhausted = await refresh(admin);
  assert.equal(exhausted.status, 429);
  assert.equal(exhausted.body.error.code, 'MARKET_RATE_LIMIT');
  assert.equal(provider.calls.length, 2);
  const attempts = await pool.query(`SELECT count(*)::int AS total FROM ingestion_runs r JOIN data_sources s ON s.id=r.source_id WHERE s.name=$1`, [provider.name]);
  assert.equal(attempts.rows[0].total, 12);
});
