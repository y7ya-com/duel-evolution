// The scene-load overlay (live: client/web-shell/loader.js on the runtime's scene "begin"/"end"): the menu backdrop
// with the menu_mark_a01 ring movie and "Loading…", faded in only when a load outlasts the game's own fade (0.35 s),
// with a Reload button after 45 s. loader.js drives the engine's canvas and Module, so the rewrite draws the same look
// itself: the ring is the start screens' movie (data/menu/menu_mark_a01), the backdrop the original's abmake_bg pair
// from the archive. Pointer-transparent except Reload.
// As main (f5e4ee6): the box is on <body>, fixed over the stage at a z-index over every other layer (#htmlui-host 45,
// #starter 46, the Wardrobe / Missions launchers 2147480000; under the cursor and the phone's turn-sideways prompt), so
// no half-drawn window of the next scene shows over it. Its first frame is the backdrop's blue (a CSS gradient, also in
// index.html before any script has run), and the boot's scrolling checker and the ring are CSS animations the
// compositor runs however long the main thread is busy (a canvas drawn per frame froze with it).
import { parseSwfText, SwfInstance, type SwfMovie } from '../../duel/swf-text';
import type { ArchiveLoader } from '../duel-fx';

export const SHOW_AFTER_MS = 350;
export const STUCK_MS = 45_000;

export interface SceneLoadEvents { begin(name: string): () => void }

/** Times scene loads (cold vs warm in the dev log) and tells the overlay when one is slow. */
export class SceneLoadTracker implements SceneLoadEvents {
  private readonly active = new Map<number, { name: string; at: number }>();
  private id = 0;
  constructor(private readonly onChange: (loading: string | null, since: number) => void, private readonly log?: (name: string, ms: number) => void, private readonly now: () => number = () => performance.now()) {}
  get loading(): string | null { const first = this.active.values().next(); return first.done ? null : first.value.name; }
  begin(name: string): () => void {
    const id = ++this.id, at = this.now();
    this.active.set(id, { name, at });
    if (this.active.size === 1) this.onChange(name, at);
    return () => {
      if (!this.active.delete(id)) return;
      this.log?.(name, this.now() - at);
      if (!this.active.size) this.onChange(null, 0);
    };
  }
  track<T>(name: string, work: Promise<T>): Promise<T> { const end = this.begin(name); void work.then(end, end); return work; }
}

/** Over every layer but the cursor (2147483646) and the turn-sideways prompt (phone.ts, 2147483000). */
export const VEIL_Z = 2147480500;
/** main's loader.js backdrop gradient: the backdrop's blue before any picture has come. */
export const VEIL_GRADIENT = 'linear-gradient(90deg, #43abf5, #52aff6 12.5%, #60b4f7 25%, #96cefa 37.5%, #b2dbfb 44%, #c8e5fc 50%, #c3e3fc 56%, #acd8fb 62.5%, #70bbf8 75%, #44a7f5 87.5%, #39a2f5)';
const W = 1024, H = 768;
/** Where the ring's 600 px movie stands (loader.js: centred above the status line, at 47 % of the height). */
export const RING_AT = { x: W / 2 - 300, y: H * 0.47 - 300 } as const;

let veilUp = false;
/** The veil is up and not yet fading out (main bridge.js wait): the menu bar's launchers stay down under it. */
export const sceneVeilUp = (): boolean => veilUp;
/** Fired on window when the veil starts to fade, so the launchers come back with it (layer.ts draws them then). */
export const VEIL_EVENT = 'de-scene-veil';

export interface RingLayer { bitmap: number; keyframes: string[] }
/** The movie as one CSS keyframes list per bitmap layer (loader.js ringCss): each frame's full transform (game px, the
 * movie's origin at `at`) and alpha, linear between frames (WebKit runs steps() on the main thread), the last frame
 * repeated at 100 %. A layer missing from a frame is transparent there. */
export function ringLayers(movie: SwfMovie, at: { x: number; y: number } = RING_AT): { layers: RingLayer[]; seconds: number } {
  const n = Math.max(1, movie.frameCount), inst = new SwfInstance(movie, movie.timeline, true), k = 1 / 20;
  const frames: Parameters<SwfInstance['draw']>[0][] = [];
  for (let i = 0; i < n; i++) { inst.step(); const items: Parameters<SwfInstance['draw']>[0] = []; inst.draw(items); frames.push(items); }
  const count = Math.max(0, ...frames.map(f => f.length)), layers: RingLayer[] = [];
  for (let l = 0; l < count; l++) {
    const bitmap = frames.find(f => f[l])![l]!.bitmap, kf: string[] = [];
    const pose = (item: (typeof frames)[number][number] | undefined) => {
      if (!item || item.bitmap !== bitmap) return 'opacity:0';
      const m = item.matrix, a = Math.max(0, Math.min(1, item.color.mult[3] + item.color.add[3] / 255));
      return `transform:matrix(${[m.a * k, m.b * k, m.c * k, m.d * k, at.x + m.tx * k, at.y + m.ty * k].map(v => +v.toFixed(4)).join(',')});opacity:${+a.toFixed(3)}`;
    };
    frames.forEach((f, i) => kf.push(`${+(i / n * 100).toFixed(3)}%{${pose(f[l])}}`));
    kf.push(`100%{${pose(frames[n - 1]![l])}}`);
    layers.push({ bitmap, keyframes: kf });
  }
  return { layers, seconds: n / 30 };
}

const CSS = `
.de-scene-loading { position:fixed; left:0; top:0; width:100vw; height:100vh; z-index:${VEIL_Z}; pointer-events:none; overflow:hidden; container-type:size;
  background:${VEIL_GRADIENT}; opacity:1; transition:opacity .6s ease-out; }
.de-scene-loading[hidden] { display:none; }
.de-scene-loading.gone { opacity:0; }
.de-scene-loading.scene { transition:opacity .15s ease-out .35s; }
.de-scene-loading.scene.gone { transition:opacity .3s ease-out; }
.de-scene-loading.scene.enter { opacity:0; }
.de-scene-loading > .base { position:absolute; inset:0; background:0 0 / 100% 100% no-repeat; }
.de-scene-loading > .grid { position:absolute; inset:0; overflow:hidden; }
.de-scene-loading > .grid > i { position:absolute; left:0; top:-100%; width:100%; height:200%; background:0 0 / 100% 50% repeat-y; }
.de-scene-loading.boot > .grid > i { animation:de-veil-grid ${H / 30}s linear infinite; }
@keyframes de-veil-grid { to { transform:translateY(50%); } }
.de-scene-loading > .ring { position:absolute; left:0; top:0; width:${W}px; height:${H}px; transform-origin:0 0; transform:scale(var(--kx,1),var(--ky,1)); }
.de-scene-loading > .ring > img { position:absolute; left:0; top:0; transform-origin:0 0; }
.de-scene-loading .status { position:absolute; left:0; right:0; top:82%; text-align:center; color:#fff; font:600 2.1cqh/1.2 system-ui, sans-serif;
  text-shadow:0 1px 3px rgba(0,0,0,.6); letter-spacing:.02em; }
.de-scene-loading.still > .grid > i, .de-scene-loading.still > .ring > img { animation:none !important; }
@media (prefers-reduced-motion: reduce) { .de-scene-loading > .grid > i, .de-scene-loading > .ring > img { animation:none !important; } }
`;

export class SceneLoadingOverlay {
  readonly element: HTMLDivElement;
  private stuckTimer: ReturnType<typeof setTimeout> | null = null;
  private offTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly status: HTMLDivElement;
  private readonly base: HTMLDivElement; private readonly grid: HTMLElement; private readonly ringBox: HTMLDivElement;
  private button: HTMLButtonElement | null = null;
  private load: ArchiveLoader | null = null;
  private art = false; private booting = true; private pending: string | null = null;
  private readonly abort = new AbortController();
  private readonly leases: { release(): void }[] = [];
  private stage: () => Element | null = () => null;
  private readonly onPlace = (): void => this.place();
  /** load: the archive (null until the app has one: setLoader). The veil starts up, as the boot screen, until booted(). */
  constructor(load: ArchiveLoader | null, private readonly reducedMotion: () => boolean = () => false, private readonly reload: () => void = () => location.reload()) {
    if (!document.getElementById('de-scene-loading-css')) { const st = document.createElement('style'); st.id = 'de-scene-loading-css'; st.textContent = CSS; document.head.append(st); }
    const box = this.element = document.createElement('div');
    box.className = 'de-scene-loading boot'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
    box.innerHTML = '<div class="base"></div><div class="grid"><i></i></div><div class="ring" aria-hidden="true"></div><div class="status">Loading…</div>';
    this.base = box.children[0] as HTMLDivElement; this.grid = box.children[1]!.firstElementChild as HTMLElement;
    this.ringBox = box.children[2] as HTMLDivElement; this.status = box.children[3] as HTMLDivElement;
    box.classList.toggle('still', this.reducedMotion());
    veilUp = true;
    document.body.append(box);
    // index.html's first-frame gradient, before any script ran: this box takes its place
    document.getElementById('de-boot')?.remove();
    addEventListener('resize', this.onPlace);
    for (const e of ['resize', 'scroll'] as const) globalThis.visualViewport?.addEventListener(e, this.onPlace);
    this.setLoader(load);
    this.stuckTimer = setTimeout(() => this.showStuck(), STUCK_MS);   // still booting: offer a reload, as loader.js
  }
  /** The archive once the app has one: the backdrop pictures and the ring. */
  setLoader(load: ArchiveLoader | null): void { if (load && !this.load) { this.load = load; this.paintArt(); } }
  /** stage: the element the veil covers (the rewrite's .de-stage); without one it covers the window. */
  follow(stage: () => Element | null): void { this.stage = stage; this.place(); }
  /** The first screen is up: the boot veil fades out. */
  booted(): void { if (!this.booting) return; this.booting = false; if (!this.pending) this.hide(); }
  /** loading: the scene being loaded, or null when done. */
  set(loading: string | null): void {
    if (this.booting) { this.pending = loading; return; }   // the boot veil is up anyway: it fades on booted(), or after a load under it
    if (loading) {
      // As loader.js on "begin": the box goes up at once, its fade-in held back by the CSS transition-delay (0.35 s, the
      // game's own fade), so a fast load (warm caches) ends before anything shows and never flashes the overlay.
      if (!veilUp) this.show();
      return;
    }
    if (veilUp) this.hide();
  }
  private place(): void {
    const box = this.element, r = this.stage()?.getBoundingClientRect();
    const rect = r && r.width ? r : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    Object.assign(box.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
    this.ringBox.style.setProperty('--kx', String(rect.width / W)); this.ringBox.style.setProperty('--ky', String(rect.height / H));
  }
  private show(): void {
    const box = this.element;
    if (this.offTimer) { clearTimeout(this.offTimer); this.offTimer = null; }
    this.place();
    this.status.textContent = 'Loading…';
    box.classList.remove('boot'); box.classList.toggle('still', this.reducedMotion());
    box.classList.add('scene', 'enter'); box.classList.remove('gone'); box.hidden = false;
    veilUp = true;
    void box.offsetWidth; box.classList.remove('enter');   // the fade-in starts from opacity 0
    this.stuckTimer = setTimeout(() => this.showStuck(), STUCK_MS);
  }
  private hide(): void {
    if (this.stuckTimer) { clearTimeout(this.stuckTimer); this.stuckTimer = null; }
    this.button?.remove(); this.button = null;
    veilUp = false;
    this.element.classList.add('gone');
    // the launchers come back as the veil starts to fade, and fade in with it (main bridge.js)
    globalThis.dispatchEvent?.(new Event(VEIL_EVENT));
    if (this.offTimer) clearTimeout(this.offTimer);
    this.offTimer = setTimeout(() => { this.offTimer = null; if (!veilUp) { this.element.hidden = true; this.element.classList.remove('boot'); } }, 700);
  }
  private paintArt(): void {
    if (this.art || !this.load) return; this.art = true;
    const load = this.load, signal = this.abort.signal;
    const take = (p: string) => load(p, signal).then(lease => { this.leases.push(lease); return lease.url; }, () => null);
    void take('data/menu/abmake_bg_01.png').then(url => { if (url) this.base.style.backgroundImage = `url("${url}")`; });
    void take('data/menu/abmake_bg_02.png').then(url => { if (url) this.grid.style.backgroundImage = `url("${url}")`; });
    void load('data/menu/menu_mark_a01.txt', signal).then(async lease => {
      let movie: SwfMovie;
      try { movie = parseSwfText(new TextDecoder().decode(await (await fetch(lease.url)).arrayBuffer())); } finally { lease.release(); }
      // its layers' pictures first, so the ring comes up whole
      const urls = await Promise.all(movie.files.map(f => take(`data/menu/${f.replace('?', 'j')}`)));
      if (signal.aborted) return;
      const { layers, seconds } = ringLayers(movie);
      let rules = '';
      layers.forEach((layer, i) => {
        const url = urls[layer.bitmap]; if (!url) return;
        const img = document.createElement('img'); img.alt = ''; img.src = url; img.className = `r${i}`;
        img.style.cssText = layer.keyframes[0]!.replace(/^[^{]*\{|\}$/g, '');
        this.ringBox.append(img);
        rules += `@keyframes de-veil-ring${i}{${layer.keyframes.join('')}}.de-scene-loading>.ring>.r${i}{animation:de-veil-ring${i} ${seconds}s linear infinite}`;
      });
      const st = document.createElement('style'); st.textContent = rules; this.element.append(st);
    }).catch(() => { /* the backdrop without the ring */ });
  }
  private showStuck(): void {
    this.stuckTimer = null;
    this.status.textContent = 'This is taking longer than usual.';
    const b = this.button = document.createElement('button');
    b.type = 'button'; b.textContent = 'Reload';
    Object.assign(b.style, { position: 'absolute', left: '50%', top: '88%', transform: 'translateX(-50%)', pointerEvents: 'auto',
      font: '600 2cqh system-ui, sans-serif', padding: '.4em 1.4em', border: '0', borderRadius: '999px', background: '#fff', color: '#123', cursor: 'pointer' });
    b.onclick = () => this.reload();
    this.element.append(b);
  }
  dispose(): void {
    if (this.stuckTimer) clearTimeout(this.stuckTimer);
    if (this.offTimer) clearTimeout(this.offTimer);
    removeEventListener('resize', this.onPlace);
    for (const e of ['resize', 'scroll'] as const) globalThis.visualViewport?.removeEventListener(e, this.onPlace);
    this.abort.abort(); for (const l of this.leases.splice(0)) l.release();
    veilUp = false; this.element.remove();
  }
}

// Every scene change, not only the world's map loads (main's loader.js veils each of the runtime's scene "begin"s:
// title -> Select Player, Select Player -> lobby, lobby <-> Edit Deck / Shop / Duel / Trade / My Room, the duel's result).
// The rewrite's scenes have no engine load to wait for: a scene is loaded once its windows are drawn and their pictures
// have come (the <img>s and CSS pictures in the HTML layer and the stage, the archive and card pictures it asked for,
// the server data it fetched). The veil ends then: never an artificial wait.

/** The scene a view shows, as the original's CSceneMng would name it (a change is a scene load). */
export function sceneKey(view: { scene: string; duel?: { ended?: string | undefined } | null | undefined; sideboarding?: unknown; replay?: unknown; trade?: boolean; map?: number | undefined }): string {
  if (view.scene === 'lobby' && !view.trade && view.map !== undefined) return `lobby@${view.map}`;   // a map change (doors, My Room) waits for its scenery too
  if (view.scene === 'duel' && view.duel?.ended && !view.sideboarding && !view.replay) return 'result';
  if (view.trade && !['title', 'characters'].includes(view.scene)) return 'trade';
  return view.scene;
}

/** Work a scene waits for (archive / card pictures, server data): counted while in flight. */
export class PendingWork {
  private count = 0;
  get pending(): number { return this.count; }
  track<T>(work: Promise<T>): Promise<T> { this.count++; const done = () => { this.count--; }; void work.then(done, done); return work; }
}

const pictures = new Map<string, boolean>();   // a CSS picture's url: true once it has come (or failed)
/** The pictures the scene's DOM still waits for: img elements not complete, and CSS background pictures not yet come
 * (each loaded here once, as the browser does for the element, so its arrival can be seen). */
export function pendingPictures(roots: Element[]): number {
  let n = 0;
  const css = (url: string) => {
    let done = pictures.get(url);
    if (done === undefined) {
      const probe = new Image(); probe.src = url; done = probe.complete; pictures.set(url, done);
      if (!done) probe.onload = probe.onerror = () => { pictures.set(url, true); probe.onload = probe.onerror = null; };
    }
    if (!done) n++;
  };
  for (const root of roots) for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    // the world's scenery still decoding its first frame (ui/world.ts: "Loading map artwork…" until data-map-ready)
    if (el instanceof HTMLElement && el.dataset.mapReady === 'false' && el.dataset.mapFailed !== 'true' && el.isConnected && el.getClientRects().length > 0) { n++; continue; }
    if (el instanceof HTMLImageElement) { if (el.getAttribute('src') && !el.complete) n++; continue; }
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== 'none') for (const m of bg.matchAll(/url\((['"]?)(.*?)\1\)/g)) if (m[2] && !m[2].startsWith('data:')) css(m[2]);
  }
  return n;
}

export const SCENE_SETTLE_POLL_MS = 50;
/** The longest a scene's own pictures can hold its veil (a picture that never comes must not keep it up). */
export const SCENE_SETTLE_MAX_MS = 15_000;

export interface SceneWatchOptions {
  tracker: SceneLoadEvents;
  pending: PendingWork;
  /** The elements the scene draws into (the HTML layer's host, the stage). */
  roots: () => Element[];
  frame?: (fn: () => void) => void;
  now?: () => number;
}
/** Begins a scene load on each scene change and ends it when the new scene has settled: drawn (two frames) and
 * nothing it asked for still coming, two polls in a row. Returns observe(view) for each view. */
export function watchSceneChanges(opts: SceneWatchOptions): { observe(key: string): void; dispose(): void } {
  const frame = opts.frame ?? ((fn: () => void) => requestAnimationFrame(() => fn())), now = opts.now ?? (() => performance.now());
  let key: string | null = null, end: (() => void) | null = null, timer: ReturnType<typeof setTimeout> | null = null, token = 0;
  const finish = () => { if (timer) { clearTimeout(timer); timer = null; } const e = end; end = null; e?.(); };
  return {
    observe(next: string): void {
      if (key === null) { key = next; return; }   // the first screen: the boot veil covers it
      if (next === key) return;
      key = next; const my = ++token, at = now();
      if (!end) end = opts.tracker.begin(`scene:${next}`);
      if (timer) { clearTimeout(timer); timer = null; }
      let quiet = 0;
      const poll = () => {
        timer = null; if (my !== token) return;
        const busy = opts.pending.pending + pendingPictures(opts.roots());
        quiet = busy ? 0 : quiet + 1;
        if (quiet >= 2 || now() - at > SCENE_SETTLE_MAX_MS) { finish(); return; }
        timer = setTimeout(poll, SCENE_SETTLE_POLL_MS);
      };
      frame(() => frame(() => { if (my === token) poll(); }));
    },
    dispose(): void { token++; finish(); },
  };
}
