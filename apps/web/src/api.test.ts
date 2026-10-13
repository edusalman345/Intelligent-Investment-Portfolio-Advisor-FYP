import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request, setCsrfToken, setExpiredSessionHandler } from './api';

afterEach(() => { setCsrfToken(null); setExpiredSessionHandler(null); vi.unstubAllGlobals(); });
describe('cookie session API transport', () => {
  it('includes credentials and CSRF for a mutation while preserving decimal strings', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: 'record' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock); setCsrfToken('test-csrf');
    await expect(request('portfolios', { method: 'POST', body: { quantity: '0.125' } })).resolves.toEqual({ id: 'record' });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/portfolios', expect.objectContaining({ credentials: 'include', body: '{"quantity":"0.125"}', headers: expect.objectContaining({ 'X-CSRF-Token': 'test-csrf' }) }));
  });
  it('never puts CSRF into GET requests or URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock); setCsrfToken('test-csrf');
    await request('auth/sessions');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/sessions', expect.objectContaining({ headers: { Accept: 'application/json' }, credentials: 'include' }));
  });
  it('expires a session when protected authentication routes return 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Sign in again', code: 'AUTH_REQUIRED' } }), { status: 401 })));
    const expired = vi.fn(); setExpiredSessionHandler(expired);
    await expect(request('auth/sessions')).rejects.toMatchObject({ status: 401, message: 'Sign in again' });
    expect(expired).toHaveBeenCalledOnce();
  });
  it('reports invalid credentials without an expired-session loop', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Invalid credentials' } }), { status: 401 })));
    const expired = vi.fn(); setExpiredSessionHandler(expired);
    await expect(request('auth/login', { method: 'POST', body: { email: 'someone@example.com' } })).rejects.toBeInstanceOf(ApiError);
    expect(expired).not.toHaveBeenCalled();
  });
  it.each(['auth/password/change', 'auth/google/link'])('retains a valid session and CSRF after reauthentication fails at %s', async path => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Verify your current password.', code: 'REAUTH_REQUIRED' } }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'saved' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const expired = vi.fn(); setExpiredSessionHandler(expired); setCsrfToken('existing-csrf');
    await expect(request(path, { method: 'POST', body: { currentPassword: 'incorrect' } })).rejects.toMatchObject({ status: 401, code: 'REAUTH_REQUIRED' });
    expect(expired).not.toHaveBeenCalled();
    await request('portfolios', { method: 'POST', body: { name: 'Still signed in' } });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/portfolios', expect.objectContaining({ headers: expect.objectContaining({ 'X-CSRF-Token': 'existing-csrf' }) }));
  });
  it('rejects successful responses that do not conform to the API envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ unsupported: true }), { status: 200 })));
    await expect(request('assets')).rejects.toThrow('unexpected response');
  });
});
