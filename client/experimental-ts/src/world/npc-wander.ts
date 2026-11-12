// A map NPC's wandering, as CNpcChibiAvatar does it each 30 fps logic frame (yo2.exe; decompiled from the Ghidra
// project in de-scratch/npcart, constants read from the exe):
// - the map NPC builder (0x009ff2d0) gives an NPC whose spot record has flag bit 0 (0x009ff6e4) the map's wander points:
//   every spot record of this map, both tables (0x009dc500 -> 0x00406fcd), as (x, y); the famous NPCs' spots and a few
//   area spots have the bit clear and stand still. (In the exe's tables bit 0 is set exactly where bit 1, the random
//   facing, is: NpcSpot.randomDirection stands for it when world-maps.json predates `wander`.)
// - 0x009d9dc0, every frame, unless the NPC is busy (+0x110, 0x009d8d60: the one being talked to): while the walk timer
//   (+0x138) runs it counts down and the path is followed (0x009d9f70; with no path, one is made first, 0x009d8a20);
//   once it is out the idle timer (+0x13c) counts down, and when that passes zero both start again:
//     walk = trunc(rand() * (3 / 32767) * 30 + 60)      frames: 2 to 5 s     (0xbf0c18, 0xbee5c0, 0xbf0c14)
//     idle = trunc(rand() * (30 / 32767) * 30 + 900)    frames: 30 to 60 s   (0xbf0c10, 0xbee5c0, 0xbf0c0c)
//   A new NPC (0x009d7400) starts idle for trunc((rand() * (60 - 10) / 32767 + 10) * 30) frames (10 to 60 s, 0xd0e2f8 /
//   0xd0e2fc / 0xbf0b94) with no walk time.
// - 0x009d9f70: the path step under 20 px away (int 0xd0e300) is passed and the next one steered to (0x009da260);
//   past the last, a wander point is drawn (rand() % count) and the A* (0x00a04a30, pathfinding.ts astarCells) makes the
//   path to it from where the NPC stands, steered from its first cell.
// - the chibi's own mover walks at the steered point: the player's pace (FUN_009cd5c0: the step eased toward the way,
//   at most 3 px, none under 1.2 px; FUN_009cd4e0 snaps a point under 6 px away). When the walk time ends mid-path the
//   NPC still arrives at the point it was steering to, and stands.
import { avatarDirection } from '../avatars/appearance';
import { astarCells, cellOf, PATH_STEP_REACHED } from './pathfinding';
import type { Point, WalkGrid, WorldPosition } from './maps';

export const NPC_TICK_MS = 1000 / 30;
const RAND_MAX = 32767;
const f32 = Math.fround;
/** The idle and walk times in frames (the exe's float math, truncated as _ftol does). */
export const npcFirstIdle = (r: number) => Math.trunc(f32(f32(f32(f32(r) * f32(60 - 10)) * f32(1 / RAND_MAX)) + 10) * 30);
export const npcWalkTime = (r: number) => Math.trunc(f32(f32(f32(r) * f32(3 / RAND_MAX)) * 30) + 60);
export const npcIdleTime = (r: number) => Math.trunc(f32(f32(f32(r) * f32(30 / RAND_MAX)) * 30) + 900);

export interface NpcWanderOptions {
  /** rand() as the exe's CRT: 0..32767 (default from Math.random). */
  rand?: () => number;
}

/** One wandering NPC: its place, facing and whether it walks this frame; tick() is one 30 fps frame. */
export class NpcWanderer {
  x: number; y: number; direction: number;
  walking = false;
  /** The one being talked to (0x009d8d60): no new walk while set. */
  busy = false;
  walkTimer = 0; idleTimer: number;
  private path: Point[] = [];
  private index = 0;
  private steer: Point | null = null;
  private step = { x: 0, y: 0 };
  private still = 3;
  private elapsed = 0;
  private readonly rand: () => number;
  constructor(at: WorldPosition, private readonly points: readonly Point[], private readonly grid: WalkGrid | null, options: NpcWanderOptions = {}) {
    this.x = at.x; this.y = at.y; this.direction = at.direction;
    this.rand = options.rand ?? (() => Math.floor(Math.random() * (RAND_MAX + 1)));
    this.idleTimer = npcFirstIdle(this.rand());
  }
  /** Advance by real time: whole 30 fps frames (a long pause catches up at most 8 of them). */
  update(dtMs: number): boolean {
    this.elapsed += Math.min(Math.max(dtMs, 0), 250);
    let moved = false;
    for (let n = 0; n < 8 && this.elapsed >= NPC_TICK_MS; n++) { this.elapsed -= NPC_TICK_MS; if (this.tick()) moved = true; }
    if (this.elapsed >= NPC_TICK_MS) this.elapsed = 0;
    return moved;
  }
  /** One frame; true when the NPC moved, turned or started / stopped walking. */
  tick(): boolean {
    const before = `${this.x},${this.y},${this.direction},${this.walking}`;
    if (!this.busy && this.points.length && this.grid) {
      if (this.walkTimer > 0) {
        this.walkTimer--;
        if (!this.path.length) this.newPath();
        this.follow();
      } else if (--this.idleTimer < 0) {
        this.walkTimer = npcWalkTime(this.rand());
        this.idleTimer = npcIdleTime(this.rand());
      }
    }
    this.move();
    return before !== `${this.x},${this.y},${this.direction},${this.walking}`;
  }
  /** 0x009d8a20 / the end of 0x009d9f70: a wander point drawn, the A* path there from here, steered from its start. */
  private newPath(): void {
    const goal = this.points[this.rand() % this.points.length]!;
    const cells = this.grid ? astarCells(this.grid, cellOf(this), cellOf(goal)) : null;
    this.path = cells ?? []; this.index = 0;
    this.steer = this.path[0] ?? null;
  }
  /** 0x009d9f70: the step under 20 px is passed; past the last one, a new path. */
  private follow(): void {
    const at = this.path[this.index]; if (!at) return;
    if (Math.hypot(at.x - this.x, at.y - this.y) >= PATH_STEP_REACHED) return;
    if (++this.index >= this.path.length) { this.newPath(); return; }
    this.steer = this.path[this.index]!;
  }
  /** The chibi's mover toward the steered point (the player's own pace and easing). */
  private move(): void {
    const target = this.steer;
    if (!target) { this.walking = false; return; }
    const dx = target.x - this.x, dy = target.y - this.y, d = Math.hypot(dx, dy);
    if (d < 6) {
      if (d > 0) { this.x = target.x; this.y = target.y; }
      this.step = { x: 0, y: 0 }; this.steer = null; this.walking = false; this.still = 3; return;
    }
    let sx = this.step.x * 0.9 + dx / d * 0.6, sy = this.step.y * 0.9 + dy / d * 0.6;
    const len = Math.hypot(sx, sy); if (len > 3) { sx *= 3 / len; sy *= 3 / len; }
    this.step = { x: sx, y: sy };
    if (Math.hypot(sx, sy) <= 1.2) { this.still++; this.walking = this.still < 3; return; }
    this.x += sx; this.y += sy; this.direction = avatarDirection(sx, sy); this.still = 0; this.walking = true;
  }
}
