/**
 * A famous NPC's waist-up picture (Yami Yugi, Alexis Rhodes, Chazz Princeton...) where live draws it: the same place in
 * the NPC's talk, the rock-paper-scissors scene, the duel and its result (one CDuelMsgTask holds it through all four).
 *
 * yo2.exe's CWaistUpNpc:
 * - the set: yo2DuelAvater's id -> kind (0x007801c0: three ids per character, 0x33..0x5f), the kind -> data/avatar/npc/
 *   <set>.csv (the switch in 0x009efd80). Not the chibi's kinds (avatars/npc.ts): Jaden's second look (93..95) is a09.
 * - the csv (0x009efd80): the id, x, y, the number (from 1) of the one changing tile, the 3 x 3 tiles ('****' none),
 *   then that tile's frames 2..7 (1..3 the eyes open, half shut, shut; 4..6 the same beaten).
 * - each tile i at ((i % 3) * 256, y + floor(i / 3) * 256) in the picture's base, the frames on the changing tile's
 *   place; Chazz Princeton's (kind 9, a04) first tile instead at (256, y - 256), above the middle column (his hair), and
 *   Yami Marik (kind 12, d08) one more, npc_d08_bo_10.png, there.
 * - the base at (874 - x, 0) on the 1024 x 768 screen (0x009efbd0: home 874, 0; 0x009efb40: base = home - x), at full
 *   size, unmirrored.
 * Measured live (the engine's sprites, yo2Html's task tree): Yami Yugi d01 (184, 0) base 690, 0, tiles from y 0; Joey
 * Wheeler d07 (312, 28) base 562, tiles from y 28; Chazz Princeton a04 (435, 73) base 439, tiles from y 73, bo_01 at
 * 695, -183; Alexis Rhodes a03 (396, 31) base 478, tiles from y 31. The same in the talk, janken, duel and result.
 */

/** 0x009efd80's switch: the waist-up kind -> its csv. */
const WAISTUP_SETS = ['d01', 'd02', 'd03', 'd04', 'd05', 'd06', 'a01', 'a02', 'a03', 'a04', 'd07', 'a05', 'd08', 'a06', 'd09', 'a07', 'd10', 'a08', 'a09'] as const;
/** 0x007801c0: the kind of ids 0x33.. three at a time (Yami Yugi 0x33..0x35 kind 0, Seto Kaiba 3, ...). */
const ID_KINDS = [0, 3, 5, 6, 9, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const FIRST_ID = 0x33, LAST_ID = 0x5f;
/** Where the picture's base goes with its csv x at 0 (0x009efbd0: 874.0, 0). */
export const NPC_WAISTUP_HOME = { x: 874, y: 0 } as const;
const TILE = 256;

/** The csv set of a famous NPC's waist-up picture (a03 for Alexis Rhodes), or null for an NPC drawn from its parts. */
export function npcWaistUpSet(id: number): string | null {
  if (!Number.isInteger(id) || id < FIRST_ID || id > LAST_ID) return null;
  return WAISTUP_SETS[ID_KINDS[Math.floor((id - FIRST_ID) / 3)]!] ?? null;
}

export interface NpcWaistUpCsv {
  /** The csv's x and y: the base sits at 874 - x, the tiles from y down. */
  x: number; y: number;
  /** The changing tile (0..8), or -1. */
  changing: number;
  /** The nine tiles, '' for none. */
  tiles: string[];
  /** The changing tile's frames 2..7. */
  frames: string[];
}
export function parseNpcWaistUpCsv(text: string): NpcWaistUpCsv {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('//'));
  const name = (s: string | undefined) => s && s !== '****' && /^[\w.-]+\.png$/i.test(s) ? s : '';
  const changing = (Number(lines[3]) || 0) - 1;
  return { x: Number(lines[1]) || 0, y: Number(lines[2]) || 0, changing: changing >= 0 && changing < 9 ? changing : -1,
    tiles: Array.from({ length: 9 }, (_, i) => name(lines[4 + i])), frames: Array.from({ length: 6 }, (_, i) => name(lines[13 + i])) };
}

export type NpcWaistUpFrame = 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** The picture's tiles for one frame of its changing tile, each at its place on the 1024 x 768 screen. */
export function npcWaistUpTiles(set: string, csv: NpcWaistUpCsv, frame: NpcWaistUpFrame = 1): { name: string; x: number; y: number }[] {
  const bx = NPC_WAISTUP_HOME.x - csv.x, by = NPC_WAISTUP_HOME.y, out: { name: string; x: number; y: number }[] = [];
  csv.tiles.forEach((tile, i) => {
    const name = i === csv.changing && frame > 1 ? csv.frames[frame - 2] || tile : tile;
    if (!name) return;
    // a04's first tile above the middle column
    const above = set === 'a04' && i === 0;
    out.push({ name, x: bx + (above ? TILE : i % 3 * TILE), y: by + csv.y + (above ? -TILE : Math.floor(i / 3) * TILE) });
  });
  if (set === 'd08') out.push({ name: 'npc_d08_bo_10.png', x: bx + TILE, y: by + csv.y - TILE });
  return out;
}

type Lease = { url: string; release(): void };
/** The picture's frames, each a 1024 x 768 canvas (the screen) with the tiles at their places: what the talk, the
 * janken scene and the duel show. */
export async function npcWaistUpCanvases(load: (path: string, signal: AbortSignal) => Promise<Lease>, set: string,
  frames: readonly NpcWaistUpFrame[], signal: AbortSignal): Promise<HTMLCanvasElement[]> {
  if (!/^[ad]\d\d$/.test(set)) throw new Error('Unknown NPC picture.');
  const lease = await load(`data/avatar/npc/${set}.csv`, signal);
  let text: string; try { text = await (await fetch(lease.url, { signal })).text(); } finally { lease.release(); }
  const csv = parseNpcWaistUpCsv(text), images = new Map<string, Promise<HTMLImageElement | null>>();
  const image = (name: string) => {
    let p = images.get(name);
    if (!p) images.set(name, p = load(`data/avatar/npc/${name}`, signal).then(async l => {
      try { const img = new Image(); img.src = l.url; await img.decode(); return img; } catch { return null; } finally { l.release(); }
    }, () => null));
    return p;
  };
  return Promise.all(frames.map(async frame => {
    const tiles = npcWaistUpTiles(set, csv, frame), drawn = await Promise.all(tiles.map(t => image(t.name)));
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 768;
    const ctx = canvas.getContext('2d');
    tiles.forEach((t, i) => { const img = drawn[i]; if (img && ctx) ctx.drawImage(img, t.x, t.y); });
    return canvas;
  }));
}
