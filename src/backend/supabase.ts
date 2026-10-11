import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Public project identifiers only. Authorization comes from Auth + RLS.
// Never configure this client with a service-role or secret key.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://mljmifovcthvtuquvyzf.supabase.co';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_266__KLsiTKZcO24CctjOA_VdXJC_M2';
if (!key.startsWith('sb_publishable_') || url !== 'https://mljmifovcthvtuquvyzf.supabase.co') {
  throw new Error('Stuora requires its dedicated project and a publishable key.');
}
export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});
