// The game's HD cursor, as live shows it: main's htmlui/cursor.js draws the engine's hand (data/common/m_cursor/
// mausuk_*, its HD redraw in ui/hd/) as the browser's own CSS cursor, and the click ripple (mausuk_e01) in a layer of
// its own over everything (bridge.js drawRipple). On main the engine hands cursor.js the hand's sprites each frame
// (snapshot.cursor: CMouseManager's CHandCursorTask); the rewrite has no engine, so the sprites are built here from the
// same files at the hand's place (-16,-16 of the point, 64 x 64, alpha-blend), in the state the pointer is in.
// The original (yo2.exe CHandCursorTask: update 0x00615690, play 0x006149d0, setState 0x00614b90; its swfs
// data/common/m_cursor/mausuk_a*.txt, 30 fps): the plain hand is mausuk_a01_c01 (n01_c01) at rest and a01_c02 (n01_c02)
// while the left button is held, a press starting a click ripple (mausuk_ae1_c01: 15 frames, 500 ms); in its pointing
// state (5) the hand is a02 (n02_c02 at rest, n02_c01 held) and a press makes no ripple; the busy hand is a07 (t01..t08,
// each 4 frames at 30 fps: 7.5 images a second, the turn 32 frames).
import { cursorCss, ripple, HD } from '@htmlui/cursor.js';

export type CursorState = 'normal' | 'hover' | 'busy';
export interface CursorSprite { id: number; name: string; tex: string; src: [number, number, number, number]; wx: number; wy: number; wz: number;
  a: number; col: [number, number, number, number]; add: [number, number, number, number]; shown: boolean; wsx: number; wsy: number; mode: number }
export interface CursorSnap { id: number; shown: boolean; mx: number; my: number; sprites: CursorSprite[] }

const DIR = 'data/common/m_cursor/';
const SWF_FPS = 30, BUSY_FRAMES = 8, BUSY_HOLD = 4, RIPPLE_MS = 15 * 1000 / SWF_FPS;
/** The busy hand's image at t ms (a07: 8 images, each held 4 swf frames at 30 fps). */
export const busyFrame = (t: number): number => 1 + Math.floor(Math.floor(t * SWF_FPS / 1000) / BUSY_HOLD) % BUSY_FRAMES;
export { RIPPLE_MS };
let nextId = 1;
const sprite = (file: string, x: number, y: number, wz: number, opts: Partial<CursorSprite> = {}): CursorSprite => ({
  id: nextId++, name: DIR + file, tex: DIR + file, src: [0, 0, 64, 64], wx: x, wy: y, wz, a: 1, col: [1, 1, 1, 1], add: [0, 0, 0, 0],
  shown: true, wsx: 1, wsy: 1, mode: 6, ...opts });

/** The hand's sprites for a state at the mouse point (game px); t: ms, for the busy hand's turn and the ripple. */
export function cursorSprites(state: CursorState, mx: number, my: number, t: number, clicks: readonly { x: number; y: number; at: number }[] = [], down = false): CursorSnap {
  const x = mx - 16, y = my - 16;
  const hand = state === 'busy'
    ? [sprite('mausuk_t01_s.png', x, y, 61013), sprite(`mausuk_t0${busyFrame(t)}_c01.png`, x, y, 61015)]
    : state === 'hover'
      ? [sprite('mausuk_n02_s.png', x, y, 61013), sprite(down ? 'mausuk_n02_c01.png' : 'mausuk_n02_c02.png', x, y, 61015)]
      : [sprite('mausuk_n01_s.png', x, y, 61013), sprite(down ? 'mausuk_n01_c02.png' : 'mausuk_n01_c01.png', x, y, 61015)];
  // the ripple: grows from half size to whole and fades out where the click landed
  const rings = clicks.flatMap(c => {
    const k = (t - c.at) / RIPPLE_MS; if (k < 0 || k >= 1) return [];
    const s = 0.5 + 0.5 * k;
    return [sprite('mausuk_e01_c01.png', c.x - 32 * s, c.y - 32 * s, 61017, { wsx: s, wsy: s, a: 1 - k })];
  });
  return { id: 1, shown: true, mx, my, sprites: [...hand, ...rings] };
}

/** What the pointer is over: something the player can press (the hand points), else the plain hand. */
export function pointsAt(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (e instanceof HTMLButtonElement || e instanceof HTMLAnchorElement || e instanceof HTMLSelectElement) return !(e as HTMLButtonElement).disabled;
    if (e.hasAttribute('data-key') || e.getAttribute('role') === 'button') return !e.hasAttribute('disabled') && e.getAttribute('aria-disabled') !== 'true';
    if (e.id === 'htmlui-host') return false;
  }
  return false;
}

const CSS = 'html.yo2c, html.yo2c * { cursor: var(--yo2-cursor) !important; }';

export interface GameCursorOptions { art: string; stage: () => HTMLElement | null; busy: () => boolean }

/** Mounts the game cursor on the page: the CSS cursor on every element and the ripple layer, kept in step each frame. */
export class GameCursor {
  private state: CursorState = 'normal'; private down = false; private mx = 0; private my = 0; private over: Element | null = null;
  private clicks: { x: number; y: number; at: number }[] = [];
  private now: string | null = null; private raf = 0; private disposed = false;
  private readonly fx: HTMLDivElement; private readonly fxEls: HTMLDivElement[] = []; private readonly style: HTMLStyleElement;
  constructor(private o: GameCursorOptions) {
    this.style = document.createElement('style'); this.style.id = 'yo2-cursor-css'; this.style.textContent = CSS; document.head.append(this.style);
    this.fx = document.createElement('div'); this.fx.className = 'yo2-cursor-fx';
    Object.assign(this.fx.style, { position: 'fixed', left: '0', top: '0', width: '1024px', height: '768px', transformOrigin: '0 0', pointerEvents: 'none', zIndex: '2147483646' });
    document.body.append(this.fx);
    addEventListener('pointermove', this.onMove, true); addEventListener('pointerdown', this.onDown, true);
    addEventListener('pointerup', this.onUp, true); addEventListener('pointercancel', this.onUp, true);
    this.loop();
  }
  private game(e: PointerEvent): [number, number, number] {
    const r = this.o.stage()?.getBoundingClientRect(), s = r?.width ? r.width / 1024 : 1;
    return [(e.clientX - (r?.left ?? 0)) / s, (e.clientY - (r?.top ?? 0)) / s, s];
  }
  private onMove = (e: PointerEvent): void => { [this.mx, this.my] = this.game(e); this.over = e.target instanceof Element ? e.target : null; };
  // a press: the held hand; a ripple where it landed, except in the pointing state (the original's state 5)
  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return; this.down = true;
    if (this.o.busy() || pointsAt(e.target instanceof Element ? e.target : null)) return;
    const [x, y] = this.game(e); this.clicks = [...this.clicks.filter(c => performance.now() - c.at < RIPPLE_MS), { x, y, at: performance.now() }];
  };
  private onUp = (e: PointerEvent): void => { if (e.button === 0) this.down = false; };
  private loop = (): void => { if (this.disposed) return; this.frame(performance.now()); if (typeof requestAnimationFrame === 'function') this.raf = requestAnimationFrame(this.loop); };
  /** One frame: the state, its CSS cursor, the ripple. */
  frame(t: number): void {
    this.state = this.o.busy() ? 'busy' : pointsAt(this.over) ? 'hover' : 'normal';
    const r = this.o.stage()?.getBoundingClientRect(), scale = r?.width ? r.width / 1024 : 1;
    this.clicks = this.clicks.filter(c => t - c.at < RIPPLE_MS);
    const snap = cursorSprites(this.state, this.mx, this.my, t, this.clicks, this.down);
    let css: string | null | undefined = null;
    try { css = cursorCss(snap, this.o.art, scale, globalThis.devicePixelRatio || 1); } catch { css = null; }
    if (css !== undefined) this.set(css);
    Object.assign(this.fx.style, { left: (r?.left ?? 0) + 'px', top: (r?.top ?? 0) + 'px', transform: `scale(${scale})` });
    this.drawRipple(ripple(snap) as CursorSprite[]);
  }
  get cursor(): { state: CursorState; css: string | null } { return { state: this.state, css: this.now }; }
  private set(v: string | null): void {
    if (v === this.now) return;
    this.now = v;
    document.documentElement.classList.toggle('yo2c', v !== null);
    if (v !== null) document.documentElement.style.setProperty('--yo2-cursor', v);
  }
  // bridge.js drawRipple: each sprite a clipped box holding its art (the HD redraw when there is one)
  private drawRipple(ss: CursorSprite[]): void {
    while (this.fxEls.length > ss.length) this.fxEls.pop()!.remove();
    ss.forEach((s, i) => {
      let e = this.fxEls[i];
      if (!e) {
        e = this.fxEls[i] = document.createElement('div');
        Object.assign(e.style, { position: 'absolute', overflow: 'hidden' });
        const img = Object.assign(document.createElement('img'), { decoding: 'async', alt: '' });
        img.onerror = () => { img.dataset.hd = '0'; img.src = img.src.replace('/hd/', '/'); };
        Object.assign(img.style, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0', maxWidth: 'none' });
        e.append(img); this.fx.append(e);
      }
      const im = e.firstChild as HTMLImageElement, r = im.dataset.hd === '0' ? 1 : HD;
      const [sx, sy, sw, sh] = s.src, file = s.tex.slice(s.tex.lastIndexOf('/') + 1).toLowerCase(), src = this.o.art + (r === 1 ? '' : 'hd/') + file;
      Object.assign(e.style, { left: s.wx + 'px', top: s.wy + 'px', width: sw * s.wsx + 'px', height: sh * s.wsy + 'px', opacity: String(s.a) });
      if (im.getAttribute('src') !== src) im.src = src;
      im.style.transform = `scale(${s.wsx / r}, ${s.wsy / r}) translate(${-sx * r}px, ${-sy * r}px)`;
    });
  }
  dispose(): void {
    this.disposed = true; if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
    removeEventListener('pointermove', this.onMove, true); removeEventListener('pointerdown', this.onDown, true);
    removeEventListener('pointerup', this.onUp, true); removeEventListener('pointercancel', this.onUp, true);
    this.set(null); this.fx.remove(); this.style.remove();
  }
}
