import { CELL_SIZE } from './maps';
import type { Point, WalkGrid } from './maps';
export function cellCenter(x: number, y: number): Point { return { x: x * CELL_SIZE + 10, y: y * CELL_SIZE + 10 }; }
function cellOpen(g: WalkGrid, x: number, y: number): boolean { return x >= 0 && y >= 0 && x < g.width && y < g.height && g.rows[y]?.[x] === '1'; }
export function isWalkable(g: WalkGrid, p: Point): boolean { return Number.isFinite(p.x) && Number.isFinite(p.y) && cellOpen(g, Math.floor(p.x / CELL_SIZE), Math.floor(p.y / CELL_SIZE)); }
/** C++ checks only in-bounds neighbors, including diagonals, up to two cells away. */
export function nearBlocked(g: WalkGrid, x: number, y: number): boolean {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = x + dx, ny = y + dy;
    if ((dx || dy) && nx >= 0 && ny >= 0 && nx < g.width && ny < g.height && !cellOpen(g, nx, ny)) return true;
  }
  return false;
}
/** Supercover traversal: touching a blocked cell corner is conservatively blocked. */
export function segmentWalkable(g: WalkGrid, a: Point, b: Point): boolean {
  if (!isWalkable(g, a) || !isWalkable(g, b)) return false;
  let x = Math.floor(a.x / CELL_SIZE), y = Math.floor(a.y / CELL_SIZE);
  const endX = Math.floor(b.x / CELL_SIZE), endY = Math.floor(b.y / CELL_SIZE), dx = b.x - a.x, dy = b.y - a.y;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const stepX = dx === 0 ? Infinity : CELL_SIZE / Math.abs(dx), stepY = dy === 0 ? Infinity : CELL_SIZE / Math.abs(dy);
  let tx = dx === 0 ? Infinity : ((sx > 0 ? (x + 1) * CELL_SIZE : x * CELL_SIZE) - a.x) / dx;
  let ty = dy === 0 ? Infinity : ((sy > 0 ? (y + 1) * CELL_SIZE : y * CELL_SIZE) - a.y) / dy;
  for (let n = 0; n <= g.width + g.height; n++) {
    if (x === endX && y === endY) return true;
    if (Math.abs(tx - ty) < 1e-10) {
      if (!cellOpen(g, x + sx, y) || !cellOpen(g, x, y + sy)) return false;
      x += sx; y += sy; tx += stepX; ty += stepY;
    } else if (tx < ty) { x += sx; tx += stepX; }
    else { y += sy; ty += stepY; }
    if (!cellOpen(g, x, y)) return false;
  }
  return false;
}
/** Deterministic breadth-first cardinal routing; at most width*height cells, no corner cutting. */
export function findPath(g: WalkGrid, start: Point, target: Point, maxVisited = 65536): Point[] | null {
  if (!Number.isInteger(maxVisited) || maxVisited < 1 || maxVisited > 65536) throw new RangeError('Invalid path budget');
  if (!Number.isInteger(g.width) || !Number.isInteger(g.height) || g.width < 1 || g.height < 1 || g.width > 256 || g.height > 256) throw new RangeError('Invalid grid dimensions');
  if (!isWalkable(g, start) || !isWalkable(g, target)) return null;
  const index = (p: Point) => Math.floor(p.y / CELL_SIZE) * g.width + Math.floor(p.x / CELL_SIZE);
  const first = index(start), last = index(target);
  if (first === last) return start.x === target.x && start.y === target.y ? [] : [{ ...target }];
  const count = g.width * g.height, prev = new Int32Array(count).fill(-1), queue = new Int32Array(count);
  let head = 0, tail = 1, visited = 0; queue[0] = first; prev[first] = first;
  while (head < tail && visited < maxVisited && prev[last] === -1) {
    const i = queue[head++], x = i % g.width, y = Math.floor(i / g.width); visited++;
    for (const [nx, ny] of [[x, y + 1], [x - 1, y], [x, y - 1], [x + 1, y]]) {
      const j = ny * g.width + nx;
      if (!cellOpen(g, nx, ny) || prev[j] !== -1) continue;
      prev[j] = i; queue[tail++] = j;
    }
  }
  if (prev[last] === -1) return null;
  const chain = [last]; while (chain[chain.length - 1] !== first) chain.push(prev[chain[chain.length - 1]]);
  chain.reverse();
  const points = chain.map(i => cellCenter(i % g.width, Math.floor(i / g.width)));
  // The start may be off-center. Centering first keeps all cardinal segments inside their cells.
  if (start.x === points[0].x && start.y === points[0].y) points.shift();
  if (target.x !== points[points.length - 1].x || target.y !== points[points.length - 1].y) points.push({ ...target });
  // Keep only turns, preserving the start-cell centering waypoint when off-center.
  const route: Point[] = [];
  let previous = start;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], next = points[i + 1];
    const ax = p.x - previous.x, ay = p.y - previous.y;
    const bx = next ? next.x - p.x : 0, by = next ? next.y - p.y : 0;
    if (next && ax * by === ay * bx && ax * bx + ay * by >= 0) continue;
    route.push(p); previous = p;
  }
  return route;
}
export function directionFromVector(dx: number, dy: number): number {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new RangeError('Invalid direction vector');
  let angle = Math.atan2(dx, dy) * (-4 / Math.PI) + 0.5;
  if (angle < 0) angle += 8;
  return Math.trunc(angle) % 8;
}
