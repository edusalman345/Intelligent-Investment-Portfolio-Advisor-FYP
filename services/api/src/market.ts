import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import type { AppConfig } from './config.js';
import { requireAdmin, requireAuth, requireCsrf } from './auth-context.js';
import { HttpError, parse } from './errors.js';
import { ALPHA_VANTAGE_SOURCE, MarketProviderError, alphaVantageProvider, fixtureProvider, quoteSchema, barSchema, marketSearchMatchSchema, type MarketAsset, type MarketProvider, type MarketFetchContext } from './market-provider.js';

export const DEMO_ASSETS = [
  { id:'10000000-0000-4000-8000-000000000001',symbol:'AAPL',name:'Apple Inc.',exchange:'NASDAQ',sector:'Technology' },
  { id:'10000000-0000-4000-8000-000000000002',symbol:'MSFT',name:'Microsoft Corporation',exchange:'NASDAQ',sector:'Technology' },
  { id:'10000000-0000-4000-8000-000000000003',symbol:'NVDA',name:'NVIDIA Corporation',exchange:'NASDAQ',sector:'Technology' },
];
const assetSelect = `id,symbol,name,asset_type AS "assetType",exchange,currency,sector`;
const uuid = z.string().uuid();
const discoveryQuery = z.string().trim().min(1).max(80).regex(/^[\p{L}\p{N}][\p{L}\p{N} .&'()-]*$/u, 'Use a stock symbol or company name.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v);
const runSelect = `r.id,r.status,s.name AS source,r.records_received AS "recordsReceived",r.records_written AS "recordsWritten",
  (SELECT count(*)::int FROM data_quality_issues q WHERE q.ingestion_run_id=r.id) AS "issueCount",r.started_at AS "startedAt",r.finished_at AS "finishedAt"`;

async function ensureSource(client: PoolClient, provider: MarketProvider): Promise<string> {
  const source = await client.query(`INSERT INTO data_sources(name,source_type,base_url,config) VALUES($1,'MARKET',$2,$3)
    ON CONFLICT(name,source_type) DO UPDATE SET config=EXCLUDED.config RETURNING id`,
  [provider.name,provider.isDemo ? null : 'https://www.alphavantage.co',JSON.stringify({ isDemo:provider.isDemo,frequency:'end-of-day',adjusted:false })]);
  return source.rows[0].id as string;
}
function requestContext(client: PoolClient, sourceId: string, runId: string): MarketFetchContext {
  return { beforeRequest: async () => {
    // The caller holds the cross-process provider advisory lock for the full operation.
    const used = await client.query(`SELECT count(*)::int AS total FROM ingestion_runs
      WHERE source_id=$1 AND job_type='PROVIDER_REQUEST' AND started_at>NOW()-INTERVAL '24 hours'`, [sourceId]);
    if (used.rows[0].total >= 24) throw new HttpError(429, 'MARKET_REQUEST_BUDGET', 'The local market request budget is reached. Cached data remains available; retry later.');
    // Persisted completion time also protects pacing across different server/CLI processes.
    await client.query(`SELECT pg_sleep(GREATEST(0, 1.1 - EXTRACT(EPOCH FROM (clock_timestamp() -
      MAX(COALESCE(finished_at,started_at)))))) FROM ingestion_runs WHERE source_id=$1 AND job_type='PROVIDER_REQUEST'`, [sourceId]);
    const reserved = await client.query(`INSERT INTO ingestion_runs(source_id,job_type,status,request_id)
      VALUES($1,'PROVIDER_REQUEST','RUNNING',$2) RETURNING id`, [sourceId, runId]);
    return async succeeded => {
      await client.query(`UPDATE ingestion_runs SET status=$2,finished_at=NOW(),error_summary=$3 WHERE id=$1`,
        [reserved.rows[0].id, succeeded ? 'COMPLETED' : 'FAILED', succeeded ? null : 'Provider request failed; no raw response retained.']);
    };
  } };
}

export async function discoverAssets(pool: Pool, provider: MarketProvider, query: string, requestId?: string) {
  query = parse(discoveryQuery, query);
  if (provider.isDemo || !provider.search) throw new HttpError(503, 'MARKET_SEARCH_UNAVAILABLE', 'Stock discovery requires the configured real market provider. Existing catalog assets remain available.');
  const client = await pool.connect(); let runId: string | undefined;
  try {
    await client.query('SELECT pg_advisory_lock(7402302)');
    const sourceId = await ensureSource(client, provider);
    const run = await client.query(`INSERT INTO ingestion_runs(source_id,job_type,status,request_id) VALUES($1,'ASSET_DISCOVERY','RUNNING',$2) RETURNING id`, [sourceId, requestId ?? null]);
    runId = run.rows[0].id as string;
    const raw = await provider.search(query, requestContext(client, sourceId, runId));
    if (!Array.isArray(raw) || raw.length > 50) throw new MarketProviderError('MALFORMED');
    const matches = raw.map(match => marketSearchMatchSchema.safeParse(match)).filter(match => match.success).map(match => match.data);
    await client.query('BEGIN'); const registered = new Map<string, Record<string, unknown>>();
    for (const match of matches) {
      if (registered.has(match.symbol)) continue;
      const existing = await client.query(`SELECT ${assetSelect},is_active,provider_identifiers FROM assets
        WHERE symbol=$1 AND currency='USD' AND asset_type='STOCK'
        AND (provider_identifiers->>'alphaVantage'=$1 OR exchange='US') ORDER BY created_at,id LIMIT 1 FOR UPDATE`, [match.symbol]);
      if (existing.rowCount) {
        // Never reactivate an asset disabled by its administrator.
        if (!existing.rows[0].is_active) continue;
        const row = existing.rows[0];
        registered.set(match.symbol, { id: row.id, symbol: row.symbol, name: row.name, assetType: row.assetType, exchange: row.exchange, currency: row.currency, sector: row.sector });
        continue;
      }
      const inserted = await client.query(`INSERT INTO assets(symbol,name,asset_type,exchange,currency,provider_identifiers)
        VALUES($1,$2,'STOCK','US','USD',$3) ON CONFLICT(symbol,exchange) DO NOTHING RETURNING ${assetSelect}`,
      [match.symbol, match.name, JSON.stringify({ alphaVantage: match.symbol, region: match.region, exchangeUnknown: true, discoveryProvider: ALPHA_VANTAGE_SOURCE })]);
      if (inserted.rowCount) registered.set(match.symbol, inserted.rows[0]);
    }
    await client.query(`UPDATE ingestion_runs SET status='COMPLETED',finished_at=NOW(),records_received=$2,records_written=$3 WHERE id=$1`, [runId, raw.length, registered.size]);
    await client.query('COMMIT'); return [...registered.values()];
  } catch (error) {
    await client.query('ROLLBACK');
    if (runId) await client.query(`UPDATE ingestion_runs SET status='FAILED',finished_at=NOW(),error_summary=$2 WHERE id=$1`,
      [runId, `Asset discovery failed (${error instanceof MarketProviderError ? error.category : error instanceof HttpError && error.code === 'MARKET_REQUEST_BUDGET' ? 'LOCAL_BUDGET' : 'UNAVAILABLE_OR_INVALID'}); cached catalog preserved.`]);
    throw error;
  } finally { try { await client.query('SELECT pg_advisory_unlock(7402302)'); } finally { client.release(); } }
}

export async function ingestAsset(pool: Pool, provider: MarketProvider, asset: MarketAsset, requestId?: string) {
  const client = await pool.connect();
  let runId: string | undefined;
  try {
    // Cross-process serialization protects both deduplication and the free provider budget.
    await client.query('SELECT pg_advisory_lock(7402302)');
    const sourceId = await ensureSource(client, provider);
    if (!provider.isDemo) {
      const count = await client.query(`SELECT count(*)::int AS total FROM ingestion_runs WHERE source_id=$1 AND job_type='ASSET_REFRESH' AND started_at > NOW()-INTERVAL '24 hours'`,[sourceId]);
      const recent = await client.query(`SELECT 1 FROM ingestion_runs WHERE source_id=$1 AND job_type='ASSET_REFRESH' AND started_at>NOW()-INTERVAL '65 seconds' LIMIT 1`,[sourceId]);
      if (count.rows[0].total >= 12 || recent.rowCount) throw new HttpError(429,'MARKET_RATE_LIMIT','The free provider budget or cooldown has been reached. Use cached data and retry later.');
    }
    const run = await client.query(`INSERT INTO ingestion_runs(source_id,job_type,status,request_id) VALUES($1,'ASSET_REFRESH','RUNNING',$2) RETURNING id`,[sourceId,requestId ?? null]);
    runId = run.rows[0].id as string;
    const batch = await provider.fetch(asset, provider.isDemo ? undefined : requestContext(client, sourceId, runId));
    if (!Array.isArray(batch.quotes) || !Array.isArray(batch.bars) || batch.quotes.length > 5 || batch.bars.length > 500) throw new HttpError(502,'MARKET_BATCH_INVALID','Provider batch exceeds supported limits.');
    await client.query('BEGIN');
    let written=0;
    const issue = async (entity: string,code: string,key: string,severity='WARN') => {
      await client.query(`INSERT INTO data_quality_issues(ingestion_run_id,entity_type,external_key,issue_code,severity,details) VALUES($1,$2,$3,$4,$5,'{}')`,[runId,entity,key.slice(0,100),code,severity]);
    };
    for (const raw of batch.quotes) {
      const parsed=quoteSchema.safeParse(raw);
      if (!parsed.success) { await issue('quote','INVALID_QUOTE',asset.symbol,'ERROR'); continue; }
      const q=parsed.data;
      const result=await client.query(`INSERT INTO market_quotes(asset_id,source_id,price,currency,volume,as_of) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(asset_id,source_id,as_of) DO NOTHING`,[asset.id,sourceId,q.price,q.currency,q.volume,q.asOf]);
      written+=result.rowCount ?? 0;
      if (!result.rowCount) await issue('quote','DUPLICATE_RECORD',q.asOf,'INFO');
      if (Date.now()-Date.parse(q.asOf)>72*3600000) await issue('quote','STALE_RECORD',q.asOf);
    }
    let previous: string | undefined;
    for (const raw of batch.bars) {
      const parsed=barSchema.safeParse(raw);
      if (!parsed.success) { await issue('bar','INVALID_BAR',asset.symbol,'ERROR'); continue; }
      const b=parsed.data;
      if (previous && b.time<previous) await issue('bar','OUT_OF_ORDER',b.time);
      previous=b.time;
      const result=await client.query(`INSERT INTO market_price_bars(asset_id,source_id,bar_time,open,high,low,close,volume) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT(asset_id,source_id,interval,bar_time) DO NOTHING`,[asset.id,sourceId,b.time,b.open,b.high,b.low,b.close,b.volume]);
      written+=result.rowCount ?? 0;
      if (!result.rowCount) await issue('bar','DUPLICATE_RECORD',b.time,'INFO');
    }
    const invalid = await client.query(`SELECT count(*)::int AS total FROM data_quality_issues WHERE ingestion_run_id=$1 AND severity='ERROR'`,[runId]);
    const status=invalid.rows[0].total>0 ? 'FAILED':'COMPLETED';
    await client.query(`UPDATE ingestion_runs SET status=$2,finished_at=NOW(),records_received=$3,records_written=$4,error_summary=$5 WHERE id=$1`,
      [runId,status,batch.quotes.length+batch.bars.length,written,status==='FAILED'?'Invalid records quarantined; valid cached records preserved.':null]);
    await client.query('COMMIT');
    return (await client.query(`SELECT ${runSelect} FROM ingestion_runs r JOIN data_sources s ON s.id=r.source_id WHERE r.id=$1`,[runId])).rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    if (runId) {
      const category = error instanceof MarketProviderError ? error.category : error instanceof HttpError && error.code === 'MARKET_REQUEST_BUDGET' ? 'LOCAL_BUDGET' : 'UNAVAILABLE_OR_INVALID';
      await client.query(`UPDATE ingestion_runs SET status='FAILED',finished_at=NOW(),error_summary=$2 WHERE id=$1`,
        [runId, `Market refresh failed (${category}); cached data preserved.`]);
    }
    throw error;
  } finally { try { await client.query('SELECT pg_advisory_unlock(7402302)'); } finally { client.release(); } }
}

export async function seedMarket(pool: Pool) {
  for (const asset of DEMO_ASSETS) {
    await pool.query(`INSERT INTO assets(id,symbol,name,asset_type,exchange,currency,sector,provider_identifiers) VALUES($1,$2,$3,'STOCK',$4,'USD',$5,$6)
      ON CONFLICT(symbol,exchange) DO NOTHING`,[asset.id,asset.symbol,asset.name,asset.exchange,asset.sector,JSON.stringify({alphaVantage:asset.symbol})]);
    const actual=await pool.query<MarketAsset>('SELECT id,symbol,currency FROM assets WHERE symbol=$1 AND exchange=$2',[asset.symbol,asset.exchange]);
    await ingestAsset(pool,fixtureProvider(),actual.rows[0]!);
  }
  const source=await pool.query(`INSERT INTO data_sources(name,source_type,config) VALUES('Synthetic economic demo','ECONOMIC','{"isDemo":true}') ON CONFLICT(name,source_type) DO UPDATE SET config=EXCLUDED.config RETURNING id`);
  const indicator=await pool.query(`INSERT INTO economic_indicators(code,name,unit,frequency,source_id) VALUES('DEMO_CPI','Synthetic consumer price index','index','monthly',$1)
    ON CONFLICT(code,source_id) DO UPDATE SET name=EXCLUDED.name RETURNING id`,[source.rows[0].id]);
  const now=new Date();
  for(let i=0;i<12;i++) {
    const day=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-i-1,1));
    await pool.query(`INSERT INTO economic_observations(indicator_id,observation_time,value) VALUES($1,$2,$3) ON CONFLICT(indicator_id,observation_time) DO NOTHING`,[indicator.rows[0].id,day,300-i*0.5]);
  }
}

export function createMarketRouter({pool,config,provider:injected}: {pool:Pool;config:AppConfig;provider?:MarketProvider}) {
  const router=Router(); router.use(requireAuth);
  const provider=injected ?? (config.marketProvider==='fixture' ? fixtureProvider() : alphaVantageProvider(config));
  const explicitMarketLimit = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { code: 'MARKET_ACTION_RATE_LIMITED', message: 'Too many market discovery or initialization requests. Use cached data and retry shortly.' } } });
  const searchCache = new Map<string, { expiresAt: number; ids: string[] }>();
  const pendingSearches = new Map<string, Promise<Record<string, unknown>[]>>();
  const pendingInitializations = new Map<string, Promise<{ cacheUsed: boolean; run: unknown }>>();
  const localMatches = async (query: string) => (await pool.query(`SELECT ${assetSelect} FROM assets WHERE is_active AND asset_type='STOCK' AND currency='USD'
    AND provider_identifiers->>'alphaVantage'=symbol AND (symbol ILIKE $1 OR name ILIKE $1) ORDER BY CASE WHEN symbol=$2 THEN 0 ELSE 1 END,symbol LIMIT 25`,
  [`%${query.replace(/[\\%_]/g,'\\$&')}%`, query.toUpperCase()])).rows;
  router.post('/assets/discover', requireCsrf, explicitMarketLimit, async (request, response) => {
    const input = parse(z.object({ query: discoveryQuery }).strict(), request.body);
    const local = await localMatches(input.query);
    if (local.some(asset => asset.symbol.toUpperCase() === input.query.toUpperCase() || asset.name.toLocaleLowerCase('en-US') === input.query.toLocaleLowerCase('en-US'))) { response.json({ data: local }); return; }
    const key = input.query.toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
    const cached = searchCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      const result = cached.ids.length ? await pool.query(`SELECT ${assetSelect} FROM assets WHERE id=ANY($1::uuid[]) AND is_active AND currency='USD' AND asset_type='STOCK'
        AND provider_identifiers->>'alphaVantage'=symbol ORDER BY symbol`, [cached.ids]) : { rows: [] };
      response.json({ data: result.rows }); return;
    }
    searchCache.delete(key);
    let pending = pendingSearches.get(key);
    if (!pending) {
      pending = discoverAssets(pool, provider, input.query, response.locals.requestId).then(result => {
        if (searchCache.size >= 100) searchCache.delete(searchCache.keys().next().value!);
        searchCache.set(key, { expiresAt: Date.now() + (result.length ? 10 * 60_000 : 60_000), ids: result.map(row => row.id as string) });
        return result;
      }).finally(() => { pendingSearches.delete(key); });
      pendingSearches.set(key, pending);
    }
    response.json({ data: await pending });
  });
  router.post('/assets/:id/market-data', requireCsrf, explicitMarketLimit, async (request, response) => {
    const id = parse(uuid, request.params.id); parse(z.object({}).strict(), request.body ?? {});
    const found = await pool.query<MarketAsset>(`SELECT id,symbol,currency FROM assets WHERE id=$1 AND is_active AND asset_type='STOCK' AND currency='USD'
      AND provider_identifiers->>'alphaVantage'=symbol`, [id]);
    if (!found.rowCount) throw new HttpError(404, 'ASSET_NOT_FOUND', 'A validated US/USD stock was not found. Search for the stock first.');
    let pending = pendingInitializations.get(id);
    if (!pending) {
      pending = (async () => {
        const cache = await pool.query(`SELECT
          EXISTS(SELECT 1 FROM market_quotes q JOIN data_sources s ON s.id=q.source_id WHERE q.asset_id=$1 AND q.is_valid AND q.as_of<=NOW() AND q.currency='USD' AND s.is_enabled
            AND (($2='fixture' AND s.config->>'isDemo'='true') OR ($2='alpha-vantage' AND s.name=$3 AND s.config->>'isDemo'='false'))) AS quote,
          EXISTS(SELECT 1 FROM market_price_bars b JOIN data_sources s ON s.id=b.source_id WHERE b.asset_id=$1 AND b.is_valid AND b.bar_time<=NOW() AND s.is_enabled
            AND (($2='fixture' AND s.config->>'isDemo'='true') OR ($2='alpha-vantage' AND s.name=$3 AND s.config->>'isDemo'='false'))) AS history`, [id, config.marketProvider, ALPHA_VANTAGE_SOURCE]);
        if (cache.rows[0].quote && cache.rows[0].history) return { cacheUsed: true, run: null };
        const run = await ingestAsset(pool, provider, found.rows[0]!, response.locals.requestId);
        return { cacheUsed: false, run };
      })().finally(() => { pendingInitializations.delete(id); });
      pendingInitializations.set(id, pending);
    }
    response.json({ data: await pending });
  });
  router.get('/assets',async(request,response)=> {
    const q=parse(z.string().trim().max(80),request.query.q ?? '');
    const result=await pool.query(`SELECT ${assetSelect} FROM assets WHERE is_active AND (symbol ILIKE $1 OR name ILIKE $1) ORDER BY symbol LIMIT 100`,[`%${q.replace(/[\\%_]/g,'\\$&')}%`]);
    response.json({data:result.rows});
  });
  router.get('/assets/:id',async(request,response)=> {
    const id=parse(uuid,request.params.id); const result=await pool.query(`SELECT ${assetSelect} FROM assets WHERE id=$1 AND is_active`,[id]);
    if(!result.rowCount) throw new HttpError(404,'ASSET_NOT_FOUND','Asset not found.'); response.json({data:result.rows[0]});
  });
  router.get('/assets/:id/quote',async(request,response)=> {
    const id=parse(uuid,request.params.id);
    const asset=await pool.query('SELECT 1 FROM assets WHERE id=$1 AND is_active',[id]); if(!asset.rowCount) throw new HttpError(404,'ASSET_NOT_FOUND','Asset not found.');
    const result=await pool.query(`SELECT q.asset_id AS "assetId",q.price::text,q.currency,q.volume::text,q.as_of AS "asOf",q.ingested_at AS "ingestedAt",s.name AS source,
      COALESCE((s.config->>'isDemo')::boolean,false) AS "isDemo",q.as_of < NOW()-$2*INTERVAL '1 hour' AS "isStale"
      FROM market_quotes q JOIN data_sources s ON s.id=q.source_id WHERE q.asset_id=$1 AND q.is_valid AND q.as_of<=NOW()
      AND s.source_type='MARKET' AND s.is_enabled AND q.currency='USD'
      AND (($3='fixture' AND s.config->>'isDemo'='true') OR ($3='alpha-vantage' AND s.name=$4 AND s.config->>'isDemo'='false'))
      ORDER BY q.as_of DESC,q.ingested_at DESC,q.id DESC LIMIT 1`,[id,config.quoteMaxAgeHours,config.marketProvider,ALPHA_VANTAGE_SOURCE]);
    response.json({data:result.rows[0] ?? null});
  });
  router.get('/assets/:id/history',async(request,response)=> {
    const id=parse(uuid,request.params.id); const query=parse(z.object({from:date.optional(),to:date.optional()}).strict(),request.query);
    const to=query.to ? new Date(`${query.to}T23:59:59.999Z`):new Date();
    const from=query.from ? new Date(`${query.from}T00:00:00Z`):new Date(to.getTime()-365*86400000);
    if(from>to || to.getTime()-from.getTime()>5*366*86400000) throw new HttpError(400,'DATE_RANGE_INVALID','Choose an ordered range of at most five years.');
    const asset=await pool.query('SELECT 1 FROM assets WHERE id=$1 AND is_active',[id]); if(!asset.rowCount) throw new HttpError(404,'ASSET_NOT_FOUND','Asset not found.');
    const result=await pool.query(`SELECT DISTINCT ON (b.bar_time) b.bar_time AS time,b.open::text,b.high::text,b.low::text,b.close::text,b.volume::text,s.name AS source,
      COALESCE((s.config->>'isDemo')::boolean,false) AS "isDemo" FROM market_price_bars b JOIN data_sources s ON s.id=b.source_id
      WHERE b.asset_id=$1 AND b.is_valid AND b.bar_time BETWEEN $2 AND $3 AND b.bar_time<=NOW()
      AND s.source_type='MARKET' AND s.is_enabled
      AND (($4='fixture' AND s.config->>'isDemo'='true') OR ($4='alpha-vantage' AND s.name=$5 AND s.config->>'isDemo'='false'))
      ORDER BY b.bar_time,b.ingested_at DESC,b.id DESC LIMIT 2000`,[id,from,to,config.marketProvider,ALPHA_VANTAGE_SOURCE]);
    response.json({data:result.rows});
  });
  router.get('/market/economic',async(_request,response)=> {
    const result=await pool.query(`SELECT i.code,i.name,i.unit,i.frequency,o.observation_time AS "asOf",o.value::text,s.name AS source,
      COALESCE((s.config->>'isDemo')::boolean,false) AS "isDemo" FROM economic_indicators i JOIN economic_observations o ON o.indicator_id=i.id JOIN data_sources s ON s.id=i.source_id
      WHERE i.is_active AND s.is_enabled AND o.observation_time<=NOW()
      AND (($1='fixture' AND s.config->>'isDemo'='true') OR ($1='alpha-vantage' AND s.config->>'isDemo'='false'))
      ORDER BY i.code,o.observation_time DESC LIMIT 120`,[config.marketProvider]); response.json({data:result.rows});
  });
  router.get('/market/status',async(_request,response)=> {
    const result=await pool.query(`SELECT ${runSelect} FROM ingestion_runs r JOIN data_sources s ON s.id=r.source_id
      WHERE r.job_type='ASSET_REFRESH' AND s.name=$1 ORDER BY r.started_at DESC LIMIT 1`,[provider.name]);
    response.json({data:{provider:provider.name,configured:provider.isDemo || Boolean(config.alphaVantageApiKey),isDemo:provider.isDemo,lastRun:result.rows[0] ?? null}});
  });
  router.get('/market/runs',requireAdmin,async(_request,response)=> {
    response.json({data:(await pool.query(`SELECT ${runSelect} FROM ingestion_runs r JOIN data_sources s ON s.id=r.source_id
      WHERE r.job_type='ASSET_REFRESH' ORDER BY r.started_at DESC LIMIT 100`)).rows});
  });
  router.get('/market/issues',requireAdmin,async(_request,response)=> {
    response.json({data:(await pool.query(`SELECT id,ingestion_run_id AS "ingestionRunId",entity_type AS "entityType",external_key AS "externalKey",issue_code AS "issueCode",severity,created_at AS "createdAt" FROM data_quality_issues ORDER BY created_at DESC LIMIT 200`)).rows});
  });
  router.post('/market/refresh',requireAdmin,requireCsrf,async(request,response)=> {
    const input=parse(z.object({assetId:uuid.optional()}).strict(),request.body);
    // One asset per request keeps the free adapter within its quota/cooldown.
    const result=await pool.query<MarketAsset>('SELECT id,symbol,currency FROM assets WHERE is_active AND ($1::uuid IS NULL OR id=$1) ORDER BY symbol LIMIT 1',[input.assetId ?? null]);
    if(!result.rowCount) throw new HttpError(404,'ASSET_NOT_FOUND','Asset not found.');
    response.json({data:await ingestAsset(pool,provider,result.rows[0]!,response.locals.requestId)});
  });
  return router;
}
