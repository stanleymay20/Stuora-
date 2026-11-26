// Deterministic, privacy-preserving intent routing for Stuora Bot.
// This parser is not a generative language model. It never invents results.
// A byte-identical copy lives in supabase/functions/_shared/intent.ts for the
// server-side AI gateway; a Deno parity test keeps the two in sync.
export type BotDomain = 'housing' | 'marketplace' | 'jobs' | 'events' | 'trips' | 'groups';
export type BotIntent = {
  domain: BotDomain | null;
  city: string | null;
  maxPriceCents: number | null;
  search: string | null;
};

// Extract city candidates from student-supplied words; never use a fixed city
// whitelist. Gen-3 audit D-16: the capture stops at the next "in/near/around"
// so "jobs in tech in Munich" yields "tech" and "Munich", and the LAST
// plausible candidate wins; phrases like "near campus" or "in my city" are
// rejected so the student's selected city is used instead.
const cityPattern = /\b(?:in|near|around)\s+([\p{L}\p{M}][\p{L}\p{M} .'’()-]{1,77}?)(?=\s+(?:in|near|around|under|below|less than|up to|max(?:imum)?|budget|with|for|from|this|next|today|tomorrow)\b|[!?.,;]|$)/giu;
const NOT_A_CITY = new Set([
  'campus', 'the campus', 'uni', 'university', 'the university', 'college', 'school', 'hochschule', 'the city',
  'city', 'my city', 'my area', 'my town', 'town', 'the area', 'area', 'here', 'me', 'my uni', 'my university',
  'centre', 'center', 'the centre', 'the center', 'city centre', 'city center', 'downtown', 'the library',
  'library', 'student housing', 'a flat', 'a room', 'the station', 'station', 'it', 'tech', 'it jobs', 'marketing',
  'finance', 'sales', 'design', 'engineering', 'retail', 'hospitality', 'germany', 'europe',
]);
export function isPlausibleCity(candidate: string | null | undefined): candidate is string {
  if (!candidate) return false;
  const value = candidate.trim().replace(/\s+/g, ' ');
  if (value.length < 2 || value.length > 80) return false;
  const lower = value.toLowerCase();
  if (NOT_A_CITY.has(lower)) return false;
  if (/^(my|the|a|an|our|your|this|that|near|in|around|at)\s/i.test(value) && !/^the hague$/i.test(value)) return false;
  return /^[\p{L}\p{M}][\p{L}\p{M} .,'’()-]*$/u.test(value);
}
export function extractCity(text: string): string | null {
  const candidates = [...text.matchAll(cityPattern)].map(m => m[1].trim());
  for (let i = candidates.length - 1; i >= 0; i--) if (isPlausibleCity(candidates[i])) return candidates[i];
  return null;
}

const domains: [BotDomain, RegExp][] = [
  ['housing', /\b(housing|rent(?:al)?|flats?|apartments?|rooms?|dorms?|wg|accommodation|landlords?)\b/i],
  ['jobs', /\b(job|jobs|career|internship|employer|werkstudent|working.student|part.time work|vacancy)\b/i],
  ['marketplace', /\b(marketplace|buy|sell|second.hand|furniture|bicycle|bike|used item|laptop)\b/i],
  ['groups', /\b(group|groups|club|study circle|student communit|meet students|interest group)\b/i],
  ['events', /\b(event|events|concert|workshop|meetup|happening)\b/i],
  ['trips', /\b(trip|trips|travel|excursion|outing|weekend away)\b/i],
];

/** Normalise "€1.200,50", "1,200", "650" to euros; null when ambiguous. */
export function parseEuroAmount(amount: string): number | null {
  const compact = amount.replace(/ /g, '');
  const grouped = /^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?$/.test(compact);
  const decimalPart = grouped ? compact.match(/[.,]\d{1,2}$/) : null;
  const normalized = grouped
    ? compact.slice(0, decimalPart ? -decimalPart[0].length : undefined).replace(/[.,]/g, '') +
      (decimalPart ? '.' + decimalPart[0].slice(1) : '')
    : compact.replace(',', '.');
  const euros = compact ? Number(normalized) : NaN;
  return Number.isFinite(euros) && euros >= 0 && euros <= 1000000 ? euros : null;
}

export function parseBotIntent(text: string): BotIntent {
  const value = text.trim().slice(0, 280);
  const domain = domains.find(([, expression]) => expression.test(value))?.[0] ?? null;
  const city = extractCity(value);
  // Apply price only to listings where price has a well-defined meaning.
  // Interpret €1,200 / €1.200 as twelve hundred, and €1.200,50 as 1200.50.
  // Do not silently turn a thousands separator into a decimal rent ceiling.
  const budget = value.match(/(?:under|below|less than|up to|max(?:imum)?|budget(?: of)?)[\s:€]*(\d{1,3}(?:[., ]\d{3})+(?:[.,]\d{1,2})?|\d{1,7}(?:[.,]\d{1,2})?)/i);
  const euros = budget?.[1] ? parseEuroAmount(budget[1]) : null;
  const maxPriceCents = domain && ['housing', 'marketplace'].includes(domain) && euros !== null
    ? Math.round(euros * 100) : null;
  const quoted = value.match(/["“]([^"”]{2,60})["”]/);
  const search = quoted ? quoted[1].trim() : null;
  return { domain, city, maxPriceCents, search };
}

export function botWelcome(): string {
  return "I search genuine Stuora listings and student groups. Ask about housing, student jobs or study groups in your selected city. I will not invent offers, send messages or apply on your behalf.";
}

export function botGuidance(): string {
  return "I can help you find housing, student jobs, marketplace items, events, trips and groups already posted on Stuora. Tell me a category and optionally a city or maximum price.";
}

export function safeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function euroFromCents(cents: number | null, currency: string | null): string {
  if (cents === null || !Number.isFinite(cents)) return 'Price not provided';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'EUR' }).format(cents / 100); }
  catch { return 'Price unavailable'; }
}
