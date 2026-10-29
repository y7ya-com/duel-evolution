// The translator's card facts, by passcode (the card wire: the client's codec maps passcodes to its own ids), from
// gamedata/translator.json: the client's card table (which passcodes it has), cards.cdb, and the chainable effects of
// each CardScripts script.

export interface TranslatorData {
  /** The passcodes of the client's card table (client/recomp/rt/cardwire.cpp, tools/cardart.py `table`): the cards
   *  the 2008 client has, alternate arts under their own ids. */
  wire: number[];
  /** FNV-1a of that table file: the card wire's hello compares it with the client's. */
  wireHash: number;
  /** code -> [type, alias, atk, def, race, attribute, setcode (number or decimal string), in brain.CardDB 0/1] */
  cdb: Record<string, [number, number, number, number, number, number, number | string, number]>;
  /** code -> chainable effects [type, code, hint mine, hint opp, desc] */
  scripts: Record<string, [number | null, number | null, number, number, number | null][]>;
}

export interface ScriptEffect { type: number | null; code: number | null; hint: [number, number]; desc: number | null }
export interface DeclCard { code: number; type: bigint; alias: bigint; race: bigint; attribute: bigint; setcode: bigint }

const TYPE_TRAP = 0x4, TYPE_SPELL = 0x2;

export class CardMap {
  readonly wireCodes: Set<number>;
  readonly wireHash: number;
  readonly cdb_type = new Map<number, number>();
  readonly cdb_alias = new Map<number, number>();
  readonly cdb_stats = new Map<number, [number, number]>();
  private readonly cdb: TranslatorData["cdb"];
  private readonly scripts: TranslatorData["scripts"];
  private readonly scriptCache = new Map<number, { effects: ScriptEffect[] } | null>();

  constructor(data: TranslatorData) {
    this.wireCodes = new Set(data.wire);
    this.wireHash = data.wireHash >>> 0;
    this.cdb = data.cdb;
    this.scripts = data.scripts;
    for (const [k, v] of Object.entries(data.cdb)) {
      const code = Number(k);
      this.cdb_type.set(code, v[0]);
      this.cdb_alias.set(code, v[1]);
      this.cdb_stats.set(code, [v[2], v[3]]);
    }
  }

  /** The passcode the client's card table has for this card: its own, else (an alternate art it lacks) its alias. */
  wire(code: number | null | undefined): number | null {
    if (code == null) return null;
    if (this.wireCodes.has(code)) return code;
    const a = this.cdb_alias.get(code);
    return a && this.wireCodes.has(a) ? a : null;
  }

  /** The card's base passcode (an alternate art's alias): the key of the translator's rule tables (consts.ts). */
  rulesKey(code: number): number { return this.cdb_alias.get(code) || code; }

  /** Printed (ATK, DEF) from cards.cdb, or null. */
  stats(code: number | null | undefined): [number, number] | null {
    if (code != null && this.cdb_stats.has(code)) return this.cdb_stats.get(code)!;
    const a = code != null ? this.cdb_alias.get(code) ?? 0 : 0;
    return this.cdb_stats.get(a) ?? null;
  }

  kind(code: number | null | undefined): "monster" | "spell" | "trap" {
    let t = code != null ? this.cdb_type.get(code) : undefined;
    if (!t) t = this.cdb_type.get(code != null ? this.cdb_alias.get(code) ?? 0 : 0) ?? 0;
    return t & TYPE_TRAP ? "trap" : t & TYPE_SPELL ? "spell" : "monster";
  }

  /** translator.script_info(code): the chainable effects of c<code>.lua, or null without a script. */
  script_info(code: number): { effects: ScriptEffect[] } | null {
    if (this.scriptCache.has(code)) return this.scriptCache.get(code)!;
    const s = this.scripts[String(code)];
    const info = s === undefined ? null
      : { effects: s.map(([type, c, h0, h1, desc]) => ({ type, code: c, hint: [h0, h1] as [number, number], desc })) };
    this.scriptCache.set(code, info);
    return info;
  }

  /** brain.CardDB.get(code) fields used by brain.declarable (ANNOUNCE_CARD), or null. */
  decl_card(code: number): DeclCard | null {
    const v = this.cdb[String(code)];
    if (!v || !v[7]) return null;
    return { code, type: BigInt(v[0]), alias: BigInt(v[1]), race: BigInt(v[4]), attribute: BigInt(v[5]), setcode: BigInt(v[6]) };
  }
}
