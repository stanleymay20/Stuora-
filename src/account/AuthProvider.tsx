import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../backend/supabase';
import type { Database } from '../backend/database.types';
import { parseStuoraNativeAuthCallback } from './nativeAuthCallback';

export type Profile = Database['public']['Tables']['profiles']['Row'];
type AuthState = {
  session: Session | null;
  initializing: boolean;
  profile: Profile | null;
  profileLoading: boolean;
  recoveryMode: boolean;
  recoveryComplete: boolean;
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
  const [recoveryComplete, setRecoveryComplete] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let authEvent = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      authEvent = true;
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        setRecoveryComplete(false);
      }
      if (event === 'SIGNED_IN') setRecoveryComplete(false);
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
        const callback = parseStuoraNativeAuthCallback(raw);
        if (!callback) {
          // Only Stuora callback-shaped links get a visible retry message.
          // Unrelated app links must never become authentication attempts.
          if (/^stuora:\/\/auth-callback(?:[/?#]|$)/i.test(raw))
            setError('This Stuora sign-in link is invalid or expired. Request a new one.');
          return;
        }
        // PKCE: the code is only usable with the verifier stored on this device.
        // A recovery link emits PASSWORD_RECOVERY through onAuthStateChange.
        const { error: issue } = await supabase.auth.exchangeCodeForSession(callback.code);
        if (!active) return;
        if (issue) {
          setError('Open this link on the device where you requested it, or request a new one.');
          return;
        }
        setError('');
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
    recoveryComplete,
    error,
    reloadProfile: () => setRevision(v => v + 1),
    // Preserve the isolated auth screen across sign-out until the next login.
    finishRecovery: () => setRecoveryComplete(true),
  }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is required');
  return value;
}
