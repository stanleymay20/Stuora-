// POST /functions/v1/delete-account  { "confirmation": "DELETE MY ACCOUNT" }
// Requires a valid user JWT from a sign-in within the last 15 minutes.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { allowedOrigins, bearer, corsHeaders, HttpError, json, preflight, readJson } from "../_shared/http.ts";
import { deleteAccount, type DeleteAccountDeps } from "./core.ts";

const url = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const origins = allowedOrigins(Deno.env.get("STUORA_ALLOWED_WEB_ORIGINS"));
if (!url || !anonKey || !serviceKey) throw new Error("delete-account is missing Supabase configuration");
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const deps: DeleteAccountDeps = {
  async list(bucket, prefix, offset) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error) throw new HttpError(503, "STORAGE", "Could not list stored files; nothing was deleted");
    return (data ?? []).map(entry => ({ name: entry.name, id: entry.id ?? null }));
  },
  async remove(bucket, paths) {
    const { error } = await admin.storage.from(bucket).remove(paths);
    if (error) throw new HttpError(503, "STORAGE", "Could not remove stored files; your account was not deleted");
  },
  async deleteUser(userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new HttpError(503, "AUTH", "Files were removed but the account could not be deleted; retry");
  },
  now: () => Date.now(),
};

Deno.serve(async req => {
  const early = preflight(req, origins);
  if (early) return early;
  const cors = corsHeaders(req.headers.get("Origin"), origins);
  try {
    if (req.method !== "POST") throw new HttpError(405, "METHOD", "Unsupported method");
    const token = bearer(req);
    const userClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await userClient.auth.getUser(token);
    if (error || !user) throw new HttpError(401, "AUTH", "Invalid user session");
    const body = await readJson(req, 512);
    const result = await deleteAccount(deps, user, body.confirmation);
    return json(200, { ok: true, removedObjects: result.removedObjects }, cors);
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { code: err.code, error: err.message }, cors);
    console.error("delete-account internal failure", err instanceof Error ? err.name : "unknown");
    return json(503, { code: "UNAVAILABLE", error: "Account deletion is temporarily unavailable" }, cors);
  }
});
