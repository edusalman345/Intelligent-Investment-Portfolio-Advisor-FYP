import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';
import { assertLocalDemoConfig, LocalDemoError } from '../../../scripts/local-demo-config.js';

const local = () => loadConfig({NODE_ENV:'development',DATABASE_URL:'postgresql://demo@localhost:5432/fyp_portfolio_dev',
  MARKET_PROVIDER:'alpha-vantage',ALPHA_VANTAGE_API_KEY:'test-placeholder'});

test('local demo accepts the intended database, ports and real provider without requiring Google credentials', () => {
  assert.doesNotThrow(() => assertLocalDemoConfig(local()));
});

test('local demo rejects production, remote, alternate and override database targets before connection', () => {
  for (const url of ['postgresql://demo@remote.example:5432/fyp_portfolio_dev',
    'postgresql://demo@localhost:5432/iipa_demo', 'postgresql://demo@localhost:55436/fyp_portfolio_dev',
    'postgresql://demo@localhost/fyp_portfolio_dev?host=remote.example', 'not-a-url']) {
    assert.throws(() => assertLocalDemoConfig({...local(),databaseUrl:url}), LocalDemoError);
  }
  assert.throws(() => assertLocalDemoConfig({...local(),nodeEnv:'production'}), LocalDemoError);
});

test('local demo rejects production origins, secure-cookie mode and reverse-proxy trust without weakening them', () => {
  for (const change of [{frontendOrigin:'https://iipa.example.test'}, {cookieSecure:true}, {trustProxyLoopback:true},
    {host:'0.0.0.0'}, {port:3002}, {googleCallbackUrl:'https://iipa.example.test/api/v1/auth/google/callback'}]) {
    assert.throws(() => assertLocalDemoConfig({...local(),...change}), LocalDemoError);
  }
});

test('local demo rejects partial Google credentials and synthetic/unconfigured provider mode', () => {
  assert.throws(() => assertLocalDemoConfig({...local(),googleClientId:'test-placeholder'}), LocalDemoError);
  assert.throws(() => assertLocalDemoConfig({...local(),marketProvider:'fixture'}), LocalDemoError);
  assert.throws(() => assertLocalDemoConfig({...local(),alphaVantageApiKey:''}), LocalDemoError);
});
