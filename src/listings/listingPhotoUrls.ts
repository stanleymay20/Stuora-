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
let pending: Map<string, ((url: string) => void)[]> | null = null;

function publicUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function flush(batch: Map<string, ((url: string) => void)[]>) {
  const paths = [...batch.keys()];
  let signed: { path: string | null; signedUrl: string | null; error: string | null }[] = [];
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, TTL_SECONDS);
    if (!error && Array.isArray(data)) signed = data as typeof signed;
  } catch { /* offline or not signed in: fall back below */ }
  const byPath = new Map(signed.filter(s => s.path && s.signedUrl && !s.error).map(s => [s.path as string, s.signedUrl as string]));
  for (const [path, resolvers] of batch) {
    const url = byPath.get(path);
    if (url) cache.set(path, { url, expiresAt: Date.now() + TTL_SECONDS * 1000 });
    for (const resolve of resolvers) resolve(url ?? publicUrl(path));
  }
}

export function resolveListingPhotoUrl(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit && hit.expiresAt - REFRESH_MARGIN_MS > Date.now()) return Promise.resolve(hit.url);
  return new Promise(resolve => {
    if (!pending) {
      pending = new Map();
      const batch = pending;
      // Collect every photo rendered in the same tick into one request.
      setTimeout(() => { pending = null; void flush(batch); }, 0);
    }
    pending.set(path, [...(pending.get(path) ?? []), resolve]);
  });
}

/** Signed sessions change who may load a photo: forget URLs on sign-in/out. */
export function clearListingPhotoUrls() { cache.clear(); }

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
