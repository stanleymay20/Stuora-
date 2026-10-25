import type { AuthError } from '@supabase/supabase-js';
type AuthAction = 'sign-in' | 'sign-up';
// Never leak raw provider or account-enumeration details to students.
export function stuoraAuthError(error: Pick<AuthError, 'code' | 'message'>, action: AuthAction): string {
  switch (error.code) {
    case 'invalid_credentials': return "That email or password didn't work. Check your details, or use Forgot password to set a new one.";
    case 'email_not_confirmed': return 'Confirm your email using the Stuora message in your inbox before signing in.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit': return 'Too many requests right now. Please try again later.';
    case 'email_address_not_authorized': return 'Stuora email delivery is temporarily unavailable. Please try again later.';
    case 'weak_password': return 'Choose a stronger password to secure your Stuora account.';
    case 'signup_disabled': return 'New Stuora registrations are temporarily unavailable.';
    default: return action === 'sign-up'
      ? 'We could not create your Stuora account. Check your details or try again later.'
      : 'We could not sign you in to Stuora. Please try again.';
  }
}
