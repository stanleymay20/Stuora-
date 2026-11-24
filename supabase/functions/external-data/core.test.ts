import { strict as assert } from "node:assert";
import { type ExternalDeps, loadFeed, lookupCity } from "./core.ts";
import { adzunaProvider, bundesagenturProvider, nominatimLookup, ticketmasterProvider } from "./providers.ts";

type Call = { url: string; headers: Headers };
function fakeFetch(routes: Record<string, unknown>, calls: Call[]): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: new Headers(init.headers) });
    const host = new URL(url).hostname;
    if (!(host in routes)) return new Response("nope", { status: 500 });
    return new Response(JSON.stringify(routes[host]), { status: 200 });
  }) as typeof fetch;
}
function deps(over: Partial<ExternalDeps> = {}) {
  const cache = new Map<string, unknown>();
  const puts: string[] = [];
  let quota = 0, slots = 0;
  const d: ExternalDeps = {
    cacheGet: async (p, k) => cache.get(`${p}|${k}`) ?? null,
    cachePut: async (p, k, v, ttl) => { cache.set(`${p}|${k}`, v); puts.push(`${p}:${ttl}`); },
    consumeQuota: async () => { quota++; return true; },
    acquireNominatimSlot: async () => { slots++; return true; },
    feeds: [], cityLookup: null, fetcher: fetch, ...over,
  };
  return { d, puts, counts: () => ({ quota, slots }) };
}

const TM = {
  _embedded: { events: [
    { id: "E1", name: "<b>Uni Party</b>", url: "https://www.ticketmaster.de/event/E1",
      dates: { start: { dateTime: "2030-01-02T19:00:00Z" } }, _embedded: { venues: [{ name: "Halle", city: { name: "Köln" } }] } },
    { id: "E2", name: "Phish", url: "https://evil.example/steal", dates: { start: { localDate: "2030-01-01" } } },
    { id: "E3", name: "Early", url: "javascript:alert(1)" },
    { id: "E4", name: "Lookalike", url: "https://www.ticketmaster.evil.com/e" },
  ] },
};
const ADZ = { results: [
  { id: 99, title: "Werkstudent Data <script>x</script>", redirect_url: "https://www.adzuna.de/land/ad/99",
    company: { display_name: "ACME" }, location: { display_name: "Köln" }, created: "2026-10-20T10:00:00Z" },
  { id: 100, title: "Bad link", redirect_url: "http://www.adzuna.de/plain-http" },
  { id: 101, title: "Lookalike", redirect_url: "https://adzuna.de.evil.com/x" },
] };
const BA = { stellenangebote: [
  { refnr: "10001-1002716922-S", titel: "Werkstudent (m/w/d) IT", arbeitgeber: "Stadtwerke", arbeitsort: { ort: "Köln" },
    aktuelleVeroeffentlichungsdatum: "2026-10-21", externeUrl: "https://phish.example/apply" },
  { refnr: "../../etc", titel: "Traversal" },
] };

Deno.test("providers are off without explicit secrets and licence flags", () => {
  assert.equal(ticketmasterProvider({}), null);
  assert.equal(adzunaProvider({ ADZUNA_APP_ID: "a", ADZUNA_APP_KEY: "b" }), null, "trial keys alone are not enough");
  assert.ok(adzunaProvider({ ADZUNA_APP_ID: "a", ADZUNA_APP_KEY: "b", ADZUNA_COMMERCIAL_LICENSE: "confirmed" }));
  assert.equal(bundesagenturProvider({}), null);
  assert.equal(nominatimLookup({}), null, "Nominatim requires an identifying contact");
});

Deno.test("events and jobs are normalised, sanitised, attributed and cached", async () => {
  const calls: Call[] = [];
  const fetcher = fakeFetch({ "app.ticketmaster.com": TM, "api.adzuna.com": ADZ, "rest.arbeitsagentur.de": BA }, calls);
  const env = { TICKETMASTER_API_KEY: "tm", ADZUNA_APP_ID: "a", ADZUNA_APP_KEY: "b", ADZUNA_COMMERCIAL_LICENSE: "confirmed", BA_JOBSUCHE_ENABLED: "true" };
  const feeds = [ticketmasterProvider(env)!, adzunaProvider(env)!, bundesagenturProvider(env)!];
  const { d, puts, counts } = deps({ feeds, fetcher });
  const events = await loadFeed(d, "events", "Köln", "");
  assert.deepEqual(events.items.map(i => [i.title, i.url]), [["Uni Party", "https://www.ticketmaster.de/event/E1"]]);
  assert.deepEqual(events.sources.map(s => [s.id, s.status]), [["ticketmaster", "ok"]]);
  const jobs = await loadFeed(d, "jobs", "Köln", "werkstudent");
  assert.deepEqual(jobs.items.map(i => i.source).sort(), ["adzuna", "bundesagentur"]);
  const adz = jobs.items.find(i => i.source === "adzuna")!;
  assert.equal(adz.title, "Werkstudent Data x");
  const ba = jobs.items.find(i => i.source === "bundesagentur")!;
  assert.equal(ba.url, "https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1002716922-S");
  assert.ok(calls.find(c => c.url.includes("arbeitsagentur"))!.headers.get("X-API-Key") === "jobboerse-jobsuche");
  assert.deepEqual(puts.sort(), ["adzuna:1800", "bundesagentur:3600", "ticketmaster:1800"]);
  // Second identical request is served from cache without quota or network.
  const before = calls.length; const q = counts().quota;
  await loadFeed(d, "jobs", " köln ", "Werkstudent");
  assert.equal(calls.length, before);
  assert.equal(counts().quota, q);
});

Deno.test("a failing provider is reported, not fatal, and never cached", async () => {
  const fetcher = fakeFetch({ "api.adzuna.com": ADZ }, []);
  const env = { ADZUNA_APP_ID: "a", ADZUNA_APP_KEY: "b", ADZUNA_COMMERCIAL_LICENSE: "confirmed", BA_JOBSUCHE_ENABLED: "true" };
  const { d, puts } = deps({ feeds: [adzunaProvider(env)!, bundesagenturProvider(env)!], fetcher });
  const reply = await loadFeed(d, "jobs", "Köln", "");
  assert.deepEqual(reply.sources.map(s => [s.id, s.status]), [["adzuna", "ok"], ["bundesagentur", "error"]]);
  assert.deepEqual(puts, ["adzuna:1800"]);
});

Deno.test("input validation and disabled categories", async () => {
  const { d } = deps({ feeds: [ticketmasterProvider({ TICKETMASTER_API_KEY: "tm" })!] });
  await assert.rejects(loadFeed(d, "jobs", "Köln", ""), { code: "FEATURE_DISABLED" });
  await assert.rejects(loadFeed(d, "events", "near campus", ""), { code: "CITY" });
  await assert.rejects(loadFeed(d, "events", "Köln", "<script>"), { code: "QUERY" });
  await assert.rejects(loadFeed(d, "housing", "Köln", ""), { code: "KIND" });
});

Deno.test("city lookup identifies Stuora, respects the throttle and caches 30 days", async () => {
  const calls: Call[] = [];
  const rows = [
    { name: "Halle (Saale)", address: { city: "Halle (Saale)", state: "Sachsen-Anhalt", country: "Germany", country_code: "de" } },
    { name: "Halle", address: { city: "Halle (Saale)", country: "Germany", country_code: "de" } },
    { name: "Halle", address: { town: "Halle", state: "North Rhine-Westphalia", country: "Germany", country_code: "de" } },
  ];
  const lookup = nominatimLookup({ STUORA_NOMINATIM_CONTACT: "ops@stuora.example" })!;
  const { d, puts, counts } = deps({ cityLookup: lookup, fetcher: fakeFetch({ "nominatim.openstreetmap.org": rows }, calls) });
  const reply = await lookupCity(d, "Halle (Saale)");
  assert.deepEqual(reply.candidates.map(c => c.name), ["Halle (Saale)", "Halle"]);
  assert.equal(reply.attribution.label, "© OpenStreetMap contributors");
  assert.match(calls[0].headers.get("User-Agent")!, /^Stuora\/0\.1 .*ops@stuora\.example/);
  assert.deepEqual(puts, ["nominatim:2592000"]);
  await lookupCity(d, "halle (saale)");
  assert.equal(calls.length, 1, "served from cache");
  assert.deepEqual(counts(), { quota: 1, slots: 1 });
  const busy = deps({ cityLookup: lookup, acquireNominatimSlot: async () => false, fetcher: fakeFetch({}, []) });
  await assert.rejects(lookupCity(busy.d, "Köln"), { code: "BUSY" });
  await assert.rejects(lookupCity(deps().d, "Köln"), { code: "FEATURE_DISABLED" });
});

Deno.test("city lookup falls back to Photon when Nominatim refuses the server (403)", async () => {
  const { cityLookupChain } = await import("./providers.ts");
  const calls: string[] = [];
  const fetcher = (async (url: string) => {
    const host = new URL(url).hostname;
    calls.push(host);
    if (host === "nominatim.openstreetmap.org") return new Response("blocked", { status: 403 });
    return new Response(JSON.stringify({ features: [
      { properties: { name: "Halle (Saale)", state: "Saxony-Anhalt", country: "Germany", countrycode: "DE" } },
      { properties: { name: "Halle (Saale)", state: "Saxony-Anhalt", country: "Germany", countrycode: "DE" } },
      { properties: { name: "<b>Halle</b>", state: "North Rhine-Westphalia", country: "Germany", countrycode: "DE" } },
      { properties: { name: "Nowhere", countrycode: "XYZ" } },
    ] }), { status: 200 });
  }) as typeof fetch;
  const lookup = cityLookupChain({ STUORA_NOMINATIM_CONTACT: "ops@stuora.example" });
  const out = await lookup("Halle (Saale)", fetcher);
  assert.deepEqual(calls, ["nominatim.openstreetmap.org", "photon.komoot.io"]);
  assert.deepEqual(out.map(c => c.name), ["Halle (Saale)", "Halle"]);
  // Without a contact, Photon alone still works.
  calls.length = 0;
  await cityLookupChain({})("Köln", fetcher);
  assert.deepEqual(calls, ["photon.komoot.io"]);
});

Deno.test("a Nominatim 403 trips the breaker; later lookups go straight to Photon", async () => {
  const { cityLookupChain } = await import("./providers.ts");
  const calls: string[] = [];
  let status = 403;
  const fetcher = (async (url: string) => {
    const host = new URL(url).hostname;
    calls.push(host);
    if (host === "nominatim.openstreetmap.org") return new Response("x", { status });
    return new Response(JSON.stringify({ features: [{ properties: { name: "Köln", country: "Germany", countrycode: "DE" } }] }));
  }) as typeof fetch;
  let open = false;
  const breaker = { isOpen: async () => open, trip: async () => { open = true; } };
  const lookup = cityLookupChain({ STUORA_NOMINATIM_CONTACT: "ops@stuora.example" }, breaker);
  await lookup("Köln", fetcher);
  await lookup("Köln", fetcher);
  assert.deepEqual(calls, ["nominatim.openstreetmap.org", "photon.komoot.io", "photon.komoot.io"]);
  // A transient 5xx does not trip it; a failing breaker store never blocks lookups.
  open = false; status = 502; calls.length = 0;
  await lookup("Köln", fetcher);
  assert.equal(open, false);
  const broken = { isOpen: () => Promise.reject(new Error("db")), trip: () => Promise.reject(new Error("db")) };
  const out = await cityLookupChain({ STUORA_NOMINATIM_CONTACT: "ops@stuora.example" }, broken)("Köln", fetcher);
  assert.equal(out[0].name, "Köln");
});
