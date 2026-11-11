import process from 'node:process';
import console from 'node:console';
import { resolve } from 'node:path';
import { URL } from 'node:url';
import pg from 'pg';
import { readArchive } from './export-market.mjs';

async function main() {
  let pool;
  let client;
  try {
    if (process.argv.length !== 3) throw new Error('Archive filename required');
    const url = new URL(process.env.DATABASE_URL || '');
    const name = decodeURIComponent(url.pathname.slice(1));
    const peer = process.env.NODE_ENV === 'production' && name === 'iipa_demo' && url.hostname === 'localhost' && decodeURIComponent(url.username) === 'iipa' && !url.password && url.searchParams.size === 1 && url.searchParams.get('host') === '/var/run/postgresql';
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || (url.search && !peer)) throw new Error('Connection overrides are not permitted');
    const approved = name === 'iipa_demo' || (process.env.NODE_ENV === 'test' && name.endsWith('_test'));
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !approved || !['production', 'test'].includes(process.env.NODE_ENV)) throw new Error('Dedicated loopback demo database required');
    const recording = await readArchive(resolve(process.argv[2]));
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
    client = await pool.connect();
    const connected = await client.query('SELECT current_database() AS name');
    if (connected.rows[0].name !== name) throw new Error('Unexpected database');
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(7402302)');
    const source = await client.query(`INSERT INTO data_sources(name,source_type,base_url,config) VALUES($1,'MARKET','https://www.alphavantage.co',$2)
      ON CONFLICT(name,source_type) DO UPDATE SET config=data_sources.config || EXCLUDED.config RETURNING id`, [recording.source, JSON.stringify({ isDemo: false, frequency: 'end-of-day', adjusted: false, archiveImport: true })]);
    const sourceId = source.rows[0].id;
    const run = await client.query(`INSERT INTO ingestion_runs(source_id,job_type,status,records_received) VALUES($1,'ARCHIVE_IMPORT','RUNNING',505) RETURNING id`, [sourceId]);
    let written = 0;
    for (const value of recording.assets) {
      const a = value.asset;
      const metadata = { alphaVantage: a.symbol, archiveFetchedAt: value.fetchedAt, archiveRecordedAt: value.recordedAt, ...(a.exchange === 'US' ? { region: 'United States', exchangeUnknown: true } : {}) };
      const found = await client.query(`INSERT INTO assets(id,symbol,name,asset_type,exchange,currency,provider_identifiers) VALUES($1,$2,$3,'STOCK',$4,'USD',$5)
        ON CONFLICT(symbol,exchange) DO UPDATE SET provider_identifiers=assets.provider_identifiers || EXCLUDED.provider_identifiers RETURNING id`, [a.id, a.symbol, a.name, a.exchange, JSON.stringify(metadata)]);
      const id = found.rows[0].id;
      for (const q of value.quotes) {
        const result = await client.query(`INSERT INTO market_quotes(asset_id,source_id,price,currency,volume,as_of,ingested_at) VALUES($1,$2,$3,'USD',$4,$5,$6)
          ON CONFLICT(asset_id,source_id,as_of) DO NOTHING`, [id, sourceId, q.price, q.volume, q.asOf, value.recordedAt]);
        written += result.rowCount;
      }
      for (const b of value.bars) {
        const result = await client.query(`INSERT INTO market_price_bars(asset_id,source_id,bar_time,open,high,low,close,volume,ingested_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT(asset_id,source_id,interval,bar_time) DO NOTHING`, [id, sourceId, b.time, b.open, b.high, b.low, b.close, b.volume, value.recordedAt]);
        written += result.rowCount;
      }
    }
    await client.query(`UPDATE ingestion_runs SET status='COMPLETED',finished_at=NOW(),records_written=$2,error_summary='Recorded actual provider data imported; no fresh provider fetch performed.' WHERE id=$1`, [run.rows[0].id, written]);
    await client.query('COMMIT');
    console.log(`PASS: imported/reused five real-market assets; ${written} new observations. Original provider timestamps preserved; no provider requests or user data imported.`);
  } catch {
    await client?.query('ROLLBACK').catch(() => {});
    console.error('Market archive import failed; transaction rolled back and private details suppressed. Verify the built API, archive, dedicated database and migrations.');
    process.exitCode = 1;
  } finally { client?.release(); await pool?.end(); }
}
await main();
