// Phones and tablets, as live's client/web-shell/stage.js does them for the engine's 1024x768 frame (live/client):
// - coarse pointer: the viewport meta (no zoom, edge to edge, viewport-fit=cover), devicePixelRatio 1 (the game is
//   1024x768; canvases would otherwise render at 3x on an iPhone), Safari's pinch stopped;
// - the frame (the stage, and main's HTML layer that follows it: htmlui/layer.ts places itself over the stage) is the
//   page: 4:3, letterboxed on black, inside the visual viewport (smaller while the on-screen keyboard is up) and out of
//   the notch (the safe-area insets); the rewrite's own title bar and status bar are not shown, as live has none;
// - a "Turn your device sideways to play." prompt in portrait;
// - fullscreen of the whole page (not the client: main's HTML layer lives on <body>, and fullscreen hides everything but
//   the fullscreen element's subtree; live's 3f3c77c) on the first tap, then a landscape lock where the browser allows;
//   a corner fullscreen button and Alt+Enter;
// - a finger held still on the world for HOLD_MS walks there, steered by moving, as does the right mouse button held (at
//   once, as live: the avatar follows the held cursor); a left click walks to the point once; a tap is the DOM's own click. The game's text boxes are real <input>s here (main's
//   HTML UI), so a tap on one brings up the keyboard by itself, and the fitted frame keeps it in view.
export const W = 1024, H = 768, HOLD_MS = 400, SLOP = 10, WALK_MS = 200, STEER_MS = 50;
/** A window too small for the rewrite's desktop layout (its stage is at least 640x480): framed as on a phone. */
export const COMPACT = '(max-height: 540px), (max-width: 700px)';

export interface Viewport { offsetLeft: number; offsetTop: number; width: number; height: number; }
export interface Insets { top: number; right: number; bottom: number; left: number; }
export interface FrameFit { left: number; top: number; width: number; height: number; scale: number; }

/** The 4:3 frame inside the visible viewport less the safe-area insets, centred (live's fit()). */
export function fitFrame(vv: Viewport, inset: Insets = { top: 0, right: 0, bottom: 0, left: 0 }): FrameFit | null {
  const aw = vv.width - inset.left - inset.right, ah = vv.height - inset.top - inset.bottom;
  const scale = Math.min(aw / W, ah / H);
  if (!(scale > 0) || !Number.isFinite(scale)) return null;
  const width = W * scale, height = H * scale;
  return { left: vv.offsetLeft + inset.left + (aw - width) / 2, top: vv.offsetTop + inset.top + (ah - height) / 2, width, height, scale };
}

export const PHONE_CSS = `
/* the letterbox is the page's black; the host stays clear, so main's 2008 backdrop (#mu-titlebg, on <body> under the
   stage) shows through on the title and Select Player as on live */
html.de-phone-page, html.de-phone-page body { overflow:hidden; overscroll-behavior:none; margin:0; background:#000; }
.de-client.de-phone { position:fixed; left:0; top:0; width:100%; height:100%; max-width:none; margin:0; box-sizing:border-box; background:transparent; display:block; overflow:hidden;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  touch-action:none; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; -webkit-tap-highlight-color:transparent; }
.de-client.de-phone>.de-top, .de-client.de-phone>.de-nav { display:none; }
.de-client.de-phone>.de-stage { position:absolute; flex:none; min-height:0; max-height:none; aspect-ratio:auto; border:0; box-sizing:border-box; left:var(--de-frame-x,0); top:var(--de-frame-y,0); width:var(--de-frame-w,100%); height:var(--de-frame-h,75%); }
/* every rewrite window on the stage scales with the frame as the game does (the frame is the 1024x768 game at
   --de-frame-s; main's HTML layer scales itself by the same factor): px sizes shrink, % placement stays the stage's.
   The world view and the lobby canvas size themselves to the stage. */
.de-client.de-phone>.de-stage>:where(:not(canvas,.de-world-view,.de-stage-layer,.de-avatar)) { zoom:var(--de-frame-s,1); }
/* the world's name tags too (the chibis scale with the world view; a tag's 16 px is the game's, at the frame's scale) */
.de-client.de-phone .de-avatar-name { zoom:var(--de-frame-s,1); }
.de-phone input, .de-phone textarea, #htmlui-host input, #htmlui-host textarea { user-select:text; -webkit-user-select:text; touch-action:manipulation; }
#de-fs { position:fixed; z-index:47; top:max(8px, env(safe-area-inset-top)); right:max(8px, env(safe-area-inset-right)); width:32px; height:32px; padding:7px; border:0; border-radius:6px; background:rgba(0,0,0,.45); color:#fff; opacity:.35; cursor:pointer; transition:opacity .15s; }
#de-fs:hover, #de-fs:focus-visible { opacity:1; }
#de-fs[hidden] { display:none; }
#de-rotate { display:none; position:fixed; inset:0; z-index:2147483000; background:#000; color:#fff; flex-direction:column; align-items:center; justify-content:center; gap:18px; padding:24px; text-align:center; font:600 18px/1.3 system-ui,sans-serif; touch-action:none; }
#de-rotate svg { animation:de-turn 2.4s ease-in-out infinite; }
@keyframes de-turn { 0%,30% { transform:rotate(0); } 60%,100% { transform:rotate(-90deg); } }
@media (prefers-reduced-motion:reduce) { #de-rotate svg { animation:none; transform:rotate(-90deg); } }
@media (orientation:portrait) { #de-rotate.de-on { display:flex; } }
`;

type Listener = [EventTarget, string, EventListener, AddEventListenerOptions | boolean | undefined];
export interface PhoneStageOptions {
  host: HTMLElement; stage: HTMLElement;
  /** Defaults to matchMedia('(pointer: coarse)'). */
  coarse?: boolean;
  win?: Window & typeof globalThis; doc?: Document;
  /** After every fit: the HTML layer re-places itself (a visual-viewport scroll moves the stage without resizing it). */
  onFit?: () => void;
}
export interface PhoneStage { readonly coarse: boolean; fit(): FrameFit | null; toggleFullscreen(): void; dispose(): void; }

export function mountPhoneStage(o: PhoneStageOptions): PhoneStage {
  const win = o.win ?? globalThis as Window & typeof globalThis, doc = o.doc ?? win.document, { host, stage } = o;
  const coarse = o.coarse ?? !!win.matchMedia?.('(pointer: coarse)').matches;
  const listeners: Listener[] = [], cleanups: (() => void)[] = [];
  const on = (t: EventTarget | null | undefined, type: string, fn: EventListener, opt?: AddEventListenerOptions | boolean) => { if (!t?.addEventListener) return; t.addEventListener(type, fn, opt); listeners.push([t, type, fn, opt]); };
  const root = doc.documentElement;
  const fsEl = () => doc.fullscreenElement ?? (doc as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ?? null;
  const canFs = !!(doc.fullscreenEnabled || (doc as Document & { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled);
  const enterFs = (): void => {
    const r = root as HTMLElement & { webkitRequestFullscreen?: () => void };
    let p: Promise<void> | void | undefined;
    try { p = r.requestFullscreen ? r.requestFullscreen({ navigationUI: 'hide' }) : r.webkitRequestFullscreen?.(); } catch { return; }
    const orientation = (win.screen as Screen & { orientation?: { lock?: (o: string) => Promise<void> } } | undefined)?.orientation;
    Promise.resolve(p).then(() => coarse ? orientation?.lock?.('landscape') : undefined).catch(() => {});
  };
  const toggleFullscreen = (): void => {   // inside the click / key handler: fullscreen needs a user gesture
    if (fsEl()) { const d = doc as Document & { webkitExitFullscreen?: () => void }; try { Promise.resolve((d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d)).catch(() => {}); } catch { /* already leaving */ } }
    else enterFs();
  };
  on(win, 'keydown', ((e: KeyboardEvent) => { if (e.altKey && e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); toggleFullscreen(); } }) as EventListener, true);

  // the fitted frame: phones and tablets always (coarse pointer), and any window too small for the rewrite's desktop
  // layout (its stage is at least 640x480 and the page would scroll; live's stage.js fits every window)
  // live's #fs: the window's top right corner on every page, desktop too (stage.js), hidden where nothing can go full
  // screen (iPhone Safari)
  const css = doc.createElement('style'); css.id = 'de-phone-css'; css.textContent = PHONE_CSS; doc.head.append(css);
  const btn = doc.createElement('button'); btn.id = 'de-fs'; btn.type = 'button'; btn.tabIndex = -1; btn.title = 'Full screen (Alt+Enter)'; btn.setAttribute('aria-label', 'Toggle full screen');
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  btn.hidden = !canFs;
  doc.body.append(btn);
  on(btn, 'click', (e => { e.stopPropagation(); toggleFullscreen(); }) as EventListener);
  on(btn, 'mousedown', (e => e.stopPropagation()) as EventListener);
  const compactQuery = win.matchMedia?.(COMPACT);
  const framed = (): boolean => coarse || !!compactQuery?.matches;
  if (!coarse && !compactQuery) return { coarse, fit: () => null, toggleFullscreen, dispose: () => { for (const [t, type, fn, opt] of listeners) t.removeEventListener(type, fn, opt); btn.remove(); css.remove(); } };
  let rot: HTMLElement | null = null;
  if (coarse) {
    // ---- the page is the game
    const meta = (name: string, content: string) => {
      let m = doc.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!m) { m = doc.createElement('meta'); m.name = name; doc.head.append(m); }
      const before = m.content; m.content = content; const el = m; cleanups.push(() => { el.content = before; });
    };
    meta('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    meta('theme-color', '#000000');
    meta('mobile-web-app-capable', 'yes');   // Add to Home Screen = full screen (iPhone Safari has no fullscreen API)
    meta('apple-mobile-web-app-capable', 'yes');
    meta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    try { Object.defineProperty(win, 'devicePixelRatio', { get: () => 1, configurable: true }); } catch { /* read-only here */ }
    rot = doc.createElement('div'); rot.id = 'de-rotate'; rot.className = 'de-on'; rot.setAttribute('role', 'alert');
    rot.innerHTML = '<svg viewBox="0 0 48 48" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" aria-hidden="true"><rect x="14" y="4" width="20" height="40" rx="3"/><path d="M21 39h6"/></svg><div>Turn your device sideways to play.</div>';
    doc.body.append(rot);
    on(doc, 'gesturestart', (e => e.preventDefault()) as EventListener, { passive: false });
  }

  const insets = (): Insets => {
    const cs = win.getComputedStyle?.(host), n = (v: string | undefined) => parseFloat(v ?? '') || 0;
    return { top: n(cs?.paddingTop), right: n(cs?.paddingRight), bottom: n(cs?.paddingBottom), left: n(cs?.paddingLeft) };
  };
  let last = '', framedNow = false;
  const vars = ['--de-frame-x', '--de-frame-y', '--de-frame-w', '--de-frame-h', '--de-frame-s'];
  const unframe = (): void => {
    if (!framedNow) return;
    framedNow = false; last = '';
    root.classList?.remove('de-phone-page'); host.classList.remove('de-phone');
    for (const k of ['left', 'top', 'width', 'height'] as const) host.style[k] = '';
    for (const v of vars) stage.style.removeProperty?.(v);
    btn.style.top = ''; btn.style.left = '';   // back to the window's corner (PHONE_CSS)
  };
  const fit = (): FrameFit | null => {
    if (!framed()) { unframe(); o.onFit?.(); return null; }
    if (!framedNow) { framedNow = true; root.classList?.add('de-phone-page'); host.classList.add('de-phone'); }
    const vv = coarse ? win.visualViewport : null, st = host.style;   // the visible part: smaller while the keyboard is up
    const view: Viewport = vv ? { offsetLeft: vv.offsetLeft, offsetTop: vv.offsetTop, width: vv.width, height: vv.height } : { offsetLeft: 0, offsetTop: 0, width: win.innerWidth, height: win.innerHeight };
    st.left = view.offsetLeft + 'px'; st.top = view.offsetTop + 'px'; st.width = view.width + 'px'; st.height = view.height + 'px';
    // the stage is placed inside the host's padding box: offsets are the host's own
    const inset = insets(), f = fitFrame({ ...view, offsetLeft: 0, offsetTop: 0 }, inset);
    if (f) {
      const key = [f.left, f.top, f.width, f.height].join();
      if (key !== last) {
        last = key;
        stage.style.setProperty('--de-frame-x', f.left + 'px'); stage.style.setProperty('--de-frame-y', f.top + 'px');
        stage.style.setProperty('--de-frame-w', f.width + 'px'); stage.style.setProperty('--de-frame-h', f.height + 'px');
        stage.style.setProperty('--de-frame-s', String(f.scale));
      }
      // live's #fs: the screen's top right corner, out of the notch
      btn.style.top = (view.offsetTop + Math.max(8, inset.top)) + 'px';
      btn.style.left = (view.offsetLeft + view.width - Math.max(8, inset.right) - 32) + 'px';
    }
    o.onFit?.();
    return f;
  };
  let orientTimer: ReturnType<typeof setTimeout> | undefined;
  on(win, 'resize', () => fit());
  on(win, 'orientationchange', () => { clearTimeout(orientTimer); orientTimer = setTimeout(fit, 300); });
  on(win.visualViewport, 'resize', () => fit());
  on(win.visualViewport, 'scroll', () => fit());
  on(compactQuery, 'change', () => fit());
  on(doc, 'fullscreenchange', () => fit());
  on(doc, 'webkitfullscreenchange', () => fit());
  // the first tap goes full screen (Android; iPad), inside its touchend: only a release counts as a gesture on mobile
  let firstTap = coarse;
  on(win, 'touchend', (e => {
    if (!firstTap) return;
    const t = e.target as Element | null;
    if (t?.closest?.('#de-fs, #de-rotate')) return;
    firstTap = false;
    if (canFs && !fsEl()) enterFs();
  }) as EventListener, true);
  fit();
  return {
    coarse, fit, toggleFullscreen,
    dispose() {
      clearTimeout(orientTimer);
      for (const [t, type, fn, opt] of listeners) t.removeEventListener(type, fn, opt);
      for (const c of cleanups) c();
      unframe();
      rot?.remove(); btn.remove(); css.remove();
      if (coarse) try { delete (win as { devicePixelRatio?: number }).devicePixelRatio; } catch { /* kept */ }
    },
  };
}

// called as globals: a browser refuses setTimeout & co. called as another object's methods ("Illegal invocation")
const BROWSER_TIMERS = { set: ((f: () => void, ms?: number) => setTimeout(f, ms)) as typeof setTimeout, clear: ((t?: ReturnType<typeof setTimeout>) => clearTimeout(t)) as typeof clearTimeout,
  every: ((f: () => void, ms?: number) => setInterval(f, ms)) as typeof setInterval, stop: ((t?: ReturnType<typeof setInterval>) => clearInterval(t)) as typeof clearInterval };
export interface HoldWalk { /** True once for the click that ends a walk (the walk was the press; it is not also a click). */ consumeClick(): boolean; dispose(): void; }
/** A finger held still (or the right mouse button held) on el walks toward the pointer until it lifts, steered by moving
 * (the mouse re-aims every STEER_MS, a finger every WALK_MS). A finger moved past SLOP before HOLD_MS is a drag, not a
 * walk. The left button is the DOM's click (a walk to the point, once). */
export function holdToWalk(el: HTMLElement, step: (clientX: number, clientY: number) => void, accept: (target: EventTarget | null) => boolean = () => true, timers: { set: typeof setTimeout; clear: typeof clearTimeout; every: typeof setInterval; stop: typeof clearInterval } = BROWSER_TIMERS): HoldWalk {
  let id: number | null = null, sx = 0, sy = 0, lx = 0, ly = 0, walking = false, swallow = false;
  let hold: ReturnType<typeof setTimeout> | undefined, tick: ReturnType<typeof setInterval> | undefined;
  const stop = () => { timers.clear(hold); hold = undefined; if (tick !== undefined) timers.stop(tick); tick = undefined; if (walking) swallow = true; walking = false; id = null; };
  const walk = (ms = WALK_MS) => { walking = true; step(lx, ly); tick = timers.every(() => step(lx, ly), ms); };
  const down = (e: PointerEvent) => {
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (id !== null || !(touch && e.button <= 0 || e.button === 2) || !accept(e.target)) return;
    id = e.pointerId; sx = lx = e.clientX; sy = ly = e.clientY; swallow = false;
    if (e.button === 2) { e.preventDefault(); walk(STEER_MS); return; }   // the right button held follows the mouse at once, as on live
    hold = timers.set(() => { hold = undefined; walk(); }, HOLD_MS);
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    lx = e.clientX; ly = e.clientY;
    if (!walking && hold !== undefined && Math.hypot(lx - sx, ly - sy) > SLOP) { timers.clear(hold); hold = undefined; id = null; }
  };
  const up = (e: PointerEvent) => { if (e.pointerId === id) stop(); };
  const menu = (e: Event) => { if (accept(e.target)) e.preventDefault(); };   // a long press is not the browser's context menu
  el.addEventListener('pointerdown', down as EventListener);
  el.addEventListener('pointermove', move as EventListener);
  for (const t of ['pointerup', 'pointercancel']) el.addEventListener(t, up as EventListener);
  for (const t of ['pointerup', 'pointercancel']) globalThis.addEventListener?.(t, up as EventListener, true);
  el.addEventListener('contextmenu', menu);
  return {
    consumeClick: () => { const s = swallow; swallow = false; return s; },
    dispose() { stop(); swallow = false; el.removeEventListener('pointerdown', down as EventListener); el.removeEventListener('pointermove', move as EventListener); for (const t of ['pointerup', 'pointercancel']) el.removeEventListener(t, up as EventListener); for (const t of ['pointerup', 'pointercancel']) globalThis.removeEventListener?.(t, up as EventListener, true); el.removeEventListener('contextmenu', menu); },
  };
}
