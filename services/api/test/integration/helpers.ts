import type { Pool } from 'pg';
import { createPool } from '../../src/db/pool.js';
import { migrate } from '../../src/db/migrate.js';
import { seedMarket } from '../../src/market.js';
import { loadConfig, type AppConfig } from '../../src/config.js';
import { assertDifferentDatabases, assertDisposableConnection, disposableDatabaseName } from '../../src/db/test-safety.js';

export function createTestPool(): Pool {
  const url=process.env.TEST_DATABASE_URL;
  if(!url) throw new Error('TEST_DATABASE_URL must point to a disposable database ending in _test.');
  disposableDatabaseName(url);
  assertDifferentDatabases(url,process.env.DATABASE_URL);
  return createPool(url);
}
export function testConfig(): AppConfig {
  return loadConfig({NODE_ENV:'test',DATABASE_URL:process.env.TEST_DATABASE_URL,FRONTEND_ORIGIN:'http://localhost:5173',MARKET_PROVIDER:'fixture',MAIL_OUTPUT_DIR:'.tmp/test-mail'});
}
export async function resetDatabase(pool: Pool): Promise<void> {
  await assertDisposableConnection(pool,disposableDatabaseName(process.env.TEST_DATABASE_URL ?? ''));
  await migrate(pool);
  await pool.query(`TRUNCATE users,assets,data_sources RESTART IDENTITY CASCADE`);
  await seedMarket(pool);
}
