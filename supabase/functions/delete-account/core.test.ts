import { strict as assert } from "node:assert";
import { CONFIRMATION_PHRASE, deleteAccount, type DeleteAccountDeps } from "./core.ts";

const user = "11111111-1111-4111-8111-111111111111";
const me = { id: user, email: "alice@example.test" };
const PASSWORD = "correct horse";

function fakes(tree: Record<string, Record<string, { name: string; id: string | null }[]>>, fail: Partial<Record<"remove" | "deleteUser" | "limit", boolean>> = {}) {
  const calls: string[] = [];
  const deps: DeleteAccountDeps = {
    async list(bucket, prefix, offset) {
      const all = tree[bucket]?.[prefix] ?? [];
      return all.slice(offset, offset + 100);
    },
    async remove(bucket, paths) { calls.push(`remove:${bucket}:${paths.join(",")}`); if (fail.remove) throw new Error("storage down"); },
    async deleteUser(id) { calls.push(`deleteUser:${id}`); if (fail.deleteUser) throw new Error("auth down"); },
    async admitAttempt() { calls.push("attempt"); return (fail as { limit?: boolean }).limit !== true; },
    async verifyPassword(email, password) { return email === me.email && password === PASSWORD; },
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
  const result = await deleteAccount(deps, me, CONFIRMATION_PHRASE, PASSWORD);
  assert.equal(result.removedObjects, 3);
  assert.deepEqual(calls, [
    "attempt",
    `remove:listing-media:${user}/${listing}/a.webp,${user}/${listing}/b.webp`,
    `remove:avatars:${user}/avatar`,
    `deleteUser:${user}`,
  ]);
});

Deno.test("requires the exact phrase and the password, verified server-side and rate-limited", async () => {
  const { deps, calls } = fakes({});
  await assert.rejects(deleteAccount(deps, me, "delete", PASSWORD), { code: "CONFIRMATION" });
  await assert.rejects(deleteAccount(deps, me, CONFIRMATION_PHRASE, undefined), { code: "REAUTH_REQUIRED" });
  await assert.rejects(deleteAccount(deps, { id: user, email: null }, CONFIRMATION_PHRASE, PASSWORD), { code: "REAUTH_REQUIRED" });
  // A stolen access token without the password cannot delete the account.
  await assert.rejects(deleteAccount(deps, me, CONFIRMATION_PHRASE, "guess"), { code: "REAUTH_REQUIRED" });
  assert.ok(!calls.some(c => c.startsWith("remove") || c.startsWith("deleteUser")));
  const limited = fakes({}, { limit: true });
  await assert.rejects(deleteAccount(limited.deps, me, CONFIRMATION_PHRASE, PASSWORD), { code: "RATE_LIMIT" });
});

Deno.test("a storage failure keeps the account so no public file outlives it", async () => {
  const { deps, calls } = fakes({ "avatars": { [user]: [{ name: "avatar", id: "z" }] } }, { remove: true });
  await assert.rejects(deleteAccount(deps, me, CONFIRMATION_PHRASE, PASSWORD));
  assert.ok(!calls.some(c => c.startsWith("deleteUser")));
});

Deno.test("ignores traversal-shaped names and paginates large folders", async () => {
  const many = Array.from({ length: 230 }, (_, i) => ({ name: `p${i}.webp`, id: String(i) }));
  const { deps, calls } = fakes({
    "listing-media": { [user]: [{ name: "..", id: null }, { name: "a/b", id: "q" }, ...many] },
  });
  const result = await deleteAccount(deps, me, CONFIRMATION_PHRASE, PASSWORD);
  assert.equal(result.removedObjects, 230);
  assert.equal(calls.filter(c => c.startsWith("remove:listing-media")).length, 3);
  assert.ok(calls.every(c => !c.includes("..") && !c.includes("a/b")));
});
