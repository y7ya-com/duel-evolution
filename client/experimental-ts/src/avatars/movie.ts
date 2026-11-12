import { parseAvatarDump } from './dump.mjs';
export type Matrix = readonly [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
// Raw serialization nodes remain internal; never execute ActionScript or constructor strings.
interface Node { _t: string; [key: string]: any; }
interface Placement { id: number; matrix: Matrix; alpha: number; born: number; name?: string; color?: ColorTransform; }
type Timeline = readonly (readonly Node[])[];
type Definition = { kind: 'bitmap'; file: number; width: number; height: number } | { kind: 'shape'; bitmap: number; bounds: readonly [number, number, number, number]; matrix: Matrix } | { kind: 'sprite'; frames: Timeline };
export interface AvatarLayer {
  readonly file: number;
  readonly matrix: Matrix;
  readonly bitmapMatrix: Matrix;
  readonly bounds: readonly [number, number, number, number];
  readonly alpha: number;
  readonly depth: readonly number[];
  readonly name?: string;
  /** Its colour transform (a movie read with `colors`): channel = channel * mult + add, both 0..1 scaled. */
  readonly color?: ColorTransform;
}
export interface ColorTransform { readonly mult: readonly [number, number, number]; readonly add: readonly [number, number, number] }
const NO_COLOR: ColorTransform = { mult: [1, 1, 1], add: [0, 0, 0] };
/** `inner` seen through `outer` (a sprite's transform over its children's). */
function compose(outer: ColorTransform, inner: ColorTransform): ColorTransform {
  return { mult: [0, 1, 2].map(i => inner.mult[i]! * outer.mult[i]!) as unknown as [number, number, number], add: [0, 1, 2].map(i => inner.add[i]! * outer.mult[i]! + outer.add[i]!) as unknown as [number, number, number] };
}
function finite(n: unknown, fallback?: number): number {
  if (n === undefined && fallback !== undefined) return fallback;
  if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1e8) throw new Error('Invalid avatar geometry');
  return n;
}
function uint(n: unknown, max = 65535): number {
  const v = finite(n);
  if (!Number.isInteger(v) || v < 0 || v > max) throw new Error('Invalid avatar index');
  return v;
}
function matrix(m: Node | undefined, bitmap = false): Matrix {
  const k = bitmap ? .05 : 1;
  return [finite(m?.ScaleX, 1)*k, finite(m?.RotateSkew0, 0)*k, finite(m?.RotateSkew1, 0)*k, finite(m?.ScaleY, 1)*k, finite(m?.TranslateX, 0)*.05, finite(m?.TranslateY, 0)*.05];
}
/** Bounded display-list evaluator for the original bitmap rectangle avatar movies. */
export class AvatarMovie {
  readonly files: readonly string[];
  readonly fps: number;
  readonly frameCount: number;
  readonly issues: readonly string[];
  private readonly definitions = new Map<number, Definition>();
  private readonly frames: Timeline;
  /** `colors`: RGB colour transforms are evaluated (the layers carry them) instead of refused, for movies drawn with
   * them (My Room's TV); avatar movies have none. */
  constructor(text: string, options: { colors?: boolean } = {}) {
    const dump = parseAvatarDump(text), issues = new Set<string>();
    this.files = dump.files; this.fps = dump.fps;
    const timeline = (tags: Node[], nesting = 0): Timeline => {
      if (!Array.isArray(tags) || tags.length > 100000 || nesting > 24) throw new Error('Avatar tag budget exceeded');
      const frames: Node[][] = []; let current: Node[] = [];
      for (const t of tags) {
        if (!t || typeof t._t !== 'string') throw new Error('Invalid avatar tag');
        let id: number | undefined, definition: Definition | undefined;
        switch (t._t) {
          case 'DefineBitsLossless':
            id = uint(t.CharacterID); definition = { kind: 'bitmap', file: uint(t.FileName, this.files.length - 1), width: uint(t.BitmapWidth, 8192), height: uint(t.BitmapHeight, 8192) }; break;
          case 'DefineShape': case 'DefineShape2': {
            const fill = t.Shapes?.FillStyles?.[0];
            if (!fill || ![64,65,66,67].includes(fill.FillStyleType) || t.Shapes.FillStyles.length !== 1) throw new Error('Unsupported avatar shape fill');
            const r = t.ShapeBounds;
            const bounds = [finite(r?.Xmin)*.05, finite(r?.Ymin)*.05, finite(r?.Xmax)*.05, finite(r?.Ymax)*.05] as const;
            if (bounds[2] < bounds[0] || bounds[3] < bounds[1]) throw new Error('Invalid avatar bounds');
            id = uint(t.ShapeID); definition = { kind: 'shape', bitmap: uint(fill.BitmapID), bounds, matrix: matrix(fill.BitmapMatrix, true) }; break;
          }
          case 'DefineSprite': id = uint(t.SpriteID); definition = { kind: 'sprite', frames: timeline(t.ControlTags, nesting + 1) }; break;
          case 'PlaceObject2':
            uint(t.Depth); if (t.CharacterID !== undefined) uint(t.CharacterID);
            if (t.Matrix) matrix(t.Matrix);
            if (t.ClipDepth !== undefined) issues.add('ClipDepth masks');
            if (t.ColorTransform) {
              const cx = t.ColorTransform;
              if (!options.colors && ['Red','Green','Blue'].some(c => finite(cx[`${c}MultTerm`],256) !== 256 || finite(cx[`${c}AddTerm`],0) !== 0)) issues.add('RGB colour transforms');
            }
            current.push(t); break;
          case 'RemoveObject2': uint(t.Depth); current.push(t); break;
          case 'ShowFrame': frames.push(current); current = []; break;
          case 'End': case 'FrameLabel': break;
          default: issues.add(t._t); break;
        }
        if (id !== undefined && definition) {
          if (this.definitions.has(id)) throw new Error('Duplicate avatar character');
          this.definitions.set(id, definition);
        }
      }
      if (!frames.length || frames.length > 4096) throw new Error('Invalid avatar timeline');
      return frames;
    };
    this.frames = timeline(dump.tags as Node[]); this.frameCount = this.frames.length;
    if (this.frameCount !== dump.count) throw new Error('Avatar frame count mismatch');
    this.issues = [...issues];
  }
  /** Source frame order, depth order, nested sprite start frames and bitmap anchors retained. */
  layers(frame = 0, loop = true): readonly AvatarLayer[] {
    if (!Number.isSafeInteger(frame) || frame < 0 || frame > 1e7) throw new Error('Invalid avatar frame');
    if (this.issues.length) throw new Error(`Unsupported avatar features: ${this.issues.join(', ')}`);
    const result: AvatarLayer[] = []; let visited = 0;
    const walk = (frames: Timeline, age: number, parent: Matrix, alpha: number, depths: number[], name?: string, chain: number[] = [], color: ColorTransform = NO_COLOR): void => {
      if (chain.length > 24) throw new Error('Avatar nesting budget exceeded');
      const target = loop ? age % frames.length : Math.min(age, frames.length - 1), display = new Map<number, Placement>();
      for (let i = 0; i <= target; i++) for (const t of frames[i]) {
        if (++visited > 200000) throw new Error('Avatar evaluation budget exceeded');
        if (t._t === 'RemoveObject2') { display.delete(t.Depth); continue; }
        const old = (t.Flags & 1) ? display.get(t.Depth) : undefined;
        if (t.CharacterID === undefined && !old) throw new Error('Avatar move references absent depth');
        const replacement = t.CharacterID !== undefined && t.CharacterID !== old?.id;
        display.set(t.Depth, { id: t.CharacterID ?? old!.id, matrix: t.Matrix ? matrix(t.Matrix) : old?.matrix ?? IDENTITY,
          alpha: t.ColorTransform ? finite(t.ColorTransform.AlphaMultTerm,256)/256 : old?.alpha ?? 1,
          color: t.ColorTransform ? { mult: (['Red','Green','Blue'] as const).map(c => finite(t.ColorTransform[`${c}MultTerm`],256)/256) as unknown as [number,number,number], add: (['Red','Green','Blue'] as const).map(c => finite(t.ColorTransform[`${c}AddTerm`],0)/255) as unknown as [number,number,number] } : old?.color,
          born: !old || replacement ? i : old.born, name: t.Name ?? old?.name });
      }
      for (const [d, p] of [...display].sort((a,b) => a[0]-b[0])) {
        const def = this.definitions.get(p.id), transform = multiply(parent, p.matrix), path = [...depths,d];
        if (!def) throw new Error(`Missing avatar character ${p.id}`);
        if (def.kind === 'sprite') {
          if (chain.includes(p.id)) throw new Error('Cyclic avatar sprite');
          walk(def.frames, age - p.born, transform, alpha*p.alpha, path, p.name ?? name, [...chain,p.id], p.color ? compose(color, p.color) : color);
        } else if (def.kind === 'shape') {
          const bmp = this.definitions.get(def.bitmap);
          if (bmp?.kind !== 'bitmap') throw new Error('Missing avatar bitmap');
          if (result.length >= 256) throw new Error('Avatar layer budget exceeded');
          const c = p.color ? compose(color, p.color) : color;
          result.push({ file: bmp.file, matrix: transform, bitmapMatrix: def.matrix, bounds: def.bounds, alpha: alpha*p.alpha, depth: path, name: p.name ?? name, ...(c !== NO_COLOR ? { color: c } : {}) });
        } else throw new Error('Direct bitmap placement unsupported');
      }
    };
    walk(this.frames, frame, IDENTITY, 1, []);
    return result;
  }
}
