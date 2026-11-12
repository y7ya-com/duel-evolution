import { CanvasSource, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { AvatarLoadOptions, AvatarResource } from '../avatars';
import { avatarParts } from '../avatars/appearance';
import { NPC_STARS_X, NPC_STARS_Y, npcStarCells, type NpcStars } from '../avatars/npc';
import { AVATAR_BOX_HEIGHT, AVATAR_BOX_WIDTH, AVATAR_FOOT_X, AVATAR_FOOT_Y, FLAG_HEIGHT, FLAG_WIDTH, MAX_STRIP_FRAMES } from '../world/actors';
import { drawNameTag, NAME_TAG_FLAG_TOP, NAME_TAG_FLAG_X, NAME_TAG_TOP, type GlyphAtlas } from '../world/name-tag';

/** One pose (look x world x motion x direction) baked into a strip of 128 x 160 frames: the chibi's walk cycle as a
 * texture atlas, so a walking avatar only swaps its sprite's frame (no per-frame canvas or DOM drawing). */
export interface PoseStrip { readonly key: string; readonly frames: readonly Texture[]; readonly fps: number; release(): void }
export type CanvasFactory = (width: number, height: number) => HTMLCanvasElement | OffscreenCanvas;
const defaultCanvas: CanvasFactory = (w, h) => { if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export function poseKey(parts: string, world: 0 | 1, motion: 'stand' | 'walk', direction: number): string { return `${world}/${motion}/${direction}/${parts}`; }
/** A famous NPC's own art (its cn_ set): standing or the blink, per facing. */
export function npcPoseKey(set: string, motion: 'stand' | 'blink', direction: number): string { return `npc/${set}/${motion}/${direction}`; }
/** What a pose strip is loaded from (AvatarLoader.load's options without the signal). */
export type PoseRequest = Omit<AvatarLoadOptions, 'signal'>;

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
  private readonly failures = new Set<string>();
  private abort = new AbortController();
  private clock = 0;
  constructor(private readonly load: (parts: Uint8Array, options: AvatarLoadOptions) => Promise<AvatarResource>, private readonly bake: (key: string, resource: AvatarResource) => PoseStrip = bakeStrip, private readonly keep = 32) {}
  get size(): number { return this.entries.size; }
  /** Whether this pose's art could not be loaded (its files missing or broken) since the map was entered. */
  failed(key: string): boolean { return this.failures.has(key); }
  /** The strip now (taking a reference), or null while it loads; `ready` runs once it can be taken, or once it failed
   * (failed(key) then says so, and the caller picks another look). */
  acquire(key: string, parts: Uint8Array, request: PoseRequest, ready: () => void): PoseStrip | null {
    const entry = this.entries.get(key);
    if (entry) { entry.refs++; entry.used = ++this.clock; return entry.strip; }
    if (this.failures.has(key)) return null;
    let pending = this.pending.get(key);
    if (!pending) {
      const signal = this.abort.signal;
      pending = this.load(avatarParts(parts), { ...request, signal }).then(resource => {
        try { if (signal.aborted) throw new DOMException('Avatar load canceled', 'AbortError'); return this.bake(key, resource); } finally { resource.dispose(); }
      });
      this.pending.set(key, pending);
      void pending.then(strip => { if (this.pending.get(key) !== pending) { strip.release(); return; } this.pending.delete(key); this.entries.set(key, { strip, refs: 0, used: ++this.clock }); this.trim(); },
        (e: unknown) => { if (this.pending.get(key) === pending) { this.pending.delete(key); if (!signal.aborted) { this.failures.add(key); console.warn('avatar art', key, e); } } });
    }
    const epoch = this.abort.signal;
    void pending.then(() => { if (!epoch.aborted) ready(); }, () => { if (!epoch.aborted) ready(); });
    return null;
  }
  release(strip: PoseStrip): void { const entry = this.entries.get(strip.key); if (entry?.strip === strip) { entry.refs = Math.max(0, entry.refs - 1); this.trim(); } }
  private trim(): void {
    const idle = [...this.entries.values()].filter(e => e.refs === 0).sort((a, b) => a.used - b.used);
    for (const e of idle.slice(0, Math.max(0, idle.length - this.keep))) { this.entries.delete(e.strip.key); e.strip.release(); }
  }
  /** Leaving the map: every strip's texture goes, pending loads are dropped. */
  clear(): void { this.abort.abort(); this.abort = new AbortController(); this.pending.clear(); this.failures.clear(); for (const e of this.entries.values()) e.strip.release(); this.entries.clear(); }
}

/** The name tag's texture: the engine's glyphs (name-tag.ts) on a canvas, `scale` times (the renderer's resolution). */
export function nameTagTexture(atlas: GlyphAtlas, text: string, rgb: number, hi: GlyphAtlas | null = null, makeCanvas: CanvasFactory = defaultCanvas): Texture | null {
  if (!text) return null;
  const tag = drawNameTag(atlas, text, rgb, hi), canvas = makeCanvas(tag.width, tag.height), ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.putImageData(new ImageData(tag.data as unknown as Uint8ClampedArray<ArrayBuffer>, tag.width, tag.height), 0, 0);
  // a 2x tag is drawn at half its texels (resolution 2), so it stands where the 1x one does
  const source = new CanvasSource({ resource: canvas as HTMLCanvasElement, scaleMode: tag.scale > 1 ? 'linear' : 'nearest', resolution: tag.scale });
  return new Texture({ source });
}

/** One avatar on the field: its body (a strip frame), a placeholder until the art is in, the name, the flag and (an
 * NPC) its level stars. A famous NPC also holds its blink strip, played over the standing frame now and then. */
export class AvatarActor {
  readonly root = new Container();
  readonly body = new Sprite(Texture.EMPTY);
  readonly placeholder = new Graphics();
  /** The name tag (its texture the engine's glyphs, nameTagTexture; none until the glyph table is in). */
  readonly name = new Sprite(Texture.EMPTY);
  /** The name shown and its colour (0xRRGGBB). */
  label = ''; labelColor = 0;
  /** The 2x glyphs the tag was drawn with (render scale 2), or null. */
  labelFace: GlyphAtlas | null = null;
  readonly flag = new Sprite(Texture.EMPTY);
  readonly stars = new Container();
  strip: PoseStrip | null = null;
  /** A famous NPC's blink (cn_t), its key, when it started (null: standing) and when the next one starts. */
  blink: PoseStrip | null = null;
  blinkWanted = '';
  blinkAt: number | null = null;
  nextBlink = 0;
  /** An NPC drawn in the default look (its own art failed): warned once. */
  fellBack = false;
  /** The stars shown (big/small), '' for none. */
  starsKey = '';
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
    // the name's left edge on the feet, the flag 25 px left of them, both on the engine's label line (name-tag.ts)
    this.label = name; this.name.position.set(0, NAME_TAG_TOP); this.name.visible = false;
    this.flag.visible = false; this.flag.position.set(NAME_TAG_FLAG_X, NAME_TAG_FLAG_TOP);
    this.stars.label = 'stars'; this.stars.visible = false; this.stars.position.set(NPC_STARS_X, NPC_STARS_Y);
    this.root.addChild(this.placeholder, this.body, this.stars, this.flag, this.name);
  }
  /** The level stars from the two star pictures (16 px and 8 px), rebuilt only when the count changes. */
  setStars(stars: NpcStars | undefined, big: Texture | null, small: Texture | null): void {
    const key = stars && (stars.big || stars.small) && big && small ? `${stars.big}/${stars.small}` : '';
    if (key === this.starsKey) return;
    this.starsKey = key; for (const child of this.stars.removeChildren()) child.destroy();
    this.stars.visible = !!key; if (!key || !stars) return;
    for (const cell of npcStarCells(stars)) { const star = new Sprite(cell.big ? big! : small!); star.position.set(cell.x, cell.y); this.stars.addChild(star); }
  }
  /** The name tag: redrawn when the text or its colour changed, or the glyph table came in. */
  setName(name: string, rgb: number, atlas: GlyphAtlas | null, hi: GlyphAtlas | null = null, makeCanvas?: CanvasFactory): void {
    const drawn = this.name.texture !== Texture.EMPTY;
    if (name === this.label && rgb === this.labelColor && hi === this.labelFace && (drawn || !atlas)) return;
    this.label = name; this.labelColor = rgb; this.labelFace = hi;
    const old = this.name.texture, texture = atlas ? nameTagTexture(atlas, name, rgb, hi, makeCanvas) : null;
    this.name.texture = texture ?? Texture.EMPTY; this.name.visible = !!texture;
    if (old !== Texture.EMPTY) old.destroy(true);
  }
  setFlag(texture: Texture | null): void { this.flag.texture = texture ?? Texture.EMPTY; this.flag.visible = !!texture; this.flag.width = FLAG_WIDTH; this.flag.height = FLAG_HEIGHT; }
  show(strip: PoseStrip, now: number): void { this.strip = strip; this.started = now; this.frame = 0; this.blinkAt = null; this.body.texture = strip.frames[0]; this.body.visible = true; this.placeholder.visible = false; this.drawn = true; }
  destroy(): void { if (this.name.texture !== Texture.EMPTY) this.name.texture.destroy(true); this.root.destroy({ children: true }); }
}
