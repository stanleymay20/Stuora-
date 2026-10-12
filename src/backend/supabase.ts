import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { validateBackendConfig } from './config';

// Public project identifiers only. Authorization comes from Auth + RLS.
// Never configure this client with a service-role or secret key.
const { url, key } = validateBackendConfig({
  mode: process.env.EXPO_PUBLIC_STUORA_ENV,
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  key: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  webOrigin: process.env.EXPO_PUBLIC_STUORA_WEB_ORIGIN,
}, Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined);
export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    lock: processLock,
  },
});
