// What the engine draws on the title under the controls, drawn by the rewrite: the title movie (CTitleScene's Flash
// movie data/title/title_flash_01.txt, 73 frames at 30 fps, played once and held on its last frame: the Yu-Gi-Oh! ONLINE
// logo and the two characters sliding in) over the 2008 backdrop (main's backdrop.js, the layer's). As live shows it:
// rt/debrand.cpp drops the KONAMI badge (depth 21), the copyright line (23) and QUIT (25) from the movie; its other
// buttons (DefineButton2: ONLINE 40, OPTIONS 37, and in free mode rows 3 and 4, 33 and 29, captioned DECK EDITOR and
// FREE DUEL by rt/freetitle.cpp, ported below) stay the movie's art, with real HTML buttons over them (`controls`) that
// give each its normal / hover / pressed frame. One 1024 x 768 canvas, pointer-transparent, and the buttons' layer.
import { parseSwfText, SwfInstance, type SwfMovie } from '../../duel/swf-text';
import type { ArchiveLoader } from '../duel-fx';
import { drawSwfItems } from './start-scene';

export const TITLE_MOVIE = 'data/title/title_flash_01.txt';
/** rt/debrand.cpp TITLE_DROP in free mode (live): KONAMI 21, copyright 23, QUIT 25 (CLEAR 29 and WEB 33 stay). */
export const TITLE_DROP_DEPTHS: readonly number[] = [21, 23, 25];
export type TitleButton = 'online' | 'options' | 'deck' | 'free';
/** The movie's buttons, top to bottom: their depth and caption row (title_botton_<row>_<state>_?.png). */
export const TITLE_BUTTONS: readonly { name: TitleButton; depth: number; row: number; label: string }[] = [
  { name: 'online', depth: 40, row: 1, label: 'ONLINE' }, { name: 'options', depth: 37, row: 2, label: 'OPTIONS' },
  { name: 'deck', depth: 33, row: 3, label: 'DECK EDITOR' }, { name: 'free', depth: 29, row: 4, label: 'FREE DUEL' }];

/** rt/debrand.cpp filter_title: the dump without the PlaceObject2 / RemoveObject2 tags of the dropped depths. */
export function filterTitleMovie(text: string, drop: readonly number[] = TITLE_DROP_DEPTHS): string {
  const sep = '\nSWF::Element::Tag::';
  let out = '', at = 0;
  while (at < text.length) {
    let next = text.indexOf(sep, at + 1); if (next < 0) next = text.length;
    const tag = text.slice(at, next);
    let dropped = false;
    if (tag.startsWith(sep + 'PlaceObject2') || tag.startsWith(sep + 'RemoveObject2')) {
      const d = /Depth => (\d+)/.exec(tag);
      dropped = !!d && drop.includes(Number(d[1]));
    }
    if (!dropped) out += tag;
    at = next;
  }
  return out;
}

/** A bitmap of the movie's PngFileTable in the archive: '?' is the language letter (English 'e'). */
export function titleImagePath(file: string, language = 'e'): string { return `data/title/${file.replace('?', language.toLowerCase())}`; }

export class TitleScene {
  readonly element: HTMLCanvasElement;
  /** The movie's buttons as HTML buttons over their art (pressable once the movie has played, as freemode.c). */
  readonly controls: HTMLElement;
  private readonly buttons = new Map<TitleButton, HTMLButtonElement>();
  private readonly states = new Map<number, number>();
  private press: (name: TitleButton) => void = () => {};
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly abort = new AbortController();
  private movie: SwfMovie | null = null; private loading = false; private instance: SwfInstance | null = null;
  private readonly images = new Map<string, CanvasImageSource | null>();
  private timer: ReturnType<typeof setInterval> | null = null; private disposed = false; private reducedMotion = false;
  constructor(private readonly load: ArchiveLoader) {
    this.element = document.createElement('canvas');
    this.element.width = 1024; this.element.height = 768;
    this.element.className = 'de-title-scene'; this.element.setAttribute('aria-hidden', 'true');
    Object.assign(this.element.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '0' });
    this.ctx = this.element.getContext('2d');
    this.controls = document.createElement('div'); this.controls.className = 'de-title-buttons';
    Object.assign(this.controls.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '1' });
    for (const b of TITLE_BUTTONS) {
      const el = document.createElement('button'); el.type = 'button'; el.className = 'de-title-button'; el.textContent = b.label; el.dataset.key = `title-${b.name}`;
      // the movie draws the plate and its caption; the button is its hit area, focus ring and accessible name
      Object.assign(el.style, { position: 'absolute', padding: '0', margin: '0', border: '0', background: 'transparent', color: 'transparent', boxShadow: 'none', textShadow: 'none', clipPath: 'polygon(6.5% 0,100% 0,93.5% 100%,0 100%)', cursor: 'pointer', font: 'bold 16px Arial,sans-serif', pointerEvents: 'none', visibility: 'hidden' });
      const set = (state: number) => { if (this.states.get(b.depth) !== state) { this.states.set(b.depth, state); this.draw(); } };
      el.addEventListener('pointerenter', () => set(2)); el.addEventListener('pointerleave', () => set(1));
      el.addEventListener('pointerdown', () => set(4)); el.addEventListener('pointerup', () => set(el.matches(':hover') ? 2 : 1));
      el.addEventListener('focus', () => set(2)); el.addEventListener('blur', () => set(1));
      el.addEventListener('click', () => this.press(b.name));
      this.buttons.set(b.name, el); this.controls.append(el);
    }
  }
  /** What a button does (index.ts: ONLINE, OPTIONS, DECK EDITOR, FREE DUEL) and whether it can be pressed now. */
  wire(press: (name: TitleButton) => void, enabled: (name: TitleButton) => boolean): void {
    this.press = press;
    for (const [name, el] of this.buttons) el.disabled = !enabled(name);
  }
  /** Shown: plays the movie once from its first frame (reduced motion: straight to its last), then holds it. */
  show(reducedMotion: boolean): void {
    if (this.disposed) return;
    this.reducedMotion = reducedMotion;
    if (!this.movie) { this.loadMovie(); return; }
    if (!this.instance) this.start();
  }
  /** Hidden: the next show plays the movie from its start again. */
  hide(): void { if (this.timer) clearInterval(this.timer); this.timer = null; this.instance = null; }
  private start(): void {
    const movie = this.movie; if (!movie) return;
    this.instance = new SwfInstance(movie, movie.timeline, false);
    this.instance.buttonState = depth => this.states.get(depth) ?? 1;
    this.instance.step();
    if (this.reducedMotion) { while (!this.instance.ended && !this.instance.stopped) this.instance.step(); }
    else if (!this.timer) this.timer = setInterval(() => this.tick(), 1000 / movie.frameRate);
    this.draw();
  }
  private tick(): void {
    const i = this.instance; if (!i) return;
    const before = i.frame; i.step();
    if ((i.ended || i.stopped) && i.frame === before && this.timer) { clearInterval(this.timer); this.timer = null; }
    this.draw();
  }
  private loadMovie(): void {
    if (this.loading) return; this.loading = true;
    this.load(TITLE_MOVIE, this.abort.signal).then(async lease => {
      try {
        const movie = parseSwfText(filterTitleMovie(new TextDecoder().decode(await (await fetch(lease.url)).arrayBuffer())));
        this.captions();
        for (const file of movie.files) if (!FREE_CAPTION.test(file)) this.image(titleImagePath(file));
        this.movie = movie; if (!this.disposed) this.start();
      } finally { lease.release(); }
    }).catch(e => { this.loading = false; console.warn('title movie', e); });
  }
  private image(path: string): void {
    if (this.images.has(path)) return;
    this.images.set(path, null);
    this.load(path, this.abort.signal).then(lease => {
      const img = new Image(); img.decoding = 'async';
      img.onload = () => { this.images.set(path, img); lease.release(); this.draw(); };
      img.onerror = () => { lease.release(); console.warn('title image', path); };
      img.src = lease.url;
    }, e => console.warn('title image', path, e));
  }
  // rt/freetitle.cpp: rows 3 and 4's captions (normal, hover, pressed) rebuilt from the five rows' art as DECK EDITOR
  // and FREE DUEL, here at run time from the player's own archive, under the movie's file names
  private captions(): void {
    const paths: string[] = [];
    for (let state = 1; state <= 3; state++) for (let row = 1; row <= 5; row++) paths.push(`data/title/title_botton_0${row}_0${state}_e.png`);
    for (let state = 1; state <= 3; state++) for (const row of [3, 4]) this.images.set(`data/title/title_botton_0${row}_0${state}_e.png`, null);
    Promise.all(paths.map(path => this.load(path, this.abort.signal).then(lease => new Promise<ImageData | null>(done => {
      const img = new Image();
      img.onload = () => { lease.release(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); if (!x) return done(null); x.drawImage(img, 0, 0); done(x.getImageData(0, 0, c.width, c.height)); };
      img.onerror = () => { lease.release(); done(null); };
      img.src = lease.url;
    })))).then(datas => {
      if (this.disposed) return;
      for (let state = 1; state <= 3; state++) {
        const rows = [null, ...datas.slice((state - 1) * 5, state * 5)];
        if (rows.slice(1).some(r => !r || r.width !== CAP_W || r.height !== CAP_H)) { console.warn('title captions: button art not found'); return; }
        TITLE_FREE_TEXT.forEach((text, k) => {
          const out = freeCaption(text, rows as (ImageData | null)[]), c = document.createElement('canvas'); c.width = CAP_W; c.height = CAP_H;
          c.getContext('2d')?.putImageData(out, 0, 0);
          this.images.set(`data/title/title_botton_0${3 + k}_0${state}_e.png`, c);
        });
      }
      this.draw();
    }, e => console.warn('title captions', e));
  }
  private draw(): void {
    const ctx = this.ctx, movie = this.movie, instance = this.instance; if (!ctx || this.disposed) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 1024, 768);
    if (!movie || !instance) return;
    const items: Parameters<SwfInstance['draw']>[0] = []; instance.draw(items);
    drawSwfItems(ctx, items, movie, file => this.images.get(titleImagePath(file)), { x: 0, y: 0 });
    // the buttons over their plates: where the movie has them now, pressable once it has played
    const ready = instance.ended || instance.stopped;
    for (const b of TITLE_BUTTONS) {
      const el = this.buttons.get(b.name)!, p = instance.list.get(b.depth), c = p && movie.characters.get(p.character);
      const shape = c?.kind === 'button' ? c.records.map(r => movie.characters.get(r.character)).find(s => s?.kind === 'shape') : undefined;
      if (!p || !shape || shape.kind !== 'shape') { el.style.visibility = 'hidden'; continue; }
      const [x0, y0, x1, y1] = shape.bounds, m = p.matrix;
      const left = (m.tx + x0 * m.a) / 20, top = (m.ty + y0 * m.d) / 20, w = (x1 - x0) * m.a / 20, h = (y1 - y0) * m.d / 20;
      Object.assign(el.style, { left: `${left / 10.24}%`, top: `${top / 7.68}%`, width: `${w / 10.24}%`, height: `${h / 7.68}%`, visibility: 'visible', pointerEvents: ready ? 'auto' : 'none' });
      el.tabIndex = ready ? 0 : -1;
    }
  }
  dispose(): void { this.disposed = true; this.abort.abort(); if (this.timer) clearInterval(this.timer); this.timer = null; this.element.remove(); this.controls.remove(); }
}

// ---- rt/freetitle.cpp, ported: a caption = row 1's empty bar + glyph fill masks lifted from the English captions +
// the outline drawn again around the new string (1 px light above / left, medium below / right, a corner shade, 2 px
// dark, a half-dark row above). The art has no K: a stem and two diagonals of the other letters' weight.
const CAP_W = 384, CAP_H = 48, CAP_TOP = 12, CAP_BOTTOM = 37;
const FREE_CAPTION = /^title_botton_0[34]_0[123]_\?\.png$/;
export const TITLE_FREE_TEXT = ['DECK EDITOR', 'FREE DUEL'] as const;
/** Where each letter's fill lies in the English captions: caption row, x from, x to, re-widened width (0: as is). */
const SRC: readonly [string, number, number, number, number][] = [['O', 3, 51, 71, 0], ['F', 3, 73, 90, 0], ['I', 3, 112, 117, 0], ['C', 3, 119, 138, 0],
  ['L', 3, 169, 185, 0], ['E', 3, 226, 243, 0], ['T', 3, 295, 315, 0], ['D', 4, 46, 63, 19], ['R', 4, 236, 252, 18], ['U', 5, 177, 202, 21]];
type Rgba = [number, number, number, number];
const px = (im: ImageData, x: number, y: number): Rgba => { const i = (y * CAP_W + x) * 4, d = im.data; return [d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!]; };
const near = (p: Rgba, q: Rgba) => Math.abs(p[0] - q[0]) <= 60 && Math.abs(p[1] - q[1]) <= 60 && Math.abs(p[2] - q[2]) <= 60 && p[3] > 200;
function glyph(ch: string, rows: (ImageData | null)[], fill: Rgba): { m: Set<number>; width: number } {
  const m = new Set<number>(), key = (x: number, y: number) => y * 4096 + x;
  if (ch === 'K') {
    for (let y = CAP_TOP; y < CAP_BOTTOM; y++) { const a = 5 + Math.trunc((Math.abs(y - 24) * 2 + 1) / 3); for (let x = 0; x < 5; x++) m.add(key(x, y)); for (let x = a; x < a + 7 && x < 19; x++) m.add(key(x, y)); }
    return { m, width: 19 };
  }
  const s = SRC.find(e => e[0] === ch); if (!s) return { m, width: 0 };
  const [, row, x0, x1, wide] = s, im = rows[row]!, w = x1 - x0, want = wide || w, mid = Math.trunc(w / 2);
  const cols = Array.from({ length: w }, (_, i) => i);
  if (want < w) cols.splice(mid - Math.trunc((w - want) / 2), w - want); else cols.splice(mid, 0, ...Array(want - w).fill(mid));
  cols.forEach((c, i) => { for (let y = CAP_TOP; y < CAP_BOTTOM; y++) if (near(px(im, x0 + c, y), fill)) m.add(key(i, y)); });
  return { m, width: want };
}
/** rows[1..5]: one state's five captions; the new caption in that state. */
export function freeCaption(text: string, rows: (ImageData | null)[]): ImageData {
  const r3 = rows[3]!, fill = px(r3, 114, 24), light = px(r3, 111, 24), med = px(r3, 117, 24), corner = px(r3, 117, 11), dark = px(r3, 110, 19);
  const gl: { m: Set<number>; width: number }[] = []; let total = 0;
  for (let i = 0; i < text.length; i++) { const g = text[i] === ' ' ? { m: new Set<number>(), width: 8 } : glyph(text[i]!, rows, fill); gl.push(g); total += g.width + (i < text.length - 1 ? 2 : 0); }
  const M = new Set<number>(); let x = CAP_W / 2 - Math.trunc(total / 2);
  for (const g of gl) { for (const k of g.m) M.add(k + x); x += g.width + 2; }
  const out = new ImageData(new Uint8ClampedArray(rows[1]!.data), CAP_W, CAP_H), d = out.data;
  for (let y = 0; y < CAP_H; y++) for (let xx = 61; xx < 330; xx++) for (let i = 0; i < 4; i++) d[(y * CAP_W + xx) * 4 + i] = d[(y * CAP_W + 60) * 4 + i]!;
  const f = (a: number, b: number) => a >= 0 && b >= 0 && M.has(b * 4096 + a);
  const put = (a: number, b: number, c: Rgba) => { const i = (b * CAP_W + a) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3]; };
  for (let y = 0; y < CAP_H; y++) for (let xx = 0; xx < CAP_W; xx++) {
    if (f(xx, y)) { put(xx, y, fill); continue; }
    let c: Rgba | null = null;
    if (f(xx + 1, y) || f(xx, y + 1)) c = light;
    else if (f(xx - 1, y) || f(xx, y - 1)) c = med;
    else if (f(xx + 1, y + 1) || f(xx - 1, y - 1) || f(xx + 1, y - 1) || f(xx - 1, y + 1)) c = corner;
    else {
      let d2 = false, d3 = false;
      for (let i = -2; i <= 2; i++) { for (let j = -2; j <= 2; j++) d2 ||= f(xx + i, y + j); d3 ||= f(xx + i, y + 3); }
      if (d2) c = dark;
      else if (d3) { const i = (y * CAP_W + xx) * 4; for (let k = 0; k < 3; k++) d[i + k] = Math.trunc((d[i + k]! + dark[k]) / 2); }
    }
    if (c) put(xx, y, c);
  }
  return out;
}
