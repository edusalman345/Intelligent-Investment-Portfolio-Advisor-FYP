import { createPool } from '../services/api/src/db/pool.js';
import { migrate } from '../services/api/src/db/migrate.js';
import { seedMarket } from '../services/api/src/market.js';
import { assertDifferentDatabases, assertDisposableConnection, disposableDatabaseName } from '../services/api/src/db/test-safety.js';
import { readFile } from 'node:fs/promises';
import { DEMO_ASSETS } from '../services/api/src/market.js';
import { barSchema, quoteSchema } from '../services/api/src/market-provider.js';
const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl) throw new Error('Browser tests require a disposable DATABASE_URL ending in _test.');
const name=disposableDatabaseName(databaseUrl);
assertDifferentDatabases(databaseUrl,process.env.TEST_DATABASE_URL);
const pool=createPool(databaseUrl);
try {
  await assertDisposableConnection(pool,name);
  await migrate(pool);
  await pool.query('TRUNCATE users,assets,data_sources RESTART IDENTITY CASCADE');
  await seedMarket(pool);
  if (process.env.E2E_REAL_MARKET === '1') {
    // Replay only validated, genuinely fetched market observations into this disposable DB.
    // No external requests, owner accounts, or private API configuration enter browser tests.
    const source = await pool.query(`INSERT INTO data_sources(name,source_type,config)
      VALUES('Alpha Vantage free daily data','MARKET','{"isDemo":false,"frequency":"end-of-day","adjusted":false}')
      ON CONFLICT(name,source_type) DO UPDATE SET config=EXCLUDED.config RETURNING id`);
    for (const symbol of ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AVGO']) {
      const recorded = JSON.parse(await readFile(new URL(`../.tmp/real-market/${symbol}.json`, import.meta.url), 'utf8'));
      const asset = DEMO_ASSETS.find(asset => asset.symbol === symbol) ?? recorded.asset;
      if (!asset || asset.symbol !== symbol || asset.currency !== 'USD' && !DEMO_ASSETS.some(seed => seed.symbol === symbol)) throw new Error('Validated recorded asset metadata is required.');
      if (!DEMO_ASSETS.some(seed => seed.symbol === symbol)) await pool.query(`INSERT INTO assets(id,symbol,name,asset_type,exchange,currency,provider_identifiers)
        VALUES($1,$2,$3,'STOCK',$4,'USD',$5) ON CONFLICT(symbol,exchange) DO NOTHING`, [asset.id, symbol, asset.name, asset.exchange, JSON.stringify({alphaVantage:symbol})]);
      const saved = JSON.parse(await readFile(new URL(`../.tmp/real-market/${asset.symbol}.json`, import.meta.url), 'utf8'));
      if (saved.evidence?.symbol !== asset.symbol || saved.evidence?.isDemo !== false || saved.evidence?.status !== 'COMPLETED') {
        throw new Error('Real browser acceptance requires validated provider evidence for every supported asset.');
      }
      const quotes = saved.batch.quotes.map((value: unknown) => quoteSchema.parse(value));
      const bars = saved.batch.bars.map((value: unknown) => barSchema.parse(value));
      if (!quotes.length || !bars.length) throw new Error('Real provider quote and daily history are required.');
      await pool.query('BEGIN');
      try {
        for (const q of quotes) await pool.query(`INSERT INTO market_quotes(asset_id,source_id,price,currency,volume,as_of,ingested_at)
          VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(asset_id,source_id,as_of) DO NOTHING`,
        [asset.id,source.rows[0].id,q.price,q.currency,q.volume,q.asOf,saved.evidence.completedAt]);
        for (const b of bars) await pool.query(`INSERT INTO market_price_bars(asset_id,source_id,bar_time,open,high,low,close,volume,ingested_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(asset_id,source_id,interval,bar_time) DO NOTHING`,
        [asset.id,source.rows[0].id,b.time,b.open,b.high,b.low,b.close,b.volume,saved.evidence.completedAt]);
        await pool.query('COMMIT');
      } catch (error) { await pool.query('ROLLBACK'); throw error; }
    }
    process.stdout.write('Recorded real provider observations loaded; synthetic data remains separately labelled and excluded in real mode.\n');
  }
  process.stdout.write('Disposable browser database prepared.\n');
} finally {await pool.end();}
