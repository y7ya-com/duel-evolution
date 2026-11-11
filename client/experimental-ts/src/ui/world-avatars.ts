import { CanvasSource, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import type { AvatarLoadOptions, AvatarResource } from '../avatars';
import { avatarParts } from '../avatars/appearance';
import { AVATAR_BOX_HEIGHT, AVATAR_BOX_WIDTH, AVATAR_FOOT_X, AVATAR_FOOT_Y, FLAG_HEIGHT, FLAG_TOP, FLAG_WIDTH, MAX_STRIP_FRAMES, NAME_TAG_Y } from '../world/actors';

/** One pose (look x world x motion x direction) baked into a strip of 128 x 160 frames: the chibi's walk cycle as a
 * texture atlas, so a walking avatar only swaps its sprite's frame (no per-frame canvas or DOM drawing). */
export interface PoseStrip { readonly key: string; readonly frames: readonly Texture[]; readonly fps: number; release(): void }
export type CanvasFactory = (width: number, height: number) => HTMLCanvasElement | OffscreenCanvas;
const defaultCanvas: CanvasFactory = (w, h) => { if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export function poseKey(parts: string, world: 0 | 1, motion: 'stand' | 'walk', direction: number): string { return `${world}/${motion}/${direction}/${parts}`; }

/** Draws each movie frame into its own cell (clipped, so a frame never bleeds into the next), as AvatarView did with
 * sourceOrigin: the movie's origin on the feet at (64, 144). Movies longer than MAX_STRIP_FRAMES are sampled. */
export function bakeStrip(key: string, resource: AvatarResource, makeCanvas: CanvasFactory = defaultCanvas): PoseStrip {
  const total = Math.max(1, resource.movie.frameCount), n = Math.min(total, MAX_STRIP_FRAMES);
  const canvas = makeCanvas(AVATAR_BOX_WIDTH * n, AVATAR_BOX_HEIGHT), ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Canvas rendering is unavailable');
  const y = AVATAR_FOOT_Y - resource.pose.offset[1] - resource.pose.foot[1];
  for (let i = 0; i < n; i++) {
    ctx.save();
    try { ctx.beginPath(); ctx.rect(i * AVATAR_BOX_WIDTH, 0, AVATAR_BOX_WIDTH, AVATAR_BOX_HEIGHT); ctx.clip(); resource.draw(ctx, { x: i * AVATAR_BOX_WIDTH + AVATAR_FOOT_X, y, frame: n === total ? i : Math.floor(i * total / n) }); }
    finally { ctx.restore(); }
  }
  const source = new CanvasSource({ resource: canvas as HTMLCanvasElement, scaleMode: 'nearest' });
  const frames = Array.from({ length: n }, (_, i) => new Texture({ source, frame: new Rectangle(i * AVATAR_BOX_WIDTH, 0, AVATAR_BOX_WIDTH, AVATAR_BOX_HEIGHT) }));
  let released = false;
  return { key, frames, fps: resource.movie.fps * n / total, release() { if (released) return; released = true; for (const t of frames) t.destroy(false); source.destroy(); canvas.width = canvas.height = 0; } };
}

interface CacheEntry { strip: PoseStrip; refs: number; used: number }
/** Shared pose strips: one load and one bake per pose however many avatars wear it; unreferenced strips stay a while
 * (an avatar turning back and forth does not reload) and all go when the map is left. */
export class PoseCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<PoseStrip>>();
  private readonly failed = new Set<string>();
  private abort = new AbortController();
  private clock = 0;
  constructor(private readonly load: (parts: Uint8Array, options: AvatarLoadOptions) => Promise<AvatarResource>, private readonly bake: (key: string, resource: AvatarResource) => PoseStrip = bakeStrip, private readonly keep = 32) {}
  get size(): number { return this.entries.size; }
  /** The strip now (taking a reference), or null while it loads; `ready` runs once it can be taken. */
  acquire(key: string, parts: Uint8Array, world: 0 | 1, motion: 'stand' | 'walk', direction: number, ready: () => void): PoseStrip | null {
    const entry = this.entries.get(key);
    if (entry) { entry.refs++; entry.used = ++this.clock; return entry.strip; }
    if (this.failed.has(key)) return null;
    let pending = this.pending.get(key);
    if (!pending) {
      const signal = this.abort.signal;
      pending = this.load(avatarParts(parts), { world, motion, direction, signal }).then(resource => {
        try { if (signal.aborted) throw new DOMException('Avatar load canceled', 'AbortError'); return this.bake(key, resource); } finally { resource.dispose(); }
      });
      this.pending.set(key, pending);
      void pending.then(strip => { if (this.pending.get(key) !== pending) { strip.release(); return; } this.pending.delete(key); this.entries.set(key, { strip, refs: 0, used: ++this.clock }); this.trim(); },
        () => { if (this.pending.get(key) === pending) { this.pending.delete(key); if (!signal.aborted) this.failed.add(key); } });
    }
    void pending.then(() => { if (!this.abort.signal.aborted) ready(); }, () => {});
    return null;
  }
  release(strip: PoseStrip): void { const entry = this.entries.get(strip.key); if (entry?.strip === strip) { entry.refs = Math.max(0, entry.refs - 1); this.trim(); } }
  private trim(): void {
    const idle = [...this.entries.values()].filter(e => e.refs === 0).sort((a, b) => a.used - b.used);
    for (const e of idle.slice(0, Math.max(0, idle.length - this.keep))) { this.entries.delete(e.strip.key); e.strip.release(); }
  }
  /** Leaving the map: every strip's texture goes, pending loads are dropped. */
  clear(): void { this.abort.abort(); this.abort = new AbortController(); this.pending.clear(); this.failed.clear(); for (const e of this.entries.values()) e.strip.release(); this.entries.clear(); }
}

/** One avatar on the field: its body (a strip frame), a placeholder until the art is in, the name and the flag. */
export class AvatarActor {
  readonly root = new Container();
  readonly body = new Sprite(Texture.EMPTY);
  readonly placeholder = new Graphics();
  readonly name: Text;
  readonly flag = new Sprite(Texture.EMPTY);
  strip: PoseStrip | null = null;
  wanted = '';
  frame = 0;
  started = 0;
  drawn = false;
  /** The hit target's last written left / top (the DOM overlay is written only when these change). */
  hitLeft = ''; hitTop = '';
  /** The pose last asked for (a remote turning or starting / stopping asks again). */
  poseWalking = false; poseDirection = -1;
  private partsRef: Uint8Array | null = null; private partsText = '';
  /** The look's key text, joined once per appearance (not each frame). */
  partsKey(parts: Uint8Array): string { if (parts !== this.partsRef) { this.partsRef = parts; this.partsText = parts.join(','); } return this.partsText; }
  constructor(readonly id: number, name: string, self: boolean) {
    this.root.label = `avatar:${id}`;
    this.body.anchor.set(AVATAR_FOOT_X / AVATAR_BOX_WIDTH, AVATAR_FOOT_Y / AVATAR_BOX_HEIGHT); this.body.visible = false;
    // the stand-in capsule (the DOM view's .de-avatar-placeholder): 26 x 44, its bottom 10% over the box's bottom
    this.placeholder.roundRect(-13, -60, 26, 44, 9).fill({ color: 0x1761bf }).stroke({ color: self ? 0xffe56d : 0xcdf5ff, width: 2 });
    this.name = new Text({ text: name, style: { fontFamily: 'Arial, sans-serif', fontSize: 16, fill: 0xffffff, letterSpacing: 0.64, stroke: { color: 0x000000, width: 3, join: 'round' } }, resolution: 1 });
    this.name.anchor.set(0, 0.5); this.name.position.set(0, NAME_TAG_Y);
    this.flag.visible = false; this.flag.position.set(-FLAG_WIDTH, NAME_TAG_Y + FLAG_TOP);
    this.root.addChild(this.placeholder, this.body, this.flag, this.name);
  }
  setName(name: string): void { if (this.name.text !== name) this.name.text = name; }
  setFlag(texture: Texture | null): void { this.flag.texture = texture ?? Texture.EMPTY; this.flag.visible = !!texture; this.flag.width = FLAG_WIDTH; this.flag.height = FLAG_HEIGHT; }
  show(strip: PoseStrip, now: number): void { this.strip = strip; this.started = now; this.frame = 0; this.body.texture = strip.frames[0]; this.body.visible = true; this.placeholder.visible = false; this.drawn = true; }
  destroy(): void { this.root.destroy({ children: true }); }
}
