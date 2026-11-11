import type { AppConfig } from '../services/api/src/config.js';

export class LocalDemoError extends Error {
  constructor(public readonly code: string) { super(code); }
}

/** No connection occurs until the approved local target and origin are verified. */
export function assertLocalDemoConfig(config: AppConfig): void {
  let database: URL;
  try { database = new URL(config.databaseUrl); }
  catch { throw new LocalDemoError('LOCAL_DATABASE_CONFIGURATION_REQUIRED'); }
  if (!['postgres:', 'postgresql:'].includes(database.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname)
    || (database.port && database.port !== '5432')
    || database.pathname !== '/fyp_portfolio_dev' || database.search || database.hash) {
    throw new LocalDemoError('LOCAL_DATABASE_TARGET_REJECTED');
  }
  if (config.nodeEnv !== 'development' || config.host !== '127.0.0.1' || config.port !== 3001
    || config.frontendOrigin !== 'http://localhost:5173' || config.cookieSecure || config.trustProxyLoopback) {
    throw new LocalDemoError('LOCAL_SERVER_CONFIGURATION_REQUIRED');
  }
  if (config.googleCallbackUrl !== 'http://localhost:3001/api/v1/auth/google/callback') {
    throw new LocalDemoError('LOCAL_GOOGLE_CALLBACK_REQUIRED');
  }
  if (Boolean(config.googleClientId) !== Boolean(config.googleClientSecret)) {
    throw new LocalDemoError('LOCAL_GOOGLE_CONFIGURATION_INCOMPLETE');
  }
  if (config.marketProvider !== 'alpha-vantage' || !config.alphaVantageApiKey) {
    throw new LocalDemoError('LOCAL_REAL_MARKET_CONFIGURATION_REQUIRED');
  }
}
