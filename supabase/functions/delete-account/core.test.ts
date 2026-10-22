import { strict as assert } from "node:assert";
import { CONFIRMATION_PHRASE, deleteAccount, type DeleteAccountDeps, MAX_SESSION_AGE_MS } from "./core.ts";

const user = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-10-23T12:00:00Z");
const fresh = new Date(NOW - 60_000).toISOString();

function fakes(tree: Record<string, Record<string, { name: string; id: string | null }[]>>, fail: Partial<Record<"remove" | "deleteUser", boolean>> = {}) {
  const calls: string[] = [];
  const deps: DeleteAccountDeps = {
    async list(bucket, prefix, offset) {
      const all = tree[bucket]?.[prefix] ?? [];
      return all.slice(offset, offset + 100);
    },
    async remove(bucket, paths) { calls.push(`remove:${bucket}:${paths.join(",")}`); if (fail.remove) throw new Error("storage down"); },
    async deleteUser(id) { calls.push(`deleteUser:${id}`); if (fail.deleteUser) throw new Error("auth down"); },
    now: () => NOW,
  };
  return { deps, calls };
}

Deno.test("removes every object under the user's prefix, then deletes the Auth user", async () => {
  const listing = "22222222-2222-4222-8222-222222222222";
  const { deps, calls } = fakes({
    "listing-media": {
      [user]: [{ name: listing, id: null }],
      [`${user}/${listing}`]: [{ name: "a.webp", id: "x" }, { name: "b.webp", id: "y" }],
    },
    "avatars": { [user]: [{ name: "avatar", id: "z" }] },
  });
  const result = await deleteAccount(deps, { id: user, last_sign_in_at: fresh }, CONFIRMATION_PHRASE);
  assert.equal(result.removedObjects, 3);
  assert.deepEqual(calls, [
    `remove:listing-media:${user}/${listing}/a.webp,${user}/${listing}/b.webp`,
    `remove:avatars:${user}/avatar`,
    `deleteUser:${user}`,
  ]);
});

Deno.test("requires the exact confirmation phrase and a recent sign-in", async () => {
  const { deps, calls } = fakes({});
  await assert.rejects(deleteAccount(deps, { id: user, last_sign_in_at: fresh }, "delete"), { code: "CONFIRMATION" });
  const stale = new Date(NOW - MAX_SESSION_AGE_MS - 1).toISOString();
  await assert.rejects(deleteAccount(deps, { id: user, last_sign_in_at: stale }, CONFIRMATION_PHRASE), { code: "REAUTH_REQUIRED" });
  await assert.rejects(deleteAccount(deps, { id: user, last_sign_in_at: null }, CONFIRMATION_PHRASE), { code: "REAUTH_REQUIRED" });
  assert.deepEqual(calls, []);
});

Deno.test("a storage failure keeps the account so no public file outlives it", async () => {
  const { deps, calls } = fakes({ "avatars": { [user]: [{ name: "avatar", id: "z" }] } }, { remove: true });
  await assert.rejects(deleteAccount(deps, { id: user, last_sign_in_at: fresh }, CONFIRMATION_PHRASE));
  assert.ok(!calls.some(c => c.startsWith("deleteUser")));
});

Deno.test("ignores traversal-shaped names and paginates large folders", async () => {
  const many = Array.from({ length: 230 }, (_, i) => ({ name: `p${i}.webp`, id: String(i) }));
  const { deps, calls } = fakes({
    "listing-media": { [user]: [{ name: "..", id: null }, { name: "a/b", id: "q" }, ...many] },
  });
  const result = await deleteAccount(deps, { id: user, last_sign_in_at: fresh }, CONFIRMATION_PHRASE);
  assert.equal(result.removedObjects, 230);
  assert.equal(calls.filter(c => c.startsWith("remove:listing-media")).length, 3);
  assert.ok(calls.every(c => !c.includes("..") && !c.includes("a/b")));
});
