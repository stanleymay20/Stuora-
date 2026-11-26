import { strict as assert } from "node:assert";
import { allowedOrigins } from "./http.ts";

Deno.test("allowed origins tolerate trailing slash, quotes and case but never paths", () => {
  const host = "https://stuora-preview-git-fix-stuora-gen-ac6adc-stanleymay20s-projects.vercel.app";
  for (const raw of [host, host + "/", `"${host}"`, ` ${host}/ `, host.toUpperCase().replace("HTTPS", "https")]) {
    assert.deepEqual([...allowedOrigins(raw)], [host], raw);
  }
  assert.equal(allowedOrigins(host + "/app").size, 0);
  assert.equal(allowedOrigins("http://evil.example").size, 0);
  assert.deepEqual([...allowedOrigins(`${host}/, https://b.example`)].sort(), ["https://b.example", host].sort());
});
