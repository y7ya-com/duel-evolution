// The game's HD cursor, as live shows it: main's htmlui/cursor.js draws the engine's hand (data/common/m_cursor/
// mausuk_*, its HD redraw in ui/hd/) as the browser's own CSS cursor, and the click ripple (mausuk_e01) in a layer of
// its own over everything (bridge.js drawRipple). On main the engine hands cursor.js the hand's sprites each frame
// (snapshot.cursor: CMouseManager's CHandCursorTask); the rewrite has no engine, so the sprites are built here from the
// same files at the hand's place (-16,-16 of the point, 64 x 64, alpha-blend), in the state the pointer is in.
// The original (yo2.exe CHandCursorTask: update 0x00615690, play 0x006149d0, setState 0x00614b90; its swfs
// data/common/m_cursor/mausuk_a*.txt, 30 fps), as live's engine hands it over (yo2Html.snapshot().cursor sampled on
// live's title, 2026-11-11): the plain hand is n01_s + n01_c01 at rest; while the left button is held it is n02_s +
// n02_c01 (on a plate or on nothing alike), and every press starts a click ripple (mausuk_e01_c01, 32 x 32, centred on
// the press: 15 frames at 30 fps = 500 ms, fading in over 5 frames from 0.3x to 1x and alpha 0.8, then out over 9 to 2x
// and alpha 0). The pointing hand (a02) is n02_c02 at rest over a control. The busy hand is a07 (t01..t08, each 4 frames
// at 30 fps: 7.5 images a second, the turn 32 frames). Every state's art is in each snapshot (hidden), as the engine's
// is, so cursor.js loads it all up front and no first press / hover / busy turn waits on a file.
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

/** The ripple's place in its 15 frames (f: 0..14): scale and alpha (live's engine: 0.3 + 0.14 f and 0.16 f up to
 * frame 5, then 1 + (f - 5) / 9 and 0.8 (14 - f) / 9). */
export function rippleFrame(f: number): { s: number; a: number } {
  return f <= 5 ? { s: 0.3 + 0.14 * f, a: 0.16 * f } : { s: 1 + (f - 5) / 9, a: 0.8 * (14 - f) / 9 };
}
// every state's art, hidden: cursor.js loads what a snapshot names (the engine's snapshot names them all)
const PRELOAD = ['n01_s', 'n01_c01', 'n02_s', 'n02_c01', 'n02_c02', 't01_s', ...Array.from({ length: BUSY_FRAMES }, (_, i) => `t0${i + 1}_c01`)];

/** The hand's sprites for a state at the mouse point (game px); t: ms, for the busy hand's turn and the ripple. */
export function cursorSprites(state: CursorState, mx: number, my: number, t: number, clicks: readonly { x: number; y: number; at: number }[] = [], down = false): CursorSnap {
  const x = mx - 16, y = my - 16;
  const hand = state === 'busy'
    ? [sprite('mausuk_t01_s.png', x, y, 61013), sprite(`mausuk_t0${busyFrame(t)}_c01.png`, x, y, 61015)]
    : down || state === 'hover'
      ? [sprite('mausuk_n02_s.png', x, y, 61013), sprite(down ? 'mausuk_n02_c01.png' : 'mausuk_n02_c02.png', x, y, 61015)]
      : [sprite('mausuk_n01_s.png', x, y, 61013), sprite('mausuk_n01_c01.png', x, y, 61015)];
  // the ripple: centred where the press landed, at the swf's 30 fps
  const rings = clicks.flatMap((c, i) => {
    const f = Math.floor((t - c.at) * SWF_FPS / 1000); if (f < 0 || f > 14) return [];
    const { s, a } = rippleFrame(f); if (a <= 0) return [];
    return [sprite('mausuk_e01_c01.png', c.x - 16 * s, c.y - 16 * s, 61003 + i, { src: [0, 0, 32, 32], wsx: s, wsy: s, a })];
  });
  const hidden = [...PRELOAD.map(n => sprite(`mausuk_${n}.png`, 0, 0, 0, { shown: false })), sprite('mausuk_e01_c01.png', 0, 0, 0, { src: [0, 0, 32, 32], shown: false, a: 0 })];
  return { id: 1, shown: true, mx, my, sprites: [...hand, ...rings, ...hidden] };
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
  // a press: the held hand and a ripple where it landed, on a control or on nothing alike (live's engine)
  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return; this.down = true;
    if (this.o.busy()) return;
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
    // undefined: this state's image is still being built; null: its art is still loading. Either way the last cursor
    // stays (live falls back to the engine's drawn hand there; the rewrite has none, so dropping it showed the system
    // arrow or a control's own `cursor: pointer` for the first moments of every new state)
    if (css !== undefined && (css !== null || this.now === null)) this.set(css);
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
