export function abortError(): DOMException { return new DOMException('Asset request aborted', 'AbortError'); }
export function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) throw abortError(); }

/** Shared work is cancelled only after its last subscriber leaves. Failed work is retryable. */
export class SharedJobs<K, V> {
  private jobs = new Map<K, { controller: AbortController; promise: Promise<V>; users: number }>();
  private closed = false;
  run(key: K, work: (signal: AbortSignal) => Promise<V>, signal?: AbortSignal): Promise<V> {
    checkAbort(signal);
    if (this.closed) return Promise.reject(abortError());
    let job = this.jobs.get(key);
    if (!job) {
      const controller = new AbortController();
      job = { controller, users: 0, promise: Promise.resolve().then(() => work(controller.signal)) };
      this.jobs.set(key, job);
      const current = job;
      void job.promise.then(() => this.finish(key, current), () => this.finish(key, current));
    }
    job.users++;
    const current = job;
    return new Promise<V>((resolve, reject) => {
      let done = false;
      const finish = (action: () => void): void => {
        if (done) return;
        done = true; signal?.removeEventListener('abort', onAbort);
        current.controller.signal.removeEventListener('abort', onAbort);
        current.users--;
        if (!current.users && this.jobs.get(key) === current) {
          this.jobs.delete(key); current.controller.abort();
        }
        action();
      };
      const onAbort = (): void => finish(() => reject(abortError()));
      signal?.addEventListener('abort', onAbort, { once: true });
      current.controller.signal.addEventListener('abort', onAbort, { once: true });
      current.promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
    });
  }
  private finish(key: K, job: { controller: AbortController }): void {
    if (this.jobs.get(key) === job) this.jobs.delete(key);
  }
  dispose(): void {
    this.closed = true;
    for (const job of this.jobs.values()) job.controller.abort();
    this.jobs.clear();
  }
}

export class WorkQueue {
  private active = 0;
  private waiting: Array<() => void> = [];
  constructor(private concurrency: number, private maxQueued = 128) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new RangeError('Invalid asset concurrency');
  }
  async run<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
    checkAbort(signal);
    if (this.active >= this.concurrency) {
      if (this.waiting.length >= this.maxQueued) throw new Error('Asset queue full');
      await new Promise<void>((resolve, reject) => {
        const ready = (): void => { signal.removeEventListener('abort', cancel); resolve(); };
        const cancel = (): void => {
          const index = this.waiting.indexOf(ready);
          if (index >= 0) this.waiting.splice(index, 1);
          reject(abortError());
        };
        this.waiting.push(ready); signal.addEventListener('abort', cancel, { once: true });
      });
    } else this.active++;
    try { checkAbort(signal); return await work(); }
    finally {
      const next = this.waiting.shift();
      if (next) next(); else this.active--;
    }
  }
}
