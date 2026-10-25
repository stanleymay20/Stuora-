/**
 * Explains email-link outcomes that supabase-js handles silently on the web.
 * - `?code=` without this browser's PKCE verifier is ignored by supabase-js:
 *   the link was opened in another browser/device. For sign-up confirmation the
 *   email IS already confirmed (Auth verifies before redirecting), so the
 *   student can simply sign in; a password-reset link must be reopened here.
 * - `error_code=otp_expired` etc.: the link expired or was already used.
 * Never echoes provider text (which could be attacker-supplied via the URL).
 */
export type AuthCallbackKind = 'code' | 'expired' | 'error';

export function classifyAuthCallback(href: string | null | undefined): AuthCallbackKind | null {
  if (!href) return null;
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  const params = new URLSearchParams(url.search);
  for (const [k, v] of new URLSearchParams(url.hash.replace(/^#/, ''))) if (!params.has(k)) params.set(k, v);
  const code = (params.get('error_code') ?? '').toLowerCase();
  if (params.has('error') || params.has('error_code') || params.has('error_description')) {
    return code === 'otp_expired' || code === 'flow_state_expired' || code === 'flow_state_not_found' ? 'expired' : 'error';
  }
  return params.has('code') ? 'code' : null;
}

export function authCallbackMessage(kind: AuthCallbackKind): string {
  switch (kind) {
    case 'code': return 'This link was opened in a different browser than the one you used on Stuora. If you were confirming your email, it is confirmed: sign in below. For a password reset, request a new link and open it in this browser.';
    case 'expired': return 'This link has expired or was already used. Sign in, or request a new link.';
    default: return 'This sign-in link could not be used. Sign in, or request a new link.';
  }
}

/** Removes auth callback parameters so a reload never retries a dead link. */
export function stripAuthCallbackParams(href: string): string {
  const url = new URL(href);
  for (const key of ['code', 'error', 'error_code', 'error_description', 'sb']) url.searchParams.delete(key);
  if (/(^#|&)(error|error_code|error_description|access_token|refresh_token)=/.test(url.hash)) url.hash = '';
  return url.pathname + url.search + url.hash;
}
