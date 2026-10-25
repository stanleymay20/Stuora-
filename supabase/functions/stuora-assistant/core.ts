// Stuora assistant core: an LLM may only PARSE the student's request. Every
// field it returns must be grounded in the student's own words, or it is
// discarded. The database search runs afterwards under the student's own JWT
// (RLS), and the answer text is generated deterministically from real rows,
// so the model can never invent a listing, price, partner or opportunity.
import { HttpError } from "../_shared/http.ts";
import {
  type BotDomain, botGuidance, euroFromCents, isPlausibleCity, parseBotIntent, parseEuroAmount,
} from "../_shared/intent.ts";
import { INTENT_DOMAINS, type LlmProvider } from "./providers.ts";

export type ResolvedIntent = { domain: BotDomain; city: string | null; maxPriceCents: number | null; search: string | null };
export type AssistantResult = { id: string; title: string; description: string; domain: BotDomain };
export type AssistantReply = {
  source: "groq" | "cloudflare" | "rules";
  sourceLabel: string;
  intent: ResolvedIntent | null;
  results: AssistantResult[];
  answer: string;
};
export interface AssistantDeps {
  consumeQuota(): Promise<boolean>;
  providers: LlmProvider[];
  fetcher: typeof fetch;
  search(intent: ResolvedIntent): Promise<AssistantResult[]>;
}

const fold = (value: string) => value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Every number the student actually typed, normalised to euros. */
export function numbersInQuery(query: string): number[] {
  const found = query.match(/\d{1,3}(?:[., ]\d{3})+(?:[.,]\d{1,2})?|\d{1,7}(?:[.,]\d{1,2})?/g) ?? [];
  return found.map(parseEuroAmount).filter((n): n is number => n !== null);
}

export type GroundedIntent = { domain: BotDomain | null; city: string | null; maxPriceCents: number | null; keywords: string | null };

/** Parse model JSON and keep only values the student's request supports. */
export function groundModelIntent(query: string, raw: string): GroundedIntent {
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object");
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  const q = fold(query);
  const domain = typeof parsed.domain === "string" && (INTENT_DOMAINS as readonly string[]).includes(parsed.domain)
    ? parsed.domain as BotDomain : null;
  const cityRaw = typeof parsed.city === "string" ? parsed.city.trim() : "";
  const city = cityRaw && isPlausibleCity(cityRaw) && q.includes(fold(cityRaw)) ? cityRaw : null;
  const price = typeof parsed.max_price_eur === "number" && Number.isFinite(parsed.max_price_eur) ? parsed.max_price_eur : null;
  const priced = price !== null && numbersInQuery(query).some(n => Math.abs(n - price) < 0.005)
    && (domain === "housing" || domain === "marketplace");
  let keywords: string | null = null;
  if (typeof parsed.keywords === "string") {
    const words = parsed.keywords.trim().split(/\s+/).filter(Boolean).slice(0, 5);
    if (words.length && words.every(w => q.includes(fold(w))) && words.join(" ").length <= 60) keywords = words.join(" ");
  }
  return { domain, city, maxPriceCents: priced ? Math.round(price! * 100) : null, keywords };
}

const CATEGORY: Record<BotDomain, string> = {
  housing: "housing", marketplace: "marketplace", jobs: "jobs", events: "events", trips: "trips", groups: "groups",
};

export function deterministicAnswer(intent: ResolvedIntent, count: number): string {
  const area = intent.city ? " in " + intent.city : "";
  const budget = intent.maxPriceCents !== null ? " within " + euroFromCents(intent.maxPriceCents, "EUR") : "";
  const plural = CATEGORY[intent.domain];
  return count
    ? `Here are ${count} real ${plural} results${area}${budget} from Stuora. Open the category for full details. Results can change.`
    : `No matching ${plural} were found${area}${budget}. Try another city or a broader search. I will not invent results.`;
}

export async function runAssistant(deps: AssistantDeps, rawQuery: unknown, rawSelectedCity: unknown): Promise<AssistantReply> {
  if (typeof rawQuery !== "string") throw new HttpError(400, "QUERY", "Ask a question");
  const query = rawQuery.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 280);
  if (query.length < 2) throw new HttpError(400, "QUERY", "Ask a question");
  const selectedCity = typeof rawSelectedCity === "string" && isPlausibleCity(rawSelectedCity) ? rawSelectedCity.trim() : null;
  if (!(await deps.consumeQuota())) throw new HttpError(429, "RATE_LIMIT", "You have reached the assistant limit. Try again later.");

  const rules = parseBotIntent(query);
  let grounded: GroundedIntent | null = null;
  let source: AssistantReply["source"] = "rules";
  let sourceLabel = "Keyword search";
  for (const provider of deps.providers) {
    try {
      grounded = groundModelIntent(query, await provider.extract(query, deps.fetcher));
      source = provider.id; sourceLabel = provider.label;
      break;
    } catch (err) {
      // Provider failure or unusable output: try the next provider, then rules.
      // Log only our own fixed reason strings / error class, never model text or keys.
      const reason = err instanceof Error && /^provider (status \d{3}|returned no content)$|^no JSON object$/.test(err.message)
        ? err.message : err instanceof Error ? err.name : "unknown";
      console.warn(JSON.stringify({ event: "provider_failed", provider: provider.id, reason }));
    }
  }
  const domain = grounded?.domain ?? rules.domain;
  if (!domain) return { source, sourceLabel, intent: null, results: [], answer: botGuidance() };
  const intent: ResolvedIntent = {
    domain,
    city: grounded?.city ?? rules.city ?? selectedCity,
    maxPriceCents: grounded?.maxPriceCents ?? rules.maxPriceCents,
    // Quoted text wins; model keywords only narrow marketplace item searches.
    search: rules.search ?? (domain === "marketplace" ? grounded?.keywords ?? null : null),
  };
  const results = (await deps.search(intent)).slice(0, 6);
  return { source, sourceLabel, intent, results, answer: deterministicAnswer(intent, results.length) };
}
