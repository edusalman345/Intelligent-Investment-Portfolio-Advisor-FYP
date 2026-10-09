import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { createPool } from './pool.js';
import { seedMarket } from '../market.js';
export { seedMarket };
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pool=createPool(loadConfig().databaseUrl);
  try { await seedMarket(pool); process.stdout.write('Synthetic demo asset, price and economic fixtures seeded. No user credentials created.\n'); }
  catch { process.stderr.write('Demo seed failed. Verify database configuration and migrations.\n'); process.exitCode=1; }
  finally { await pool.end(); }
}
