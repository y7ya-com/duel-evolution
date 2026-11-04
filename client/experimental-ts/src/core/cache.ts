export interface Lease<V> { readonly value: V; release(): void; }
interface Entry<V> { value: V; bytes: number; users: number; }

/** Byte-budgeted LRU. Live leases cannot be evicted; oversized allocations are refused. */
export class BudgetCache<K, V> {
  private entries = new Map<K, Entry<V>>();
  private used = 0;
  private closed = false;
  private inserting = false;
  constructor(readonly budget: number, private destroy: (value: V) => void = () => {}) {
    if (!Number.isSafeInteger(budget) || budget < 0) throw new RangeError('Invalid cache budget');
  }
  get bytes(): number { return this.used; }
  get size(): number { return this.entries.size; }
  acquire(key: K): Lease<V> | null {
    if (this.closed || this.inserting) return null;
    const e = this.entries.get(key);
    if (!e) return null;
    this.entries.delete(key); this.entries.set(key, e); e.users++;
    let active = true;
    return { value: e.value, release: () => { if (active) { active = false; e.users--; } } };
  }
  insert(key: K, value: V, bytes: number): boolean {
    if (this.closed) throw new Error('Cache disposed');
    if (this.inserting) return false;
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new RangeError('Invalid allocation size');
    if (bytes > this.budget) return false;
    const old = this.entries.get(key);
    if (old?.users) return false;
    // Plan eviction first, so a failed insertion never discards existing assets.
    let available = this.budget - this.used + (old?.bytes ?? 0);
    const evict: K[] = [];
    for (const [k, e] of this.entries) {
      if (available >= bytes) break;
      if (e !== old && !e.users) { evict.push(k); available += e.bytes; }
    }
    if (available < bytes) return false;
    this.inserting = true;
    try {
      for (const k of evict) {
        this.remove(k);
        if (this.closed) return false;
      }
      if (old) this.remove(key);
      if (this.closed) return false;
      this.entries.set(key, { value, bytes, users: 0 }); this.used += bytes;
      return true;
    } finally { this.inserting = false; }
  }
  private remove(key: K): void {
    const e = this.entries.get(key);
    if (!e) return;
    this.entries.delete(key); this.used -= e.bytes; this.destroy(e.value);
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    const errors: unknown[] = [];
    for (const key of [...this.entries.keys()]) { try { this.remove(key); } catch (e) { errors.push(e); } }
    if (errors.length) throw new AggregateError(errors, 'Cache cleanup failed');
  }
}
