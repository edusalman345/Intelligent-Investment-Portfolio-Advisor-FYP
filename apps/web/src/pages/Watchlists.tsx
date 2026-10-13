import { useCallback, useState, type FormEvent } from 'react';
import { ArrowUpRight, Compass, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Asset, Watchlist } from '@ifms/contracts';
import { api, errorMessage } from '../api';
import { useResource } from '../hooks';
import { Badge, Empty, Field, Loading, Modal, Notice, PageHeading, Panel, SubmitButton } from '../ui';

export function WatchlistsPage() {
  const load = useCallback(async () => { const [watchlists, assets] = await Promise.all([api.get<Watchlist[]>('watchlists'), api.get<Asset[]>('assets')]); return { watchlists, assets }; }, []);
  const { data, error, loading, refresh } = useResource(load);
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<Watchlist | null>(null);
  const [add, setAdd] = useState<Watchlist | null>(null);
  const [remove, setRemove] = useState<Watchlist | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function removeItem(listId: string, assetId: string) {
    setMutationError(null); setPending(true);
    try { await api.delete(`watchlists/${listId}/items/${assetId}`); refresh(); }
    catch (failure) { setMutationError(errorMessage(failure)); }
    finally { setPending(false); }
  }
  async function deleteList() {
    if (!remove) return;
    setMutationError(null); setPending(true);
    try { await api.delete(`watchlists/${remove.id}`); setRemove(null); refresh(); }
    catch (failure) { setMutationError(errorMessage(failure)); }
    finally { setPending(false); }
  }
  return <><PageHeading eyebrow="YOUR WATCHLISTS" title="Keep your interests close." action={<button className="button button-primary" onClick={() => setCreate(true)}><Plus size={17}/>New watchlist</button>}>Collect assets you want to follow, without adding them to your holdings.</PageHeading>{error && <Notice>{error}<button className="inline-button" onClick={refresh}>Retry</button></Notice>}{mutationError && !remove && <Notice>{mutationError}</Notice>}{loading && !data ? <Loading/> : data?.watchlists.length ? <div className="watchlist-grid">{data.watchlists.map(list => <Panel key={list.id} title={list.name} subtitle={`${list.items.length} asset${list.items.length === 1 ? '' : 's'}`} action={<div className="card-actions"><button className="icon-button" aria-label={`Rename ${list.name}`} onClick={() => setEdit(list)}><Pencil size={16}/></button><button className="icon-button" aria-label={`Delete ${list.name}`} onClick={() => { setRemove(list); setMutationError(null); }}><Trash2 size={16}/></button></div>}>{list.items.length ? <div className="watchlist-items">{list.items.map(item => <div className="watchlist-item" key={item.assetId}><span className="asset-symbol-mark">{item.symbol.slice(0, 1)}</span><Link to={`/markets/${item.assetId}`}><strong>{item.symbol}</strong><small>{item.name}</small></Link><Link className="icon-button" to={`/markets/${item.assetId}`} aria-label={`View ${item.symbol} market data`}><ArrowUpRight size={16}/></Link><button className="icon-button" disabled={pending} aria-label={`Remove ${item.symbol} from ${list.name}`} onClick={() => { void removeItem(list.id, item.assetId); }}><X size={16}/></button></div>)}</div> : <div className="watchlist-empty"><Compass size={24}/><p>Add the assets you’re curious about.</p></div>}<button className="watchlist-add" onClick={() => setAdd(list)}><Plus size={16}/>Add an asset</button></Panel>)}</div> : <Panel><Empty icon={<Compass size={30}/>} title="Follow what interests you" action={<button className="button button-primary" onClick={() => setCreate(true)}><Plus size={16}/>Create a watchlist</button>}>Build a short list of assets you want to keep an eye on. Your holdings stay separate.</Empty></Panel>}{(create || edit) && <WatchlistForm list={edit ?? undefined} onClose={() => { setCreate(false); setEdit(null); }} onSaved={() => { setCreate(false); setEdit(null); refresh(); }}/ >}{add && data && <AddAssetForm list={add} assets={data.assets} onClose={() => setAdd(null)} onSaved={() => { setAdd(null); refresh(); }}/ >}{remove && <Modal title="Delete watchlist?" onClose={() => setRemove(null)}><p className="modal-copy">Delete <strong>{remove.name}</strong> and its saved items? Your portfolios and market records are unaffected.</p>{mutationError && <Notice>{mutationError}</Notice>}<div className="form-actions"><button className="button button-secondary" onClick={() => setRemove(null)}>Keep watchlist</button><button className="button button-danger" disabled={pending} onClick={() => { void deleteList(); }}>{pending ? 'Deleting…' : 'Delete watchlist'}</button></div></Modal>}</>;
}
function WatchlistForm({ list, onClose, onSaved }: { list?: Watchlist; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(list?.name ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    if (!name.trim() || name.trim().length > 100) { setError('Enter a name between 1 and 100 characters.'); return; }
    setPending(true);
    try { if (list) await api.patch(`watchlists/${list.id}`, { name: name.trim() }); else await api.post('watchlists', { name: name.trim() }); onSaved(); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setPending(false); }
  }
  return <Modal title={list ? 'Rename watchlist' : 'Create a watchlist'} onClose={onClose}>{error && <Notice>{error}</Notice>}<form className="form-stack" onSubmit={event => { void submit(event); }}><Field label="Watchlist name"><input value={name} onChange={event => setName(event.target.value)} required maxLength={100} autoFocus placeholder="Companies to follow"/></Field><div className="form-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><SubmitButton pending={pending}>{list ? 'Save name' : 'Create watchlist'}</SubmitButton></div></form></Modal>;
}
function AddAssetForm({ list, assets, onClose, onSaved }: { list: Watchlist; assets: Asset[]; onClose: () => void; onSaved: () => void }) {
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const available = assets.filter(asset => !list.items.some(item => item.assetId === asset.id) && `${asset.symbol} ${asset.name}`.toLowerCase().includes(search.toLowerCase()));
  async function add(assetId: string) {
    setError(null); setPending(assetId);
    try { await api.post(`watchlists/${list.id}/items`, { assetId }); onSaved(); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setPending(null); }
  }
  return <Modal title={`Add to ${list.name}`} onClose={onClose}>{error && <Notice>{error}</Notice>}<Field label="Find an asset"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search symbol or name" maxLength={100} autoFocus/></Field><div className="add-asset-list">{available.length ? available.map(asset => <div className="add-asset-item" key={asset.id}><span className="asset-symbol-mark">{asset.symbol.slice(0, 1)}</span><div><strong>{asset.symbol}</strong><small>{asset.name}</small></div><Badge>{asset.currency}</Badge><button className="button button-small button-secondary" disabled={pending !== null} onClick={() => { void add(asset.id); }}>{pending === asset.id ? 'Adding…' : <><Plus size={14}/>Add</>}</button></div>) : <p className="muted">No matching assets remain. Assets already in this watchlist are excluded.</p>}</div></Modal>;
}
