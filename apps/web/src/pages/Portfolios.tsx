import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Archive, ArrowDownLeft, ArrowLeft, ArrowUpRight, Clock3, FileText, Layers3, Pencil, Plus, RotateCcw, Wallet } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Asset, Holding, Portfolio, Transaction, TransactionType, Valuation } from '@ifms/contracts';
import { api, errorMessage } from '../api';
import { AllocationChart } from '../charts';
import { dateTime, localDateTime, marketDate, money, quantity, validDecimal } from '../format';
import { useResource } from '../hooks';
import { Badge, Empty, Field, Loading, Modal, Notice, PageHeading, Panel, SubmitButton } from '../ui';

export function PortfoliosPage() {
  const load = useCallback(() => api.get<Portfolio[]>('portfolios'), []);
  const { data, error, loading, refresh } = useResource(load);
  const [params, setParams] = useSearchParams();
  const [create, setCreate] = useState(params.get('create') === '1');
  const [edit, setEdit] = useState<Portfolio | null>(null);
  const [archive, setArchive] = useState<Portfolio | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { if (params.get('create') === '1') { setCreate(true); setParams({}, { replace: true }); } }, [params, setParams]);
  async function archivePortfolio() {
    if (!archive) return;
    setPending(true); setMutationError(null);
    try { await api.delete(`portfolios/${archive.id}`); setArchive(null); refresh(); }
    catch (failure) { setMutationError(errorMessage(failure)); }
    finally { setPending(false); }
  }
  const active = data?.filter(portfolio => portfolio.status === 'ACTIVE') ?? [];
  const archived = data?.filter(portfolio => portfolio.status === 'ARCHIVED') ?? [];
  return <><PageHeading eyebrow="PORTFOLIO MANAGEMENT" title="A home for your investments." action={<button className="button button-primary" onClick={() => setCreate(true)}><Plus size={17}/>New portfolio</button>}>Organize your goals, record transactions and keep your holdings in view.</PageHeading>{error && <Notice>{error}<button className="inline-button" onClick={refresh}>Retry</button></Notice>}{loading && !data ? <Loading/> : active.length === 0 ? <Panel><Empty icon={<Wallet size={31}/>} title="Your first portfolio starts here" action={<button className="button button-primary" onClick={() => setCreate(true)}><Plus size={16}/>Create portfolio</button>}>From a long-term investment goal to a collection you’re tracking, give it a name and start adding records.</Empty></Panel> : <div className="portfolio-grid">{active.map(portfolio => <article className="portfolio-card" key={portfolio.id}><div className="portfolio-card-top"><span className="portfolio-mark"><Wallet size={25}/></span><Badge>{portfolio.baseCurrency}</Badge></div><Link to={`/portfolios/${portfolio.id}`}><h2>{portfolio.name}</h2></Link><p>{portfolio.description ?? 'Your investment records, in one place.'}</p><div className="portfolio-card-meta"><Clock3 size={13}/>Created {dateTime(portfolio.createdAt)}</div><div className="portfolio-card-bottom"><Link to={`/portfolios/${portfolio.id}`} className="text-link">Open portfolio<ArrowUpRight size={15}/></Link><div className="card-actions"><button className="icon-button" aria-label={`Edit ${portfolio.name}`} onClick={() => setEdit(portfolio)}><Pencil size={16}/></button><button className="icon-button" aria-label={`Archive ${portfolio.name}`} onClick={() => { setArchive(portfolio); setMutationError(null); }}><Archive size={16}/></button></div></div></article>)}</div>}{archived.length > 0 && <Panel title="Archived portfolios" subtitle="Records remain available for review"><div className="portfolio-overview-list">{archived.map(portfolio => <Link to={`/portfolios/${portfolio.id}`} className="portfolio-overview-item" key={portfolio.id}><Archive size={20}/><strong>{portfolio.name}</strong><Badge>ARCHIVED</Badge><ArrowUpRight size={16}/></Link>)}</div></Panel>}{create && <PortfolioForm onClose={() => setCreate(false)} onSaved={portfolio => { setCreate(false); refresh(); navigate(`/portfolios/${portfolio.id}`); }}/ >}{edit && <PortfolioForm portfolio={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }}/ >}{archive && <Modal title="Archive portfolio?" onClose={() => setArchive(null)}><p className="modal-copy">Archive <strong>{archive.name}</strong>? Its history remains available, and new transactions cannot be added.</p>{mutationError && <Notice>{mutationError}</Notice>}<div className="form-actions"><button className="button button-secondary" onClick={() => setArchive(null)}>Keep portfolio</button><button className="button button-danger" disabled={pending} onClick={() => { void archivePortfolio(); }}>{pending ? 'Archiving…' : 'Archive portfolio'}</button></div></Modal>}</>;
}

function PortfolioForm({ portfolio, onClose, onSaved }: { portfolio?: Portfolio; onClose: () => void; onSaved: (portfolio: Portfolio) => void }) {
  const [name, setName] = useState(portfolio?.name ?? '');
  const [description, setDescription] = useState(portfolio?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    if (name.trim().length < 1 || name.trim().length > 100) { setError('Give your portfolio a name between 1 and 100 characters.'); return; }
    setPending(true);
    try {
      const body = { name: name.trim(), description: description.trim() || null, baseCurrency: 'USD' };
      const result = portfolio ? await api.patch<Portfolio>(`portfolios/${portfolio.id}`, body) : await api.post<Portfolio>('portfolios', body);
      onSaved(result);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setPending(false); }
  }
  return <Modal title={portfolio ? 'Edit portfolio' : 'Create a portfolio'} onClose={onClose}><p className="modal-copy">Give your investment records a name that means something to you.</p>{error && <Notice>{error}</Notice>}<form className="form-stack" onSubmit={event => { void submit(event); }}><Field label="Portfolio name"><input value={name} onChange={event => setName(event.target.value)} placeholder="Long-term investments" required maxLength={100} autoFocus/></Field><Field label="Description (optional)"><textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} maxLength={1000} placeholder="What are you building toward?"/></Field><Field label="Base currency" hint="This first release supports USD portfolios and transactions."><input value="US Dollar (USD)" disabled/></Field><div className="form-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><SubmitButton pending={pending}>{portfolio ? 'Save changes' : 'Create portfolio'}</SubmitButton></div></form></Modal>;
}

interface ValuationSnapshot { asOf?: string; snapshotAt?: string; createdAt?: string; totalValue: string; totalMarketValue?: string; cashValue?: string; isDemo?: boolean }
export function PortfolioDetail() {
  const { id } = useParams();
  const [add, setAdd] = useState(false);
  const [edit, setEdit] = useState(false);
  const [reverse, setReverse] = useState<Transaction | null>(null);
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [portfolio, transactions, holdings, valuation, history, assets] = await Promise.all([api.get<Portfolio>(`portfolios/${id}`), api.get<Transaction[]>(`portfolios/${id}/transactions`), api.get<Holding[]>(`portfolios/${id}/holdings`), api.get<Valuation>(`portfolios/${id}/valuation`), api.get<ValuationSnapshot[]>(`portfolios/${id}/valuation/history`), api.get<Asset[]>('assets')]);
    return { portfolio, transactions, holdings, valuation, history, assets };
  }, [id]);
  const { data, loading, error, refresh } = useResource(load);
  async function reverseTransaction() {
    if (!reverse) return;
    setPending(true); setMutationError(null);
    try { await api.post(`portfolios/${id}/transactions/${reverse.id}/reverse`, { notes: notes.trim() || undefined, idempotencyKey: crypto.randomUUID() }); setReverse(null); refresh(); }
    catch (failure) { setMutationError(errorMessage(failure)); }
    finally { setPending(false); }
  }
  if (loading && !data) return <Loading label="Loading your portfolio…"/>;
  if (error) return <><Link to="/portfolios" className="back-link"><ArrowLeft size={16}/>All portfolios</Link><Notice>{error}<button className="inline-button" onClick={refresh}>Retry</button></Notice></>;
  if (!data) return null;
  const { portfolio, holdings, valuation, transactions, assets, history } = data;
  const isActive = portfolio.status === 'ACTIVE';
  return <><Link to="/portfolios" className="back-link"><ArrowLeft size={16}/>All portfolios</Link><PageHeading eyebrow="YOUR PORTFOLIO" title={portfolio.name} action={isActive && <div className="flex gap-2"><button className="button button-secondary" onClick={() => setEdit(true)}><Pencil size={16}/>Edit</button><button className="button button-primary" onClick={() => setAdd(true)}><Plus size={16}/>Add transaction</button></div>}>{portfolio.description ?? 'Your holdings and transactions, with a clear record of every change.'}</PageHeading>{!isActive && <Notice tone="info">This portfolio is archived. You can review its records, but you cannot add or reverse transactions.</Notice>}{valuation.isDemo && <div className="data-banner"><Badge tone="demo">DEMO VALUATION</Badge><span>Portfolio prices use synthetic market fixtures. This is not a live valuation.</span></div>}{valuation.unpricedPositionCount > 0 && <Notice tone="info">{valuation.unpricedPositionCount} holding(s) have no available quote and are excluded from the displayed market value.</Notice>}{valuation.stalePositionCount > 0 && <Notice tone="info">{valuation.stalePositionCount} holding(s) use stale quotes. Check Markets for timestamps and source details.</Notice>}<div className="summary-grid grid grid-cols-1 gap-4 sm:grid-cols-3"><ValueCard label="Total portfolio value" value={money(valuation.totalValue, portfolio.baseCurrency)} hint={`As of ${dateTime(valuation.asOf)}`} primary/><ValueCard label="Holdings market value" value={money(valuation.totalMarketValue, portfolio.baseCurrency)} hint={`${holdings.length} holding${holdings.length === 1 ? '' : 's'} · ${portfolio.baseCurrency}`}/><ValueCard label="Cash balance" value={money(valuation.cashValue, portfolio.baseCurrency)} hint="From your recorded transactions"/></div><div className="portfolio-detail-grid"><Panel title="Holdings" subtitle="Quantities and costs from your transaction ledger" action={<Badge>{holdings.length} ASSETS</Badge>}>{holdings.length ? <div className="table-scroll"><table><thead><tr><th>Asset</th><th className="numeric">Quantity</th><th className="numeric">Avg. cost</th><th className="numeric">Price</th><th className="numeric">Value</th></tr></thead><tbody>{holdings.map(holding => { const position = valuation.positions.find(item => item.assetId === holding.assetId); return <tr key={holding.assetId}><td><Link className="table-asset" to={`/markets/${holding.assetId}`}><strong>{holding.symbol}</strong><small>{holding.name}</small></Link></td><td className="numeric">{quantity(holding.quantity)}</td><td className="numeric">{money(holding.averageCost, holding.costCurrency)}</td><td className="numeric">{money(position?.price, portfolio.baseCurrency)}<span className="table-subtext">{position?.source ?? 'No source available'}</span><span className="table-subtext">{marketDate(position?.asOf)} | {position?.price ? position.isStale ? 'Stale quote' : 'Cached daily quote' : 'Unpriced'}</span></td><td className="numeric strong">{money(position?.marketValue, portfolio.baseCurrency)}</td></tr>; })}</tbody></table></div> : <Empty icon={<Layers3 size={27}/>} title="No holdings yet">Record a buy transaction to add your first holding. Cash movements are recorded separately.</Empty>}</Panel><Panel title="Allocation" subtitle="By available market value"><AllocationChart valuation={valuation}/></Panel></div><Panel title="Transaction history" subtitle="An immutable record of your portfolio activity" action={isActive && <button className="button button-small button-secondary" onClick={() => setAdd(true)}><Plus size={15}/>Add transaction</button>}>{transactions.length ? <div className="table-scroll"><table><thead><tr><th>Type</th><th>Asset / note</th><th className="numeric">Quantity</th><th className="numeric">Price</th><th className="numeric">Amount</th><th className="numeric">Fees</th><th>Date</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{transactions.map(transaction => <tr key={transaction.id} className={transaction.reversed ? 'reversed-row' : ''}><td><span className="transaction-type">{transaction.type === 'BUY' || transaction.type === 'DEPOSIT' ? <ArrowDownLeft size={14}/> : <ArrowUpRight size={14}/>}<Badge tone={transaction.reversed ? 'neutral' : 'green'}>{transaction.type}</Badge></span>{transaction.reversed && <span className="table-subtext">Reversed</span>}</td><td><strong>{transaction.symbol ?? 'Cash'}</strong>{transaction.notes && <span className="table-subtext notes-text">{transaction.notes}</span>}</td><td className="numeric">{quantity(transaction.quantity)}</td><td className="numeric">{transaction.price === null ? '—' : money(transaction.price, transaction.currency)}</td><td className="numeric">{transaction.amount === null ? '—' : money(transaction.amount, transaction.currency)}</td><td className="numeric">{money(transaction.fees, transaction.currency)}</td><td>{dateTime(transaction.occurredAt)}</td><td>{isActive && !transaction.reversed && transaction.type !== 'REVERSAL' && <button className="icon-button" aria-label={`Reverse ${transaction.type.toLowerCase()} transaction`} title="Reverse transaction" onClick={() => { setReverse(transaction); setNotes(''); setMutationError(null); }}><RotateCcw size={16}/></button>}</td></tr>)}</tbody></table></div> : <Empty icon={<FileText size={27}/>} title="A clean slate" action={isActive && <button className="button button-secondary" onClick={() => setAdd(true)}><Plus size={16}/>Record your first transaction</button>}>Record buys and sells to track holdings, and record cash movements separately.</Empty>}</Panel>{history.length > 0 && <Panel title="Valuation snapshots" subtitle="Event-driven snapshots; not a continuous daily performance history"><div className="table-scroll"><table><thead><tr><th>Recorded</th><th className="numeric">Total value</th><th className="numeric">Holdings</th><th className="numeric">Cash</th></tr></thead><tbody>{history.slice(0, 10).map((snapshot, index) => <tr key={`${snapshot.asOf ?? snapshot.snapshotAt ?? snapshot.createdAt}-${index}`}><td>{dateTime(snapshot.asOf ?? snapshot.snapshotAt ?? snapshot.createdAt)}</td><td className="numeric strong">{money(snapshot.totalValue, portfolio.baseCurrency)}</td><td className="numeric">{money(snapshot.totalMarketValue, portfolio.baseCurrency)}</td><td className="numeric">{money(snapshot.cashValue, portfolio.baseCurrency)}</td></tr>)}</tbody></table></div></Panel>}{add && <TransactionForm portfolioId={portfolio.id} assets={assets} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); refresh(); }}/ >}{edit && <PortfolioForm portfolio={portfolio} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); refresh(); }}/ >}{reverse && <Modal title="Reverse transaction?" onClose={() => setReverse(null)}><p className="modal-copy">Create a reversing record for this <strong>{reverse.type.toLowerCase()}</strong> transaction. The original record stays in your history. Holdings and cash will be recalculated by the server.</p>{mutationError && <Notice>{mutationError}</Notice>}<Field label="Reason (optional)"><textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3} maxLength={1000} placeholder="Why are you reversing this record?"/></Field><div className="form-actions"><button className="button button-secondary" onClick={() => setReverse(null)}>Keep transaction</button><button className="button button-danger" disabled={pending} onClick={() => { void reverseTransaction(); }}>{pending ? 'Reversing…' : 'Reverse transaction'}</button></div></Modal>}</>;
}
function ValueCard({ label, value, hint, primary }: { label: string; value: string; hint: string; primary?: boolean }) { return <div className={`value-card ${primary ? 'value-card-primary' : ''}`}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>; }

function TransactionForm({ portfolioId, assets, onClose, onSaved }: { portfolioId: string; assets: Asset[]; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<Exclude<TransactionType, 'REVERSAL'>>('DEPOSIT');
  const [assetId, setAssetId] = useState('');
  const [units, setUnits] = useState('');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [fees, setFees] = useState('0');
  const [occurredAt, setOccurredAt] = useState(localDateTime());
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trade = type === 'BUY' || type === 'SELL';
  const chooseAsset = trade || type === 'DIVIDEND';
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    if (trade && !assetId) { setError('Select an asset for this transaction.'); return; }
    if (trade && (!validDecimal(units) || !validDecimal(price))) { setError('Enter positive quantity and price values with at most 8 decimal places.'); return; }
    if (!trade && !validDecimal(amount)) { setError('Enter a positive amount with at most 8 decimal places.'); return; }
    if (trade && !validDecimal(fees, true)) { setError('Fees must be zero or a positive value with at most 8 decimal places.'); return; }
    if (!occurredAt || Number.isNaN(new Date(occurredAt).getTime())) { setError('Enter a valid transaction date and time.'); return; }
    setPending(true);
    try {
      await api.post(`portfolios/${portfolioId}/transactions`, { type, ...(chooseAsset && assetId ? { assetId } : {}), ...(trade ? { quantity: units, price } : { amount }), currency: 'USD', fees: trade ? fees : '0', occurredAt: new Date(occurredAt).toISOString(), notes: notes.trim() || undefined, idempotencyKey });
      onSaved();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setPending(false); }
  }
  return <Modal title="Record a transaction" onClose={onClose}>
    <p className="modal-copy">Record what happened. Buy and sell entries track holdings; record cash movements separately. The server calculates balances from your entries.</p>
    {error && <Notice>{error}</Notice>}
    <form className="form-stack" onSubmit={event => { void submit(event); }}>
      <Field label="Transaction type"><select value={type} onChange={event => setType(event.target.value as Exclude<TransactionType, 'REVERSAL'>)}>
        <option value="DEPOSIT">Deposit — add cash</option><option value="BUY">Buy — add an investment</option><option value="SELL">Sell — reduce a holding</option><option value="DIVIDEND">Dividend — investment income</option><option value="FEE">Fee — record a cost</option><option value="WITHDRAWAL">Withdrawal — remove cash</option>
      </select></Field>
      {chooseAsset && <Field label={trade ? 'Asset' : 'Asset (optional)'}><select value={assetId} onChange={event => setAssetId(event.target.value)} required={trade}>
        <option value="">{trade ? 'Select an asset' : 'Cash dividend / no asset'}</option>{assets.filter(asset => asset.currency === 'USD').map(asset => <option value={asset.id} key={asset.id}>{asset.symbol} — {asset.name}</option>)}
      </select></Field>}
      {trade ? <div className="form-grid"><Field label="Quantity" hint="Fractional units are supported."><input value={units} onChange={event => setUnits(event.target.value)} inputMode="decimal" required placeholder="e.g. 2.5" maxLength={27}/></Field><Field label="Price per unit (USD)"><input value={price} onChange={event => setPrice(event.target.value)} inputMode="decimal" required placeholder="e.g. 125.00" maxLength={27}/></Field></div> : <Field label="Amount (USD)"><input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" required placeholder="e.g. 1000.00" maxLength={27}/></Field>}
      <div className="form-grid">
        {trade && <Field label="Fees (USD)"><input value={fees} onChange={event => setFees(event.target.value)} inputMode="decimal" required maxLength={27}/></Field>}
        <Field label="Date and time" hint="In your device’s local timezone."><input type="datetime-local" value={occurredAt} onChange={event => setOccurredAt(event.target.value)} required/></Field>
      </div>
      <Field label="Note (optional)"><textarea value={notes} onChange={event => setNotes(event.target.value)} rows={2} maxLength={1000} placeholder="Add context for this record"/></Field>
      <p className="small muted">Records are immutable. If you make a mistake, use a reversal to preserve the audit history.</p>
      <div className="form-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><SubmitButton pending={pending}>Record transaction</SubmitButton></div>
    </form>
  </Modal>;
}
