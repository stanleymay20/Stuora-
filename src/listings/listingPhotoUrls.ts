import { useEffect, useState } from 'react';
import { supabase } from '../backend/supabase';
import { SessionScopedPhotoCache } from './photoSessionCache';

// Listing photos are student content. The Supabase database/Storage RLS remains
// the authority; frontend caching never grants authorization by itself.
const BUCKET = 'listing-media';
const TTL_SECONDS = 60 * 60;

function publicUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

const photos = new SessionScopedPhotoCache(async paths => {
  const { data, error } = await supabase.storage.from(BUCKET)
    .createSignedUrls(paths, TTL_SECONDS);
  if (error || !Array.isArray(data)) return new Map<string, string>();
  return new Map(
    data.filter(item => item.path && item.signedUrl && !item.error)
      .map(item => [item.path as string, item.signedUrl as string]),
  );
}, publicUrl);

export function resolveListingPhotoUrl(path: string): Promise<string | null> {
  return photos.resolve(path);
}

/** AuthProvider calls this synchronously BEFORE rendering a changed viewer.
 * Late replies from the old viewer are never cached or exposed afterward. */
export function clearListingPhotoUrls() {
  photos.clear();
}

export function useListingPhotoUrl(path: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<{ path: string | null; url: string | null }>(() => ({
    path: path ?? null,
    url: path ? photos.peek(path) : null,
  }));
  useEffect(() => {
    if (!path) {
      setResolved({ path: null, url: null });
      return;
    }
    let active = true;
    setResolved({ path, url: photos.peek(path) });
    void photos.resolve(path).then(next => {
      if (active) setResolved({ path, url: next });
    });
    return () => { active = false; };
  }, [path]);
  // A component reused for a different picture must never flash an old image.
  return resolved.path === (path ?? null) ? resolved.url : null;
}
