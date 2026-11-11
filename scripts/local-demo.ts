import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../services/api/src/config.js';
import { createPool } from '../services/api/src/db/pool.js';
import { migrate } from '../services/api/src/db/migrate.js';
import { assertLocalDemoConfig, LocalDemoError } from './local-demo-config.js';

async function main() {
  if (process.versions.node.split('.')[0] !== '24') throw new LocalDemoError('LOCAL_NODE_24_REQUIRED');
  const mode = process.argv[2];
  if (!['check', 'migrate', 'start'].includes(mode ?? '')) throw new LocalDemoError('LOCAL_COMMAND_INVALID');
  const config = loadConfig();
  assertLocalDemoConfig(config);
  const pool = createPool(config.databaseUrl);
  try {
    const connected = await pool.query('SELECT current_database() AS name');
    if (connected.rows[0]?.name !== 'fyp_portfolio_dev') throw new LocalDemoError('LOCAL_DATABASE_IDENTITY_REJECTED');
    if (mode === 'migrate') await migrate(pool);
    const ready = await pool.query(`SELECT count(*)=2 AS ready FROM schema_migrations
      WHERE name IN ('001_p1_foundation.sql','002_subscription_plans.sql')`);
    if (!ready.rows[0]?.ready) throw new LocalDemoError('LOCAL_MIGRATIONS_REQUIRED');
    console.log('PASS: approved local database connected; migrations 001 and 002 recorded.');
    console.log(`Google OAuth configured: ${Boolean(config.googleClientId && config.googleClientSecret)}; real market provider configured: true.`);
  } finally { await pool.end(); }
  if (mode !== 'start') return;
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new LocalDemoError('LOCAL_START_USE_NPM_RUN_DEMO');
  const root = fileURLToPath(new URL('../', import.meta.url));
  // Build the API for a predictable demo startup; development cookie/config
  // behavior remains selected by NODE_ENV, independently of compilation.
  await new Promise<void>((done, reject) => {
    const build = spawn(process.execPath, [npmCli, 'run', 'build', '-w', '@ifms/api'],
      { cwd: root, stdio: 'inherit', env: process.env });
    build.once('error', () => reject(new LocalDemoError('LOCAL_API_BUILD_FAILED')));
    build.once('exit', code => code === 0 ? done() : reject(new LocalDemoError('LOCAL_API_BUILD_FAILED')));
  });
  console.log('Starting IIPA: http://localhost:5173; API http://localhost:3001.');
  const services = [
    spawn(process.execPath, [resolve(root, 'services/api/dist/server.js')], { cwd: root, stdio: 'inherit', env: process.env }),
    spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'],
      { cwd: resolve(root, 'apps/web'), stdio: 'inherit', env: process.env }),
  ];
  let stopping = false;
  const stop = (code: number) => {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    for (const service of services) if (service.exitCode === null) service.kill('SIGTERM');
  };
  process.once('SIGINT', () => stop(0));
  process.once('SIGTERM', () => stop(0));
  for (const service of services) {
    service.once('error', () => { console.error('LOCAL_START_FAILED: see LOCAL_DEMO_SETUP.md.'); stop(1); });
    service.once('exit', code => stop(code ?? 1));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const code = error instanceof LocalDemoError ? error.code : 'LOCAL_DEMO_FAILED';
    console.error(`${code}: review LOCAL_DEMO_SETUP.md; private configuration and exception details suppressed.`);
    process.exitCode = 1;
  });
}
