/**
 * The NPCs' own chibi art and level stars, as yo2.exe's CNpcChibiAvatar draws them (yo2NpcChibiAvatar.cpp).
 *
 * - CNpcChibiAvatar's setup (0x009d7bf0): an NPC id in 0x33..0x5e takes its art from the archive's NPC sets (the parts
 *   bytes are not read: the server sends those NPCs all-zero parts), any other id is drawn from its parts like a player.
 *   0x00a55cd0 gives the id's art kind (three ids per character, one per tier), CChibiAvatarElm::SetNpc (0x009c9af0)
 *   keeps it, and the movie's bitmap names (cn_d01_*.png) have their first "d01" swapped for the kind's set
 *   (0x009ccfc0, the switch over elm +0x344).
 * - The movies are cn_n01..05 (standing, one frame) and cn_t01..05 (the blink, 12 frames), in the player's facing order
 *   1,2,3,4,5,4,3,2 with 5..7 mirrored (the motion table filled by 0x009c88c0). They share the player movies' stage:
 *   the same shadow placement, so the same root offset and foot point.
 * - The blink is CChibiAvatarElm's idle timer (0x009cbed0): while standing, a counter set to rand() % 30 + 60 frames
 *   (the constructor, 0x009cb360) counts down at 30 fps; below zero it asks for motion 3 (the cn_t movie: priority 150,
 *   not looping, then back to standing; table at 0x00d0a408) and restarts at rand() % 60 + 60.
 * - The stars (0x009d83f0..0x009d84c4, drawn by 0x009dac50 at (-25, -114) from the feet, 0x009d9150): one 16 px star
 *   per level already passed in the NPC's chain, then, while the player's rank is below the row's threshold, rank * 5 /
 *   threshold + 1 small 8 px stars (else one more 16 px star); none for the three NPCs whose challenge right the player
 *   lacks (0x00a56060: PBIN bits 0x250 Kaiba, 0x251 Alexis, 0x252 Marik).
 */
import { avatarPose } from './appearance';

/** CChibiAvatarElm +0x344 -> the set its bitmap names use (0x009ccfc0; 1, 2 and 7 keep d01). */
export const NPC_CHIBI_SETS: readonly string[] = ['d01', 'd01', 'd01', 'd04', 'd04', 'd06', 'a01', 'd01', 'a03', 'a04', 'd07', 'a05', 'd08', 'a06', 'd09', 'a07', 'd10', 'a08', 'a01'];
/** 0x00a55cd0: the art kind of ids 51..95, three per character (Yami Yugi 51..53, Seto Kaiba 54..56, ...). */
const NPC_KINDS = [0, 4, 5, 6, 9, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18];
/** 0x00a56060: the art kinds whose stars need a challenge right (a PBIN bit). */
const STAR_RIGHTS: Readonly<Record<number, number>> = { 3: 0x250, 4: 0x250, 8: 0x251, 12: 0x252 };
/** The ids CNpcChibiAvatar draws with NPC art (0x009d7f2b: id >= 0x33 and id < 0x5f). */
export const NPC_ART_FIRST = 0x33, NPC_ART_LAST = 0x5e;

/** The art kind and tier (0..2) of an NPC id (0x00a55cd0), or null outside 51..95. */
export function npcArtKind(id: number): { kind: number; tier: number } | null {
  if (!Number.isInteger(id) || id < 51 || id > 95) return null;
  return { kind: NPC_KINDS[Math.floor((id - 51) / 3)]!, tier: (id - 51) % 3 };
}
/** The cn_ set an NPC is drawn with (a03 for Alexis Rhodes), or null when it is drawn from its parts. */
export function npcChibiSet(id: number): string | null {
  if (!Number.isInteger(id) || id < NPC_ART_FIRST || id > NPC_ART_LAST) return null;
  return NPC_CHIBI_SETS[npcArtKind(id)!.kind] ?? null;
}
export function isNpcChibiSet(set: string): boolean { return /^[ad]\d\d$/.test(set); }

export type NpcMotion = 'stand' | 'blink';
/** The NPC movie for a facing: cn_n0x standing (looping, one frame), cn_t0x the blink (played once). */
export function npcPose(motion: NpcMotion = 'stand', direction = 0) {
  const pose = avatarPose('stand', direction), facing = pose.path.slice(-6, -4);
  return { path: `data/Avatar/chibi/cn_${motion === 'blink' ? 't' : 'n'}${facing}.txt`, mirrored: pose.mirrored, offset: pose.offset, foot: pose.foot, loop: motion === 'stand' };
}
/** The movie's bitmap names for a set: the first "d01" becomes the set (cn_d01_bo_n01_01.png -> cn_a03_bo_n01_01.png). */
export function resolveNpcPngs(names: readonly string[], set: string): string[] {
  if (!isNpcChibiSet(set)) throw new Error('Invalid NPC chibi set');
  return names.map(name => name.replace('d01', set));
}

/** One frame of the elm's logic (30 fps). */
export const NPC_FRAME_MS = 1000 / 30;
/** The idle counter, in ms: rand() % 30 + 60 frames at first (the elm's constructor), rand() % 60 + 60 after a blink. */
export function npcBlinkDelay(random: () => number, first = false): number {
  const span = first ? 30 : 60, r = Math.min(span - 1, Math.max(0, Math.floor(random() * span)));
  return (r + 60) * NPC_FRAME_MS;
}

export interface NpcStarRow { readonly id: number; readonly threshold: number; readonly previous: number }
export interface NpcStars { readonly big: number; readonly small: number }
/** The level stars over an NPC (0x009d83f0): `npcs` the server's NPC list, `npcbin` the player's NPC records (rank at
 * id * 4 + 3), `pbin` the player's bits. */
export function npcStars(npc: NpcStarRow, npcs: readonly NpcStarRow[], npcbin: Uint8Array, pbin?: Uint8Array): NpcStars {
  let big = 0;
  const byId = new Map(npcs.map(n => [n.id, n]));
  for (let previous = npc.previous, guard = 0; previous !== 0 && guard < 64; guard++) { const row = byId.get(previous); if (!row) break; big++; previous = row.previous; }
  const rank = npc.id * 4 + 3 < npcbin.length ? npcbin[npc.id * 4 + 3]! : 0;
  let small = 0;
  if (rank < npc.threshold) small = Math.trunc(rank * 5 / npc.threshold + 1); else big++;
  const right = STAR_RIGHTS[npcArtKind(npc.id)?.kind ?? -1];
  if (right !== undefined && !(pbin && right >> 3 < pbin.length && pbin[right >> 3]! & 1 << (right & 7))) return { big: 0, small: 0 };
  return { big: Math.min(big, 5), small: Math.min(small, 10) };
}
/** The stars' row from the feet (CNpcChibiAvatar's m_pNpcStar at (-25, -114)), and each star's place in it
 * (0x009dac50: 16 px stars at x = 16i, then 8 px stars at x = 8 (j + 2 * big), all at y = 0). */
export const NPC_STARS_X = -25, NPC_STARS_Y = -114;
export function npcStarCells(stars: NpcStars): { x: number; y: number; big: boolean }[] {
  const out: { x: number; y: number; big: boolean }[] = [];
  for (let i = 0; i < stars.big; i++) out.push({ x: i * 16, y: 0, big: true });
  for (let j = 0; j < stars.small; j++) out.push({ x: (j + stars.big * 2) * 8, y: 0, big: false });
  return out;
}
export const NPC_STAR_BIG = 'data/Avatar/npc/npc_star16_01.png', NPC_STAR_SMALL = 'data/Avatar/npc/npc_star08_01.png';
