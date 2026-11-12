import { avatarDirection } from '../avatars/appearance';
import { WORLD_TICK_MS } from './navigator';
import type { Point } from './maps';

/** The world drawing's pure rules (src/ui/world.ts draws them with PixiJS; these stay testable without a GPU). */

/** An avatar's art box, as AvatarView's canvas: 128 x 160 with the feet (the network point) at (64, 144). */
export const AVATAR_BOX_WIDTH = 128, AVATAR_BOX_HEIGHT = 160;
export const AVATAR_FOOT_X = 64, AVATAR_FOOT_Y = 144;
/** The flag before the name: CNationFlag's 22 x 15 cell (its place: world/name-tag.ts). */
export const FLAG_WIDTH = 22, FLAG_HEIGHT = 15;
/** At most this many avatars carry original art at once (the nearest, self first). */
export const MAX_DRAWN_AVATARS = 24;
/** Baked walk / stand frames per pose strip (longer movies are sampled). */
export const MAX_STRIP_FRAMES = 32;

/** The other players' walk between server positions: the original's own pace, 3 px per 30 fps logic step. */
export const REMOTE_STEP_PX = 3;
/** A jump this far (a teleport, a map entry, a long silence) snaps instead of walking. */
export const REMOTE_SNAP_PX = 320;

/** One other player walking toward the last server position (DuelForge's remote chase, at the exe's walk pace). */
export class ActorMotion {
  x: number; y: number;
  private tx: number; private ty: number;
  direction: number;
  walking = false;
  /** The server's facing for the position walked to (taken on arrival). */
  private final: number | undefined;
  constructor(at: Point, direction = 0) { this.x = this.tx = at.x; this.y = this.ty = at.y; this.direction = direction; }
  get target(): Point { return { x: this.tx, y: this.ty }; }
  /** A new server position: walk there (or snap when it is far, or the motion is the player's own). */
  retarget(at: Point, direction: number | undefined, snap = false): void {
    this.tx = at.x; this.ty = at.y; this.final = direction;
    if (snap || Math.hypot(at.x - this.x, at.y - this.y) > REMOTE_SNAP_PX) { this.x = at.x; this.y = at.y; this.walking = false; }
    if (!this.walking && direction !== undefined && this.x === this.tx && this.y === this.ty) this.direction = direction;
  }
  /** Advance by `dtMs`; returns true while it moved. The final direction is the server's once arrived. */
  step(dtMs: number, finalDirection = this.final): boolean {
    const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
    if (d === 0) { if (this.walking && finalDirection !== undefined) this.direction = finalDirection; this.walking = false; return false; }
    const max = REMOTE_STEP_PX * Math.min(Math.max(dtMs, 0), 250) / WORLD_TICK_MS;
    if (d <= max) { this.x = this.tx; this.y = this.ty; this.walking = false; if (finalDirection !== undefined) this.direction = finalDirection; return true; }
    this.x += dx / d * max; this.y += dy / d * max; this.walking = true; this.direction = avatarDirection(dx, dy); return true;
  }
}

/** The movie frame shown `elapsedMs` into a looping strip of `frames` baked frames at `fps`. */
export function stripFrame(elapsedMs: number, fps: number, frames: number): number {
  if (!(frames > 1) || !(fps > 0) || !(elapsedMs > 0)) return 0;
  return Math.floor(elapsedMs * fps / 1000) % frames;
}

/** Which avatars get original art: those near the view (self first, then the nearest), at most MAX_DRAWN_AVATARS. */
export function drawnAvatars<T extends { id: number; x: number; y: number; self?: boolean; parts?: Uint8Array; npcArt?: string }>(avatars: readonly T[], view: { x: number; y: number; width: number; height: number } | null): Set<number> {
  const self = avatars.find(a => a.self), origin = self ?? { x: 512, y: 384 };
  return new Set(avatars.filter(a => (a.parts?.length === 16 || !!a.npcArt) && (!view || a.x >= view.x - 128 && a.x <= view.x + view.width + 128 && a.y >= view.y - 160 && a.y <= view.y + view.height + 160))
    .sort((a, b) => Number(!!b.self) - Number(!!a.self) || Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y) || a.id - b.id)
    .slice(0, MAX_DRAWN_AVATARS).map(a => a.id));
}
