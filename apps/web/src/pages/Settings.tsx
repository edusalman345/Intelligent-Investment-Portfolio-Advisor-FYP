import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Link2, LockKeyhole, Monitor, ShieldCheck, UserRound } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AuthUser } from '@ifms/contracts';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { dateTime, validatePassword } from '../format';
import { useResource } from '../hooks';
import { Badge, Field, Loading, Modal, Notice, PageHeading, Panel, SubmitButton } from '../ui';

interface DeviceSession { id: string; createdAt: string; expiresAt: string; lastSeenAt: string | null; userAgent: string | null; current: boolean }
export function SettingsPage() {
  const { session, refresh: refreshAuth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [googleResult] = useState(() => new URLSearchParams(location.search).get('google'));
  const load = useCallback(async () => { const [profile, sessions] = await Promise.all([api.get<AuthUser & { baseCurrency?: string }>('me'), api.get<DeviceSession[]>('auth/sessions')]); return { profile, sessions }; }, []);
  const { data, loading, error, refresh } = useResource(load);
  const [revoke, setRevoke] = useState<DeviceSession | null>(null);
  const [pending, setPending] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [link, setLink] = useState(false);
  useEffect(() => { if (location.search.includes('google=')) navigate(location.pathname, { replace: true }); }, [location.pathname, location.search, navigate]);
  async function revokeSession() {
    if (!revoke) return;
    setPending(true); setMutationError(null);
    try { await api.delete(`auth/sessions/${revoke.id}`); if (revoke.current) await refreshAuth(); setRevoke(null); refresh(); }
    catch (failure) { setMutationError(errorMessage(failure)); }
    finally { setPending(false); }
  }
  async function saved() { refresh(); await refreshAuth(); }
  return <><PageHeading eyebrow="YOUR ACCOUNT" title="Your space. Your settings.">Manage your profile, sign-in options and active sessions.</PageHeading>{googleResult === 'linked' && <Notice tone="success">Your Google account is now securely linked.</Notice>}{googleResult === 'failed' && <Notice>Google linking could not be completed. Try again after signing in, or use your email and password.</Notice>}{error && <Notice>{error}<button className="inline-button" onClick={refresh}>Retry</button></Notice>}{loading && !data ? <Loading label="Loading account settings…"/> : data && <div className="settings-grid"><div className="settings-main"><Panel title="Profile" subtitle="How your account appears in this workspace" action={<UserRound size={20} className="muted"/>}><ProfileForm profile={data.profile} onSaved={saved}/></Panel><Panel title={data.profile.hasPassword ? 'Change password' : 'Set a password'} subtitle="A long, unique password helps keep your account secure" action={<LockKeyhole size={20} className="muted"/>}><PasswordForm hasPassword={data.profile.hasPassword} onSaved={saved}/></Panel><Panel title="Active sessions" subtitle="Review and revoke access from your devices" action={<Monitor size={20} className="muted"/>}><div className="session-list">{data.sessions.map(device => <div className="device-session" key={device.id}><div className="device-icon"><Monitor size={19}/></div><div><strong>{device.current ? 'This device' : 'Signed-in device'}{device.current && <Badge tone="green">CURRENT</Badge>}</strong><p>{device.userAgent ?? 'Device details unavailable'}</p><small>Last active {dateTime(device.lastSeenAt ?? device.createdAt)} · Expires {dateTime(device.expiresAt)}</small></div><button className="button button-small button-secondary" onClick={() => { setRevoke(device); setMutationError(null); }}>Revoke</button></div>)}</div></Panel></div><div className="settings-aside"><Panel title="Sign-in methods" subtitle="Choose how you access your workspace"><div className="sign-in-method"><span className="method-icon"><LockKeyhole size={19}/></span><div><strong>Email & password</strong><span>{data.profile.hasPassword ? 'Configured' : 'Google account — no password set'}</span></div>{data.profile.hasPassword && <Check size={19} className="green"/>}</div><div className="sign-in-method"><span className="method-icon google-letter">G</span><div><strong>Google</strong><span>{data.profile.googleLinked ? 'Account linked' : 'Not linked'}</span></div>{data.profile.googleLinked && <Check size={19} className="green"/>}</div>{!data.profile.googleLinked && <><button className="button button-secondary full-width" disabled={!session.googleConfigured} onClick={() => setLink(true)}><Link2 size={16}/>Link Google account</button>{!session.googleConfigured && <p className="configuration-hint">Google login is waiting for administrator configuration.</p>}</>}</Panel><div className="security-card"><ShieldCheck size={25}/><h3>Keep your account yours.</h3><p>Use a unique password and revoke sessions you no longer recognize. Linking Google always requires confirmation from your authenticated account.</p><span>Signed in as</span><strong>{data.profile.email}</strong></div></div></div>}{link && <GoogleLinkForm hasPassword={!!data?.profile.hasPassword} onClose={() => setLink(false)}/ >}{revoke && <Modal title="Revoke session?" onClose={() => setRevoke(null)}><p className="modal-copy">{revoke.current ? 'This will sign you out of this device. You can sign in again to return to your workspace.' : 'This device will need to sign in again to access your account.'}</p>{mutationError && <Notice>{mutationError}</Notice>}<div className="form-actions"><button className="button button-secondary" onClick={() => setRevoke(null)}>Keep session</button><button className="button button-danger" disabled={pending} onClick={() => { void revokeSession(); }}>{pending ? 'Revoking…' : 'Revoke session'}</button></div></Modal>}</>;
}

function ProfileForm({ profile, onSaved }: { profile: AuthUser; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(profile.displayName ?? '');
  const [timezone, setTimezone] = useState(profile.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null); setSuccess(false);
    if (name.trim().length < 2 || name.trim().length > 100) { setError('Use a display name between 2 and 100 characters.'); return; }
    try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); }
    catch { setError('Enter a valid timezone, such as America/Los_Angeles or UTC.'); return; }
    setPending(true);
    try { await api.patch('me', { displayName: name.trim(), timezone, baseCurrency: 'USD' }); await onSaved(); setSuccess(true); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setPending(false); }
  }
  return <form className="form-stack panel-form" onSubmit={event => { void submit(event); }}>{error && <Notice>{error}</Notice>}{success && <Notice tone="success">Your profile has been updated.</Notice>}<div className="form-grid"><Field label="Display name"><input value={name} onChange={event => setName(event.target.value)} autoComplete="name" required minLength={2} maxLength={100}/></Field><Field label="Email address"><input value={profile.email} type="email" disabled/></Field></div><div className="form-grid"><Field label="Timezone" hint="Use an IANA timezone name."><input list="timezones" value={timezone} onChange={event => setTimezone(event.target.value)} required maxLength={100}/><datalist id="timezones">{['UTC', 'America/Los_Angeles', 'America/New_York', 'Europe/London', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Singapore'].map(zone => <option key={zone} value={zone}/>)}</datalist></Field><Field label="Base currency"><input value="US Dollar (USD)" disabled/></Field></div><div className="form-actions"><SubmitButton pending={pending}>Save profile</SubmitButton></div></form>;
}
function PasswordForm({ hasPassword, onSaved }: { hasPassword: boolean; onSaved: () => Promise<void> }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null); setSuccess(false);
    const validation = validatePassword(newPassword);
    if (validation) { setError(validation); return; }
    if (newPassword !== confirmation) { setError('Your new passwords do not match.'); return; }
    setPending(true);
    try { await api.post('auth/password/change', { ...(hasPassword ? { currentPassword } : {}), newPassword }); setCurrentPassword(''); setNewPassword(''); setConfirmation(''); await onSaved(); setSuccess(true); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setPending(false); }
  }
  return <form className="form-stack panel-form" onSubmit={event => { void submit(event); }}>{error && <Notice>{error}</Notice>}{success && <Notice tone="success">Your password has been updated.</Notice>}{!hasPassword && <p className="small muted">To set your first password, sign in with Google within the last five minutes. If prompted, sign out and sign in again.</p>}{hasPassword && <Field label="Current password"><input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required maxLength={128}/></Field>}<div className="form-grid"><Field label="New password" hint="Between 12 and 128 characters."><input type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} required minLength={12} maxLength={128}/></Field><Field label="Confirm new password"><input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required minLength={12} maxLength={128}/></Field></div><div className="form-actions"><SubmitButton pending={pending}>{hasPassword ? 'Update password' : 'Set password'}</SubmitButton></div></form>;
}
function GoogleLinkForm({ hasPassword, onClose }: { hasPassword: boolean; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null); setPending(true);
    try { const result = await api.post<{ url: string }>('auth/google/link', { ...(hasPassword ? { currentPassword: password } : {}) }); const target = new URL(result.url, window.location.origin); if (target.protocol !== 'https:' || target.hostname !== 'accounts.google.com') throw new Error('The server returned an unexpected Google authorization URL.'); window.location.assign(target.toString()); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setPending(false); }
  }
  return <Modal title="Link your Google account" onClose={onClose}><p className="modal-copy">Confirm your account, then choose the Google identity you want to link. Accounts are never linked automatically by matching email addresses.</p>{error && <Notice>{error}</Notice>}<form className="form-stack" onSubmit={event => { void submit(event); }}>{hasPassword && <Field label="Current password"><input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required maxLength={128}/></Field>}<div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><SubmitButton pending={pending}>Continue to Google</SubmitButton></div></form></Modal>;
}
