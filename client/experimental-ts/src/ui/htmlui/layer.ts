// main's Legacy HTML UI layer in the rewrite (browser only). main's bridge.js reads the engine's windows and hands
// each screen module (screens/*.js, else the generic controls) a snapshot; here the rewrite builds the snapshots
// (windows.ts) and is the engine: it mounts the same modules through bridge.js's makeLayer, implements `api` with
// ClientApp commands, and gives the pointer's hover / pressed looks to the controls, as each switch's onMain does.
// Every module runs owned (the DOM takes input): its buttons are real, focusable <button>s and its inputs real
// <input>s. A module main runs in pass mode draws buttons the engine clicks; their clicks are hit-tested here.
import { makeLayer } from '@htmlui/bridge.js';
import { backdrop } from '@htmlui/backdrop.js';
import select from '@htmlui/screens/select.js';
import chat from '@htmlui/screens/chat.js';
import lobby from '@htmlui/screens/lobby.js';
import social from '@htmlui/screens/social.js';
import { applyPointer, hitTest } from './snapshot';
import type { ControlHandlers, HtmlSnapshot, HtmlWindow, WindowSpec } from './snapshot';

/** main's modules by class (bridge.js loadScreens' order: a later group's class wins), plus the windows the engine
 * draws on main that the rewrite draws with main's modules (the account dialogs: social.js's owned dialogs). */
const MODULES: HtmlUiScreen[] = [select, lobby, chat, social];
const EXTRA: Record<string, HtmlUiScreen> = { CWindowModelInput1: social };
// a window with no module: main's generic controls (bridge.js: syncWindow)
const GENERIC: HtmlUiScreen = { classes: [], mode: 'pass', mount: () => new Map(),
  update: (win, _prev, root, api, st) => api.syncWindow!(root, win, st as Map<number, unknown>),
  unmount: (root, st) => { root.replaceChildren(); (st as Map<number, unknown>).clear(); } };

export interface HtmlUiLayerOptions { art: string; stage: () => HTMLElement | null }

export class HtmlUiLayer {
  readonly host: HTMLElement;
  private specs: WindowSpec[] = []; private handlers = new Map<number, ControlHandlers>();
  private render: ((snap: unknown, owned: Set<number>, api: HtmlUiApi) => void) | null = null;
  private frame = 0; private hover = 0; private pressed = 0; private focus = 0; private clicked = false;
  private roots = new Map<number, HTMLElement>(); private scale = 1; private disposed = false;
  private elementIds = new WeakMap<Element, number>();   // a drawn element -> the control it stands for (tag)
  private declared = new Map<string, 'pass' | 'owned'>();
  private screens = new Map<string, HtmlUiScreen>();
  private back: { el: HTMLElement; bd: { frame(snap: { backdrop?: { shown: boolean } } | null): void } } | null = null;
  private wantBackdrop = false;
  private observer: ResizeObserver | null = null;
  private readonly api: HtmlUiApi;

  constructor(private options: HtmlUiLayerOptions) {
    this.host = document.createElement('div');
    this.host.id = 'htmlui-host';
    this.host.dataset.rewrite = '';
    document.body.append(this.host);
    for (const mod of [...MODULES, ...Object.values(EXTRA)]) for (const cls of mod.classes) this.declared.set(cls, mod.mode ?? 'pass');
    for (const [cls, mod] of Object.entries(EXTRA)) this.declared.set(cls, mod.mode ?? 'pass');
    const byClass = new Map<string, HtmlUiScreen>();
    for (const mod of MODULES) for (const cls of mod.classes) byClass.set(cls, mod);
    for (const [cls, mod] of Object.entries(EXTRA)) byClass.set(cls, mod);
    const get = (cls: string) => { let s = this.screens.get(cls); if (!s) this.screens.set(cls, s = this.wrap(byClass.get(cls) ?? GENERIC)); return s; };
    this.api = {
      click: (id: number) => { this.clicked = true; setTimeout(() => { this.clicked = false; }, 0); const h = this.handlers.get(id); if (h?.text || h?.enter) this.focus = id; h?.click?.(); return Promise.resolve(!!h); },
      hover: (id: number) => { if (this.hover !== id) { this.hover = id; this.draw(); } return true; },
      key: () => {},
      char: (code: number) => { if (code === 13) this.handlers.get(this.focus)?.enter?.(); },
      setText: (id: number, value: string) => { this.focus = id; this.handlers.get(id)?.text?.(value); },
      setValue: () => {}, wheel: () => true, scroll: () => {}, text: () => '',
      art: (path: string) => this.options.art + path,
    };
    void makeLayer(this.host, { get, has: () => true }, options.art).then(({ render }) => { if (!this.disposed) { this.render = render; this.draw(); } })
      .catch((e: unknown) => console.warn('htmlui', e));
    this.host.addEventListener('pointermove', this.onMove, true);
    this.host.addEventListener('pointerdown', this.onDown, true);
    this.host.addEventListener('pointerup', this.onUp, true);
    this.host.addEventListener('pointerout', this.onOut, true);
    this.host.addEventListener('click', this.onClick);
    addEventListener('resize', this.place); addEventListener('scroll', this.place, true);
    if (typeof ResizeObserver === 'function') { this.observer = new ResizeObserver(this.place); const s = options.stage(); if (s) this.observer.observe(s); }
  }

  /** The windows to show now (back to front) and whether the scene has the 2008 backdrop (backdrop.js). */
  show(specs: WindowSpec[], withBackdrop: boolean): void {
    this.specs = specs;
    this.handlers = new Map(specs.flatMap(s => [...s.handlers]));
    if (!this.handlers.has(this.hover)) this.hover = 0;
    if (!this.handlers.has(this.pressed)) this.pressed = 0;
    this.wantBackdrop = withBackdrop;
    this.place();
    this.draw();
  }

  private draw(): void {
    if (this.disposed) return;
    this.backdrop();
    if (!this.render) return;
    // the engine's looks only where main lets the engine take the pointer (pass mode): an owned screen (chat.js owned())
    // redraws a control whose snapshot changes, which would replace a button between its press and its release
    applyPointer(this.specs, this.hover, this.pressed, w => this.declared.get(w.cls) !== 'owned');
    const windows: HtmlWindow[] = this.specs.map(s => s.win);
    const snap: HtmlSnapshot = { v: 1, frame: ++this.frame, scene: 0, mouse: null, focus: this.focus, windows, tasks: [], cursor: null };
    this.render(snap, new Set(windows.map(w => w.id)), this.api);
    this.host.hidden = !windows.length;
  }

  // main's backdrop.js under the stage: it places itself over a "canvas", here an invisible box kept over the stage
  private backdrop(): void {
    if (!this.wantBackdrop && !this.back) return;
    if (!this.back) {
      const el = document.createElement('div');
      el.className = 'htmlui-stagebox';
      document.body.prepend(el);
      const bd = backdrop(el);
      Object.assign(el.style, { position: 'fixed', zIndex: '-1', pointerEvents: 'none', visibility: 'hidden' });
      this.back = { el, bd };
      this.place();
    }
    const layer = document.getElementById('mu-titlebg');
    if (layer) layer.style.display = this.wantBackdrop ? '' : 'none';
    if (this.wantBackdrop) this.back.bd.frame({ backdrop: { shown: true } });
  }

  private place = (): void => {
    const stage = this.options.stage(); if (!stage) return;
    const r = stage.getBoundingClientRect(), s = r.width / 1024 || 1;
    this.scale = s;
    Object.assign(this.host.style, { left: r.left + 'px', top: r.top + 'px', transform: `scale(${s})` });
    if (this.back) Object.assign(this.back.el.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.width * 0.75 + 'px' });
  };

  private point(e: MouseEvent): [number, number] {
    const r = this.host.getBoundingClientRect();
    return [(e.clientX - r.left) / this.scale, (e.clientY - r.top) / this.scale];
  }
  private onMove = (e: PointerEvent): void => {
    const [x, y] = this.point(e), id = hitTest(this.specs, x, y, (h, w) => !!h.hover && this.declared.get(w.cls) !== 'owned')?.id ?? 0;
    if (id !== this.hover) { this.hover = id; if (this.pressed && id !== this.pressed) this.pressed = 0; this.draw(); }
  };
  private onDown = (e: PointerEvent): void => { if (e.button !== 0) return; this.onMove(e); if (this.hover) { this.pressed = this.hover; this.draw(); } };
  private onUp = (): void => { if (this.pressed) { this.pressed = 0; this.draw(); } };
  private onOut = (e: PointerEvent): void => { if (!this.host.contains(e.relatedTarget as Node | null) && (this.hover || this.pressed)) { this.hover = this.pressed = 0; this.draw(); } };
  // A module main runs in pass mode draws buttons the engine would click: the click lands on the control under it
  private onClick = (e: MouseEvent): void => {
    if (this.clicked) return;
    // the element's control (a keyboard press has no pointer position), else the control under the pointer
    const el = (e.target as Element | null)?.closest?.('button'), byEl = el ? this.elementIds.get(el) : undefined;
    const [x, y] = this.point(e), c = byEl !== undefined ? this.specs.flatMap(s => s.win.controls).find(k => k.id === byEl) ?? null : hitTest(this.specs, x, y, h => !!h.click);
    if (!c || !this.handlers.get(c.id)?.click) return;
    const win = this.specs.find(s => s.win.controls.includes(c))?.win;
    if (win && this.declared.get(win.cls) === 'owned') return;   // an owned screen clicks its own controls
    void this.api.click(c.id);
  };

  /** main's module, owned, with what the rewrite adds after each update: data-key / aria-label on the elements that
   * stand for the controls that have them (found by where they are: main's screens place one per control). */
  private wrap(mod: HtmlUiScreen): HtmlUiScreen {
    return { ...mod, mode: 'owned',
      mount: (win, root, api) => { this.roots.set((win as HtmlWindow).id, root); return mod.mount ? mod.mount(win, root, api) : new Map(); },
      update: (win, prev, root, api, st) => { mod.update?.(win, prev, root, api, st); this.tag(win as HtmlWindow, root); },
      unmount: (root, st) => { mod.unmount?.(root, st); for (const [id, r] of this.roots) if (r === root) this.roots.delete(id); } };
  }
  private tag(win: HtmlWindow, root: HTMLElement): void {
    const spec = this.specs.find(s => s.win.id === win.id); if (!spec) return;
    const rr = root.getBoundingClientRect(), k = this.scale;
    const els = [...root.querySelectorAll<HTMLElement>('button, input, textarea, [role="log"]')].map(el => {
      const r = el.getBoundingClientRect();
      return { el, x: (r.left + r.width / 2 - rr.left) / k, y: (r.top + r.height / 2 - rr.top) / k, area: r.width * r.height };
    }).filter(e => e.area > 0);
    for (const c of win.controls) {
      const h = spec.handlers.get(c.id); if (!h) continue;
      const input = !!(h.text || h.enter);
      const at = els.filter(e => (input ? /^(INPUT|TEXTAREA)$/.test(e.el.tagName) : e.el.tagName === 'BUTTON') &&
        e.x >= c.x && e.x < c.x + c.w && e.y >= c.y && e.y < c.y + c.h).sort((a, b) => a.area - b.area)[0]?.el;
      if (!at) continue;
      this.elementIds.set(at, c.id);
      // a pass-mode screen shows a disabled control's look only: the element says it too (keyboard, tests, a11y)
      if (at instanceof HTMLButtonElement && c.state !== undefined) at.disabled = c.state === 'disabled' || !c.enabled;
      if (h.key && at.dataset.key !== h.key) at.dataset.key = h.key;
      if (h.label && at.getAttribute('aria-label') !== h.label) at.setAttribute('aria-label', h.label);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.observer?.disconnect();
    removeEventListener('resize', this.place); removeEventListener('scroll', this.place, true);
    this.host.remove(); this.back?.el.remove(); document.getElementById('mu-titlebg')?.remove();
  }
}
