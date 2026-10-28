import { useCallback, useState, type FormEvent, type MouseEvent } from 'react';
import { ChartNoAxesCombined, ChevronRight, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Asset, IngestionRun, PriceBar, Quote } from '@ifms/contracts';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { PriceChart } from '../charts';
import { dateTime, marketDate, money, quantity } from '../format';
import { useResource } from '../hooks';
import { Badge, Empty, Field, Loading, Notice, PageHeading, Panel } from '../ui';
import type { MarketStatus } from './Dashboard';

export function MarketsPage() {
  const { id } = useParams();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [initializing, setInitializing] = useState<string | null>(null);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [retryAsset, setRetryAsset] = useState<Asset | null>(null);
  const navigate = useNavigate();
  const load = useCallback(async () => {
    const [cached, status] = await Promise.all([api.get<Asset[]>(`assets${query ? `?q=${encodeURIComponent(query)}` : ''}`), api.get<MarketStatus>('market/status')]);
    const assets = query && !status.isDemo
      ? await api.post<Asset[]>('assets/discover', { query }) : cached;
    return { assets, status };
  }, [query]);
  const { data, error, loading, refresh } = useResource(load);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (search.trim().length > 64) { setInitializationError('Use at most 64 characters for a symbol or company name.'); return; }
    setInitializationError(null); setRetryAsset(null);
    if (search.trim() === query) refresh(); else setQuery(search.trim());
  }
  async function initialize(asset: Asset) {
    setInitializing(asset.symbol); setInitializationError(null); setRetryAsset(null);
    try {
      const result = await api.post<{ cacheUsed: boolean; run: IngestionRun | null }>(`assets/${asset.id}/market-data`);
      setQuoteRevision(value => value + 1);
      if (!result.cacheUsed && result.run?.status !== 'COMPLETED') {
        setInitializationError('Market data did not pass quality validation. Valid cached observations remain available; retry later.'); setRetryAsset(asset);
      }
    }
    catch (failure) { setInitializationError(errorMessage(failure)); setRetryAsset(asset); }
    finally { setInitializing(null); }
  }
  function select(event: MouseEvent<HTMLAnchorElement>, asset: Asset) {
    if (data?.status.isDemo) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigate(`/markets/${asset.id}`); void initialize(asset);
  }
  return <>
    <PageHeading eyebrow="MARKET DATA" title="Explore your market.">Prices, history and provenance, with the context to read them clearly.</PageHeading>
    {data?.status.isDemo && <Notice tone="info"><strong>Demo market data.</strong> Synthetic fixture prices support this development workspace. They do not represent live or historical trading prices.</Notice>}
    {data && !data.status.isDemo && <Notice tone="info"><strong>End-of-day market data.</strong> Quotes and daily OHLCV come from the configured provider cache. They are not real-time or intraday prices. Check each observation's date and freshness; unavailable real data is never replaced with synthetic prices.</Notice>}
    {error && <Notice>{error}<button className="inline-button" onClick={refresh}>Retry</button></Notice>}
    {initializing && <Notice tone="info">Loading real market data for {initializing}. Available cached observations remain visible.</Notice>}
    {initializationError && <Notice>{initializationError}{retryAsset && <button className="inline-button" disabled={initializing !== null} onClick={() => { void initialize(retryAsset); }}>Retry market data</button>}</Notice>}
    <div className="market-layout">
      <Panel title="Asset catalog" subtitle="Search by symbol or name" className="asset-catalog">
        <form className="search-field" onSubmit={submit}><Search size={17}/><input aria-label="Search assets" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search assets…" maxLength={64}/><button type="submit" className="button button-small">Search</button></form>
        {loading ? <Loading label="Loading assets…"/> : data?.assets.length ? <div className="asset-catalog-list">{data.assets.map(asset => <Link to={`/markets/${asset.id}`} key={asset.id} onClick={event => select(event, asset)} className={`asset-catalog-item ${id === asset.id ? 'selected' : ''}`}><span className="asset-symbol-mark">{asset.symbol.slice(0, 1)}</span><div><strong>{asset.symbol}</strong><span>{asset.name}</span></div><ChevronRight size={16}/></Link>)}</div> : error ? <p className="muted">Search could not be completed. Existing cached assets remain available when you clear the search.</p> : <Empty icon={<Search size={25}/>} title="No matching assets">No supported US-dollar equity matched this search. Try a different symbol or company name. Provider errors are shown separately above.</Empty>}
      </Panel>
      <div className="market-detail-stack">
        {id ? <AssetDetail key={id} id={id} revision={quoteRevision} onInitialize={data && !data.status.isDemo ? initialize : undefined} initializing={initializing !== null}/> : <Panel><Empty icon={<ChartNoAxesCombined size={32}/>} title="Take a closer look" action={data?.assets[0] && <Link to={`/markets/${data.assets[0].id}`} onClick={event => select(event, data.assets[0]!)} className="button button-secondary">Explore {data.assets[0].symbol}<ChevronRight size={16}/></Link>}>Search a symbol or company name, then select an asset to load its available real data.</Empty></Panel>}
        <EconomicIndicators/>
        <AdminMarket onRefresh={() => { refresh(); setQuoteRevision(value => value + 1); }} assets={data?.assets ?? []} currentAssetId={id}/>
      </div>
    </div>
  </>;
}

interface EconomicObservation { code: string; name: string; unit: string; frequency: string; asOf: string; value: string; source: string; isDemo: boolean }
function EconomicIndicators() {
  const load = useCallback(() => api.get<EconomicObservation[]>('market/economic'), []);
  const { data, loading, error, refresh } = useResource(load);
  return <Panel title="Selected economic observations" subtitle="Source information accompanies every observation">
    {error && <Notice>{error}<button className="inline-button" onClick={refresh}>Retry</button></Notice>}
    {loading ? <Loading label="Loading economic observations…"/> : data?.length ? <div className="table-scroll"><table><thead><tr><th>Indicator</th><th className="numeric">Value</th><th>Frequency</th><th>As of</th><th>Source</th></tr></thead><tbody>{data.map(observation => <tr key={`${observation.code}-${observation.asOf}`}><td><strong>{observation.name}</strong><span className="table-subtext">{observation.code}</span></td><td className="numeric strong">{quantity(observation.value)} {observation.unit}</td><td>{observation.frequency}</td><td>{marketDate(observation.asOf)}</td><td>{observation.isDemo ? <Badge tone="demo">DEMO FIXTURE</Badge> : observation.source}</td></tr>)}</tbody></table></div> : <p className="chart-empty muted">No economic observations are available yet.</p>}
  </Panel>;
}

function AssetDetail({ id, revision, onInitialize, initializing }: { id: string; revision: number; onInitialize?: (asset: Asset) => Promise<void>; initializing: boolean }) {
  const [range, setRange] = useState(90);
  const load = useCallback(async () => {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - range * 86_400_000).toISOString().slice(0, 10);
    const [asset, quote, bars] = await Promise.all([api.get<Asset>(`assets/${id}`), api.get<Quote | null>(`assets/${id}/quote`), api.get<PriceBar[]>(`assets/${id}/history?from=${from}&to=${to}`)]);
    return { asset, quote, bars };
  }, [id, range, revision]);
  const { data, loading, error, refresh } = useResource(load);
  if (loading && !data) return <Panel><Loading label="Loading market history…"/></Panel>;
  if (error) return <Notice>{error}<button className="inline-button" onClick={refresh}>Retry</button></Notice>;
  if (!data) return null;
  const { asset, quote, bars } = data;
  return <>{onInitialize && (!quote || !bars.length) && <Notice tone="info">Real market observations are incomplete.<button className="inline-button" disabled={initializing} onClick={() => { void onInitialize(asset); }}>Load real market data</button></Notice>}<Panel className="asset-detail"><div className="asset-detail-top"><div className="asset-title"><span className="asset-symbol-mark large">{asset.symbol.slice(0, 1)}</span><div><div className="eyebrow">{asset.exchange ?? asset.assetType} · {asset.currency}</div><h2>{asset.name}</h2><span className="muted">{asset.symbol}{asset.sector && ` · ${asset.sector}`}</span></div></div><Badge>{asset.assetType}</Badge></div><div className="quote-header"><div><div className="quote-label">Latest available price</div><div className="quote-price">{money(quote?.price, asset.currency)}</div></div><div className="quote-badges">{quote?.isDemo && <Badge tone="demo">DEMO FIXTURE</Badge>}{quote?.isStale && <Badge tone="warning">STALE</Badge>}</div></div>{quote ? <p className="data-asof">As of {marketDate(quote.asOf)} · Source: {quote.source}</p> : <Notice tone="info">No quote is available for this asset. Holdings using this asset will be marked unpriced.</Notice>}<div className="chart-toolbar"><h3>Closing price history</h3><div className="range-toggle" aria-label="History range">{[30, 90, 365].map(days => <button key={days} aria-pressed={range === days} className={range === days ? 'selected' : ''} onClick={() => setRange(days)}>{days === 365 ? '1Y' : `${days}D`}</button>)}</div></div>{loading ? <Loading label="Updating history…"/> : bars.length > 0 ? <><PriceChart bars={bars} currency={asset.currency}/><div className="chart-caption">{bars.length} daily observations · {bars.some(bar => bar.isDemo) ? 'Synthetic demo fixture' : bars[0]?.source} · Closing prices</div></> : <Empty icon={<ChartNoAxesCombined size={25}/>} title="No history in this range">Try another date range or ask an administrator to refresh available data.</Empty>}<div className="quote-facts"><div><span>Currency</span><strong>{asset.currency}</strong></div><div><span>Latest volume</span><strong>{quantity(quote?.volume)}</strong></div><div><span>Ingested</span><strong>{dateTime(quote?.ingestedAt)}</strong></div></div></Panel>{bars.length > 0 && <Panel title="Price observations" subtitle="Latest 10 observations, with source attribution"><div className="table-scroll"><table><thead><tr><th>Date</th><th className="numeric">Open</th><th className="numeric">High</th><th className="numeric">Low</th><th className="numeric">Close</th><th>Source</th></tr></thead><tbody>{bars.slice(-10).reverse().map(bar => <tr key={bar.time}><td>{marketDate(bar.time)}</td><td className="numeric">{money(bar.open, asset.currency)}</td><td className="numeric">{money(bar.high, asset.currency)}</td><td className="numeric">{money(bar.low, asset.currency)}</td><td className="numeric strong">{money(bar.close, asset.currency)}</td><td>{bar.isDemo ? <Badge tone="demo">DEMO</Badge> : bar.source}</td></tr>)}</tbody></table></div></Panel>}</>;
}
function AdminMarket({ onRefresh, assets, currentAssetId }: { onRefresh: () => void; assets: Asset[]; currentAssetId?: string }) {
  const { session } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const admin = session.user?.role === 'ADMIN';
  const load = useCallback(async () => admin ? api.get<IngestionRun[]>('market/runs') : [], [admin]);
  const { data, refresh } = useResource(load);
  const target = assets.find(asset => asset.id === selectedAssetId) ?? assets.find(asset => asset.id === currentAssetId) ?? assets[0];
  if (!admin) return null;
  async function ingest() {
    if (!target) { setError('Choose an asset before refreshing data.'); return; }
    setPending(true); setError(null); setSuccess(null);
    try {
      const run = await api.post<IngestionRun>('market/refresh', { assetId: target.id });
      if (run.status === 'COMPLETED') setSuccess(`Refresh for ${target.symbol} completed. Review the run below for data quality.`);
      else if (run.status === 'FAILED') setError(`Refresh for ${target.symbol} failed data quality checks. ${run.recordsWritten} valid record(s) were saved. Existing cached data remains available; review the run below for details.`);
      else setError(`Refresh for ${target.symbol} has not completed. Existing cached data remains available; review the run below for details.`);
      refresh(); onRefresh();
    }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setPending(false); }
  }
  return <Panel title="Market administration" subtitle="Ingestion and source quality" action={<Badge><ShieldCheck size={12}/>ADMIN</Badge>}>{error && <Notice>{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}<p className="muted">Refresh one selected asset from the configured source. Demo mode imports synthetic fixture observations.</p><div className="admin-refresh"><Field label="Asset to refresh"><select value={target?.id ?? ''} onChange={event => setSelectedAssetId(event.target.value)} disabled={pending || !assets.length}>{!assets.length && <option value="">No assets available</option>}{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.symbol} — {asset.name}</option>)}</select></Field><button className="button button-secondary" disabled={pending || !target} onClick={() => { void ingest(); }}><RefreshCw size={16} className={pending ? 'spin' : ''}/>{pending ? 'Refreshing…' : 'Refresh data'}</button></div>{data && data.length > 0 && <div className="table-scroll"><table><thead><tr><th>Started</th><th>Status</th><th>Source</th><th className="numeric">Written</th><th className="numeric">Issues</th></tr></thead><tbody>{data.slice(0, 5).map(run => <tr key={run.id}><td>{dateTime(run.startedAt)}</td><td><Badge tone={run.status === 'COMPLETED' ? 'green' : 'warning'}>{run.status}</Badge></td><td>{run.source}</td><td className="numeric">{run.recordsWritten}</td><td className="numeric">{run.issueCount}</td></tr>)}</tbody></table></div>}</Panel>;
}
