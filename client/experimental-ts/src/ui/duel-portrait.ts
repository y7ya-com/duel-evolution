import type { ArchiveLoader } from './duel-fx';

/** The duelists' waist-up portraits: the original composes them from the avatar bytes with data/avatar/wu/wm_data.csv
 * (male) or ww_data.csv (female), read by CWADictionary::load (client/src/Game/Avatar/yo2WaistUpAvatar.cpp): one part
 * per line, `kind, number, 7 image columns, x, y, w, h` on a 768×768 canvas. Kinds are drawn in order 0..12 (back hair,
 * body, hair shade, eye whites, mouth, eyes, nose, eyebrows, face accessory, glasses, clothes, front hair, duel disk).
 * `number` is the avatar byte the part stands for; the column is its colour (hair, skin or eye colour) or, for parts
 * drawn per pose (`_r` / `_l`), the pose: variant 0 is `_r`, 1 is `_l` (src/ui/duel-scene.ts picks and mirrors them).
 * The byte rules for bald heads, hoods and style-specific back hair follow the chibi avatar's (src/avatars/appearance.ts). */

interface Part { kind: number; number: number; images: (string | null)[]; rect: [number, number, number, number] }
const KINDS = 13, SIZE = 768;

export function parseWaistUpData(text: string): Part[] {
  const out: Part[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('//')) continue;
    const cols = line.split(','); if (cols.length < 13) continue;
    const kind = Number(cols[0]), number = Number(cols[1]);
    if (!Number.isInteger(kind) || kind < 0 || kind >= KINDS || !Number.isInteger(number)) continue;
    out.push({ kind, number, images: cols.slice(2, 9).map(c => c.trim() && c.trim() !== '****' ? c.trim() : null),
      rect: cols.slice(9, 13).map(Number) as Part['rect'] });
    if (out.length > 512) break;
  }
  return out;
}

/** The part images (archive paths, back to front) and their rectangles for one duelist. */
/** Avatar bytes 2..9 that are zero (the famous NPCs are listed with sixteen zero bytes) take the default look, the
 * Academy outfit and disk that the original shows for them. */
const DEFAULTS = [0, 0, 0x20, 0x30, 0x40, 0x60, 0x80, 0x90, 0xb8, 0x20];
export function waistUpLayers(raw: Uint8Array, variant: 0 | 1, data: Part[]): { path: string; rect: Part['rect'] }[] {
  if (raw.length < 16) return [];
  const parts = Uint8Array.from(raw, (b, i) => i >= 2 && i <= 9 && b === 0 ? DEFAULTS[i]! : b);
  const female = parts[0] === 1, hair = parts[1]!, clothes = parts[6]!;
  const skin = parts[13]!, hairColour = parts[14]!, eyeColour = parts[15]!;
  const bald = !female && hair === 6;
  const hood = female ? clothes === 117 || clothes === 119 : clothes === 120 || clothes === 124;
  const ownBack = female ? hair >= 5 && hair <= 9 : hair >= 10 && hair <= 13;
  const numbers: (number | null)[] = [
    bald || hood ? null : ownBack ? hair : parts[7]!, variant, hair, parts[4]!, parts[5]!, parts[4]!, parts[3]!, parts[4]!,
    parts[2]!, parts[9]!, clothes, hood ? clothes : hair, parts[8]!,
  ];
  const colour = (kind: number, part: Part): number => {
    const filled = part.images.filter(Boolean).length;
    if (part.images.some(i => i && /_[lr]\.png$/i.test(i)) && filled <= 2) return variant;
    if (kind === 5) return eyeColour;
    if (kind === 0 || kind === 7 || kind === 11) return bald ? 0 : hairColour;
    return filled <= 3 ? skin : 0;
  };
  const out: { path: string; rect: Part['rect'] }[] = [];
  for (let kind = 0; kind < KINDS; kind++) {
    const n = numbers[kind]; if (n === null || n === undefined) continue;
    const part = data.find(p => p.kind === kind && p.number === n); if (!part) continue;
    const c = colour(kind, part), image = part.images[c] ?? part.images.find(Boolean);
    if (image && part.rect[2] > 0 && part.rect[3] > 0) out.push({ path: `data/avatar/wu/${image}`, rect: part.rect });
  }
  return out;
}

/** The eye parts (eye whites 3, eyes 5, eyebrows 7) are drawn in frames: `_01` open, `_02` half shut, `_03` shut
 * (04..07 the same with a sweat drop). A blink swaps them in the composition; nothing else moves.
 * The loser's face on the result screen (live: the duel's end) is the sweating set (04 open, 05 half shut, 06 shut,
 * the brows lowered) over the gritted-teeth mouth (`wm_mo_NN_02`, the mouth's only other frame). */
export type EyeFrame = 1 | 2 | 3;
export type Expression = 'normal' | 'lose';
type Layer = { path: string; rect: Part['rect']; fallback?: string };
export function eyeFrameLayers(layers: { path: string; rect: Part['rect'] }[], frame: EyeFrame, expression: Expression = 'normal'): Layer[] {
  if (frame === 1 && expression === 'normal') return layers;
  const eyes = expression === 'lose' ? frame + 3 : frame;
  return layers.map(layer => {
    const path = layer.path.replace(/^(data\/avatar\/wu\/w[mw]_(?:es|ey|eb)_\d+)_01(_c\d+\.png)$/i, `$1_0${eyes}$2`)
      .replace(/^(data\/avatar\/wu\/w[mw]_mo_\d+)_01(_c\d+\.png)$/i, expression === 'lose' ? '$1_02$2' : '$1_01$2');
    // a face part the archive lacks in that expression falls back to the part as it is
    return path === layer.path ? layer : { ...layer, path, fallback: layer.path };
  });
}

/** The original's blink, measured on its duel screen (a 30 fps screencast, 2026-11-04): the eyes stay open a random
 * 0.3–9 s, then half shut, shut and half shut for 8 game frames (133 ms) each, and open again; each portrait blinks on
 * its own. `random` is [0, 1). Returns the frames as [frame, milliseconds], from the moment the eyes open. */
export const BLINK = { minOpen: 300, maxOpen: 9000, step: 133 };
export function blinkSchedule(random: () => number): [EyeFrame, number][] {
  return [[1, BLINK.minOpen + random() * (BLINK.maxOpen - BLINK.minOpen)], [2, BLINK.step], [3, BLINK.step], [2, BLINK.step]];
}

export class WaistUpComposer {
  private readonly data = new Map<0 | 1, Promise<Part[]>>();
  constructor(private readonly load: ArchiveLoader) {}
  private async text(path: string, signal: AbortSignal): Promise<string> {
    const lease = await this.load(path, signal);
    try { const bytes = await (await fetch(lease.url)).arrayBuffer(); try { return new TextDecoder('shift_jis').decode(bytes); } catch { return new TextDecoder().decode(bytes); } }
    finally { lease.release(); }
  }
  private dictionary(female: boolean, signal: AbortSignal): Promise<Part[]> {
    const key = female ? 1 : 0;
    let known = this.data.get(key);
    if (!known) { known = this.text(`data/avatar/wu/${female ? 'ww' : 'wm'}_data.csv`, signal).then(parseWaistUpData); this.data.set(key, known); known.catch(() => this.data.delete(key)); }
    return known;
  }
  /** The composed portrait with its eyes open, half shut and shut (768×768 canvases; a frame whose parts do not load
   * is left out), in an expression (the loser's on the result screen). */
  async composeFrames(parts: Uint8Array, variant: 0 | 1, signal: AbortSignal, expression: Expression = 'normal'): Promise<Partial<Record<EyeFrame, HTMLCanvasElement>>> {
    const layers = waistUpLayers(parts, variant, await this.dictionary(parts[0] === 1, signal));
    const frames: Partial<Record<EyeFrame, HTMLCanvasElement>> = {};
    for (const frame of [1, 2, 3] as const) {
      const canvas = await this.draw(eyeFrameLayers(layers, frame, expression), signal, frame === 1);
      if (canvas) frames[frame] = canvas;
    }
    return frames;
  }
  /** A 768×768 canvas with the composed portrait. */
  async compose(parts: Uint8Array, variant: 0 | 1, signal: AbortSignal): Promise<HTMLCanvasElement> {
    const layers = waistUpLayers(parts, variant, await this.dictionary(parts[0] === 1, signal));
    return (await this.draw(layers, signal, true))!;
  }
  /** Draw `layers`; null when a part fails and `partial` is false (a blink frame missing a part is not shown). */
  private async draw(layers: Layer[], signal: AbortSignal, partial: boolean): Promise<HTMLCanvasElement | null> {
    const images = await Promise.all(layers.map(async layer => {
      const lease = await this.load(layer.path, signal).catch(() => layer.fallback ? this.load(layer.fallback, signal).catch(() => null) : null);
      if (!lease) return null;
      try {
        const image = new Image(); image.src = lease.url;
        await image.decode().catch(() => {});
        return image.naturalWidth ? image : null;
      } finally { setTimeout(() => lease.release(), 0); }
    }));
    if (!partial && images.some(img => !img)) return null;
    const canvas = document.createElement('canvas'); canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (ctx) layers.forEach((layer, i) => { const img = images[i]; if (img) ctx.drawImage(img, layer.rect[0], layer.rect[1], layer.rect[2], layer.rect[3]); });
    return canvas;
  }
}
