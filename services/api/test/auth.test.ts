import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '../src/auth.js';
import { constantTimeEqual, tokenHash, readCookie, requireCsrf, requireAdmin } from '../src/auth-context.js';
import type { Request, Response } from 'express';

test('passwords are salted and validated without retaining plaintext', async () => {
  const password = 'a long unicode password 🔑';
  const first = await hashPassword(password); const second = await hashPassword(password);
  assert.notEqual(first, second); assert.equal(first.includes(password), false);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('wrong password entirely', first), false);
  assert.equal(await verifyPassword(password, 'broken'), false);
  assert.equal(await verifyPassword(password, first.replace('$32768$', '$999999999$')), false);
  assert.equal(await verifyPassword('x'.repeat(513), first), false);
});

test('cookie parsing rejects ambiguous duplicate cookies and malformed encoding', () => {
  const request = (cookie: string) => ({ headers: { cookie } }) as Request;
  assert.equal(readCookie(request('foo=a; ifms_session=abc'), 'ifms_session'), 'abc');
  assert.equal(readCookie(request('ifms_session=a; ifms_session=b'), 'ifms_session'), undefined);
  assert.equal(readCookie(request('ifms_session=%ZZ'), 'ifms_session'), undefined);
  assert.equal(readCookie(request('other_ifms_session=a'), 'ifms_session'), undefined);
  assert.equal(tokenHash('secret').length, 64); assert.notEqual(tokenHash('secret'), 'secret');
});

test('CSRF checks and administrator authorization reject unauthorized requests', () => {
  const invoke = (middleware: typeof requireCsrf, request: Partial<Request>) => {
    let error: unknown; middleware(request as Request, {} as Response, supplied => { error = supplied; }); return error as { status?: number } | undefined;
  };
  const auth = { user: { role: 'INVESTOR' }, csrfToken: 'safe-token' } as Request['auth'];
  assert.equal(invoke(requireCsrf, { get: () => undefined })?.status, 401);
  assert.equal(invoke(requireCsrf, { auth, get: () => 'wrong-token' } as unknown as Request)?.status, 403);
  assert.equal(invoke(requireCsrf, { auth, get: () => 'safe-token' } as unknown as Request), undefined);
  assert.equal(invoke(requireAdmin, { auth })?.status, 403);
  assert.equal(invoke(requireAdmin, { auth: { ...auth!, user: { ...auth!.user, role: 'ADMIN' } } }), undefined);
  assert.equal(constantTimeEqual('a', 'a'), true); assert.equal(constantTimeEqual('a', 'aa'), false);
});
