// Account deletion (GDPR Art. 17) as pure logic, testable with fakes.
// Order matters: public Storage objects are removed FIRST. If that fails the
// Auth user is kept, so the student can retry and no publicly reachable photo
// outlives the account. Deleting the Auth user cascades every database row
// that references the profile (listings, messages, memberships, reports filed,
// saved items, notices, quota ledgers).
import { HttpError } from "../_shared/http.ts";

export const CONFIRMATION_PHRASE = "DELETE MY ACCOUNT";
/** Deletion re-verifies the password on the server: a stolen access token alone cannot erase an account. */
export const BUCKETS = ["listing-media", "avatars"] as const;

export type StorageEntry = { name: string; id: string | null };
export interface DeleteAccountDeps {
  list(bucket: string, prefix: string, offset: number): Promise<StorageEntry[]>;
  remove(bucket: string, paths: string[]): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  /** Rate-limited admission for password checks (false = too many attempts). */
  admitAttempt(userId: string): Promise<boolean>;
  /** True only if the password is correct for this email (checked against Supabase Auth). */
  verifyPassword(email: string, password: string): Promise<boolean>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE = 100;
const MAX_OBJECTS = 5000;

/** Every object path under `<userId>/` in a bucket, folders expanded one level deep at a time. */
export async function collectUserObjects(deps: DeleteAccountDeps, bucket: string, userId: string): Promise<string[]> {
  const files: string[] = [];
  const folders = [userId];
  while (folders.length) {
    const prefix = folders.shift()!;
    for (let offset = 0; ; offset += PAGE) {
      const page = await deps.list(bucket, prefix, offset);
      for (const entry of page) {
        if (!entry.name || entry.name.includes("/") || entry.name === "." || entry.name === "..") continue;
        const path = `${prefix}/${entry.name}`;
        // Supabase Storage lists folders with id === null.
        if (entry.id === null) folders.push(path); else files.push(path);
        if (files.length > MAX_OBJECTS) throw new HttpError(503, "STORAGE_LIMIT", "Too many stored files; contact support");
      }
      if (page.length < PAGE) break;
    }
  }
  return files;
}

export async function deleteAccount(
  deps: DeleteAccountDeps,
  user: { id: string; email?: string | null },
  confirmation: unknown,
  password: unknown,
): Promise<{ removedObjects: number }> {
  if (!uuid.test(user.id)) throw new HttpError(400, "IDENTITY", "Invalid account");
  if (confirmation !== CONFIRMATION_PHRASE)
    throw new HttpError(400, "CONFIRMATION", `Type ${CONFIRMATION_PHRASE} to confirm`);
  if (typeof password !== "string" || password.length < 1 || password.length > 200 || !user.email)
    throw new HttpError(401, "REAUTH_REQUIRED", "Enter your password to confirm");
  if (!(await deps.admitAttempt(user.id)))
    throw new HttpError(429, "RATE_LIMIT", "Too many attempts. Try again in an hour.");
  if (!(await deps.verifyPassword(user.email, password)))
    throw new HttpError(401, "REAUTH_REQUIRED", "That password did not work");
  let removed = 0;
  for (const bucket of BUCKETS) {
    const paths = await collectUserObjects(deps, bucket, user.id);
    for (let i = 0; i < paths.length; i += PAGE) {
      const batch = paths.slice(i, i + PAGE);
      // Defence in depth: never remove anything outside the caller's prefix.
      if (!batch.every(p => p.startsWith(`${user.id}/`))) throw new HttpError(500, "PATH", "Unexpected storage path");
      await deps.remove(bucket, batch);
      removed += batch.length;
    }
  }
  await deps.deleteUser(user.id);
  return { removedObjects: removed };
}
