import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { createPool } from './pool.js';
import { loadConfig } from '../config.js';
export const migrationDir = fileURLToPath(new URL('../../../../database/migrations/', import.meta.url));
export async function migrate(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(7402301)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of (await readdir(migrationDir)).filter(n => /^\d+_[a-z0-9_]+\.sql$/.test(n)).sort()) {
      const sql = await readFile(resolve(migrationDir, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const old = await client.query<{checksum: string}>('SELECT checksum FROM schema_migrations WHERE name=$1',[name]);
      if (old.rows[0]) {
        if (old.rows[0].checksum !== checksum) throw new Error('An applied migration changed. Add a new migration instead.');
        continue;
      }
      await client.query('BEGIN');
      try { await client.query(sql); await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,checksum]); await client.query('COMMIT'); }
      catch (error) { await client.query('ROLLBACK'); throw error; }
    }
  } finally { await client.query('SELECT pg_advisory_unlock(7402301)').catch(() => undefined); client.release(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pool = createPool(loadConfig().databaseUrl);
  try { await migrate(pool); console.log('Database migrations applied.'); }
  catch { console.error('Migration failed. Check database access and migration compatibility; no credentials are logged.'); process.exitCode = 1; }
  finally { await pool.end(); }
}
