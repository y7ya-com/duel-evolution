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
const f32 = Math.fround;
/** 0xbf0ebc / 0xbe8198: the diagonal and straight step costs (also the heuristic's diagonal factor). */
export const ASTAR_DIAGONAL = f32(1.41);
export const ASTAR_STRAIGHT = 1;
/** FieldWalkGrid (0x00a05da0 / 0x00a046a0): a cell with a wall within two cells costs 50 more to enter. */
export const ASTAR_NEAR_WALL_COST = 50;
/** 0x009d9f70: a path step counts as reached when the avatar is less than 20 px (int 0xd0e300) from it. */
export const PATH_STEP_REACHED = 20;
/** World pixels to walk cells: x * 0.05f (0xbe9d80), truncated (CRT 0x00b09a80). */
export function cellOf(p: Point): { x: number; y: number } { return { x: Math.trunc(f32(p.x * f32(0.05))), y: Math.trunc(f32(p.y * f32(0.05))) }; }
const STEPS: readonly (readonly [number, number, boolean])[] = [[-1, -1, true], [-1, 0, false], [-1, 1, true], [0, -1, false], [0, 1, false], [1, -1, true], [1, 0, false], [1, 1, true]];
/**
 * The original's A* (0x00a04a30; client/recomp/ovr/path.c is the reference re-implementation the live client runs):
 * 8 neighbours in the order above, no corner check, g = parent g + (enter cost + step) and f = octile h + g, both
 * stored float32. The open list is re-sorted stably after every expansion in the original, so it pops the lowest f,
 * ties by push order; here a binary heap keyed (f, push order) gives the same pops. A cell joins the open list once.
 * Returns the walk cells' centres (x*20+10, y*20+10), start cell first, or null when the goal cell is not reached.
 */
export function astarCells(g: WalkGrid, start: { x: number; y: number }, goal: { x: number; y: number }): Point[] | null {
  if (!Number.isInteger(g.width) || !Number.isInteger(g.height) || g.width < 1 || g.height < 1 || g.width > 256 || g.height > 256) throw new RangeError('Invalid grid dimensions');
  const w = g.width, h = g.height, inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  if (!inside(start.x, start.y) || !inside(goal.x, goal.y)) return null;
  const count = w * h, gs = new Float32Array(count), parent = new Int32Array(count).fill(-1), open = new Uint8Array(count), closed = new Uint8Array(count);
  const heapF: number[] = [], heapSeq: number[] = [], heapNode: number[] = [];
  let seq = 0;
  const before = (i: number, j: number) => heapF[i] < heapF[j] || (heapF[i] === heapF[j] && heapSeq[i] < heapSeq[j]);
  const swap = (i: number, j: number) => { [heapF[i], heapF[j]] = [heapF[j], heapF[i]]; [heapSeq[i], heapSeq[j]] = [heapSeq[j], heapSeq[i]]; [heapNode[i], heapNode[j]] = [heapNode[j], heapNode[i]]; };
  const push = (fv: number, node: number) => {
    let i = heapF.length; heapF.push(fv); heapSeq.push(seq++); heapNode.push(node);
    while (i && before(i, (i - 1) >> 1)) { swap(i, (i - 1) >> 1); i = (i - 1) >> 1; }
  };
  const pop = (): number => {
    const top = heapNode[0], last = heapF.length - 1;
    swap(0, last); heapF.pop(); heapSeq.pop(); heapNode.pop();
    for (let i = 0; ;) {
      let k = 2 * i + 1; if (k >= heapF.length) break;
      if (k + 1 < heapF.length && before(k + 1, k)) k++;
      if (!before(k, i)) break; swap(i, k); i = k;
    }
    return top;
  };
  const near = new Uint8Array(count);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) near[y * w + x] = nearBlocked(g, x, y) ? 1 : 0;
  const first = start.y * w + start.x, last = goal.y * w + goal.x;
  push(0, first);
  let found = -1;
  while (heapF.length) {
    const cur = pop(), x = cur % w, y = (cur - x) / w;
    if (cur === last) { found = cur; break; }
    for (const [dx, dy, diagonal] of STEPS) {
      const nx = x + dx, ny = y + dy;
      if (!inside(nx, ny)) continue;
      const node = ny * w + nx;
      if (open[node] || closed[node] || !cellOpen(g, nx, ny)) continue;
      gs[node] = f32(f32((near[node] ? ASTAR_NEAR_WALL_COST : 0) + (diagonal ? ASTAR_DIAGONAL : ASTAR_STRAIGHT)) + gs[cur]);
      const a = Math.abs(goal.x - nx), b = Math.abs(goal.y - ny);
      const heuristic = a < b ? (b - a) + a * ASTAR_DIAGONAL : (a - b) + b * ASTAR_DIAGONAL;
      parent[node] = cur; open[node] = 1;
      push(f32(heuristic + gs[node]), node);
    }
    closed[cur] = 1;
  }
  if (found < 0) return null;
  const chain: Point[] = [];
  for (let p = found, n = 0; p >= 0 && n <= count; p = p === first ? -1 : parent[p], n++) chain.push(cellCenter(p % w, Math.floor(p / w)));
  return chain.reverse();
}
/**
 * Click-to-walk route: the original A* from the avatar's cell to the clicked cell. The start cell's own centre is
 * dropped (it is always within the 20 px reach of the avatar standing in it), and the last cell's centre is replaced
 * by the exact clicked point so a click still lands where it was made. Null when no route exists.
 */
export function findRoute(g: WalkGrid, start: Point, target: Point): Point[] | null {
  if (!Number.isInteger(g.width) || !Number.isInteger(g.height) || g.width < 1 || g.height < 1 || g.width > 256 || g.height > 256) throw new RangeError('Invalid grid dimensions');
  if (![start.x, start.y, target.x, target.y].every(Number.isFinite)) return null;
  const a = cellOf(start), b = cellOf(target);
  if (!cellOpen(g, a.x, a.y) || !cellOpen(g, b.x, b.y)) return null;
  if (a.x === b.x && a.y === b.y) return start.x === target.x && start.y === target.y ? [] : [{ ...target }];
  const cells = astarCells(g, a, b);
  if (!cells) return null;
  cells.shift(); cells[cells.length - 1] = { ...target };
  return cells;
}
/** Conservative grid-only fallback (no pixel collision to slide on): breadth-first cardinal routing; at most width*height cells, no corner cutting. */
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
