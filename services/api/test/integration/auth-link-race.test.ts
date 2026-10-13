import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import type { Pool } from 'pg';
import { createApp } from '../../src/app.js';
import type { GoogleAuthorization, GoogleIdentity, GoogleProvider } from '../../src/google.js';
import { createTestPool, resetDatabase, testConfig } from './helpers.js';

const config = testConfig();
const password = 'a unique password for the linking race';
let pool: Pool;

class LinkingGoogle implements GoogleProvider {
  authorizationUrl(input: GoogleAuthorization): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    url.searchParams.set('code_challenge', input.codeChallenge);
    return url.toString();
  }
  async exchangeCode(input: { code: string; codeVerifier: string; nonce: string }): Promise<GoogleIdentity> {
    return { subject: 'new-google-identity-for-race', email: 'google-link-race@example.test', emailVerified: true,
      displayName: 'Linked investor', nonce: input.nonce };
  }
}

function cookie(response: request.Response, name: string): string {
  const headers = response.headers['set-cookie'] as string[] | string | undefined;
  const values = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const match = values.find(value => value.startsWith(`${name}=`));
  assert.ok(match, `Expected the ${name} cookie`);
  return match.split(';')[0]!;
}

async function waitForCallbackUserLock(blockerPid: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    // Match a user-row locking query blocked by this exact test connection.
    // This also works after the join is split into a user lock and fresh session read.
    const result = await pool.query(`SELECT pid FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> $1 AND wait_event_type = 'Lock'
        AND query LIKE '%FROM users%' AND query LIKE '%FOR UPDATE%'
        AND $1::integer = ANY(pg_blocking_pids(pid))`, [blockerPid]);
    if (result.rowCount) return;
    await delay(25);
  }
  assert.fail('The OAuth callback did not reach its blocked user-row lock within five seconds.');
}

before(() => { pool = createTestPool(); });
beforeEach(async () => { await resetDatabase(pool); });
after(async () => { await pool.end(); });

test('Google linking rejects an original session revoked while its callback waits for the user lock', { timeout: 15_000 }, async () => {
  const app = createApp({ pool, config, google: new LinkingGoogle(), sendReset: async () => undefined });
  const registered = await request(app).post('/api/v1/auth/register').set('Origin', config.frontendOrigin)
    .send({ email: 'owner-link-race@example.test', password, displayName: 'Race test investor' });
  assert.equal(registered.status, 201);
  const sessionCookie = cookie(registered, 'ifms_session');
  const userId = registered.body.data.user.id as string;
  const csrf = registered.body.data.csrfToken as string;
  const sessions = await request(app).get('/api/v1/auth/sessions').set('Cookie', sessionCookie);
  assert.equal(sessions.status, 200);
  const originalSession = (sessions.body.data as { id: string; current: boolean }[]).find(session => session.current);
  assert.ok(originalSession);

  const begun = await request(app).post('/api/v1/auth/google/link').set('Origin', config.frontendOrigin)
    .set('Cookie', sessionCookie).set('X-CSRF-Token', csrf).send({ currentPassword: password });
  assert.equal(begun.status, 200);
  const state = new URL(begun.body.data.url as string).searchParams.get('state');
  assert.ok(state);
  const oauthCookie = cookie(begun, 'ifms_oauth');

  const blocker = await pool.connect();
  let committed = false;
  let callback: Promise<request.Response> | undefined;
  try {
    await blocker.query('BEGIN');
    const pid = await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    await blocker.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    callback = request(app).get('/api/v1/auth/google/callback').query({ code: 'mock-linking-code', state })
      .set('Cookie', [oauthCookie, sessionCookie]).timeout({ response: 8_000, deadline: 10_000 }).then(response => response);
    await waitForCallbackUserLock(pid.rows[0]!.pid);

    // Simulate the atomic user/session changes made by password recovery.
    await blocker.query('UPDATE users SET updated_at = NOW() WHERE id = $1', [userId]);
    await blocker.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1 AND user_id = $2', [originalSession.id, userId]);
    await blocker.query('COMMIT');
    committed = true;

    const completed = await callback;
    assert.equal(completed.status, 302);
    assert.match(completed.headers.location as string, /\/profile\?google=failed$/);
    const identities = await pool.query('SELECT provider_subject FROM auth_identities WHERE user_id = $1', [userId]);
    assert.equal(identities.rowCount, 0, 'A revoked session must not attach a durable Google identity.');
  } finally {
    if (!committed) await blocker.query('ROLLBACK');
    blocker.release();
    // Never leave a blocked HTTP request alive after a failed synchronization assertion.
    if (callback) await callback.catch(() => undefined);
  }
});
