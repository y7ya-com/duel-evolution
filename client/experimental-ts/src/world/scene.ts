import type { AssetLease, AssetManager } from '../assets';
import type { NpcSpot } from './maps';
import { validateViewport } from './camera';
import type { Viewport } from './camera';
import { parseSceneTable, pngDimensions, SCENE_TABLE_PATH, sceneTilePath } from './scene-format';
import type { SceneDefinition, SceneObject } from './scene-format';
export type { SceneDefinition, SceneObject } from './scene-format';
export type SceneAssets = Pick<AssetManager, 'readScene'>;
export interface SceneSprite extends SceneObject {
  /** Natural PNG dimensions, never inferred from the logical tile stride. */
  readonly width: number; readonly height: number; readonly url: string;
  /** Base tiles occupy this logical cell; clip natural-size art rather than stretching it. */
  readonly clipWidth?: number; readonly clipHeight?: number;
}
export interface SceneFrame {
  readonly mapId: number;
  readonly viewport: Viewport;
  readonly tiles: readonly SceneSprite[];
  readonly objects: readonly SceneSprite[];
  readonly frontObjects: readonly SceneSprite[];
  readonly npcSpots: readonly NpcSpot[];
  release(): void;
}
// Map id order is the static g_fieldMaps order in yo2FieldMap.cpp; no map art/layout table is embedded.
export const MAP_NAMES = ['Map_d01_01', 'Map_d02', 'Map_d03', 'Map_d04_01', 'Map_a01', 'Map_a02', 'Map_a03', 'Map_a04', 'Map_r01', 'Map_d05'] as const;
function abortError(): DOMException { return new DOMException('Scene request canceled', 'AbortError'); }
function check(signal?: AbortSignal): void { if (signal?.aborted) throw abortError(); }
function operation(signal?: AbortSignal): { controller: AbortController; detach(): void } {
  const controller = new AbortController(), abort = () => controller.abort();
  if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', abort, { once: true });
  return { controller, detach: () => signal?.removeEventListener('abort', abort) };
}
function intersects(a: SceneObject & { width: number; height: number }, b: Viewport): boolean {
  return a.x < b.x + b.width && a.y < b.y + b.height && a.x + a.width > b.x && a.y + a.height > b.y;
}
interface Request extends SceneObject { layer: 'tiles' | 'objects' | 'frontObjects'; width?: number; height?: number }
export class WorldScene {
  private closed = false;
  private pending?: AbortController;
  private readonly frames = new Set<() => void>();
  private readonly sizes = new Map<string, { width: number; height: number }>();
  constructor(readonly mapId: number, readonly definition: SceneDefinition, private readonly assets: SceneAssets, private readonly onDispose: () => void = () => {}) {}
  /** Supersedes pending frame work. Completed frames retain independent leases. */
  async frame(viewport: Viewport, signal?: AbortSignal): Promise<SceneFrame> {
    if (this.closed) throw new Error('Scene disposed');
    validateViewport(viewport); check(signal);
    const view = Object.freeze({ ...viewport });
    this.pending?.abort();
    const op = operation(signal), controller = op.controller;
    this.pending = controller;
    const leases: AssetLease[] = [];
    try {
      const d = this.definition, requests: Request[] = [];
      for (let x = 0; x < d.columns; x++) for (let y = 0; y < d.rows; y++) {
        const r = { path: sceneTilePath(d, x, y), x: x * d.tileWidth, y: y * d.tileHeight,
          width: d.tileWidth, height: d.tileHeight, layer: 'tiles' as const };
        if (intersects(r, view)) requests.push(r);
      }
      for (const layer of ['objects', 'frontObjects'] as const) for (const obj of d[layer]) {
        const size = this.sizes.get(obj.path);
        // Unknown PNGs may extend left/up from their viewport's edge, but their
        // table position is their top-left; the parser caps each axis at 8192.
        if (intersects({ ...obj, width: size?.width ?? 8192, height: size?.height ?? 8192 }, view)) requests.push({ ...obj, ...size, layer });
      }
      const sprites: (SceneSprite | undefined)[] = new Array(requests.length);
      let next = 0, pixels = 0;
      const worker = async (): Promise<void> => {
        try {
          for (;;) {
            check(controller.signal);
            const i = next++; if (i >= requests.length) return;
            const request = requests[i];
            const lease = await this.assets.readScene(request.path, controller.signal);
            // Include immediately so late resolutions after cancellation are released.
            leases.push(lease); check(controller.signal);
            const size = pngDimensions(lease.value.bytes);
            this.sizes.set(request.path, size);
            if (!intersects({ ...request, ...size }, view)) { lease.release(); leases.splice(leases.indexOf(lease), 1); continue; }
            pixels += size.width * size.height;
            if (pixels > 64 * 1024 * 1024) throw new RangeError('Scene frame decoded pixel budget exceeded');
            sprites[i] = Object.freeze({ path: request.path, x: request.x, y: request.y, ...size, url: lease.value.url,
              ...(request.layer === 'tiles' ? { clipWidth: d.tileWidth, clipHeight: d.tileHeight } : {}) });
          }
        } catch (error) { controller.abort(); throw error; }
      };
      const results = await Promise.allSettled(Array.from({ length: Math.min(4, requests.length) }, () => worker()));
      const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected' && (r.reason as Error)?.name !== 'AbortError')
        ?? results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failure) throw failure.reason;
      check(controller.signal);
      let active = true;
      const release = () => { if (!active) return; active = false; for (const lease of leases) lease.release(); this.frames.delete(release); };
      this.frames.add(release);
      const layer = (name: Request['layer']) => Object.freeze(sprites.filter((s, i): s is SceneSprite => !!s && requests[i].layer === name));
      return Object.freeze({ mapId: this.mapId, viewport: view, tiles: layer('tiles'), objects: layer('objects'), frontObjects: layer('frontObjects'), npcSpots: Object.freeze([]), release });
    } catch (error) { for (const lease of leases) lease.release(); throw error; }
    finally { op.detach(); if (this.pending === controller) this.pending = undefined; }
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true; this.pending?.abort();
    for (const release of this.frames) release();
    this.sizes.clear(); this.onDispose();
  }
}
/** Every archive path a map draws (base tiles, objects, front objects): the neighbouring maps' prefetch. */
export function scenePaths(d: SceneDefinition): string[] {
  const paths = new Set<string>();
  for (let x = 0; x < d.columns; x++) for (let y = 0; y < d.rows; y++) paths.add(sceneTilePath(d, x, y));
  for (const o of [...d.objects, ...d.frontObjects]) paths.add(o.path);
  return [...paths];
}
export class SceneLoader {
  private closed = false;
  private pending?: AbortController;
  private readonly scenes = new Set<WorldScene>();
  private readonly assets: SceneAssets;
  constructor(options: { assets: SceneAssets }) { this.assets = options.assets; }
  async load(mapId: number, signal?: AbortSignal): Promise<WorldScene> {
    if (this.closed) throw new Error('Scene loader disposed');
    if (!Number.isInteger(mapId) || mapId < 0 || mapId >= MAP_NAMES.length) throw new RangeError('Invalid map id');
    check(signal); this.pending?.abort();
    const op = operation(signal), controller = op.controller; this.pending = controller;
    let lease: AssetLease | undefined;
    try {
      lease = await this.assets.readScene(SCENE_TABLE_PATH, controller.signal); check(controller.signal);
      const definition = parseSceneTable(lease.value.bytes).get(MAP_NAMES[mapId]);
      if (!definition) throw new Error(`Scene section missing: ${MAP_NAMES[mapId]}`);
      const scene = new WorldScene(mapId, definition, this.assets, () => this.scenes.delete(scene));
      this.scenes.add(scene); return scene;
    } finally { lease?.release(); op.detach(); if (this.pending === controller) this.pending = undefined; }
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true; this.pending?.abort();
    for (const scene of this.scenes) scene.dispose();
  }
}
