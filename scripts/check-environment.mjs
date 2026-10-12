import { load } from '@expo/env';
import { validateBackendConfig } from './load-backend-config.mjs';
// Match Expo's .env resolution, including .env.local. Never print key values.
process.env.NODE_ENV ??= process.argv[2] === 'production' ? 'production' : 'development';
load(process.cwd());
try {
  const { mode } = validateBackendConfig({
    mode: process.env.EXPO_PUBLIC_STUORA_ENV,
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    key: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    webOrigin: process.env.EXPO_PUBLIC_STUORA_WEB_ORIGIN,
  });
  console.log(`Stuora ${mode} environment validated.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
