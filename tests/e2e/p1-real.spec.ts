import { readFile, readdir } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { Decimal } from 'decimal.js';

const symbols = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AVGO'] as const;
const assetId = '10000000-0000-4000-8000-000000000001';
const dollars = (value: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));

async function screenshot(page: Page, info: TestInfo, name: string) {
  await expect(page.locator('.loading-state')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  if (await page.locator('canvas').count()) await page.waitForTimeout(1200);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true, animations: 'disabled' });
}
async function mobile(page: Page, info: TestInfo, name: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot(page, info, `${name}-mobile`);
  await page.setViewportSize({ width: 1280, height: 720 });
}

test('real stored OHLCV powers buy/sell holdings, valuation, watchlists and secure account lifecycle', async ({ page }, info) => {
  test.skip(process.env.E2E_REAL_MARKET !== '1', 'Requires recorded, validated real-provider observations.');
  test.setTimeout(150000);
  const journeyStarted = Date.now();
  let browserErrors = 0;
  page.on('pageerror', () => { browserErrors++; });
  const saved = JSON.parse(await readFile(new URL('../../.tmp/real-market/AAPL.json', import.meta.url), 'utf8'));
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/portfolios');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/register');
  await page.getByLabel('Your name').fill('P1 Acceptance Investor');
  await page.getByLabel('Email address').fill('real-market-browser@example.test');
  await page.getByLabel(/^Password/).fill('P1 local acceptance passphrase');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();

  for (const symbol of symbols) {
    const asset = JSON.parse(await readFile(new URL(`../../.tmp/real-market/${symbol}.json`, import.meta.url), 'utf8'));
    const id = asset.asset?.id ?? `10000000-0000-4000-8000-${String(symbols.indexOf(symbol) + 1).padStart(12, '0')}`;
    // Use the application's navigation instead of repeatedly reloading its auth session.
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Markets', exact: true }).click();
    await page.getByLabel('Search assets').fill(symbol);
    await page.getByRole('button', {name:'Search',exact:true}).click();
    await page.locator('.asset-catalog-list').getByRole('link').filter({hasText:symbol}).click();
    await expect(page).toHaveURL(new RegExp(`/markets/${id}$`));
    const quoteResponse = await page.request.get(`/api/v1/assets/${id}/quote`);
    expect(quoteResponse.status()).toBe(200);
    const quote = (await quoteResponse.json()).data;
    expect(quote.isDemo).toBe(false);
    expect(quote.source).toBe('Alpha Vantage free daily data');
    expect(quote.price).toBe(new Decimal(asset.batch.quotes[0].price).toFixed(8));
    // The selected asset is already open; keep all detail assertions on that page.
    await expect(page.getByText('End-of-day market data.', { exact: true })).toBeVisible();
    await expect(page.locator('.asset-detail').getByText('DEMO FIXTURE', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Price observations' })).toBeVisible();
    await expect(page.locator('.data-asof')).toContainText('Alpha Vantage free daily data');
    await screenshot(page, info, `real-${symbol}-desktop`);
    if (symbol === 'AAPL' || symbol === 'TSLA') await mobile(page, info, `real-market-${symbol}`);
  }

  // Five-stock navigation deliberately respects the unchanged 300/minute API limit.
  await page.waitForTimeout(Math.max(0, 61_000 - (Date.now() - journeyStarted)));
  await page.goto('/portfolios');
  await page.getByRole('button', { name: 'New portfolio', exact: true }).click();
  await page.getByLabel('Portfolio name').fill('Real market acceptance');
  await page.getByRole('dialog').getByRole('button', { name: 'Create portfolio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Real market acceptance' })).toBeVisible();
  const portfolioId = new URL(page.url()).pathname.split('/').at(-1)!;
  for (const [type, amount] of [['BUY', '2'], ['SELL', '0.5']] as const) {
    await page.getByRole('button', { name: 'Add transaction', exact: true }).first().click();
    await page.getByLabel('Transaction type').selectOption(type);
    await page.getByRole('combobox', { name: /^Asset/ }).selectOption(assetId);
    await page.getByLabel(/^Quantity/).fill(amount);
    await page.getByLabel('Price per unit (USD)').fill(saved.batch.quotes[0].price);
    await page.getByRole('button', { name: 'Record transaction', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  let dynamicMarketValue = new Decimal(0);
  for (const symbol of ['TSLA', 'AVGO']) {
    const recorded = JSON.parse(await readFile(new URL(`../../.tmp/real-market/${symbol}.json`, import.meta.url), 'utf8'));
    dynamicMarketValue = dynamicMarketValue.add(recorded.batch.quotes[0].price);
    for (const type of ['BUY', 'SELL']) {
      await page.getByRole('button', { name: 'Add transaction', exact: true }).first().click();
      await page.getByLabel('Transaction type').selectOption(type);
      await page.getByRole('combobox', { name: /^Asset/ }).selectOption(recorded.asset.id);
      await page.getByLabel(/^Quantity/).fill(type === 'BUY' ? '2' : '1');
      await page.getByLabel('Price per unit (USD)').fill(recorded.batch.quotes[0].price);
      await page.getByRole('button', { name: 'Record transaction', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  }
  const valuation = (await (await page.request.get(`/api/v1/portfolios/${portfolioId}/valuation`)).json()).data;
  expect(valuation.isDemo).toBe(false);
  expect(valuation.unpricedPositionCount).toBe(0);
  expect(valuation.positions[0].quantity).toBe('1.50000000');
  expect(valuation.totalMarketValue).toBe(new Decimal(saved.batch.quotes[0].price).mul('1.5').add(dynamicMarketValue).toFixed(8));
  expect(valuation.positions).toHaveLength(3);
  expect(valuation.positions.find((position: { symbol: string }) => position.symbol === 'TSLA').quantity).toBe('1.00000000');
  expect(valuation.positions.find((position: { symbol: string }) => position.symbol === 'AVGO').quantity).toBe('1.00000000');
  expect(valuation.positions[0].source).toBe('Alpha Vantage free daily data');
  const holdingPanel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Holdings', exact: true }) });
  await expect(holdingPanel.getByText('Alpha Vantage free daily data', { exact: true }).first()).toBeVisible();
  await expect(holdingPanel.getByText(/Cached daily quote|Stale quote/).first()).toBeVisible();
  const snapshots = (await (await page.request.get(`/api/v1/portfolios/${portfolioId}/valuation/history`)).json()).data;
  expect(snapshots.length).toBeGreaterThanOrEqual(3);
  expect(snapshots.every((snapshot: { marketProvider: string }) => snapshot.marketProvider === 'alpha-vantage')).toBe(true);
  await expect(page.locator('.value-card').filter({ hasText: 'Holdings market value' }).getByText(dollars(valuation.totalMarketValue), { exact: true })).toBeVisible();
  await screenshot(page, info, 'real-portfolio-desktop');
  await mobile(page, info, 'real-portfolio');

  await page.goto('/watchlists');
  await page.getByRole('button', { name: 'New watchlist' }).click();
  await page.getByLabel('Watchlist name').fill('Real source watchlist');
  await page.getByRole('button', { name: 'Create watchlist', exact: true }).click();
  await page.getByRole('button', { name: 'Add an asset' }).click();
  await page.getByLabel('Find an asset').fill('AAPL');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove AAPL from Real source watchlist' })).toBeVisible();
  for (const symbol of ['TSLA', 'AVGO']) {
    await page.getByRole('button', { name: 'Add an asset' }).click();
    await page.getByLabel('Find an asset').fill(symbol);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('button', { name: `Remove ${symbol} from Real source watchlist` })).toBeVisible();
  }
  await screenshot(page, info, 'real-watchlist-desktop');
  await mobile(page, info, 'real-watchlist');

  await page.goto('/settings');
  await page.getByLabel('Current password', { exact: true }).fill('P1 local acceptance passphrase');
  await page.getByLabel(/^New password/).fill('P1 replacement acceptance passphrase');
  await page.getByLabel('Confirm new password', { exact: true }).fill('P1 replacement acceptance passphrase');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText('Your password has been updated.')).toBeVisible();
  await screenshot(page, info, 'real-settings-desktop');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email address').fill('real-market-browser@example.test');
  await page.getByLabel('Password', { exact: true }).fill('P1 replacement acceptance passphrase');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/portfolios');
  await expect(page).toHaveURL(/\/login$/);
  const outbox = new URL('../../.tmp/e2e-mail/', import.meta.url);
  const oldMessages = new Set(await readdir(outbox).catch(() => [] as string[]));
  await page.goto('/forgot-password');
  await page.getByLabel('Email address').fill('real-market-browser@example.test');
  await page.getByRole('button', { name: 'Send reset instructions', exact: true }).click();
  await expect(page.getByText('If this address belongs to an account, password reset instructions have been sent. Check your inbox.')).toBeVisible();
  const delivered = (await readdir(outbox)).filter(name => !oldMessages.has(name));
  expect(delivered.length).toBe(1);
  const message = JSON.parse(await readFile(new URL(delivered[0]!, outbox), 'utf8'));
  // The private local delivery is read in memory only; never print its URL/token or retain a trace.
  expect(message.subject).toBe('Reset your IIPA password');
  const reset = new URL(message.resetUrl);
  const token = reset.searchParams.get('token');
  expect(Boolean(token)).toBe(true);
  expect(reset.origin === new URL(page.url()).origin && reset.pathname === '/reset-password').toBe(true);
  try { await page.goto(reset.toString()); }
  catch { await page.goto('/login'); throw new Error('Recovery navigation failed; sensitive URL suppressed.'); }
  await page.waitForFunction(() => location.search === '');
  await page.getByLabel(/^New password/).fill('P1 reset acceptance passphrase');
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByText('Your password has been reset. Sign in with your new password.')).toBeVisible();
  await screenshot(page, info, 'real-recovery-desktop');
  const replay = await page.request.post('/api/v1/auth/password/reset', {
    headers: { Origin: new URL(page.url()).origin }, data: { token, newPassword: 'P1 reset acceptance passphrase' },
  });
  expect(replay.status()).toBe(400);
  await page.goto('/login');
  await page.getByLabel('Email address').fill('real-market-browser@example.test');
  await page.getByLabel('Password', { exact: true }).fill('P1 reset acceptance passphrase');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/portfolios');
  await expect(page).toHaveURL(/\/login$/);
  expect(browserErrors).toBe(0);
});
