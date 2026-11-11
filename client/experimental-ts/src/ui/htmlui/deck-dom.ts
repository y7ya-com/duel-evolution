// The deck editor's cards as DOM (browser and tests): what main's deck screen (screens/deck.js) cuts holes for (the card
// pictures, the trunk's count box, the detail's big card and power icons) as elements placed exactly over those holes,
// from the original art the rewrite loads, and the editor's mouse as real DOM handlers on them: a press picks a card up
// (deck-scene.ts pick), the release over a card or a zone drops it (dropOn), a double-click / right-click moves it
// (quick), the wheel scrolls the trunk; the side buttons, the Main / Fusion tabs and the detail's arrow are buttons.
// Every card element says what it is: data-zone (trunk / main / side / extra), data-index, data-passcode, aria-label.
import { plan } from '@htmlui/screens/deck.js';
import type { HtmlWindow, WindowSpec } from './snapshot';
import { texCard, SIDE_BUTTONS } from './deck';
import type { DeckFrom } from './deck';
import type { DeckScene } from './deck-scene';

export interface ArtLease { url: string; release(): void }
export interface DeckDomOptions {
  /** main's ui/ art (atlases), as the layer has it. */
  art: string;
  card?(passcode: number, signal: AbortSignal): Promise<ArtLease>;
  archive?(path: string, signal: AbortSignal): Promise<ArtLease>;
}
/** What the detail's power strip shows a monster (its race, attribute and level icons, holes in main's module). */
export interface PowerIcons { race: number; attr: number; level: number }

const DECK_CLASSES = new Set(['CWindowModelDeck', 'CWindowModelKaban', 'CCardDetailViewDlg', 'CWindowModelFileList']);
const CARD_BACK = 'data/card/0000.png';
interface Entry { url: string | null; lease: ArtLease | null; abort: AbortController; images: Set<HTMLImageElement>; used: number; failed: boolean }
type Ev = { button?: number; clientX?: number; clientY?: number; deltaY?: number; preventDefault?(): void; stopPropagation?(): void };
const ZONES: Record<'main' | 'side' | 'extra' | 'trunk', [number, number, number, number]> = { main: [256, 88, 472, 496], side: [256, 616, 472, 88], extra: [256, 88, 472, 616], trunk: [744, 88, 256, 616] };

export class DeckDom {
  readonly el: HTMLElement;
  private ghost: HTMLImageElement; private controls: HTMLElement; private zones: HTMLElement;
  private roots = new Map<number, { el: HTMLElement; key: string }>();
  private art = new Map<string, Entry>(); private frame = 0; private disposed = false;
  private active = false; private zonesKey = '';

  constructor(private host: HTMLElement, private scene: DeckScene, private options: DeckDomOptions) {
    // over main's windows (each window's cards at its depth), under its modal lists and dialogs
    this.el = document.createElement('div');
    this.el.className = 'htmlui-deck-cards';
    Object.assign(this.el.style, { position: 'absolute', left: '0', top: '0', width: '1024px', height: '768px', pointerEvents: 'none' });
    this.zones = document.createElement('div'); this.controls = document.createElement('div');
    this.ghost = document.createElement('img');
    this.ghost.alt = ''; this.ghost.draggable = false;
    Object.assign(this.ghost.style, { position: 'absolute', width: '50px', height: '72px', pointerEvents: 'none', display: 'none', zIndex: '60000' });
    this.el.append(this.zones, this.controls, this.ghost);
    host.append(this.el);
    globalThis.addEventListener?.('mousemove', this.move as never, true);
    globalThis.addEventListener?.('mouseup', this.release as never, true);
  }
  /** Move the layer into the HTML layer's host (it loads after the client mounts). */
  attach(host: HTMLElement): void { this.host = host; host.append(this.el); }
  private game(e: Ev): [number, number] {
    const r = this.el.getBoundingClientRect?.(), k = r && r.width ? r.width / 1024 : 1;
    return [((e.clientX ?? 0) - (r?.left ?? 0)) / k, ((e.clientY ?? 0) - (r?.top ?? 0)) / k];
  }
  private move = (e: Ev): void => { if (this.active && this.scene.ui.drag) this.scene.dragTo(this.game(e)); };
  // a release that no card or zone took (outside the editor's zones): the held card goes back. After the whole dispatch
  // (a task, not a microtask: a microtask runs as soon as this capture listener returns, before the card's or zone's own
  // mouseup could take the drop)
  private release = (e: Ev): void => { if (this.active && this.scene.ui.drag && e.button === 0) setTimeout(() => { if (this.scene.ui.drag) this.scene.dropOn(null, null); }, 0); };
  private box(parent: HTMLElement, tag: string, x: number, y: number, w: number, h: number): HTMLElement {
    const d = document.createElement(tag); Object.assign(d.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' }); parent.append(d); return d;
  }
  // the editor's input on one element: a card (pick / drop on it / quick move) or a zone (drop)
  private wire(node: HTMLElement, zone: DeckFrom, index: number, passcode: number): void {
    node.dataset.zone = zone; node.dataset.index = String(index);
    if (passcode > 0) {
      node.dataset.passcode = String(passcode);
      node.setAttribute('aria-label', this.scene.card(passcode)?.name ?? `Card ${passcode}`);
      node.addEventListener('mousedown', ((e: Ev) => { if (e.button !== 0) return; e.preventDefault?.(); this.scene.pick(zone, index, passcode, this.game(e)); }) as never);
      node.addEventListener('dblclick', ((e: Ev) => { e.preventDefault?.(); this.scene.quick(zone, index, passcode); }) as never);
      node.addEventListener('contextmenu', ((e: Ev) => { e.preventDefault?.(); this.scene.quick(zone, index, passcode); }) as never);
    }
    node.addEventListener('mouseup', ((e: Ev) => { if (e.button !== 0 || !this.scene.ui.drag) return; e.stopPropagation?.(); this.scene.dropOn(zone, zone === 'trunk' || passcode <= 0 ? null : index); }) as never);
    if (zone === 'trunk') node.addEventListener('wheel', ((e: Ev) => { e.preventDefault?.(); this.scene.wheel((e.deltaY ?? 0) > 0 ? 1 : -1); }) as never);
  }

  /** The deck windows shown now (none: the editor is closed), the detail's card and power icons, the card dragged. */
  show(specs: readonly WindowSpec[], detail: { passcode: number; power: PowerIcons | null } | null, drag: { passcode: number; at: [number, number] } | null): void {
    if (this.disposed) return;
    const wins = specs.map(s => s.win).filter(w => DECK_CLASSES.has(w.cls));
    const modal = !!(this.scene.ui.files || this.scene.ui.dialog);
    this.active = wins.some(w => w.cls === 'CWindowModelDeck');
    this.frame++;
    const seen = new Set<number>();
    for (const win of wins) { seen.add(win.id); this.draw(win, win.cls === 'CCardDetailViewDlg' ? detail : null); }
    for (const [id, r] of this.roots) if (!seen.has(id)) { r.el.remove(); this.roots.delete(id); }
    this.chrome(this.active && !modal);
    if (drag) {
      Object.assign(this.ghost.style, { display: '', left: drag.at[0] - 25 + 'px', top: drag.at[1] - 36 + 'px' });
      this.image(`card:${drag.passcode}`, this.ghost, s => this.options.card?.(drag.passcode, s));
    } else this.ghost.style.display = 'none';
    this.prune();
  }
  // the scene's buttons (side menu, tabs, the detail's arrow) and the drop zones (taking the mouse only while a card is held)
  private chrome(on: boolean): void {
    const ui = this.scene.ui, key = JSON.stringify([on, ui.view, ui.detail, !!ui.drag]);
    if (key === this.zonesKey) return;
    this.zonesKey = key;
    this.zones.replaceChildren(); this.controls.replaceChildren();
    if (!on) return;
    for (const z of (ui.view === 'extra' ? ['extra', 'trunk'] : ['main', 'side', 'trunk']) as (keyof typeof ZONES)[]) {
      const [x, y, w, h] = ZONES[z], d = this.box(this.zones, 'div', x, y, w, h);
      d.className = 'htmlui-deck-zone'; d.style.pointerEvents = ui.drag ? 'auto' : 'none'; d.style.zIndex = '1';
      d.dataset.dropZone = z; this.wire(d, z, -1, 0);
    }
    const button = (label: string, x: number, y: number, w: number, h: number, run: () => void, extra?: (b: HTMLElement) => void) => {
      const b = this.box(this.controls, 'button', x, y, w, h);
      b.className = 'htmlui-deck-button'; b.setAttribute('aria-label', label); b.dataset.key = `deck-${label.toLowerCase().replace(/\W+/g, '-')}`;
      Object.assign(b.style, { pointerEvents: 'auto', background: 'transparent', border: '0', padding: '0', cursor: 'pointer', zIndex: '50000' });
      b.onclick = run; extra?.(b);
    };
    const labels: Record<string, string> = { LoadBtn: 'Load Deck', SaveBtn: 'Save Deck', RecipeBtn: 'Structure Deck', ClearBtn: 'Clear Deck', ExitBtn: 'Exit' };
    SIDE_BUTTONS.forEach((name, i) => button(labels[name] ?? name, 0, 40 + 27 * i, 176, 27, () => this.scene.sideButton(name), b => {
      b.addEventListener('mouseenter', () => this.scene.hover(name)); b.addEventListener('mouseleave', () => this.scene.hover(null));
    }));
    button('Main Deck', 256, 56, 194, 28, () => this.scene.tab('main'));
    button('Fusion Deck', 450, 56, 192, 28, () => this.scene.tab('extra'));
    button(ui.detail === 0 ? 'Collapse card detail' : 'Expand card detail', 229, ui.detail === 2 ? 711 : 175, 16, 24, () => this.scene.toggleDetail());
  }
  // One window's cards and art (main's holes): its card faces (deck cards and trunk rows: elements that take the mouse),
  // the detail's big card and power icons, the trunk's count box, and what main's module co-draws under those holes
  // (plan's co-drawn items: the count text), painter's order by world z.
  private draw(win: HtmlWindow, detail: { passcode: number; power: PowerIcons | null } | null): void {
    const top = this.scene.ui.top, key = JSON.stringify([win, detail, top], (k, v) => k === 'mouse' || k === 'scene' ? undefined : v);
    let r = this.roots.get(win.id);
    if (r?.key === key) { for (const img of r.el.querySelectorAll('img')) this.touch(img as HTMLImageElement); return; }
    if (!r) { const el = document.createElement('div'); el.style.position = 'absolute'; this.el.insertBefore?.(el, this.controls) ?? this.el.append(el); r = { el, key: '' }; this.roots.set(win.id, r); }
    r.key = key;
    const root = r.el, ox = win.x, oy = win.y;
    Object.assign(root.style, { left: ox + 'px', top: oy + 'px', width: win.w + 'px', height: win.h + 'px', zIndex: String(win.z + (win.cls === 'CWindowModelFileList' ? 1 : 0)), overflow: 'visible' });   // the list's rows over main's text
    root.replaceChildren();
    const items: { z: number; draw(): void }[] = [];
    for (const s of (win.extras ?? []) as Record<string, unknown>[]) {
      const pc = typeof s.tex === 'string' && s.shown ? texCard(s.tex) : null; if (pc === null) continue;
      const src = s.src as number[], x = Number(s.wx), y = Number(s.wy), w = src[2]! * Number(s.sx ?? 1), h = src[3]! * Number(s.sy ?? 1), col = (s.col as number[] | undefined)?.[0] ?? 1;
      items.push({ z: Number(s.wz ?? 0), draw: () => { const img = this.card(root, pc, x - ox, y - oy, w, h); if (col !== 1) img.style.filter = `brightness(${col})`; } });
    }
    for (const c of win.controls) {
      if (!c.shown || c.x >= 9999) continue;
      // which card this control is: a deck grid's slot (zone, index) or a trunk row (the trunk list's index)
      const pc = Number(c.passcode ?? 0), deckCard = c.cls === 'CWindowTaskDeckCard' && Number(c.card) > 0, row = c.cls === 'CWindowTaskKabanListBtn' && Number(c.card) > 0;
      const zone: DeckFrom | null = deckCard ? c.zone as DeckFrom : row ? 'trunk' : null, index = deckCard ? Number(c.index) : row ? top + Number(c.card) - 1 : -1;
      for (const s of ((c.parts as { sprites?: Record<string, unknown>[] } | undefined)?.sprites ?? [])) {
        const spc = typeof s.tex === 'string' && s.shown ? texCard(s.tex) : null; if (spc === null) continue;
        const src = s.src as number[], x = Number(s.wx), y = Number(s.wy), w = src[2]! * Number(s.sx ?? 1), h = src[3]! * Number(s.sy ?? 1), col = (s.col as number[] | undefined)?.[0] ?? 1;
        items.push({ z: Number(s.wz ?? 0), draw: () => {
          const img = this.card(root, spc, x - ox, y - oy, w, h); if (col !== 1) img.style.filter = `brightness(${col})`;
          if (zone && pc > 0) { img.style.pointerEvents = 'auto'; img.style.cursor = 'pointer'; this.wire(img, zone, index, pc); }
        } });
      }
      // a trunk row takes the mouse over its whole width (main's row: the picture is its left end)
      if (row && pc > 0) items.push({ z: Number(c.wz ?? c.z ?? 0) - 0.5, draw: () => {
        const d = this.box(root, 'div', Number(c.wx) - ox, Number(c.wy) - oy, Number(c.w), Number(c.h)); d.className = 'htmlui-deck-row'; d.style.pointerEvents = 'auto'; this.wire(d, 'trunk', index, pc);
      } });
    }
    // a row of the Load / Save / Structure Deck list: a press chooses it (main's screen draws the rows as text only; on
    // main the engine had the pointer)
    if (win.cls === 'CWindowModelFileList') {
      const top = Number(win.controls.find(c => c.name === 'FileListlistbox')?.top ?? 0);
      for (const c of win.controls) {
        const m = /^FileListrow(\d+)$/.exec(c.name); if (!m || !c.shown) continue;
        const i = top + Number(m[1]);
        items.push({ z: 1e9, draw: () => {
          const b = this.box(root, 'button', Number(c.wx) - ox, Number(c.wy) - oy, Number(c.w), Number(c.h)) as HTMLButtonElement;
          b.type = 'button'; b.className = 'htmlui-deck-file-row'; b.setAttribute('aria-label', String(c.text ?? '')); b.dataset.fileRow = String(i);
          Object.assign(b.style, { pointerEvents: 'auto', background: 'transparent', border: '0', padding: '0', margin: '0', cursor: 'pointer' });
          b.onclick = () => this.scene.fileRow(i);
        } });
      }
    }
    for (const c of win.controls) for (const f of ((c.parts as { swfs?: Record<string, unknown>[] } | undefined)?.swfs ?? [])) {
      // the trunk's count box (kabancnt_0: 72 x 21); the order / search keys are under main's search panel
      if (f.name === 'KabanCountBtn' && f.shown) items.push({ z: Number(f.wz ?? 0), draw: () => this.cell(root, 'kabancnt_0_j.png', 0, 0, 72, 21, Number(f.wx) - ox, Number(f.wy) - oy) });
    }
    if (detail && win.cls === 'CCardDetailViewDlg') {
      const holes = (win.holes ?? []) as { x: number; y: number; w: number; h: number }[];
      const big = holes[0];
      if (big) items.push({ z: 1e9, draw: () => { const img = this.card(root, detail.passcode, big.x, big.y, big.w, big.h); img.style.objectFit = 'contain'; img.dataset.detail = String(detail.passcode); if (detail.passcode > 0) img.setAttribute('aria-label', this.scene.card(detail.passcode)?.name ?? `Card ${detail.passcode}`); } });
      const p = detail.power;
      if (p) holes.slice(1).forEach((h, i) => items.push({ z: 1e9, draw: () => {
        if (i === 0) this.cell(root, 'icon_syuzoku_01.png', 16 * p.race, 0, 16, 16, h.x, h.y);
        else if (i === 1) this.cell(root, 'icon_zokusei_01.png', 16 * p.attr, 0, 16, 16, h.x, h.y);
        else this.cell(root, 'icon_star_01.png', 0, 0, 19, 16, h.x, h.y, 16 / 19);
      } }));
    }
    // what main's module leaves under its holes, drawn by its own item (its sprite or text), over the faces
    const pl = plan(win, true), co = new Set(document.head ? pl.co : []);   // (no head: a test document, no styled text)
    for (const it of pl.items) if (co.has(it.id)) items.push({ z: it.z, draw: () => { const box = document.createElement('div'); Object.assign(box.style, { position: 'absolute', inset: '0', pointerEvents: 'none' }); it.draw(box); root.append(box); } });
    items.sort((a, b) => a.z - b.z).forEach(it => it.draw());
  }
  private card(root: HTMLElement, passcode: number, x: number, y: number, w: number, h: number): HTMLImageElement {
    const img = document.createElement('img');
    img.alt = ''; img.draggable = false; img.decoding = 'async';
    Object.assign(img.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', pointerEvents: 'none' });
    root.append(img);
    if (passcode > 0) this.image(`card:${passcode}`, img, s => this.options.card?.(passcode, s));
    else this.image(`archive:${CARD_BACK}`, img, s => this.options.archive?.(CARD_BACK, s));
    return img;
  }
  // an atlas cell, crisp (the engine's point sampling) at its own size, or scaled
  private cell(root: HTMLElement, name: string, u: number, v: number, w: number, h: number, x: number, y: number, k = 1): void {
    const d = document.createElement('div');
    Object.assign(d.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', backgroundImage: `url(${this.options.art}${name})`,
      backgroundPosition: `${-u}px ${-v}px`, backgroundRepeat: 'no-repeat', imageRendering: 'pixelated', transform: k === 1 ? '' : `scale(${k})`, transformOrigin: '0 0' });
    root.append(d);
  }

  // leased card art, shared by every picture of the same card, released a few frames after its last use
  private image(code: string, img: HTMLImageElement, load: (signal: AbortSignal) => Promise<ArtLease> | undefined): void {
    let e = this.art.get(code);
    if (!e) {
      e = { url: null, lease: null, abort: new AbortController(), images: new Set(), used: this.frame, failed: false };
      this.art.set(code, e);
      const entry = e, p = load(e.abort.signal);
      if (!p) entry.failed = true;
      else void p.then(lease => {
        if (this.disposed || entry.abort.signal.aborted) { lease.release(); return; }
        entry.lease = lease; entry.url = lease.url;
        for (const i of entry.images) i.src = lease.url;
      }).catch(() => { entry.failed = true; });
    }
    e.used = this.frame; e.images.add(img);
    if (e.url) img.src = e.url;
    // art that fails to decode is unpinned at once and not asked for again while it stays in use
    const entry = e;
    img.onerror = () => {
      if (!entry.lease) return;
      entry.failed = true; entry.url = null; entry.lease.release(); entry.lease = null;
      for (const i of entry.images) { i.removeAttribute('src'); i.style.visibility = 'hidden'; }
    };
  }
  private touch(img: HTMLImageElement): void { for (const e of this.art.values()) if (e.images.has(img)) e.used = this.frame; }
  private prune(): void {
    for (const [code, e] of this.art) {
      // a picture no longer on the page lets go of the art's URL (its lease may live on in the card's other pictures)
      for (const i of e.images) if (i.isConnected === false) { e.images.delete(i); i.removeAttribute('src'); i.onerror = null; }
      if (!e.images.size && this.frame - e.used > 3) { e.abort.abort(); e.lease?.release(); this.art.delete(code); }
    }
  }

  dispose(): void {
    this.disposed = true;
    globalThis.removeEventListener?.('mousemove', this.move as never, true);
    globalThis.removeEventListener?.('mouseup', this.release as never, true);
    this.el.remove();
    for (const e of this.art.values()) { e.abort.abort(); e.lease?.release(); }
    this.art.clear();
  }
}
