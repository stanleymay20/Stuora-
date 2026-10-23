/**
 * Parse only the native callback URL registered in app.json. Android and iOS
 * can deliver unrelated or attacker-created Linking events to an application;
 * never hand their contents to a session manager.
 *
 * Gen-3 audit (login CSRF): Stuora uses the PKCE flow only. A callback carries
 * a one-time `code` that Supabase Auth exchanges together with the code
 * verifier stored on THIS device when the email was requested. A link created
 * by someone else (or an implicit-flow URL carrying ready-made access and
 * refresh tokens) can therefore never sign this device into another account.
 */
export type NativeAuthCallback = { code: string };

export function parseStuoraNativeAuthCallback(raw: string | null | undefined): NativeAuthCallback | null {
  if (!raw || raw.length > 4096 || raw !== raw.trim()) return null;
  try {
    const uri = new URL(raw);
    if (uri.protocol !== 'stuora:' || uri.hostname !== 'auth-callback' ||
        (uri.pathname !== '' && uri.pathname !== '/') || uri.username || uri.password ||
        uri.port || uri.hash) return null;
    const params = new URLSearchParams(uri.search.slice(1));
    const codes = params.getAll('code');
    if (codes.length !== 1 || params.has('access_token') || params.has('refresh_token') ||
        params.has('error') || params.has('error_description')) return null;
    if (!/^[A-Za-z0-9._~-]{8,512}$/.test(codes[0])) return null;
    return { code: codes[0] };
  } catch { return null; }
}
