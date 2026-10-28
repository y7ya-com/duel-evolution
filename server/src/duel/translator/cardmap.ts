// py research/traductor/cardmap.py CardMap (YO2 id <-> internal id <-> ocgcore passcode), built from
// gamedata/translator.json (scripts/translator_gamedata.py dumps py's own CardMap, cards.cdb and the chainable effects
// of each CardScripts script, so the tables are exactly py's).

export interface TranslatorData {
  internal: number[];
  y2c: Record<string, number>;
  c2y: Record<string, number>;
  int2y: Record<string, number>;
  placeholders: Record<string, number>;
  /** code -> [type, alias, atk, def, race, attribute, setcode (number or decimal string), in brain.CardDB 0/1] */
  cdb: Record<string, [number, number, number, number, number, number, number | string, number]>;
  /** code -> chainable effects [type, code, hint mine, hint opp, desc] */
  scripts: Record<string, [number | null, number | null, number, number, number | null][]>;
}

export interface ScriptEffect { type: number | null; code: number | null; hint: [number, number]; desc: number | null }
export interface DeclCard { code: number; type: bigint; alias: bigint; race: bigint; attribute: bigint; setcode: bigint }

const TYPE_TRAP = 0x4, TYPE_SPELL = 0x2;

const toMap = (o: Record<string, number>): Map<number, number> => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]));

export class CardMap {
  readonly internal: number[];
  readonly _y2c: Map<number, number>;
  readonly _c2y: Map<number, number>;
  readonly _int2y: Map<number, number>;
  readonly placeholders: { monster: number; spell: number; trap: number };
  readonly cdb_type = new Map<number, number>();
  readonly cdb_alias = new Map<number, number>();
  readonly cdb_stats = new Map<number, [number, number]>();
  private readonly cdb: TranslatorData["cdb"];
  private readonly scripts: TranslatorData["scripts"];
  private readonly scriptCache = new Map<number, { effects: ScriptEffect[] } | null>();

  constructor(data: TranslatorData) {
    this.internal = data.internal;
    this._y2c = toMap(data.y2c);
    this._c2y = toMap(data.c2y);
    this._int2y = toMap(data.int2y);
    this.placeholders = data.placeholders as CardMap["placeholders"];
    this.cdb = data.cdb;
    this.scripts = data.scripts;
    for (const [k, v] of Object.entries(data.cdb)) {
      const code = Number(k);
      this.cdb_type.set(code, v[0]);
      this.cdb_alias.set(code, v[1]);
      this.cdb_stats.set(code, [v[2], v[3]]);
    }
  }

  yo2_to_code(yo2: number): number | null { return this._y2c.get(yo2) ?? null; }

  /** passcode -> YO2 id; an alternate art tries its alias. */
  code_to_yo2(code: number | null | undefined): number | null {
    if (code == null) return null;
    let y = this._c2y.get(code);
    if (y === undefined && this.cdb_alias.get(code)) y = this._c2y.get(this.cdb_alias.get(code)!);
    return y ?? null;
  }

  yo2_to_internal(yo2: number): number {
    return yo2 >= 0 && yo2 < this.internal.length ? this.internal[yo2] : 0;
  }

  internal_to_yo2(internal: number): number | null { return this._int2y.get(internal) ?? null; }

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
