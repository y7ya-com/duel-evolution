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

/** The chibi mover's pace (FUN_009cd5c0, CChibiAvatarElm): the step eased toward the way, 0.9 of the last step plus 0.1
 * of a 6 px one, so 6 px per 30 fps logic frame (180 px/s) once under way; a step of 1.2 px or less is not taken, and a
 * point under 6 px away is snapped to. Live draws the other players and the map NPCs with it as well as one's own
 * avatar (measured on live 2026-11-13: remote players and wandering NPCs top out at 6.0 px a frame). */
export const CHIBI_STEP_PX = 6;
export const CHIBI_MIN_STEP_PX = 1.2;
/** One eased step toward (dx, dy), d = its length > 0. */
export function chibiStep(step: Point, dx: number, dy: number, d: number): Point {
  return { x: step.x * 0.9 + dx / d * CHIBI_STEP_PX * 0.1, y: step.y * 0.9 + dy / d * CHIBI_STEP_PX * 0.1 };
}
/** A jump this far (a teleport, a map entry, a long silence) snaps instead of walking. */
export const REMOTE_SNAP_PX = 320;

/** One other player walking toward the last server position, as live's chibi does: the 30 fps mover above, and drawn
 * between its last two logic points at the screen's own rate (x, y), so 60 Hz and faster screens move it smoothly. */
export class ActorMotion {
  /** Where it is drawn this frame. */
  x: number; y: number;
  direction: number;
  walking = false;
  private lx: number; private ly: number;
  private px: number; private py: number;
  private tx: number; private ty: number;
  private step_: Point = { x: 0, y: 0 };
  private elapsed = 0;
  /** The server's facing for the position walked to (taken on arrival). */
  private final: number | undefined;
  constructor(at: Point, direction = 0) { this.x = this.lx = this.px = this.tx = at.x; this.y = this.ly = this.py = this.ty = at.y; this.direction = direction; }
  get target(): Point { return { x: this.tx, y: this.ty }; }
  /** A new server position: walk there (or snap when it is far, or the motion is the player's own / a wanderer's). */
  retarget(at: Point, direction: number | undefined, snap = false): void {
    this.tx = at.x; this.ty = at.y; this.final = direction;
    if (snap || Math.hypot(at.x - this.lx, at.y - this.ly) > REMOTE_SNAP_PX) {
      this.x = this.lx = this.px = at.x; this.y = this.ly = this.py = at.y; this.step_ = { x: 0, y: 0 }; this.elapsed = 0; this.walking = false;
    }
    if (!this.walking && direction !== undefined && this.x === this.tx && this.y === this.ty) this.direction = direction;
  }
  /** Advance by `dtMs` (whole 30 fps logic frames, at most 8 for a long frame; the drawing in between); returns true
   * while it moved, turned or stopped. The final direction is the server's once arrived. */
  step(dtMs: number, finalDirection = this.final): boolean {
    const bx = this.x, by = this.y, bd = this.direction, bw = this.walking;
    if (this.lx === this.tx && this.ly === this.ty && this.x === this.tx && this.y === this.ty) {
      if (this.walking && finalDirection !== undefined) this.direction = finalDirection;
      this.walking = false; this.elapsed = 0; this.px = this.lx; this.py = this.ly;
      return bw !== this.walking || bd !== this.direction;
    }
    this.elapsed += Math.min(Math.max(dtMs, 0), 250);
    for (let n = 0; n < 8 && this.elapsed >= WORLD_TICK_MS; n++) { this.elapsed -= WORLD_TICK_MS; this.px = this.lx; this.py = this.ly; this.tick(); }
    if (this.elapsed >= WORLD_TICK_MS) this.elapsed = 0;
    const a = Math.min(1, this.elapsed / WORLD_TICK_MS);
    this.x = this.px + (this.lx - this.px) * a; this.y = this.py + (this.ly - this.py) * a;
    const arrived = this.lx === this.tx && this.ly === this.ty && this.px === this.lx && this.py === this.ly;
    if (arrived) { this.x = this.tx; this.y = this.ty; this.walking = false; if (finalDirection !== undefined) this.direction = finalDirection; }
    else this.walking = true;
    return this.x !== bx || this.y !== by || this.direction !== bd || this.walking !== bw;
  }
  /** One logic frame of the mover toward the server position. */
  private tick(): void {
    const dx = this.tx - this.lx, dy = this.ty - this.ly, d = Math.hypot(dx, dy);
    if (d === 0) { this.step_ = { x: 0, y: 0 }; return; }
    this.direction = avatarDirection(dx, dy);
    if (d < CHIBI_STEP_PX) { this.lx = this.tx; this.ly = this.ty; this.step_ = { x: 0, y: 0 }; return; }
    const s = chibiStep(this.step_, dx, dy, d); this.step_ = s;
    if (Math.hypot(s.x, s.y) <= CHIBI_MIN_STEP_PX) return;
    this.lx += s.x; this.ly += s.y;
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
