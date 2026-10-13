import { Decimal } from 'decimal.js';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import { HttpError } from './errors.js';

export interface MarketAsset { id: string; symbol: string; currency: string }
export interface MarketBatch { quotes: unknown[]; bars: unknown[] }
export interface MarketProvider { name: string; isDemo: boolean; fetch(asset: MarketAsset): Promise<MarketBatch> }
const positive = z.string().regex(/^\d{1,16}(\.\d{1,8})?$/).pipe(z.string().refine(v => new Decimal(v).gt(0)));
const volume = z.string().regex(/^\d{1,24}(\.\d{1,4})?$/).nullable();
const timestamp = z.string().datetime({ offset: true }).refine(v => new Date(v).getTime() <= Date.now(), 'Future market timestamp.');
export const quoteSchema = z.object({ price: positive, currency: z.literal('USD'), volume, asOf: timestamp }).strict();
const barFields = z.object({ time: timestamp, open: positive, high: positive, low: positive, close: positive, volume }).strict();
export const barSchema = barFields.pipe(barFields.refine(b => new Decimal(b.high).gte(b.low) && new Decimal(b.high).gte(b.open) && new Decimal(b.high).gte(b.close)
    && new Decimal(b.low).lte(b.open) && new Decimal(b.low).lte(b.close), 'Invalid OHLC bounds.'));
export type NormalizedQuote = z.infer<typeof quoteSchema>;
export type NormalizedBar = z.infer<typeof barSchema>;

export function fixtureProvider(now = new Date()): MarketProvider {
  return { name: 'Synthetic demo fixtures', isDemo: true, async fetch(asset) {
    const base = { AAPL: 180, MSFT: 420, NVDA: 130 }[asset.symbol] ?? 100;
    const bars: NormalizedBar[] = [];
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    while (bars.length < 60) {
      if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) {
        const close = base + Math.sin(day.getTime() / 86400000) * 3;
        bars.push({ time: day.toISOString(), open: (close - 0.5).toFixed(2), high: (close + 2).toFixed(2), low: (close - 2).toFixed(2), close: close.toFixed(2), volume: String(1000000 + bars.length * 15000) });
      }
      day.setUTCDate(day.getUTCDate() - 1);
    }
    bars.sort((a,b) => a.time.localeCompare(b.time));
    const last = bars.at(-1)!;
    return { bars, quotes: [{ price: last.close, currency: asset.currency, volume: last.volume, asOf: last.time }] };
  } };
}

// Only these two public endpoints are used. Premium data, news and ML are outside P1 Mid.
export function alphaVantageProvider(config: AppConfig, fetcher: typeof fetch = fetch): MarketProvider {
  async function get(functionName: string, symbol: string): Promise<Record<string, unknown>> {
    if (!config.alphaVantageApiKey) throw new HttpError(503, 'MARKET_NOT_CONFIGURED', 'Configure the optional free market provider key.');
    const url = new URL('https://www.alphavantage.co/query');
    url.searchParams.set('function', functionName); url.searchParams.set('symbol', symbol); url.searchParams.set('apikey', config.alphaVantageApiKey);
    url.searchParams.set('outputsize', 'compact');
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!response.ok) throw new Error('Provider HTTP failure');
      // Bound responses before parsing; never log the request URL or provider body.
      const reader = response.body?.getReader(); if (!reader) throw new Error('Missing provider response');
      let size = 0; const chunks: Uint8Array[] = [];
      try {
        while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength;
          if (size > 2_000_000) { await reader.cancel(); throw new Error('Oversized provider response'); } chunks.push(next.value); }
      } finally { reader.releaseLock(); }
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Malformed provider response');
      const record = body as Record<string, unknown>;
      if (record.Information || record.Note || record['Error Message']) throw new Error('Provider quota or unsupported symbol');
      return record;
    } catch { throw new HttpError(502, 'MARKET_PROVIDER_UNAVAILABLE', 'Market provider unavailable, rate limited, or returned invalid data. Cached data remains available.'); }
  }
  return { name: 'Alpha Vantage free daily data', isDemo: false, async fetch(asset) {
    const quoteResult = await get('GLOBAL_QUOTE', asset.symbol);
    const daily = await get('TIME_SERIES_DAILY', asset.symbol);
    const q = quoteResult['Global Quote']; const series = daily['Time Series (Daily)'];
    if (!q || typeof q !== 'object' || !series || typeof series !== 'object') throw new HttpError(502, 'MARKET_PROVIDER_UNAVAILABLE', 'Market provider response is incomplete.');
    const quote = q as Record<string, unknown>;
    const metadata = daily['Meta Data'];
    const dailySymbol = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>)['2. Symbol'] : undefined;
    if (quote['01. symbol'] !== asset.symbol || dailySymbol !== asset.symbol) throw new HttpError(502, 'MARKET_IDENTITY_INVALID', 'Market provider returned data for an unexpected asset. Cached data remains available.');
    const bars = Object.entries(series).slice(0,100).map(([date,value]) => {
      const b = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
      return { time: `${date}T00:00:00.000Z`, open: b['1. open'], high: b['2. high'], low: b['3. low'], close: b['4. close'], volume: b['5. volume'] ?? null };
    });
    return { quotes: [{ price: quote['05. price'], currency: asset.currency, volume: quote['06. volume'] ?? null, asOf: `${String(quote['07. latest trading day'])}T00:00:00.000Z` }], bars };
  } };
}
