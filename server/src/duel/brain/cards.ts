// py research/ia/brain.py: ocgcore constants, Card, CardDB and declarable() (ANNOUNCE_CARD opcodes).
// The CardDB comes from gamedata/brain_cards.json (scripts/brain_gamedata.py dumps py's own CardDB: same cards, same
// order, the text-derived tags and flags precomputed), passed in by the host: there is no sqlite/fs on the Worker.

export const TYPE_MONSTER = 0x1, TYPE_SPELL = 0x2, TYPE_TRAP = 0x4;
export const TYPE_NORMAL = 0x10, TYPE_EFFECT = 0x20, TYPE_FUSION = 0x40, TYPE_RITUAL = 0x80;
export const TYPE_TOKEN = 0x4000, TYPE_QUICKPLAY = 0x10000, TYPE_CONTINUOUS = 0x20000, TYPE_EQUIP = 0x40000;
export const TYPE_FIELD = 0x80000, TYPE_COUNTER = 0x100000, TYPE_FLIP = 0x200000;
export const TYPE_EXTRA = 0x40 | 0x2000 | 0x800000 | 0x4000000;

export const LOC_DECK = 1, LOC_HAND = 2, LOC_MZONE = 4, LOC_SZONE = 8, LOC_GRAVE = 16, LOC_REMOVED = 32, LOC_EXTRA = 64;
export const POS_FU_ATK = 1, POS_FD_ATK = 2, POS_FU_DEF = 4, POS_FD_DEF = 8;
export const PH_DRAW = 1, PH_STANDBY = 2, PH_M1 = 4, PH_BATTLE_START = 8, PH_BATTLE_STEP = 16;
export const PH_DAMAGE = 32, PH_DAMAGE_CAL = 64, PH_BATTLE = 128, PH_M2 = 256, PH_END = 512;

export const H_RELEASE = 500, H_DISCARD = 501, H_DESTROY = 502, H_REMOVE = 503, H_TOGRAVE = 504, H_RTOHAND = 505,
  H_ATOHAND = 506, H_TODECK = 507;
export const H_SUMMON = 508, H_SPSUMMON = 509, H_SET = 510, H_EQUIP = 518, H_CONTROL = 520, H_ATTACKTARGET = 549,
  H_EFFECT = 550, H_TARGET = 551;
export const HINTS_MALO = new Set([H_RELEASE, H_DISCARD, H_DESTROY, H_REMOVE, H_RTOHAND, H_TODECK, H_CONTROL, H_ATTACKTARGET, 530]);
export const HINTS_BUENO = new Set([H_ATOHAND, H_SUMMON, H_SPSUMMON, H_SET, H_EQUIP, 514, 522, 527, 529]);

/** py _TAGS order: bit i of Card.tags = TAG_NAMES[i]. */
export const TAG_NAMES = ["nuke_opp", "nuke_all", "storm_opp", "storm_all", "control", "negate", "on_attack", "on_summon",
  "draw", "burn", "heal", "revive", "search", "stall", "boost", "weaken", "bounce", "destroy_monster", "destroy_st",
  "destroy_any", "fusion", "ritual", "pay_half"] as const;
export type Tag = (typeof TAG_NAMES)[number];
export const T = Object.fromEntries(TAG_NAMES.map((n, i) => [n, 1 << i])) as Record<Tag, number>;
export const tagMask = (...names: Tag[]) => names.reduce((m, n) => m | T[n], 0);

export const TAGS_NO_BOOST = tagMask("control", "weaken", "destroy_monster", "destroy_any", "bounce", "stall", "negate",
  "nuke_opp", "nuke_all", "revive");
export const HARMFUL_TAGS = tagMask("nuke_opp", "nuke_all", "storm_opp", "storm_all", "control", "destroy_monster",
  "destroy_st", "destroy_any", "bounce", "burn", "weaken", "stall", "negate", "draw", "revive", "boost");

const F_FLIP = 1, F_SWITCH = 2, F_TEMPORAL = 4, F_TOKEN = 8;

export class Card {
  constructor(
    readonly code: number, readonly type: number, readonly atk: number, readonly deff: number, readonly level: number,
    readonly race: number, readonly attribute: number, readonly alias: number,
    readonly setcode: number | string, readonly tags: number, private readonly flags: number,
  ) {}
  get is_monster() { return (this.type & TYPE_MONSTER) !== 0; }
  get is_spell() { return (this.type & TYPE_SPELL) !== 0; }
  get is_trap() { return (this.type & TYPE_TRAP) !== 0; }
  /** type & TYPE_FLIP or the text starts with "flip:" */
  get is_flip() { return (this.flags & F_FLIP) !== 0; }
  get is_extra() { return (this.type & TYPE_EXTRA) !== 0; }
  /** "switch" in desc.lower() */
  get descSwitch() { return (this.flags & F_SWITCH) !== 0; }
  /** _RX_TEMPORAL.search(desc.lower()) */
  get descTemporal() { return (this.flags & F_TEMPORAL) !== 0; }
  /** "token" in desc.lower() */
  get descToken() { return (this.flags & F_TOKEN) !== 0; }
  has(t: Tag) { return (this.tags & T[t]) !== 0; }
  any(mask: number) { return (this.tags & mask) !== 0; }
  tributes(): number {
    if (!this.is_monster || this.is_extra) return 0;
    return this.level <= 4 ? 0 : this.level <= 6 ? 1 : 2;
  }
}

export interface BrainCardsJson {
  tags: string[];
  cards: [number, number, number, number, number, number, number, number, number | string, number, number][];
}

/** py int(code) for what reaches CardDB.get: int, integral float, decimal string; anything else -> None. */
function pyIntKey(code: unknown): number | undefined {
  if (typeof code === "number") return Number.isFinite(code) ? Math.trunc(code) : undefined;
  if (typeof code === "boolean") return code ? 1 : 0;
  if (typeof code === "bigint") return Number(code);
  if (typeof code === "string" && /^\s*[+-]?\d+(_\d+)*\s*$/.test(code)) return Number(code.replace(/_/g, ""));
  return undefined;
}

export class CardDB {
  private static _shared: CardDB | null = null;
  /** py CardDB.cards (insertion order = cards.cdb row order: ANNOUNCE_CARD walks it). */
  readonly cards = new Map<number, Card>();

  constructor(data: BrainCardsJson) {
    if (data.tags.length !== TAG_NAMES.length || data.tags.some((t, i) => t !== TAG_NAMES[i]))
      throw new Error("brain_cards.json: tag list differs from the brain's (regenerate with scripts/brain_gamedata.py)");
    for (const [code, type, atk, df, lvl, race, attr, alias, setcode, tags, flags] of data.cards)
      this.cards.set(code, new Card(code, type, atk, df, lvl, race, attr, alias, setcode, tags, flags));
  }

  /** The host loads it once (py CardDB.shared()). */
  static setShared(db: CardDB) { CardDB._shared = db; }
  static shared(): CardDB {
    if (!CardDB._shared) throw new Error("CardDB.shared(): call CardDB.setShared(new CardDB(brain_cards.json)) first");
    return CardDB._shared;
  }

  get(code: unknown): Card | undefined {
    const k = pyIntKey(code);
    return k === undefined ? undefined : this.cards.get(k);
  }
}

// ANNOUNCE_CARD opcodes (EDOPro constant.lua, 64 bits)
const OP_LIST: [string, number][] = [
  ["ADD", 0x0], ["SUB", 0x1], ["MUL", 0x2], ["DIV", 0x3], ["AND", 0x4], ["OR", 0x5], ["NEG", 0x6], ["NOT", 0x7],
  ["BAND", 0x8], ["BOR", 0x9], ["BNOT", 0x10], ["BXOR", 0x11], ["LSHIFT", 0x12], ["RSHIFT", 0x13],
  ["ALLOW_ALIASES", 0x14], ["ALLOW_TOKENS", 0x15], ["ISCODE", 0x100], ["ISSETCARD", 0x101], ["ISTYPE", 0x102],
  ["ISRACE", 0x103], ["ISATTRIBUTE", 0x104], ["GETCODE", 0x105], ["GETSETCARD", 0x106], ["GETTYPE", 0x107],
  ["GETRACE", 0x108], ["GETATTRIBUTE", 0x109]];
export const OP: Record<string, bigint> = Object.fromEntries(OP_LIST.map(([n, i]) => [n, (0x40000000n + BigInt(i)) << 32n]));
const OP_BY_VALUE = new Map<bigint, string>(Object.entries(OP).map(([k, v]) => [v, k]));

/** py int(x) of a select's opcode (duelcore sends bigints that do not fit in 53 bits as strings). */
export function toBigInt(x: unknown): bigint {
  if (typeof x === "bigint") return x;
  if (typeof x === "number") return BigInt(Math.trunc(x));
  if (typeof x === "boolean") return x ? 1n : 0n;
  return BigInt(String(x).trim());
}

const floorDiv = (x: bigint, y: bigint) => { const q = x / y; return (x % y !== 0n && (x < 0n) !== (y < 0n)) ? q - 1n : q; };
const shiftCount = (y: bigint) => { if (y < 0n) throw new RangeError("negative shift count"); return y; };

/** py declarable(c, ops): evaluates the ANNOUNCE_CARD opcodes (a stack, like EDOPro's core) on a card. */
export function declarable(c: Card, ops: bigint[]): boolean {
  if (c.type & TYPE_TOKEN || c.alias) {
    const allowAlias = ops.includes(OP.ALLOW_ALIASES), allowTok = ops.includes(OP.ALLOW_TOKENS);
    if ((c.type & TYPE_TOKEN && !allowTok) || (c.alias && !allowAlias)) return false;
  }
  const st: bigint[] = [];
  const pop = () => (st.length ? st.pop()! : 0n);
  const b = (v: boolean) => (v ? 1n : 0n);
  const code = BigInt(c.code), alias = BigInt(c.alias), type = BigInt(c.type), race = BigInt(c.race), attr = BigInt(c.attribute);
  for (const op of ops) {
    const name = OP_BY_VALUE.get(op);
    if (name === undefined) { st.push(op); continue; }
    switch (name) {
      case "ADD": case "SUB": case "MUL": case "DIV": case "AND": case "OR": case "BAND": case "BOR": case "BXOR":
      case "LSHIFT": case "RSHIFT": {
        const y = pop(), x = pop();
        let r: bigint;
        switch (name) {
          case "ADD": r = x + y; break;
          case "SUB": r = x - y; break;
          case "MUL": r = x * y; break;
          case "DIV": r = y ? floorDiv(x, y) : 0n; break;
          case "AND": r = b(x !== 0n && y !== 0n); break;
          case "OR": r = b(x !== 0n || y !== 0n); break;
          case "BAND": r = x & y; break;
          case "BOR": r = x | y; break;
          case "BXOR": r = x ^ y; break;
          case "LSHIFT": r = x << shiftCount(y); break;
          default: r = x >> shiftCount(y); break;
        }
        st.push(r);
        break;
      }
      case "NEG": st.push(-pop()); break;
      case "NOT": st.push(b(pop() === 0n)); break;
      case "BNOT": st.push(~pop()); break;
      case "ISCODE": { const v = pop(); st.push(b(code === v || alias === v)); break; }
      case "ISSETCARD": {
        const v = pop();
        let sc = toBigInt(c.setcode), hit = false;
        while (sc) {   // py `while sc:` (a negative setcode never happens: cards.cdb stores it unsigned)
          const part = sc & 0xffffn;
          if (part && (part & 0xfffn) === (v & 0xfffn) && (part & v) === v) hit = true;
          sc >>= 16n;
          if (sc === -1n) break;
        }
        st.push(b(hit));
        break;
      }
      case "ISTYPE": st.push(b((type & pop()) !== 0n)); break;
      case "ISRACE": st.push(b((race & pop()) !== 0n)); break;
      case "ISATTRIBUTE": st.push(b((attr & pop()) !== 0n)); break;
      case "GETCODE": st.push(code); break;
      case "GETTYPE": st.push(type); break;
      case "GETRACE": st.push(race); break;
      case "GETATTRIBUTE": st.push(attr); break;
      case "GETSETCARD": st.push(toBigInt(c.setcode)); break;
      default: break;   // ALLOW_ALIASES / ALLOW_TOKENS leave the stack alone
    }
  }
  return st.length === 1 && st[0] !== 0n;
}
