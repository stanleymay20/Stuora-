import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
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
  reloadProfile: () => void;
};
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadedUser, setLoadedUser] = useState<string | undefined>(undefined);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let authEvent = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      authEvent = true;
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
    const refresh = () => {
      if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    };
    if (Platform.OS !== 'web') refresh();
    const appState = Platform.OS !== 'web' ? AppState.addEventListener('change', refresh) : null;
    return () => {
      active = false;
      subscription.unsubscribe();
      appState?.remove();
      if (Platform.OS !== 'web') supabase.auth.stopAutoRefresh();
    };
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    let active = true;
    setProfile(null);
    setError('');
    if (!userId) { setProfileLoading(false); return; }
    setProfileLoading(true);
    void Promise.resolve(supabase.from('profiles').select('*').eq('id', userId).maybeSingle())
      .then(({ data, error: issue }) => {
        if (!active) return;
        setLoadedUser(userId);
        setProfile(data);
        setError(issue ? 'Could not load your profile. Please retry.' : '');
        setProfileLoading(false);
      }).catch(() => {
        if (!active) return;
        setLoadedUser(userId);
        setError('Could not load your profile. Check your connection and retry.');
        setProfileLoading(false);
      });
    // A result from an old account may never populate a new account's profile.
    return () => { active = false; };
  }, [userId, revision]);

  return <AuthContext.Provider value={{ session, initializing, profile: profile?.id === userId ? profile : null, profileLoading: profileLoading || (!!userId && loadedUser !== userId), error, reloadProfile: () => setRevision(v => v + 1) }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is required');
  return value;
}
