import type { AssetLease } from '../assets';
import { checkAbort, WorkQueue } from '../assets/async';
import { playerFootTransform, IDENTITY_FOOT_TRANSFORM } from '../avatars/transform';
import { CollisionTiles, CollisionUnavailableError, decodeCollisionMask, finishProbedStep, footGeometry, heightScaleFromPixel, probeWalls, smoothGroundStep } from './collision';
import type { FootTransform } from './collision';
import { detectExit } from './exits';
import type { ExitTrigger } from './exits';
import type { Point, WorldMap, WorldPosition } from './maps';
import { directionFromVector } from './pathfinding';
import { parseSceneTable, SCENE_TABLE_PATH, sceneTilePath } from './scene-format';
import type { SceneDefinition } from './scene-format';

export interface WorldRuntimeOptions {
  assets: { readScene(path: string, signal?: AbortSignal): Promise<AssetLease> };
  decodeMask?: typeof decodeCollisionMask;
  maxRetainedPixels?: number; maxTiles?: number; concurrency?: number;
  /** Browser field-local frame defaults to zero; a shared camera translation cancels in probing. */
  fieldOrigin?: Point | (() => Point);
  footTransform?(position: WorldPosition, direction: number): FootTransform;
  crossings?: boolean;
}
export interface WorldPhysicsStep {
  readonly position: WorldPosition;
  /** Pre-probe smoothed velocity retained for the next source step. */
  readonly step: Point; readonly displacement: Point;
  readonly moved: boolean; readonly waiting: boolean; readonly wallHit: boolean; readonly exit: ExitTrigger | null;
}
export interface WorldPhysics {
  readonly definition: SceneDefinition | null;
  prepare(position: WorldPosition, signal?: AbortSignal): Promise<void>;
  step(position: WorldPosition, input: Point, previousStep: Point, options?: { snap?: boolean }): WorldPhysicsStep;
  canPublish?(position: WorldPosition): boolean;
}
function bounded(n: number | undefined, fallback: number, max: number): number {
  const value = n ?? fallback; if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new RangeError('Invalid world runtime budget'); return value;
}
function point(p: Point): void { if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new RangeError('Invalid world runtime point'); }
function aborted(): DOMException { return new DOMException('World collision operation aborted', 'AbortError'); }

/** One map of streamed collision tiles. Resources are released immediately after
 * pixel decoding; only bounded immutable masks remain. Missing data never means free. */
export class WorldRuntime implements WorldPhysics {
  private map: WorldMap | null = null;
  private scene: SceneDefinition | null = null;
  private tiles: CollisionTiles | null = null;
  private readonly retained = new Map<number, { column: number; row: number; pixels: number }>();
  private readonly jobs = new Map<number, Promise<void>>();
  private readonly failures = new Map<number, Error>();
  private wanted = new Set<number>();
  private generation = 0;
  private controller = new AbortController();
  private detachSignal: () => void = () => {};
  private closed = false;
  private loading = false;
  private error: string | null = null;
  private readonly workers: WorkQueue;
  private readonly maxPixels: number;
  private readonly maxTiles: number;
  constructor(private readonly options: WorldRuntimeOptions) {
    this.maxPixels = bounded(options.maxRetainedPixels, 16 * 1024 * 1024, 64 * 1024 * 1024);
    this.maxTiles = bounded(options.maxTiles, 16, 64);
    this.workers = new WorkQueue(bounded(options.concurrency, 2, 4), this.maxTiles);
  }
  get definition(): SceneDefinition | null { return this.scene; }
  get status(): { mapId: number | null; loading: boolean; pendingTiles: number; loadedTiles: number; retainedPixels: number; error: string | null } {
    return { mapId: this.map?.id ?? null, loading: this.loading, pendingTiles: this.jobs.size,
      loadedTiles: this.retained.size, retainedPixels: this.tiles?.retainedPixels ?? 0, error: this.error };
  }
  private origin(): Point { const p = typeof this.options.fieldOrigin === 'function' ? this.options.fieldOrigin() : this.options.fieldOrigin ?? { x: 0, y: 0 }; point(p); return p; }
  private geometry(position: WorldPosition, direction = position.direction) {
    const origin = this.origin();
    const matrix = this.options.footTransform?.(position, direction) ?? playerFootTransform(position, direction, {
      parentWorld: { ...IDENTITY_FOOT_TRANSFORM, m30: origin.x, m31: origin.y },
    });
    return { geometry: footGeometry(matrix), origin };
  }
  async load(map: WorldMap, position: WorldPosition, signal?: AbortSignal): Promise<void> {
    if (this.closed) throw new Error('World runtime disposed');
    checkAbort(signal); point(position);
    const generation = ++this.generation; this.controller.abort(); this.detachSignal(); this.controller = new AbortController();
    const controller = this.controller, cancel = () => controller.abort(); signal?.addEventListener('abort', cancel, { once: true });
    this.detachSignal = () => signal?.removeEventListener('abort', cancel);
    this.map = map; this.scene = null; this.tiles?.clear(); this.tiles = null;
    this.retained.clear(); this.jobs.clear(); this.failures.clear(); this.wanted.clear(); this.error = null; this.loading = true;
    let lease: AssetLease | undefined;
    try {
      lease = await this.workers.run(() => this.options.assets.readScene(SCENE_TABLE_PATH, controller.signal), controller.signal); checkAbort(controller.signal);
      const definition = parseSceneTable(lease.value.bytes).get(map.name);
      if (!definition) throw new Error(`Collision scene section missing: ${map.name}`);
      if (generation !== this.generation || this.closed) throw aborted();
      this.scene = definition; this.tiles = new CollisionTiles(definition.tileWidth, definition.tileHeight, definition.columns, definition.rows, this.maxPixels);
      await this.prepare(position, controller.signal); checkAbort(controller.signal);
    } catch (error) {
      if (generation === this.generation && !controller.signal.aborted) this.error = error instanceof Error ? error.message : 'Collision loading failed';
      throw error;
    } finally { lease?.release(); if (generation === this.generation) this.loading = false; }
  }
  /** Prefetch a small neighborhood around the source foot probes, not the whole map. */
  async prepare(position: WorldPosition, signal?: AbortSignal): Promise<void> {
    if (this.closed) throw new Error('World runtime disposed'); checkAbort(signal); checkAbort(this.controller.signal); point(position);
    const d = this.scene; if (!d || !this.tiles) throw new CollisionUnavailableError(Math.trunc(position.x), Math.trunc(position.y));
    const { geometry, origin } = this.geometry(position), points = [position, ...geometry.probes.map(p => ({ x: p.x - origin.x, y: p.y - origin.y }))];
    const minX = Math.min(...points.map(p => p.x)) - 32, maxX = Math.max(...points.map(p => p.x)) + 32;
    const minY = Math.min(...points.map(p => p.y)) - 32, maxY = Math.max(...points.map(p => p.y)) + 32;
    const requests: { column: number; row: number; key: number }[] = [];
    for (let column = Math.max(0, Math.floor(minX / d.tileWidth)); column <= Math.min(d.columns - 1, Math.floor(maxX / d.tileWidth)); column++)
      for (let row = Math.max(0, Math.floor(minY / d.tileHeight)); row <= Math.min(d.rows - 1, Math.floor(maxY / d.tileHeight)); row++) requests.push({ column, row, key: column * 16 + row });
    if (requests.length > this.maxTiles) throw new RangeError('Collision neighborhood exceeds tile budget');
    this.wanted = new Set(requests.map(r => r.key));
    requests.sort((a, b) => Math.hypot((a.column + .5) * d.tileWidth - position.x, (a.row + .5) * d.tileHeight - position.y) - Math.hypot((b.column + .5) * d.tileWidth - position.x, (b.row + .5) * d.tileHeight - position.y) || a.key - b.key);
    // External cancellation abandons this wait, not shared map tiles needed by another tick.
    const work = Promise.all(requests.map(r => this.tile(r.column, r.row)));
    if (!signal) { await work; return; }
    await new Promise<void>((resolve, reject) => {
      let done = false;
      const finish = (action: () => void) => { if (!done) { done = true; signal.removeEventListener('abort', cancel); action(); } };
      const cancel = () => finish(() => reject(aborted())); signal.addEventListener('abort', cancel, { once: true });
      work.then(() => finish(resolve), error => finish(() => reject(error)));
      if (signal.aborted) cancel();
    });
  }
  private tile(column: number, row: number): Promise<void> {
    const key = column * 16 + row, old = this.retained.get(key);
    if (old) { this.retained.delete(key); this.retained.set(key, old); return Promise.resolve(); }
    const failed = this.failures.get(key); if (failed) return Promise.reject(failed);
    const pending = this.jobs.get(key); if (pending) return pending;
    if (this.jobs.size >= this.maxTiles) return Promise.reject(new Error('Collision tile request budget exceeded'));
    const generation = this.generation, signal = this.controller.signal, definition = this.scene!;
    const work = this.workers.run(async () => {
      let lease: AssetLease | undefined;
      try {
        checkAbort(signal); lease = await this.options.assets.readScene(sceneTilePath(definition, column, row, true), signal); checkAbort(signal);
        const mask = await (this.options.decodeMask ?? decodeCollisionMask)(lease.value.bytes, { maxPixels: Math.min(this.maxPixels, 4 * 1024 * 1024), signal }); checkAbort(signal);
        if (generation !== this.generation || this.closed) throw aborted();
        const size = mask.width * mask.height;
        for (const [k, entry] of this.retained) {
          if (this.retained.size < this.maxTiles && this.tiles!.retainedPixels + size <= this.maxPixels) break;
          if (this.wanted.has(k)) continue;
          this.tiles!.delete(entry.column, entry.row); this.retained.delete(k);
        }
        if (this.retained.size >= this.maxTiles) throw new Error('Collision tile retention budget exceeded');
        this.tiles!.set(column, row, mask, signal); this.retained.set(key, { column, row, pixels: size });
      } catch (error) {
        if (!signal.aborted && generation === this.generation) {
          const issue = new Error(error instanceof Error ? error.message.slice(0, 512) : 'Collision tile loading failed');
          this.failures.set(key, issue); this.error = issue.message;
        }
        throw error;
      } finally { lease?.release(); }
    }, signal);
    this.jobs.set(key, work); void work.finally(() => { if (this.jobs.get(key) === work) this.jobs.delete(key); }).catch(() => {});
    return work;
  }
  step(position: WorldPosition, input: Point, previousStep: Point, options: { snap?: boolean } = {}): WorldPhysicsStep {
    point(position); point(input); point(previousStep);
    if (options.snap && Math.hypot(input.x, input.y) >= 6) throw new RangeError('World snap exceeds the source arrival threshold');
    let candidateDirection = position.direction;
    const waiting = (): WorldPhysicsStep => ({ position: { ...position }, step: { ...previousStep }, displacement: { x: 0, y: 0 }, moved: false, waiting: true, wallHit: false, exit: null });
    if (this.closed || !this.scene || !this.tiles || !this.map || this.controller.signal.aborted) return waiting();
    try {
      const heightPixel = this.tiles.pixel(Math.trunc(position.x), Math.trunc(position.y));
      if (heightPixel === null) throw new CollisionUnavailableError(Math.trunc(position.x), Math.trunc(position.y));
      const smoothed = options.snap ? { ...input } : smoothGroundStep(previousStep, input, heightScaleFromPixel(heightPixel));
      if (Math.hypot(smoothed.x, smoothed.y) < .1) return { position: { ...position }, step: smoothed, displacement: { x: 0, y: 0 }, moved: false, waiting: false, wallHit: false, exit: null };
      const direction = directionFromVector(smoothed.x, smoothed.y); candidateDirection = direction;
      const { geometry, origin } = this.geometry(position, direction);
      const probe = probeWalls(smoothed, geometry, this.tiles, { fieldOrigin: origin });
      const displacement = options.snap && !probe.wallHit ? input : finishProbedStep(probe.step, probe.wallHit);
      const moved = displacement.x !== 0 || displacement.y !== 0;
      const next = { x: position.x + displacement.x, y: position.y + displacement.y, direction };
      const exit = detectExit(this.map, probe.color, position, { crossings: this.options.crossings });
      void this.prepare(next).catch(() => {});
      return { position: next, step: options.snap ? { x: 0, y: 0 } : smoothed, displacement, moved, waiting: false, wallHit: probe.wallHit, exit };
    } catch (error) {
      if (!(error instanceof CollisionUnavailableError)) throw error;
      void this.prepare({ ...position, direction: candidateDirection }).catch(() => {}); return waiting();
    }
  }
  /** Rounding a wire coordinate must not place the source foot circle in a wall. */
  canPublish(position: WorldPosition): boolean {
    if (this.closed || !this.tiles) return false;
    try {
      const { geometry, origin } = this.geometry(position);
      return !probeWalls({ x: 0, y: 0 }, geometry, this.tiles, { fieldOrigin: origin }).wallHit;
    } catch (error) {
      if (!(error instanceof CollisionUnavailableError)) throw error;
      void this.prepare(position).catch(() => {}); return false;
    }
  }
  retry(): void { if (!this.closed) { this.failures.clear(); this.error = null; } }
  dispose(): void {
    if (this.closed) return; this.closed = true; this.generation++; this.controller.abort(); this.detachSignal(); this.tiles?.clear(); this.loading = false;
    this.tiles = null; this.scene = null; this.map = null; this.jobs.clear(); this.retained.clear(); this.failures.clear(); this.wanted.clear();
  }
}
