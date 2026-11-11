import { describe, expect, it, vi } from 'vitest';
import { fitFrame, holdToWalk, mountPhoneStage, HOLD_MS, WALK_MS } from '../src/ui/phone';

// a fake page: enough DOM for the phone stage (live's stage.js) with a visual viewport that moves and shrinks
type Fn = (e: Record<string, unknown>) => void;
function target() {
  const map = new Map<string, Set<Fn>>();
  return { map, addEventListener: (t: string, f: Fn) => { if (!map.has(t)) map.set(t, new Set()); map.get(t)!.add(f); }, removeEventListener: (t: string, f: Fn) => map.get(t)?.delete(f),
    fire(t: string, e: Record<string, unknown> = {}) { for (const f of [...map.get(t) ?? []]) f({ preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...e }); }, count: () => [...map.values()].reduce((n, s) => n + s.size, 0) };
}
function node(tag = 'div') {
  const t = target(), vars = new Map<string, string>(), classes = new Set<string>();
  const n = { ...t, tagName: tag.toUpperCase(), id: '', className: '', innerHTML: '', hidden: false, type: '', tabIndex: 0, title: '', name: '', content: '', attrs: new Map<string, string>(), removed: false,
    style: { setProperty: (k: string, v: string) => vars.set(k, v), getPropertyValue: (k: string) => vars.get(k) ?? '' } as Record<string, unknown>,
    classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c), contains: (c: string) => classes.has(c) },
    setAttribute(k: string, v: string) { n.attrs.set(k, v); }, append() {}, remove() { n.removed = true; }, closest: () => null };
  return n;
}
function page({ coarse = true, fs = true } = {}) {
  const head = node('head'), body = node('body'), root = Object.assign(node('html'), { requestFullscreen: vi.fn(async () => { doc.fullscreenElement = root; }) });
  const metas: ReturnType<typeof node>[] = [];
  const doc = Object.assign(target(), { documentElement: root, head: Object.assign(head, { append: (m: ReturnType<typeof node>) => { if (m.tagName === 'META') metas.push(m); } }), body,
    fullscreenEnabled: fs, fullscreenElement: null as unknown, exitFullscreen: vi.fn(async () => { doc.fullscreenElement = null; }),
    createElement: (t: string) => node(t), querySelector: (sel: string) => metas.find(m => sel.includes(`"${m.name}"`)) ?? null });
  const vv = Object.assign(target(), { offsetLeft: 0, offsetTop: 0, width: 844, height: 390 });
  const lock = vi.fn(async () => {});
  const win = Object.assign(target(), { document: doc, visualViewport: vv, innerWidth: 844, innerHeight: 390, devicePixelRatio: 3, screen: { orientation: { lock } },
    matchMedia: () => ({ matches: coarse }), getComputedStyle: () => ({ paddingTop: '0px', paddingRight: '44px', paddingBottom: '21px', paddingLeft: '44px' }) });
  return { doc, win, vv, root, lock, metas, host: node('section'), stage: node('main') };
}
const mount = (p: ReturnType<typeof page>, extra = {}) => mountPhoneStage({ host: p.host as never, stage: p.stage as never, win: p.win as never, doc: p.doc as never, ...extra });

describe('phone stage (live stage.js)', () => {
  it('fits 4:3 inside the visible viewport less the safe areas, centred', () => {
    expect(fitFrame({ offsetLeft: 0, offsetTop: 0, width: 1024, height: 768 })).toEqual({ left: 0, top: 0, width: 1024, height: 768, scale: 1 });
    const f = fitFrame({ offsetLeft: 0, offsetTop: 0, width: 844, height: 390 }, { top: 0, right: 44, bottom: 21, left: 44 })!;
    expect(f.height).toBeCloseTo(369); expect(f.width).toBeCloseTo(492); expect(f.top).toBe(0); expect(f.left).toBeCloseTo(44 + (756 - 492) / 2);
    // the keyboard up: the visible part is 150 high, scrolled 40 down
    const k = fitFrame({ offsetLeft: 0, offsetTop: 40, width: 844, height: 150 })!; expect(k.height).toBe(150); expect(k.top).toBe(40); expect(k.width).toBe(200);
    expect(fitFrame({ offsetLeft: 0, offsetTop: 0, width: 0, height: 300 })).toBeNull();
  });
  it('makes the page the game on a phone: viewport meta, dpr 1, rotate prompt, frame follows the visual viewport', () => {
    const p = page(), onFit = vi.fn(), s = mount(p, { onFit });
    expect(s.coarse).toBe(true); expect(p.win.devicePixelRatio).toBe(1);
    expect(p.metas.find(m => m.name === 'viewport')?.content).toContain('viewport-fit=cover'); expect(p.metas.find(m => m.name === 'viewport')?.content).toContain('user-scalable=no');
    expect(p.host.classList.contains('de-phone')).toBe(true); expect(p.root.classList.contains('de-phone-page')).toBe(true);
    expect(p.host.style.width).toBe('844px'); expect(p.stage.style.getPropertyValue('--de-frame-h')).toBe('369px');
    // the keyboard comes up: the visual viewport shrinks and scrolls; the frame and the HTML layer follow
    onFit.mockClear(); Object.assign(p.vv, { height: 180, offsetTop: 60 }); p.vv.fire('resize');
    expect(p.host.style.top).toBe('60px'); expect(p.host.style.height).toBe('180px'); expect(p.stage.style.getPropertyValue('--de-frame-h')).toBe('159px'); expect(onFit).toHaveBeenCalledOnce();
    p.vv.fire('scroll'); expect(onFit).toHaveBeenCalledTimes(2);
    s.dispose(); expect(p.host.classList.contains('de-phone')).toBe(false); expect(p.win.count() + p.vv.count() + p.doc.count()).toBe(0);
  });
  it('goes full screen (the whole page) and locks landscape on the first tap only', async () => {
    const p = page(), s = mount(p);
    p.win.fire('touchend', { target: { closest: () => null } }); await Promise.resolve(); await Promise.resolve();
    expect(p.root.requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' }); expect(p.lock).toHaveBeenCalledWith('landscape');
    p.doc.fullscreenElement = null; p.win.fire('touchend', { target: { closest: () => null } }); expect(p.root.requestFullscreen).toHaveBeenCalledOnce();
    s.toggleFullscreen(); expect(p.root.requestFullscreen).toHaveBeenCalledTimes(2); await Promise.resolve(); s.toggleFullscreen(); expect(p.doc.exitFullscreen).toHaveBeenCalledOnce();
    s.dispose();
  });
  it('leaves a desktop alone but for Alt+Enter', () => {
    const p = page({ coarse: false }), s = mount(p);
    expect(s.coarse).toBe(false); expect(p.win.devicePixelRatio).toBe(3); expect(p.host.classList.contains('de-phone')).toBe(false); expect(s.fit()).toBeNull();
    p.win.fire('keydown', { altKey: true, key: 'Enter' }); expect(p.root.requestFullscreen).toHaveBeenCalledOnce();
    p.win.fire('touchend', { target: { closest: () => null } }); expect(p.root.requestFullscreen).toHaveBeenCalledOnce();
    s.dispose(); expect(p.win.count()).toBe(0);
  });
});

describe('hold to walk (live: the held right button)', () => {
  const ev = (e: Record<string, unknown>) => ({ pointerId: 1, pointerType: 'touch', button: 0, clientX: 100, clientY: 100, target: null, preventDefault() {}, ...e });
  it('a finger held still walks to it, steered by moving, and the release is not also a click', () => {
    vi.useFakeTimers(); const el = target(), step = vi.fn(), w = holdToWalk(el as never, step);
    el.fire('pointerdown', ev({})); vi.advanceTimersByTime(HOLD_MS - 1); expect(step).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(step).toHaveBeenLastCalledWith(100, 100);
    el.fire('pointermove', ev({ clientX: 300, clientY: 200 })); vi.advanceTimersByTime(WALK_MS); expect(step).toHaveBeenLastCalledWith(300, 200);
    el.fire('pointerup', ev({})); const n = step.mock.calls.length; vi.advanceTimersByTime(WALK_MS * 3); expect(step.mock.calls.length).toBe(n);
    expect(w.consumeClick()).toBe(true); expect(w.consumeClick()).toBe(false); w.dispose(); vi.useRealTimers();
  });
  it('a tap is a click and a drag is no walk', () => {
    vi.useFakeTimers(); const el = target(), step = vi.fn(), w = holdToWalk(el as never, step);
    el.fire('pointerdown', ev({})); el.fire('pointerup', ev({})); vi.advanceTimersByTime(HOLD_MS * 2); expect(step).not.toHaveBeenCalled(); expect(w.consumeClick()).toBe(false);
    el.fire('pointerdown', ev({})); el.fire('pointermove', ev({ clientX: 130 })); vi.advanceTimersByTime(HOLD_MS * 2); expect(step).not.toHaveBeenCalled();
    w.dispose(); vi.useRealTimers();
  });
  it('the right mouse button walks at once; the left mouse button never; refused targets never', () => {
    vi.useFakeTimers(); const el = target(), step = vi.fn(), w = holdToWalk(el as never, step, t => t !== 'button');
    el.fire('pointerdown', ev({ pointerType: 'mouse', button: 0 })); vi.advanceTimersByTime(HOLD_MS * 2); expect(step).not.toHaveBeenCalled();
    el.fire('pointerdown', ev({ pointerId: 2, target: 'button' })); vi.advanceTimersByTime(HOLD_MS * 2); expect(step).not.toHaveBeenCalled();
    el.fire('pointerdown', ev({ pointerId: 3, pointerType: 'mouse', button: 2 })); expect(step).toHaveBeenCalledOnce();
    w.dispose(); vi.useRealTimers();
  });
});
