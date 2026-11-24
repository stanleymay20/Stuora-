/** Lease-aware private Storage cleanup. No bucket, URL or object path comes from caller. */
export type CleanupLease = { object_path: string; lease_id: string };
export type CleanupResult = { claimed: number; removed: number; retrying: number; failures: number };
export interface CleanupDeps {
  claim(limit: number): Promise<CleanupLease[]>;
  remove(path: string): Promise<boolean>;
  finish(item: CleanupLease, removed: boolean, reason?: string): Promise<boolean>;
}
export const PRIVATE_GROUP_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|webp)$/;
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Best-effort durable completion: a failed delete is never acknowledged as done. */
export async function processCleanup(deps: CleanupDeps, limit = 4): Promise<CleanupResult> {
  const leases = await deps.claim(Math.min(4, Math.max(1, Math.trunc(limit) || 1)));
  if (leases.length > 4) throw new Error('Cleanup quota exceeded');
  const outcome: CleanupResult = { claimed: leases.length, removed: 0, retrying: 0, failures: 0 };
  for (const item of leases) {
    if (!PRIVATE_GROUP_PATH.test(item.object_path) || !UUID.test(item.lease_id)) {
      // An invalid claimed row must never touch Storage. Queue a failed attempt
      // using only its matching server-issued lease; operator review after cap.
      try {
        if (await deps.finish(item, false, 'INVALID_OBJECT_PATH')) outcome.retrying++;
        else outcome.failures++;
      } catch { outcome.failures++; }
      continue;
    }
    let removed = false;
    try { removed = await deps.remove(item.object_path); } catch { removed = false; }
    try {
      if (await deps.finish(item, removed, removed ? undefined : 'STORAGE_REMOVE_FAILED')) {
        if (removed) outcome.removed++; else outcome.retrying++;
      } else outcome.failures++;
    } catch { outcome.failures++; }
  }
  return outcome;
}

/** Fixed-length SHA-256 equality prevents exposing the worker secret by timing. */
export async function matchingWorkerSecrets(provided: string, expected: string): Promise<boolean> {
  if (!expected || expected.length < 32 || !provided) return false;
  const encode = new TextEncoder();
  const [a,b] = await Promise.all([
    crypto.subtle.digest('SHA-256',encode.encode(provided)),
    crypto.subtle.digest('SHA-256',encode.encode(expected)),
  ]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for(let i=0;i<32;i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
