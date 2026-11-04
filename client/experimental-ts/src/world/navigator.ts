import type { Point, WorldMap, WorldPosition } from './maps';
import { directionFromVector, findPath, segmentWalkable } from './pathfinding';
export const WORLD_TICK_MS = 1000 / 30;
export class WorldNavigator {
  private map: WorldMap | null = null;
  private current: WorldPosition | null = null;
  private route: Point[] = [];
  private routeIndex = 0;
  private step: Point = { x: 0, y: 0 };
  private elapsed = 0;
  private disposed = false;
  private sent: WorldPosition | null = null;
  private readonly send: (position: WorldPosition) => void;
  constructor(options: { send: (position: WorldPosition) => void }) { this.send = options.send; }
  get position(): WorldPosition | null { return this.current && { ...this.current }; }
  get moving(): boolean { return !this.disposed && this.routeIndex < this.route.length; }
  reset(map: WorldMap, position: WorldPosition): void {
    if (this.disposed) return;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || position.x < 0 || position.y < 0 || position.x > 65535 || position.y > 65535 || !Number.isInteger(position.direction) || position.direction < 0 || position.direction > 7) throw new RangeError('Invalid world position');
    this.cancel(); this.map = map; this.current = { ...position }; this.sent = this.round(position);
  }
  moveTo(target: Point): boolean {
    if (this.disposed) return false;
    this.cancel();
    if (!this.current || !this.map?.grid) return false;
    const path = findPath(this.map.grid, this.current, target);
    if (!path) return false;
    this.route = path; return true;
  }
  cancel(): void { this.route = []; this.routeIndex = 0; this.step = { x: 0, y: 0 }; this.elapsed = 0; }
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
  private round(p: WorldPosition): WorldPosition { return { x: Math.round(p.x), y: Math.round(p.y), direction: p.direction }; }
  private tick(): void {
    const p = this.current!, grid = this.map!.grid!, target = this.route[this.routeIndex];
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
}
