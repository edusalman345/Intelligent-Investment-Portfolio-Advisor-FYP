import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { HttpError } from '../errors.js';
import { alphaVantageProvider, type MarketBatch } from '../market-provider.js';
import { discoverAssets, ingestAsset } from '../market.js';
import { createPool } from './pool.js';

/** Explicit local operator command. It never seeds, substitutes fixtures or changes roles. */
async function main() {
  let pool: ReturnType<typeof createPool> | undefined;
  try {
    const config = loadConfig();
    const target = new URL(config.databaseUrl);
    const symbol = process.argv[2];
    if (config.nodeEnv !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
      || (target.port || '5432') !== '5432' || target.pathname !== '/fyp_portfolio_dev') {
      throw new HttpError(400, 'DEVELOPMENT_DATABASE_REQUIRED', 'This command requires the approved local development database.');
    }
    if (!symbol || !/^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)?$/.test(symbol) || symbol.length > 16 || process.argv.length !== 3) {
      throw new HttpError(400, 'SYMBOL_REQUIRED', 'Choose exactly one supported US/USD stock symbol.');
    }
    if (!config.alphaVantageApiKey.trim()) throw new HttpError(503, 'MARKET_NOT_CONFIGURED', 'Configure the provider key privately.');
    pool = createPool(config.databaseUrl);
    const connected = await pool.query('SELECT current_database() AS name');
    if (connected.rows[0]?.name !== 'fyp_portfolio_dev') throw new Error('Unexpected database');
    const real = alphaVantageProvider(config);
    const findAsset = () => pool!.query("SELECT id,symbol,name,exchange,currency,asset_type AS \"assetType\" FROM assets WHERE symbol=$1 AND currency='USD' AND asset_type='STOCK' AND provider_identifiers->>'alphaVantage'=symbol AND is_active", [symbol]);
    let asset = await findAsset();
    if (!asset.rowCount) { await discoverAssets(pool, real, symbol); asset = await findAsset(); }
    if (asset.rowCount !== 1) throw new HttpError(400, 'ASSET_NOT_FOUND', 'A unique provider-validated US/USD stock was not found.');
    let fetched: MarketBatch | undefined;
    const provider = { ...real, async fetch(...args: Parameters<typeof real.fetch>) { fetched = await real.fetch(...args); return fetched; } };
    const fetchedAt = new Date().toISOString();
    const run = await ingestAsset(pool, provider, asset.rows[0]);
    if (run.status !== 'COMPLETED' || !fetched) throw new HttpError(502, 'MARKET_DATA_INVALID', 'Ingestion did not pass data validation; inspect recorded quality issues.');
    const outputDir = fileURLToPath(new URL('../../../../.tmp/real-market/', import.meta.url));
    await mkdir(outputDir, { recursive: true });
    // Market observations only: no URLs, keys, provider messages, or account/session data.
    const evidence = { symbol, provider: real.name, isDemo: false, frequency: 'end-of-day', adjusted: false,
      fetchedAt, completedAt: new Date().toISOString(), runId: run.id, status: run.status,
      recordsReceived: run.recordsReceived, recordsWritten: run.recordsWritten, issueCount: run.issueCount };
    await writeFile(resolve(outputDir, `${symbol}.json`), JSON.stringify({ evidence, asset: asset.rows[0], batch: fetched }, null, 2) + '\n');
    process.stdout.write(JSON.stringify(evidence) + '\n');
  } catch (error) {
    // All HttpError messages in this path are application-owned; never serialize exceptions.
    const code = error instanceof HttpError ? error.code : 'MARKET_REFRESH_FAILED';
    process.stderr.write(JSON.stringify({ status: 'FAILED', code, cachedRecordsPreserved: true }) + '\n');
    process.exitCode = 1;
  } finally { await pool?.end(); }
}

void main();
