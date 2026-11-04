import type { Point } from './maps';
export const WORLD_VIEW_WIDTH = 1024;
export const WORLD_VIEW_HEIGHT = 768;
export interface Viewport extends Point { readonly width: number; readonly height: number }
export function validateViewport(view: Viewport): void {
  if (![view.x, view.y, view.width, view.height].every(Number.isFinite) || Math.abs(view.x) > 65536 || Math.abs(view.y) > 65536 || view.width <= 0 || view.height <= 0 || view.width > 32768 || view.height > 32768) throw new RangeError('Invalid world viewport');
}
/** Logical-pixel centered follow. Original camera dead zones are not reproduced. */
export class WorldCamera {
  private x = 0;
  private y = 0;
  readonly width: number;
  readonly height: number;
  constructor(bounds: { width: number; height: number }) {
    if (![bounds.width, bounds.height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 32768)) throw new RangeError('Invalid camera bounds');
    this.width = bounds.width; this.height = bounds.height;
    this.follow({ x: WORLD_VIEW_WIDTH / 2, y: WORLD_VIEW_HEIGHT / 2 });
  }
  follow(player: Point): Viewport {
    if (![player.x, player.y].every(Number.isFinite)) throw new RangeError('Invalid camera target');
    this.x = this.axis(player.x, this.width, WORLD_VIEW_WIDTH);
    this.y = this.axis(player.y, this.height, WORLD_VIEW_HEIGHT);
    return this.viewport;
  }
  private axis(target: number, extent: number, view: number): number {
    return extent < view ? (extent - view) / 2 : Math.min(extent - view, Math.max(0, target - view / 2));
  }
  get viewport(): Viewport { return Object.freeze({ x: this.x, y: this.y, width: WORLD_VIEW_WIDTH, height: WORLD_VIEW_HEIGHT }); }
  worldToScreen(point: Point): Point { this.check(point); return { x: point.x - this.x, y: point.y - this.y }; }
  screenToWorld(point: Point): Point { this.check(point); return { x: point.x + this.x, y: point.y + this.y }; }
  private check(p: Point): void { if (![p.x, p.y].every(Number.isFinite)) throw new RangeError('Invalid camera point'); }
}
