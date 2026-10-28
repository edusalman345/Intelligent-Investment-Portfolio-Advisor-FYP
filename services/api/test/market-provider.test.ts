import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alphaVantageProvider,barSchema,quoteSchema,fixtureProvider,MarketProviderError,classifyProviderNotice } from '../src/market-provider.js';
import { loadConfig } from '../src/config.js';
test('provider validation rejects impossible OHLC, negative prices, future times and preserves null volume',async()=> {
  const batch=await fixtureProvider().fetch({id:'demo',symbol:'AAPL',currency:'USD'});
  assert.equal(batch.bars.length,60); assert.ok(batch.bars.every(b=>barSchema.safeParse(b).success));
  const b=barSchema.parse(batch.bars[0]);
  assert.equal(barSchema.safeParse({...b,high:'0.1'}).success,false);
  assert.equal(barSchema.safeParse({...b,high:'invalid'}).success,false);
  assert.equal(quoteSchema.safeParse({price:'invalid',currency:'USD',volume:null,asOf:new Date().toISOString()}).success,false);
  assert.equal(quoteSchema.safeParse({price:'-1',currency:'USD',volume:null,asOf:new Date().toISOString()}).success,false);
  assert.equal(quoteSchema.safeParse({price:'1',currency:'USD',volume:null,asOf:new Date(Date.now()+86400000).toISOString()}).success,false);
  assert.equal(quoteSchema.parse({price:'1',currency:'USD',volume:null,asOf:new Date().toISOString()}).volume,null);
});
test('free adapter maps provider fields and reports quota failures without exposing keys',async()=> {
  const config=loadConfig({ALPHA_VANTAGE_API_KEY:'test-key-never-real'});
  const seen:string[]=[];
  const fetcher=(async(input:URL|string|Request)=> {
    const url=new URL(String(input));seen.push(url.searchParams.get('function')!);
    return Response.json(url.searchParams.get('function')==='GLOBAL_QUOTE'
      ? {'Global Quote':{'01. symbol':'AAPL','05. price':'100.50','07. latest trading day':'2025-01-02'}}
      : {'Meta Data':{'2. Symbol':'AAPL'},'Time Series (Daily)':{'2025-01-02':{'1. open':'100','2. high':'101','3. low':'99','4. close':'100.5','5. volume':'0'}}});
  }) as typeof fetch;
  const batch=await alphaVantageProvider(config,fetcher,fakeClock()).fetch({id:'demo',symbol:'AAPL',currency:'USD'});
  assert.deepEqual(seen,['GLOBAL_QUOTE','TIME_SERIES_DAILY']); assert.equal(quoteSchema.parse(batch.quotes[0]).volume,null); assert.equal(barSchema.parse(batch.bars[0]).volume,'0');
  const failed=alphaVantageProvider(config,(async()=>Response.json({Information:'quota test-key-never-real'})) as typeof fetch);
  await assert.rejects(failed.fetch({id:'demo',symbol:'AAPL',currency:'USD'}),error=>error instanceof Error && !error.message.includes('test-key-never-real'));
});
test('free adapter rejects missing or mismatched quote and daily response identities',async()=> {
  const config=loadConfig({ALPHA_VANTAGE_API_KEY:'synthetic-key'});
  for(const [quoteSymbol,dailySymbol] of [['MSFT','AAPL'],['AAPL','MSFT'],[undefined,'AAPL'],['AAPL',undefined]]) {
    const fetcher=(async(input:URL|string|Request)=> {
      const url=new URL(String(input));
      return Response.json(url.searchParams.get('function')==='GLOBAL_QUOTE'
        ? {'Global Quote':{'01. symbol':quoteSymbol,'05. price':'100','07. latest trading day':'2025-01-02'}}
        : {'Meta Data':{'2. Symbol':dailySymbol},'Time Series (Daily)':{}});
    }) as typeof fetch;
    await assert.rejects(alphaVantageProvider(config,fetcher,fakeClock()).fetch({id:'demo',symbol:'AAPL',currency:'USD'}),error=>error instanceof Error && 'code' in error && error.code==='MARKET_IDENTITY_INVALID');
  }
});

function validResponse(input: URL | string | Request): Response {
  const functionName = new URL(String(input)).searchParams.get('function');
  return Response.json(functionName === 'GLOBAL_QUOTE'
    ? { 'Global Quote': { '01. symbol': 'AAPL', '05. price': '100.50', '07. latest trading day': '2025-01-02' } }
    : { 'Meta Data': { '2. Symbol': 'AAPL' }, 'Time Series (Daily)': { '2025-01-02': { '1. open': '100', '2. high': '101', '3. low': '99', '4. close': '100.5' } } });
}
const testAsset = { id: 'demo', symbol: 'AAPL', currency: 'USD' };
function fakeClock() {
  let current = 0; const sleeps: number[] = [];
  return { now: () => current, sleeps, sleep: async (milliseconds: number) => { sleeps.push(milliseconds); current += milliseconds; } };
}

test('daily observations normalize newest-first provider responses into chronological order without changing malformed fields', async () => {
  const fetcher = (async (input: URL | string | Request) => {
    if (new URL(String(input)).searchParams.get('function') === 'GLOBAL_QUOTE') return validResponse(input);
    return Response.json({ 'Meta Data': { '2. Symbol': 'AAPL' }, 'Time Series (Daily)': {
      '2025-01-03': { '1. open': '101', '2. high': '103', '3. low': '100', '4. close': '102', '5. volume': '5' },
      '2025-01-02': { '1. open': '100', '2. high': '101', '3. low': '99', '4. close': '100.5', '5. volume': '0' },
      '2025-01-01': { '1. open': 'invalid', '2. high': '101', '3. low': '99', '4. close': '100' },
    } });
  }) as typeof fetch;
  const batch = await alphaVantageProvider(loadConfig({ ALPHA_VANTAGE_API_KEY: 'test-placeholder' }), fetcher, fakeClock()).fetch(testAsset);
  assert.deepEqual(batch.bars.map(bar => (bar as { time: string }).time), ['2025-01-01T00:00:00.000Z', '2025-01-02T00:00:00.000Z', '2025-01-03T00:00:00.000Z']);
  assert.equal(barSchema.safeParse(batch.bars[0]).success, false);
  assert.equal(barSchema.parse(batch.bars[1]).close, '100.5'); assert.equal(barSchema.parse(batch.bars[1]).volume, '0');
  assert.equal(barSchema.parse(batch.bars[2]).close, '102');
});

test('symbol search uses keywords and registers only canonical US/USD equities from actual-shaped matches', async () => {
  const match = { '1. symbol': 'TSLA', '2. name': 'Tesla Inc', '3. type': 'Equity', '4. region': 'United States',
    '5. marketOpen': '09:30', '6. marketClose': '16:00', '7. timezone': 'UTC-04', '8. currency': 'USD', '9. matchScore': '1.0000' };
  let calls = 0;
  const fetcher = (async (input: URL | string | Request) => {
    calls++; const url = new URL(String(input));
    assert.equal(url.searchParams.get('function'), 'SYMBOL_SEARCH'); assert.equal(url.searchParams.get('keywords'), 'Tesla');
    assert.equal(url.searchParams.has('symbol'), false); assert.equal(url.searchParams.has('outputsize'), false);
    return Response.json({ bestMatches: [match, { ...match }, { ...match, '1. symbol': 'AVGO', '2. name': 'Broadcom Inc' },
      { ...match, '1. symbol': 'TSLA.LON', '4. region': 'United Kingdom' }, { ...match, '1. symbol': 'EURO', '8. currency': 'EUR' },
      { ...match, '1. symbol': 'FUND', '3. type': 'Mutual Fund' }, { ...match, '1. symbol': 'BAD<script>' },
      { ...match, '1. symbol': 'BAD', '2. name': '<script>alert(1)</script>' }, { ...match, '1. symbol': 'MSFT', '2. name': '' }] });
  }) as typeof fetch;
  const provider = alphaVantageProvider(loadConfig({ ALPHA_VANTAGE_API_KEY: 'test-placeholder' }), fetcher, fakeClock());
  assert.deepEqual(await provider.search!('Tesla'), [
    { symbol: 'TSLA', name: 'Tesla Inc', type: 'Equity', region: 'United States', currency: 'USD' },
    { symbol: 'AVGO', name: 'Broadcom Inc', type: 'Equity', region: 'United States', currency: 'USD' },
  ]); assert.equal(calls, 1);
});

test('symbol search distinguishes no matches from malformed responses and provider quota failures', async () => {
  const config = loadConfig({ ALPHA_VANTAGE_API_KEY: 'test-placeholder' });
  assert.deepEqual(await alphaVantageProvider(config, (async () => Response.json({ bestMatches: [] })) as typeof fetch, fakeClock()).search!('Unknown company'), []);
  for (const response of [{ unrelated: [] }, { bestMatches: {} }, { bestMatches: Array(51).fill({}) }]) {
    await assert.rejects(alphaVantageProvider(config, (async () => Response.json(response)) as typeof fetch, fakeClock()).search!('Tesla'),
      error => error instanceof MarketProviderError && error.category === 'MALFORMED');
  }
  let count = 0;
  const provider = alphaVantageProvider(config, (async () => { count++; return Response.json({ Information: 'Daily API request quota reached secret-sentinel' }); }) as typeof fetch, fakeClock());
  await assert.rejects(provider.search!('Tesla'), error => error instanceof MarketProviderError && error.category === 'QUOTA' && !error.message.includes('secret-sentinel'));
  assert.equal(count, 1);
});

test('provider notices distinguish quota, credentials, reported entitlement and malformed responses without exposing text', () => {
  const samples = [
    [{ Information: 'Our standard API rate limit is 25 requests per day. Subscribe to premium. secret-sentinel' }, 'QUOTA'],
    [{ Note: 'Thank you for using Alpha Vantage! Please contact premium support for a higher API call frequency.' }, 'FREQUENCY'],
    [{ Information: 'Please consider spreading out your free API requests more sparingly (1 request per second). Lift the free key rate limit (25 requests per day) or raise the per-second burst. secret-sentinel' }, 'FREQUENCY'],
    [{ Information: 'The API key is invalid: secret-sentinel' }, 'CREDENTIALS'],
    [{ Information: 'This endpoint requires a premium subscription. secret-sentinel' }, 'ENTITLEMENT'],
    [{ 'Error Message': 'Invalid API call. Please retry or visit documentation. secret-sentinel' }, 'MALFORMED'],
    [{ Information: 'Unrecognized provider notice secret-sentinel' }, 'MALFORMED'],
  ] as const;
  for (const [body, category] of samples) {
    const error = classifyProviderNotice(body); assert.equal(error?.category, category); assert.equal(error?.retryable, false);
    assert.equal(error?.message.includes('secret-sentinel'), false);
  }
  assert.equal(classifyProviderNotice({ 'Global Quote': {} }), undefined);
});

test('transient network and server failures each retry at most once and reserve every request attempt', async () => {
  const config = loadConfig({ ALPHA_VANTAGE_API_KEY: 'test-placeholder' });
  const attempts: string[] = []; const clock = fakeClock(); const times: number[] = []; const completed: boolean[] = [];
  let reservations = 0;
  const fetcher = (async (input: URL | string | Request) => {
    const functionName = new URL(String(input)).searchParams.get('function')!;
    attempts.push(functionName); times.push(clock.now());
    if (attempts.length === 1) throw new TypeError('Network failure containing secret-sentinel');
    if (attempts.length === 3) return new Response('outage secret-sentinel', { status: 503 });
    return validResponse(input);
  }) as typeof fetch;
  const batch = await alphaVantageProvider(config, fetcher, clock).fetch(testAsset,
    { beforeRequest: async () => { reservations++; return async succeeded => { completed.push(succeeded); }; } });
  assert.equal(batch.quotes.length, 1); assert.equal(batch.bars.length, 1);
  assert.deepEqual(attempts, ['GLOBAL_QUOTE', 'GLOBAL_QUOTE', 'TIME_SERIES_DAILY', 'TIME_SERIES_DAILY']);
  assert.deepEqual(times, [0, 1100, 2200, 3300]); assert.deepEqual(clock.sleeps, [1100, 1100, 1100]);
  assert.equal(reservations, 4); assert.deepEqual(completed, [false, true, false, true]);
});

test('repeated transient failure stops after two attempts with a sanitized outage error', async () => {
  let count = 0; const clock = fakeClock();
  const provider = alphaVantageProvider(loadConfig({ ALPHA_VANTAGE_API_KEY: 'test-placeholder' }),
    (async () => { count++; throw new TypeError('secret-sentinel'); }) as typeof fetch, clock);
  await assert.rejects(provider.fetch(testAsset), error => error instanceof MarketProviderError && error.category === 'UNAVAILABLE' && !error.message.includes('secret-sentinel'));
  assert.equal(count, 2); assert.deepEqual(clock.sleeps, [1100]);
});

test('quota, reported entitlement, bad credentials and malformed bodies are never retried', async () => {
  const samples: [() => Response, string][] = [
    [() => new Response('secret-sentinel', { status: 429 }), 'QUOTA'],
    [() => new Response('secret-sentinel', { status: 401 }), 'CREDENTIALS'],
    [() => new Response('secret-sentinel', { status: 403 }), 'ENTITLEMENT'],
    [() => Response.json({ Information: 'Please subscribe to the premium endpoint.' }), 'ENTITLEMENT'],
    [() => Response.json({ Note: 'API request quota reached.' }), 'QUOTA'],
    [() => Response.json({ Information: 'Please spread out requests (1 request per second). Daily limit 25 requests per day.' }), 'FREQUENCY'],
    [() => new Response('{malformed secret-sentinel'), 'MALFORMED'],
    [() => Response.json([]), 'MALFORMED'],
  ];
  for (const [response, category] of samples) {
    let count = 0; let sleepCount = 0;
    const provider = alphaVantageProvider(loadConfig({ ALPHA_VANTAGE_API_KEY: 'test-placeholder' }),
      (async () => { count++; return response(); }) as typeof fetch, { sleep: async () => { sleepCount++; } });
    await assert.rejects(provider.fetch(testAsset), error => error instanceof MarketProviderError && error.category === category && !error.message.includes('secret-sentinel'));
    assert.equal(count, 1); assert.equal(sleepCount, 0);
  }
});

test('successful quote and daily requests wait at least 1100 milliseconds after completion', async () => {
  const clock = fakeClock(); const calls: { endpoint: string; at: number }[] = [];
  const fetcher = (async (input: URL | string | Request) => {
    calls.push({ endpoint: new URL(String(input)).searchParams.get('function')!, at: clock.now() });
    return validResponse(input);
  }) as typeof fetch;
  const result = await alphaVantageProvider(loadConfig({ ALPHA_VANTAGE_API_KEY: 'test-placeholder' }), fetcher, clock).fetch(testAsset);
  assert.equal(result.quotes.length, 1); assert.equal(result.bars.length, 1);
  assert.deepEqual(calls, [{ endpoint: 'GLOBAL_QUOTE', at: 0 }, { endpoint: 'TIME_SERIES_DAILY', at: 1100 }]);
});

test('concurrent fetches share request pacing and early timers are rechecked', async () => {
  let time = 0; let sleepCount = 0; const starts: number[] = [];
  const clock = { now: () => time, sleep: async (milliseconds: number) => { sleepCount++; time += sleepCount === 1 ? milliseconds - 1 : milliseconds; } };
  const fetcher = (async (input: URL | string | Request) => { starts.push(time); return validResponse(input); }) as typeof fetch;
  const provider = alphaVantageProvider(loadConfig({ ALPHA_VANTAGE_API_KEY: 'test-placeholder' }), fetcher, clock);
  const results = await Promise.all([provider.fetch(testAsset), provider.fetch(testAsset)]);
  assert.equal(results.length, 2); assert.deepEqual(starts, [0, 1100, 2200, 3300]); assert.equal(sleepCount, 4);
});

test('request pacing includes network, response-body and reservation-finalization latency before the 1100 millisecond gap', async () => {
  let time = 0; const starts: number[] = []; const completed: number[] = [];
  const clock = { now: () => time, sleep: async (milliseconds: number) => { time += milliseconds; } };
  const fetcher = (async (input: URL | string | Request) => {
    starts.push(time); time += 100; // Network latency before the response arrives.
    const payload = await validResponse(input).text();
    return new Response(new ReadableStream<Uint8Array>({
      pull(controller) { time += 100; controller.enqueue(new TextEncoder().encode(payload)); controller.close(); },
    }));
  }) as typeof fetch;
  const provider = alphaVantageProvider(loadConfig({ ALPHA_VANTAGE_API_KEY: 'test-placeholder' }), fetcher, clock);
  await provider.fetch(testAsset, { beforeRequest: async () => async () => { time += 50; completed.push(time); } });
  assert.deepEqual(completed, [250, 1600]); assert.deepEqual(starts, [0, 1350]);
  assert.equal(starts[1]! - completed[0]!, 1100);
});

test('a rejected request reservation prevents network egress and automatic retries', async () => {
  let requests = 0;
  const provider = alphaVantageProvider(loadConfig({ ALPHA_VANTAGE_API_KEY: 'test-placeholder' }),
    (async () => { requests++; return validResponse('https://example.test?function=GLOBAL_QUOTE'); }) as typeof fetch,
    { sleep: async () => { throw new Error('Budget failures must not retry.'); } });
  await assert.rejects(provider.fetch(testAsset, { beforeRequest: async () => { throw new Error('local request budget reached'); } }), /local request budget reached/);
  assert.equal(requests, 0);
});

test('an oversized response is rejected without retry or exposing provider text', async () => {
  let count = 0;
  const provider = alphaVantageProvider(loadConfig({ ALPHA_VANTAGE_API_KEY: 'test-placeholder' }),
    (async () => { count++; return new Response('x'.repeat(2_000_001)); }) as typeof fetch,
    { sleep: async () => { throw new Error('Malformed responses must not retry.'); } });
  await assert.rejects(provider.fetch(testAsset), error => error instanceof MarketProviderError && error.category === 'MALFORMED');
  assert.equal(count, 1);
});
