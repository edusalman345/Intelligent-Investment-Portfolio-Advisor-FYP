import { useState } from 'react';
import { ArrowUpRight, ChartNoAxesCombined, CircleHelp, Compass, LayoutDashboard, LogOut, Menu, Plus, Settings2, Wallet, X } from 'lucide-react';
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { errorMessage } from './api';
import { AuthPage } from './pages/AuthPages';
import { Dashboard } from './pages/Dashboard';
import { PortfoliosPage, PortfolioDetail } from './pages/Portfolios';
import { MarketsPage } from './pages/Markets';
import { WatchlistsPage } from './pages/Watchlists';
import { SettingsPage } from './pages/Settings';
import { Loading, Notice } from './ui';

function Protected() {
  const { session, loading, error, refresh } = useAuth();
  if (loading) return <Loading/>;
  if (error) return <div className="connection-error"><Notice>{error}</Notice><button className="button button-primary" onClick={() => { void refresh(); }}>Try again</button></div>;
  if (!session.user) return <Navigate to="/login" replace/>;
  return <Workspace/>;
}
function Workspace() {
  const { session, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const user = session.user!;
  const initial = (user.displayName ?? user.email).slice(0, 1).toUpperCase();
  const nav = [{ to: '/', label: 'Overview', icon: LayoutDashboard }, { to: '/portfolios', label: 'Portfolios', icon: Wallet }, { to: '/markets', label: 'Markets', icon: ChartNoAxesCombined }, { to: '/watchlists', label: 'Watchlists', icon: Compass }];
  return <div className="workspace"><button className="mobile-nav-toggle icon-button" aria-label="Open navigation" onClick={() => setNavOpen(true)}><Menu/></button>{navOpen && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setNavOpen(false)}/>}
    <aside className={`sidebar ${navOpen ? 'sidebar-open' : ''}`}><Link to="/" className="brand" onClick={() => setNavOpen(false)}><span className="brand-icon"><ChartNoAxesCombined size={23}/></span><span>IFMS<span className="brand-subtitle">Investment workspace</span></span></Link><button className="sidebar-close icon-button" aria-label="Close navigation" onClick={() => setNavOpen(false)}><X/></button><div className="nav-caption">WORKSPACE</div><nav aria-label="Main navigation">{nav.map(item => <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={() => setNavOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><item.icon size={19}/>{item.label}</NavLink>)}</nav><Link to="/portfolios?create=1" className="sidebar-create" onClick={() => setNavOpen(false)}><Plus size={17}/>New portfolio</Link><div className="sidebar-note"><div className="note-icon"><CircleHelp size={18}/></div><h3>A thoughtful start</h3><p>Record your investments and explore the available market data.</p><Link to="/markets">Explore markets<ArrowUpRight size={15}/></Link></div><div className="sidebar-bottom"><NavLink to="/settings" className="nav-link" onClick={() => setNavOpen(false)}><Settings2 size={19}/>Account & security</NavLink><div className="sidebar-user"><span className="avatar">{initial}</span><div><strong>{user.displayName ?? 'Investor'}</strong><span>{user.role === 'ADMIN' ? 'Administrator' : 'Personal workspace'}</span></div><button className="icon-button" title="Sign out" aria-label="Sign out" disabled={pending} onClick={() => { setPending(true); void logout().catch(failure => setError(errorMessage(failure))).finally(() => setPending(false)); }}><LogOut size={17}/></button></div></div></aside>
    <div className="workspace-main"><header className="workspace-header"><div className="header-context"><span className="status-dot"/>Personal workspace<span className="header-separator">/</span><span className="header-subtitle">Invest with clarity</span></div><Link to="/settings" className="header-user"><span>{user.displayName ?? 'Your account'}</span><span className="avatar avatar-small">{initial}</span></Link></header><main className="content">{error && <Notice>{error}</Notice>}<Outlet/></main><footer className="workspace-footer"><span>IFMS · Investment workspace</span><span>Portfolio records & market context</span></footer></div></div>;
}
function PublicAuth({ mode }: { mode: 'login' | 'register' | 'forgot' | 'reset' }) {
  const { loading, error, refresh } = useAuth();
  if (loading) return <Loading/>;
  if (error) return <div className="connection-error"><Notice>{error}</Notice><button className="button button-primary" onClick={() => { void refresh(); }}>Reconnect</button></div>;
  return <AuthPage key={mode} mode={mode}/>;
}

export function App() { return <BrowserRouter><AuthProvider><Routes><Route path="/login" element={<PublicAuth mode="login"/>}/><Route path="/register" element={<PublicAuth mode="register"/>}/><Route path="/forgot-password" element={<PublicAuth mode="forgot"/>}/><Route path="/reset-password" element={<PublicAuth mode="reset"/>}/><Route path="/auth/complete" element={<Navigate to="/" replace/>}/><Route element={<Protected/>}><Route index element={<Dashboard/>}/><Route path="/portfolios" element={<PortfoliosPage/>}/><Route path="/portfolios/:id" element={<PortfolioDetail/>}/><Route path="/markets" element={<MarketsPage/>}/><Route path="/markets/:id" element={<MarketsPage/>}/><Route path="/watchlists" element={<WatchlistsPage/>}/><Route path="/settings" element={<SettingsPage/>}/><Route path="/profile" element={<SettingsPage/>}/></Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes></AuthProvider></BrowserRouter>; }
