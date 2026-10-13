import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Router, type Request, type Response, type CookieOptions } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import { HttpError, parse } from './errors.js';
import { asAuthUser, constantTimeEqual, readCookie, requireAuth, requireCsrf, SESSION_COOKIE, tokenHash } from './auth-context.js';
import { createGoogleProvider, type GoogleIdentity, type GoogleProvider } from './google.js';

const emailSchema = z.string().trim().max(254).email().transform(value => value.toLowerCase());
const passwordSchema = z.string().min(12, 'Use at least 12 characters.').max(128, 'Use at most 128 characters.')
  .refine(value => Buffer.byteLength(value, 'utf8') <= 512, 'Password is too long.');
const nameSchema = z.string().trim().min(1).max(120);
const uuidSchema = z.string().uuid();
const opaqueSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const OAUTH_COOKIE = 'ifms_oauth';
const randomToken = () => randomBytes(32).toString('base64url');
type Queryable = Pick<PoolClient, 'query'>;
type ResetSender = (email: string, resetUrl: string) => Promise<void>;
export interface AuthRouterOptions { pool: Pool; config: AppConfig; google?: GoogleProvider; sendReset?: ResetSender }

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
    (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16); const key = await derivePassword(password, salt);
  return `scrypt$32768$8$3$${salt.toString('hex')}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (Buffer.byteLength(password, 'utf8') > 512) return false;
  const parts = encoded.split('$');
  const salt = parts[4]; const expected = parts[5];
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== '32768' || parts[2] !== '8' || parts[3] !== '3'
    || !salt || !expected || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(expected)) return false;
  const key = await derivePassword(password, Buffer.from(salt, 'hex'));
  return timingSafeEqual(key, Buffer.from(expected, 'hex'));
}
const dummyPasswordHash = hashPassword('dummy-password-for-timing-only');

async function transaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await operation(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
function isUniqueViolation(error: unknown): boolean { return (error as { code?: string } | null)?.code === '23505'; }
function cookieOptions(config: AppConfig): CookieOptions {
  return { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/' };
}
function clearSession(response: Response, config: AppConfig): void { response.clearCookie(SESSION_COOKIE, cookieOptions(config)); }
async function audit(client: Queryable, userId: string | null, action: string, entityId?: string): Promise<void> {
  await client.query(`INSERT INTO audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    VALUES($1, $2, 'user', $3, '{}'::jsonb)`, [userId, action, entityId ?? userId]);
}
async function currentUser(client: Queryable, id: string) {
  const result = await client.query(`SELECT u.*, EXISTS(SELECT 1 FROM auth_identities i WHERE i.user_id = u.id AND i.provider = 'google') AS google_linked,
    p.base_currency FROM users u JOIN user_preferences p ON p.user_id = u.id WHERE u.id = $1`, [id]);
  return result.rows[0];
}
async function createSession(client: Queryable, userId: string, config: AppConfig, request: Request) {
  const token = randomToken(); const csrfToken = randomToken();
  const result = await client.query(`INSERT INTO auth_sessions(user_id, token_hash, csrf_token, expires_at, user_agent, last_seen_at)
    VALUES($1, $2, $3, NOW() + $4 * INTERVAL '1 hour', $5, NOW()) RETURNING id`,
  [userId, tokenHash(token), csrfToken, config.sessionHours, (request.get('user-agent') || '').slice(0, 256)]);
  await client.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [userId]);
  return { token, csrfToken, id: result.rows[0].id as string };
}
function sessionResponse(response: Response, config: AppConfig, session: { token: string; csrfToken: string }, user: Record<string, unknown>, googleConfigured: boolean): void {
  response.cookie(SESSION_COOKIE, session.token, { ...cookieOptions(config), maxAge: config.sessionHours * 60 * 60 * 1000 });
  response.json({ data: { user: asAuthUser(user), csrfToken: session.csrfToken, googleConfigured } });
}
function validateGoogleIdentity(identity: GoogleIdentity, nonce: string): void {
  if (!identity.emailVerified || !constantTimeEqual(identity.nonce, nonce) || !identity.subject || identity.subject.length > 255
    || !emailSchema.safeParse(identity.email).success) throw new HttpError(401, 'GOOGLE_INVALID', 'Google sign-in could not be verified.');
}

export function createAuthRouter({ pool, config, google: injectedGoogle, sendReset }: AuthRouterOptions): Router {
  const router = Router();
  const googleConfigured = Boolean(injectedGoogle || (config.googleClientId && config.googleClientSecret && config.googleCallbackUrl));
  const google = injectedGoogle ?? (googleConfigured ? createGoogleProvider(config) : undefined);
  const deliverReset: ResetSender = sendReset ?? (async (email, resetUrl) => {
    if (config.nodeEnv === 'production') throw new HttpError(503, 'MAIL_UNAVAILABLE', 'Password recovery delivery is not configured.');
    await mkdir(config.mailOutputDir, { recursive: true, mode: 0o700 });
    // Development-only private, ignored file. Never log or return a reset token.
    await writeFile(join(config.mailOutputDir, `${randomUUID()}.json`), JSON.stringify({ to: email, subject: 'Reset your IFMS password', resetUrl }, null, 2),
      { flag: 'wx', mode: 0o600 });
  });

  router.get('/auth/session', (request, response) => {
    response.set('Cache-Control', 'no-store').json({ data: { user: request.auth?.user ?? null, csrfToken: request.auth?.csrfToken ?? null, googleConfigured } });
  });

  router.post('/auth/register', async (request, response) => {
    const input = parse(z.object({ email: emailSchema, password: passwordSchema, displayName: nameSchema }).strict(), request.body);
    const passwordHash = await hashPassword(input.password);
    try {
      const result = await transaction(pool, async client => {
        const inserted = await client.query(`INSERT INTO users(email, password_hash, display_name, timezone, role, status)
          VALUES($1, $2, $3, 'UTC', 'INVESTOR', 'ACTIVE') RETURNING id`, [input.email, passwordHash, input.displayName]);
        const id = inserted.rows[0].id as string;
        await client.query('INSERT INTO user_preferences(user_id, base_currency) VALUES($1, $2)', [id, 'USD']);
        await audit(client, id, 'AUTH_REGISTER');
        return { session: await createSession(client, id, config, request), user: await currentUser(client, id) };
      });
      response.status(201); sessionResponse(response, config, result.session, result.user, googleConfigured);
    } catch (error) { if (isUniqueViolation(error)) throw new HttpError(409, 'EMAIL_IN_USE', 'An account with that email already exists. Sign in or recover your password.'); throw error; }
  });

  router.post('/auth/login', async (request, response) => {
    const input = parse(z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict(), request.body);
    const result = await transaction(pool, async client => {
      const found = await client.query('SELECT * FROM users WHERE email = $1 FOR UPDATE', [input.email]);
      const row = found.rows[0];
      const valid = await verifyPassword(input.password, row?.password_hash ?? await dummyPasswordHash);
      if (!row || !row.password_hash || row.status !== 'ACTIVE' || !valid) throw new HttpError(401, 'LOGIN_INVALID', 'Email or password is incorrect.');
      await audit(client, row.id, 'AUTH_LOGIN');
      return { user: await currentUser(client, row.id), session: await createSession(client, row.id, config, request) };
    });
    sessionResponse(response, config, result.session, result.user, googleConfigured);
  });

  router.post('/auth/logout', requireAuth, requireCsrf, async (request, response) => {
    await pool.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1 AND user_id = $2', [request.auth!.sessionId, request.auth!.user.id]);
    clearSession(response, config); response.json({ data: { signedOut: true } });
  });

  router.get('/me', requireAuth, async (request, response) => {
    const row = await currentUser(pool, request.auth!.user.id);
    response.json({ data: { ...asAuthUser(row), baseCurrency: row.base_currency } });
  });
  router.patch('/me', requireAuth, requireCsrf, async (request, response) => {
    const timezone = z.string().min(1).max(64).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Use a valid IANA timezone.');
    const input = parse(z.object({ displayName: nameSchema.optional(), timezone: timezone.optional(), baseCurrency: z.literal('USD').optional() }).strict()
      .refine(value => Object.keys(value).length > 0, 'Provide at least one profile field.'), request.body);
    const row = await transaction(pool, async client => {
      await client.query(`UPDATE users SET display_name = COALESCE($2, display_name), timezone = COALESCE($3, timezone), updated_at = NOW() WHERE id = $1`,
        [request.auth!.user.id, input.displayName ?? null, input.timezone ?? null]);
      if (input.baseCurrency) await client.query('UPDATE user_preferences SET base_currency = $2 WHERE user_id = $1', [request.auth!.user.id, input.baseCurrency]);
      await audit(client, request.auth!.user.id, 'PROFILE_UPDATE'); return currentUser(client, request.auth!.user.id);
    });
    response.json({ data: { ...asAuthUser(row), baseCurrency: row.base_currency } });
  });

  router.get('/auth/sessions', requireAuth, async (request, response) => {
    const result = await pool.query(`SELECT id, created_at, expires_at, last_seen_at, user_agent FROM auth_sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC`, [request.auth!.user.id]);
    response.json({ data: result.rows.map(row => ({ id: row.id, createdAt: row.created_at, expiresAt: row.expires_at,
      lastSeenAt: row.last_seen_at, userAgent: row.user_agent, current: row.id === request.auth!.sessionId })) });
  });
  router.delete('/auth/sessions/:id', requireAuth, requireCsrf, async (request, response) => {
    const id = parse(uuidSchema, request.params.id);
    const result = await pool.query(`UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id`, [id, request.auth!.user.id]);
    if (!result.rowCount) throw new HttpError(404, 'SESSION_NOT_FOUND', 'Session was not found.');
    if (id === request.auth!.sessionId) clearSession(response, config);
    response.json({ data: { revoked: true } });
  });

  router.post('/auth/password/change', requireAuth, requireCsrf, async (request, response) => {
    const input = parse(z.object({ currentPassword: z.string().max(128).optional(), newPassword: passwordSchema }).strict(), request.body);
    const newHash = await hashPassword(input.newPassword);
    const result = await transaction(pool, async client => {
      const found = await client.query('SELECT * FROM users WHERE id = $1 AND status = $2 FOR UPDATE', [request.auth!.user.id, 'ACTIVE']);
      const user = found.rows[0];
      if (!user) throw new HttpError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
      if (user.password_hash) {
        if (!input.currentPassword || !await verifyPassword(input.currentPassword, user.password_hash)) throw new HttpError(401, 'REAUTH_REQUIRED', 'Current password is incorrect.');
      } else if (!request.auth!.user.googleLinked || Date.now() - request.auth!.createdAt.getTime() > 5 * 60 * 1000) {
        throw new HttpError(401, 'REAUTH_REQUIRED', 'Sign in with Google again before setting a password.');
      }
      await client.query('UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1', [user.id, newHash]);
      await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
      await client.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [user.id]);
      await audit(client, user.id, 'PASSWORD_CHANGE');
      return { user: await currentUser(client, user.id), session: await createSession(client, user.id, config, request) };
    });
    sessionResponse(response, config, result.session, result.user, googleConfigured);
  });

  router.post('/auth/password/forgot', async (request, response) => {
    const input = parse(z.object({ email: emailSchema }).strict(), request.body);
    if (!sendReset && config.nodeEnv === 'production') throw new HttpError(503, 'MAIL_UNAVAILABLE', 'Password recovery delivery is not configured.');
    const result = await transaction(pool, async client => {
      const found = await client.query('SELECT id, email FROM users WHERE email = $1 AND status = $2 AND password_hash IS NOT NULL FOR UPDATE', [input.email, 'ACTIVE']);
      const user = found.rows[0]; if (!user) return null;
      const token = randomToken();
      await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
      await client.query(`INSERT INTO password_reset_tokens(user_id, token_hash, expires_at) VALUES($1, $2, NOW() + INTERVAL '15 minutes')`, [user.id, tokenHash(token)]);
      await audit(client, user.id, 'PASSWORD_RESET_REQUEST');
      return { email: user.email as string, token };
    });
    if (result) { const url = new URL('/reset-password', config.frontendOrigin); url.searchParams.set('token', result.token); await deliverReset(result.email, url.toString()); }
    response.json({ data: { message: 'If the account supports password recovery, a reset link has been sent.' } });
  });
  router.post('/auth/password/reset', async (request, response) => {
    const input = parse(z.object({ token: opaqueSchema, newPassword: passwordSchema }).strict(), request.body);
    const newHash = await hashPassword(input.newPassword);
    const lookup = await pool.query('SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()', [tokenHash(input.token)]);
    const userId = lookup.rows[0]?.user_id;
    if (!userId) throw new HttpError(400, 'RESET_INVALID', 'Reset link is invalid or expired.');
    await transaction(pool, async client => {
      const found = await client.query('SELECT id FROM users WHERE id = $1 AND status = $2 FOR UPDATE', [userId, 'ACTIVE']);
      const consumed = await client.query(`UPDATE password_reset_tokens SET used_at = NOW()
        WHERE token_hash = $1 AND user_id = $2 AND used_at IS NULL AND expires_at > clock_timestamp() RETURNING id`, [tokenHash(input.token), userId]);
      if (!found.rowCount || !consumed.rowCount) throw new HttpError(400, 'RESET_INVALID', 'Reset link is invalid or expired.');
      await client.query('UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1', [userId, newHash]);
      await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [userId]);
      await client.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
      await audit(client, userId, 'PASSWORD_RESET');
    });
    clearSession(response, config); response.json({ data: { message: 'Password reset. Sign in with your new password.' } });
  });

  async function beginGoogle(request: Request, response: Response, link = false): Promise<string> {
    if (!google) throw new HttpError(503, 'GOOGLE_UNCONFIGURED', 'Google sign-in requires development OAuth configuration.');
    const binding = randomToken(); const state = randomToken(); const nonce = randomToken(); const verifier = randomToken();
    await pool.query('DELETE FROM oauth_transactions WHERE expires_at <= NOW()');
    await pool.query(`INSERT INTO oauth_transactions(token_hash, state_hash, nonce, code_verifier, link_user_id, link_session_id, expires_at)
      VALUES($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '10 minutes')`,
    [tokenHash(binding), tokenHash(state), nonce, verifier, link ? request.auth!.user.id : null, link ? request.auth!.sessionId : null]);
    response.cookie(OAUTH_COOKIE, binding, { ...cookieOptions(config), path: '/api/v1/auth/google', maxAge: 10 * 60 * 1000 });
    return google.authorizationUrl({ state, nonce, codeChallenge: createHash('sha256').update(verifier).digest('base64url') });
  }
  router.get('/auth/google', async (request, response) => {
    if (request.auth) throw new HttpError(409, 'ALREADY_SIGNED_IN', 'Use profile settings to link Google to your account.');
    response.redirect(await beginGoogle(request, response));
  });
  router.post('/auth/google/link', requireAuth, requireCsrf, async (request, response) => {
    const input = parse(z.object({ currentPassword: z.string().min(1).max(128) }).strict(), request.body);
    const found = await pool.query('SELECT password_hash FROM users WHERE id = $1 AND status = $2', [request.auth!.user.id, 'ACTIVE']);
    if (!found.rows[0]?.password_hash || !await verifyPassword(input.currentPassword, found.rows[0].password_hash)) {
      throw new HttpError(401, 'REAUTH_REQUIRED', 'Current password is incorrect.');
    }
    response.json({ data: { url: await beginGoogle(request, response, true) } });
  });

  router.get('/auth/google/callback', async (request, response) => {
    let linking = false;
    response.clearCookie(OAUTH_COOKIE, { ...cookieOptions(config), path: '/api/v1/auth/google' });
    try {
      if (!google) throw new HttpError(503, 'GOOGLE_UNCONFIGURED', 'Google sign-in is not configured.');
      const state = parse(opaqueSchema, request.query.state);
      const binding = parse(opaqueSchema, readCookie(request, OAUTH_COOKIE));
      // Atomic consume before code exchange; transactions cannot be replayed even after failure.
      const consumed = await pool.query(`DELETE FROM oauth_transactions WHERE token_hash = $1 AND state_hash = $2 AND expires_at > NOW() RETURNING *`,
        [tokenHash(binding), tokenHash(state)]);
      const oauth = consumed.rows[0]; if (!oauth) throw new HttpError(401, 'OAUTH_INVALID', 'Google sign-in expired or could not be verified.');
      linking = Boolean(oauth.link_user_id);
      if (linking && (!request.auth || request.auth.user.id !== oauth.link_user_id || request.auth.sessionId !== oauth.link_session_id)) {
        throw new HttpError(401, 'OAUTH_INVALID', 'Sign in again before linking Google.');
      }
      const code = parse(z.string().min(1).max(4096), request.query.code);
      const identity = await google.exchangeCode({ code, codeVerifier: oauth.code_verifier, nonce: oauth.nonce });
      validateGoogleIdentity(identity, oauth.nonce);
      const email = parse(emailSchema, identity.email);
      const result = await transaction(pool, async client => {
        const existing = await client.query(`SELECT u.* FROM auth_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = 'google' AND i.provider_subject = $1 FOR UPDATE OF u`, [identity.subject]);
        let user = existing.rows[0];
        if (linking) {
          if (user && user.id !== oauth.link_user_id) throw new HttpError(409, 'GOOGLE_IN_USE', 'This Google account is already linked.');
          // Lock the account first, then read/lock its session in a new statement.
          // A joined session snapshot could predate password recovery while waiting
          // for this user lock. Keep the user -> session order used by recovery.
          const owner = await client.query(`SELECT u.* FROM users u WHERE u.id = $1 AND u.status = 'ACTIVE' FOR UPDATE OF u`, [oauth.link_user_id]);
          if (!owner.rowCount) throw new HttpError(401, 'REAUTH_REQUIRED', 'Sign in again before linking Google.');
          const session = await client.query(`SELECT id FROM auth_sessions WHERE user_id=$1 AND id=$2
            AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE`, [oauth.link_user_id,oauth.link_session_id]);
          if (!session.rowCount) throw new HttpError(401, 'REAUTH_REQUIRED', 'Sign in again before linking Google.');
          user = owner.rows[0];
          const linked = await client.query(`SELECT provider_subject FROM auth_identities WHERE user_id = $1 AND provider = 'google'`, [user.id]);
          if (linked.rowCount && linked.rows[0].provider_subject !== identity.subject) throw new HttpError(409, 'GOOGLE_ALREADY_LINKED', 'A Google account is already linked.');
          if (!linked.rowCount) await client.query(`INSERT INTO auth_identities(user_id, provider, provider_subject) VALUES($1, 'google', $2)`, [user.id, identity.subject]);
          await audit(client, user.id, 'GOOGLE_LINK'); return null;
        }
        if (!user) {
          const collision = await client.query('SELECT id FROM users WHERE email = $1', [email]);
          if (collision.rowCount) throw new HttpError(409, 'LINK_REQUIRED', 'Sign in to your existing account and link Google in profile settings.');
          const created = await client.query(`INSERT INTO users(email, display_name, timezone, role, status) VALUES($1, $2, 'UTC', 'INVESTOR', 'ACTIVE') RETURNING *`,
            [email, identity.displayName?.trim().slice(0, 120) || null]);
          user = created.rows[0];
          await client.query(`INSERT INTO user_preferences(user_id, base_currency) VALUES($1, 'USD')`, [user.id]);
          await client.query(`INSERT INTO auth_identities(user_id, provider, provider_subject) VALUES($1, 'google', $2)`, [user.id, identity.subject]);
          await audit(client, user.id, 'GOOGLE_REGISTER');
        }
        if (user.status !== 'ACTIVE') throw new HttpError(401, 'LOGIN_INVALID', 'Sign-in is not available for this account.');
        await audit(client, user.id, 'GOOGLE_LOGIN');
        return createSession(client, user.id, config, request);
      });
      if (result) response.cookie(SESSION_COOKIE, result.token, { ...cookieOptions(config), maxAge: config.sessionHours * 60 * 60 * 1000 });
      response.redirect(new URL(linking ? '/profile?google=linked' : '/login?oauth=success', config.frontendOrigin).toString());
    } catch {
      // Provider exceptions can contain tokens; never log or expose their text.
      response.redirect(new URL(linking ? '/profile?google=failed' : '/login?oauth=failed', config.frontendOrigin).toString());
    }
  });
  return router;
}
