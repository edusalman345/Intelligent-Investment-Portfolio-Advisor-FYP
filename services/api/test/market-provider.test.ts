import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alphaVantageProvider,barSchema,quoteSchema,fixtureProvider } from '../src/market-provider.js';
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
  const batch=await alphaVantageProvider(config,fetcher).fetch({id:'demo',symbol:'AAPL',currency:'USD'});
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
    await assert.rejects(alphaVantageProvider(config,fetcher).fetch({id:'demo',symbol:'AAPL',currency:'USD'}),error=>error instanceof Error && 'code' in error && error.code==='MARKET_IDENTITY_INVALID');
  }
});
