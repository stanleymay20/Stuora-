/** Install only the WebCrypto methods used by Supabase PKCE on native.
 * Never allow its Math.random verifier or plain challenge fallback.
 * Expo's getRandomValues uses native secure randomness and throws if absent.
 */
type PkceRuntime = {
  crypto?: { getRandomValues?: unknown; subtle?: { digest?: unknown } };
  TextEncoder?: unknown;
  btoa?: unknown;
};
export function installNativePkceCrypto(
  runtime: PkceRuntime,
  randomValues: unknown,
  sha256: (data: BufferSource) => Promise<ArrayBuffer>,
) {
  if (typeof runtime.TextEncoder !== 'function' || typeof runtime.btoa !== 'function' ||
      typeof randomValues !== 'function') throw new Error('Secure native authentication is unavailable');
  if (!runtime.crypto) Object.defineProperty(runtime, 'crypto', { value: {}, configurable: true });
  const crypto = runtime.crypto!;
  if (typeof crypto.getRandomValues !== 'function')
    Object.defineProperty(crypto, 'getRandomValues', { value: randomValues, configurable: true });
  if (!crypto.subtle) Object.defineProperty(crypto, 'subtle', { value: {}, configurable: true });
  if (typeof crypto.subtle!.digest !== 'function')
    Object.defineProperty(crypto.subtle, 'digest', {
      value: async (algorithm: string | { name: string }, data: BufferSource) => {
        const name = typeof algorithm === 'string' ? algorithm : algorithm?.name;
        if (name?.toUpperCase() !== 'SHA-256') throw new Error('Unsupported native authentication digest');
        return sha256(data);
      }, configurable: true,
    });
}
