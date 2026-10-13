import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { Pool } from 'pg';
import type { AuthUser } from '@ifms/contracts';
import { HttpError } from './errors.js';

export const SESSION_COOKIE = 'ifms_session';
export interface AuthContext { user: AuthUser; sessionId: string; csrfToken: string; createdAt: Date }
declare module 'express-serve-static-core' { interface Request { auth?: AuthContext } }

export function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function readCookie(request: Request, name: string): string | undefined {
  const cookies = (request.headers.cookie || '').split(';').map(part => part.trim());
  const matches = cookies.filter(part => part.startsWith(`${name}=`));
  if (matches.length !== 1) return undefined;
  try { return decodeURIComponent(matches[0]!.slice(name.length + 1)); } catch { return undefined; }
}
export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function asAuthUser(row: Record<string, unknown>): AuthUser {
  return { id: String(row.id), email: String(row.email), displayName: row.display_name == null ? null : String(row.display_name),
    timezone: row.timezone == null ? null : String(row.timezone), role: row.role as AuthUser['role'], status: String(row.status),
    hasPassword: row.password_hash != null, googleLinked: Boolean(row.google_linked) };
}
export function loadAuth(pool: Pool): RequestHandler {
  return async (request, _response, next) => {
    try {
      const token = readCookie(request, SESSION_COOKIE);
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) { next(); return; }
      const result = await pool.query(`SELECT u.*, s.id AS session_id, s.csrf_token, s.created_at AS session_created_at,
        EXISTS(SELECT 1 FROM auth_identities i WHERE i.user_id = u.id AND i.provider = 'google') AS google_linked
        FROM auth_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW() AND u.status = 'ACTIVE'`, [tokenHash(token)]);
      const row = result.rows[0];
      if (row) {
        request.auth = { user: asAuthUser(row), sessionId: row.session_id, csrfToken: row.csrf_token, createdAt: row.session_created_at };
        await pool.query(`UPDATE auth_sessions SET last_seen_at = NOW() WHERE id = $1
          AND (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '5 minutes')`, [row.session_id]);
      }
      next();
    } catch (error) { next(error); }
  };
}
export const requireAuth: RequestHandler = (request, _response, next) => {
  next(request.auth ? undefined : new HttpError(401, 'AUTH_REQUIRED', 'Sign in to continue.'));
};
export const requireAdmin: RequestHandler = (request, _response, next) => {
  next(!request.auth ? new HttpError(401, 'AUTH_REQUIRED', 'Sign in to continue.')
    : request.auth.user.role !== 'ADMIN' ? new HttpError(403, 'FORBIDDEN', 'Administrator access is required.') : undefined);
};
export const requireCsrf: RequestHandler = (request, _response, next) => {
  const supplied = request.get('X-CSRF-Token');
  next(!request.auth ? new HttpError(401, 'AUTH_REQUIRED', 'Sign in to continue.')
    : !supplied || supplied.length > 256 || !constantTimeEqual(supplied, request.auth.csrfToken)
      ? new HttpError(403, 'CSRF_INVALID', 'The request could not be verified. Refresh and try again.') : undefined);
};
