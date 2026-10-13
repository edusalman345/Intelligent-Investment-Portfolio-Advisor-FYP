import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import type { Pool } from 'pg';
import { createApp } from '../../src/app.js';
import { tokenHash } from '../../src/auth-context.js';
import type { GoogleAuthorization, GoogleIdentity, GoogleProvider } from '../../src/google.js';
import { createTestPool, resetDatabase, testConfig } from './helpers.js';

const password = 'correct horse battery staple';
const config = testConfig();
let pool: Pool;
let deliveries: { email: string; url: string }[] = [];
let google: FakeGoogle;
let app: ReturnType<typeof createApp>;

class FakeGoogle implements GoogleProvider {
  subject = 'google-user-100'; email = 'google@example.test'; emailVerified = true; nonceOverride: string | undefined;
  lastAuthorization?: GoogleAuthorization; lastExchange?: { code: string; codeVerifier: string; nonce: string };
  authorizationUrl(input: GoogleAuthorization): string {
    this.lastAuthorization = input;
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('state', input.state); url.searchParams.set('nonce', input.nonce);
    url.searchParams.set('code_challenge', input.codeChallenge); return url.toString();
  }
  async exchangeCode(input: { code: string; codeVerifier: string; nonce: string }): Promise<GoogleIdentity> {
    this.lastExchange = input;
    return { subject: this.subject, email: this.email, emailVerified: this.emailVerified, displayName: 'Google Investor', nonce: this.nonceOverride ?? input.nonce };
  }
}
function cookies(response: request.Response): string[] {
  const header = response.headers['set-cookie'] as string[] | string | undefined;
  return (Array.isArray(header) ? header : header ? [header] : []).map(cookie => cookie.split(';')[0]!);
}
function sessionCookie(response: request.Response): string { return cookies(response).find(cookie => cookie.startsWith('ifms_session='))!; }
function oauthCookie(response: request.Response): string { return cookies(response).find(cookie => cookie.startsWith('ifms_oauth='))!; }
async function register(email = 'alice@example.test') {
  const response = await request(app).post('/api/v1/auth/register').set('Origin', config.frontendOrigin).send({ email, password, displayName: 'Investor' });
  assert.equal(response.status, 201); return { response, cookie: sessionCookie(response), csrf: response.body.data.csrfToken as string, id: response.body.data.user.id as string };
}
async function startGoogle(cookie?: string) {
  const operation = request(app).get('/api/v1/auth/google'); if (cookie) operation.set('Cookie', cookie);
  const response = await operation; assert.equal(response.status, 302);
  return { cookie: oauthCookie(response), state: new URL(response.headers.location).searchParams.get('state')! };
}
async function callback(start: { cookie: string; state: string }, extraCookies: string[] = []) {
  return request(app).get('/api/v1/auth/google/callback').query({ code: 'mock-code', state: start.state }).set('Cookie', [start.cookie, ...extraCookies]);
}

before(() => { pool = createTestPool(); });
beforeEach(async () => {
  await resetDatabase(pool); deliveries = []; google = new FakeGoogle();
  app = createApp({ pool, config, google, sendReset: async (email, url) => { deliveries.push({ email, url }); } });
});
after(async () => { await pool.end(); });

test('registration, login and profile reject invalid input and never assign client roles', async () => {
  assert.equal((await request(app).get('/api/v1/me')).status, 401);
  assert.equal((await request(app).post('/api/v1/auth/register').set('Origin', config.frontendOrigin).send({ email: 'a@example.test', password: 'short', displayName: 'A' })).status, 400);
  assert.equal((await request(app).post('/api/v1/auth/register').set('Origin', config.frontendOrigin).send({ email: 'a@example.test', password, displayName: 'A', role: 'ADMIN' })).status, 400);
  const alice = await register(' ALICE@example.test ');
  assert.equal(alice.response.body.data.user.email, 'alice@example.test');
  assert.equal(alice.response.body.data.user.role, 'INVESTOR');
  assert.equal(alice.response.body.data.user.hasPassword, true);
  const setCookie = alice.response.headers['set-cookie'].join(';');
  assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Lax/);
  const stored = await pool.query('SELECT password_hash FROM users WHERE id=$1', [alice.id]);
  assert.match(stored.rows[0].password_hash, /^scrypt\$32768\$8\$3\$/);
  assert.equal(JSON.stringify(alice.response.body).includes(stored.rows[0].password_hash), false);
  const storedSession = await pool.query('SELECT token_hash FROM auth_sessions WHERE user_id=$1', [alice.id]);
  assert.notEqual(storedSession.rows[0].token_hash, alice.cookie.split('=')[1]);
  assert.equal((await request(app).post('/api/v1/auth/register').set('Origin', config.frontendOrigin).send({ email: 'alice@example.test', password, displayName: 'A' })).status, 409);
  const wrong = await request(app).post('/api/v1/auth/login').set('Origin', config.frontendOrigin).send({ email: 'alice@example.test', password: 'wrong password' });
  const unknown = await request(app).post('/api/v1/auth/login').set('Origin', config.frontendOrigin).send({ email: 'missing@example.test', password: 'wrong password' });
  assert.equal(wrong.status, 401); assert.equal(unknown.status, 401); assert.equal(wrong.body.error.code, unknown.body.error.code);
  const login = await request(app).post('/api/v1/auth/login').set('Origin', config.frontendOrigin).send({ email: 'ALICE@example.test', password });
  assert.equal(login.status, 200); assert.equal(login.body.data.user.id, alice.id);
  assert.equal((await request(app).patch('/api/v1/me').set('Origin', config.frontendOrigin).set('Cookie', alice.cookie).send({ displayName: 'Changed' })).status, 403);
  assert.equal((await request(app).patch('/api/v1/me').set('Origin', config.frontendOrigin).set('Cookie', alice.cookie).set('X-CSRF-Token', alice.csrf).send({ role: 'ADMIN' })).status, 400);
  assert.equal((await request(app).patch('/api/v1/me').set('Origin', config.frontendOrigin).set('Cookie', alice.cookie).set('X-CSRF-Token', alice.csrf).send({ timezone: 'Invalid/Timezone' })).status, 400);
  const profile = await request(app).patch('/api/v1/me').set('Origin', config.frontendOrigin).set('Cookie', alice.cookie).set('X-CSRF-Token', alice.csrf)
    .send({ displayName: '<script>alert(1)</script>', timezone: 'America/Los_Angeles', baseCurrency: 'USD' });
  assert.equal(profile.status, 200); assert.equal(profile.body.data.timezone, 'America/Los_Angeles'); assert.equal(profile.body.data.baseCurrency, 'USD');
  assert.equal(profile.body.data.role, 'INVESTOR');
});

test('session revocation prevents cross-user access and rejects CSRF or foreign origins', async () => {
  const alice = await register(); const bob = await register('bob@example.test');
  const bobSessions = await request(app).get('/api/v1/auth/sessions').set('Cookie', bob.cookie);
  const bobSessionId = bobSessions.body.data[0].id as string;
  assert.equal(JSON.stringify(bobSessions.body).includes('csrfToken'), false); assert.equal(JSON.stringify(bobSessions.body).includes('token_hash'), false);
  assert.equal((await request(app).delete(`/api/v1/auth/sessions/${bobSessionId}`).set('Origin', config.frontendOrigin).set('Cookie', alice.cookie).set('X-CSRF-Token', alice.csrf)).status, 404);
  assert.equal((await request(app).post('/api/v1/auth/logout').set('Origin', 'https://evil.example').set('Cookie', bob.cookie).set('X-CSRF-Token', bob.csrf)).status, 403);
  assert.equal((await request(app).post('/api/v1/auth/logout').set('Origin', config.frontendOrigin).set('Cookie', bob.cookie).set('X-CSRF-Token', 'wrong')).status, 403);
  assert.equal((await request(app).delete(`/api/v1/auth/sessions/${bobSessionId}`).set('Origin', config.frontendOrigin).set('Cookie', bob.cookie).set('X-CSRF-Token', bob.csrf)).status, 200);
  assert.equal((await request(app).get('/api/v1/auth/session').set('Cookie', bob.cookie)).body.data.user, null);
  assert.equal((await request(app).get('/api/v1/me').set('Cookie', alice.cookie)).status, 200);
  await pool.query('UPDATE auth_sessions SET expires_at=NOW()-INTERVAL\'1 second\' WHERE user_id=$1', [alice.id]);
  assert.equal((await request(app).get('/api/v1/me').set('Cookie', alice.cookie)).status, 401);
});

test('disabled users cannot use existing sessions or password login', async () => {
  const alice = await register(); await pool.query("UPDATE users SET status='DISABLED' WHERE id=$1", [alice.id]);
  assert.equal((await request(app).get('/api/v1/me').set('Cookie', alice.cookie)).status, 401);
  assert.equal((await request(app).post('/api/v1/auth/login').set('Origin', config.frontendOrigin).send({ email: 'alice@example.test', password })).status, 401);
});

test('password changes require reauthentication, rotate sessions and invalidate all prior sessions', async () => {
  const alice = await register();
  const second = await request(app).post('/api/v1/auth/login').set('Origin', config.frontendOrigin).send({ email: 'alice@example.test', password });
  assert.equal((await request(app).post('/api/v1/auth/password/change').set('Origin', config.frontendOrigin).set('Cookie', alice.cookie).set('X-CSRF-Token', alice.csrf)
    .send({ currentPassword: 'incorrect password', newPassword: 'another sufficiently long password' })).status, 401);
  const changed = await request(app).post('/api/v1/auth/password/change').set('Origin', config.frontendOrigin).set('Cookie', alice.cookie).set('X-CSRF-Token', alice.csrf)
    .send({ currentPassword: password, newPassword: 'another sufficiently long password' });
  assert.equal(changed.status, 200); assert.notEqual(sessionCookie(changed), alice.cookie);
  assert.equal((await request(app).get('/api/v1/me').set('Cookie', alice.cookie)).status, 401);
  assert.equal((await request(app).get('/api/v1/me').set('Cookie', sessionCookie(second))).status, 401);
  assert.equal((await request(app).get('/api/v1/me').set('Cookie', sessionCookie(changed))).status, 200);
  assert.equal((await request(app).post('/api/v1/auth/login').set('Origin', config.frontendOrigin).send({ email: 'alice@example.test', password: 'another sufficiently long password' })).status, 200);
});

test('password recovery is generic, hashes expiring one-use tokens and invalidates sessions atomically', async () => {
  const alice = await register();
  const forgot = await request(app).post('/api/v1/auth/password/forgot').set('Origin', config.frontendOrigin).send({ email: 'alice@example.test' });
  const unknown = await request(app).post('/api/v1/auth/password/forgot').set('Origin', config.frontendOrigin).send({ email: 'missing@example.test' });
  assert.equal(forgot.status, 200); assert.deepEqual(forgot.body.data, unknown.body.data); assert.equal(deliveries.length, 1);
  const token = new URL(deliveries[0]!.url).searchParams.get('token')!;
  assert.equal(JSON.stringify(forgot.body).includes(token), false);
  const stored = await pool.query('SELECT token_hash FROM password_reset_tokens WHERE user_id=$1', [alice.id]);
  assert.equal(stored.rows[0].token_hash, tokenHash(token)); assert.notEqual(stored.rows[0].token_hash, token);
  const reset = await request(app).post('/api/v1/auth/password/reset').set('Origin', config.frontendOrigin).send({ token, newPassword: 'a new password for recovery' });
  assert.equal(reset.status, 200);
  assert.equal((await request(app).get('/api/v1/me').set('Cookie', alice.cookie)).status, 401);
  assert.equal((await request(app).post('/api/v1/auth/password/reset').set('Origin', config.frontendOrigin).send({ token, newPassword: 'another recovery password' })).status, 400);
  assert.equal((await request(app).post('/api/v1/auth/login').set('Origin', config.frontendOrigin).send({ email: 'alice@example.test', password: 'a new password for recovery' })).status, 200);
  await request(app).post('/api/v1/auth/password/forgot').set('Origin', config.frontendOrigin).send({ email: 'alice@example.test' });
  const expired = new URL(deliveries[1]!.url).searchParams.get('token')!;
  await pool.query("UPDATE password_reset_tokens SET expires_at=NOW()-INTERVAL '1 second' WHERE token_hash=$1", [tokenHash(expired)]);
  assert.equal((await request(app).post('/api/v1/auth/password/reset').set('Origin', config.frontendOrigin).send({ token: expired, newPassword: 'another recovery password' })).status, 400);
});

test('Google is a controlled optional configuration and production cookies are secure', async () => {
  const unconfigured = createApp({ pool, config: { ...config, googleClientId: '', googleClientSecret: '' } });
  assert.equal((await request(unconfigured).get('/api/v1/auth/session')).body.data.googleConfigured, false);
  assert.equal((await request(unconfigured).get('/api/v1/auth/google')).status, 503);
  const production = createApp({ pool, config: { ...config, nodeEnv: 'production', cookieSecure: true }, sendReset: async () => undefined });
  const registered = await request(production).post('/api/v1/auth/register').set('Origin', config.frontendOrigin).send({ email: 'production-cookie@example.test', password, displayName: 'A' });
  assert.equal(registered.status, 201); assert.match(registered.headers['set-cookie'].join(';'), /Secure/);
  const noMail = createApp({ pool, config: { ...config, nodeEnv: 'production' } });
  assert.equal((await request(noMail).post('/api/v1/auth/password/forgot').set('Origin', config.frontendOrigin).send({ email: 'missing@example.test' })).status, 503);
});

test('Google OAuth binds state to its browser, uses PKCE, consumes once and uses stable subject identity', async () => {
  const start = await startGoogle();
  const transaction = await pool.query('SELECT * FROM oauth_transactions');
  assert.notEqual(transaction.rows[0].token_hash, start.cookie.split('=')[1]);
  assert.equal(transaction.rows[0].state_hash, tokenHash(start.state));
  assert.equal(google.lastAuthorization!.codeChallenge, createHash('sha256').update(transaction.rows[0].code_verifier).digest('base64url'));
  const noCookie = await request(app).get('/api/v1/auth/google/callback').query({ state: start.state, code: 'code' });
  assert.match(noCookie.headers.location, /oauth=failed$/); assert.equal(google.lastExchange, undefined);
  const otherBrowser = await startGoogle();
  const wrongBrowser = await callback({ ...start, cookie: otherBrowser.cookie }); assert.match(wrongBrowser.headers.location, /oauth=failed$/);
  assert.equal(google.lastExchange, undefined);
  await pool.query('DELETE FROM oauth_transactions WHERE state_hash = $1', [tokenHash(otherBrowser.state)]);
  const wrongState = await callback({ ...start, state: 'a'.repeat(43) }); assert.match(wrongState.headers.location, /oauth=failed$/);
  assert.equal(google.lastExchange, undefined);
  const loggedIn = await callback(start); assert.match(loggedIn.headers.location, /oauth=success$/);
  const session = await request(app).get('/api/v1/auth/session').set('Cookie', sessionCookie(loggedIn));
  assert.equal(session.body.data.user.email, 'google@example.test'); assert.equal(session.body.data.user.hasPassword, false); assert.equal(session.body.data.user.googleLinked, true);
  assert.equal(google.lastExchange!.codeVerifier, transaction.rows[0].code_verifier);
  assert.equal((await pool.query('SELECT * FROM oauth_transactions')).rowCount, 0);
  const replay = await callback(start); assert.match(replay.headers.location, /oauth=failed$/);
  google.email = 'changed-address@example.test';
  const again = await callback(await startGoogle());
  const stable = await request(app).get('/api/v1/auth/session').set('Cookie', sessionCookie(again));
  assert.equal(stable.body.data.user.id, session.body.data.user.id); assert.equal(stable.body.data.user.email, 'google@example.test');
});

test('Google rejects expired state, nonce mismatch, unverified email and implicit password-account linking', async () => {
  const expired = await startGoogle(); await pool.query("UPDATE oauth_transactions SET expires_at=NOW()-INTERVAL '1 second'");
  assert.match((await callback(expired)).headers.location, /oauth=failed$/); assert.equal(google.lastExchange, undefined);
  google.nonceOverride = 'different nonce';
  assert.match((await callback(await startGoogle())).headers.location, /oauth=failed$/); assert.equal((await pool.query('SELECT * FROM users')).rowCount, 0);
  google.nonceOverride = undefined; google.emailVerified = false;
  assert.match((await callback(await startGoogle())).headers.location, /oauth=failed$/); assert.equal((await pool.query('SELECT * FROM users')).rowCount, 0);
  google.emailVerified = true; const alice = await register(); google.email = 'alice@example.test';
  assert.match((await callback(await startGoogle())).headers.location, /oauth=failed$/);
  assert.equal((await pool.query('SELECT * FROM auth_identities WHERE user_id=$1', [alice.id])).rowCount, 0);
});

test('explicit Google linking requires password, CSRF and the original active session', async () => {
  const alice = await register(); google.email = 'alice@example.test';
  const link = (currentPassword: string) => request(app).post('/api/v1/auth/google/link').set('Origin', config.frontendOrigin).set('Cookie', alice.cookie).set('X-CSRF-Token', alice.csrf).send({ currentPassword });
  assert.equal((await link('wrong password')).status, 401);
  const begun = await link(password); assert.equal(begun.status, 200);
  const start = { cookie: oauthCookie(begun), state: new URL(begun.body.data.url).searchParams.get('state')! };
  const linked = await callback(start, [alice.cookie]); assert.match(linked.headers.location, /google=linked$/);
  assert.equal((await request(app).get('/api/v1/auth/session').set('Cookie', alice.cookie)).body.data.user.googleLinked, true);
  const bob = await register('bob@example.test');
  const otherLink = await request(app).post('/api/v1/auth/google/link').set('Origin', config.frontendOrigin).set('Cookie', bob.cookie).set('X-CSRF-Token', bob.csrf).send({ currentPassword: password });
  assert.match((await callback({ cookie: oauthCookie(otherLink), state: new URL(otherLink.body.data.url).searchParams.get('state')! }, [bob.cookie])).headers.location, /google=failed$/);
  assert.equal((await pool.query('SELECT * FROM auth_identities WHERE user_id=$1', [bob.id])).rowCount, 0);
  google.subject = 'google-bob';
  const revokedStart = await request(app).post('/api/v1/auth/google/link').set('Origin', config.frontendOrigin).set('Cookie', bob.cookie).set('X-CSRF-Token', bob.csrf).send({ currentPassword: password });
  await pool.query('UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=$1', [bob.id]);
  assert.match((await callback({ cookie: oauthCookie(revokedStart), state: new URL(revokedStart.body.data.url).searchParams.get('state')! }, [bob.cookie])).headers.location, /google=failed$/);
});

test('Google-only password setup requires a fresh Google session', async () => {
  const loggedIn = await callback(await startGoogle());
  const cookie = sessionCookie(loggedIn); const session = await request(app).get('/api/v1/auth/session').set('Cookie', cookie);
  await pool.query("UPDATE auth_sessions SET created_at=NOW()-INTERVAL '6 minutes'");
  assert.equal((await request(app).post('/api/v1/auth/password/change').set('Origin', config.frontendOrigin).set('Cookie', cookie).set('X-CSRF-Token', session.body.data.csrfToken)
    .send({ newPassword: password })).status, 401);
  await pool.query('UPDATE auth_sessions SET created_at=NOW()');
  const changed = await request(app).post('/api/v1/auth/password/change').set('Origin', config.frontendOrigin).set('Cookie', cookie).set('X-CSRF-Token', session.body.data.csrfToken)
    .send({ currentPassword: '', newPassword: password });
  assert.equal(changed.status, 200); assert.equal(changed.body.data.user.hasPassword, true);
  assert.equal((await request(app).post('/api/v1/auth/login').set('Origin', config.frontendOrigin).send({ email: google.email, password })).status, 200);
});
