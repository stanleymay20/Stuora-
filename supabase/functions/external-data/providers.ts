// External data providers. Each one is OFF unless its own explicit secrets
// and licence/terms flags are set, and every item carries a visible source
// attribution and a link back to the provider. Nothing is republished as a
// Stuora listing: items are shown as "not posted on Stuora" link-outs.
import { cleanText, fetchWithTimeout, safeUrl } from "../_shared/http.ts";

export type Opportunity = {
  id: string;
  source: ProviderId;
  title: string;
  subtitle: string;
  location: string;
  startsAt: string | null;
  postedAt: string | null;
  url: string;
};
export type ProviderId = "ticketmaster" | "adzuna" | "bundesagentur";
export type Attribution = { id: ProviderId | "nominatim" | "geonames"; label: string; url: string };
/** The first four fields are what every app version renders; the rest are optional extras. */
export type CityCandidate = {
  name: string; region: string; country: string; countryCode: string;
  district?: string; latitude?: number; longitude?: number; population?: number; geonameId?: number;
  /** True when the typed name matched this place exactly (not only as a prefix). */
  exact?: boolean;
};

/** Where the student's city is, when the Location Engine knows it. */
export type PlacePoint = { latitude: number; longitude: number; countryCode?: string };

export interface FeedProvider {
  readonly id: ProviderId;
  readonly kind: "jobs" | "events";
  readonly attribution: Attribution;
  readonly ttlSeconds: number;
  fetch(city: string, query: string, fetcher: typeof fetch, place?: PlacePoint | null): Promise<Opportunity[]>;
}

/** Standard geohash (base32), used by Ticketmaster's geoPoint filter. */
export function geohash(latitude: number, longitude: number, precision = 9): string {
  const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let lat: [number, number] = [-90, 90], lon: [number, number] = [-180, 180];
  let hash = "", bit = 0, ch = 0, even = true;
  while (hash.length < precision) {
    const range = even ? lon : lat, value = even ? longitude : latitude;
    const mid = (range[0] + range[1]) / 2;
    if (value >= mid) { ch = (ch << 1) | 1; range[0] = mid; } else { ch <<= 1; range[1] = mid; }
    even = !even;
    if (++bit === 5) { hash += base32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

type Env = Record<string, string | undefined>;
const iso = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

/** Ticketmaster Discovery API v2 (5,000 calls/day, 5 req/s on the default key). */
export function ticketmasterProvider(env: Env, timeoutMs = 5000): FeedProvider | null {
  const key = env.TICKETMASTER_API_KEY?.trim();
  if (!key) return null;
  const country = (env.TICKETMASTER_COUNTRY_CODE ?? "DE").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return null;
  return {
    id: "ticketmaster", kind: "events", ttlSeconds: 1800,
    attribution: { id: "ticketmaster", label: "Event data from Ticketmaster", url: "https://www.ticketmaster.com" },
    async fetch(city, query, fetcher, place) {
      const params = new URLSearchParams({
        apikey: key, countryCode: place?.countryCode ?? country, size: "20", sort: "date,asc",
        startDateTime: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      });
      // Ticketmaster names cities in its own language ("Munich", not "München"),
      // so a known place is searched by position: within 10 km of its centre.
      if (place) {
        params.set("geoPoint", geohash(place.latitude, place.longitude));
        params.set("radius", "10");
        params.set("unit", "km");
      } else {
        params.set("city", city);
      }
      if (query) params.set("keyword", query);
      const res = await fetchWithTimeout(fetcher, `https://app.ticketmaster.com/discovery/v2/events.json?${params}`, {
        headers: { Accept: "application/json" },
      }, timeoutMs);
      if (!res.ok) throw new Error(`ticketmaster ${res.status}`);
      const data = await res.json() as { _embedded?: { events?: unknown[] } };
      return (data._embedded?.events ?? []).slice(0, 20).flatMap((raw): Opportunity[] => {
        const e = raw as Record<string, any>;
        const url = safeUrl(e.url, /^(?:[a-z0-9-]+\.)*(?:ticketmaster\.(?:de|com|co\.uk|at|ch|nl|be|fr|es|it|ie|pl|dk|se|no|fi)|livenation\.(?:de|com|co\.uk))$/);
        const title = cleanText(e.name, 140);
        if (!url || !title || typeof e.id !== "string") return [];
        const venue = e._embedded?.venues?.[0] ?? {};
        // Ticketmaster may omit a venue name, or send `place` instead of a venue
        // (Discovery v2 docs); fall back rather than show a blank venue line.
        const place = e.place ?? {};
        return [{
          id: `ticketmaster:${cleanText(e.id, 64)}`, source: "ticketmaster", title,
          subtitle: cleanText(venue.name, 120) || cleanText(place.name, 120) || cleanText(venue.address?.line1, 120) || cleanText(place.address?.line1, 120),
          location: cleanText(venue.city?.name, 80) || cleanText(place.city?.name, 80) || city,
          startsAt: iso(e.dates?.start?.dateTime) ?? (typeof e.dates?.start?.localDate === "string" ? cleanText(e.dates.start.localDate, 10) : null),
          postedAt: null, url,
        }];
      });
    },
  };
}

/**
 * Adzuna job search. The trial key allows 25 calls; the Standard plan covers
 * public listings only. Gismate shows jobs to signed-in students, which needs a
 * separate commercial licence (Adzuna, 26 Nov 2026; docs/PROVIDER_DECISIONS.md),
 * so the operator must also set ADZUNA_COMMERCIAL_LICENSE=confirmed.
 */
export function adzunaProvider(env: Env, timeoutMs = 5000): FeedProvider | null {
  const appId = env.ADZUNA_APP_ID?.trim(), appKey = env.ADZUNA_APP_KEY?.trim();
  if (!appId || !appKey || env.ADZUNA_COMMERCIAL_LICENSE !== "confirmed") return null;
  const country = (env.ADZUNA_COUNTRY ?? "de").trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(country)) return null;
  return {
    id: "adzuna", kind: "jobs", ttlSeconds: 1800,
    attribution: { id: "adzuna", label: "Jobs by Adzuna", url: `https://www.adzuna.${country === "gb" ? "co.uk" : country}` },
    async fetch(city, query, fetcher) {
      const params = new URLSearchParams({
        app_id: appId, app_key: appKey, results_per_page: "20", what: query || "werkstudent", where: city,
        // Student-relevant, current ads only: newest first, nothing older than 30 days.
        max_days_old: "30", sort_by: "date", "content-type": "application/json",
      });
      const res = await fetchWithTimeout(fetcher, `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`, {
        headers: { Accept: "application/json" },
      }, timeoutMs);
      if (!res.ok) throw new Error(`adzuna ${res.status}`);
      const data = await res.json() as { results?: unknown[] };
      return (data.results ?? []).slice(0, 20).flatMap((raw): Opportunity[] => {
        const j = raw as Record<string, any>;
        const url = safeUrl(j.redirect_url, /^(?:[a-z0-9-]+\.)*adzuna\.(?:de|com|co\.uk|at|fr|nl|it|es|pl|ch|be)$/);
        const title = cleanText(j.title, 140);
        if (!url || !title || (typeof j.id !== "string" && typeof j.id !== "number")) return [];
        return [{
          id: `adzuna:${cleanText(String(j.id), 64)}`, source: "adzuna", title,
          subtitle: cleanText(j.company?.display_name, 120), location: cleanText(j.location?.display_name, 80) || city,
          startsAt: null, postedAt: iso(j.created), url,
        }];
      });
    },
  };
}

/**
 * Bundesagentur für Arbeit Jobsuche. The BA declined a data partnership for
 * Gismate's current use (26 Nov 2026; docs/PROVIDER_DECISIONS.md). It stays off
 * unless the operator sets BA_JOBSUCHE_ENABLED=true after new written approval.
 */
export function bundesagenturProvider(env: Env, timeoutMs = 5000): FeedProvider | null {
  if (env.BA_JOBSUCHE_ENABLED !== "true") return null;
  return {
    id: "bundesagentur", kind: "jobs", ttlSeconds: 3600,
    attribution: { id: "bundesagentur", label: "Quelle: Bundesagentur für Arbeit", url: "https://www.arbeitsagentur.de/jobsuche/" },
    async fetch(city, query, fetcher) {
      const params = new URLSearchParams({
        was: query || "Werkstudent", wo: city, umkreis: "25", size: "20", page: "1", veroeffentlichtseit: "30",
      });
      const res = await fetchWithTimeout(fetcher,
        `https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs?${params}`, {
          headers: { Accept: "application/json", "X-API-Key": "jobboerse-jobsuche" },
        }, timeoutMs);
      if (!res.ok) throw new Error(`bundesagentur ${res.status}`);
      const data = await res.json() as { stellenangebote?: unknown[] };
      return (data.stellenangebote ?? []).slice(0, 20).flatMap((raw): Opportunity[] => {
        const j = raw as Record<string, any>;
        // v4 names it refnr; the newer /pc/v6 shape names it referenznummer.
        const rawRef = j.refnr ?? j.referenznummer;
        const ref = typeof rawRef === "string" && /^[A-Za-z0-9-]{4,64}$/.test(rawRef) ? rawRef : null;
        const title = cleanText(j.titel ?? j.beruf, 140);
        if (!ref || !title) return [];
        // Always the official BA detail page: employer-supplied externeUrl values are unvetted.
        const url = `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(ref)}`;
        return [{
          id: `bundesagentur:${ref}`, source: "bundesagentur", title,
          subtitle: cleanText(j.arbeitgeber, 120), location: cleanText(j.arbeitsort?.ort, 80) || city,
          startsAt: null, postedAt: iso(j.aktuelleVeroeffentlichungsdatum ?? j.modifikationsTimestamp), url,
        }];
      });
    },
  };
}

export const GEONAMES_ATTRIBUTION: Attribution = {
  id: "geonames", label: "City data © GeoNames (CC BY 4.0)", url: "https://www.geonames.org/",
};

/**
 * Gismate Location Engine: GeoNames data in our own database, searched by
 * public.geo_city_search (service_role only). `search` is that RPC call. Rows
 * are re-validated here so a bad row can never reach a student.
 */
export function geonamesLookup(search: (query: string) => Promise<{ data: unknown; error: unknown }>) {
  return async (query: string): Promise<CityCandidate[]> => {
    const { data, error } = await search(query);
    if (error || !Array.isArray(data)) throw new Error("geonames 503");
    return data.slice(0, 10).flatMap((raw): CityCandidate[] => {
      const r = raw as Record<string, unknown>;
      const name = cleanText(r.name, 120), countryCode = typeof r.countryCode === "string" && /^[A-Z]{2}$/.test(r.countryCode) ? r.countryCode : "";
      const lat = Number(r.latitude), lon = Number(r.longitude), id = Number(r.geonameId);
      if (!name || !countryCode || !Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isInteger(id)) return [];
      return [{
        name, region: cleanText(r.region, 160), district: cleanText(r.district, 120), country: cleanText(r.country, 80), countryCode,
        latitude: lat, longitude: lon, population: Number.isFinite(Number(r.population)) ? Number(r.population) : 0, geonameId: id,
        exact: r.exact === true,
      }];
    });
  };
}

export const NOMINATIM_ATTRIBUTION: Attribution = {
  id: "nominatim", label: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright",
};

/**
 * OpenStreetMap Nominatim city lookup. Policy: identify the application,
 * max 1 request/second (enforced in the database), cache results, no
 * autocomplete (the app calls this only when the student presses Save).
 */
export function nominatimLookup(env: Env, timeoutMs = 5000) {
  const contact = env.STUORA_NOMINATIM_CONTACT?.trim();
  if (!contact || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return null;
  return async (query: string, fetcher: typeof fetch): Promise<CityCandidate[]> => {
    const params = new URLSearchParams({
      q: query, format: "jsonv2", addressdetails: "1", limit: "5", featureType: "settlement", "accept-language": "en",
      email: contact,
    });
    const res = await fetchWithTimeout(fetcher, `https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { Accept: "application/json", "User-Agent": `Stuora/0.1 (student platform; ${contact})` },
    }, timeoutMs);
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    const rows = await res.json() as unknown[];
    const seen = new Set<string>();
    return (Array.isArray(rows) ? rows : []).flatMap((raw): CityCandidate[] => {
      const r = raw as Record<string, any>;
      const a = r.address ?? {};
      const name = cleanText(a.city ?? a.town ?? a.village ?? a.municipality ?? r.name, 80);
      const countryCode = typeof a.country_code === "string" && /^[a-z]{2}$/i.test(a.country_code) ? a.country_code.toUpperCase() : "";
      if (!name || !/^[A-Z]{2}$/.test(countryCode)) return [];
      const key = `${name.toLowerCase()}|${countryCode}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ name, region: cleanText(a.state ?? a.county, 80), country: cleanText(a.country, 80), countryCode }];
    });
  };
}

/**
 * Photon (photon.komoot.io): OpenStreetMap-based geocoder, no key, fair use.
 * Used as a fallback because the public Nominatim server refuses (HTTP 403)
 * many shared cloud IP ranges, including Edge Function egress.
 */
export function photonLookup(env: Env, timeoutMs = 5000) {
  const contact = env.STUORA_NOMINATIM_CONTACT?.trim();
  const agent = contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? `Stuora/0.1 (student platform; ${contact})` : "Stuora/0.1 (student platform)";
  return async (query: string, fetcher: typeof fetch): Promise<CityCandidate[]> => {
    const params = new URLSearchParams({ q: query, limit: "8", lang: "en" });
    for (const tag of ["place:city", "place:town", "place:village", "place:municipality"]) params.append("osm_tag", tag);
    const res = await fetchWithTimeout(fetcher, `https://photon.komoot.io/api/?${params}`, {
      headers: { Accept: "application/json", "User-Agent": agent },
    }, timeoutMs);
    if (!res.ok) throw new Error(`photon ${res.status}`);
    const data = await res.json() as { features?: unknown[] };
    const seen = new Set<string>();
    return (Array.isArray(data.features) ? data.features : []).flatMap((raw): CityCandidate[] => {
      const p = ((raw as Record<string, any>)?.properties ?? {}) as Record<string, any>;
      const name = cleanText(p.name, 80);
      const countryCode = typeof p.countrycode === "string" && /^[a-z]{2}$/i.test(p.countrycode) ? p.countrycode.toUpperCase() : "";
      if (!name || !/^[A-Z]{2}$/.test(countryCode)) return [];
      const key = `${name.toLowerCase()}|${countryCode}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ name, region: cleanText(p.state ?? p.county, 80), country: cleanText(p.country, 80), countryCode }];
    }).slice(0, 5);
  };
}

/** Remembers that Nominatim refused this server, so we stop asking for a while. */
export interface NominatimBreaker { isOpen(): Promise<boolean>; trip(): Promise<void> }

/**
 * Nominatim first (when configured), then Photon. Both are OpenStreetMap data.
 * A 403/429 from Nominatim is a policy refusal of our egress IP, not a transient
 * error: the breaker skips Nominatim until it expires instead of paying a
 * refused round trip on every lookup.
 */
export function cityLookupChain(env: Env, breaker?: NominatimBreaker) {
  const nominatim = nominatimLookup(env);
  const photon = photonLookup(env);
  return async (query: string, fetcher: typeof fetch): Promise<CityCandidate[]> => {
    if (nominatim && !(await breaker?.isOpen().catch(() => false))) {
      try { return await nominatim(query, fetcher); }
      catch (err) {
        const reason = err instanceof Error && /^nominatim \d{3}$/.test(err.message) ? err.message : err instanceof Error ? err.name : "unknown";
        console.warn(JSON.stringify({ event: "provider_failed", provider: "nominatim", reason }));
        if (reason === "nominatim 403" || reason === "nominatim 429") await breaker?.trip().catch(() => {});
      }
    }
    return photon(query, fetcher);
  };
}

/**
 * Position of a saved feed city, only when the Location Engine matched its name
 * exactly. A prefix-only match ("Paris" → "Parisberg") returns null, so the feed
 * searches by name instead of around the wrong town.
 */
export function placeResolver(lookup: (query: string) => Promise<CityCandidate[]>) {
  return async (city: string): Promise<PlacePoint | null> => {
    const [best] = await lookup(city);
    if (!best?.exact || best.latitude === undefined || best.longitude === undefined) return null;
    return { latitude: best.latitude, longitude: best.longitude, countryCode: best.countryCode };
  };
}
