/**
 * Signed listing-photo URLs are capabilities: anyone holding one can read the
 * object until it expires. Never reuse a URL or delayed signing response from
 * an earlier authenticated viewer.
 *
 * Pure (no React or Supabase dependencies) to support deterministic race tests.
 */
type CachedUrl = { url: string; expiresAt: number };
type Resolver = (value: string | null) => void;
type Batch = { epoch: number; callbacks: Map<string, Resolver[]> };

export class SessionScopedPhotoCache {
  private epoch = 0;
  private cache = new Map<string, CachedUrl>();
  private pending: Batch | null = null;

  constructor(
    private readonly sign: (paths: string[]) => Promise<Map<string, string>>,
    private readonly fallback: (path: string) => string,
    private readonly ttlMs: number = 60 * 60 * 1000,
    private readonly refreshMarginMs: number = 5 * 60 * 1000,
    private readonly now: () => number = () => Date.now(),
    private readonly schedule: (task: () => void) => void = task => { setTimeout(task, 0); },
  ) {}

  peek(path: string): string | null {
    const hit = this.cache.get(path);
    return hit && hit.expiresAt - this.refreshMarginMs > this.now() ? hit.url : null;
  }

  clear(): void {
    // Existing scheduled callbacks still resolve, but are forbidden to put
    // their old capability URL into the fresh session's cache.
    this.epoch++;
    this.cache.clear();
    this.pending = null;
  }

  resolve(path: string): Promise<string | null> {
    const hit = this.peek(path);
    if (hit) return Promise.resolve(hit);
    return new Promise(resolve => {
      if (!this.pending) {
        const batch: Batch = { epoch: this.epoch, callbacks: new Map() };
        this.pending = batch;
        this.schedule(() => {
          // An older timer cannot reset a newer session's queued batch.
          if (this.pending === batch) this.pending = null;
          void this.flush(batch);
        });
      }
      const callbacks = this.pending.callbacks;
      callbacks.set(path, [...(callbacks.get(path) ?? []), resolve]);
    });
  }

  private settle(batch: Batch, value: (path: string) => string | null): void {
    for (const [path, callbacks] of batch.callbacks) {
      const url = value(path);
      for (const resolve of callbacks) resolve(url);
    }
  }

  private async flush(batch: Batch): Promise<void> {
    if (batch.epoch !== this.epoch) {
      this.settle(batch, () => null);
      return;
    }

    let signed = new Map<string, string>();
    try {
      signed = await this.sign([...batch.callbacks.keys()]);
    } catch {
      // During migration while the bucket remains public, fallback works;
      // after privacy cutover, a public URL cannot grant private object access.
    }
    if (batch.epoch !== this.epoch) {
      this.settle(batch, () => null);
      return;
    }

    this.settle(batch, path => {
      const url = signed.get(path);
      if (url) {
        this.cache.set(path, { url, expiresAt: this.now() + this.ttlMs });
        return url;
      }
      return this.fallback(path);
    });
  }
}
