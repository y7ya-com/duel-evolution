// What the engine draws itself under main's windows on the start screens, drawn by the rewrite: Select Player's ring
// logo (the scene's CBgCommon 0x29: the original's Flash movie data/menu/menu_mark_a01, 60 frames at 30 fps, looping)
// and the waist-up portrait of the character under the pointer (CWindowPlayerSelect: waistUpAvatarNew, scale 50, at 200,
// 0: yo2PlayerSelect.cpp), and Change Avatar's portrait of the look being made (CChangeAvatarPack). One 1024 x 768 layer
// over the 2008 backdrop (main's backdrop.js), under the HTML layer; pointer-transparent: the movie drawn with PixiJS
// (pixi-painter.ts, made the first time the ring shows), the portrait an <img> over it: a 1024 x 768 picture with the
// composition at its place, stretched over the screen as the canvas was (so it is resampled as it was).
import { parseSwfText, SwfInstance, type SwfMovie } from '../../duel/swf-text';
import { WaistUpComposer, canvasUrl } from '../duel-portrait';
import type { ArchiveLoader } from '../duel-fx';
import { PixiPainter, type PaintSource } from '../pixi-painter';

const LOGO = 'data/menu/menu_mark_a01.txt';
/** Where the movie's origin stands (game px): its 600 x 600 stage centred on the screen, as main's game shows it. */
export const LOGO_AT = { x: 212, y: 84 } as const;
/** The waist-up portrait's 768 x 768 composition: its centre column at x 200 (waistUpAvatarSetPos(200, 0)), its top at 0. */
export const PORTRAIT_AT = { x: 200 - 384, y: 0 } as const;

/** `at`: where the portrait's 768 x 768 composition stands (PORTRAIT_AT unless given). */
export interface StartSceneView { logo: boolean; portrait: Uint8Array | null; reducedMotion: boolean; at?: { x: number; y: number } }

export class StartScene {
  readonly element: HTMLDivElement;
  private ctx: PixiPainter | null = null;
  private readonly portraitImage: HTMLImageElement;
  private portraitUrl = '';
  private readonly abort = new AbortController();
  private movie: SwfMovie | null = null; private movieLoading = false;
  private readonly images = new Map<string, HTMLImageElement | null>();
  private readonly composer: WaistUpComposer;
  private portraitKey = '';
  private view: StartSceneView = { logo: false, portrait: null, reducedMotion: false };
  private frame = 0; private timer: ReturnType<typeof setInterval> | null = null; private disposed = false;
  constructor(private readonly load: ArchiveLoader) {
    this.element = document.createElement('div');
    this.element.className = 'de-start-scene'; this.element.setAttribute('aria-hidden', 'true');
    Object.assign(this.element.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' });
    // the 768 x 768 composition at its place on the 1024 x 768 screen (show() moves it)
    this.portraitImage = document.createElement('img'); this.portraitImage.alt = ''; this.portraitImage.draggable = false; this.portraitImage.hidden = true;
    Object.assign(this.portraitImage.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    this.element.append(this.portraitImage);
    this.composer = new WaistUpComposer(load);
  }
  show(view: StartSceneView): void {
    if (this.disposed) return;
    this.view = view;
    if (view.logo && !this.movie) this.loadMovie();
    if (view.logo && !this.ctx) { this.ctx = new PixiPainter({ width: 1024, height: 768, className: 'de-start-logo', ready: () => this.draw() }); Object.assign(this.ctx.element.style, { position: 'absolute', inset: '0' }); this.element.prepend(this.ctx.element); }
    // no ring: its canvas leaves the page (a WebGL layer under the portrait would have it composited, drawn softer)
    if (this.ctx) this.ctx.element.style.display = view.logo ? '' : 'none';
    const at = view.at ?? PORTRAIT_AT, key = view.portrait ? `${Array.from(view.portrait).join(',')}@${at.x},${at.y}` : '';
    if (key !== this.portraitKey) {
      this.portraitKey = key; this.setPortrait('');
      if (view.portrait) void this.composer.compose(view.portrait, 0, this.abort.signal).then(portrait => {
        const screen = document.createElement('canvas'); screen.width = 1024; screen.height = 768;
        screen.getContext('2d')?.drawImage(portrait, at.x, at.y);
        return canvasUrl(screen);
      }).then(async url => {
        const img = new Image(); img.src = url; await img.decode().catch(() => {});
        if (this.portraitKey === key && !this.disposed) this.setPortrait(url); else URL.revokeObjectURL(url);
      }, () => {});
    }
    this.portraitImage.hidden = !view.portrait || !this.portraitUrl;
    const animate = view.logo && !view.reducedMotion;
    if (animate && !this.timer) this.timer = setInterval(() => { this.frame++; this.draw(); }, 1000 / 30);
    if (!animate && this.timer) { clearInterval(this.timer); this.timer = null; }
    this.draw();
  }
  private loadMovie(): void {
    if (this.movieLoading) return; this.movieLoading = true;
    this.load(LOGO, this.abort.signal).then(async lease => {
      try {
        const text = new TextDecoder().decode(await (await fetch(lease.url)).arrayBuffer());
        const movie = parseSwfText(text);
        // the movie's PngFileTable names its bitmaps menu_mark_a01_<n>_?.png, '?' the language: only _j exists
        for (const file of movie.files) this.image(`data/menu/${file.replace('?', 'j')}`);
        this.movie = movie; this.draw();
      } finally { lease.release(); }
    }).catch(() => { this.movieLoading = false; });
  }
  private image(path: string): HTMLImageElement | null {
    if (this.images.has(path)) return this.images.get(path) ?? null;
    this.images.set(path, null);
    this.load(path, this.abort.signal).then(lease => {
      const img = new Image(); img.decoding = 'async';
      img.onload = () => { this.images.set(path, img); lease.release(); this.draw(); };
      img.onerror = () => lease.release();
      img.src = lease.url;
    }, () => {});
    return null;
  }
  /** The composed portrait's picture (an object URL of the composition, '' none). */
  private setPortrait(url: string): void {
    if (this.portraitUrl) URL.revokeObjectURL(this.portraitUrl);
    this.portraitUrl = url;
    if (url) this.portraitImage.src = url; else this.portraitImage.removeAttribute('src');
    this.portraitImage.hidden = !url || !this.view.portrait;
  }
  private draw(): void {
    const ctx = this.ctx; if (!ctx || this.disposed) return;
    ctx.begin();
    const movie = this.view.logo ? this.movie : null;
    if (movie && movie.frameCount > 0) {
      const instance = new SwfInstance(movie, movie.timeline, true), n = this.view.reducedMotion ? 0 : this.frame % movie.frameCount;
      for (let i = 0; i <= n; i++) instance.step();
      const items: Parameters<SwfInstance['draw']>[0] = []; instance.draw(items);
      drawSwfItems(ctx, items, movie, file => this.images.get(`data/menu/${file.replace('?', 'j')}`), LOGO_AT);
    }
    ctx.end();
  }
  dispose(): void { this.disposed = true; this.abort.abort(); if (this.timer) clearInterval(this.timer); this.timer = null; this.setPortrait(''); this.ctx?.destroy(); this.ctx = null; this.element.remove(); }
}

/** Draws one frame's bitmap items of a movie (twips, each clipped to its shape's bounds) with its origin at `at`. */
export function drawSwfItems(ctx: PixiPainter, items: Parameters<SwfInstance['draw']>[0], movie: SwfMovie, image: (file: string) => PaintSource | null | undefined, at: { x: number; y: number }): void {
  for (const item of items) {
    const file = movie.files[item.bitmap]; if (!file) continue;
    const img = image(file); if (!img) continue;
    ctx.save();
    const k = 1 / 20, m = item.clipMatrix, b = item.clip;
    ctx.setTransform(k, 0, 0, k, at.x, at.y);
    ctx.transform(m.a, m.b, m.c, m.d, m.tx, m.ty); ctx.clipRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
    ctx.setTransform(k, 0, 0, k, at.x, at.y);
    const f = item.matrix; ctx.transform(f.a, f.b, f.c, f.d, f.tx, f.ty);
    ctx.globalAlpha = Math.max(0, Math.min(1, item.color.mult[3] + item.color.add[3] / 255));
    if (ctx.globalAlpha > 0) ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
}
