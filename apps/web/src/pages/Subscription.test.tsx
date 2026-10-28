import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SubscriptionPage } from './Subscription';
import { App } from '../App';
import { api } from '../api';

const auth = vi.hoisted(() => ({ session: { user: { displayName: 'Test investor', email: 'subscription@example.test', role: 'INVESTOR' } as { displayName: string; email: string; role: string } | null }, loading: false, error: null, refresh: vi.fn(), logout: vi.fn() }));
vi.mock('../auth', () => ({ AuthProvider: ({ children }: { children: ReactNode }) => children, useAuth: () => auth }));
vi.mock('../api', () => ({ api: { get: vi.fn() }, errorMessage: (error: Error) => error.message }));
vi.mock('./AuthPages', () => ({ AuthPage: () => <h1>Sign in</h1> }));
const plans = [
  { id: 'free-id', code: 'free', name: 'Free', description: 'Your current investment workspace.', priceMonthly: '0.00', currency: 'USD', status: 'active', displayOrder: 0 },
  { id: 'pro-id', code: 'pro', name: 'Pro', description: 'Future capabilities, not available yet.', priceMonthly: null, currency: 'USD', status: 'coming_soon', displayOrder: 1 },
];
beforeEach(() => {
  auth.session.user = { displayName: 'Test investor', email: 'subscription@example.test', role: 'INVESTOR' };
  vi.mocked(api.get).mockResolvedValue(plans);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); window.history.replaceState({}, '', '/'); });

it('shows Free as the current $0 plan and lists existing features', async () => {
  render(<SubscriptionPage/>);
  const free = await screen.findByRole('region', { name: 'Free' });
  expect(within(free).getByText('$0')).toBeVisible();
  expect(within(free).getByText('/month')).toBeVisible();
  expect(within(free).getByText('Current Plan')).toBeVisible();
  for (const feature of ['Portfolio management', 'Stock search', 'Historical market data', 'Watchlist management']) expect(within(free).getByText(feature)).toBeVisible();
  expect(api.get).toHaveBeenCalledWith('subscription-plans');
});

it('marks Pro unavailable with no price, checkout, or purchase action', async () => {
  render(<SubscriptionPage/>);
  const pro = await screen.findByRole('region', { name: 'Pro' });
  expect(within(pro).getAllByText('Coming Soon')).toHaveLength(2);
  expect(within(pro).getByText('No price announced')).toBeVisible();
  expect(within(pro).getByText('Not available yet. Pro cannot be purchased.')).toBeVisible();
  expect(within(pro).queryByText(/\$/)).not.toBeInTheDocument();
  expect(within(pro).queryByRole('button')).not.toBeInTheDocument();
  expect(within(pro).queryByRole('link')).not.toBeInTheDocument();
  for (const feature of ['Planned AI insights', 'Portfolio risk analysis', 'Forecasting', 'Intelligent alerts']) expect(within(pro).getByText(feature)).toBeVisible();
  expect(screen.getByText(/All users retain existing IIPA functionality/)).toBeVisible();
});

it('reports catalog failure and supports retry without inventing a plan price', async () => {
  vi.mocked(api.get).mockRejectedValueOnce(new Error('Catalog unavailable.'));
  render(<SubscriptionPage/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Catalog unavailable.');
  expect(screen.queryByText('$0')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('region', { name: 'Free' })).toBeVisible();
});

it('loads the authenticated route and includes the dashboard navigation link', async () => {
  window.history.replaceState({}, '', '/subscription');
  render(<App/>);
  expect(await screen.findByRole('heading', { name: 'Subscription Plans', level: 1 })).toBeVisible();
  expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Subscription Plans' })).toHaveAttribute('href', '/subscription');
  expect(await screen.findByRole('region', { name: 'Free' })).toBeVisible();
});

it('redirects unauthenticated users to login without fetching the catalog', async () => {
  auth.session.user = null;
  window.history.replaceState({}, '', '/subscription');
  render(<App/>);
  await waitFor(() => expect(window.location.pathname).toBe('/login'));
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  expect(api.get).not.toHaveBeenCalled();
});
