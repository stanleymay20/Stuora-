// Vercel's immutable preview URL changes on EVERY build. Expo embeds public
// configuration during export, so a fixed preview-origin env value crashes the
// app before React mounts at the immutable deployment URL. Derive the ONE
// approved origin from Vercel-controlled VERCEL_URL at build time instead.
// This NEVER permits arbitrary browser origins or a production backend.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const STAGING_URL = 'https://uptjcspizukpjcoayhtn.supabase.co';
const DEPLOYMENT_HOST = /^stuora-preview-[a-z0-9]{8,32}-stanleymay20s-projects\.vercel\.app$/;

export function derivePreviewWebOrigin(env) {
  if (env.VERCEL_ENV !== 'preview') return null;
  if (env.EXPO_PUBLIC_STUORA_ENV !== 'staging' ||
      env.EXPO_PUBLIC_SUPABASE_URL !== STAGING_URL) {
    throw new Error('Preview requires the dedicated Stuora staging backend.');
  }
  const url = env.VERCEL_URL;
  if (typeof url !== 'string' || !DEPLOYMENT_HOST.test(url)) {
    throw new Error('Vercel supplied an unrecognized Stuora preview hostname.');
  }
  return 'https://' + url;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const origin = derivePreviewWebOrigin(process.env);
    const env = { ...process.env };
    if (origin) {
      env.EXPO_PUBLIC_STUORA_WEB_ORIGIN = origin;
      console.log('Stuora exact-origin preview export: ' + origin);
    }
    const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(cmd, ['run', 'export:web'], { stdio: 'inherit', env });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error('Stuora Vercel build refused: ' + error.message);
    process.exitCode = 1;
  }
}
