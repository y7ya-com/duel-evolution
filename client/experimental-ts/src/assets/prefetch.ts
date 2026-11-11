// Background prefetch at idle priority (live: lazyfs.js prefetches the menu and deck-editor regions and the
// neighbouring maps while the player stands still). One task at a time, each started from an idle callback so it never
// competes with a scene's own loads; `urgent` tasks (a duel about to start) go first. Keys run once per session.
export type IdleRequest = (run: () => void) => () => void;
export type PrefetchTask = (signal: AbortSignal) => Promise<unknown>;

/** requestIdleCallback where the browser has it (Safari: a 200 ms timer). Returns a cancel. */
export const browserIdle: IdleRequest = run => {
  const g = globalThis as typeof globalThis & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (g.requestIdleCallback) { const id = g.requestIdleCallback(run, { timeout: 4000 }); return () => g.cancelIdleCallback?.(id); }
  const id = setTimeout(run, 200); return () => clearTimeout(id);
};

interface Queued { key: string; task: PrefetchTask; urgent: boolean }
export class IdlePrefetcher {
  private readonly queue: Queued[] = [];
  private readonly seen = new Set<string>();
  private cancelIdle: (() => void) | null = null;
  private running: AbortController | null = null;
  private closed = false;
  private paused = 0;
  /** Settled tasks (tests and the dev log). */
  done = 0; failed = 0;
  constructor(private readonly idle: IdleRequest = browserIdle, private readonly maxQueue = 2000) {}
  get pending(): number { return this.queue.length + (this.running ? 1 : 0); }
  has(key: string): boolean { return this.seen.has(key); }
  /** Queues a task unless this key already ran or is queued. Returns whether it was queued. */
  schedule(key: string, task: PrefetchTask, options: { urgent?: boolean } = {}): boolean {
    if (this.closed || this.seen.has(key) || this.queue.length >= this.maxQueue) return false;
    this.seen.add(key);
    const item = { key, task, urgent: options.urgent === true };
    if (item.urgent) { const at = this.queue.findIndex(q => !q.urgent); this.queue.splice(at < 0 ? this.queue.length : at, 0, item); }
    else this.queue.push(item);
    this.pump();
    return true;
  }
  /** Foreground work (a scene loading) holds the queue; the running task finishes, nothing new starts. */
  hold(): () => void {
    this.paused++;
    let held = true;
    return () => { if (!held) return; held = false; this.paused--; this.pump(); };
  }
  /** Drops queued tasks whose key starts with prefix (left a scene: its neighbours change); they may be queued again. */
  cancel(prefix = ''): void {
    for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i]!.key.startsWith(prefix)) { this.seen.delete(this.queue[i]!.key); this.queue.splice(i, 1); }
  }
  private pump(): void {
    if (this.closed || this.running || this.cancelIdle || this.paused || !this.queue.length) return;
    this.cancelIdle = this.idle(() => { this.cancelIdle = null; this.next(); });
  }
  private next(): void {
    if (this.closed || this.running || this.paused) return;
    const item = this.queue.shift(); if (!item) return;
    const controller = new AbortController(); this.running = controller;
    let work: Promise<unknown>;
    try { work = item.task(controller.signal); } catch (error) { work = Promise.reject(error); }
    void work.then(() => { this.done++; }, () => { this.failed++; this.seen.delete(item.key); })
      .finally(() => { if (this.running === controller) this.running = null; this.pump(); });
  }
  dispose(): void {
    this.closed = true; this.queue.length = 0;
    this.cancelIdle?.(); this.cancelIdle = null;
    this.running?.abort(); this.running = null;
  }
}

/** Which archive art each scene loaded last time (per asset build), so the next session can warm a scene before the
 * player opens it. Bounded; kept in localStorage; stale paths only cost a failed prefetch. */
export class SceneManifest {
  private readonly scenes = new Map<string, Set<string>>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly storageKey: string, private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null, private readonly perScene = 300) {
    try {
      const raw: unknown = JSON.parse(storage?.getItem(storageKey) ?? '{}');
      if (raw && typeof raw === 'object') for (const [scene, paths] of Object.entries(raw)) {
        if (Array.isArray(paths)) this.scenes.set(scene, new Set(paths.filter((p): p is string => typeof p === 'string').slice(0, perScene)));
      }
    } catch { /* optional */ }
  }
  paths(scene: string): readonly string[] { return [...(this.scenes.get(scene) ?? [])]; }
  record(scene: string, path: string): void {
    let set = this.scenes.get(scene);
    if (!set) { set = new Set(); this.scenes.set(scene, set); }
    if (set.has(path) || set.size >= this.perScene) return;
    set.add(path);
    if (!this.saveTimer && this.storage) this.saveTimer = setTimeout(() => { this.saveTimer = null; this.save(); }, 2000);
  }
  save(): void {
    try { this.storage?.setItem(this.storageKey, JSON.stringify(Object.fromEntries([...this.scenes].map(([k, v]) => [k, [...v]])))); } catch { /* quota */ }
  }
}
