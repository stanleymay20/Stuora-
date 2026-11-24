import { useEffect, useState } from 'react';
import { supabase } from '../backend/supabase';

// Listing photos are student content. Once the listing-media bucket is
// private (migration 20261124120000), only a signed-in GISMA student can
// obtain a short-lived signed URL, and Storage checks the listing is visible
// to them. Until then the bucket is still public, so a path that cannot be
// signed falls back to its public URL. The same build therefore works before
// and after the storage switch.
const BUCKET = 'listing-media';
const TTL_SECONDS = 60 * 60;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type Cached = { url: string; expiresAt: number };
const cache = new Map<string, Cached>();
// Invalidate all signed responses from a previous auth session. A request can
// finish AFTER sign-out, so clearing the Map alone is insufficient.
let sessionEpoch = 0;
type PhotoBatch = { epoch: number; callbacks: Map<string, ((url: string | null) => void)[]> };
let pending: PhotoBatch | null = null;

function publicUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function flush(batch: PhotoBatch) {
  // An auth change may occur even before the queued signing request begins.
  if (batch.epoch !== sessionEpoch) {
    for (const resolvers of batch.callbacks.values()) for (const resolve of resolvers) resolve(null);
    return;
  }
  const paths = [...batch.callbacks.keys()];
  let signed: { path: string | null; signedUrl: string | null; error: string | null }[] = [];
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, TTL_SECONDS);
    if (!error && Array.isArray(data)) signed = data as typeof signed;
  } catch { /* offline or not signed in: fall back below */ }
  // A late response from a previously authenticated viewer may never repopulate
  // the cache or be displayed in a different viewer's session.
  if (batch.epoch !== sessionEpoch) {
    for (const resolvers of batch.callbacks.values()) for (const resolve of resolvers) resolve(null);
    return;
  }
  const byPath = new Map(signed.filter(s => s.path && s.signedUrl && !s.error).map(s => [s.path as string, s.signedUrl as string]));
  for (const [path, resolvers] of batch.callbacks) {
    const url = byPath.get(path);
    if (url) cache.set(path, { url, expiresAt: Date.now() + TTL_SECONDS * 1000 });
    for (const resolve of resolvers) resolve(url ?? publicUrl(path));
  }
}

export function resolveListingPhotoUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.expiresAt - REFRESH_MARGIN_MS > Date.now()) return Promise.resolve(hit.url);
  return new Promise(resolve => {
    if (!pending) {
      pending = { epoch: sessionEpoch, callbacks: new Map() };
      const batch = pending;
      // Collect every photo rendered in the same tick into one request.
      // An old timer must not clear a newer session's pending batch.
      setTimeout(() => { if (pending === batch) pending = null; void flush(batch); }, 0);
    }
    pending.callbacks.set(path, [...(pending.callbacks.get(path) ?? []), resolve]);
  });
}

/** Called BEFORE rendering a changed authenticated viewer, not in a later
 * React effect. Any old in-flight signed-URL response is invalidated. */
export function clearListingPhotoUrls() {
  sessionEpoch++;
  cache.clear();
  pending = null;
}

export function useListingPhotoUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    const hit = path ? cache.get(path) : undefined;
    return hit && hit.expiresAt - REFRESH_MARGIN_MS > Date.now() ? hit.url : null;
  });
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    let active = true;
    void resolveListingPhotoUrl(path).then(next => { if (active) setUrl(next); });
    return () => { active = false; };
  }, [path]);
  return url;
}
