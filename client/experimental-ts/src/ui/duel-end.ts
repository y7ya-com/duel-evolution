// The duel's end word as live plays it: data/y/duel_end/duel_ef_{win,lose,drow}_a01_j, a 30 fps movie on the 1024 x 768
// stage (YOU LOSE drops in from the top in 19 frames and its glow fades in over 20 more; YOU WIN sweeps across at four
// times its size and settles, its glow flashing up and out; DRAW comes together from its two halves), held on its last
// frame. Played as CSS animations of its bitmaps (each layer's pose per frame, as the scene-loading ring), so a rebuilt
// stage picks it up where it is.
import { parseSwfText, SwfInstance, type SwfMovie } from '../duel/swf-text';

export type DuelEndKind = 'win' | 'lose' | 'drow';
type Load = (path: string, signal: AbortSignal) => Promise<{ url: string; release(): void }>;
const DIR = 'data/y/duel_end/', W = 1024, H = 768, KINDS: readonly DuelEndKind[] = ['win', 'lose', 'drow'];
const movies = new Map<DuelEndKind, SwfMovie | null | 'loading'>();
const styled = new Set<DuelEndKind>();

/** The pictures of a kind's movie (its files with the English letter), for warming. */
export const duelEndPictures = (kind: DuelEndKind): string[] => {
  const m = movies.get(kind);
  return m && m !== 'loading' ? m.files.map(f => DIR + f.replace('?', 'e')) : [`${DIR}duel_ef_${kind}_m01_e.png`, ...(kind === 'drow' ? [] : [`${DIR}duel_ef_${kind}_m02_e.png`])];
};

/** Loads the three movies once (during the duel, so the end has them at once). */
export function loadDuelEndMovies(load: Load): void {
  for (const kind of KINDS) {
    if (movies.has(kind)) continue;
    movies.set(kind, 'loading');
    void load(`${DIR}duel_ef_${kind}_a01_j.txt`, new AbortController().signal).then(async lease => {
      try { movies.set(kind, parseSwfText(new TextDecoder().decode(await (await fetch(lease.url)).arrayBuffer()))); } finally { lease.release(); }
    }).catch(() => { movies.set(kind, null); });
  }
}

interface Layer { file: number; keyframes: string[]; last: string }
const layersOf = new Map<DuelEndKind, { layers: Layer[]; ms: number }>();
const pct = (v: number, of: number) => +(v / 20 / of * 100).toFixed(4);
/** Each layer's pose per frame: its matrix (twips; the bitmap at its own size, scaled by the movie) and alpha. */
function layers(kind: DuelEndKind, movie: SwfMovie): { layers: Layer[]; ms: number } {
  const known = layersOf.get(kind); if (known) return known;
  const n = Math.max(1, movie.frameCount), inst = new SwfInstance(movie, movie.timeline, false);
  const frames: Parameters<SwfInstance['draw']>[0][] = [];
  for (let i = 0; i < n; i++) { inst.step(); const items: Parameters<SwfInstance['draw']>[0] = []; inst.draw(items); frames.push(items); }
  const count = Math.max(0, ...frames.map(f => f.length)), out: Layer[] = [];
  for (let l = 0; l < count; l++) {
    const file = frames.find(f => f[l])![l]!.bitmap;
    const pose = (item: (typeof frames)[number][number] | undefined): string => {
      if (!item || item.bitmap !== file) return 'opacity:0';
      const m = item.matrix, a = Math.max(0, Math.min(1, item.color.mult[3] + item.color.add[3] / 255));
      return `transform:translate(${pct(m.tx, W)}cqw,${pct(m.ty, H)}cqh) matrix(${[m.a, m.b, m.c, m.d].map(v => +(v / 20).toFixed(4)).join(',')},0,0);opacity:${+a.toFixed(3)}`;
    };
    const keyframes = frames.map((f, i) => `${+(i / n * 100).toFixed(3)}%{${pose(f[l])}}`);
    const last = pose(frames[n - 1]![l]); keyframes.push(`100%{${last}}`);
    out.push({ file, keyframes, last });
  }
  const made = { layers: out, ms: n / (movie.frameRate || 30) * 1000 }; layersOf.set(kind, made); return made;
}

const CSS = `.de-duel-board>.de-duel-end-movie { position:absolute; inset:0; container-type:size; overflow:hidden; z-index:41; pointer-events:none; }
.de-duel-end-movie>img { position:absolute; left:0; top:0; transform-origin:0 0; visibility:hidden; }`;

/** The end movie `since` ms in (null while its movie is not in: the caller shows the word still). `art` loads a picture
 * into an <img>; `reduced`: its last frame at once. */
export function duelEndMovie(kind: DuelEndKind, art: (path: string, image: HTMLImageElement) => void, since: number, reduced: boolean): HTMLElement | null {
  const movie = movies.get(kind); if (!movie || movie === 'loading') return null;
  const { layers: ls, ms } = layers(kind, movie);
  if (!document.getElementById('de-duel-end-css')) { const st = document.createElement('style'); st.id = 'de-duel-end-css'; st.textContent = CSS; document.head.append(st); }
  if (!styled.has(kind)) {
    styled.add(kind);
    const st = document.createElement('style'); st.textContent = ls.map((l, i) => `@keyframes de-end-${kind}-${i}{${l.keyframes.join('')}}`).join(''); document.head.append(st);
  }
  const box = document.createElement('div'); box.className = 'de-duel-end-movie'; box.setAttribute('aria-hidden', 'true');
  ls.forEach((l, i) => {
    const img = document.createElement('img'); img.alt = ''; img.draggable = false;
    // (the bitmap at its own size in game pixels: the movie's matrix scales it)
    img.onload = () => { Object.assign(img.style, { width: `${img.naturalWidth / W * 100}cqw`, height: `${img.naturalHeight / H * 100}cqh`, visibility: 'visible' }); };
    if (reduced) img.setAttribute('style', l.last);
    else Object.assign(img.style, { animation: `de-end-${kind}-${i} ${ms}ms linear forwards`, animationDelay: `${-Math.max(0, since)}ms` });
    art(DIR + movie.files[l.file]!.replace('?', 'e'), img);
    box.append(img);
  });
  return box;
}
