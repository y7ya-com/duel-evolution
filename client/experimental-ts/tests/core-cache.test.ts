import { describe, expect, it, vi } from 'vitest';
import { BudgetCache } from '../src/core/cache';

function read<K, V>(cache: BudgetCache<K, V>, key: K): V | null {
  const lease = cache.acquire(key);
  if (!lease) return null;
  const value = lease.value;
  lease.release();
  return value;
}

describe('BudgetCache lifecycle and byte accounting', () => {
  it('evicts least recently acquired unleased entries while retaining live leases', () => {
    const destroy = vi.fn();
    const cache = new BudgetCache<string, string>(12, destroy);
    cache.insert('a', 'A', 4); cache.insert('b', 'B', 4); cache.insert('c', 'C', 4);
    const pinned = cache.acquire('a');
    expect(pinned?.value).toBe('A');
    expect(read(cache, 'b')).toBe('B');
    expect(cache.insert('d', 'D', 4)).toBe(true);
    expect(destroy.mock.calls).toEqual([['C']]);
    expect(read(cache, 'c')).toBeNull();
    expect(cache.bytes).toBe(12);
    pinned?.release();
    expect(cache.insert('e', 'E', 4)).toBe(true);
    expect(destroy.mock.calls).toEqual([['C'], ['A']]);
    cache.dispose();
    expect(destroy).toHaveBeenCalledTimes(5);
    expect(cache.bytes).toBe(0);
  });

  it('keeps an entry pinned until every independent lease releases exactly once', () => {
    const destroy = vi.fn();
    const cache = new BudgetCache<string, string>(4, destroy);
    cache.insert('a', 'A', 4);
    const first = cache.acquire('a');
    const second = cache.acquire('a');
    first?.release(); first?.release();
    expect(cache.insert('b', 'B', 4)).toBe(false);
    expect(cache.insert('a', 'replacement', 4)).toBe(false);
    expect(destroy).not.toHaveBeenCalled();
    expect(second?.value).toBe('A');
    second?.release(); second?.release();
    expect(cache.insert('b', 'B', 4)).toBe(true);
    expect(destroy.mock.calls).toEqual([['A']]);
    cache.dispose();
  });

  it('rejects capacity atomically even when some entries are available to evict', () => {
    const destroy = vi.fn();
    const cache = new BudgetCache<string, string>(10, destroy);
    cache.insert('loose', 'L', 3); cache.insert('pinned', 'P', 7);
    const pinned = cache.acquire('pinned');
    expect(cache.insert('new', 'N', 4)).toBe(false);
    expect(cache.bytes).toBe(10);
    expect(cache.size).toBe(2);
    expect(destroy).not.toHaveBeenCalled();
    // Preserve LRU order as well as values after a rejected insertion.
    pinned?.release();
    expect(cache.insert('new', 'N', 3)).toBe(true);
    expect(destroy.mock.calls).toEqual([['L']]);
    expect(read(cache, 'pinned')).toBe('P');
    cache.dispose();
  });

  it('leaves an existing value intact when its replacement cannot fit', () => {
    const destroy = vi.fn();
    const cache = new BudgetCache<string, string>(10, destroy);
    cache.insert('old', 'OLD', 2); cache.insert('loose', 'L', 1); cache.insert('pinned', 'P', 7);
    const pinned = cache.acquire('pinned');
    expect(cache.insert('old', 'NEW', 4)).toBe(false);
    expect(cache.bytes).toBe(10);
    expect(cache.size).toBe(3);
    expect(destroy).not.toHaveBeenCalled();
    expect(read(cache, 'old')).toBe('OLD');
    expect(read(cache, 'loose')).toBe('L');
    pinned?.release(); cache.dispose();
  });

  it('credits same-key replacement bytes before evicting other values', () => {
    const destroy = vi.fn();
    const cache = new BudgetCache<string, string>(10, destroy);
    cache.insert('a', 'A', 6); cache.insert('b', 'B', 4);
    expect(cache.insert('a', 'A2', 5)).toBe(true);
    expect(cache.bytes).toBe(9);
    expect(cache.size).toBe(2);
    expect(destroy.mock.calls).toEqual([['A']]);
    expect(cache.insert('a', 'A3', 8)).toBe(true);
    expect(cache.bytes).toBe(8);
    expect(cache.size).toBe(1);
    expect(destroy.mock.calls).toEqual([['A'], ['B'], ['A2']]);
    cache.dispose();
    expect(destroy.mock.calls).toEqual([['A'], ['B'], ['A2'], ['A3']]);
  });

  it('rejects oversized values without taking ownership of rejected values', () => {
    const destroy = vi.fn();
    const cache = new BudgetCache<string, string>(4, destroy);
    cache.insert('a', 'A', 4);
    expect(cache.insert('a', 'TOO BIG', 5)).toBe(false);
    expect(cache.insert('b', 'ALSO TOO BIG', 5)).toBe(false);
    expect(read(cache, 'a')).toBe('A');
    expect(cache.bytes).toBe(4);
    expect(destroy).not.toHaveBeenCalled();
    cache.dispose();
    expect(destroy.mock.calls).toEqual([['A']]);
  });

  it('handles zero-byte entries with a zero budget and exactly-once disposal', () => {
    const destroy = vi.fn();
    const cache = new BudgetCache<string, string>(0, destroy);
    expect(cache.insert('a', 'A', 0)).toBe(true);
    expect(cache.insert('b', 'B', 0)).toBe(true);
    expect(cache.insert('c', 'C', 1)).toBe(false);
    expect(cache.size).toBe(2);
    expect(cache.bytes).toBe(0);
    cache.dispose(); cache.dispose();
    expect(destroy.mock.calls).toEqual([['A'], ['B']]);
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid budget %s', budget => {
    expect(() => new BudgetCache(budget)).toThrow(RangeError);
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid allocation %s atomically', bytes => {
    const destroy = vi.fn();
    const cache = new BudgetCache<string, string>(4, destroy);
    cache.insert('a', 'A', 4);
    expect(() => cache.insert('a', 'INVALID', bytes)).toThrow(RangeError);
    expect(cache.bytes).toBe(4);
    expect(read(cache, 'a')).toBe('A');
    expect(destroy).not.toHaveBeenCalled();
    cache.dispose();
  });

  it('accounts for bytes at the maximum safe integer budget', () => {
    const cache = new BudgetCache<string, string>(Number.MAX_SAFE_INTEGER);
    cache.insert('a', 'A', Number.MAX_SAFE_INTEGER - 1); cache.insert('b', 'B', 1);
    expect(cache.bytes).toBe(Number.MAX_SAFE_INTEGER);
    const pinned = cache.acquire('a');
    expect(cache.insert('b', 'B2', 2)).toBe(false);
    expect(cache.bytes).toBe(Number.MAX_SAFE_INTEGER);
    pinned?.release(); cache.dispose();
    expect(cache.bytes).toBe(0);
  });

  it('cleans every entry once despite throwing destructors and outstanding leases', () => {
    const failures = [new Error('A'), new Error('C')];
    const destroyed: string[] = [];
    const cache = new BudgetCache<string, string>(3, value => {
      destroyed.push(value);
      if (value === 'A') throw failures[0];
      if (value === 'C') throw failures[1];
    });
    cache.insert('a', 'A', 1); cache.insert('b', 'B', 1); cache.insert('c', 'C', 1);
    const pinned = cache.acquire('b');
    let failure: unknown;
    try { cache.dispose(); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual(failures);
    expect(destroyed).toEqual(['A', 'C', 'B']);
    expect(cache.bytes).toBe(0);
    expect(cache.size).toBe(0);
    expect(cache.acquire('a')).toBeNull();
    expect(() => cache.insert('d', 'D', 1)).toThrow('Cache disposed');
    pinned?.release(); pinned?.release(); cache.dispose();
    expect(destroyed).toHaveLength(3);
  });

  it('keeps accounting consistent after an eviction destructor throws', () => {
    const destroyed: string[] = [];
    const cache = new BudgetCache<string, string>(4, value => {
      destroyed.push(value);
      if (value === 'A') throw new Error('destroy A');
    });
    cache.insert('a', 'A', 2); cache.insert('b', 'B', 2);
    expect(() => cache.insert('c', 'C', 4)).toThrow('destroy A');
    // Destructor failures propagate after partial mutation; callers retain the incoming value.
    expect(cache.bytes).toBe(2);
    expect(cache.size).toBe(1);
    expect(read(cache, 'a')).toBeNull();
    expect(read(cache, 'b')).toBe('B');
    expect(read(cache, 'c')).toBeNull();
    cache.dispose();
    expect(destroyed).toEqual(['A', 'B']);
  });

  it('survives 1000 rounds of lease pressure and eviction without duplicate cleanup', () => {
    const destroyed = new Map<number, number>();
    const accepted = new Set<number>();
    const cache = new BudgetCache<number, number>(8, value => {
      destroyed.set(value, (destroyed.get(value) ?? 0) + 1);
    });
    cache.insert(-1, -1, 2); accepted.add(-1);
    const pinned = cache.acquire(-1);
    for (let scene = 0; scene < 1000; scene++) {
      expect(cache.insert(scene, scene, 6)).toBe(true);
      accepted.add(scene);
      const lease = cache.acquire(scene);
      expect(lease?.value).toBe(scene);
      expect(cache.insert(1000 + scene, 1000 + scene, 1)).toBe(false);
      expect(cache.bytes).toBe(8);
      expect(cache.size).toBe(2);
      expect(pinned?.value).toBe(-1);
      expect(destroyed.has(-1)).toBe(false);
      lease?.release(); lease?.release();
    }
    pinned?.release(); pinned?.release(); cache.dispose(); cache.dispose();
    expect(cache.bytes).toBe(0);
    expect(cache.size).toBe(0);
    expect(destroyed.size).toBe(accepted.size);
    for (const value of accepted) expect(destroyed.get(value)).toBe(1);
  });

  // A destructor may synchronously close its owner; inserting afterward leaks the incoming value.
  it('does not retain an unreachable entry when an eviction destructor disposes the cache', () => {
    const destroyed: string[] = [];
    const cache = new BudgetCache<string, string>(4, value => {
      destroyed.push(value);
      if (value === 'A') cache.dispose();
    });
    cache.insert('a', 'A', 4);
    expect(cache.insert('b', 'B', 4)).toBe(false); // Rejection leaves B owned by its caller.
    cache.dispose();
    expect({ bytes: cache.bytes, size: cache.size, destroyed }).toEqual({
      bytes: 0, size: 0, destroyed: ['A'],
    });
  });

  it('never double-counts a NaN replacement as an additional eviction candidate', () => {
    const destroy = vi.fn();
    const cache = new BudgetCache<number, string>(10, destroy);
    cache.insert(NaN, 'OLD', 3); cache.insert(1, 'PINNED', 7);
    const pinned = cache.acquire(1);
    const result = cache.insert(NaN, 'NEW', 5);
    const actual = { result, bytes: cache.bytes, size: cache.size, destroyed: [...destroy.mock.calls] };
    pinned?.release(); cache.dispose();
    expect(actual).toEqual({ result: false, bytes: 10, size: 2, destroyed: [] });
  });
});
