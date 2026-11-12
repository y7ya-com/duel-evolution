import type { Point, WorldMap, WorldPosition } from './maps';
import { PATH_STEP_REACHED, directionFromVector, findPath, segmentWalkable } from './pathfinding';
import type { ExitTrigger } from './exits';
import type { WorldPhysics } from './runtime';
export const WORLD_TICK_MS = 1000 / 30;
export interface WorldNavigatorOptions {
  send(position: WorldPosition): void;
  physics?: WorldPhysics;
  onExit?(exit: ExitTrigger, position: WorldPosition): void | Promise<void>;
  /** False lets the walk go on over an exit (the shop door already used, until the avatar walks off its mat). */
  acceptExit?(exit: ExitTrigger, position: WorldPosition): boolean;
  onError?(error: Error): void;
}
export class WorldNavigator {
  private map: WorldMap | null = null;
  private current: WorldPosition | null = null;
  private route: Point[] = [];
  private routeIndex = 0;
  private step: Point = { x: 0, y: 0 };
  private elapsed = 0;
  private disposed = false;
  private sent: WorldPosition | null = null;
  private waitingForPixels = false;
  private actuallyWalking = false;
  private stillTicks = 0;
  private issue: string | null = null;
  private routeGeneration = 0;
  private readonly send: (position: WorldPosition) => void;
  constructor(private readonly options: WorldNavigatorOptions) { this.send = options.send; }
  get position(): WorldPosition | null { return this.current && { ...this.current }; }
  get moving(): boolean { return !this.disposed && this.routeIndex < this.route.length; }
  get waiting(): boolean { return this.waitingForPixels; }
  get walking(): boolean { return this.actuallyWalking && this.moving && !this.waiting; }
  get error(): string | null { return this.issue; }
  reset(map: WorldMap, position: WorldPosition): void {
    if (this.disposed) return;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || position.x < 0 || position.y < 0 || position.x > 65535 || position.y > 65535 || !Number.isInteger(position.direction) || position.direction < 0 || position.direction > 7) throw new RangeError('Invalid world position');
    this.cancel(); this.map = map; this.current = { ...position }; this.sent = this.round(position);
  }
  moveTo(target: Point): boolean {
    if (this.disposed) return false;
    // a new target while walking (the button held, steered by the cursor) keeps the walk's momentum
    const momentum = this.moving && this.options.physics ? this.step : null, walking = this.actuallyWalking;
    this.cancel();
    if (!this.current || !this.map) return false;
    if (this.options.physics) {
      const width = this.options.physics.definition?.width ?? this.map.width ?? 65535, height = this.options.physics.definition?.height ?? this.map.height ?? 65535;
      if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return false;
      // a point off the map (the cursor held past its edge) is walked toward, to the edge
      target = { x: Math.max(0, Math.min(width - 1, target.x)), y: Math.max(0, Math.min(height - 1, target.y)) };
      // The player walks straight at the target (CPlChibiAvatar has no path follower, passWaypoint below); a wall
      // in the way is slid along by the radial wall solver, as live.
      this.route = [{ ...target }];
      if (momentum) { this.step = momentum; this.actuallyWalking = walking; this.stillTicks = walking ? 0 : 3; }
      const generation = this.routeGeneration;
      void this.options.physics.prepare(this.current).catch(error => { if (generation === this.routeGeneration) this.report(error); });
      return true;
    }
    if (!this.map.grid) return false;
    const path = findPath(this.map.grid, this.current, target);
    if (!path) return false;
    this.route = path; return true;
  }
  cancel(): void { this.routeGeneration++; this.route = []; this.routeIndex = 0; this.step = { x: 0, y: 0 }; this.elapsed = 0; this.waitingForPixels = false; this.actuallyWalking = false; this.stillTicks = 3; this.issue = null; }
  dispose(): void { if (this.disposed) return; this.cancel(); this.disposed = true; this.map = null; this.current = null; this.sent = null; }
  /** Clamp long background frames to 250 ms. Never accumulate a later catch-up burst. */
  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError('Invalid world delta');
    if (!this.moving) return;
    this.elapsed += Math.min(deltaMs, 250);
    for (let ticks = 0; ticks < 8 && this.elapsed + 1e-8 >= WORLD_TICK_MS && this.moving; ticks++) {
      this.elapsed = Math.max(0, this.elapsed - WORLD_TICK_MS); this.tick();
    }
  }
  private round(p: WorldPosition): WorldPosition {
    const integer = this.options.physics ? Math.trunc : Math.round;
    return { x: integer(p.x), y: integer(p.y), direction: p.direction };
  }
  private tick(): void {
    if (this.options.physics) { this.tickPhysics(this.options.physics); return; }
    const p = this.current!, grid = this.map!.grid!;
    const target = this.route[this.routeIndex];
    const dx = target.x - p.x, dy = target.y - p.y, length = Math.hypot(dx, dy);
    let next: Point;
    if (length < 6) {
      next = target;
      // Momentum is cleared at route corners to prevent the smoothed source velocity cutting a wall.
      this.step = { x: 0, y: 0 };
    } else {
      this.step = { x: this.step.x * 0.9 + dx / length * 0.6, y: this.step.y * 0.9 + dy / length * 0.6 };
      if (Math.hypot(this.step.x, this.step.y) <= 1.2) return;
      next = { x: p.x + this.step.x, y: p.y + this.step.y };
    }
    if (!segmentWalkable(grid, p, next)) { this.cancel(); return; }
    this.actuallyWalking = next.x !== p.x || next.y !== p.y;
    const direction = next.x === p.x && next.y === p.y ? p.direction : directionFromVector(next.x - p.x, next.y - p.y);
    this.current = { ...next, direction };
    if (length < 6) this.routeIndex++;
    const rounded = this.round(this.current);
    // Rounding at cell boundaries must not turn a safe local point into a blocked wire coordinate.
    if (segmentWalkable(grid, this.current, rounded) && (!this.sent || rounded.x !== this.sent.x || rounded.y !== this.sent.y || rounded.direction !== this.sent.direction)) {
      this.sent = rounded; this.send({ ...rounded });
    }
    if (!this.moving) this.cancel();
  }
  private tickPhysics(physics: WorldPhysics): void {
    const p = this.current!;
    if (this.passWaypoint(p)) return;
    const target = this.route[this.routeIndex], generation = this.routeGeneration;
    const input = { x: target.x - p.x, y: target.y - p.y }, length = Math.hypot(input.x, input.y);
    const result = physics.step(p, input, this.step, { snap: length < 6 });
    // a tick or two without a step (one under 1.2 px dropped while turning) keeps the walk pose: no stand/walk flicker
    this.waitingForPixels = result.waiting; this.stillTicks = result.moved ? 0 : this.stillTicks + 1; this.actuallyWalking = this.stillTicks < 3;
    if (result.waiting) return; // Preserve target, route, position and smoothing across streaming waits.
    this.step = result.step; this.current = result.position;
    if (length < 6 && Math.hypot(target.x - result.position.x, target.y - result.position.y) < 1e-6) { this.routeIndex++; this.step = { x: 0, y: 0 }; }
    const rounded = this.round(result.position);
    if ((!physics.canPublish || physics.canPublish(rounded)) && (!this.sent || rounded.x !== this.sent.x || rounded.y !== this.sent.y || rounded.direction !== this.sent.direction)) {
      this.sent = rounded; this.send({ ...rounded });
      if (generation !== this.routeGeneration || this.disposed) return;
    }
    if (result.exit && (this.options.acceptExit?.(result.exit, { ...result.position }) ?? true)) {
      this.cancel();
      try { const returned = this.options.onExit?.(result.exit, { ...result.position }); if (returned) void returned.catch(error => this.report(error)); }
      catch (error) { this.report(error); }
      return;
    }
    if (!this.moving) this.cancel();
  }
  /** 0x009d9f70: a path step under 20 px away is passed (momentum kept); the clicked point itself is walked to exactly.
   * The exe has this follower for NPCs only: the A* (0x00a04a30, thunk 0x401a78) is called from 0x009d8a20 and
   * 0x009d9f70 (CNpcChibiAvatar's vtable slot 0x40c87e -> 0x009d9ce0 -> 0x009d9dc0) and from a debug dump of the grid
   * (0x0063c390); CPlChibiAvatar's vtable has no such slot. The player steers straight at the cursor held down: each
   * frame FUN_009cd5c0 runs the radial wall solver, caps the step at 3 px (6.0f * 0.5f) and drops one under 1.2 px
   * (6.0f * 0.2f); FUN_009cd4e0 snaps a target under 6 px away. The rewrite's click walk borrows the NPC's 20 px reach. */
  private passWaypoint(p: Point): boolean {
    while (this.routeIndex < this.route.length - 1) {
      const w = this.route[this.routeIndex];
      if (Math.hypot(w.x - p.x, w.y - p.y) >= PATH_STEP_REACHED) break;
      this.routeIndex++;
    }
    return !this.moving;
  }
  private report(error: unknown): void {
    if (this.disposed) return;
    const issue = error instanceof Error ? error : new Error('World navigation failed');
    this.issue = issue.message.slice(0, 512); this.options.onError?.(issue);
  }
}
