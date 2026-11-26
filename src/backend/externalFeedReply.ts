export type FeedKind = 'jobs' | 'events';
export type Attribution = { id: string; label: string; url: string };
export type SourceStatus = Attribution & { status: 'ok' | 'error' };
export type Opportunity = {
  id: string; source: string; title: string; subtitle: string; location: string;
  startsAt: string | null; postedAt: string | null; url: string;
};
export type FeedReply = { items: Opportunity[]; sources: SourceStatus[] };

const providerHosts = {
  ticketmaster: /^(?:[a-z0-9-]+\.)*(?:ticketmaster\.(?:de|com|co\.uk|at|ch|nl|be|fr|es|it|ie|pl|dk|se|no|fi)|livenation\.(?:de|com|co\.uk))$/,
  adzuna: /^(?:[a-z0-9-]+\.)*adzuna\.(?:de|com|co\.uk|at|fr|nl|it|es|pl|ch|be)$/,
  bundesagentur: /^(?:www\.)?arbeitsagentur\.de$/,
};
const providers: Record<FeedKind, readonly (keyof typeof providerHosts)[]> = {
  events: ['ticketmaster'],
  jobs: ['adzuna', 'bundesagentur'],
};
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;
const nonEmpty = (value: unknown, max: number): value is string =>
  text(value, max) && value.trim().length > 0;
const date = (value: unknown): value is string | null =>
  value === null || (text(value, 50) && Number.isFinite(Date.parse(value)));

function isProvider(kind: FeedKind, value: unknown): value is keyof typeof providerHosts {
  return providers[kind].some(provider => provider === value);
}

export function safeExternalFeedUrl(source: string, value: unknown): string | null {
  if (!Object.hasOwn(providerHosts, source) || !nonEmpty(value, 2048)) return null;
  try {
    const url = new URL(value);
    const host = providerHosts[source as keyof typeof providerHosts];
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && host.test(url.hostname)
      ? url.href : null;
  } catch { return null; }
}

/** An invalid response is an error, never evidence that a real feed is empty. */
export function decodeExternalFeed(value: unknown, kind: FeedKind): FeedReply | null {
  if (!object(value) || !Array.isArray(value.sources) || !Array.isArray(value.items)
      || !value.sources.length || value.sources.length > providers[kind].length || value.items.length > 40) return null;
  const sources: SourceStatus[] = [];
  const sourceStatus = new Map<string, SourceStatus['status']>();
  for (const entry of value.sources) {
    if (!object(entry) || !isProvider(kind, entry.id) || !nonEmpty(entry.label, 140)
        || (entry.status !== 'ok' && entry.status !== 'error') || sourceStatus.has(entry.id)) return null;
    const url = safeExternalFeedUrl(entry.id, entry.url);
    if (!url) return null;
    sourceStatus.set(entry.id, entry.status);
    sources.push({ id: entry.id, label: entry.label, status: entry.status, url });
  }
  const items: Opportunity[] = [];
  const seen = new Set<string>();
  for (const entry of value.items) {
    if (!object(entry) || !isProvider(kind, entry.source) || sourceStatus.get(entry.source) !== 'ok'
        || !nonEmpty(entry.id, 100) || !entry.id.startsWith(`${entry.source}:`) || seen.has(entry.id)
        || !nonEmpty(entry.title, 140) || !text(entry.subtitle, 120) || !text(entry.location, 160)
        || !date(entry.startsAt) || !date(entry.postedAt)) return null;
    const url = safeExternalFeedUrl(entry.source, entry.url);
    if (!url) return null;
    seen.add(entry.id);
    items.push({
      id: entry.id, source: entry.source, title: entry.title, subtitle: entry.subtitle,
      location: entry.location, startsAt: entry.startsAt, postedAt: entry.postedAt, url,
    });
  }
  return { sources, items };
}

export function externalFeedOutcome(reply: FeedReply): 'unavailable' | 'partial' | 'empty' | 'results' {
  if (reply.sources.every(source => source.status === 'error')) return 'unavailable';
  if (reply.sources.some(source => source.status === 'error')) return 'partial';
  return reply.items.length ? 'results' : 'empty';
}
