// NPCs of the map: the list (py yo2srv/mundo/npc.py load_npcs with research/mundo "spots" and research/npcreglas
// friendship levels), their avatar parts (research/avatar npc_parts) and the NPCINFOLIST entry.
import { W } from "../net/proto.ts";
import { PyRandom } from "../util/pyrandom.ts";
import LD from "../../gamedata/lobby.json";
import type { Game } from "./game.ts";

export type Npc = [id: number, name: string, spot: number, parts: Uint8Array];

const INFO = new Map<number, { name: string; sex: string | null }>((LD.npc_ids as any[]).map((d) => [d.id, d]));

// py mundo/npc.py
const SPOTS_A: [number, number][] = [[4, 209], [4, 213], [5, 201], [6, 202], [6, 208], [7, 203], [7, 207], [0, 204], [0, 212], [1, 205], [2, 214], [2, 210], [2, 211], [9, 206]];
const FAMOUS = [51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84];
const SPOTS_2008: Record<number, number> = { 51: 204, 54: 206, 57: 205, 60: 203, 63: 202, 66: 201, 69: 210, 72: 207, 75: 214, 78: 208, 81: 212, 84: 209 };

/** py research/mundo ORIGINALS: id -> (name, area or null, 5-win card's passcode). */
export const ORIGINALS: Record<number, [string, number | null, number]> = {
  3: ["bankara", 2, 4929256], 1: ["BeeBee", 3, 17078030], 21: ["frogMaster", 2, 84451804], 7: ["gouk", 1, 84636823], 4: ["Joker", null, 18378582],
  24: ["kanna", 1, 13093792], 6: ["KC Dragon", null, 48229808], 5: ["kyoko", 3, 6214884], 2: ["missbomb", 0, 47233801], 9: ["Miss Scout", 2, 76922029],
  8: ["Miss Shadow", 0, 35027493], 14: ["Reia", 1, 85306040], 17: ["Robert", 0, 93130021], 16: ["Sakura", 3, 64538655], 20: ["ZuruZuru", null, 77754944],
  43: ["Abigail", 4, 99414168], 35: ["A-lien", 5, 24104865], 32: ["AoJ", 6, 67095270], 40: ["Brow", 4, 31812496], 27: ["dancer", 6, 19877898],
  38: ["Kain", 5, 4259068], 33: ["Kyuros", null, 94192409], 31: ["lalala", 6, 65403020], 29: ["Mika", null, 91345518], 26: ["NiaNia", 4, 61370518],
  34: ["Queen Ryo", 7, 87910978], 28: ["Rain", null, 60806437], 44: ["raMon", 5, 75043725], 49: ["sabasaba", 7, 38992735], 30: ["Zuno", 7, 52417194],
};
const AREA_BASE: Record<number, number> = { 4: 1, 5: 9, 6: 17, 7: 25, 0: 33, 1: 41, 2: 49, 3: 57 };
const FIXED_POINTS: Record<number, number> = { 43: 2, 26: 4 };
const POINT_ORDER = [1, 3, 5, 7, 2, 4, 6, 8];
const SEX: Record<number, string> = { 8: "F", 29: "F" };

/** py mundo/npc.py npc_parts: a hash-picked look (used for the DC08 originals). */
export function npcPartsHash(nid: number, sex: string | null | undefined): Uint8Array {
  const r = (nid * 2654435761) % 4294967296;
  const pick = (k: number, n: number) => Math.floor(r / 2 ** (k * 3)) % n;
  const clothes = (pick(0, 2) ? 0x80 : 0x70) + pick(1, 4);
  return Uint8Array.from([sex === "F" ? 1 : 0, pick(2, 6), 0x20, 0x30, 0x40 + pick(3, 4), 0x60 + pick(4, 4), clothes,
    0x90 + pick(5, 4), 0xb8, 0x20, 0, 0, 0, pick(6, 3), pick(7, 6), pick(8, 4)]);
}

/** py research/mundo orig_entries: [(id, name, spot, parts, sex)] of the DC08 originals placed in a zone. */
function origEntries(): [number, string, number, Uint8Array, string | null][] {
  const used = new Map<number, Set<number>>();
  const out: [number, string, number, Uint8Array, string | null][] = [];
  const ids = Object.keys(ORIGINALS).map(Number).sort((a, b) => {
    const [, x] = ORIGINALS[a], [, y] = ORIGINALS[b];
    return Number(x === null) - Number(y === null) || (x ?? 0) - (y ?? 0) || a - b;
  });
  for (const nid of ids) {
    const [name, area] = ORIGINALS[nid];
    if (area === null) continue;
    if (!used.has(area)) used.set(area, new Set(Object.keys(FIXED_POINTS).map(Number).filter((n) => (ORIGINALS[n]?.[1] ?? -1) === area).map((n) => FIXED_POINTS[n])));
    const taken = used.get(area)!;
    const k = nid in FIXED_POINTS ? FIXED_POINTS[nid] : POINT_ORDER.find((x) => !taken.has(x))!;
    taken.add(k);
    const sex = SEX[nid] ?? INFO.get(nid)?.sex ?? null;
    out.push([nid, name.slice(0, 15), AREA_BASE[area] + k - 1, npcPartsHash(nid, sex), sex]);
  }
  return out;
}

// py research/npcreglas: friendship levels 2-3 of the famous, NPCINFOLIST threshold/previous
const FAMOUS_BASES = Array.from({ length: 12 }, (_, i) => 51 + 3 * i);
const MID_WINS = 5, COMP_WINS_FAMOUS = 8, COMP_WINS_ORIGINAL = 9;
const COMP_WINS: Record<number, number> = { 60: 9, 61: 9, 62: 9, 66: 9, 67: 9, 68: 9, 9: 8 }; // + research/mundo prizes
export const nrChainBase = (nid: number) => FAMOUS_BASES.find((b) => b <= nid && nid < b + 3) ?? null;
export const nrCompWins = (nid: number) => COMP_WINS[nid] ?? (nrChainBase(nid) !== null ? COMP_WINS_FAMOUS : COMP_WINS_ORIGINAL);
export const nrThreshold = (nid: number) => 1 + nrCompWins(nid);
export const nrMidB3 = (_nid: number) => 1 + MID_WINS;
export function nrChainFields(nid: number, sent: Set<number>): [number, number] {
  const base = nrChainBase(nid);
  const prev = base !== null && nid > base && sent.has(nid - 1) ? nid - 1 : 0;
  return [nrThreshold(nid), prev];
}
function nrNpcList(npcs: Npc[]): Npc[] {
  const out = npcs.slice();
  const have = new Set(out.map((n) => n[0]));
  for (const n of npcs) if (FAMOUS_BASES.includes(n[0])) for (const lvl of [1, 2]) if (!have.has(n[0] + lvl)) out.push([n[0] + lvl, n[1], n[2], n[3]]);
  return out;
}

/** py load_npcs (MUNDO_2008 spots + NPC_RULES_2008 friendship, both on). Also fills npcSex. */
export function loadNpcs(npcSex: Map<number, string | null>): Npc[] {
  const npcs: Npc[] = [];
  SPOTS_A.forEach(([, spot0], i) => {
    if (i >= FAMOUS.length) return;
    const nid = FAMOUS[i];
    npcs.push([nid, INFO.get(nid)?.name ?? `NPC ${nid}`, SPOTS_2008[nid] ?? spot0, new Uint8Array(16)]);
  });
  for (const [nid, name, spot, parts, sex] of origEntries()) { npcs.push([nid, name, spot, parts]); npcSex.set(nid, sex); }
  return nrNpcList(npcs);
}

// ---- research/avatar: valid NPC parts per world
const AV_PBIN = LD.avatar_pbin as unknown as Record<string, [number, number, number, number, number, number]>;
const DOMINO = 0, ACADEMIA = 1, MALE = 0, FEMALE = 1;
const P = { SEX: 0, HAIR_FRONT: 1, FACE_ACC: 2, NOSE: 3, EYES: 4, MOUTH: 5, CLOTHES: 6, HAIR_BACK: 7, DISK: 8, GLASSES: 9, SKIN: 13, HAIR_COLOR: 14, EYE_COLOR: 15 };

function validateParts(p0: Uint8Array, world = DOMINO, checkWorld = true): boolean {
  const p = new Uint8Array(16); p.set(p0.subarray(0, 16));
  if (p[0] > 1) return false;
  const sex = p[0];
  for (let i = 0; i < 16; i++) {
    let v = p[i];
    if (i === 0 || i === 13 || i === 14 || i === 15) { if (v > 7) return false; }
    else if (i >= 1 && i <= 9) {
      if (i === 9 && v === 0) v = 0x20;
      const rec = AV_PBIN[String(v + (sex === FEMALE ? 0x100 : 0))];
      const slot = rec ? rec[3] : 0, rworld = rec ? rec[5] : 0;
      if (slot !== i && !((i === 2 || i === 9) && v === 0x20)) return false;
      if (checkWorld && rworld !== 1 && rworld !== (world === DOMINO ? 2 : 3)) return false;
    }
  }
  return true;
}

export function defaultParts(sex = MALE, world = DOMINO): Uint8Array {
  const [clothes, disk] = world === DOMINO ? [0x70, 0xb0] : [0x80, 0xb8];
  return Uint8Array.from([sex, 0x00, 0x20, 0x30, 0x40, 0x60, clothes, 0x90, disk, 0x20, 0, 0, 0, 0, 0, 0]);
}

const NPC_POOL: Record<number, Record<number, any>> = {
  [MALE]: { [P.HAIR_FRONT]: [0, 1, 2, 3, 4, 5, 7, 8, 10, 11], [P.HAIR_BACK]: [0x90, 0x91, 0x92, 0x93], [P.FACE_ACC]: [0x20, 0x20, 0x20, 0x21],
    [P.EYES]: [0x40, 0x41, 0x42, 0x43, 0x44, 0x45], [P.MOUTH]: [0x60, 0x61, 0x62], [P.GLASSES]: [0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x50, 0x51, 0x52, 0x53],
    [P.CLOTHES]: { [DOMINO]: [0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x77], [ACADEMIA]: [0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86] } },
  [FEMALE]: { [P.HAIR_FRONT]: [0, 1, 2, 3, 4, 8, 5], [P.HAIR_BACK]: [0x90, 0x91, 0x92], [P.FACE_ACC]: [0x20, 0x20, 0x21], [P.EYES]: [0x40, 0x41, 0x42, 0x43],
    [P.MOUTH]: [0x60, 0x61], [P.GLASSES]: [0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x50, 0x51, 0x52, 0x53, 0x54, 0x55],
    [P.CLOTHES]: { [DOMINO]: [0x70, 0x71, 0x72, 0x73, 0x74], [ACADEMIA]: [0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86] } },
};
const NPC_DISKS: Record<number, number[]> = { [DOMINO]: [0xb0, 0xb0, 0xb0, 0xb1, 0xb2, 0xb3, 0xb7, 0xc3, 0xc4], [ACADEMIA]: [0xb8, 0xb8, 0xb8, 0xb9, 0xba, 0xbb, 0xbf, 0xd3, 0xd4] };

function npcSexOf(nid: number, sex: unknown): number {
  if (sex === "F" || sex === FEMALE) return FEMALE;
  if (sex === "M" || sex === MALE) return MALE;
  return Math.floor((nid * 2654435761) / 128) % 2 ? FEMALE : MALE;
}

/** py research/avatar npc_parts: a stable, valid look for a normal NPC in this world. */
export function avNpcParts(nid: number, sex: unknown = null, world = DOMINO): Uint8Array {
  const s = npcSexOf(nid, sex);
  const pool = NPC_POOL[s];
  const r = new PyRandom(0x5eed0000 + nid);
  const pick = (k: number) => r.choice(pool[k] as number[]);
  const p = new Uint8Array(16);
  p[P.SEX] = s;
  p[P.HAIR_FRONT] = pick(P.HAIR_FRONT);
  p[P.FACE_ACC] = pick(P.FACE_ACC);
  p[P.NOSE] = r.choice([0x30, 0x31]);
  p[P.EYES] = pick(P.EYES);
  p[P.MOUTH] = pick(P.MOUTH);
  p[P.HAIR_BACK] = pick(P.HAIR_BACK);
  p[P.GLASSES] = pick(P.GLASSES);
  const kClothes = r.randrange(1 << 16), kDisk = r.randrange(1 << 16);
  const w = world === ACADEMIA ? ACADEMIA : DOMINO;
  const cl = pool[P.CLOTHES][w] as number[];
  p[P.CLOTHES] = cl[kClothes % cl.length];
  p[P.DISK] = NPC_DISKS[w][kDisk % NPC_DISKS[w].length];
  p[P.SKIN] = r.choice([0, 0, 1, 2]);
  p[P.HAIR_COLOR] = r.randrange(7);
  p[P.EYE_COLOR] = r.randrange(7);
  return validateParts(p, w) ? p : defaultParts(s, w);
}

/** py npc_list_parts: the parts of a normal NPC, valid in the world of whoever asks. */
export function npcListParts(g: Game, n: Npc): Npc {
  const [nid, name, spot, parts] = n;
  if (parts.some((b) => b)) return [nid, name, spot, avNpcParts(nid, g.npcSex.get(nid) ?? null, g.curWorld())];
  return n;
}

/** py npc_entry: NPCINFOLIST record, 61 B. */
export function npcEntry(g: Game, [nid, name, spot, parts]: Npc): Uint8Array {
  const [thr, prev] = nrChainFields(nid, new Set(g.npcs.map((n) => n[0])));
  const p16 = new Uint8Array(16); p16.set(parts.subarray(0, 16));
  return new W().u32(nid).s(name, 16).raw(p16).u8(0).u32(0).u32(0).u32(thr).u32(spot).u32(0).u32(prev).bytes();
}
