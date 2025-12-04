import { describe, expect, it } from 'vitest';
import { LruCache } from '../LruCache';

describe('LruCache', () => {
  it('stores entries, updates recency, and evicts least recently used items', () => {
    const cache = new LruCache<string, number>(3);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.size).toBe(3);
    expect(cache.keys()).toEqual(['c', 'b', 'a']);
    expect(cache.get('b')).toBe(2);
    expect(cache.keys()).toEqual(['b', 'c', 'a']);

    cache.set('d', 4);

    expect(cache.size).toBe(3);
    expect(cache.has('a')).toBe(false);
    expect(cache.keys()).toEqual(['d', 'b', 'c']);
  });

  it('supports deleting entries and clearing the cache', () => {
    const cache = new LruCache<string, string>(2);

    cache.set('x', '1');
    cache.set('y', '2');

    expect(cache.delete('x')).toBe(true);
    expect(cache.delete('missing')).toBe(false);
    expect(cache.keys()).toEqual(['y']);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.keys()).toEqual([]);
  });
});
