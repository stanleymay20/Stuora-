// POST /functions/v1/stuora-assistant  { "query": "...", "selectedCity": "Köln" }
// Off unless STUORA_AI_ASSISTANT=enabled AND at least one provider key is set.
// Operators: enable Zero Data Retention in the Groq console before enabling.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { allowedOrigins, bearer, corsHeaders, HttpError, json, preflight, readJson } from "../_shared/http.ts";
import { safeLike } from "../_shared/intent.ts";
import { type AssistantResult, type ResolvedIntent, runAssistant } from "./core.ts";
import { cloudflareProvider, groqProvider, type LlmProvider } from "./providers.ts";

const env = Deno.env.toObject();
const url = env.SUPABASE_URL, anonKey = env.SUPABASE_ANON_KEY, serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("stuora-assistant is missing Supabase configuration");
const origins = allowedOrigins(env.STUORA_ALLOWED_WEB_ORIGINS);
const providers = [groqProvider(env), cloudflareProvider(env)].filter((p): p is LlmProvider => p !== null);
const enabled = env.STUORA_AI_ASSISTANT === "enabled" && providers.length > 0;
// Boot diagnostic: which switches are present (booleans/counts only, never values).
console.log(JSON.stringify({ event: "assistant_config", flag: env.STUORA_AI_ASSISTANT === "enabled", providers: providers.map(p => p.id), origins: origins.size }));
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const KIND: Record<string, string> = { housing: "housing", marketplace: "marketplace", jobs: "job", events: "event", trips: "trip" };

function searchAs(token: string) {
  // Runs with the STUDENT's JWT, so RLS decides exactly what they may see.
  const db = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return async (intent: ResolvedIntent): Promise<AssistantResult[]> => {
    if (intent.domain === "groups") {
      let q = db.from("student_groups").select("id,name,city,topic,description")
        .order("created_at", { ascending: false }).order("id").limit(6);
      if (intent.city) q = q.ilike("city", `%${safeLike(intent.city)}%`);
      if (intent.search) q = q.ilike("name", `%${safeLike(intent.search)}%`);
      const { data, error } = await q;
      if (error) throw new HttpError(503, "SEARCH", "Search is temporarily unavailable");
      return (data ?? []).map(g => ({ id: g.id, title: g.name, domain: "groups",
        description: `${g.topic} · ${g.city}${g.description ? " · " + String(g.description).slice(0, 100) : ""}` }));
    }
    let q = db.from("listings").select("id,title,city,price_cents,currency")
      .eq("kind", KIND[intent.domain]).eq("status", "active")
      .order("created_at", { ascending: false }).order("id").limit(6);
    if (intent.city) q = q.ilike("city", `%${safeLike(intent.city)}%`);
    if (intent.maxPriceCents !== null) q = q.lte("price_cents", intent.maxPriceCents);
    if (intent.search) q = q.ilike("title", `%${safeLike(intent.search)}%`);
    const { data, error } = await q;
    if (error) throw new HttpError(503, "SEARCH", "Search is temporarily unavailable");
    return (data ?? []).map(l => ({ id: l.id, title: l.title, domain: intent.domain,
      description: l.city + (intent.domain === "housing" || intent.domain === "marketplace"
        ? ` · ${new Intl.NumberFormat("en-GB", { style: "currency", currency: l.currency || "EUR" }).format((l.price_cents ?? 0) / 100)}` : "") }));
  };
}

Deno.serve(async req => {
  const early = preflight(req, origins);
  if (early) return early;
  const cors = corsHeaders(req.headers.get("Origin"), origins);
  try {
    if (!enabled) throw new HttpError(503, "FEATURE_DISABLED", "The AI assistant is not enabled");
    if (req.method !== "POST") throw new HttpError(405, "METHOD", "Unsupported method");
    const token = bearer(req);
    const users = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await users.auth.getUser(token);
    if (error || !user) throw new HttpError(401, "AUTH", "Invalid user session");
    const body = await readJson(req, 2048);
    const reply = await runAssistant({
      async consumeQuota() {
        const { data, error: quotaError } = await admin.rpc("consume_ai_request", { p_student: user.id });
        if (quotaError || typeof data !== "boolean") throw new HttpError(503, "QUOTA", "Assistant temporarily unavailable");
        return data;
      },
      providers,
      fetcher: fetch,
      search: searchAs(token),
    }, body.query, body.selectedCity);
    // Counts only: never the query, the user or the results.
    console.log(JSON.stringify({ event: "assistant_reply", source: reply.source, results: reply.results.length }));
    return json(200, reply, cors);
  } catch (err) {
    if (err instanceof HttpError) {
      // Reason codes only (FEATURE_DISABLED, AUTH, RATE_LIMIT…): no user, query or key data.
      console.warn(JSON.stringify({ event: "request_refused", fn: "stuora-assistant", code: err.code, status: err.status }));
      return json(err.status, { code: err.code, error: err.message }, cors);
    }
    console.error("stuora-assistant internal failure", err instanceof Error ? err.name : "unknown");
    return json(503, { code: "UNAVAILABLE", error: "Assistant temporarily unavailable" }, cors);
  }
});
