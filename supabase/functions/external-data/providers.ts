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
export type Attribution = { id: ProviderId | "nominatim"; label: string; url: string };
export type CityCandidate = { name: string; region: string; country: string; countryCode: string };

export interface FeedProvider {
  readonly id: ProviderId;
  readonly kind: "jobs" | "events";
  readonly attribution: Attribution;
  readonly ttlSeconds: number;
  fetch(city: string, query: string, fetcher: typeof fetch): Promise<Opportunity[]>;
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
    async fetch(city, query, fetcher) {
      const params = new URLSearchParams({
        apikey: key, city, countryCode: country, size: "20", sort: "date,asc",
        startDateTime: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      });
      if (query) params.set("keyword", query);
      const res = await fetchWithTimeout(fetcher, `https://app.ticketmaster.com/discovery/v2/events.json?${params}`, {
        headers: { Accept: "application/json" },
      }, timeoutMs);
      if (!res.ok) throw new Error(`ticketmaster ${res.status}`);
      const data = await res.json() as { _embedded?: { events?: unknown[] } };
      return (data._embedded?.events ?? []).slice(0, 20).flatMap((raw): Opportunity[] => {
        const e = raw as Record<string, any>;
        const url = safeUrl(e.url, /(^|\.)ticketmaster\.[a-z.]+$|(^|\.)livenation\.[a-z.]+$/);
        const title = cleanText(e.name, 140);
        if (!url || !title || typeof e.id !== "string") return [];
        const venue = e._embedded?.venues?.[0] ?? {};
        return [{
          id: `ticketmaster:${cleanText(e.id, 64)}`, source: "ticketmaster", title,
          subtitle: cleanText(venue.name, 120), location: cleanText(venue.city?.name, 80) || city,
          startsAt: iso(e.dates?.start?.dateTime) ?? (typeof e.dates?.start?.localDate === "string" ? cleanText(e.dates.start.localDate, 10) : null),
          postedAt: null, url,
        }];
      });
    },
  };
}

/**
 * Adzuna job search. Adzuna's free key is a 14-day EVALUATION licence; any
 * production use requires a signed commercial licence, so the operator must
 * also set ADZUNA_COMMERCIAL_LICENSE=confirmed.
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
        "content-type": "application/json",
      });
      const res = await fetchWithTimeout(fetcher, `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`, {
        headers: { Accept: "application/json" },
      }, timeoutMs);
      if (!res.ok) throw new Error(`adzuna ${res.status}`);
      const data = await res.json() as { results?: unknown[] };
      return (data.results ?? []).slice(0, 20).flatMap((raw): Opportunity[] => {
        const j = raw as Record<string, any>;
        const url = safeUrl(j.redirect_url, /(^|\.)adzuna\.[a-z.]+$/);
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
 * Bundesagentur für Arbeit Jobsuche. This endpoint is publicly reachable but
 * UNOFFICIAL: the BA publishes no API terms. It stays off unless the operator
 * sets BA_JOBSUCHE_ENABLED=true after confirming permission with the BA.
 */
export function bundesagenturProvider(env: Env, timeoutMs = 5000): FeedProvider | null {
  if (env.BA_JOBSUCHE_ENABLED !== "true") return null;
  return {
    id: "bundesagentur", kind: "jobs", ttlSeconds: 3600,
    attribution: { id: "bundesagentur", label: "Quelle: Bundesagentur für Arbeit", url: "https://www.arbeitsagentur.de/jobsuche/" },
    async fetch(city, query, fetcher) {
      const params = new URLSearchParams({ was: query || "Werkstudent", wo: city, umkreis: "25", size: "20", page: "1" });
      const res = await fetchWithTimeout(fetcher,
        `https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs?${params}`, {
          headers: { Accept: "application/json", "X-API-Key": "jobboerse-jobsuche" },
        }, timeoutMs);
      if (!res.ok) throw new Error(`bundesagentur ${res.status}`);
      const data = await res.json() as { stellenangebote?: unknown[] };
      return (data.stellenangebote ?? []).slice(0, 20).flatMap((raw): Opportunity[] => {
        const j = raw as Record<string, any>;
        const ref = typeof j.refnr === "string" && /^[A-Za-z0-9-]{4,64}$/.test(j.refnr) ? j.refnr : null;
        const title = cleanText(j.titel ?? j.beruf, 140);
        if (!ref || !title) return [];
        const url = safeUrl(j.externeUrl) ?? `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(ref)}`;
        return [{
          id: `bundesagentur:${ref}`, source: "bundesagentur", title,
          subtitle: cleanText(j.arbeitgeber, 120), location: cleanText(j.arbeitsort?.ort, 80) || city,
          startsAt: null, postedAt: iso(j.aktuelleVeroeffentlichungsdatum ?? j.modifikationsTimestamp), url,
        }];
      });
    },
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
      const countryCode = cleanText(a.country_code, 2).toUpperCase();
      if (!name || !/^[A-Z]{2}$/.test(countryCode)) return [];
      const key = `${name.toLowerCase()}|${countryCode}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ name, region: cleanText(a.state ?? a.county, 80), country: cleanText(a.country, 80), countryCode }];
    });
  };
}
