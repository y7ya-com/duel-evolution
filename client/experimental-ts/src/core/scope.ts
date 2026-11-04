export type Cleanup = () => void;

/** Explicit owner for resources whose lifetime is shorter than the page. */
export class ResourceScope {
  private cleanups = new Set<Cleanup>();
  private controller = new AbortController();
  private closed = false;
  get signal(): AbortSignal { return this.controller.signal; }
  get disposed(): boolean { return this.closed; }
  get size(): number { return this.cleanups.size; }

  own(cleanup: Cleanup): Cleanup {
    if (this.closed) { cleanup(); return () => {}; }
    let active = true;
    const release = () => {
      if (!active) return;
      active = false;
      this.cleanups.delete(release);
      cleanup();
    };
    this.cleanups.add(release);
    return release;
  }

  child(): ResourceScope {
    const scope = new ResourceScope();
    const unlink = this.own(() => scope.dispose());
    scope.own(() => { this.cleanups.delete(unlink); });
    return scope;
  }

  listen(target: EventTarget, type: string, callback: EventListener, options?: AddEventListenerOptions): Cleanup {
    if (this.closed) return () => {};
    target.addEventListener(type, callback, options);
    return this.own(() => target.removeEventListener(type, callback, options));
  }

  timeout(callback: () => void, ms: number): Cleanup {
    if (this.closed) return () => {};
    const timer = setTimeout(() => { release(); if (!this.closed) callback(); }, ms);
    const release = this.own(() => clearTimeout(timer));
    return release;
  }

  interval(callback: () => void, ms: number): Cleanup {
    if (!Number.isFinite(ms) || ms <= 0) throw new RangeError('Invalid interval');
    if (this.closed) return () => {};
    const timer = setInterval(() => { if (!this.closed) callback(); }, ms);
    return this.own(() => clearInterval(timer));
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.controller.abort();
    const errors: unknown[] = [];
    for (const cleanup of [...this.cleanups].reverse()) {
      try { cleanup(); } catch (error) { errors.push(error); }
    }
    this.cleanups.clear();
    if (errors.length) throw new AggregateError(errors, 'Resource cleanup failed');
  }
}
