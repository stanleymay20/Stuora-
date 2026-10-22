// The Edge copy of the deterministic parser must stay identical to the app's.
import { strict as assert } from "node:assert";

Deno.test("_shared/intent.ts is an exact copy of src/ai/botCore.ts", async () => {
  const app = await Deno.readTextFile(new URL("../../../src/ai/botCore.ts", import.meta.url));
  const edge = await Deno.readTextFile(new URL("./intent.ts", import.meta.url));
  const body = edge.split("\n").slice(2).join("\n");
  assert.equal(body, app, "Run: { echo header; cat src/ai/botCore.ts; } > supabase/functions/_shared/intent.ts");
});
