export class TimedLruCache<K, V> {
  private readonly map = new Map<K, { value: V; expiresAt: number }>();

  constructor(private readonly maxEntries: number, private readonly ttlMs: number) {}

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // refresh LRU order
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    const expiresAt = Date.now() + this.ttlMs;
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt });
    this.trim();
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  private trim() {
    while (this.map.size > this.maxEntries) {
      const firstKey = this.map.keys().next().value as K | undefined;
      if (firstKey === undefined) break;
      this.map.delete(firstKey);
    }
  }
}
