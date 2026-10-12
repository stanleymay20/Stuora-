import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../backend/supabase';
import type { Database } from '../backend/database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];
type AuthState = {
  session: Session | null;
  initializing: boolean;
  profile: Profile | null;
  profileLoading: boolean;
  error: string;
  recoveryMode: boolean;
  reloadProfile: () => void;
  requestPasswordReset: (email: string) => Promise<string | null>;
  completePasswordRecovery: (password: string) => Promise<string | null>;
  cancelPasswordRecovery: () => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);

function paramsFromUrl(url: string) {
  const [beforeHash, hash = ''] = url.split('#', 2);
  const query = beforeHash.includes('?') ? beforeHash.slice(beforeHash.indexOf('?') + 1) : '';
  const search = new URLSearchParams(query);
  const fragment = new URLSearchParams(hash);
  const get = (key: string) => fragment.get(key) ?? search.get(key);
  return {
    accessToken: get('access_token'),
    refreshToken: get('refresh_token'),
    type: get('type'),
    recoveryMarker: get('recovery') === '1' || beforeHash.includes('/auth/recovery'),
    errorDescription: get('error_description') ?? get('error'),
  };
}

function passwordResetRedirect() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/?recovery=1`;
  return 'stuora://auth/recovery';
}

function clearRecoveryLocation() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const next = new URL(window.location.href);
  next.hash = '';
  next.searchParams.delete('recovery');
  window.history.replaceState({}, '', `${next.pathname}${next.search}${next.hash}` || '/');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadedUser, setLoadedUser] = useState<string | undefined>(undefined);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let authEvent = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      authEvent = true;
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      setInitializing(false);
    });

    const handleAuthUrl = async (url: string | null) => {
      if (!active || !url) return;
      const parsed = paramsFromUrl(url);
      if (parsed.errorDescription) {
        setError('This authentication link is invalid or expired. Request a new link.');
        if (parsed.recoveryMarker || parsed.type === 'recovery') setRecoveryMode(true);
        setInitializing(false);
        return;
      }
      const recovery = parsed.recoveryMarker || parsed.type === 'recovery';
      if (parsed.accessToken && parsed.refreshToken) {
        const { error: issue } = await supabase.auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken });
        if (!active) return;
        if (issue) {
          setError('This authentication link is invalid or expired. Request a new link.');
          if (recovery) setRecoveryMode(true);
        } else {
          setError('');
          if (recovery) setRecoveryMode(true);
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const clean = new URL(window.location.href);
            clean.hash = '';
            window.history.replaceState({}, '', `${clean.pathname}${clean.search}` || '/');
          }
        }
        setInitializing(false);
      } else if (recovery) {
        setRecoveryMode(true);
      }
    };

    const initialUrl = Platform.OS === 'web' && typeof window !== 'undefined'
      ? Promise.resolve(window.location.href)
      : Linking.getInitialURL();
    void initialUrl.then(handleAuthUrl).catch(() => {
      if (!active) return;
      setError('Could not process the authentication link. Request a new link.');
      setInitializing(false);
    });
    const linking = Platform.OS !== 'web' ? Linking.addEventListener('url', ({ url }) => { void handleAuthUrl(url); }) : null;

    // Keep auth callbacks synchronous: querying inside one can deadlock locks.
    void supabase.auth.getSession().then(({ data, error: issue }) => {
      if (!active || authEvent) return;
      setSession(data.session);
      setError(issue ? 'Could not restore your session. Please sign in again.' : '');
      setInitializing(false);
    }).catch(() => {
      if (!active) return;
      setError('Could not restore your session. Check your connection.');
      setInitializing(false);
    });

    const refresh = () => {
      if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    };
    if (Platform.OS !== 'web') refresh();
    const appState = Platform.OS !== 'web' ? AppState.addEventListener('change', refresh) : null;
    return () => {
      active = false;
      subscription.unsubscribe();
      linking?.remove();
      appState?.remove();
      if (Platform.OS !== 'web') supabase.auth.stopAutoRefresh();
    };
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    const ac = new AbortController();
    setProfile(null);
    setError('');
    if (!userId) { setProfileLoading(false); return; }
    setProfileLoading(true);
    const timeout = setTimeout(() => {
      setLoadedUser(userId);
      setError('Could not load your profile. Check your connection and retry.');
      setProfileLoading(false);
      ac.abort();
    }, 15000);
    void Promise.resolve(supabase.from('profiles').select('*').eq('id', userId).abortSignal(ac.signal).maybeSingle())
      .then(({ data, error: issue }) => {
        if (ac.signal.aborted) return;
        setLoadedUser(userId);
        setProfile(data);
        setError(issue ? 'Could not load your profile. Please retry.' : '');
        setProfileLoading(false);
      }).catch(() => {
        if (ac.signal.aborted) return;
        setLoadedUser(userId);
        setError('Could not load your profile. Check your connection and retry.');
        setProfileLoading(false);
      }).finally(() => { clearTimeout(timeout); });
    return () => { clearTimeout(timeout); ac.abort(); };
  }, [userId, revision]);

  async function requestPasswordReset(email: string) {
    try {
      const { error: issue } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: passwordResetRedirect() });
      return issue ? 'Could not send the reset email. Check the address and connection, then retry.' : null;
    } catch {
      return 'Could not send the reset email. Check your connection, then retry.';
    }
  }

  async function completePasswordRecovery(password: string) {
    if (!session) return 'This recovery link is invalid or expired. Request a new link.';
    try {
      const { error: issue } = await supabase.auth.updateUser({ password });
      if (issue) return issue.message || 'Could not update your password. Request a new link and retry.';
      clearRecoveryLocation();
      setRecoveryMode(false);
      setError('');
      await supabase.auth.signOut({ scope: 'local' });
      return null;
    } catch {
      return 'Could not update your password. Check your connection and retry.';
    }
  }

  async function cancelPasswordRecovery() {
    clearRecoveryLocation();
    setRecoveryMode(false);
    setError('');
    if (session) await supabase.auth.signOut({ scope: 'local' });
  }

  return <AuthContext.Provider value={{
    session,
    initializing,
    profile: profile?.id === userId ? profile : null,
    profileLoading: profileLoading || (!!userId && loadedUser !== userId),
    error,
    recoveryMode,
    reloadProfile: () => setRevision(v => v + 1),
    requestPasswordReset,
    completePasswordRecovery,
    cancelPasswordRecovery,
  }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is required');
  return value;
}
