import { describe, expect, it, vi } from 'vitest';
import { BrowserDisplaySettings, browserFullscreenAdapter } from '../src/ui/settings-browser';
import type { FullscreenAdapter } from '../src/ui/settings-browser';
function deferred() { let resolve!: () => void, reject!: (reason: Error) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture() {
  let active = false, supported = true, changed = () => {}, refused = () => {};
  const request = deferred(), exit = deferred(), unsubscribe = vi.fn(), notify = vi.fn();
  const adapter: FullscreenAdapter = { active: () => active, supported: () => supported, request: vi.fn(() => request.promise), exit: vi.fn(() => exit.promise), subscribe: (next, fail) => { changed = next; refused = fail; return unsubscribe; } };
  const settings = new BrowserDisplaySettings(adapter, notify);
  return { settings, adapter, request, exit, notify, unsubscribe, change: (value: boolean) => { active = value; changed(); }, refuse: () => refused(), unsupported: () => { supported = false; } };
}
describe('browser-owned display settings', () => {
  it('never enters fullscreen on construction and invokes a clicked request before yielding', async () => {
    const f = fixture(); expect(f.adapter.request).not.toHaveBeenCalled(); expect(f.settings.state.active).toBe(false);
    const operation = f.settings.toggle(); expect(f.adapter.request).toHaveBeenCalledOnce(); expect(f.settings.state.pending).toBe(true); expect(f.settings.state.active).toBe(false);
    f.change(true); f.request.resolve(); await operation; expect(f.settings.state).toEqual({ active: true, supported: true, pending: false, error: null }); f.settings.dispose();
  });
  it('deduplicates pending clicks and uses browser events for entry and Escape', async () => {
    const f = fixture(), first = f.settings.toggle(); await f.settings.toggle(); expect(f.adapter.request).toHaveBeenCalledOnce();
    f.change(true); expect(f.settings.state.active).toBe(true); f.request.resolve(); await first;
    f.change(false); expect(f.settings.state.active).toBe(false); expect(f.adapter.exit).not.toHaveBeenCalled(); f.settings.dispose();
  });
  it('does not claim fullscreen merely because a request promise resolved', async () => {
    const f = fixture(), operation = f.settings.toggle(); f.request.resolve(); await operation;
    expect(f.settings.state.active).toBe(false); expect(f.settings.state.pending).toBe(false); f.settings.dispose();
  });
  it('shows actionable refusal and lets an explicit later click retry', async () => {
    const f = fixture(), operation = f.settings.toggle(); f.refuse(); expect(f.settings.state.error).toContain('Click Enter Fullscreen again');
    f.request.reject(new Error('NotAllowedError')); await operation; expect(f.settings.state.active).toBe(false); expect(f.settings.state.pending).toBe(false);
    await f.settings.toggle(); expect(f.adapter.request).toHaveBeenCalledTimes(2); f.settings.dispose();
  });
  it('waits for actual exit and provides Escape as the fallback when exit fails', async () => {
    const f = fixture(); f.change(true); const operation = f.settings.toggle(); expect(f.adapter.exit).toHaveBeenCalledOnce(); expect(f.adapter.request).not.toHaveBeenCalled();
    f.exit.reject(new Error('denied')); await operation; expect(f.settings.state.active).toBe(true); expect(f.settings.state.error).toContain('Press Escape');
    f.change(false); expect(f.settings.state.active).toBe(false); expect(f.settings.state.error).toBeNull(); f.settings.dispose();
  });
  it('reports unsupported embedding without calling any fullscreen API', async () => {
    const f = fixture(); f.unsupported(); await f.settings.toggle(); expect(f.settings.state.supported).toBe(false); expect(f.settings.state.error).toContain('browser tab'); expect(f.adapter.request).not.toHaveBeenCalled(); expect(f.adapter.exit).not.toHaveBeenCalled(); f.settings.dispose();
  });
  it('removes its scoped subscription and ignores late events and rejections after disposal', async () => {
    const f = fixture(), operation = f.settings.toggle(); f.settings.dispose(); f.settings.dispose(); const count = f.notify.mock.calls.length;
    f.change(true); f.refuse(); f.request.reject(new Error('late')); await operation; await f.settings.toggle();
    expect(f.notify).toHaveBeenCalledTimes(count); expect(f.unsubscribe).toHaveBeenCalledOnce(); expect(f.adapter.request).toHaveBeenCalledOnce(); expect(f.adapter.exit).not.toHaveBeenCalled();
  });
  it('binds standard browser methods and cleans fullscreenchange/fullscreenerror listeners', async () => {
    const listeners = new Map<string, () => void>(), target = { requestFullscreen: vi.fn(async function(this: unknown) { expect(this).toBe(target); }) }, page = { fullscreenEnabled: true, fullscreenElement: null as unknown, exitFullscreen: vi.fn(async function(this: unknown) { expect(this).toBe(page); }), addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) };
    const adapter = browserFullscreenAdapter(target as unknown as HTMLElement, page as unknown as Document), changed = vi.fn(), failed = vi.fn(), unsubscribe = adapter.subscribe(changed, failed);
    expect(adapter.supported()).toBe(true); await adapter.request(); page.fullscreenElement = target; listeners.get('fullscreenchange')!(); expect(adapter.active()).toBe(true); expect(changed).toHaveBeenCalledOnce();
    listeners.get('fullscreenerror')!(); expect(failed).toHaveBeenCalledOnce(); await adapter.exit(); unsubscribe(); expect(listeners.size).toBe(0);
  });
});
