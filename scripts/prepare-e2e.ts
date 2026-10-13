import { createPool } from '../services/api/src/db/pool.js';
import { migrate } from '../services/api/src/db/migrate.js';
import { seedMarket } from '../services/api/src/market.js';
import { assertDifferentDatabases, assertDisposableConnection, disposableDatabaseName } from '../services/api/src/db/test-safety.js';
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
  process.stdout.write('Disposable browser database prepared.\n');
} finally {await pool.end();}
