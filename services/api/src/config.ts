import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (process.env.NODE_ENV !== 'test' && !process.env.NODE_TEST_CONTEXT && existsSync(envFile)) loadEnvFile(envFile);

export interface AppConfig {
  nodeEnv: string; port: number; host: string; databaseUrl: string; frontendOrigin: string;
  googleClientId: string; googleClientSecret: string; googleCallbackUrl: string;
  sessionHours: number; cookieSecure: boolean; marketProvider: 'fixture' | 'alpha-vantage';
  alphaVantageApiKey: string; quoteMaxAgeHours: number; mailOutputDir: string;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const frontendOrigin = env.FRONTEND_ORIGIN || 'http://localhost:5173';
  const origin = new URL(frontendOrigin);
  if (origin.origin !== frontendOrigin || !['http:', 'https:'].includes(origin.protocol)) throw new Error('FRONTEND_ORIGIN must be an HTTP origin without a path.');
  const marketProvider = env.MARKET_PROVIDER || 'fixture';
  if (!['fixture', 'alpha-vantage'].includes(marketProvider)) throw new Error('MARKET_PROVIDER must be fixture or alpha-vantage.');
  const numeric = (name: string, fallback: number, min: number, max: number) => {
    const value = Number(env[name] || fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} is outside its supported range.`);
    return value;
  };
  const nodeEnv = env.NODE_ENV || 'development';
  return { nodeEnv, port: numeric('PORT', 3001, 1, 65535), host: env.HOST || '127.0.0.1', databaseUrl: env.DATABASE_URL || '', frontendOrigin,
    googleClientId: env.GOOGLE_CLIENT_ID || '', googleClientSecret: env.GOOGLE_CLIENT_SECRET || '', googleCallbackUrl: env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/v1/auth/google/callback',
    sessionHours: numeric('SESSION_HOURS', 24, 1, 168), cookieSecure: nodeEnv === 'production', marketProvider: marketProvider as AppConfig['marketProvider'],
    alphaVantageApiKey: env.ALPHA_VANTAGE_API_KEY || '', quoteMaxAgeHours: numeric('QUOTE_MAX_AGE_HOURS', 72, 1, 720), mailOutputDir: env.MAIL_OUTPUT_DIR || '.tmp/mail' };
}
