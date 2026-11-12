import type { Point } from './maps';
import { pngDimensions } from './scene-format';

export const BLACK_HIT_PIXEL = 0xff000000;
export const RED_HEIGHT_PIXEL = 0xffff0000;
export const EXIT_HIT_PIXELS = Object.freeze([0xff0000ff, 0xff00ffff, 0xff6400ff, 0xff0064ff] as const);
export type ExitIndex = 0 | 1 | 2 | 3;
export function exitIndexFromPixel(argb: number): ExitIndex | null {
  const i = EXIT_HIT_PIXELS.indexOf(argb as typeof EXIT_HIT_PIXELS[number]);
  return i < 0 ? null : i as ExitIndex;
}
/** Exact ARGB comparisons, no brightness/alpha tolerance. Exits also count as walls. */
export function isWallPixel(argb: number): boolean { return argb === BLACK_HIT_PIXEL || exitIndexFromPixel(argb) !== null; }
/** Verified PE constants at 0x00bf24c0 / 0x00be8198, not inferred from art. */
export function heightScaleFromPixel(argb: number): number { return argb === RED_HEIGHT_PIXEL ? Math.fround(0.7) : 1; }
function abort(signal?: AbortSignal): void { if (signal?.aborted) throw new DOMException('Collision operation aborted', 'AbortError'); }
function positive(n: number, max: number): void { if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new RangeError('Collision limit out of bounds'); }
function point(p: Point): void { if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new RangeError('Invalid collision point'); }
export interface PixelMask {
  readonly width: number;
  readonly height: number;
  /** Integer local coordinates; outside returns black. */
  pixel(x: number, y: number): number;
}
/** Copies RGBA bytes: callers cannot mutate the retained collision data. */
export function rgbaMask(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray, maxPixels = 4 * 1024 * 1024, signal?: AbortSignal): PixelMask {
  abort(signal); positive(maxPixels, 16 * 1024 * 1024); positive(width, 8192); positive(height, 8192);
  if (width * height > maxPixels || rgba.length !== width * height * 4) throw new RangeError('Collision pixel budget/length');
  const data = new Uint8Array(rgba);
  return Object.freeze({ width, height, pixel(x: number, y: number): number {
    if (!Number.isInteger(x) || !Number.isInteger(y)) throw new RangeError('Expected integer mask coordinates');
    if (x < 0 || y < 0 || x >= width || y >= height) return BLACK_HIT_PIXEL;
    const i = (y * width + x) * 4;
    return ((data[i + 3] << 24) | (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) >>> 0;
  } });
}
/** Bounded browser PNG decode, no URLs/fetches. Input must come from a readable asset lease. */
export async function decodeCollisionMask(bytes: Uint8Array, options: { maxPixels?: number; signal?: AbortSignal } = {}): Promise<PixelMask> {
  const { signal } = options, maxPixels = options.maxPixels ?? 4 * 1024 * 1024;
  abort(signal); positive(maxPixels, 16 * 1024 * 1024);
  if (bytes.byteLength > 16 * 1024 * 1024) throw new RangeError('Collision encoded byte budget');
  const { width, height } = pngDimensions(bytes);
  if (width * height > maxPixels) throw new RangeError('Collision decode pixel budget');
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') throw new Error('Browser canvas collision decoder unavailable');
  // Copy input to prevent caller mutation between the geometry check and decode.
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  let canvas: HTMLCanvasElement | undefined;
  try {
    abort(signal);
    if (bitmap.width !== width || bitmap.height !== height) throw new Error('Collision decoded geometry mismatch');
    canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Collision canvas unavailable');
    ctx.drawImage(bitmap, 0, 0); abort(signal);
    const mask = rgbaMask(width, height, ctx.getImageData(0, 0, width, height).data, maxPixels, signal);
    abort(signal); return mask;
  } finally { bitmap.close(); if (canvas) { canvas.width = 0; canvas.height = 0; } }
}
/** Streaming tile store. Missing tiles remain unknown, never implicitly walkable. */
export class CollisionTiles {
  private readonly masks = new Map<number, PixelMask>();
  private pixels = 0;
  readonly width: number;
  readonly height: number;
  constructor(readonly tileWidth: number, readonly tileHeight: number, readonly columns: number, readonly rows: number, readonly maxPixels = 16 * 1024 * 1024) {
    positive(tileWidth, 2048); positive(tileHeight, 2048); positive(columns, 16); positive(rows, 16); positive(maxPixels, 64 * 1024 * 1024);
    this.width = tileWidth * columns; this.height = tileHeight * rows;
  }
  private key(column: number, row: number): number {
    if (!Number.isInteger(column) || !Number.isInteger(row) || column < 0 || row < 0 || column >= this.columns || row >= this.rows) throw new RangeError('Collision tile index');
    return column * 16 + row;
  }
  set(column: number, row: number, mask: PixelMask, signal?: AbortSignal): void {
    abort(signal); const key = this.key(column, row);
    positive(mask.width, 8192); positive(mask.height, 8192);
    if (mask.width < this.tileWidth || mask.height < this.tileHeight) throw new RangeError('Collision tile too small');
    const previous = this.masks.get(key), count = this.pixels - (previous ? previous.width * previous.height : 0) + mask.width * mask.height;
    if (count > this.maxPixels) throw new RangeError('Collision retained pixel budget');
    this.masks.set(key, mask); this.pixels = count;
  }
  delete(column: number, row: number): void {
    const key = this.key(column, row), mask = this.masks.get(key);
    if (mask) { this.pixels -= mask.width * mask.height; this.masks.delete(key); }
  }
  clear(): void { this.masks.clear(); this.pixels = 0; }
  get retainedPixels(): number { return this.pixels; }
  /** Caller supplies source integer coordinates (C++ casts truncate toward zero). */
  pixel(x: number, y: number): number | null {
    if (!Number.isInteger(x) || !Number.isInteger(y)) throw new RangeError('Expected integer world coordinates');
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return BLACK_HIT_PIXEL;
    return this.masks.get(Math.floor(x / this.tileWidth) * 16 + Math.floor(y / this.tileHeight))?.pixel(x % this.tileWidth, y % this.tileHeight) ?? null;
  }
}
/** D3DX row-vector XY coefficients from the current avatar engine root world matrix. */
export interface FootTransform { readonly m00: number; readonly m01: number; readonly m10: number; readonly m11: number; readonly m30: number; readonly m31: number }
export interface FootGeometry { readonly center: Point; readonly probes: readonly Point[] }
export function footGeometry(matrix: FootTransform): FootGeometry {
  if (!Object.values(matrix).every(Number.isFinite)) throw new RangeError('Invalid foot matrix');
  const transform = (x: number, y: number): Point => Object.freeze({ x: x * matrix.m00 + y * matrix.m10 + matrix.m30, y: x * matrix.m01 + y * matrix.m11 + matrix.m31 });
  return Object.freeze({ center: transform(40, 116), probes: Object.freeze(Array.from({ length: 16 }, (_, n) => {
    const a = n * Math.fround(0.39269909);
    return transform(Math.fround(Math.cos(a) * 20 + 40), Math.fround(Math.sin(a) * 20 + 116));
  })) });
}
export interface CollisionPixelSource { pixel(x: number, y: number): number | null }
/** A streamed mask is missing. Caller must wait for data; no partial result is returned. */
export class CollisionUnavailableError extends Error {
  constructor(readonly x: number, readonly y: number) { super(`Collision pixels unavailable at ${x},${y}`); this.name = 'CollisionUnavailableError'; }
}
export interface WallProbeResult { readonly step: Point; readonly wallHit: boolean; readonly color: number }
/** CFieldMap::probeWalls (0x00a51e70), XY displacement and ordered radial correction.
 * Geometry must come from the actual engine root, in world space BEFORE step.
 * Pixel coordinates are field-local. `color` starts at zero, as in moveStep.
 * This does not perform moveStep's speed cap, movement threshold, or exits.
 */
export function probeWalls(step: Point, geometry: FootGeometry, pixels: CollisionPixelSource, options: { fieldOrigin?: Point } = {}): WallProbeResult {
  point(step); point(geometry.center);
  if (geometry.probes.length !== 16) throw new RangeError('Expected 16 ordered foot probes');
  geometry.probes.forEach(point);
  const origin = options.fieldOrigin ?? { x: 0, y: 0 }; point(origin);
  const f = Math.fround;
  const input = { x: f(step.x), y: f(step.y) };
  // Each original vector helper stores its components as float before returning.
  const candidate = (p: Point): Point => ({ x: f(f(f(p.x) + input.x) - f(origin.x)), y: f(f(f(p.y) + input.y) - f(origin.y)) });
  const center = candidate(geometry.center);
  const sample = (p: Point): number => {
    const x = Math.trunc(p.x), y = Math.trunc(p.y);
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < -0x80000000 || x > 0x7fffffff || y < -0x80000000 || y > 0x7fffffff) throw new RangeError('Collision coordinate outside int32');
    const color = pixels.pixel(x, y);
    if (color === null) throw new CollisionUnavailableError(x, y);
    return color;
  };
  let correction: Point = { x: 0, y: 0 }, best = 0, wallHit = false, color = 0;
  for (const p of geometry.probes) {
    const probe = candidate(p);
    let blockedColor = sample(probe);
    if (!isWallPixel(blockedColor)) continue;
    wallHit = true;
    const inward = { x: f(center.x - probe.x), y: f(center.y - probe.y) };
    let free = false;
    for (let j = 1; j < 10; j++) {
      const factor = f(j * f(0.1));
      const offset = { x: f(inward.x * factor), y: f(inward.y * factor) };
      const nextColor = sample({ x: f(probe.x + offset.x), y: f(probe.y + offset.y) });
      if (!isWallPixel(nextColor)) {
        free = true;
        if (factor > best) { best = factor; correction = offset; color = blockedColor; }
        break;
      }
      blockedColor = nextColor;
    }
    // Original does not update best/color here or stop the outer loop.
    if (!free) correction = { x: -input.x, y: -input.y };
  }
  return Object.freeze({ step: Object.freeze({ x: f(input.x + correction.x), y: f(input.y + correction.y) }), wallHit, color });
}
/** Source pre-probe smoothing only. Ground scale must be supplied from verified evidence. */
export function smoothGroundStep(previous: Point, input: Point, heightScale: number): Point {
  point(previous); point(input);
  if (!Number.isFinite(heightScale) || heightScale <= 0) throw new RangeError('Invalid ground scale');
  const length = Math.hypot(input.x, input.y), scale = length ? 6 * heightScale / length : 0;
  return { x: previous.x * 0.9 + input.x * scale * 0.1, y: previous.y * 0.9 + input.y * scale * 0.1 };
}
/** Source post-probe movement thresholds only; this does not compute a wall response.
 * Call after an external verified solver has modified the candidate step.
 */
export function finishProbedStep(step: Point, wallHit: boolean): Point {
  point(step);
  const length = Math.hypot(step.x, step.y);
  const factor = wallHit && length > 3 ? 3 / length : 1;
  const x = step.x * factor, y = step.y * factor;
  return Math.hypot(x, y) > 1.2 ? { x, y } : { x: 0, y: 0 };
}
