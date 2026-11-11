// What the engine draws on the title under the controls, drawn by the rewrite: the title movie (CTitleScene's Flash
// movie data/title/title_flash_01.txt, 73 frames at 30 fps, played once and held on its last frame: the Yu-Gi-Oh! ONLINE
// logo and the two characters sliding in) over the 2008 backdrop (main's backdrop.js, the layer's). As live shows it:
// rt/debrand.cpp drops the KONAMI badge (depth 21) and the copyright line (23) from the movie; its buttons (DefineButton2
// at depths 25..40) are the rewrite's HTML controls, so they are dropped too. One 1024 x 768 canvas, pointer-transparent.
import { parseSwfText, SwfInstance, type SwfMovie } from '../../duel/swf-text';
import type { ArchiveLoader } from '../duel-fx';
import { drawSwfItems } from './start-scene';

export const TITLE_MOVIE = 'data/title/title_flash_01.txt';
/** rt/debrand.cpp TITLE_DROP (KONAMI 21, copyright 23, QUIT 25, CLEAR 29, WEB 33) and the menu's OPTIONS 37 and ONLINE 40. */
export const TITLE_DROP_DEPTHS: readonly number[] = [21, 23, 25, 29, 33, 37, 40];

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
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly abort = new AbortController();
  private movie: SwfMovie | null = null; private loading = false; private instance: SwfInstance | null = null;
  private readonly images = new Map<string, HTMLImageElement | null>();
  private timer: ReturnType<typeof setInterval> | null = null; private disposed = false; private reducedMotion = false;
  constructor(private readonly load: ArchiveLoader) {
    this.element = document.createElement('canvas');
    this.element.width = 1024; this.element.height = 768;
    this.element.className = 'de-title-scene'; this.element.setAttribute('aria-hidden', 'true');
    Object.assign(this.element.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '0' });
    this.ctx = this.element.getContext('2d');
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
        for (const file of movie.files) this.image(titleImagePath(file));
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
  private draw(): void {
    const ctx = this.ctx, movie = this.movie, instance = this.instance; if (!ctx || this.disposed) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 1024, 768);
    if (!movie || !instance) return;
    const items: Parameters<SwfInstance['draw']>[0] = []; instance.draw(items);
    drawSwfItems(ctx, items, movie, file => this.images.get(titleImagePath(file)), { x: 0, y: 0 });
  }
  dispose(): void { this.disposed = true; this.abort.abort(); if (this.timer) clearInterval(this.timer); this.timer = null; this.element.remove(); }
}
