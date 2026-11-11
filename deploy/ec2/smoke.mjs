#!/usr/bin/env node
/** Public-demo smoke test. Never prints identities, passwords, cookies or tokens. */
import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';

const { fetch, AbortSignal } = globalThis;

let stage = 'CONFIGURATION';
let cookie = '';
let csrf = '';
let origin;
const flags = new Set(process.argv.slice(2));
const writes = flags.has('--allow-write');
const initializeMarket = flags.has('--initialize-market');

class SmokeFailure extends Error {
  constructor(category) { super('Smoke check failed.'); this.category = category; }
}
function requireCheck(condition, category = 'CHECK_FAILED') {
  if (!condition) throw new SmokeFailure(category);
}
function pass(name) { process.stdout.write(`PASS ${name}\n`); }

async function send(path, { method = 'GET', body, authenticated = false, expected = 200 } = {}) {
  const headers = { Accept: 'application/json', Origin: origin.origin };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authenticated) {
    headers.Cookie = cookie;
    if (method !== 'GET') headers['X-CSRF-Token'] = csrf;
  }
  let response;
  try {
    response = await fetch(new URL(path, origin), { method, headers, redirect: 'manual',
      signal: AbortSignal.timeout(20_000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch { throw new SmokeFailure('TRANSPORT_OR_TLS'); }
  requireCheck(response.headers.get('content-type')?.includes('application/json'), 'EXPECTED_JSON_NOT_SPA_HTML');
  const payload = await response.json().catch(() => null);
  if (response.status !== expected) {
    const code = payload?.error?.code;
    throw new SmokeFailure(typeof code === 'string' && /^[A-Z_]{1,64}$/.test(code) ? code : 'UNEXPECTED_HTTP_STATUS');
  }
  return { response, data: payload?.data };
}

function acceptSession(result) {
  const values = result.response.headers.getSetCookie().filter(value => value.startsWith('ifms_session='));
  requireCheck(values.length === 1 && result.data?.user && result.data?.csrfToken, 'SESSION_NOT_CREATED');
  requireCheck(/;\s*HttpOnly/i.test(values[0]) && /;\s*SameSite=Lax/i.test(values[0]), 'COOKIE_POLICY');
  if (origin.protocol === 'https:') requireCheck(/;\s*Secure/i.test(values[0]), 'COOKIE_NOT_SECURE');
  cookie = values[0].split(';')[0];
  csrf = result.data.csrfToken;
}

async function main() {
  requireCheck(process.env.PUBLIC_ORIGIN, 'PUBLIC_ORIGIN_REQUIRED');
  origin = new URL(process.env.PUBLIC_ORIGIN);
  requireCheck(origin.origin === process.env.PUBLIC_ORIGIN && !origin.username && !origin.password, 'ORIGIN_MUST_HAVE_NO_PATH_OR_CREDENTIALS');
  const localHttp = flags.has('--local-http') && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  requireCheck(origin.protocol === 'https:' || (origin.protocol === 'http:' && localHttp), 'PUBLIC_HTTPS_REQUIRED');
  requireCheck(!initializeMarket || writes, 'INITIALIZATION_REQUIRES_ALLOW_WRITE');

  if (origin.protocol === 'https:') {
    stage = 'HTTPS_REDIRECT';
    const insecure = new URL(origin); insecure.protocol = 'http:'; insecure.port = '';
    const redirected = await fetch(insecure, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    const location = redirected.headers.get('location');
    requireCheck([301, 302, 307, 308].includes(redirected.status) && location
      && new URL(location, insecure).origin === origin.origin, 'HTTP_TO_HTTPS_REDIRECT');
    pass('http_redirects_to_verified_https');
  }

  stage = 'FRONTEND';
  const page = await fetch(origin, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  requireCheck(page.status === 200 && page.headers.get('content-type')?.includes('text/html'), 'FRONTEND_HTTP');
  requireCheck((await page.text()).includes('IIPA - Intelligent Investment Portfolio Advisor'), 'FRONTEND_BRANDING');
  const deepLink = await fetch(new URL('/subscription', origin), { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  requireCheck(deepLink.status === 200 && deepLink.headers.get('content-type')?.includes('text/html'), 'SPA_DEEP_LINK');
  pass('frontend_and_subscription_deep_link');

  stage = 'READINESS';
  const health = await send('/health');
  const ready = await send('/ready');
  requireCheck(health.data?.status === 'ok' && ready.data?.status === 'ready', 'HEALTH_OR_READINESS');
  pass('api_health_and_readiness');

  stage = 'SESSION_ROUTING';
  const anonymous = await send('/api/v1/auth/session');
  requireCheck(anonymous.data?.user === null && anonymous.data?.csrfToken === null, 'ANONYMOUS_SESSION_ENVELOPE');
  await send('/api/v1/subscription-plans', { expected: 401 });
  pass('same_origin_session_json_and_protected_catalog');
  if (!writes) {
    process.stdout.write('SKIPPED authenticated write checks; rerun with --allow-write only after owner approval.\n');
    process.stdout.write('UNVERIFIED real Google OAuth; complete browser consent/callback/protected-page/logout separately.\n');
    return;
  }

  // Explicit opt-in creates one persistent, nonprivileged smoke account and its demo records.
  // Random credentials stay in memory. No owner account or existing record is modified.
  const email = `deployment-smoke-${randomUUID()}@example.test`;
  const password = randomBytes(32).toString('base64url');
  stage = 'REGISTER';
  acceptSession(await send('/api/v1/auth/register', { method: 'POST', expected: 201,
    body: { displayName: 'Deployment smoke test', email, password } }));
  pass('registration_and_session_cookie');

  stage = 'CATALOG';
  const plans = (await send('/api/v1/subscription-plans', { authenticated: true })).data;
  requireCheck(Array.isArray(plans), 'CATALOG_MISSING');
  requireCheck(plans.some(plan => plan.code === 'free' && plan.priceMonthly === '0.00' && plan.status === 'active')
    && plans.some(plan => plan.code === 'pro' && plan.priceMonthly === null && plan.status === 'coming_soon'), 'CATALOG_SEED_VALUES');
  pass('subscription_catalog_and_migration_002_seed');

  stage = 'REAL_MARKET';
  const status = (await send('/api/v1/market/status', { authenticated: true })).data;
  requireCheck(status?.isDemo === false && status?.configured === true, 'REAL_MARKET_PROVIDER_NOT_CONFIGURED');
  if (initializeMarket) {
    const matches = (await send('/api/v1/assets/discover', { method: 'POST', authenticated: true, body: { query: 'AAPL' } })).data;
    const match = matches?.find(asset => asset.symbol === 'AAPL');
    requireCheck(match?.id, 'AAPL_DISCOVERY_UNAVAILABLE');
    const loaded = (await send(`/api/v1/assets/${match.id}/market-data`, { method: 'POST', authenticated: true, body: {} })).data;
    requireCheck(loaded?.cacheUsed || loaded?.run?.status === 'COMPLETED', 'MARKET_INITIALIZATION_FAILED');
  }
  const assets = (await send('/api/v1/assets', { authenticated: true })).data;
  requireCheck(Array.isArray(assets) && assets.length > 0, 'REAL_MARKET_CACHE_EMPTY');
  let asset;
  let quote;
  // Bound calls and prefer the initial demo symbol. Reads do not consume provider quota.
  const candidates = [...assets].sort((a, b) => Number(b.symbol === 'AAPL') - Number(a.symbol === 'AAPL')).slice(0, 5);
  for (const candidate of candidates) {
    const found = (await send(`/api/v1/assets/${candidate.id}/quote`, { authenticated: true })).data;
    if (found?.isDemo === false && Number(found.price) > 0) { asset = candidate; quote = found; break; }
  }
  requireCheck(asset && quote, 'REAL_MARKET_CACHE_EMPTY');
  const bars = (await send(`/api/v1/assets/${asset.id}/history`, { authenticated: true })).data;
  requireCheck(Array.isArray(bars) && bars.length > 0 && bars.every(bar => bar.isDemo === false)
    && bars.some(bar => bar.volume !== null), 'REAL_HISTORY_OR_VOLUME_MISSING');
  pass('real_cached_quote_daily_history_and_volume');

  stage = 'PORTFOLIO';
  const portfolio = (await send('/api/v1/portfolios', { method: 'POST', authenticated: true, expected: 201,
    body: { name: 'Deployment smoke portfolio', baseCurrency: 'USD' } })).data;
  requireCheck(portfolio?.id, 'PORTFOLIO_NOT_CREATED');
  for (const [type, quantity] of [['BUY', '1'], ['SELL', '0.25']]) {
    await send(`/api/v1/portfolios/${portfolio.id}/transactions`, { method: 'POST', authenticated: true, expected: 201,
      body: { type, assetId: asset.id, quantity, price: quote.price, fees: '0', currency: 'USD',
        occurredAt: new Date().toISOString(), idempotencyKey: randomUUID() } });
  }
  const holdings = (await send(`/api/v1/portfolios/${portfolio.id}/holdings`, { authenticated: true })).data;
  requireCheck(holdings?.[0]?.quantity === '0.75000000', 'DERIVED_HOLDINGS');
  const valuation = (await send(`/api/v1/portfolios/${portfolio.id}/valuation`, { authenticated: true })).data;
  requireCheck(valuation?.isDemo === false && valuation?.unpricedPositionCount === 0
    && Math.abs(Number(valuation.totalMarketValue) - Number(quote.price) * 0.75) < 0.0001, 'REAL_PORTFOLIO_VALUATION');
  const watchlist = (await send('/api/v1/watchlists', { method: 'POST', authenticated: true, expected: 201,
    body: { name: 'Deployment smoke watchlist' } })).data;
  await send(`/api/v1/watchlists/${watchlist.id}/items`, { method: 'POST', authenticated: true, body: { assetId: asset.id } });
  pass('buy_sell_holdings_real_valuation_and_watchlist');

  stage = 'LOGIN_PERSISTENCE';
  await send('/api/v1/auth/logout', { method: 'POST', authenticated: true, body: {} }); cookie = ''; csrf = '';
  acceptSession(await send('/api/v1/auth/login', { method: 'POST', body: { email, password } }));
  const persisted = (await send(`/api/v1/portfolios/${portfolio.id}/holdings`, { authenticated: true })).data;
  requireCheck(persisted?.[0]?.quantity === '0.75000000', 'PERSISTENCE_AFTER_LOGIN');
  const persistedList = (await send(`/api/v1/watchlists/${watchlist.id}`, { authenticated: true })).data;
  requireCheck(persistedList?.items?.some(item => item.assetId === asset.id), 'WATCHLIST_PERSISTENCE');
  pass('password_login_and_persistence');

  stage = 'LOGOUT';
  await send('/api/v1/auth/logout', { method: 'POST', authenticated: true, body: {} });
  await send('/api/v1/portfolios', { authenticated: true, expected: 401 });
  cookie = ''; csrf = '';
  pass('logout_revocation_and_api_protection');
  process.stdout.write('UNVERIFIED real Google OAuth; complete browser consent/callback/protected-page/logout separately.\n');
  process.stdout.write('UNVERIFIED production password-reset delivery; current server intentionally has no production mail adapter.\n');
}

try { await main(); }
catch (error) {
  // Never serialize errors, HTTP bodies or URLs: provider/network exceptions may include secrets.
  const category = error instanceof SmokeFailure ? error.category : 'UNEXPECTED_OR_TRANSPORT';
  process.stderr.write(`FAIL ${stage} ${category}\n`);
  process.exitCode = 1;
} finally {
  if (cookie && csrf && origin) {
    try { await send('/api/v1/auth/logout', { method: 'POST', authenticated: true, body: {} }); } catch { /* best effort, no sensitive output */ }
  }
}
