// External data orchestration: validate, serve from cache, admit through the
// per-student quota, call enabled providers in parallel, cache, attribute.
import { HttpError } from "../_shared/http.ts";
import { isPlausibleCity } from "../_shared/intent.ts";
import {
  type Attribution, type CityCandidate, type FeedProvider, GEONAMES_ATTRIBUTION, NOMINATIM_ATTRIBUTION, type Opportunity,
} from "./providers.ts";

export interface ExternalDeps {
  cacheGet(provider: string, key: string): Promise<unknown | null>;
  cachePut(provider: string, key: string, payload: unknown, ttlSeconds: number): Promise<void>;
  consumeQuota(): Promise<boolean>;
  acquireNominatimSlot(): Promise<boolean>;
  feeds: FeedProvider[];
  cityLookup: ((query: string, fetcher: typeof fetch) => Promise<CityCandidate[]>) | null;
  /** Gismate Location Engine (GeoNames in our own database). Tried before OpenStreetMap. */
  localCityLookup?: ((query: string) => Promise<CityCandidate[]>) | null;
  fetcher: typeof fetch;
  /** Identical provider fetches already in flight in this isolate (provider|key). */
  inflight?: Map<string, Promise<Opportunity[]>>;
}
export type SourceStatus = Attribution & { status: "ok" | "error" };
export type FeedReply = { items: Opportunity[]; sources: SourceStatus[] };
export type CityReply = { candidates: CityCandidate[]; attribution: Attribution };

const fold = (v: string) => v.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const sharedInflight = new Map<string, Promise<Opportunity[]>>();
/** Same vacancy re-listed by two providers: same title, employer and place. */
const vacancyKey = (o: Opportunity) =>
  [o.title, o.subtitle, o.location].map(v => fold(v).replace(/\s*\((?:m|w|d|f|x|div)(?:\s*\/\s*(?:m|w|d|f|x|div))*\)\s*/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim()).join("|");

function cleanCity(value: unknown): string {
  if (typeof value !== "string" || !isPlausibleCity(value)) throw new HttpError(400, "CITY", "Choose a real city first");
  return value.trim().replace(/\s+/g, " ");
}
function cleanQuery(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > 60 || !/^[\p{L}\p{M}\p{N} .,'’&+-]*$/u.test(value))
    throw new HttpError(400, "QUERY", "Use up to 60 letters, numbers and spaces");
  return value.trim();
}

/** Our own fixed failure strings only (e.g. "nominatim 403"); otherwise the error class. */
function failureReason(err: unknown): string {
  if (err instanceof Error && /^(nominatim|photon|ticketmaster|adzuna|bundesagentur|geonames) \d{3}$/.test(err.message)) return err.message;
  return err instanceof Error ? err.name : "unknown";
}

export async function lookupCity(deps: ExternalDeps, rawQuery: unknown): Promise<CityReply> {
  if (!deps.cityLookup && !deps.localCityLookup) throw new HttpError(503, "FEATURE_DISABLED", "City lookup is not enabled");
  const query = cleanCity(rawQuery);
  // Local GeoNames first: every lookup is quota-limited, found or not.
  let local: CityCandidate[] | null = null;
  if (deps.localCityLookup) {
    if (!(await deps.consumeQuota())) throw new HttpError(429, "RATE_LIMIT", "Too many lookups. Try again later.");
    try { local = await deps.localCityLookup(query); }
    catch (err) { console.warn(JSON.stringify({ event: "provider_failed", provider: "geonames", reason: failureReason(err) })); }
    if (local?.length) return { candidates: local, attribution: GEONAMES_ATTRIBUTION };
  }
  // Nothing local (e.g. a city outside Germany): OpenStreetMap, as before. If it is
  // unavailable, an empty local answer is still a real answer, not an outage.
  const localEmpty: CityReply | null = local ? { candidates: [], attribution: GEONAMES_ATTRIBUTION } : null;
  if (!deps.cityLookup) {
    if (localEmpty) return localEmpty;
    throw new HttpError(503, "PROVIDER", "City lookup is temporarily unavailable");
  }
  const key = fold(query);
  const cached = await deps.cacheGet("nominatim", key);
  if (Array.isArray(cached)) return { candidates: cached as CityCandidate[], attribution: NOMINATIM_ATTRIBUTION };
  if (!deps.localCityLookup && !(await deps.consumeQuota())) throw new HttpError(429, "RATE_LIMIT", "Too many lookups. Try again later.");
  if (!(await deps.acquireNominatimSlot())) {
    if (localEmpty) return localEmpty;
    throw new HttpError(429, "BUSY", "City lookup is busy. Try again in a moment.");
  }
  let candidates: CityCandidate[];
  try { candidates = await deps.cityLookup(query, deps.fetcher); }
  catch (err) {
    console.warn(JSON.stringify({ event: "provider_failed", provider: "city_lookup", reason: failureReason(err) }));
    if (localEmpty) return localEmpty;
    throw new HttpError(503, "PROVIDER", "City lookup is temporarily unavailable");
  }
  await deps.cachePut("nominatim", key, candidates, 30 * 24 * 3600);
  return { candidates, attribution: NOMINATIM_ATTRIBUTION };
}

export async function loadFeed(deps: ExternalDeps, kind: unknown, rawCity: unknown, rawQuery: unknown): Promise<FeedReply> {
  if (kind !== "jobs" && kind !== "events") throw new HttpError(400, "KIND", "Unsupported feed");
  const providers = deps.feeds.filter(p => p.kind === kind);
  if (!providers.length) throw new HttpError(503, "FEATURE_DISABLED", "No external sources are enabled for this category");
  const city = cleanCity(rawCity);
  const query = cleanQuery(rawQuery);
  const key = `${fold(city)}|${fold(query)}`;
  const cached = await Promise.all(providers.map(p => deps.cacheGet(p.id, key)));
  const misses = providers.filter((_, i) => !Array.isArray(cached[i]));
  if (misses.length && !(await deps.consumeQuota())) throw new HttpError(429, "RATE_LIMIT", "Too many requests. Try again later.");
  const sources: SourceStatus[] = [];
  const items: Opportunity[] = [];
  await Promise.all(providers.map(async (provider, i) => {
    let rows = cached[i] as Opportunity[] | null;
    if (!Array.isArray(rows)) {
      const inflight = deps.inflight ?? sharedInflight;
      const flightKey = `${provider.id}|${key}`;
      let pending = inflight.get(flightKey);
      if (!pending) {
        pending = (async () => {
          const fresh = await provider.fetch(city, query, deps.fetcher);
          // A cache write failure must not throw away vacancies we already have.
          try { await deps.cachePut(provider.id, key, fresh, provider.ttlSeconds); }
          catch (err) { console.warn(JSON.stringify({ event: "cache_put_failed", provider: provider.id, reason: failureReason(err) })); }
          return fresh;
        })();
        inflight.set(flightKey, pending);
        pending.then(() => inflight.delete(flightKey), () => inflight.delete(flightKey));
      }
      try {
        rows = await pending;
      } catch (err) {
        console.warn(JSON.stringify({ event: "provider_failed", provider: provider.id, reason: failureReason(err) }));
        sources.push({ ...provider.attribution, status: "error" });
        return;
      }
    }
    sources.push({ ...provider.attribution, status: "ok" });
    items.push(...rows);
  }));
  // Upcoming events first; newest jobs first; stable de-duplication by id and,
  // for jobs, by vacancy (the same ad syndicated to Adzuna and the BA).
  // Providers finish in any order, so tie-break by id for a stable result.
  items.sort((a, b) => (kind === "events"
    ? String(a.startsAt ?? "9999").localeCompare(String(b.startsAt ?? "9999"))
    : String(b.postedAt ?? "").localeCompare(String(a.postedAt ?? ""))) || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const unique = items.filter(item => {
    const keys = kind === "jobs" ? [item.id, vacancyKey(item)] : [item.id];
    if (keys.some(k => seen.has(k))) return false;
    keys.forEach(k => seen.add(k));
    return true;
  });
  sources.sort((a, b) => a.id.localeCompare(b.id));
  return { items: unique.slice(0, 40), sources };
}
