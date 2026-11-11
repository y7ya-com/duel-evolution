// main's Legacy HTML UI layer in the rewrite (browser only). main's bridge.js reads the engine's windows and hands
// each screen module (screens/*.js, else the generic controls) a snapshot; here the rewrite builds the snapshots
// (windows.ts) and is the engine: it mounts the same modules through bridge.js's makeLayer, implements `api` with
// ClientApp commands, and gives the pointer's hover / pressed looks to the controls, as each switch's onMain does.
// Every module runs owned (the DOM takes input): its buttons are real, focusable <button>s and its inputs real
// <input>s. A module main runs in pass mode draws buttons the engine clicks: here each such button is the target
// itself (the element the browser hands the event, never a point hit-tested against the controls' rects): its
// hover / pressed looks follow the pointer entering, pressing and leaving that element, Enter / Space on it click it.
import { makeLayer } from '@htmlui/bridge.js';
import { backdrop } from '@htmlui/backdrop.js';
import select from '@htmlui/screens/select.js';
import chat from '@htmlui/screens/chat.js';
import lobby from '@htmlui/screens/lobby.js';
import social from '@htmlui/screens/social.js';
import dialog from '@htmlui/screens/dialog.js';
import duelsetup from '@htmlui/screens/duelsetup.js';
import deck from '@htmlui/screens/deck.js';
import shop from '@htmlui/screens/shop.js';
import trade from '@htmlui/screens/trade.js';
import duel from '@htmlui/screens/duel.js';
import packselect from '@htmlui/screens/packselect.js';
import avatar from '@htmlui/screens/avatar.js';
import result from '@htmlui/screens/result.js';
import { chatBubblesFrame } from '@htmlui/chat-bubbles.js';
import { pictures, balloon } from './pictures';
import { syncWindow, covers } from '@htmlui/controls/basic.js';
import { applyPointer } from './snapshot';
import type { ControlHandlers, HtmlSnapshot, HtmlWindow, WindowSpec } from './snapshot';

/** main's modules by class (bridge.js loadScreens' order: a later group's class wins), plus the windows the engine
 * draws on main that the rewrite draws with main's modules (the account dialogs: social.js's owned dialogs). */
const MODULES: HtmlUiScreen[] = [select, lobby, chat, social, deck, shop, trade, packselect, dialog, duelsetup, duel, avatar, result];
// no screen runs in pass mode: the deck editor is owned, its cards and buttons DOM over main's windows (deck-dom.ts)
const PASS = new Set<HtmlUiScreen>([avatar]);   // Change Avatar: its plates are drawn, the clicks hit-tested here
// what the engine draws on main around main's screens (the shop's and the trade's pictures, the clerk's balloon)
const EXTRA: Record<string, HtmlUiScreen> = { CEnginePictures: pictures, CShopBalloon: balloon };
// the windows whose module rebuilds its buttons on every change (screens/shop.js, trade.js): clicked on release
const REBUILT = /^(CShop|CWindowModelTrade$|CWindowTaskCardArea$)/;
// a window with no module: main's generic controls (controls/basic.js syncWindow, owned: its buttons are real,
// focusable and click their control), and a plain visible button for a clickable control no renderer draws, so a
// window the rewrite adds before its screen is never a dead box
const GENERIC: HtmlUiScreen = { classes: [], mode: 'owned', mount: () => new Map(),
  update: (win, _prev, root, api, st) => { const s = st as Map<number, unknown>; syncWindow(root, win, s, { ...api, owned: true }); fallback(win as HtmlWindow, root, api); },
  unmount: (root, st) => { root.replaceChildren(); (st as Map<number, unknown>).clear(); } };
const FALLBACK = new WeakMap<HTMLElement, Map<number, HTMLButtonElement>>();
function fallback(win: HtmlWindow, root: HTMLElement, api: HtmlUiApi): void {
  const els = FALLBACK.get(root) ?? new Map<number, HTMLButtonElement>(); FALLBACK.set(root, els);
  const seen = new Set<number>();
  for (const c of win.controls) {
    if (c.parent || covers(c) || !/Switch|Button|Tab|Icon/.test(c.cls)) continue;
    seen.add(c.id);
    let b = els.get(c.id);
    if (!b) { b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn htmlui-fallback' }); b.addEventListener('click', () => void api.click(c.id)); els.set(c.id, b); }
    if (b.parentNode !== root) root.append(b);
    b.textContent = String(c.label ?? c.name ?? '');
    b.disabled = c.state === 'disabled' || !c.enabled; b.hidden = !c.shown;
    Object.assign(b.style, { position: 'absolute', left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' });
  }
  for (const [id, b] of els) if (!seen.has(id)) { b.remove(); els.delete(id); }
}

/** A shown avatar's name tag in game px (main's read/chat.js chatAvatars): All Chat's speech bubbles stand over it. */
export interface ChatAvatar { pid: number; name: string; x: number; y: number }
export interface HtmlUiLayerOptions { art: string; stage: () => HTMLElement | null; chatAvatars?: () => ChatAvatar[];
  /** Each draw and each second, with the last snapshot: main's page-level modules (page-modules.ts), as bridge.js's frame. */
  frame?: (snap: HtmlSnapshot | null) => void }

export class HtmlUiLayer {
  readonly host: HTMLElement;
  private specs: WindowSpec[] = []; private handlers = new Map<number, ControlHandlers>();
  private render: ((snap: unknown, owned: Set<number>, api: HtmlUiApi) => void) | null = null;
  private frame = 0; private hover = 0; private pressed = 0; private focus = 0; private clicked = false; private released = false;
  private roots = new Map<number, HTMLElement>(); private scale = 1; private disposed = false;
  private elementIds = new WeakMap<Element, number>();   // a drawn element -> the control it stands for (tag)
  private tagged = new WeakMap<HTMLElement, Set<HTMLElement>>();   // per window root: the elements tag() keyed
  private declared = new Map<string, 'pass' | 'owned'>();
  private screens = new Map<string, HtmlUiScreen>();
  // an invisible box kept over the stage: the "canvas" main's page-level modules place themselves over
  private box: HTMLElement;
  private bd: { frame(snap: { backdrop?: { shown: boolean } } | null): void } | null = null;
  private wantBackdrop = false; private scene = 0; private last: HtmlSnapshot | null = null; private tick: ReturnType<typeof setInterval> | null = null;
  private observer: ResizeObserver | null = null;
  private readonly api: HtmlUiApi;

  constructor(private options: HtmlUiLayerOptions) {
    this.box = document.createElement('div');
    this.box.className = 'htmlui-stagebox';
    document.body.prepend(this.box);
    this.host = document.createElement('div');
    this.host.id = 'htmlui-host';
    this.host.dataset.rewrite = '';
    // main's text boxes never take the pointer: on main the engine has it in pass mode, here a label's box (Select
    // Player's 128-wide level) would cover the button beside it. A CWindowTaskText is two boxes (controls/basic.js
    // TEXT: an unclassed control box around the .txt), both let the pointer through
    if (!document.getElementById('htmlui-rewrite-css')) {
      const st = document.createElement('style'); st.id = 'htmlui-rewrite-css';
      // the layer stands over the rewrite's own overlays (its card-get, NPC and appearance panels), as main's stands
      // over everything the engine draws. Change Avatar is a pass-mode window (its root lets the pointer through to
      // main's engine): here no engine stands under it, its plates take the pointer themselves
      // main's starter picker (web-shell/starter.js, z 10) stands over main's windows (bridge.js's host, z 4): here too
      st.textContent = '#htmlui-host[data-rewrite] { z-index: 45; } body #starter { z-index: 46; } #htmlui-host[data-rewrite] :is(.txt, .win div:not([class]):has(> .txt):not(:has(button, input, textarea, [data-key]))) { pointer-events: none; } #htmlui-host[data-rewrite] :is(.shop-btn, .win[data-window-class^="CWindowTaskCardArea"] button, .win[data-window-class="CWindowModelTrade"] button, .win[data-window-class="CWindowDialogAvatarSwitch"] button) { pointer-events: auto; } #htmlui-host[data-rewrite] .win[data-window-class="CWindowTaskCardArea"] { pointer-events: auto !important; }';
      document.head.append(st);
    }
    document.body.append(this.host);
    for (const mod of [...MODULES, ...Object.values(EXTRA)]) for (const cls of mod.classes) this.declared.set(cls, mod.mode ?? 'pass');
    for (const [cls, mod] of Object.entries(EXTRA)) this.declared.set(cls, mod.mode ?? 'pass');
    const byClass = new Map<string, HtmlUiScreen>();
    for (const mod of MODULES) for (const cls of mod.classes) byClass.set(cls, mod);
    for (const [cls, mod] of Object.entries(EXTRA)) byClass.set(cls, mod);
    const get = (cls: string) => { let s = this.screens.get(cls); if (!s) this.screens.set(cls, s = this.wrap(byClass.get(cls) ?? GENERIC)); return s; };
    this.api = {
      click: (id: number, point?: [number, number]) => { this.clicked = true; setTimeout(() => { this.clicked = false; }, 0); const h = this.handlers.get(id); if (h?.text || h?.enter) this.focus = id; h?.click?.(point); return Promise.resolve(!!h); },
      hover: (id: number) => { if (this.hover !== id) { this.hover = id; this.draw(); } return true; },
      key: () => {},
      char: (code: number) => { if (code === 13) this.handlers.get(this.focus)?.enter?.(); },
      setText: (id: number, value: string) => { this.focus = id; this.handlers.get(id)?.text?.(value); },
      setValue: (id: number, v: number) => { this.handlers.get(id)?.value?.(v); }, wheel: (id: number, delta: number) => { this.handlers.get(id)?.wheel?.(delta); return true; }, scroll: () => {}, text: () => '',
      art: (path: string) => this.options.art + path,
    };
    // main's Main Menu asks the page's yo2Html for the scene (its Appearance entry) and a Modern UI switch: the
    // rewrite's snapshot, and Legacy UI only
    const g = globalThis as { yo2Html?: unknown };
    if (!g.yo2Html) g.yo2Html = { snapshot: () => this.last, modern: () => false };
    this.place();
    this.tick = setInterval(() => { this.bubbles(); this.pageModules(); }, 1000);
    void makeLayer(this.host, { get, has: () => true }, options.art).then(({ render }) => { if (!this.disposed) { this.render = render; this.draw(); } })
      .catch((e: unknown) => console.warn('htmlui', e));
    this.host.addEventListener('pointerover', this.onOver, true);
    this.host.addEventListener('pointerout', this.onOut, true);
    this.host.addEventListener('pointerdown', this.onDown, true);
    this.host.addEventListener('pointerup', this.onUp, true);
    this.host.addEventListener('keydown', this.onKey, true);
    this.host.addEventListener('keyup', this.onKey, true);
    this.host.addEventListener('focusout', this.onBlur, true);
    this.host.addEventListener('click', this.onClick);
    addEventListener('resize', this.place); addEventListener('scroll', this.place, true);
    if (typeof ResizeObserver === 'function') { this.observer = new ResizeObserver(this.place); const s = options.stage(); if (s) this.observer.observe(s); }
  }

  /** The windows to show now (back to front) and whether the scene has the 2008 backdrop (backdrop.js). */
  show(specs: WindowSpec[], withBackdrop: boolean, scene = 0): void {
    this.scene = scene;
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
    const snap: HtmlSnapshot = { v: 1, frame: ++this.frame, scene: this.scene, mouse: null, focus: this.focus, windows, tasks: [], cursor: null, chatAvatars: this.options.chatAvatars?.() ?? [] };
    this.last = snap;
    this.render(snap, new Set(windows.map(w => w.id)), this.api);
    this.host.hidden = !windows.length;
    this.bubbles();
    this.pageModules();
  }
  // All Chat's speech bubbles (main's chat-bubbles.js, as bridge.js runs it each frame): each draw and each second,
  // which times the bubbles out and follows the avatars
  private bubbles(): void {
    if (this.disposed || !this.last) return;
    try { chatBubblesFrame({ ...this.last, chatAvatars: this.options.chatAvatars?.() ?? [] }); } catch (e) { console.warn('htmlui: chat bubbles', e); }
  }
  // each draw and each second: what main's screens drew late gets its tags
  private pageModules(): void {
    if (this.disposed) return;
    // a screen may draw later than its update (lobby.js: the bar's keys once its atlas has loaded): tag again
    for (const spec of this.specs) { const root = this.roots.get(spec.win.id); if (root) this.tag(spec.win, root); }
    try { this.options.frame?.(this.last); } catch (e) { console.warn('htmlui: page modules', e); }
  }

  // main's backdrop.js under the stage: it places itself over a "canvas", here an invisible box kept over the stage
  private backdrop(): void {
    if (!this.wantBackdrop && !this.bd) return;
    if (!this.bd) { this.bd = backdrop(this.box); this.place(); }
    const layer = document.getElementById('mu-titlebg');
    if (layer) layer.style.display = this.wantBackdrop ? '' : 'none';
    if (this.wantBackdrop) this.bd.frame({ backdrop: { shown: true } });
  }

  private place = (): void => {
    const stage = this.options.stage(); if (!stage) return;
    const r = stage.getBoundingClientRect(), s = r.width / 1024 || 1;
    this.scale = s;
    Object.assign(this.host.style, { left: r.left + 'px', top: r.top + 'px', transform: `scale(${s})` });
    Object.assign(this.box.style, { position: 'fixed', zIndex: '-1', pointerEvents: 'none', visibility: 'hidden', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.width * 0.75 + 'px' });
  };

  // The control an event's own element stands for (tag(): the button main's pass-mode screen drew for it), when that
  // control's looks are the layer's to give (a window main runs in pass mode); never found by the pointer's position
  private control(t: EventTarget | null): number {
    for (let el = t instanceof Element ? t : null; el && el !== this.host; el = el.parentElement) {
      const id = this.elementIds.get(el); if (id !== undefined) return id;
    }
    return 0;
  }
  private looks(id: number): boolean {
    const win = id ? this.specs.find(s => s.handlers.has(id))?.win : undefined;
    return !!win && this.declared.get(win.cls) !== 'owned';
  }
  private setHover(id: number): void {
    if (id === this.hover) return;
    const was = this.hover; this.hover = id;
    if (this.pressed && id !== this.pressed) this.pressed = 0;
    this.handlers.get(was)?.pointer?.(false); this.handlers.get(id)?.pointer?.(true); this.handlers.get(id)?.over?.();
    this.draw();
  }
  // the pointer enters a control's element: its hover look (as the engine's onMain, which main's pass screens draw)
  private onOver = (e: PointerEvent): void => { const id = this.control(e.target); this.setHover(id && this.handlers.get(id)?.hover && this.looks(id) ? id : 0); };
  // it leaves the element: to another control's, or to none
  private onOut = (e: PointerEvent): void => {
    const to = e.relatedTarget as Node | null;
    if (to && this.host.contains(to)) { const id = this.control(to); this.setHover(id && this.handlers.get(id)?.hover && this.looks(id) ? id : 0); }
    else if (this.hover || this.pressed) { this.pressed = 0; this.setHover(0); this.draw(); }
  };
  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const id = this.control(e.target); if (!id || !this.looks(id) || !this.handlers.get(id)?.hover) return;
    this.hover = this.pressed = id; this.draw();
  };
  // main's shop.js and trade.js rebuild their windows on every change (the pressed look too), so the browser's click
  // lands on no button (the pressed one was replaced): there a release on the element of the control pressed clicks it
  private onUp = (e: PointerEvent): void => {
    const was = this.pressed; if (!was) return;
    this.pressed = 0;
    const win = this.specs.find(s => s.handlers.has(was))?.win;
    if (win && REBUILT.test(win.cls) && e.button === 0 && this.control(e.target) === was) { this.released = true; setTimeout(() => { this.released = false; }, 0); void this.api.click(was); }
    this.draw();
  };
  // Enter / Space on a focused control's button: its pressed look while held (the browser's own click follows)
  private onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const id = this.control(e.target); if (!id || !this.looks(id)) return;
    const p = e.type === 'keydown' ? id : 0;
    if (p !== this.pressed) { this.pressed = p; this.draw(); }
  };
  private onBlur = (): void => { if (this.pressed) { this.pressed = 0; this.draw(); } };
  // A module main runs in pass mode draws buttons the engine would click: the element clicked (or Enter / Space on it)
  // clicks its control. An owned screen's controls click themselves (their own listeners: controls/basic.js, lobby.js)
  private onClick = (e: MouseEvent): void => {
    if (this.clicked || this.released) return;
    const id = this.control(e.target);
    if (!id || !this.handlers.get(id)?.click || !this.looks(id)) return;
    void this.api.click(id);
  };

  /** main's module, owned, with what the rewrite adds after each update: data-key / aria-label on the elements that
   * stand for the controls that have them (found by where they are: main's screens place one per control). */
  private wrap(mod: HtmlUiScreen): HtmlUiScreen {
    // the shop's and the trade's roots overlap (the mileage plate over the item window's Confirm): as on main, where the
    // engine has the pointer, only their buttons take it
    return { ...mod, mode: PASS.has(mod) ? 'pass' : 'owned', ...(mod === shop || mod === trade ? { rootInput: 'none' } : {}),
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
    const now = new Set<HTMLElement>();
    for (const c of win.controls) {
      const h = spec.handlers.get(c.id); if (!h || !c.shown) continue;   // a hidden control's element keeps no key
      const input = !!(h.text || h.enter);
      // a tab main's chat.js relabels ('TRADE' -> 'Trade', '(2)' unread) and moves along the bar: found by its label
      const plain = (t: string) => t.replace(/\s*\(\d+\+?\)\s*$/, '').trim().toLowerCase();
      const tab = c.cls === 'CWindowTaskTab' ? els.find(e => e.el.tagName === 'BUTTON' && plain(e.el.textContent ?? '') === plain(String(c.label ?? '')))?.el : undefined;
      const at = tab ?? els.filter(e => (input ? /^(INPUT|TEXTAREA)$/.test(e.el.tagName) : e.el.tagName === 'BUTTON') &&
        e.x >= c.x && e.x < c.x + c.w && e.y >= c.y && e.y < c.y + c.h).sort((a, b) => a.area - b.area)[0]?.el;
      if (!at) continue;
      this.elementIds.set(at, c.id);
      // a pass-mode screen's button (tabIndex -1: the game had the keys) is a real one here: focusable, Enter / Space
      if (at instanceof HTMLButtonElement && at.tabIndex < 0 && this.declared.get(win.cls) !== 'owned' && h.click) at.tabIndex = 0;
      // a pass-mode screen shows a disabled control's look only: the element says it too (keyboard, tests, a11y)
      if (at instanceof HTMLButtonElement && c.state !== undefined) at.disabled = c.state === 'disabled' || !c.enabled;
      if (h.key && at.dataset.key !== h.key) at.dataset.key = h.key;
      if (h.label && at.getAttribute('aria-label') !== h.label) at.setAttribute('aria-label', h.label);
      now.add(at);
    }
    // an element keyed before whose control is gone or hidden (main's screens keep the element): its key goes
    for (const el of this.tagged.get(root) ?? []) if (!now.has(el)) { delete el.dataset.key; this.elementIds.delete(el); }
    if (this.hover && !this.handlers.has(this.hover)) this.hover = 0;
    this.tagged.set(root, now);
  }

  dispose(): void {
    this.disposed = true;
    this.observer?.disconnect();
    removeEventListener('resize', this.place); removeEventListener('scroll', this.place, true);
    if (this.tick) clearInterval(this.tick);
    this.host.remove(); this.box.remove(); document.getElementById('mu-titlebg')?.remove();
  }
}
