// Deterministic, privacy-preserving intent routing for Stuora Bot.
// This parser is not a generative language model. It never invents results.
export type BotDomain = 'housing' | 'marketplace' | 'jobs' | 'events' | 'trips' | 'groups';
export type BotIntent = {
  domain: BotDomain | null;
  city: string | null;
  maxPriceCents: number | null;
  search: string | null;
};

const cities = ['Berlin', 'Potsdam', 'Brandenburg', 'Leipzig', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt', 'Dresden'];
const domains: [BotDomain, RegExp][] = [
  ['housing', /\b(housing|rent(?:al)?|flats?|apartments?|rooms?|dorms?|wg|accommodation|landlords?)\b/i],
  ['jobs', /\b(job|jobs|career|internship|employer|werkstudent|working.student|part.time work|vacancy)\b/i],
  ['marketplace', /\b(marketplace|buy|sell|second.hand|furniture|bicycle|bike|used item|laptop)\b/i],
  ['groups', /\b(group|groups|club|study circle|student communit|meet students|interest group)\b/i],
  ['events', /\b(event|events|concert|workshop|meetup|happening)\b/i],
  ['trips', /\b(trip|trips|travel|excursion|outing|weekend away)\b/i],
];

export function parseBotIntent(text: string): BotIntent {
  const value = text.trim().slice(0, 280);
  const domain = domains.find(([, expression]) => expression.test(value))?.[0] ?? null;
  const city = cities.find(name => new RegExp('\\b' + name + '\\b', 'i').test(value)) ?? null;
  // Apply price only to listings where price has a well-defined meaning.
  const budget = value.match(/(?:under|below|less than|up to|max(?:imum)?|budget(?: of)?)[\s:€]*(\d{1,7}(?:[.,]\d{1,2})?)/i);
  const rawPrice = budget ? Number(budget[1].replace(',', '.')) : NaN;
  const maxPriceCents = domain && ['housing', 'marketplace'].includes(domain) && Number.isFinite(rawPrice) && rawPrice >= 0
    ? Math.round(rawPrice * 100) : null;
  const quoted = value.match(/["“]([^"”]{2,60})["”]/);
  const search = quoted ? quoted[1].trim() : null;
  return { domain, city, maxPriceCents, search };
}

export function botWelcome(): string {
  return "I can search real Stuora listings and student groups. Try 'rooms in Berlin under €650', 'working-student jobs in Potsdam', or 'study groups in Berlin'. I will not invent offers or send messages for you.";
}

export function botGuidance(): string {
  return "I can help you find housing, student jobs, marketplace items, events, trips and groups already posted on Stuora. I currently use verified database search rather than a general-purpose AI model. Tell me a category and optionally a city or maximum price.";
}

export function safeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function euroFromCents(cents: number | null, currency: string | null): string {
  if (cents === null || !Number.isFinite(cents)) return 'Price not provided';
  try { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency || 'EUR' }).format(cents / 100); }
  catch { return 'Price unavailable'; }
}
