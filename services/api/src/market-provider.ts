import { Decimal } from 'decimal.js';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import { HttpError } from './errors.js';

export interface MarketAsset { id: string; symbol: string; currency: string }
export interface MarketBatch { quotes: unknown[]; bars: unknown[] }
export interface MarketFetchContext { beforeRequest?: () => Promise<(succeeded: boolean) => Promise<void>> }
export interface MarketProvider { name: string; isDemo: boolean; fetch(asset: MarketAsset, context?: MarketFetchContext): Promise<MarketBatch>;
  search?(query: string, context?: MarketFetchContext): Promise<MarketSearchMatch[]> }
export const marketSearchMatchSchema = z.object({ symbol: z.string().max(16).regex(/^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)?$/),
  name: z.string().trim().min(1).max(255).regex(/^[^<>]+$/).refine(value => ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)), type: z.literal('Equity'), region: z.literal('United States'), currency: z.literal('USD') }).strict();
export type MarketSearchMatch = z.infer<typeof marketSearchMatchSchema>;
export const ALPHA_VANTAGE_SOURCE = 'Alpha Vantage free daily data';
export type MarketProviderFailure = 'FREQUENCY' | 'QUOTA' | 'ENTITLEMENT' | 'CREDENTIALS' | 'MALFORMED' | 'UNAVAILABLE' | 'IDENTITY';
const failureMessages: Record<MarketProviderFailure, string> = {
  FREQUENCY: 'The market provider rejected a short-term request burst. Each request waits at least 1.1 seconds after the previous request completes; wait before trying another refresh. Cached data remains available.',
  QUOTA: 'The market provider request quota is reached. Use cached data and retry later.',
  ENTITLEMENT: 'The market provider reports that this request needs an additional entitlement. Verify the endpoint and account access before retrying; cached data remains available.',
  CREDENTIALS: 'The market provider rejected its configured credentials. Verify the development API configuration; cached data remains available.',
  MALFORMED: 'The market provider returned an incomplete or invalid response. Cached data remains available.',
  UNAVAILABLE: 'The market provider is temporarily unavailable. Cached data remains available.',
  IDENTITY: 'The market provider returned data for an unexpected asset. Cached data remains available.',
};
const failureCodes: Record<MarketProviderFailure, string> = {
  FREQUENCY: 'MARKET_PROVIDER_FREQUENCY',
  QUOTA: 'MARKET_PROVIDER_QUOTA', ENTITLEMENT: 'MARKET_PROVIDER_ENTITLEMENT', CREDENTIALS: 'MARKET_PROVIDER_CREDENTIALS',
  MALFORMED: 'MARKET_PROVIDER_MALFORMED', UNAVAILABLE: 'MARKET_PROVIDER_UNAVAILABLE', IDENTITY: 'MARKET_IDENTITY_INVALID',
};
export class MarketProviderError extends HttpError {
  constructor(public category: MarketProviderFailure, public retryable = false) {
    super(category === 'QUOTA' || category === 'FREQUENCY' ? 429 : 502, failureCodes[category], failureMessages[category]);
  }
}
/** Provider notices are examined locally, then discarded; never persist their text. */
export function classifyProviderNotice(record: Record<string, unknown>): MarketProviderError | undefined {
  const notices = [record.Information, record.Note, record['Error Message']].filter(value => typeof value === 'string') as string[];
  if (!notices.length) return undefined;
  const message = notices.join(' ').slice(0, 16000).toLowerCase();
  if (/(?:api[ _-]?key|apikey|credential).{0,80}(?:invalid|missing|incorrect|expired|not valid)|(?:invalid|missing|incorrect|expired).{0,80}(?:api[ _-]?key|apikey|credential)/.test(message)) {
    return new MarketProviderError('CREDENTIALS');
  }
  if (/per[ -]?second|requests?\s*(?:per|\/)\s*second|1\s*requests?\s*per\s*second|burst|call frequency|requests? per minute|spread.{0,60}(?:request|sparingly)/.test(message)) {
    return new MarketProviderError('FREQUENCY');
  }
  if (/rate.?limit|requests? per day|(?:request|call|daily|usage).{0,30}(?:limit|quota)|quota/.test(message)) return new MarketProviderError('QUOTA');
  if (/premium|subscription|entitlement|subscribe|access.{0,20}(?:denied|restricted)/.test(message)) return new MarketProviderError('ENTITLEMENT');
  return new MarketProviderError('MALFORMED');
}
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

// Approved free symbol search and end-of-day endpoints; no entitlement is assumed.
export function alphaVantageProvider(config: AppConfig, fetcher: typeof fetch = fetch,
  options: { sleep?: (milliseconds: number) => Promise<void>; now?: () => number } = {}): MarketProvider {
  const sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const now = options.now ?? (() => performance.now());
  let lastRequestCompletedAt: number | undefined;
  let previousRequest: Promise<void> = Promise.resolve();
  async function performRequest(functionName: string, symbol: string, context?: MarketFetchContext): Promise<Record<string, unknown>> {
    if (!config.alphaVantageApiKey) throw new HttpError(503, 'MARKET_NOT_CONFIGURED', 'Configure the optional free market provider key.');
    const url = new URL('https://www.alphavantage.co/query');
    url.searchParams.set('function', functionName); url.searchParams.set(functionName === 'SYMBOL_SEARCH' ? 'keywords' : 'symbol', symbol); url.searchParams.set('apikey', config.alphaVantageApiKey);
    if (functionName !== 'SYMBOL_SEARCH') url.searchParams.set('outputsize', 'compact');
    // Reserve before egress, including retries; a rejected reservation never contacts the provider.
    const finish = await context?.beforeRequest?.();
    let succeeded = false; let started = false;
    try {
      // A monotonic clock protects the gap if the system clock changes. Recheck after
      // sleeping because timers may wake early. Waiting after the whole prior response
      // avoids a shorter provider-side gap when the two requests have different latency.
      while (lastRequestCompletedAt !== undefined && now() - lastRequestCompletedAt < 1100) await sleep(1100 - (now() - lastRequestCompletedAt));
      let response: Response;
      started = true;
      try { response = await fetcher(url, { signal: AbortSignal.timeout(10000), redirect: 'error' }); }
      catch { throw new MarketProviderError('UNAVAILABLE', true); }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        if (response.status === 429) throw new MarketProviderError('QUOTA');
        if (response.status === 401) throw new MarketProviderError('CREDENTIALS');
        if (response.status === 403) throw new MarketProviderError('ENTITLEMENT');
        if (response.status >= 500) throw new MarketProviderError('UNAVAILABLE', true);
        throw new MarketProviderError('MALFORMED');
      }
      // Bound responses before parsing; never log the request URL or provider body.
      const reader = response.body?.getReader(); if (!reader) throw new MarketProviderError('MALFORMED');
      let size = 0; const chunks: Uint8Array[] = [];
      try {
        while (true) { let next: ReadableStreamReadResult<Uint8Array>;
          try { next = await reader.read(); } catch { throw new MarketProviderError('UNAVAILABLE', true); }
          if (next.done) break; size += next.value.byteLength;
          if (size > 2_000_000) { await reader.cancel().catch(() => undefined); throw new MarketProviderError('MALFORMED'); } chunks.push(next.value); }
      } finally { reader.releaseLock(); }
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new MarketProviderError('MALFORMED'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MarketProviderError('MALFORMED');
      const record = body as Record<string, unknown>;
      const notice = classifyProviderNotice(record); if (notice) throw notice;
      succeeded = true;
      return record;
    } finally {
      try { if (finish) await finish(succeeded); }
      finally { if (started) lastRequestCompletedAt = now(); }
    }
  }
  async function attempt(functionName: string, symbol: string, context?: MarketFetchContext): Promise<Record<string, unknown>> {
    // Serialize adapter calls so concurrent fetches cannot reserve the same request slot.
    const previous = previousRequest;
    let release!: () => void;
    previousRequest = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await performRequest(functionName, symbol, context); }
    finally { release(); }
  }
  async function get(functionName: string, symbol: string, context?: MarketFetchContext): Promise<Record<string, unknown>> {
    for (let count = 0; count < 2; count++) {
      try { return await attempt(functionName, symbol, context); }
      catch (error) {
        if (!(error instanceof MarketProviderError) || !error.retryable || count === 1) throw error;
      }
    }
    throw new MarketProviderError('UNAVAILABLE');
  }
  return { name: ALPHA_VANTAGE_SOURCE, isDemo: false, async search(query, context) {
    const response = await get('SYMBOL_SEARCH', query, context);
    if (!Array.isArray(response.bestMatches) || response.bestMatches.length > 50) throw new MarketProviderError('MALFORMED');
    const matches = new Map<string, MarketSearchMatch>();
    for (const raw of response.bestMatches) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const record = raw as Record<string, unknown>;
      const parsed = marketSearchMatchSchema.safeParse({ symbol: record['1. symbol'], name: record['2. name'], type: record['3. type'],
        region: record['4. region'], currency: record['8. currency'] });
      if (parsed.success && !matches.has(parsed.data.symbol)) matches.set(parsed.data.symbol, parsed.data);
    }
    return [...matches.values()];
  }, async fetch(asset, context) {
    const quoteResult = await get('GLOBAL_QUOTE', asset.symbol, context);
    const daily = await get('TIME_SERIES_DAILY', asset.symbol, context);
    const q = quoteResult['Global Quote']; const series = daily['Time Series (Daily)'];
    if (!q || typeof q !== 'object' || Array.isArray(q) || !series || typeof series !== 'object' || Array.isArray(series)) throw new MarketProviderError('MALFORMED');
    const quote = q as Record<string, unknown>;
    const metadata = daily['Meta Data'];
    const dailySymbol = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>)['2. Symbol'] : undefined;
    if (quote['01. symbol'] !== asset.symbol || dailySymbol !== asset.symbol) throw new MarketProviderError('IDENTITY');
    const bars = Object.entries(series).slice(0,100).map(([date,value]) => {
      const b = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
      return { time: `${date}T00:00:00.000Z`, open: b['1. open'], high: b['2. high'], low: b['3. low'], close: b['4. close'], volume: b['5. volume'] ?? null };
    });
    // Alpha Vantage returns newest dates first; ingestion expects chronological observations.
    bars.sort((left, right) => left.time.localeCompare(right.time));
    return { quotes: [{ price: quote['05. price'], currency: asset.currency, volume: quote['06. volume'] ?? null, asOf: `${String(quote['07. latest trading day'])}T00:00:00.000Z` }], bars };
  } };
}
