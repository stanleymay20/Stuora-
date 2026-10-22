// Typed client for the external-data and stuora-assistant Edge Functions.
// Keys stay server-side; the client only sends the signed-in user's JWT.
import { supabase } from './supabase';

export type Attribution = { id: string; label: string; url: string };
export type CityCandidate = { name: string; region: string; country: string; countryCode: string };
export type Opportunity = {
  id: string; source: string; title: string; subtitle: string; location: string;
  startsAt: string | null; postedAt: string | null; url: string;
};
export type FeedReply = { items: Opportunity[]; sources: (Attribution & { status: 'ok' | 'error' })[] };

export class ServiceError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export async function invokeFunction<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let code = 'UNAVAILABLE', message = 'This service is temporarily unavailable.';
    const ctx = (error as { context?: unknown }).context;
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
export const loadExternalFeed = (kind: 'jobs' | 'events', city: string, query: string) =>
  invokeFunction<FeedReply>('external-data', { action: 'feed', kind, city, query });
