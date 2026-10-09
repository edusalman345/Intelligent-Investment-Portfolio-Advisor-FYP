import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { Session } from '@ifms/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthPage } from './AuthPages';
import { api } from '../api';

const auth = vi.hoisted(() => ({ session: { user: null, csrfToken: 'csrf-test', googleConfigured: false } as Session, establish: vi.fn() }));
vi.mock('../auth', () => ({ useAuth: () => auth }));
vi.mock('../api', () => ({ api: { post: vi.fn() }, errorMessage: (error: Error) => error.message }));
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.session = { user: null, csrfToken: 'csrf-test', googleConfigured: false }; });

function LocationProbe() { const location = useLocation(); return <output data-testid="visible-location">{location.pathname}{location.search}</output>; }

describe('authentication forms', () => {
  it('makes unavailable Google configuration clear without disabling email login', () => {
    render(<MemoryRouter><AuthPage mode="login"/></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    expect(screen.getByText('Google sign-in requires administrator configuration.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });
  it('validates a short password before sending a registration request', () => {
    render(<MemoryRouter><AuthPage mode="register"/></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Alex Morgan' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'alex@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'short' } });
    fireEvent.submit(screen.getByRole('button', { name: /Create account/ }).closest('form')!);
    expect(screen.getByRole('alert')).toHaveTextContent('between 12 and 128'); expect(api.post).not.toHaveBeenCalled();
  });
  it('renders a safe backend error when normal login fails', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Invalid email or password.'));
    render(<MemoryRouter><AuthPage mode="login"/></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'alex@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long sample password' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.'));
    expect(auth.establish).not.toHaveBeenCalled();
  });
  it('removes reset tokens from the visible URL and sends them only in the reset body', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ reset: true });
    render(<MemoryRouter initialEntries={['/reset-password?token=test-reset-token']}><AuthPage mode="reset"/><LocationProbe/></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('visible-location')).toHaveTextContent(/^\/reset-password$/));
    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: 'a long unique passphrase' } });
    fireEvent.submit(screen.getByRole('button', { name: /Reset password/ }).closest('form')!);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('auth/password/reset', { token: 'test-reset-token', newPassword: 'a long unique passphrase' }));
    expect(screen.getByText(/Your password has been reset/)).toBeVisible();
  });
  it('clears a signed-in client session and its CSRF token after successful password reset', async () => {
    auth.session = { user: { id: 'test-user', email: 'investor@example.test', displayName: 'Investor', timezone: 'UTC', role: 'INVESTOR', status: 'ACTIVE', hasPassword: true, googleLinked: false },
      csrfToken: 'old-session-csrf', googleConfigured: true };
    vi.mocked(api.post).mockResolvedValueOnce({ reset: true });
    render(<MemoryRouter initialEntries={['/reset-password?token=test-reset-token']}><AuthPage mode="reset"/></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: 'a long unique passphrase' } });
    fireEvent.submit(screen.getByRole('button', { name: /Reset password/ }).closest('form')!);
    await waitFor(() => expect(auth.establish).toHaveBeenCalledWith({ user: null, csrfToken: null, googleConfigured: true }));
    expect(screen.getByText(/Your password has been reset/)).toBeVisible();
  });
});
