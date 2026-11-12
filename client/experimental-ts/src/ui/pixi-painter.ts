// PixiJS for the screens that draw frame by frame (the title movie, Select Player's ring, the duel's effects and its
// bar ring): each owns one painter, a WebGL canvas whose frame is built from the same calls a 2D canvas takes (a
// transform, alpha, additive blending, a clip rectangle, images and rectangle outlines), each image becoming a pooled
// sprite and each outline a pooled Graphics, in call order. The drawing code keeps its own clock and calls
// begin() ... end() whenever it has a new frame; end() renders it (no ticker). Pixi itself loads on first use (the
// overworld's chunk), so a screen without effects never fetches it.
import type { Application, Container, Graphics, Sprite, Texture, TextureSource } from 'pixi.js';

/** What a painter draws: a decoded image or a canvas made off screen (a recoloured copy, a composed caption). */
export type PaintSource = HTMLImageElement | HTMLCanvasElement;
type M = { a: number; b: number; c: number; d: number; e: number; f: number };
interface State { m: M; alpha: number; blend: 'source-over' | 'lighter'; clip: { m: M; x: number; y: number; w: number; h: number } | null; stroke: string; line: number }
interface Art { source: TextureSource; frames: Map<string, Texture> }
type Pixi = typeof import('pixi.js');

const ID: M = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const mul = (p: M, q: M): M => ({ a: p.a * q.a + p.c * q.b, b: p.b * q.a + p.d * q.b, c: p.a * q.c + p.c * q.d, d: p.b * q.c + p.d * q.d, e: p.a * q.e + p.c * q.f + p.e, f: p.b * q.e + p.d * q.f + p.f });
const inv = (m: M): M | null => {
  const det = m.a * m.d - m.b * m.c; if (!det) return null;
  return { a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det, e: (m.c * m.f - m.d * m.e) / det, f: (m.b * m.e - m.a * m.f) / det };
};
const MAX_FRAMES = 128;
let pixiModule: Promise<Pixi> | null = null;
const loadPixi = (): Promise<Pixi> => pixiModule ??= import('pixi.js');

export interface PixiPainterOptions { width: number; height: number; className: string; /** Called once the canvas can draw (the owner draws its current frame). */ ready?: () => void }

export class PixiPainter {
  /** The painter's box (absolutely placed by its owner's CSS); the WebGL canvas fills it once Pixi is up. */
  readonly element: HTMLDivElement;
  private pixi: Pixi | null = null;
  private app: Application | null = null;
  private root: Container | null = null;
  private readonly sprites: Sprite[] = [];
  private readonly lines: Graphics[] = [];
  private readonly masks: Graphics[] = [];
  private used = 0; private lineUsed = 0; private maskUsed = 0; private order = 0;
  private readonly art = new Map<PaintSource, Art>();
  private doomed: Texture[] = [];
  private doomedSources: TextureSource[] = [];
  private state: State = { m: ID, alpha: 1, blend: 'source-over', clip: null, stroke: '#000', line: 1 };
  private readonly stack: State[] = [];
  private destroyed = false;
  /** Sprites and outlines drawn in the last frame (the acceptance tests read it). */
  drawn = 0;

  constructor(private readonly options: PixiPainterOptions) {
    this.element = document.createElement('div'); this.element.className = options.className; this.element.setAttribute('aria-hidden', 'true');
    if (typeof HTMLCanvasElement === 'undefined') return;
    void this.init().catch(e => { if (!this.destroyed) console.warn('pixi painter', e); });
  }
  get ready(): boolean { return !!this.root; }
  private async init(): Promise<void> {
    const pixi = await loadPixi(); if (this.destroyed) return;
    const app = new pixi.Application();
    await app.init({ width: this.options.width, height: this.options.height, backgroundAlpha: 0, antialias: true, resolution: 1, autoDensity: false, preference: 'webgl',
      autoStart: false, sharedTicker: false, preserveDrawingBuffer: true, eventMode: 'none', eventFeatures: { move: false, globalMove: false, click: false, wheel: false } });
    if (this.destroyed) { app.destroy({ removeView: true }, { children: true }); return; }
    app.ticker?.stop();
    const canvas = app.canvas; canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', pointerEvents: 'none' });
    this.element.append(canvas);
    this.pixi = pixi; this.app = app; this.root = app.stage; app.stage.sortableChildren = true;
    this.options.ready?.();
  }

  // ---- the 2D canvas state it mirrors ----
  get globalAlpha(): number { return this.state.alpha; }
  set globalAlpha(v: number) { if (Number.isFinite(v)) this.state.alpha = Math.max(0, Math.min(1, v)); }
  get globalCompositeOperation(): 'source-over' | 'lighter' { return this.state.blend; }
  set globalCompositeOperation(v: 'source-over' | 'lighter') { this.state.blend = v; }
  get strokeStyle(): string { return this.state.stroke; }
  set strokeStyle(v: string) { this.state.stroke = v; }
  get lineWidth(): number { return this.state.line; }
  set lineWidth(v: number) { this.state.line = v; }
  save(): void { this.stack.push({ ...this.state }); }
  restore(): void { const s = this.stack.pop(); if (s) this.state = s; }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void { this.state.m = { a, b, c, d, e, f }; }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void { this.state.m = mul(this.state.m, { a, b, c, d, e, f }); }
  translate(x: number, y: number): void { this.transform(1, 0, 0, 1, x, y); }
  rotate(r: number): void { const cos = Math.cos(r), sin = Math.sin(r); this.transform(cos, sin, -sin, cos, 0, 0); }
  /** The canvas's rect() + clip(): later images are cut to this rectangle (in the current transform) until restore().
   * One clip at a time (the movies clip each bitmap once, inside its own save / restore). */
  clipRect(x: number, y: number, w: number, h: number): void { this.state.clip = { m: this.state.m, x, y, w, h }; }

  /** A new frame: nothing drawn yet, the state reset. */
  begin(): void {
    this.used = this.lineUsed = this.maskUsed = this.order = 0; this.stack.length = 0;
    this.state = { m: ID, alpha: 1, blend: 'source-over', clip: null, stroke: '#000', line: 1 };
  }
  /** The frame is complete: what was not drawn this time is hidden, and the canvas shows the frame. */
  end(): void {
    if (!this.app) return;
    for (let i = this.used; i < this.sprites.length; i++) { const s = this.sprites[i]!; if (s.visible || s.mask) { s.visible = false; s.mask = null; s.texture = this.pixi!.Texture.EMPTY; } }
    for (let i = this.lineUsed; i < this.lines.length; i++) { const g = this.lines[i]!; if (g.visible) { g.visible = false; g.clear(); } }
    for (let i = this.maskUsed; i < this.masks.length; i++) { const g = this.masks[i]!; if (g.visible) { g.visible = false; g.clear(); } }
    this.drawn = this.used + this.lineUsed;
    this.app.render();
    if (this.doomed.length) { for (const t of this.doomed) t.destroy(false); this.doomed = []; }
    if (this.doomedSources.length) { for (const s of this.doomedSources) s.destroy(); this.doomedSources = []; }
  }

  /** drawImage(image, dx, dy), (image, dx, dy, dw, dh) or (image, sx, sy, sw, sh, dx, dy, dw, dh), as a canvas does. */
  drawImage(img: PaintSource, ...n: number[]): void {
    const pixi = this.pixi, root = this.root; if (!pixi || !root || this.state.alpha <= 0) return;
    const iw = img instanceof HTMLImageElement ? img.naturalWidth || img.width : img.width, ih = img instanceof HTMLImageElement ? img.naturalHeight || img.height : img.height;
    if (!iw || !ih) return;
    let sx = 0, sy = 0, sw = iw, sh = ih, dx: number, dy: number, dw = iw, dh = ih;
    if (n.length >= 8) [sx, sy, sw, sh, dx, dy, dw, dh] = n as [number, number, number, number, number, number, number, number];
    else if (n.length >= 4) [dx, dy, dw, dh] = n as [number, number, number, number];
    else [dx = 0, dy = 0] = n;
    if (!sw || !sh || !dw || !dh) return;
    // the image's own pixels to the screen, and the part of them drawn (the source rectangle within the image)
    const m = mul(this.state.m, { a: dw / sw, b: 0, c: 0, d: dh / sh, e: dx - sx * dw / sw, f: dy - sy * dh / sh });
    let u0 = Math.max(0, Math.min(sx, sx + sw)), v0 = Math.max(0, Math.min(sy, sy + sh)), u1 = Math.min(iw, Math.max(sx, sx + sw)), v1 = Math.min(ih, Math.max(sy, sy + sh));
    let mask: { m: M; x: number; y: number; w: number; h: number } | null = null;
    const clip = this.state.clip;
    if (clip) {
      // a clip square to the image's pixels cuts the texture's frame; any other (a turned bitmap fill) is a stencil mask
      const back = inv(m), k = back && mul(back, clip.m);
      if (k && Math.abs(k.b) < 1e-9 && Math.abs(k.c) < 1e-9) {
        const xa = k.a * clip.x + k.e, xb = k.a * (clip.x + clip.w) + k.e, ya = k.d * clip.y + k.f, yb = k.d * (clip.y + clip.h) + k.f;
        u0 = Math.max(u0, Math.min(xa, xb)); u1 = Math.min(u1, Math.max(xa, xb)); v0 = Math.max(v0, Math.min(ya, yb)); v1 = Math.min(v1, Math.max(ya, yb));
      } else mask = clip;
    }
    if (u1 - u0 <= 1e-6 || v1 - v0 <= 1e-6) return;
    const texture = this.texture(img, u0, v0, u1 - u0, v1 - v0); if (!texture) return;
    let sprite = this.sprites[this.used];
    if (!sprite) { sprite = new pixi.Sprite(); root.addChild(sprite); this.sprites.push(sprite); }
    this.used++;
    sprite.texture = texture; sprite.visible = true; sprite.zIndex = this.order++;
    sprite.alpha = this.state.alpha; sprite.blendMode = this.state.blend === 'lighter' ? 'add' : 'normal';
    const t = mul(m, { a: 1, b: 0, c: 0, d: 1, e: u0, f: v0 });
    sprite.setFromMatrix(new pixi.Matrix(t.a, t.b, t.c, t.d, t.e, t.f));
    if (mask) {
      let g = this.masks[this.maskUsed];
      if (!g) { g = new pixi.Graphics(); root.addChild(g); this.masks.push(g); }
      this.maskUsed++;
      g.clear().rect(mask.x, mask.y, mask.w, mask.h).fill(0xffffff); g.visible = true;
      g.setFromMatrix(new pixi.Matrix(mask.m.a, mask.m.b, mask.m.c, mask.m.d, mask.m.e, mask.m.f));
      sprite.mask = g;
    } else if (sprite.mask) sprite.mask = null;
  }
  /** strokeRect with the current strokeStyle (#rrggbb) and lineWidth, centred on the outline as a canvas strokes. */
  strokeRect(x: number, y: number, w: number, h: number): void {
    const pixi = this.pixi, root = this.root; if (!pixi || !root || this.state.alpha <= 0) return;
    let g = this.lines[this.lineUsed];
    if (!g) { g = new pixi.Graphics(); root.addChild(g); this.lines.push(g); }
    this.lineUsed++;
    g.clear().rect(x, y, w, h).stroke({ width: this.state.line, color: this.state.stroke, alignment: 0.5 });
    g.visible = true; g.zIndex = this.order++; g.alpha = this.state.alpha; g.blendMode = this.state.blend === 'lighter' ? 'add' : 'normal';
    const m = this.state.m; g.setFromMatrix(new pixi.Matrix(m.a, m.b, m.c, m.d, m.e, m.f));
  }

  private texture(img: PaintSource, x: number, y: number, w: number, h: number): Texture | null {
    const pixi = this.pixi!;
    let art = this.art.get(img);
    if (!art) {
      // an image or an off-screen canvas: uploaded as it is (straight alpha, premultiplied on upload, smoothed as a canvas draws)
      art = { source: new pixi.ImageSource({ resource: img as HTMLImageElement, scaleMode: 'linear' }), frames: new Map() }; this.art.set(img, art);
    }
    const key = `${x},${y},${w},${h}`;
    let t = art.frames.get(key);
    if (!t) {
      if (art.frames.size >= MAX_FRAMES) { this.doomed.push(...art.frames.values()); art.frames.clear(); }
      t = new pixi.Texture({ source: art.source, frame: new pixi.Rectangle(x, y, w, h) }); art.frames.set(key, t);
    }
    return t;
  }
  /** An image no longer drawn (an evicted recoloured copy): its texture goes after the frame that last showed it. */
  forget(img: PaintSource): void {
    const art = this.art.get(img); if (!art) return;
    this.art.delete(img); this.doomed.push(...art.frames.values()); this.doomedSources.push(art.source);
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app?.destroy({ removeView: true }, { children: true });
    for (const art of this.art.values()) { for (const t of art.frames.values()) t.destroy(false); art.source.destroy(); }
    for (const t of this.doomed) t.destroy(false); for (const s of this.doomedSources) s.destroy();
    this.art.clear(); this.doomed = []; this.doomedSources = []; this.app = null; this.root = null; this.pixi = null; this.sprites.length = this.lines.length = this.masks.length = 0;
    this.element.remove();
  }
}
