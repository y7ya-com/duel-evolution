// The deck editor's engine side in the page (browser only): what main's deck screen (screens/deck.js, pass mode) leaves
// to the game. On main the engine draws under the DOM what the module cuts holes for (the card pictures, the trunk's
// count box, the detail's big card and power icons) and takes the mouse on its canvas (#canvas: main's trunk scroller,
// its right-click / double-click moves and every press the DOM lets through land there). Here the rewrite is that
// engine: a layer under main's windows draws the holes' content from the original art the rewrite loads, and a
// transparent #canvas under them takes the mouse and hands it to the editor (deck-scene.ts) in game pixels.
import { plan } from '@htmlui/screens/deck.js';
import type { HtmlWindow, WindowSpec } from './snapshot';
import { texCard } from './deck';

export interface ArtLease { url: string; release(): void }
export interface DeckStageOptions {
  /** main's ui/ art (atlases), as the layer has it. */
  art: string;
  card?(passcode: number, signal: AbortSignal): Promise<ArtLease>;
  archive?(path: string, signal: AbortSignal): Promise<ArtLease>;
  /** The mouse in game pixels (down / move / up, the left button). */
  input(type: 'down' | 'move' | 'up', x: number, y: number): void;
}
/** What the detail's power strip shows a monster (its race, attribute and level icons, holes in main's module). */
export interface PowerIcons { race: number; attr: number; level: number }

const DECK_CLASSES = new Set(['CWindowModelDeck', 'CWindowModelKaban', 'CCardDetailViewDlg', 'CWindowModelFileList']);
const CARD_BACK = 'data/card/0000.png';
interface Entry { url: string | null; lease: ArtLease | null; abort: AbortController; images: Set<HTMLImageElement>; used: number; failed: boolean }

export class DeckStage {
  readonly canvas: HTMLElement;
  private faces: HTMLElement; private ghost: HTMLImageElement;
  private roots = new Map<number, { el: HTMLElement; key: string }>();
  private art = new Map<string, Entry>(); private frame = 0; private disposed = false;
  private active = false;

  constructor(private host: HTMLElement, private options: DeckStageOptions) {
    // under main's backdrop and windows (the host's own layers come after): the faces, then the mouse's surface
    this.faces = document.createElement('div');
    this.faces.className = 'htmlui-deck-faces';
    // its own stacking context (z 0), so its windows' depths order them among themselves only, under main's layers
    Object.assign(this.faces.style, { position: 'absolute', left: '0', top: '0', width: '1024px', height: '768px', pointerEvents: 'none', overflow: 'hidden', zIndex: '0' });
    // the canvas main's modules look up by id (one for the session: quickInstall keeps the element it found)
    this.canvas = document.getElementById('canvas') ?? document.createElement('div');
    this.canvas.id = 'canvas';
    Object.assign(this.canvas.style, { position: 'absolute', left: '0', top: '0', width: '1024px', height: '768px', pointerEvents: 'none' });
    host.prepend(this.faces, this.canvas);
    this.ghost = document.createElement('img');
    this.ghost.alt = ''; this.ghost.draggable = false;
    Object.assign(this.ghost.style, { position: 'absolute', width: '50px', height: '72px', pointerEvents: 'none', display: 'none', zIndex: '10' });
    host.append(this.ghost);
    const game = (e: MouseEvent): [number, number] => { const r = this.canvas.getBoundingClientRect(), k = r.width / 1024 || 1; return [(e.clientX - r.left) / k, (e.clientY - r.top) / k]; };
    const on = (type: 'down' | 'move' | 'up') => (e: MouseEvent) => { if (!this.active || type !== 'move' && e.button !== 0) return; const [x, y] = game(e); this.options.input(type, x, y); };
    this.canvas.addEventListener('mousedown', on('down'));
    this.canvas.addEventListener('mousemove', on('move'));
    this.canvas.addEventListener('mouseup', on('up'));
    // a press on the canvas that ends outside it (a drag past the stage) still ends
    addEventListener('mouseup', this.release, true);
    // the game has no context menu over the editor (main's right-click move handles it first)
    this.canvas.addEventListener('contextmenu', e => { if (this.active) e.preventDefault(); });
  }
  private release = (e: MouseEvent): void => { if (this.active && e.target !== this.canvas && e.button === 0 && !this.host.contains(e.target as Node)) { const r = this.canvas.getBoundingClientRect(), k = r.width / 1024 || 1; this.options.input('up', (e.clientX - r.left) / k, (e.clientY - r.top) / k); } };

  /** The deck windows shown now (none: the editor is closed), the detail's card and power icons, the card dragged. */
  show(specs: readonly WindowSpec[], detail: { passcode: number; power: PowerIcons | null } | null, drag: { passcode: number; at: [number, number] } | null): void {
    if (this.disposed) return;
    const wins = specs.map(s => s.win).filter(w => DECK_CLASSES.has(w.cls));
    this.active = wins.some(w => w.cls === 'CWindowModelDeck');
    this.canvas.style.pointerEvents = this.active ? 'auto' : 'none';
    this.frame++;
    const seen = new Set<number>();
    for (const win of wins) { seen.add(win.id); this.draw(win, win.cls === 'CCardDetailViewDlg' ? detail : null); }
    for (const [id, r] of this.roots) if (!seen.has(id)) { r.el.remove(); this.roots.delete(id); }
    if (drag) {
      Object.assign(this.ghost.style, { display: '', left: drag.at[0] - 25 + 'px', top: drag.at[1] - 36 + 'px' });
      this.image(`card:${drag.passcode}`, this.ghost, s => this.options.card?.(drag.passcode, s));
    } else this.ghost.style.display = 'none';
    this.prune();
  }

  // One window's engine pixels: its card faces (parts and extras on data/MINI), the detail's big card and power icons
  // (its holes), the trunk's count box (a swf), and what main's module leaves to the engine under those holes (plan's
  // co-drawn items: the count text), painter's order by world z.
  private draw(win: HtmlWindow, detail: { passcode: number; power: PowerIcons | null } | null): void {
    const key = JSON.stringify([win, detail], (k, v) => k === 'mouse' || k === 'scene' ? undefined : v);
    let r = this.roots.get(win.id);
    if (r?.key === key) { for (const img of r.el.querySelectorAll('img')) this.touch(img); return; }
    if (!r) { const el = document.createElement('div'); el.style.position = 'absolute'; this.faces.append(el); r = { el, key: '' }; this.roots.set(win.id, r); }
    r.key = key;
    const root = r.el, ox = win.x, oy = win.y;
    Object.assign(root.style, { left: ox + 'px', top: oy + 'px', width: win.w + 'px', height: win.h + 'px', zIndex: String(win.z), overflow: 'visible' });
    root.replaceChildren();
    const items: { z: number; draw(): void }[] = [];
    const sprites = [...(win.extras ?? []) as Record<string, unknown>[], ...win.controls.flatMap(c => c.shown && c.x < 9999 ? ((c.parts as { sprites?: Record<string, unknown>[] } | undefined)?.sprites ?? []) : [])];
    for (const s of sprites) {
      const pc = typeof s.tex === 'string' && s.shown ? texCard(s.tex) : null; if (pc === null) continue;
      const src = s.src as number[], x = Number(s.wx), y = Number(s.wy), w = src[2]! * Number(s.sx ?? 1), h = src[3]! * Number(s.sy ?? 1), col = (s.col as number[] | undefined)?.[0] ?? 1;
      items.push({ z: Number(s.wz ?? 0), draw: () => { const img = this.card(root, pc, x - ox, y - oy, w, h); if (col !== 1) img.style.filter = `brightness(${col})`; } });
    }
    for (const c of win.controls) for (const f of ((c.parts as { swfs?: Record<string, unknown>[] } | undefined)?.swfs ?? [])) {
      // the trunk's count box (kabancnt_0: 72 x 21); the order / search keys are under main's search panel
      if (f.name === 'KabanCountBtn' && f.shown) items.push({ z: Number(f.wz ?? 0), draw: () => this.cell(root, 'kabancnt_0_j.png', 0, 0, 72, 21, Number(f.wx) - ox, Number(f.wy) - oy) });
    }
    if (detail && win.cls === 'CCardDetailViewDlg') {
      const holes = (win.holes ?? []) as { x: number; y: number; w: number; h: number }[];
      const big = holes[0];
      if (big) items.push({ z: 1e9, draw: () => { const img = this.card(root, detail.passcode, big.x, big.y, big.w, big.h); img.style.objectFit = 'contain'; } });
      const p = detail.power;
      if (p) holes.slice(1).forEach((h, i) => items.push({ z: 1e9, draw: () => {
        if (i === 0) this.cell(root, 'icon_syuzoku_01.png', 16 * p.race, 0, 16, 16, h.x, h.y);
        else if (i === 1) this.cell(root, 'icon_zokusei_01.png', 16 * p.attr, 0, 16, 16, h.x, h.y);
        else this.cell(root, 'icon_star_01.png', 0, 0, 19, 16, h.x, h.y, 16 / 19);
      } }));
    }
    // what main's module passes through under its holes, drawn by its own item (its sprite or text)
    const pl = plan(win, true), co = new Set(pl.co);
    for (const it of pl.items) if (co.has(it.id)) items.push({ z: it.z, draw: () => { const box = document.createElement('div'); box.style.position = 'absolute'; box.style.inset = '0'; it.draw(box); root.append(box); } });
    items.sort((a, b) => a.z - b.z).forEach(it => it.draw());
  }
  private card(root: HTMLElement, passcode: number, x: number, y: number, w: number, h: number): HTMLImageElement {
    const img = document.createElement('img');
    img.alt = ''; img.draggable = false; img.decoding = 'async';
    Object.assign(img.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
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
  }
  private touch(img: HTMLImageElement): void { for (const e of this.art.values()) if (e.images.has(img)) e.used = this.frame; }
  private prune(): void {
    for (const [code, e] of this.art) {
      for (const i of e.images) if (!i.isConnected) e.images.delete(i);
      if (!e.images.size && this.frame - e.used > 3) { e.abort.abort(); e.lease?.release(); this.art.delete(code); }
    }
  }

  dispose(): void {
    this.disposed = true;
    removeEventListener('mouseup', this.release, true);
    this.faces.remove(); this.ghost.remove();
    this.canvas.style.pointerEvents = 'none';
    for (const e of this.art.values()) { e.abort.abort(); e.lease?.release(); }
    this.art.clear();
  }
}
