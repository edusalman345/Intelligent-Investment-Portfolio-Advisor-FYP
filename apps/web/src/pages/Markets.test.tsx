import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter,Route,Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '@ifms/contracts';
import { MarketsPage } from './Markets';
import { api } from '../api';

const auth = vi.hoisted(() => ({ session: { user: { role: 'ADMIN' as 'ADMIN' | 'INVESTOR' } } }));
vi.mock('../auth', () => ({ useAuth: () => auth }));
vi.mock('../api', () => ({ api: { get: vi.fn(), post: vi.fn() }, errorMessage: (error: Error) => error.message }));
vi.mock('../charts',()=>({PriceChart:({bars}:{bars:{close:string}[]})=><div>Chart close: {bars[0]?.close}</div>}));
const assets: Asset[] = [
  { id: '10000000-0000-4000-8000-000000000001', symbol: 'AAPL', name: 'Apple Inc.', assetType: 'STOCK', exchange: 'NASDAQ', currency: 'USD', sector: 'Technology' },
  { id: '10000000-0000-4000-8000-000000000002', symbol: 'MSFT', name: 'Microsoft Corporation', assetType: 'STOCK', exchange: 'NASDAQ', currency: 'USD', sector: 'Technology' },
  { id: '10000000-0000-4000-8000-000000000003', symbol: 'NVDA', name: 'NVIDIA Corporation', assetType: 'STOCK', exchange: 'NASDAQ', currency: 'USD', sector: 'Technology' },
];
beforeEach(() => {
  auth.session.user.role = 'ADMIN';
  vi.mocked(api.get).mockImplementation(async <T,>(path: string): Promise<T> => {
    const value = path === 'assets' ? assets : path === 'market/status' ? { provider: 'Synthetic demo fixtures', configured: true, isDemo: true } : [];
    return value as T;
  });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('market administration', () => {
  it('reloads visible quote and history after refreshing the selected asset without navigation',async()=> {
    let refreshed=false;
    vi.mocked(api.get).mockImplementation(async<T,>(path:string):Promise<T>=> {
      const value=path==='assets' ? assets : path==='market/status' ? {provider:'fixture',configured:true,isDemo:true}
        : path===`assets/${assets[1]!.id}` ? assets[1]
        : path.endsWith('/quote') ? {price:refreshed?'130':'100',currency:'USD',asOf:'2026-01-01T00:00:00Z',ingestedAt:refreshed?'2026-01-02T00:00:00Z':'2026-01-01T00:00:00Z',volume:null,isDemo:true,source:'fixture'}
        : path.includes('/history?') ? [{time:'2026-01-01T00:00:00Z',open:'100',high:'130',low:'99',close:refreshed?'130':'100',volume:null,isDemo:true,source:'fixture'}] : [];
      return value as T;
    });
    vi.mocked(api.post).mockImplementation(async()=>{refreshed=true;return {id:'run',status:'COMPLETED',recordsWritten:2,issueCount:0};});
    render(<MemoryRouter initialEntries={[`/markets/${assets[1]!.id}`]}><Routes><Route path="/markets/:id" element={<MarketsPage/>}/></Routes></MemoryRouter>);
    expect(await screen.findByText('Chart close: 100')).toBeVisible();
    fireEvent.click(await screen.findByRole('button',{name:'Refresh data'}));
    expect(await screen.findByText('Chart close: 130')).toBeVisible();
    expect(document.querySelector('.quote-price')?.textContent).toBe('$130.00');
    const expected=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date('2026-01-02T00:00:00Z'));
    expect(document.querySelector('.quote-facts')?.textContent).toContain(expected);
  });
  it('refreshes a selected non-first asset using its UUID', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ id: 'test-run', status: 'COMPLETED', recordsWritten: 1, issueCount: 0 });
    render(<MemoryRouter><MarketsPage/></MemoryRouter>);
    await screen.findByRole('option', { name: /MSFT/ });
    fireEvent.change(screen.getByLabelText('Asset to refresh'), { target: { value: assets[1]!.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('market/refresh', { assetId: assets[1]!.id }));
    expect(await screen.findByText(/Refresh for MSFT completed/)).toBeVisible();
  });
  it('reports an HTTP-successful failed ingestion run as a quality failure and preserves cache messaging', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ id: 'test-run', status: 'FAILED', recordsWritten: 2, issueCount: 3 });
    render(<MemoryRouter><MarketsPage/></MemoryRouter>);
    await screen.findByRole('option', { name: /NVDA/ });
    fireEvent.change(screen.getByLabelText('Asset to refresh'), { target: { value: assets[2]!.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Refresh for NVDA failed data quality checks.');
    expect(alert).toHaveTextContent('2 valid record(s) were saved.');
    expect(alert).toHaveTextContent('Existing cached data remains available');
    expect(screen.queryByText(/Refresh for NVDA completed/)).not.toBeInTheDocument();
  });
  it('does not expose administration controls or request diagnostics for investors', async () => {
    auth.session.user.role = 'INVESTOR';
    render(<MemoryRouter><MarketsPage/></MemoryRouter>);
    await screen.findByText('Apple Inc.');
    expect(screen.queryByLabelText('Asset to refresh')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh data' })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('market/runs');
  });
});
