import { z } from 'zod';
import { loadConfig } from '../config.js';
import { createPool } from './pool.js';
const config=loadConfig();
if(config.nodeEnv==='production') throw new Error('Local administrator bootstrap is disabled in production.');
const email=z.string().trim().max(254).email().transform(v=>v.toLowerCase()).parse(process.argv[2]);
const pool=createPool(config.databaseUrl);
const client=await pool.connect();
try {
  await client.query('BEGIN');
  const result=await client.query(`UPDATE users SET role='ADMIN',updated_at=NOW() WHERE email=$1 AND status='ACTIVE' RETURNING id`,[email]);
  if(!result.rowCount) throw new Error('Create the local account before granting its role.');
  await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES($1,'LOCAL_ADMIN_BOOTSTRAP','user',$1)`,[result.rows[0].id]);
  await client.query('COMMIT');process.stdout.write('Local administrator role granted.\n');
} catch {await client.query('ROLLBACK');process.stderr.write('Local role bootstrap failed. Verify account and database configuration.\n');process.exitCode=1;}
finally {client.release();await pool.end();}
