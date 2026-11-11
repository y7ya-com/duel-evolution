// What the engine draws itself under main's windows on the start screens, drawn by the rewrite: Select Player's ring
// logo (the scene's CBgCommon 0x29: the original's Flash movie data/menu/menu_mark_a01, 60 frames at 30 fps, looping)
// and the waist-up portrait of the character under the pointer (CWindowPlayerSelect: waistUpAvatarNew, scale 50, at 200,
// 0: yo2PlayerSelect.cpp), and Change Avatar's portrait of the look being made (CChangeAvatarPack). One 1024 x 768 canvas
// over the 2008 backdrop (main's backdrop.js), under the HTML layer; pointer-transparent.
import { parseSwfText, SwfInstance, type SwfMovie } from '../../duel/swf-text';
import { WaistUpComposer } from '../duel-portrait';
import type { ArchiveLoader } from '../duel-fx';

const LOGO = 'data/menu/menu_mark_a01.txt';
/** Where the movie's origin stands (game px): its 600 x 600 stage centred on the screen, as main's game shows it. */
export const LOGO_AT = { x: 212, y: 84 } as const;
/** The waist-up portrait's 768 x 768 composition: its centre column at x 200 (waistUpAvatarSetPos(200, 0)), its top at 0. */
export const PORTRAIT_AT = { x: 200 - 384, y: 0 } as const;

/** `at`: where the portrait's 768 x 768 composition stands (PORTRAIT_AT unless given). */
export interface StartSceneView { logo: boolean; portrait: Uint8Array | null; reducedMotion: boolean; at?: { x: number; y: number } }

export class StartScene {
  readonly element: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly abort = new AbortController();
  private movie: SwfMovie | null = null; private movieLoading = false;
  private readonly images = new Map<string, HTMLImageElement | null>();
  private readonly composer: WaistUpComposer;
  private portraitKey = ''; private portrait: HTMLCanvasElement | null = null;
  private view: StartSceneView = { logo: false, portrait: null, reducedMotion: false };
  private frame = 0; private timer: ReturnType<typeof setInterval> | null = null; private disposed = false;
  constructor(private readonly load: ArchiveLoader) {
    this.element = document.createElement('canvas');
    this.element.width = 1024; this.element.height = 768;
    this.element.className = 'de-start-scene'; this.element.setAttribute('aria-hidden', 'true');
    Object.assign(this.element.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    this.ctx = this.element.getContext('2d');
    this.composer = new WaistUpComposer(load);
  }
  show(view: StartSceneView): void {
    if (this.disposed) return;
    this.view = view;
    if (view.logo && !this.movie) this.loadMovie();
    const key = view.portrait ? Array.from(view.portrait).join(',') : '';
    if (key !== this.portraitKey) {
      this.portraitKey = key; this.portrait = null;
      if (view.portrait) void this.composer.compose(view.portrait, 0, this.abort.signal).then(c => { if (this.portraitKey === key) { this.portrait = c; this.draw(); } }, () => {});
    }
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
  private draw(): void {
    const ctx = this.ctx; if (!ctx || this.disposed) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 1024, 768);
    const movie = this.view.logo ? this.movie : null;
    if (movie && movie.frameCount > 0) {
      const instance = new SwfInstance(movie, movie.timeline, true), n = this.view.reducedMotion ? 0 : this.frame % movie.frameCount;
      for (let i = 0; i <= n; i++) instance.step();
      const items: Parameters<SwfInstance['draw']>[0] = []; instance.draw(items);
      for (const item of items) {
        const file = movie.files[item.bitmap]; if (!file) continue;
        const img = this.images.get(`data/menu/${file.replace('?', 'j')}`); if (!img) continue;
        ctx.save();
        const k = 1 / 20, m = item.clipMatrix, b = item.clip;
        ctx.setTransform(k, 0, 0, k, LOGO_AT.x, LOGO_AT.y);
        ctx.transform(m.a, m.b, m.c, m.d, m.tx, m.ty); ctx.beginPath(); ctx.rect(b[0], b[1], b[2] - b[0], b[3] - b[1]); ctx.clip();
        ctx.setTransform(k, 0, 0, k, LOGO_AT.x, LOGO_AT.y);
        const f = item.matrix; ctx.transform(f.a, f.b, f.c, f.d, f.tx, f.ty);
        ctx.globalAlpha = Math.max(0, Math.min(1, item.color.mult[3] + item.color.add[3] / 255));
        if (ctx.globalAlpha > 0) ctx.drawImage(img, 0, 0);
        ctx.restore();
      }
    }
    if (this.view.portrait && this.portrait) { ctx.setTransform(1, 0, 0, 1, 0, 0); const at = this.view.at ?? PORTRAIT_AT; ctx.drawImage(this.portrait, at.x, at.y); }
  }
  dispose(): void { this.disposed = true; this.abort.abort(); if (this.timer) clearInterval(this.timer); this.timer = null; this.element.remove(); }
}
