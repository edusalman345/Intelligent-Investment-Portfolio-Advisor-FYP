import pg from 'pg';
export function createPool(connectionString: string) {
  if (!connectionString) throw new Error('DATABASE_URL is required. Configure a development database locally; do not commit credentials.');
  return new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 10000 });
}
