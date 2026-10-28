import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import type { Pool } from 'pg';
import { createApp } from '../../src/app.js';
import { tokenHash } from '../../src/auth-context.js';
import { migrate } from '../../src/db/migrate.js';
import { createPool } from '../../src/db/pool.js';
import { assertDifferentDatabases, assertDisposableConnection, disposableDatabaseName } from '../../src/db/test-safety.js';
import { createTestPool, resetDatabase, testConfig } from './helpers.js';

const config = testConfig();
let pool: Pool;
before(() => { pool = createTestPool(); });
beforeEach(async () => { await resetDatabase(pool); });
after(async () => { await pool.end(); });

async function investor() {
  const token = randomBytes(32).toString('base64url');
  const user = await pool.query("INSERT INTO users(email) VALUES($1) RETURNING id", [`${randomUUID()}@example.test`]);
  await pool.query("INSERT INTO auth_sessions(user_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '1 hour')",
    [user.rows[0].id, tokenHash(token), randomBytes(32).toString('base64url')]);
  return `ifms_session=${token}`;
}

test('plan catalog requires a session and returns Free and unpublished Pro without user subscriptions', async () => {
  const app = createApp({ pool, config });
  assert.equal((await request(app).get('/api/v1/subscription-plans')).status, 401);
  const cookie = await investor();
  const result = await request(app).get('/api/v1/subscription-plans').set('Cookie', cookie);
  assert.equal(result.status, 200);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.deepEqual(result.body.data.map((plan: Record<string, unknown>) => ({ code: plan.code, name: plan.name, priceMonthly: plan.priceMonthly,
    currency: plan.currency, status: plan.status, displayOrder: plan.displayOrder })), [
    { code: 'free', name: 'Free', priceMonthly: '0.00', currency: 'USD', status: 'active', displayOrder: 0 },
    { code: 'pro', name: 'Pro', priceMonthly: null, currency: 'USD', status: 'coming_soon', displayOrder: 1 },
  ]);
  assert.equal((await request(app).get('/api/v1/portfolios').set('Cookie', cookie)).status, 200);
  assert.equal((await request(app).get('/api/v1/assets').set('Cookie', cookie)).status, 200);
  assert.equal((await request(app).post('/api/v1/subscription-plans').set('Cookie', cookie).set('Origin', config.frontendOrigin).send({ code: 'pro' })).status, 404);
});

test('catalog constraints reject negative prices, invented prices for coming-soon plans and unsupported currency/status', async () => {
  const invalid = [
    ['negative', '-1', 'USD', 'active', 2],
    ['unpublished', '10', 'USD', 'coming_soon', 2],
    ['missing_price', null, 'USD', 'active', 2],
    ['currency', '10', 'EUR', 'active', 2],
    ['status', '10', 'USD', 'available', 2],
    ['order', '10', 'USD', 'active', -1],
  ];
  for (const values of invalid) {
    await assert.rejects(pool.query(`INSERT INTO subscription_plans(code,name,description,price_monthly,currency,status,display_order)
      VALUES($1,'Invalid test plan','Test',$2,$3,$4,$5)`, values), { code: '23514' });
  }
  assert.equal((await pool.query('SELECT count(*)::int AS total FROM subscription_plans')).rows[0].total, 2);
});

test('normal migrations install both plans on a fresh disposable database and replay without duplicates', async () => {
  // This test creates and removes only its own generated database on the existing test server.
  await assertDisposableConnection(pool, disposableDatabaseName(config.databaseUrl));
  const name = `ifms_subscription_${randomUUID().replaceAll('-', '')}_test`;
  assert.match(name, /^ifms_subscription_[a-f0-9]{32}_test$/);
  const target = new URL(config.databaseUrl); target.pathname = `/${name}`;
  assertDifferentDatabases(target.toString(), config.databaseUrl);
  assertDifferentDatabases(target.toString(), process.env.DATABASE_URL);
  let fresh: Pool | undefined;
  let created = false;
  try {
    // name contains only the generated, validated identifier above; no owner input is interpolated.
    await pool.query(`CREATE DATABASE "${name}"`); created = true;
    fresh = createPool(target.toString());
    await assertDisposableConnection(fresh, name);
    await migrate(fresh);
    const first = await fresh.query('SELECT id,code,price_monthly::text,status FROM subscription_plans ORDER BY display_order,code');
    assert.deepEqual(first.rows.map(row => ({ code: row.code, price: row.price_monthly, status: row.status })), [
      { code: 'free', price: '0.00', status: 'active' }, { code: 'pro', price: null, status: 'coming_soon' },
    ]);
    await migrate(fresh);
    assert.deepEqual((await fresh.query('SELECT id,code,price_monthly::text,status FROM subscription_plans ORDER BY display_order,code')).rows, first.rows);
    assert.deepEqual((await fresh.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map(row => row.name),
      ['001_p1_foundation.sql', '002_subscription_plans.sql']);
    const domainTables = await fresh.query("SELECT count(*)::int AS total FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'");
    assert.equal(domainTables.rows[0].total, 22);
    assert.equal((await fresh.query('SELECT count(*)::int AS total FROM users')).rows[0].total, 0);
  } finally {
    await fresh?.end();
    if (created) await pool.query(`DROP DATABASE "${name}"`);
  }
});
