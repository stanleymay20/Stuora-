/**
 * Parse only the native callback URL registered in app.json. Android and iOS
 * can deliver unrelated or attacker-created Linking events to an application;
 * never hand their token-looking query strings to a session manager.
 *
 * This validates routing and ambiguity, NOT the identity/issuer of a token:
 * Supabase Auth must independently validate credentials in setSession().
 * A future production native PKCE exchange requires separate state-bound QA.
 */
export type NativeAuthCallback = {
  accessToken: string;
  refreshToken: string;
  recovery: boolean;
};

const TOKEN_LIMIT = 8192;
export function parseStuoraNativeAuthCallback(raw: string | null | undefined): NativeAuthCallback | null {
  if (!raw || raw.length > 16_384 || raw !== raw.trim()) return null;
  try {
    const uri = new URL(raw);
    if (uri.protocol !== 'stuora:' || uri.hostname !== 'auth-callback' ||
        (uri.pathname !== '' && uri.pathname !== '/') || uri.username || uri.password ||
        uri.port || (uri.hash !== '' && uri.search !== '')) return null;
    const encoded = uri.hash ? uri.hash.slice(1) : uri.search.slice(1);
    if (!encoded || encoded.length > 16_000) return null;
    const params = new URLSearchParams(encoded);
    const access = params.getAll('access_token');
    const refresh = params.getAll('refresh_token');
    const kinds = params.getAll('type');
    const tokenTypes = params.getAll('token_type');
    if (access.length !== 1 || refresh.length !== 1 ||
        kinds.length > 1 || tokenTypes.length > 1 ||
        (tokenTypes.length && tokenTypes[0].toLowerCase() !== 'bearer') ||
        params.has('error') || params.has('error_description')) return null;
    const validToken = (v: string) => v.length > 0 && v.length <= TOKEN_LIMIT && !/\s/.test(v);
    if (!validToken(access[0]) || !validToken(refresh[0])) return null;
    return { accessToken: access[0], refreshToken: refresh[0], recovery: kinds[0] === 'recovery' };
  } catch { return null; }
}
