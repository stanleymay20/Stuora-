// Typed client for the external-data and stuora-assistant Edge Functions.
// Keys stay server-side; the client only sends the signed-in user's JWT.
import { supabase } from './supabase';
import { decodeExternalFeed, type Attribution, type FeedKind, type FeedReply } from './externalFeedReply';
export type { Attribution, FeedReply, Opportunity } from './externalFeedReply';

export type CityCandidate = { name: string; region: string; country: string; countryCode: string };

export class ServiceError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export async function invokeFunction<T>(fn: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body, signal, timeout: 14000 });
  if (error) {
    let code = 'UNAVAILABLE', message = 'This service is temporarily unavailable.';
    const ctx = (error as { context?: unknown }).context;
    // No HTTP response at all: network failure or the browser blocked it (CORS / origin).
    if (!(ctx instanceof Response)) code = 'NO_RESPONSE';
    if (ctx instanceof Response) {
      try {
        const payload = await ctx.json();
        if (typeof payload?.code === 'string') code = payload.code;
        if (typeof payload?.error === 'string' && payload.error.length < 160) message = payload.error;
      } catch { /* keep the generic message */ }
    }
    throw new ServiceError(code, message);
  }
  return data as T;
}

export const lookupCity = (query: string) =>
  invokeFunction<{ candidates: CityCandidate[]; attribution: Attribution }>('external-data', { action: 'city', query });
export async function loadExternalFeed(kind: FeedKind, city: string, query: string, signal?: AbortSignal): Promise<FeedReply> {
  const data = await invokeFunction<unknown>('external-data', { action: 'feed', kind, city, query }, signal);
  const feed = decodeExternalFeed(data, kind);
  if (!feed) throw new ServiceError('INVALID_FEED', 'External sources returned an unexpected response. Try again.');
  return feed;
}
