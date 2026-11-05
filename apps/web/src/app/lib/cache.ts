// In-memory cache of promises, so concurrent requests for the same upstream
// resource share one fetch. Failed loads are dropped right away.

const cache = new Map<string, { expires: number; value: Promise<unknown> }>();

export function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { expires: Date.now() + ttl, value });
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  if (cache.size > 2000) {
    const now = Date.now();
    for (const [k, v] of cache) if (v.expires <= now) cache.delete(k);
  }
  return value;
}

export function uncache(key: string) {
  cache.delete(key);
}
