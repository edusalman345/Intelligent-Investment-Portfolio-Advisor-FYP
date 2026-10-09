import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import type { Pool } from 'pg';
import { createApp } from '../../src/app.js';
import { createTestPool, resetDatabase, testConfig } from './helpers.js';

const config = testConfig();
let pool: Pool;

before(() => { pool = createTestPool(); });
after(async () => { await pool.end(); });

test('readiness requires a recorded foundation migration in the connected database', async () => {
  await resetDatabase(pool);
  const ready = await request(createApp({ pool, config })).get('/ready');
  assert.equal(ready.status, 200);
  assert.deepEqual(ready.body, { data: { status: 'ready', database: 'connected' } });
  assert.equal((await pool.query("SELECT name FROM schema_migrations WHERE name='001_p1_foundation.sql'")).rowCount, 1);
  const unmigrated = { query: async () => ({ rows: [{ migrated: false }] }) } as unknown as Pool;
  const waiting = await request(createApp({ pool: unmigrated, config })).get('/ready');
  assert.equal(waiting.status, 503);
  assert.deepEqual(waiting.body, { data: { status: 'not-ready' } });
});

test('process health needs no database and unavailable readiness reveals no failure details', async () => {
  let queries = 0;
  const unavailable = { query: async () => { queries++; throw new Error('postgresql://private-user:private-password@database/private-db'); } } as unknown as Pool;
  const app = createApp({ pool: unavailable, config });
  const health = await request(app).get('/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { data: { status: 'ok', service: 'ifms-api', phase: 'P1 Mid' } });
  assert.equal(queries, 0);
  const ready = await request(app).get('/ready');
  assert.equal(ready.status, 503);
  assert.deepEqual(ready.body, { data: { status: 'not-ready' } });
  assert.equal(queries, 1);
  assert.equal(JSON.stringify(ready.body).includes('private-password'), false);
});

test('security headers, credentialed CORS and origin restrictions precede API handlers', async () => {
  const app = createApp({ pool, config });
  const health = await request(app).get('/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers['x-powered-by'], undefined);
  assert.equal(health.headers['x-content-type-options'], 'nosniff');
  assert.equal(health.headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(health.headers['referrer-policy'], 'no-referrer');
  assert.ok(health.headers['content-security-policy']);
  assert.match(health.headers['x-request-id'], /^[a-f0-9-]{36}$/);
  const allowed = await request(app).get('/api/v1/auth/session').set('Origin', config.frontendOrigin);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers['access-control-allow-origin'], config.frontendOrigin);
  assert.equal(allowed.headers['access-control-allow-credentials'], 'true');
  assert.equal(allowed.headers['cache-control'], 'no-store');
  const preflight = await request(app).options('/api/v1/market/refresh').set('Origin', config.frontendOrigin)
    .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'Content-Type,X-CSRF-Token');
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers['access-control-allow-headers'], /X-CSRF-Token/i);
  const rejected = await request(app).get('/api/v1/auth/session').set('Origin', 'https://evil.example');
  assert.equal(rejected.status, 403);
  assert.equal(rejected.body.error.code, 'ORIGIN_INVALID');
  assert.equal(rejected.headers['access-control-allow-origin'], undefined);
  assert.equal((await request(app).post('/api/v1/auth/register').send({})).status, 403);
  assert.equal((await request(app).post('/api/v1/auth/register').set('Origin', 'null').send({})).status, 403);
});

test('oversized bodies and malformed JSON fail before authentication or database work', async () => {
  let queries = 0;
  const forbiddenDatabase = { query: async () => { queries++; throw new Error('Unexpected database access'); } } as unknown as Pool;
  const app = createApp({ pool: forbiddenDatabase, config });
  const oversized = await request(app).post('/api/v1/auth/register').set('Origin', config.frontendOrigin)
    .send({ email: 'oversize@example.test', password: 'x'.repeat(34_000), displayName: 'A' });
  assert.equal(oversized.status, 413);
  assert.equal(oversized.body.error.code, 'BODY_TOO_LARGE');
  assert.equal(oversized.body.error.requestId, oversized.headers['x-request-id']);
  const malformed = await request(app).post('/api/v1/auth/register').set('Origin', config.frontendOrigin)
    .set('Content-Type', 'application/json').send('{"password":"malformed-secret-sentinel",');
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error.code, 'INVALID_JSON');
  assert.equal(JSON.stringify(malformed.body).includes('malformed-secret-sentinel'), false);
  const array = await request(app).post('/api/v1/auth/register').set('Origin', config.frontendOrigin).send([]);
  assert.equal(array.status, 400);
  // Arrays are valid JSON, but these endpoints require a validated object body.
  assert.equal(array.body.error.code, 'VALIDATION_ERROR');
  assert.equal(queries, 0);
});

test('unexpected failures and unknown routes use sanitized error envelopes and request IDs', async () => {
  const unavailable = { query: async () => { throw new Error('private-database-password-and-stack'); } } as unknown as Pool;
  const app = createApp({ pool: unavailable, config });
  const failed = await request(app).get('/api/v1/me').set('Cookie', `ifms_session=${'a'.repeat(43)}`);
  assert.equal(failed.status, 500);
  assert.equal(failed.body.error.code, 'INTERNAL_ERROR');
  assert.equal(failed.body.error.message, 'The request could not be completed.');
  assert.equal(failed.body.error.requestId, failed.headers['x-request-id']);
  assert.equal(JSON.stringify(failed.body).includes('private-database-password'), false);
  assert.equal(failed.body.error.stack, undefined);
  const missing = await request(app).get('/no-such-endpoint');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'NOT_FOUND');
  assert.equal(missing.body.error.requestId, missing.headers['x-request-id']);
});
