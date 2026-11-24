/**
 * Hard build-time release lock. This candidate may be deployed only to the
 * dedicated Stuora STAGING Supabase project for disabled-startup testing.
 * Changing this constant to true requires explicit release authorization,
 * exact-head CI, real two-account JWT acceptance and a coordinated Storage
 * policy/client cutover. Environment variables can never activate it alone.
 */
export const STAGING_API_URL = "https://uptjcspizukpjcoayhtn.supabase.co";
export const TRUSTED_MEDIA_WRITES_COMPILED_IN = false;
export function trustedMediaWriteGate(
  activation: string | undefined, apiUrl: string | undefined, webOrigin: string | undefined,
): boolean {
  return TRUSTED_MEDIA_WRITES_COMPILED_IN
    && activation === "STAGING_APPROVED"
    && apiUrl === STAGING_API_URL
    && typeof webOrigin === "string"
    && /^https:\/\/[a-z0-9.-]+(?::[0-9]{2,5})?$/.test(webOrigin);
}
