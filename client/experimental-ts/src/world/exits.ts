import type { MapEntry, Point, WorldMap, WorldPosition } from './maps';
import { EXIT_HIT_PIXELS, exitIndexFromPixel } from './collision';
import type { ExitIndex } from './collision';
export interface CrossingRegion {
  readonly mapId: number; readonly destination: number;
  readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number;
  readonly arrival: WorldPosition;
}
/** Recomp crossing.c override; opt-in, separate from the original mask. */
export const CROSSING_REGIONS: readonly CrossingRegion[] = Object.freeze([
  Object.freeze({ mapId: 2, destination: 7, x0: 420, y0: 930, x1: 600, y1: 1045, arrival: Object.freeze({ x: 700, y: 1110, direction: 3 }) }),
  Object.freeze({ mapId: 7, destination: 2, x0: 190, y0: 730, x1: 235, y1: 1030, arrival: Object.freeze({ x: 330, y: 1100, direction: 3 }) }),
]);
function mapId(id: number): void { if (!Number.isInteger(id) || id < 0 || id > 9) throw new RangeError('Invalid field map id'); }
function validPoint(p: Point): void { if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new RangeError('Invalid exit position'); }
export function crossingAt(map: number, avatarPosition: Point): CrossingRegion | null {
  mapId(map); validPoint(avatarPosition);
  return CROSSING_REGIONS.find(r => r.mapId === map && avatarPosition.x >= r.x0 && avatarPosition.x < r.x1 && avatarPosition.y >= r.y0 && avatarPosition.y < r.y1) ?? null;
}
export interface ExitTrigger { readonly index: ExitIndex; readonly color: number; readonly destination: number; readonly source: 'mask' | 'crossing' }
/** probeColor is the original solver's reported color. Passing a mask pixel only
 * classifies that pixel; it does not reconstruct probeWalls. Destinations are
 * entries[index].from; the entry coordinates describe arrivals on this map.
 */
export function detectExit(map: Pick<WorldMap, 'id' | 'entries'>, probeColor: number | null, avatarPosition: Point, options: { crossings?: boolean } = {}): ExitTrigger | null {
  mapId(map.id); validPoint(avatarPosition);
  const crossing = options.crossings ? crossingAt(map.id, avatarPosition) : null;
  const color = crossing ? EXIT_HIT_PIXELS[3] : probeColor;
  if (color === null) return null;
  const index = exitIndexFromPixel(color);
  if (index === null) return null;
  const destination = crossing?.destination ?? map.entries[index]?.from;
  // 11 is special and 12 is END; neither is a normal map destination.
  if (destination === undefined || !Number.isInteger(destination) || destination < 0 || destination > 9) return null;
  return Object.freeze({ index, color, destination, source: crossing ? 'crossing' : 'mask' });
}
/** Stops at END=12. The crossing patch replaces entry 3 before matching. */
export function arrivalEntries(map: Pick<WorldMap, 'id' | 'entries'>, from: number, options: { crossings?: boolean } = {}): readonly MapEntry[] {
  mapId(map.id); mapId(from);
  const patch = options.crossings ? CROSSING_REGIONS.find(r => r.mapId === map.id) : undefined;
  const result: MapEntry[] = [];
  for (let i = 0; i < Math.min(map.entries.length, 10); i++) {
    const entry = patch && i === 3 ? { from: patch.destination, ...patch.arrival } : map.entries[i];
    if (entry.from === 12) break;
    if (entry.from === from) result.push(Object.freeze({ ...entry }));
  }
  return Object.freeze(result);
}
/** Independent position/direction draws as in source; exact VC6 rand sequence
 * is not reproduced. Throws instead of the original divide-by-zero on no match.
 */
export function chooseArrival(map: Pick<WorldMap, 'id' | 'entries'>, from: number, options: { crossings?: boolean; random?: () => number } = {}): WorldPosition {
  const entries = arrivalEntries(map, from, options);
  if (!entries.length) throw new Error(`No arrival entry ${map.id}<-${from}`);
  const pick = (): MapEntry => {
    const n = (options.random ?? Math.random)();
    if (!Number.isFinite(n) || n < 0 || n >= 1) throw new RangeError('Arrival random must be in [0,1)');
    return entries[Math.floor(n * entries.length)];
  };
  const position = pick(), facing = pick();
  return Object.freeze({ x: position.x, y: position.y, direction: facing.direction });
}
