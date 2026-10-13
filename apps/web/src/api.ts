import type { ApiEnvelope } from '@ifms/contracts';

let csrfToken: string | null = null;
let expiredSession: (() => void) | null = null;

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); this.name = 'ApiError'; }
}

export function setCsrfToken(value: string | null) { csrfToken = value; }
export function setExpiredSessionHandler(handler: (() => void) | null) { expiredSession = handler; }

export async function request<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD'].includes(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  let response: Response;
  try {
    response = await fetch(`/api/v1/${path.replace(/^\//, '')}`, {
      method, credentials: 'include', headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'We could not reach the server. Check your connection and try again.');
  }
  if (response.status === 204) return undefined as T;
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = result && typeof result === 'object' && 'error' in result ? (result as { error: { message?: unknown; code?: string } }).error : null;
    if (response.status === 401 && ['AUTH_REQUIRED', 'UNAUTHORIZED'].includes(error?.code ?? '')) { csrfToken = null; expiredSession?.(); }
    const message = error && typeof error.message === 'string' ? error.message : 'The request could not be completed. Please try again.';
    throw new ApiError(response.status, message, error?.code);
  }
  if (!result || typeof result !== 'object' || !('data' in result)) throw new ApiError(response.status, 'The server returned an unexpected response.');
  return (result as ApiEnvelope<T>).data;
}

export const api = {
  get: <T,>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T,>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Something went wrong. Please try again.'; }
