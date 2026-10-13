import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@ifms/contracts';
import { api, errorMessage, setCsrfToken, setExpiredSessionHandler } from './api';

const emptySession: Session = { user: null, csrfToken: null, googleConfigured: false };
interface AuthState { session: Session; loading: boolean; error: string | null; refresh: () => Promise<void>; establish: (session: Session) => void; logout: () => Promise<void> }
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(emptySession);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const establish = useCallback((value: Session) => { setSession(value); setCsrfToken(value.csrfToken); }, []);
  const refresh = useCallback(async () => {
    setError(null);
    try { establish(await api.get<Session>('auth/session')); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setLoading(false); }
  }, [establish]);
  useEffect(() => {
    setExpiredSessionHandler(() => { establish(emptySession); void refresh(); });
    void refresh();
    return () => setExpiredSessionHandler(null);
  }, [establish, refresh]);
  const logout = useCallback(async () => { await api.post('auth/logout'); establish({ ...emptySession, googleConfigured: session.googleConfigured }); await refresh(); }, [establish, refresh, session.googleConfigured]);
  return <AuthContext.Provider value={{ session, loading, error, refresh, establish, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('Authentication provider is required.');
  return auth;
}
