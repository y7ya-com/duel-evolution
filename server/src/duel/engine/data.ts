// Engine data, runtime-agnostic (no fs, no sqlite): the card table, the card/system texts and the Lua scripts, built
// by scripts/engine_gamedata.mjs into gamedata/engine/ and handed in by the host (node.ts reads the files; a Worker
// gets them from its bundle / R2). Ports of YOLaucher-web apps/server/src/duel/{data,strings}.ts (CardDB.describe,
// SystemStrings) and duelcore.mts's script lookup (scripts_2008 first, then the CardScripts index).
import { inflateRawSync } from "node:zlib";
import type { OcgCardData } from "ocgcore-wasm";

/** gamedata/engine/cards.json */
export interface CardsJson {
  /** [code, alias, setcodes, type, level, attribute, race (decimal), attack, defense, lscale, rscale, link_marker] */
  cards: [number, number, number[], number, number, number, string, number, number, number, number, number][];
  /** code -> [name, str1, str2, ...] (trailing empty strings dropped) */
  texts: Record<string, string[]>;
}

/** gamedata/engine/strings.json */
export interface StringsJson {
  system: Record<string, string>;
}

/**
 * EDOPro system texts (strings.conf "!system <id> <text>"): what ocgcore sends as a "description" or selection hint.
 * The usual ones are translated by hand (py's strings.ts); the rest stay in English. "%ls" = card name: left as
 * {{code}} for the client to fill in.
 */
const ES: Record<number, string> = {
  30: "Se ha repetido el ataque. ¿Seguir atacando?",
  31: "¿Atacar directamente?",
  32: "¿Hacer otra Fase de Batalla?",
  90: "¿Invocar de forma normal sin sacrificios?",
  91: "¿Usar tu Invocación Normal adicional?",
  92: "¿Usar un monstruo del rival?",
  93: "¿Seguir eligiendo materiales?",
  94: "¿Activar ahora el efecto de esta carta?",
  95: "¿Usar el efecto de «%ls»?",
  96: "¿Usar el efecto de «%ls» para evitar la destrucción?",
  97: "¿Colocar «%ls» en la Zona de Magia y Trampa?",
  98: "¿Aplicar un efecto que sustituye el coste?",
  200: "¿Usar el efecto de «%ls» desde [%ls]?",
  203: "¿Activar una carta o efecto?",
  205: "Elige el orden (de arriba abajo)",
  206: "Elige el orden de la cadena",
  210: "¿Seguir eligiendo cartas?",
  221: "¿Activar el efecto de activación de «%ls» desde [%ls]?",
  222: "¿Activar un efecto de activación?",
  500: "Elige qué sacrificar",
  501: "Elige qué descartar",
  502: "Elige qué destruir",
  503: "Elige qué desterrar",
  504: "Elige qué mandar al cementerio",
  505: "Elige qué devolver a la mano",
  506: "Elige qué añadir a tu mano",
  507: "Elige qué devolver al mazo",
  508: "Elige qué invocar de forma normal",
  509: "Elige qué invocar de forma especial",
  510: "Elige qué colocar en el campo",
  511: "Elige los materiales de fusión",
  514: "Elige una carta boca arriba",
  515: "Elige una carta boca abajo",
  516: "Elige un monstruo en posición de ataque",
  517: "Elige un monstruo en posición de defensa",
  518: "Elige a qué equipar",
  520: "Elige el monstruo del que tomar el control",
  522: "Elige un monstruo boca arriba en ataque",
  523: "Elige un monstruo boca arriba en defensa",
  526: "Elige qué cartas mostrar",
  527: "Elige qué colocar en el campo",
  528: "Elige un monstruo para cambiar su posición",
  529: "Elige una carta tuya",
  530: "Elige una carta del rival",
  531: "Elige los sacrificios",
  549: "Elige el objetivo del ataque",
  550: "Elige el efecto que quieres activar",
  551: "Elige el objetivo del efecto",
  552: "Elige cara o cruz",
  555: "Elige una opción",
  556: "Elige el efecto que se aplica",
  560: "Elige",
  561: "Elige la posición de batalla",
  566: "Elige el efecto que activar",
  568: "Elige la carta que se resuelve",
  572: "Elige dónde poner un contador",
  573: "Añadir a tu mano",
  574: "Mandar al cementerio",
};

export class CardDB {
  private cards = new Map<number, OcgCardData>();
  private texts = new Map<number, { name: string; strings: string[] }>();
  private system = new Map<number, string>();

  constructor(cards: CardsJson, strings: StringsJson) {
    for (const [code, alias, setcodes, type, level, attribute, race, attack, defense, lscale, rscale, link_marker] of cards.cards) {
      // same key order as data.ts (it shows in the `cardinfo` event)
      this.cards.set(code, { code, alias, setcodes, type, level, attribute, race: BigInt(race), attack, defense, lscale, rscale, link_marker } as OcgCardData);
    }
    for (const [k, [name, ...strings]] of Object.entries(cards.texts)) this.texts.set(Number(k), { name, strings });
    for (const [k, v] of Object.entries(strings.system)) this.system.set(Number(k), v);
  }

  get(code: number): OcgCardData | null {
    return this.cards.get(code) ?? null;
  }

  name(code: number): string {
    return this.texts.get(code)?.name ?? `#${code}`;
  }

  /** System text with the first %ls -> {{code}} (or «esta carta» without a card); the second one (a zone) dropped. */
  private systemText(id: number, code?: number): string | undefined {
    const s = ES[id] ?? this.system.get(id);
    if (!s) return undefined;
    let first = true;
    return s.replace(/%ls/g, () => {
      if (!first) return "";
      first = false;
      return code ? `{{${code}}}` : "esta carta";
    }).replace(/ desde \[\]| from \[\]/g, "");
  }

  /** Text of an ocgcore "description": aux.Stringid(code, i) = code << 20 | i, else a system string. */
  describe(desc: bigint | number, card?: number): string {
    const d = BigInt(desc);
    const code = Number(d >> 20n);
    const idx = Number(d & 0xfffffn);
    if (code > 0) return this.texts.get(code)?.strings[idx] || `{{${code}}} (${idx + 1})`;
    return this.systemText(idx, card) ?? `Opción ${idx}`;
  }

  get size() {
    return this.cards.size;
  }
}

const MAGIC = "YO2SPK1\n";

/**
 * gamedata/engine/scripts.pack: CardScripts by basename plus py's scripts_2008 overrides, deflate-raw per script and
 * inflated on demand (node:zlib, also under workerd's nodejs_compat), so only the compressed pack stays resident.
 */
export class ScriptPack {
  private data: Uint8Array;
  private base: Record<string, [number, number]>;
  private y2008: Record<string, [number, number]>;
  private cache = new Map<string, string | null>();
  // ignoreBOM: keep a leading U+FEFF, as readFileSync(p, "utf8") does
  private dec = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });

  constructor(pack: Uint8Array) {
    const head = new TextDecoder("latin1").decode(pack.subarray(0, 8));
    if (head !== MAGIC) throw new Error("scripts.pack: bad magic (rebuild with scripts/engine_gamedata.mjs)");
    const n = new DataView(pack.buffer, pack.byteOffset + 8, 4).getUint32(0, true);
    const index = JSON.parse(this.dec.decode(pack.subarray(12, 12 + n))) as { base: Record<string, [number, number]>; y2008: Record<string, [number, number]> };
    this.base = index.base;
    this.y2008 = index.y2008;
    this.data = pack.subarray(12 + n);
  }

  private load(e: [number, number] | undefined): string | null {
    if (!e) return null;
    return this.dec.decode(inflateRawSync(this.data.subarray(e[0], e[0] + e[1])));
  }

  private get(where: "base" | "y2008", name: string): string | null {
    const file = name.split(/[\\/]/).pop()!;
    const k = `${where}:${file}`;
    if (this.cache.has(k)) return this.cache.get(k)!;
    const src = this.load(where === "base" ? this.base[file] : this.y2008[file]);
    this.cache.set(k, src);
    return src;
  }

  /** CardScripts only (data.ts ScriptStore.read): constant.lua and utility.lua are loaded through this. */
  read(name: string): string | null {
    return this.get("base", name);
  }

  /** duelcore's scriptReader: the 2008 script if there is one, then CardScripts. */
  read2008(name: string): string | null {
    const file = name.split(/[\\/]/).pop()!;
    if (/^c\d+\.lua$/.test(file) && Object.hasOwn(this.y2008, file)) return this.get("y2008", file);
    return this.read(name);
  }

  /** Passcodes with a 2008 script, sorted (duelcore's `ready.scripts_2008`). */
  get scripts2008(): number[] {
    return Object.keys(this.y2008).map((f) => Number(f.slice(1, -4))).sort((a, b) => a - b);
  }
}
