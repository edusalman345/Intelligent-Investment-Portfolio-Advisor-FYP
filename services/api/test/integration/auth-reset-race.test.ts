import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import type { Pool } from 'pg';
import { createApp } from '../../src/app.js';
import { tokenHash } from '../../src/auth-context.js';
import { createTestPool, resetDatabase, testConfig } from './helpers.js';

const config = testConfig();
const password = 'original password for the reset race';
let pool: Pool;

async function waitForResetUserLock(blockerPid: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await pool.query(`SELECT pid FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> $1 AND wait_event_type = 'Lock'
        AND query LIKE '%FROM users%' AND query LIKE '%FOR UPDATE%'
        AND $1::integer = ANY(pg_blocking_pids(pid))`, [blockerPid]);
    if (result.rowCount) return;
    await delay(25);
  }
  assert.fail('The password reset did not reach its blocked user-row lock within five seconds.');
}

before(() => { pool = createTestPool(); });
beforeEach(async () => { await resetDatabase(pool); });
after(async () => { await pool.end(); });

test('password reset rejects a token that expires while waiting for the user lock', { timeout: 15_000 }, async () => {
  let resetUrl: string | undefined;
  const app = createApp({ pool, config, sendReset: async (_email, url) => { resetUrl = url; } });
  const registered = await request(app).post('/api/v1/auth/register').set('Origin', config.frontendOrigin)
    .send({ email: 'reset-race@example.test', password, displayName: 'Reset race investor' });
  assert.equal(registered.status, 201);
  const userId = registered.body.data.user.id as string;
  const originalUser = await pool.query('SELECT password_hash FROM users WHERE id=$1', [userId]);
  const originalSessions = await pool.query('SELECT id,token_hash,revoked_at FROM auth_sessions WHERE user_id=$1 ORDER BY id', [userId]);
  const forgotten = await request(app).post('/api/v1/auth/password/forgot').set('Origin', config.frontendOrigin)
    .send({ email: 'reset-race@example.test' });
  assert.equal(forgotten.status, 200);
  assert.ok(resetUrl);
  const token = new URL(resetUrl).searchParams.get('token');
  assert.ok(token);
  const hash = tokenHash(token);
  await pool.query("UPDATE password_reset_tokens SET expires_at=clock_timestamp()+INTERVAL '15 seconds' WHERE token_hash=$1", [hash]);

  const blocker = await pool.connect();
  let committed = false;
  let resetting: Promise<request.Response> | undefined;
  try {
    await blocker.query('BEGIN');
    const pid = await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
    resetting = request(app).post('/api/v1/auth/password/reset').set('Origin', config.frontendOrigin)
      .send({ token, newPassword: 'new password that must not be applied' })
      .timeout({ response: 8_000, deadline: 10_000 }).then(response => response);
    await waitForResetUserLock(pid.rows[0]!.pid);

    // The new expiry must be after reset transaction start but before real time.
    // NOW() incorrectly accepts it; clock_timestamp() rejects it after the wait.
    await delay(1_200);
    await blocker.query("UPDATE password_reset_tokens SET expires_at=clock_timestamp()-INTERVAL '1 second' WHERE token_hash=$1", [hash]);
    await blocker.query('COMMIT');
    committed = true;

    const completed = await resetting;
    assert.equal(completed.status, 400);
    assert.equal(completed.body.error.code, 'RESET_INVALID');
    const unchangedUser = await pool.query('SELECT password_hash FROM users WHERE id=$1', [userId]);
    assert.equal(unchangedUser.rows[0].password_hash, originalUser.rows[0].password_hash);
    const unchangedSessions = await pool.query('SELECT id,token_hash,revoked_at FROM auth_sessions WHERE user_id=$1 ORDER BY id', [userId]);
    assert.deepEqual(unchangedSessions.rows, originalSessions.rows);
    const resetState = await pool.query('SELECT used_at FROM password_reset_tokens WHERE token_hash=$1', [hash]);
    assert.equal(resetState.rows[0].used_at, null);
  } finally {
    if (!committed) await blocker.query('ROLLBACK');
    blocker.release();
    // Resolve any blocked HTTP operation before closing the shared test pool.
    if (resetting) await resetting.catch(() => undefined);
  }
});
