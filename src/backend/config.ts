export const productionBackendUrl = 'https://mljmifovcthvtuquvyzf.supabase.co';
export const testBackendUrl = 'https://stuora-test.invalid';
export type BackendEnvironment = {
  mode?: string;
  url?: string;
  key?: string;
  webOrigin?: string;
  /** Staging only: the stable Vercel Git-branch URL of the same deployment. */
  webOriginAlias?: string;
};

function fail(message: string): never { throw new Error(`Stuora configuration: ${message}`); }
function origin(value: string, label: string): URL {
  let parsed: URL;
  try { parsed = new URL(value); } catch { return fail(`${label} must be a valid origin.`); }
  if (value !== parsed.origin || parsed.username || parsed.password) fail(`${label} must be an exact origin without paths or credentials.`);
  return parsed;
}

// This protects deployment configuration mistakes; RLS remains the authorization boundary.
export function validateBackendConfig(input: BackendEnvironment, currentWebOrigin?: string) {
  const { mode, url, key, webOrigin, webOriginAlias } = input;
  if (!['production', 'staging', 'development', 'test'].includes(mode ?? '')) fail('an explicit environment mode is required.');
  if (!url || !key) fail('backend URL and publishable key are required; no defaults are permitted.');
  const backend = origin(url, 'Backend URL');
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) fail('only publishable keys are permitted.');
  if (mode === 'production') {
    if (url !== productionBackendUrl) fail('production must use the controlled Stuora project.');
  } else if (url === productionBackendUrl) fail('nonproduction environments cannot use the production project.');
  if (mode === 'test') {
    if (url !== testBackendUrl || key !== 'sb_publishable_test_fixture') fail('tests must use the reserved mock backend.');
    if (currentWebOrigin && !['http://127.0.0.1:4173', 'http://localhost:4173'].includes(currentWebOrigin)) fail('test bundles are restricted to the local test server.');
  } else if (mode === 'development') {
    if (!['http://127.0.0.1:54321', 'http://localhost:54321'].includes(url)) fail('development must use local Supabase. Use staging for a separate hosted project.');
  } else {
    if (backend.protocol !== 'https:' || !/^[a-z]{20}\.supabase\.co$/.test(backend.hostname)) fail('hosted environments require an HTTPS Supabase project origin.');
    if (!webOrigin) fail('hosted builds require their approved web origin.');
    const approved = origin(webOrigin, 'Web origin');
    if (approved.protocol !== 'https:' || approved.port || !approved.hostname.includes('.') ||
      /(^|\.)(localhost|invalid|local|test)$/.test(approved.hostname) || /^\d+(\.\d+){3}$/.test(approved.hostname)) fail('hosted builds require a public HTTPS web origin.');
    const publicOrigin = (value: string, label: string) => {
      const parsed = origin(value, label);
      if (parsed.protocol !== 'https:' || parsed.port || !parsed.hostname.includes('.') ||
        /(^|\.)(localhost|invalid|local|test)$/.test(parsed.hostname) || /^\d+(\.\d+){3}$/.test(parsed.hostname)) fail(`hosted builds require a public HTTPS ${label.toLowerCase()}.`);
    };
    if (webOriginAlias) {
      if (mode !== 'staging') fail('only staging previews may have a branch alias origin.');
      publicOrigin(webOriginAlias, 'Alias origin');
    }
    if (currentWebOrigin && currentWebOrigin !== webOrigin && currentWebOrigin !== webOriginAlias) fail('this web origin is not approved for this build.');
  }
  return { mode, url, key, webOrigin, webOriginAlias };
}
