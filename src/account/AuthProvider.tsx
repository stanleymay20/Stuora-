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
  recoveryMode: boolean;
  error: string;
  reloadProfile: () => void;
  finishRecovery: () => void;
};
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadedUser, setLoadedUser] = useState<string | undefined>(undefined);
  const [profileLoading, setProfileLoading] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let authEvent = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      authEvent = true;
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      if (event === 'SIGNED_OUT') setRecoveryMode(false);
      setSession(next);
      setInitializing(false);
    });

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

    async function handleNativeAuthUrl(raw: string | null) {
      if (!active || Platform.OS === 'web' || !raw) return;
      try {
        const parsed = new URL(raw);
        const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : '';
        const params = new URLSearchParams(parsed.search);
        for (const [key, value] of new URLSearchParams(hash)) if (!params.has(key)) params.set(key, value);
        if (params.get('error') || params.get('error_code')) {
          setError('This sign-in link is invalid or has expired. Request a new one.');
          return;
        }
        // PKCE only: tokens embedded in a link are never accepted. The code can
        // be exchanged only with the verifier stored when this device started
        // the sign-up or recovery flow. Recovery is signalled by PASSWORD_RECOVERY.
        const code = params.get('code');
        if (!code) return;
        const { error: issue } = await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;
        setError(issue ? 'This sign-in link could not be used on this device. Request a new one here.' : '');
      } catch {
        if (active) setError('This sign-in link could not be read. Request a new one.');
      }
    }

    let linkSubscription: { remove: () => void } | null = null;
    if (Platform.OS !== 'web') {
      void Linking.getInitialURL().then(handleNativeAuthUrl);
      linkSubscription = Linking.addEventListener('url', event => { void handleNativeAuthUrl(event.url); });
    }

    const refresh = () => {
      if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    };
    if (Platform.OS !== 'web') refresh();
    const appState = Platform.OS !== 'web' ? AppState.addEventListener('change', refresh) : null;
    return () => {
      active = false;
      subscription.unsubscribe();
      linkSubscription?.remove();
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
    // A result from an old account may never populate a new account's profile.
    return () => { clearTimeout(timeout); ac.abort(); };
  }, [userId, revision]);

  return <AuthContext.Provider value={{
    session,
    initializing,
    profile: profile?.id === userId ? profile : null,
    profileLoading: profileLoading || (!!userId && loadedUser !== userId),
    recoveryMode,
    error,
    reloadProfile: () => setRevision(v => v + 1),
    finishRecovery: () => setRecoveryMode(false),
  }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is required');
  return value;
}
