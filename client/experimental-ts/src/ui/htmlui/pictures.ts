// What the engine itself draws on main and main's screens leave to it: the real pictures under the HTML (the shop's
// backdrop, clerk and the player's waist-up portrait, its category banners, pack art and card faces, the trade's card
// faces and ready lamps). main's screens cut holes in their layers where those pictures are (screens/shop.js and
// trade.js: what passthrough() leaves to the engine); here the rewrite is the engine, so this window, behind every
// other, draws them from the original art, each where its sprite says (world position, source rect, scale).
// One window, class CEnginePictures, its `pics` the list back to front (built from the same sprite objects the other
// windows carry, so a picture switch's hover sprite shows here as the pointer moves).
import { blinkSchedule } from '../duel-portrait';

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
  /** live's talk portrait (CWaistUpAvatar in an NPC's talk): it slides in from the right as it comes, and out to the
   * right as the window goes (SLIDE below) */
  slide?: { enter?: boolean; exit?: boolean };
}
/** The talk portrait's slide (live's film, de-scratch/jkn talk-L / talk2-L / close-L: 30 fps): k frames from home it
 * stands 4k(k+1) px to the right (224, 168, 120, 80, 48, 24, 8, 0) at opacity 1 - 0.15k; in, k from 7 to 0, out the
 * reverse. */
export const SLIDE_FRAMES = 7;
const slideKeys = (out: boolean): Keyframe[] => {
  const ks = Array.from({ length: SLIDE_FRAMES + 1 }, (_, i) => SLIDE_FRAMES - i).map(k => ({ translate: `${4 * k * (k + 1)}px 0`, opacity: Math.max(0, 1 - 0.15 * k) }));
  return out ? ks.reverse() : ks;
};
const reducedMotion = (el: Element): boolean => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true || !!el.closest?.('[data-motion="reduced"]');
/** Fired on window (detail: the picture's key) when a sliding picture is home: the talk's balloon waits for it. */
export const PICTURE_ENTERED = 'de-picture-entered';
const entered = new Map<string, number>();
/** When the picture `key` last came home (performance.now()), if it has since its window came. */
export const pictureEntered = (key: string): number | undefined => entered.get(key);
/** A picture's URL (an archive lease, a card face, a composed picture's object URL). */
export type PictureResolver = (source: PictureSource, signal: AbortSignal) => Promise<string>;
/** A waist-up picture's three eye frames (open, half shut, shut) as URLs, or null if it does not blink. */
export type PictureEyes = (source: PictureSource, signal: AbortSignal) => Promise<string[] | null>;

let resolver: PictureResolver | null = null, eyesOf: PictureEyes | null = null;
/** The rewrite's art loaders (index.ts: the archive, card faces, composed portraits); `eyes` the blinking pictures' frames. */
export function setPictureResolver(fn: PictureResolver | null, eyes: PictureEyes | null = null): void { resolver = fn; eyesOf = fn ? eyes : null; }

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

/** A picture's URL for a screen that draws it itself (option-dlg.ts: sprites as CSS backgrounds); null if it can't load. */
export const pictureUrl = (source: PictureSource): Promise<string | null> => look(source);

interface Drawn { el: HTMLElement; inner: HTMLElement | null; source: string; natural: [number, number] | null; abort: AbortController; blink?: ReturnType<typeof setTimeout> | null }
const eyeLooks = new Map<string, Promise<string[] | null>>();
/** The talk's waist-up pictures (an NPC's own, or one composed from its parts) blink as the duel's portraits do
 * (duel-portrait.ts blinkSchedule: open a random 0.3-9 s, then half shut, shut, half shut); the frames are <img>s over
 * the open one, decoded before they show, and the blink stops with the window (or reduced motion). */
function blink(d: Drawn, source: PictureSource, signal: AbortSignal): void {
  if (!eyesOf || !('canvas' in source) || !/^(npc|portrait):/.test(source.canvas)) return;
  const key = sourceKey(source);
  let p = eyeLooks.get(key);
  if (!p) { p = eyesOf(source, abort.signal).catch(() => null); eyeLooks.set(key, p); void p.then(v => { if (!v) eyeLooks.delete(key); }); }
  void p.then(async urls => {
    if (!urls || signal.aborted || !d.inner) return;
    const frames = await Promise.all(urls.slice(1).map(async url => {
      const img = document.createElement('img'); img.alt = ''; img.draggable = false; img.src = url;
      Object.assign(img.style, { position: 'absolute', display: 'block', left: '0', top: '0', width: '100%', height: '100%', visibility: 'hidden' });
      await img.decode().catch(() => {}); return img;
    }));
    if (signal.aborted) return;
    d.el.append(...frames);
    const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true || !!d.el.closest?.('[data-motion="reduced"]');
    const show = (eyes: 1 | 2 | 3) => frames.forEach((img, i) => { img.style.visibility = i + 2 === eyes ? '' : 'hidden'; });
    const steps = (): [1 | 2 | 3, number][] => blinkSchedule(Math.random);
    const run = (list: [1 | 2 | 3, number][], i: number): void => {
      if (signal.aborted) { show(1); return; }
      if (i >= list.length) { run(steps(), 0); return; }
      const [eyes, ms] = list[i]!; show(reduced() ? 1 : eyes);
      d.blink = setTimeout(() => run(list, i + 1), ms);
    };
    signal.addEventListener('abort', () => { if (d.blink) clearTimeout(d.blink); d.blink = null; }, { once: true });
    run(steps(), 0);
  });
}
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
  const d: Drawn = { el, inner: null, source: sourceKey(p.source), natural: null, abort: new AbortController() };
  void look(p.source).then(v => {
    if (!v || signal.aborted) return;
    const inner = document.createElement('img'); inner.alt = ''; inner.draggable = false; inner.decoding = 'async';
    inner.onload = () => { d.natural = [inner.naturalWidth, inner.naturalHeight]; place(d, current.get(d) ?? p); };
    inner.src = v;
    Object.assign(inner.style, { position: 'absolute', display: 'block' });
    d.inner = inner; el.append(inner); place(d, current.get(d) ?? p);
    blink(d, p.source, d.abort.signal);
    const home = () => { entered.set(p.key, performance.now()); globalThis.dispatchEvent?.(new CustomEvent(PICTURE_ENTERED, { detail: p.key })); };
    if ((current.get(d) ?? p).slide?.enter && typeof el.animate === 'function' && !reducedMotion(el)) {
      // in from the right once its picture is ready to show
      inner.style.visibility = 'hidden';
      void inner.decode().catch(() => {}).then(() => {
        inner.style.visibility = '';
        if (signal.aborted || d.abort.signal.aborted) return;
        el.animate(slideKeys(false), { duration: SLIDE_FRAMES * 1000 / 30, easing: 'linear', fill: 'backwards' }).finished.then(home, () => {});
      });
    } else home();
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
  mount: (win) => { for (const p of (win as { pics?: Picture[] }).pics ?? []) entered.delete(p.key); return { drawn: new Map(), abort: new AbortController() } satisfies State; },
  update(win, _prev, root, _api, st) {
    const s = st as State, pics = ((win as { pics?: Picture[] }).pics ?? []).slice().sort((a, b) => a.z - b.z);
    const seen = new Set<string>();
    pics.forEach((p, i) => {
      seen.add(p.key);
      let d = s.drawn.get(p.key);
      if (d && d.source !== sourceKey(p.source)) { d.abort.abort(); d.el.remove(); d = undefined; }
      if (!d) { d = draw(p, s.abort.signal); s.drawn.set(p.key, d); }
      current.set(d, p);
      d.el.style.zIndex = String(i);
      if (d.el.parentNode !== root) root.append(d.el);
      place(d, p);
    });
    for (const [k, d] of s.drawn) if (!seen.has(k)) { d.abort.abort(); d.el.remove(); s.drawn.delete(k); }
  },
  unmount(root, st) {
    const s = st as State;
    // a sliding picture goes out to the right: on a copy of the window's box beside it, gone when it is out
    const out = [...s.drawn.values()].filter(d => current.get(d)?.slide?.exit && d.inner && typeof d.el.animate === 'function' && !reducedMotion(root));
    if (out.length && root.parentElement) {
      const ghost = root.cloneNode(false) as HTMLElement; ghost.style.pointerEvents = 'none'; ghost.removeAttribute('data-window-id');
      root.parentElement.insertBefore(ghost, root.nextSibling);
      for (const d of out) { if (d.blink) clearTimeout(d.blink); ghost.append(d.el); }
      void Promise.all(out.map(d => d.el.animate(slideKeys(true), { duration: SLIDE_FRAMES * 1000 / 30, easing: 'linear', fill: 'forwards' }).finished.catch(() => {}))).then(() => { ghost.remove(); for (const d of out) d.abort.abort(); });
      for (const d of out) s.drawn.delete([...s.drawn.entries()].find(([, v]) => v === d)![0]);
    }
    s.abort.abort(); for (const d of s.drawn.values()) d.abort.abort(); s.drawn.clear(); root.replaceChildren();
  },
};
/** The page's client went away: loads in flight stop, nothing is kept. */
export const disposePictures = (): void => { abort.abort(); abort = new AbortController(); looks.clear(); eyeLooks.clear(); };
