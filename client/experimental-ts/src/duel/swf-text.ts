/** The original duel effects (data/y/duel/effect/duel_ef_*.txt and friends) are Flash movies kept as text dumps of
 * SWF::Element (Perl): a PngFileTable, a header, then DefineBitsLossless (a PNG of the table), DefineShape (a rectangle
 * filled with one clipped bitmap), DefineSprite (a nested timeline), PlaceObject2 / RemoveObject2 / ShowFrame and a few
 * DoAction records. The original's CSwfEngine (client/src/Swf) plays them at the movie's frame rate around the point it
 * is placed at. This parser keeps exactly that subset; anything else is ignored rather than guessed.
 * Units: twips (1/20 px) for shapes and translations, as in SWF. */

export interface SwfMatrix { a: number; b: number; c: number; d: number; tx: number; ty: number }
/** Multiply terms in 0..1 (term / 256), add terms in 0..255. */
export interface SwfColor { mult: [number, number, number, number]; add: [number, number, number, number] }
export interface SwfShape { kind: 'shape'; bitmap: number | null; fill: SwfMatrix; bounds: [number, number, number, number] }
export interface SwfSprite { kind: 'sprite'; timeline: SwfTimeline }
export type SwfCharacter = SwfShape | SwfSprite;
export type SwfOp =
  | { op: 'place'; depth: number; move: boolean; character?: number; matrix?: SwfMatrix; color?: SwfColor }
  | { op: 'remove'; depth: number }
  | { op: 'stop' } | { op: 'play' } | { op: 'goto'; label: string };
export interface SwfTimeline { frames: SwfOp[][]; labels: Record<string, number> }
export interface SwfMovie {
  files: string[]; frameRate: number; frameCount: number; bitmaps: Map<number, number>;
  characters: Map<number, SwfCharacter>; timeline: SwfTimeline;
}

export const IDENTITY: SwfMatrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
export const NO_COLOR: SwfColor = { mult: [1, 1, 1, 1], add: [0, 0, 0, 0] };

type Value = number | string | Value[] | Node;
interface Node { type: string; fields: Record<string, Value> }
const MAX_TEXT = 4 * 1024 * 1024, MAX_DEPTH = 64, MAX_FRAMES = 4096;

function tokenize(text: string): string[] {
  const out: string[] = [];
  const re = /\s+|#[^\n]*|"([^"]*)"|'([^']*)'|=>|->new\(|[()[\],{}]|(?:(?!->|=>)[^\s()[\],{}"'#])+/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const t = m[0];
    if (/^\s/.test(t) || t[0] === '#') continue;
    out.push(m[1] !== undefined ? `"${m[1]}` : m[2] !== undefined ? `"${m[2]}` : t);
  }
  return out;
}

class Parser {
  private i = 0;
  constructor(private readonly tokens: string[]) {}
  private peek(): string | undefined { return this.tokens[this.i]; }
  private next(): string { const t = this.tokens[this.i++]; if (t === undefined) throw new Error('Unexpected end of movie'); return t; }
  private expect(t: string): void { const n = this.next(); if (n !== t) throw new Error(`Expected ${t}, found ${n}`); }
  value(depth = 0): Value {
    if (depth > MAX_DEPTH) throw new Error('Movie nesting too deep');
    const t = this.next();
    if (t[0] === '"') return t.slice(1);
    if (this.peek() === '->new(') { this.next(); return this.args(t, depth + 1); }
    if (t === '[') {
      const list: Value[] = [];
      while (this.peek() !== ']') { list.push(this.value(depth + 1)); if (this.peek() === ',') this.next(); }
      this.next(); return list;
    }
    const n = Number(t); return Number.isFinite(n) && t !== '' ? n : t;
  }
  private args(type: string, depth: number): Node {
    const fields: Record<string, Value> = {};
    while (this.peek() !== ')') {
      const key = this.next();
      if (key === '[') { this.i--; fields._list = this.value(depth); }
      else { this.expect('=>'); fields[key] = this.value(depth); }
      if (this.peek() === ',') this.next();
    }
    this.next();
    return { type: type.replace(/^SWF::Element::/, ''), fields };
  }
  tags(): Node[] {
    const out: Node[] = [];
    while (this.peek() !== undefined) {
      const t = this.next();
      if (t.startsWith('SWF::Element::Tag::') && this.peek() === '->new(') { this.next(); out.push(this.args(t, 1)); }
    }
    return out;
  }
}

const num = (v: Value | undefined, fallback = 0): number => typeof v === 'number' ? v : typeof v === 'string' && Number.isFinite(Number(v)) ? Number(v) : fallback;
const node = (v: Value | undefined): Node | null => v && typeof v === 'object' && !Array.isArray(v) ? v : null;
const list = (v: Value | undefined): Value[] => { const n = node(v); const l = n ? n.fields._list : v; return Array.isArray(l) ? l : []; };

function matrix(v: Value | undefined): SwfMatrix | undefined {
  const m = node(v); if (!m) return undefined;
  const f = m.fields;
  return { a: num(f.ScaleX, 1), b: num(f.RotateSkew0), c: num(f.RotateSkew1), d: num(f.ScaleY, 1), tx: num(f.TranslateX), ty: num(f.TranslateY) };
}
function color(v: Value | undefined): SwfColor | undefined {
  const c = node(v); if (!c) return undefined;
  const f = c.fields, flags = num(f.Flags);
  const term = (k: string, d: number) => num(f[k], d);
  return {
    mult: flags & 2 ? [term('RedMultTerm', 256) / 256, term('GreenMultTerm', 256) / 256, term('BlueMultTerm', 256) / 256, term('AlphaMultTerm', 256) / 256] : [1, 1, 1, 1],
    add: flags & 1 ? [term('RedAddTerm', 0), term('GreenAddTerm', 0), term('BlueAddTerm', 0), term('AlphaAddTerm', 0)] : [0, 0, 0, 0],
  };
}

function shape(n: Node): SwfShape {
  const bounds = node(n.fields.ShapeBounds)?.fields ?? {};
  const styles = node(n.fields.Shapes)?.fields ?? {};
  const fills = list(styles.FillStyles).map(node);
  // The rectangle's StyleChange record names its fill (1-based into the fill array; the dumps keep a dummy at 0).
  const change = list(styles.ShapeRecords).map(node).find(r => r?.type.endsWith('STYLECHANGERECORD'));
  const index = num(change?.fields.FillStyle1, 0);
  const fill = fills[index - 1] ?? fills.find(f => f && num(f.fields.BitmapID, 65535) !== 65535) ?? null;
  const id = fill ? num(fill.fields.BitmapID, 65535) : 65535;
  return { kind: 'shape', bitmap: id === 65535 ? null : id, fill: matrix(fill?.fields.BitmapMatrix) ?? { ...IDENTITY, a: 20, d: 20 },
    bounds: [num(bounds.Xmin), num(bounds.Ymin), num(bounds.Xmax), num(bounds.Ymax)] };
}

function timeline(tags: Node[], movie: Pick<SwfMovie, 'bitmaps' | 'characters'>, depth: number): SwfTimeline {
  if (depth > 8) throw new Error('Movie sprites nested too deep');
  const frames: SwfOp[][] = [];
  const labels: Record<string, number> = {};
  let ops: SwfOp[] = [];
  for (const tag of tags) {
    const f = tag.fields;
    switch (tag.type) {
      case 'Tag::DefineBitsLossless': movie.bitmaps.set(num(f.CharacterID), num(f.FileName)); break;
      case 'Tag::DefineShape': case 'Tag::DefineShape2': case 'Tag::DefineShape3': movie.characters.set(num(f.ShapeID), shape(tag)); break;
      case 'Tag::DefineSprite': {
        const inner = list(f.ControlTags).map(node).filter((n): n is Node => !!n);
        movie.characters.set(num(f.SpriteID), { kind: 'sprite', timeline: timeline(inner, movie, depth + 1) }); break;
      }
      case 'Tag::PlaceObject2': {
        const flags = num(f.Flags), place: SwfOp = { op: 'place', depth: num(f.Depth), move: !!(flags & 1) };
        if (flags & 2) place.character = num(f.CharacterID);
        const m = flags & 4 ? matrix(f.Matrix) : undefined; if (m) place.matrix = m;
        const c = flags & 8 ? color(f.ColorTransform) : undefined; if (c) place.color = c;
        ops.push(place); break;
      }
      case 'Tag::RemoveObject2': case 'Tag::RemoveObject': ops.push({ op: 'remove', depth: num(f.Depth) }); break;
      case 'Tag::FrameLabel': if (typeof f.Name === 'string') labels[f.Name] = frames.length; break;
      case 'Tag::DoAction':
        for (const a of list(f.Actions).map(node)) {
          const kind = a?.fields.Tag;
          if (kind === 'ActionStop') ops.push({ op: 'stop' });
          else if (kind === 'ActionPlay') ops.push({ op: 'play' });
          else if (kind === 'ActionGotoLabel' && typeof a?.fields.Label === 'string') ops.push({ op: 'goto', label: a.fields.Label });
        }
        break;
      case 'Tag::ShowFrame': frames.push(ops); ops = []; if (frames.length > MAX_FRAMES) throw new Error('Movie has too many frames'); break;
      default: break;
    }
  }
  if (ops.length) frames.push(ops);
  return { frames, labels };
}

export function parseSwfText(text: string): SwfMovie {
  if (text.length > MAX_TEXT) throw new Error('Movie text too large');
  const files: string[] = [];
  const table = /PngFileTable\s*=\s*\{([\s\S]*?)\)/.exec(text);
  if (table) for (const m of table[1]!.matchAll(/png\s*=>\s*([^\s,]+)/g)) files.push(m[1]!);
  const frameRate = Number(/Frame rate\s*=\s*([\d.]+)/.exec(text)?.[1] ?? 30) || 30;
  const body = table ? text.slice(table.index + table[0].length) : text;
  const tags = new Parser(tokenize(body)).tags();
  const movie = { files, frameRate, frameCount: 0, bitmaps: new Map<number, number>(), characters: new Map<number, SwfCharacter>() };
  const main = timeline(tags, movie, 0);
  return { ...movie, frameCount: Number(/Frame count\s*=\s*(\d+)/.exec(text)?.[1] ?? main.frames.length) || main.frames.length, timeline: main };
}

export function multiply(p: SwfMatrix, m: SwfMatrix): SwfMatrix {
  return { a: p.a * m.a + p.c * m.b, b: p.b * m.a + p.d * m.b, c: p.a * m.c + p.c * m.d, d: p.b * m.c + p.d * m.d,
    tx: p.a * m.tx + p.c * m.ty + p.tx, ty: p.b * m.tx + p.d * m.ty + p.ty };
}
export function combine(parent: SwfColor, child: SwfColor): SwfColor {
  return { mult: [0, 1, 2, 3].map(i => parent.mult[i]! * child.mult[i]!) as SwfColor['mult'],
    add: [0, 1, 2, 3].map(i => child.add[i]! * parent.mult[i]! + parent.add[i]!) as SwfColor['add'] };
}

interface Placed { character: number; matrix: SwfMatrix; color: SwfColor; sprite: SwfInstance | null }
/** One playing timeline (the movie or a sprite inside it): its display list and frame counter. Sprites loop, the main
 * timeline ends after its last frame (CSwfEngine's "ended" flag). */
export class SwfInstance {
  frame = -1; stopped = false; ended = false;
  readonly list = new Map<number, Placed>();
  constructor(private readonly movie: SwfMovie, private readonly line: SwfTimeline, private readonly loop: boolean) {}
  /** Advance one frame (the first call shows frame 0). */
  step(): void {
    for (const p of this.list.values()) p.sprite?.step();
    if (this.stopped || this.ended) return;
    let next = this.frame + 1;
    if (next >= this.line.frames.length) {
      if (!this.loop) { this.ended = true; return; }
      next = 0; this.list.clear();
    }
    this.apply(next);
  }
  private apply(index: number): void {
    this.frame = index;
    for (const op of this.line.frames[index] ?? []) {
      if (op.op === 'remove') this.list.delete(op.depth);
      else if (op.op === 'stop') this.stopped = true;
      else if (op.op === 'play') this.stopped = false;
      else if (op.op === 'goto') { const at = this.line.labels[op.label]; if (at !== undefined && at !== index) this.frame = at - 1; }
      else {
        const old = this.list.get(op.depth);
        if (op.character !== undefined && (!op.move || !old || old.character !== op.character)) {
          const c = this.movie.characters.get(op.character);
          this.list.set(op.depth, { character: op.character, matrix: op.matrix ?? (op.move ? old?.matrix : undefined) ?? IDENTITY,
            color: op.color ?? (op.move ? old?.color : undefined) ?? NO_COLOR,
            sprite: c?.kind === 'sprite' ? new SwfInstance(this.movie, c.timeline, true) : null });
          this.list.get(op.depth)!.sprite?.step();
        } else if (old) { if (op.matrix) old.matrix = op.matrix; if (op.color) old.color = op.color; }
      }
    }
  }
  /** Every bitmap to draw this frame, back to front, with its full transform (twips) and colour. */
  draw(out: { bitmap: number; matrix: SwfMatrix; color: SwfColor; clip: [number, number, number, number]; clipMatrix: SwfMatrix }[], parent: SwfMatrix = IDENTITY, tint: SwfColor = NO_COLOR, depth = 0): void {
    if (depth > 8) return;
    for (const key of [...this.list.keys()].sort((a, b) => a - b)) {
      const p = this.list.get(key)!, c = this.movie.characters.get(p.character), m = multiply(parent, p.matrix), color = combine(tint, p.color);
      if (!c) continue;
      if (c.kind === 'sprite') { p.sprite?.draw(out, m, color, depth + 1); continue; }
      if (c.bitmap === null) continue;
      const file = this.movie.bitmaps.get(c.bitmap);
      if (file === undefined) continue;
      out.push({ bitmap: file, matrix: multiply(m, c.fill), color, clip: c.bounds, clipMatrix: m });
    }
  }
}
