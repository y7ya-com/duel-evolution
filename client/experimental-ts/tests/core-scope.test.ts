import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceScope } from '../src/core/scope';

// Fake time makes every lifecycle and stress case reproducible.
afterEach(() => { vi.useRealTimers(); });

describe('ResourceScope ownership', () => {
  it('releases once, in reverse order, and aborts before cleanup', () => {
    const scope = new ResourceScope();
    const calls: string[] = [];
    scope.signal.addEventListener('abort', () => calls.push('abort'));
    scope.own(() => { expect(scope.disposed).toBe(true); calls.push('first'); });
    const release = scope.own(() => calls.push('released'));
    scope.own(() => calls.push('last'));
    release(); release();
    expect(scope.size).toBe(2);
    scope.dispose(); scope.dispose(); release();
    expect(calls).toEqual(['released', 'abort', 'last', 'first']);
    expect(scope.size).toBe(0);
    expect(scope.signal.aborted).toBe(true);
  });

  it('aggregates cleanup exceptions while releasing every other resource exactly once', () => {
    const scope = new ResourceScope();
    const first = new Error('first');
    const second = new Error('second');
    const calls: string[] = [];
    scope.own(() => { calls.push('first'); throw first; });
    scope.own(() => calls.push('middle'));
    scope.own(() => { calls.push('second'); throw second; });
    let failure: unknown;
    try { scope.dispose(); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([second, first]);
    expect(calls).toEqual(['second', 'middle', 'first']);
    expect(scope.size).toBe(0);
    expect(scope.signal.aborted).toBe(true);
    expect(() => scope.dispose()).not.toThrow();
  });

  it('forgets an explicitly released cleanup even when it throws', () => {
    const scope = new ResourceScope();
    const cleanup = vi.fn(() => { throw new Error('release'); });
    const release = scope.own(cleanup);
    expect(release).toThrow('release');
    expect(scope.size).toBe(0);
    expect(() => { release(); scope.dispose(); }).not.toThrow();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('detaches a disposed child from its parent and recursively disposes descendants', () => {
    const parent = new ResourceScope();
    const child = parent.child();
    const grandchild = child.child();
    const cleanup = vi.fn();
    grandchild.own(cleanup);
    expect(parent.size).toBe(1);
    child.dispose();
    expect(parent.size).toBe(0);
    expect(child.size).toBe(0);
    expect(grandchild.disposed).toBe(true);
    parent.dispose(); child.dispose(); grandchild.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('detaches throwing children and continues sibling cleanup', () => {
    const parent = new ResourceScope();
    const healthy = parent.child();
    const broken = parent.child();
    const cleanup = vi.fn();
    healthy.own(cleanup);
    broken.own(() => { throw new Error('child'); });
    expect(() => parent.dispose()).toThrow(AggregateError);
    expect(parent.size).toBe(0);
    expect(broken.size).toBe(0);
    expect(healthy.disposed).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('immediately cleans resources registered after disposal, including children', () => {
    const scope = new ResourceScope();
    scope.dispose();
    const cleanup = vi.fn();
    const release = scope.own(cleanup);
    release();
    const child = scope.child();
    expect(child.disposed).toBe(true);
    expect(child.signal.aborted).toBe(true);
    expect(scope.size).toBe(0);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('handles cleanup registration and sibling release during disposal', () => {
    const scope = new ResourceScope();
    const calls: string[] = [];
    const release = scope.own(() => calls.push('first'));
    scope.own(() => {
      release();
      scope.own(() => calls.push('late'));
      scope.dispose();
    });
    scope.dispose();
    expect(calls).toEqual(['first', 'late']);
    expect(scope.size).toBe(0);
  });
});

describe('ResourceScope scheduled work and scene churn', () => {
  it('cancels a pending timeout and interval on disposal', () => {
    vi.useFakeTimers();
    const scope = new ResourceScope();
    const callback = vi.fn();
    scope.timeout(callback, 100);
    scope.interval(callback, 10);
    expect(vi.getTimerCount()).toBe(2);
    scope.dispose();
    vi.advanceTimersByTime(1000);
    expect(callback).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('detaches an expired timeout before invoking a throwing callback', () => {
    vi.useFakeTimers();
    const scope = new ResourceScope();
    const callback = vi.fn(() => { expect(scope.size).toBe(0); throw new Error('callback'); });
    const cancel = scope.timeout(callback, 10);
    expect(() => vi.advanceTimersByTime(10)).toThrow('callback');
    expect(scope.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    cancel(); scope.dispose();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('supports explicit cancellation and disposal from inside a timeout', () => {
    vi.useFakeTimers();
    const scope = new ResourceScope();
    const skipped = vi.fn();
    const cancel = scope.timeout(skipped, 5);
    cancel(); cancel();
    scope.timeout(() => scope.dispose(), 10);
    scope.timeout(skipped, 20);
    vi.advanceTimersByTime(100);
    expect(skipped).not.toHaveBeenCalled();
    expect(scope.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not schedule or attach listeners after disposal', () => {
    vi.useFakeTimers();
    const scope = new ResourceScope();
    const target = new EventTarget();
    const callback = vi.fn();
    scope.dispose();
    scope.listen(target, 'tick', callback);
    scope.timeout(callback, 1);
    scope.interval(callback, 1);
    target.dispatchEvent(new Event('tick'));
    expect(vi.getTimerCount()).toBe(0);
    expect(callback).not.toHaveBeenCalled();
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid interval %s without allocating', ms => {
    vi.useFakeTimers();
    const scope = new ResourceScope();
    expect(() => scope.interval(() => {}, ms)).toThrow(RangeError);
    expect(scope.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns to baseline after 1000 scene transitions with child detach and pending work', () => {
    vi.useFakeTimers();
    const application = new ResourceScope();
    const target = new EventTarget();
    const add = vi.spyOn(target, 'addEventListener');
    const remove = vi.spyOn(target, 'removeEventListener');
    let events = 0;
    let ticks = 0;
    let destroyed = 0;
    let timeouts = 0;
    for (let sceneIndex = 0; sceneIndex < 1000; sceneIndex++) {
      const scene = application.child();
      const panel = scene.child();
      scene.listen(target, 'tick', () => { events++; });
      scene.interval(() => { ticks++; }, 10);
      scene.timeout(() => { timeouts++; }, 100);
      panel.own(() => { destroyed++; });
      scene.own(() => { destroyed++; });
      target.dispatchEvent(new Event('tick'));
      vi.advanceTimersByTime(10);
      panel.dispose();
      expect(scene.size).toBe(5); // Includes the scene-to-application unlink cleanup.
      scene.dispose(); scene.dispose();
      expect(application.size).toBe(0);
      expect(scene.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      target.dispatchEvent(new Event('tick'));
    }
    application.dispose();
    vi.advanceTimersByTime(1000);
    expect(events).toBe(1000);
    expect(ticks).toBe(1000);
    expect(timeouts).toBe(0);
    expect(destroyed).toBe(2000);
    expect(add).toHaveBeenCalledTimes(1000);
    expect(remove).toHaveBeenCalledTimes(1000);
  });
});
