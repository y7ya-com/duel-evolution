import type { Point } from './maps';
export const WORLD_VIEW_WIDTH = 1024;
export const WORLD_VIEW_HEIGHT = 768;
/** CFieldMap margins (+0x9a6f60 / +0x9a6f64, both 300); scrollTo adds a further 50 below (0xbf0a9c). */
export const CAMERA_MARGIN_X = 300;
export const CAMERA_MARGIN_Y = 300;
export const CAMERA_MARGIN_BOTTOM_EXTRA = 50;
export interface Viewport extends Point { readonly width: number; readonly height: number }
export function validateViewport(view: Viewport): void {
  if (![view.x, view.y, view.width, view.height].every(Number.isFinite) || Math.abs(view.x) > 65536 || Math.abs(view.y) > 65536 || view.width <= 0 || view.height <= 0 || view.width > 32768 || view.height > 32768) throw new RangeError('Invalid world viewport');
}
const f = Math.fround;
/**
 * CFieldMap::scrollTo (0x00a505a0), called every frame with the avatar's world position (CChibiAvatarElm +0x70,
 * 0x009c5560: snap false) and once on map load (0x00a01740 / 0x00a024e0: snap true).
 * - snap: centre, camera = p - (512, 384).
 * - dead zone, no easing: the camera moves only when the avatar is within 300 px of the left / right / top edge or
 *   350 px of the bottom, and then by exactly the overshoot (an instant scroll).
 * - clamp: camera < 0 becomes 0, then camera + 1024 / 768 past the map's tiles (columns x tile width) becomes
 *   map - view (so a map smaller than the view sits flush right / bottom, as the original draws it).
 * - the field is drawn at trunc(-camera) (+0x70 / +0x74, C cast toward zero): screen = world - trunc(camera).
 * Camera floats are stored float32 like the original's fstp.
 */
export class WorldCamera {
  private cx = 0;
  private cy = 0;
  readonly width: number;
  readonly height: number;
  constructor(bounds: { width: number; height: number }) {
    if (![bounds.width, bounds.height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 32768)) throw new RangeError('Invalid camera bounds');
    this.width = bounds.width; this.height = bounds.height;
    this.follow({ x: WORLD_VIEW_WIDTH / 2, y: WORLD_VIEW_HEIGHT / 2 }, true);
  }
  /** One scrollTo call. `snap` recentres first (map load / teleport); otherwise only the dead zone moves the camera. */
  follow(player: Point, snap = false): Viewport {
    if (![player.x, player.y].every(Number.isFinite)) throw new RangeError('Invalid camera target');
    const px = f(player.x), py = f(player.y), vw = WORLD_VIEW_WIDTH, vh = WORLD_VIEW_HEIGHT;
    let x = this.cx, y = this.cy;
    if (snap) { x = f(px - vw * 0.5); y = f(py - vh * 0.5); }
    if (px - x < CAMERA_MARGIN_X) x = f(px - CAMERA_MARGIN_X);
    if (py - y < CAMERA_MARGIN_Y) y = f(py - CAMERA_MARGIN_Y);
    if (vw + x - px < CAMERA_MARGIN_X) x = f(CAMERA_MARGIN_X + px - vw);
    const bottom = CAMERA_MARGIN_Y + CAMERA_MARGIN_BOTTOM_EXTRA;
    if (bottom > vh + y - py) y = f(CAMERA_MARGIN_Y + py + CAMERA_MARGIN_BOTTOM_EXTRA - vh);
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (vw + x > this.width) x = f(this.width - vw);
    if (vh + y > this.height) y = f(this.height - vh);
    this.cx = x; this.cy = y;
    return this.viewport;
  }
  /** Puts the camera back where it was (a scene shown over the map and left: the map was not rebuilt on live). */
  restore(at: Point): void { if ([at.x, at.y].every(Number.isFinite)) { this.cx = f(at.x); this.cy = f(at.y); } }
  /** The float camera before the draw's truncation. */
  get exact(): Point { return { x: this.cx, y: this.cy }; }
  get viewport(): Viewport { return Object.freeze({ x: Math.trunc(this.cx) || 0, y: Math.trunc(this.cy) || 0, width: WORLD_VIEW_WIDTH, height: WORLD_VIEW_HEIGHT }); }
  worldToScreen(point: Point): Point { this.check(point); const v = this.viewport; return { x: point.x - v.x, y: point.y - v.y }; }
  screenToWorld(point: Point): Point { this.check(point); const v = this.viewport; return { x: point.x + v.x, y: point.y + v.y }; }
  private check(p: Point): void { if (![p.x, p.y].every(Number.isFinite)) throw new RangeError('Invalid camera point'); }
}
