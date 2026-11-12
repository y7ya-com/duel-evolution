// What the engine itself draws on main and main's screens leave to it: the real pictures under the HTML (the shop's
// backdrop, clerk and the player's waist-up portrait, its category banners, pack art and card faces, the trade's card
// faces and ready lamps). main's screens cut holes in their layers where those pictures are (screens/shop.js and
// trade.js: what passthrough() leaves to the engine); here the rewrite is the engine, so this window, behind every
// other, draws them from the original art, each where its sprite says (world position, source rect, scale).
// One window, class CEnginePictures, its `pics` the list back to front (built from the same sprite objects the other
// windows carry, so a picture switch's hover sprite shows here as the pointer moves).

/** Where a picture's pixels come from: an archive texture, a card's face by passcode, or a picture the rewrite composes. */
export type PictureSource = { archive: string } | { card: number } | { canvas: string };
export interface Picture {
  key: string; source: PictureSource;
  /** Game-screen box the picture fills (its source rect scaled). */
  x: number; y: number; w: number; h: number; z: number;
  /** The texture's source rect (texels); absent: the whole image. */
  crop?: [number, number, number, number];
  flip?: boolean; alpha?: number; shown: boolean;
  /** What the picture shows, for assistive technology (a card's name). */
  label?: string;
}
/** A picture's URL (an archive lease, a card face, a composed picture's object URL). */
export type PictureResolver = (source: PictureSource, signal: AbortSignal) => Promise<string>;

let resolver: PictureResolver | null = null;
/** The rewrite's art loaders (index.ts: the archive, card faces, composed portraits). */
export function setPictureResolver(fn: PictureResolver | null): void { resolver = fn; }

const sourceKey = (s: PictureSource) => 'archive' in s ? `a:${s.archive}` : 'card' in s ? `c:${s.card}` : `v:${s.canvas}`;
const looks = new Map<string, Promise<string | null>>();
let abort = new AbortController();
function look(source: PictureSource): Promise<string | null> {
  const key = sourceKey(source);
  let p = looks.get(key);
  if (!p) {
    p = resolver ? resolver(source, abort.signal).catch(() => null) : Promise.resolve(null);
    // a composed source is recomposed by its owner (a new key): kept; a failed load is tried again next time
    void p.then(v => { if (!v) looks.delete(key); });
    looks.set(key, p);
  }
  return p;
}
/** Forget a canvas source (its owner composed a new one). */
export function dropPicture(source: PictureSource): void { looks.delete(sourceKey(source)); }

interface Drawn { el: HTMLElement; inner: HTMLElement | null; source: string; natural: [number, number] | null }
function place(d: Drawn, p: Picture): void {
  if (p.label) { if (d.el.title !== p.label) { d.el.title = p.label; d.el.setAttribute('role', 'img'); d.el.setAttribute('aria-label', p.label); } }
  else if (d.el.title) { d.el.removeAttribute('title'); d.el.removeAttribute('role'); d.el.removeAttribute('aria-label'); }
  Object.assign(d.el.style, { left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px', display: p.shown ? '' : 'none',
    opacity: p.alpha !== undefined && p.alpha < 1 ? String(p.alpha) : '', transform: p.flip ? 'scaleX(-1)' : '' });
  const inner = d.inner; if (!inner) return;
  if (!p.crop || !d.natural) { Object.assign(inner.style, { left: '0', top: '0', width: '100%', height: '100%' }); return; }
  const [u, v, cw, ch] = p.crop, kx = p.w / cw, ky = p.h / ch;
  Object.assign(inner.style, { left: -u * kx + 'px', top: -v * ky + 'px', width: d.natural[0] * kx + 'px', height: d.natural[1] * ky + 'px' });
}
function draw(p: Picture, signal: AbortSignal): Drawn {
  const el = document.createElement('div');
  el.className = 'pic';
  el.dataset.picture = p.key;
  Object.assign(el.style, { position: 'absolute', overflow: 'hidden', pointerEvents: 'none' });
  const d: Drawn = { el, inner: null, source: sourceKey(p.source), natural: null };
  void look(p.source).then(v => {
    if (!v || signal.aborted) return;
    const inner = document.createElement('img'); inner.alt = ''; inner.draggable = false; inner.decoding = 'async';
    inner.onload = () => { d.natural = [inner.naturalWidth, inner.naturalHeight]; place(d, current.get(d) ?? p); };
    inner.src = v;
    Object.assign(inner.style, { position: 'absolute', display: 'block' });
    d.inner = inner; el.append(inner); place(d, current.get(d) ?? p);
  });
  return d;
}
const current = new WeakMap<Drawn, Picture>();

interface State { drawn: Map<string, Drawn>; abort: AbortController }
/** The pictures window (main's screen contract: mount / update / unmount); it takes no pointer. */
export const pictures: HtmlUiScreen = {
  classes: ['CEnginePictures'],
  mode: 'pass',
  rootInput: 'none',
  mount: () => ({ drawn: new Map(), abort: new AbortController() } satisfies State),
  update(win, _prev, root, _api, st) {
    const s = st as State, pics = ((win as { pics?: Picture[] }).pics ?? []).slice().sort((a, b) => a.z - b.z);
    const seen = new Set<string>();
    pics.forEach((p, i) => {
      seen.add(p.key);
      let d = s.drawn.get(p.key);
      if (d && d.source !== sourceKey(p.source)) { d.el.remove(); d = undefined; }
      if (!d) { d = draw(p, s.abort.signal); s.drawn.set(p.key, d); }
      current.set(d, p);
      d.el.style.zIndex = String(i);
      if (d.el.parentNode !== root) root.append(d.el);
      place(d, p);
    });
    for (const [k, d] of s.drawn) if (!seen.has(k)) { d.el.remove(); s.drawn.delete(k); }
  },
  unmount(root, st) { const s = st as State; s.abort.abort(); s.drawn.clear(); root.replaceChildren(); },
};
/** The page's client went away: loads in flight stop, nothing is kept. */
export const disposePictures = (): void => { abort.abort(); abort = new AbortController(); looks.clear(); };

// The clerk's speech balloon (the engine's on main: a white rounded box with a black rim, its tail out to the clerk on
// the right; the text black Arial 16 at its place). Class CShopBalloon, its text in the window's `text`.
const BALLOON_CSS = `.shop-balloon { position: absolute; left: 0; top: 0; width: 486px; height: 142px; box-sizing: border-box; background: #fff;
  border: 2px solid #1a1a1a; border-radius: 26px; box-shadow: inset 0 0 0 2px #cfd8de; }
.shop-balloon::after { content: ''; position: absolute; right: -24px; top: 82px; width: 26px; height: 22px; background: #fff;
  clip-path: polygon(0 0, 100% 50%, 0 100%); }
.shop-balloon::before { content: ''; position: absolute; right: -28px; top: 79px; width: 30px; height: 28px; background: #1a1a1a;
  clip-path: polygon(0 0, 100% 50%, 0 100%); }
.shop-balloon p { position: absolute; left: 44px; top: 30px; margin: 0; font: 16px/22px Arial, Helvetica, sans-serif; color: #000; white-space: pre-wrap; width: 420px; }`;
export const balloon: HtmlUiScreen = {
  classes: ['CShopBalloon'],
  mode: 'pass',
  rootInput: 'none',
  mount(_win, root) {
    if (!document.getElementById('htmlui-balloon-css')) { const st = document.createElement('style'); st.id = 'htmlui-balloon-css'; st.textContent = BALLOON_CSS; document.head.append(st); }
    const box = document.createElement('div'); box.className = 'shop-balloon'; box.setAttribute('role', 'status');
    const p = document.createElement('p'); box.append(p); root.append(box); root.style.overflow = 'visible';
    return { p };
  },
  update(win, _prev, root, _api, st) { (st as { p: HTMLElement }).p.textContent = String((win as { text?: string }).text ?? ''); root.style.overflow = 'visible'; root.style.zIndex = '5'; },
  unmount(root) { root.replaceChildren(); },
};
