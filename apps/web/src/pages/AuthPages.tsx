import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, ChartNoAxesCombined, Layers3, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { Session } from '@ifms/contracts';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { validateEmail, validatePassword } from '../format';
import { Field, Notice, SubmitButton } from '../ui';

function GoogleMark() { return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.3 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.89 6.62-2.41l-3.23-2.51c-.89.6-2.03.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.83 1.52l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z"/></svg>; }

export function AuthPage({ mode }: { mode: 'login' | 'register' | 'forgot' | 'reset' }) {
  const { session, establish } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => mode === 'reset' ? new URLSearchParams(location.search).get('token') ?? '' : '');
  const [oauthFailed] = useState(() => new URLSearchParams(location.search).get('oauth') === 'failed');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  useEffect(() => {
    if (mode === 'reset' && location.search) navigate(location.pathname, { replace: true });
  }, [mode, location.pathname, location.search, navigate]);
  if (session.user && (mode === 'login' || mode === 'register')) return <Navigate to="/" replace/>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setSuccess(null);
    const validation = mode !== 'reset' ? validateEmail(email) : null;
    if (validation) { setError(validation); return; }
    if (['register', 'reset'].includes(mode)) {
      const passwordError = validatePassword(password);
      if (passwordError) { setError(passwordError); return; }
    }
    if (mode === 'register' && (displayName.trim().length < 2 || displayName.trim().length > 100)) { setError('Enter a display name between 2 and 100 characters.'); return; }
    if (mode === 'reset' && !token) { setError('This reset link is missing its token. Request a new password reset email.'); return; }
    setPending(true);
    try {
      if (mode === 'login' || mode === 'register') {
        const newSession = await api.post<Session>(`auth/${mode}`, { email: email.trim(), password, ...(mode === 'register' ? { displayName: displayName.trim() } : {}) });
        establish(newSession); navigate('/', { replace: true });
      } else if (mode === 'forgot') {
        await api.post('auth/password/forgot', { email: email.trim() });
        setSuccess('If this address belongs to an account, password reset instructions have been sent. Check your inbox.');
      } else {
        await api.post('auth/password/reset', { token, newPassword: password });
        establish({ user: null, csrfToken: null, googleConfigured: session.googleConfigured });
        setPassword(''); setSuccess('Your password has been reset. Sign in with your new password.');
      }
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setPending(false); }
  }

  const titles = { login: 'Welcome back.', register: 'Make room for your future.', forgot: 'Let’s get you back in.', reset: 'A fresh start.' };
  const subtitles = { login: 'Sign in to your investment workspace.', register: 'Create your account and start building your portfolio.', forgot: 'Enter your email to request password reset instructions.', reset: 'Choose a new password for your account.' };
  return <div className="auth-layout"><aside className="auth-story"><Link to="/" className="brand"><span className="brand-icon"><ChartNoAxesCombined size={23}/></span><span>IIPA<span className="brand-subtitle">Investment workspace</span></span></Link><div className="auth-story-content"><div className="eyebrow">A clearer view of your investments</div><h1>Your portfolio.<br/>Your perspective.</h1><p>Give every investment a home. Keep your holdings, transactions and market context together in one thoughtful workspace.</p><div className="auth-illustration" aria-hidden="true"><div className="illustration-orbit orbit-one"/><div className="illustration-orbit orbit-two"/><div className="illustration-card"><Layers3 size={34}/><span>A place to build</span><div className="illustration-bars"><i/><i/><i/><i/><i/><i/><i/><i/></div></div><div className="illustration-badge"><ArrowUpRight size={25}/></div></div><div className="auth-promises"><span><ShieldCheck size={17}/>Secure access</span><span><Layers3 size={17}/>Organized portfolios</span></div></div><small>IIPA · Intelligent Investment Portfolio Advisor</small></aside><main className="auth-main"><div className="auth-card"><div className="auth-mobile-brand"><ChartNoAxesCombined/> IIPA</div><p className="auth-project-name">Intelligent Investment Portfolio Advisor</p><div className="eyebrow">{mode === 'register' ? 'Get started' : 'Your workspace awaits'}</div><h2>{titles[mode]}</h2><p className="auth-description">{subtitles[mode]}</p>{oauthFailed && <Notice>Google sign-in could not be completed. Please try again or use your email and password.</Notice>}{error && <Notice>{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}
      {(mode === 'login' || mode === 'register') && <><button className="button google-button" type="button" disabled={!session.googleConfigured || pending} onClick={() => { window.location.assign('/api/v1/auth/google'); }}><GoogleMark/>Continue with Google</button>{!session.googleConfigured && <p className="configuration-hint">Google sign-in requires administrator configuration.</p>}<div className="divider"><span>or use your email</span></div></>}
      {!(mode === 'reset' && success) && <form onSubmit={event => { void submit(event); }} className="form-stack">{mode === 'register' && <Field label="Your name"><input autoComplete="name" value={displayName} onChange={event => setDisplayName(event.target.value)} required minLength={2} maxLength={100} placeholder="Alex Morgan"/></Field>}{mode !== 'reset' && <Field label="Email address"><input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} placeholder="you@example.com"/></Field>}{mode !== 'forgot' && <Field label={mode === 'reset' ? 'New password' : 'Password'} hint={mode === 'register' || mode === 'reset' ? 'Between 12 and 128 characters. A long, unique passphrase works well.' : undefined}><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} required minLength={mode === 'login' ? 1 : 12} maxLength={128} placeholder="Enter your password"/></Field>}{mode === 'login' && <Link className="forgot-link" to="/forgot-password">Forgot password?</Link>}<SubmitButton pending={pending}>{mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Send reset instructions' : 'Reset password'}<ArrowUpRight size={17}/></SubmitButton></form>}
      <p className="auth-switch">{mode === 'login' ? <>New here? <Link to="/register">Create an account</Link></> : mode === 'register' ? <>Already have an account? <Link to="/login">Sign in</Link></> : <Link to="/login">Back to sign in</Link>}</p><div className="auth-security"><LockKeyhole size={14}/>Your session stays securely on this device.</div></div></main></div>;
}
