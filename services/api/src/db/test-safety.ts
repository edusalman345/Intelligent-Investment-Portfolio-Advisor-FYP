import type { Pool } from 'pg';
function databaseName(url: string): string {
  try {
    const parsed = new URL(url);
    const name = decodeURIComponent(parsed.pathname.slice(1));
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !/^[A-Za-z0-9_]+$/.test(name)) throw new Error();
    return name;
  } catch { throw new Error('Invalid database connection configuration. No connection values are logged.'); }
}
export function disposableDatabaseName(url: string): string {
  const name = databaseName(url);
  if (!name.endsWith('_test')) throw new Error('A disposable database name ending in _test is required.');
  return name;
}
export function assertDifferentDatabases(targetUrl: string, otherUrl?: string): void {
  // Deliberately require different names even across hosts, ports and URL aliases.
  // That conservative rule also covers aliases resolving to the same server.
  if (otherUrl && databaseName(targetUrl) === databaseName(otherUrl)) throw new Error('Development, integration and browser database names must differ.');
}
export async function assertDisposableConnection(pool: Pick<Pool, 'query'>, expectedName: string): Promise<void> {
  const result = await pool.query('SELECT current_database() AS name');
  if (!expectedName.endsWith('_test') || result.rows[0]?.name !== expectedName) throw new Error('Refusing to reset an unexpected or non-test database.');
}
