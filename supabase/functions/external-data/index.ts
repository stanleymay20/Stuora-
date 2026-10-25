// POST /functions/v1/external-data
//   { "action": "city", "query": "Halle (Saale)" }
//   { "action": "feed", "kind": "jobs" | "events", "city": "Köln", "query": "werkstudent" }
// Signed-in students only. Each provider is off until its secrets (and, for
// Adzuna and the Bundesagentur, an explicit licence/terms flag) are set.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { allowedOrigins, bearer, corsHeaders, HttpError, json, preflight, readJson } from "../_shared/http.ts";
import { type ExternalDeps, loadFeed, lookupCity } from "./core.ts";
import {
  adzunaProvider, bundesagenturProvider, type FeedProvider, nominatimLookup, ticketmasterProvider,
} from "./providers.ts";

const env = Deno.env.toObject();
const url = env.SUPABASE_URL, anonKey = env.SUPABASE_ANON_KEY, serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("external-data is missing Supabase configuration");
const origins = allowedOrigins(env.STUORA_ALLOWED_WEB_ORIGINS);
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const feeds = [ticketmasterProvider(env), adzunaProvider(env), bundesagenturProvider(env)]
  .filter((p): p is FeedProvider => p !== null);
const cityLookup = nominatimLookup(env);
console.log(JSON.stringify({ event: "external_config", feeds: feeds.map(f => f.id), cityLookup: cityLookup !== null, origins: origins.size }));

async function rpcBoolean(name: string, args: Record<string, unknown> = {}): Promise<boolean> {
  const { data, error } = await admin.rpc(name, args);
  if (error || typeof data !== "boolean") throw new HttpError(503, "QUOTA", "Temporarily unavailable");
  return data;
}

Deno.serve(async req => {
  const early = preflight(req, origins);
  if (early) return early;
  const cors = corsHeaders(req.headers.get("Origin"), origins);
  try {
    if (req.method !== "POST") throw new HttpError(405, "METHOD", "Unsupported method");
    const token = bearer(req);
    const users = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await users.auth.getUser(token);
    if (error || !user) throw new HttpError(401, "AUTH", "Invalid user session");
    const body = await readJson(req, 1024);
    const deps: ExternalDeps = {
      async cacheGet(provider, key) {
        const { data, error: e } = await admin.rpc("external_cache_get", { p_provider: provider, p_key: key });
        return e ? null : data;
      },
      async cachePut(provider, key, payload, ttl) {
        await admin.rpc("external_cache_put", { p_provider: provider, p_key: key, p_payload: payload, p_ttl_seconds: ttl });
      },
      consumeQuota: () => rpcBoolean("consume_external_data_request", { p_student: user.id }),
      acquireNominatimSlot: () => rpcBoolean("acquire_nominatim_slot"),
      feeds, cityLookup, fetcher: fetch,
    };
    if (body.action === "city") return json(200, await lookupCity(deps, body.query), cors);
    if (body.action === "feed") return json(200, await loadFeed(deps, body.kind, body.city, body.query), cors);
    if (body.action === "status") {
      return json(200, {
        cityLookup: cityLookup !== null,
        jobs: feeds.filter(f => f.kind === "jobs").map(f => f.attribution),
        events: feeds.filter(f => f.kind === "events").map(f => f.attribution),
      }, cors);
    }
    throw new HttpError(400, "ACTION", "Unsupported action");
  } catch (err) {
    if (err instanceof HttpError) {
      // Reason codes only (FEATURE_DISABLED, AUTH, RATE_LIMIT…): no user, query or key data.
      console.warn(JSON.stringify({ event: "request_refused", fn: "external-data", code: err.code, status: err.status }));
      return json(err.status, { code: err.code, error: err.message }, cors);
    }
    console.error("external-data internal failure", err instanceof Error ? err.name : "unknown");
    return json(503, { code: "UNAVAILABLE", error: "External data temporarily unavailable" }, cors);
  }
});
