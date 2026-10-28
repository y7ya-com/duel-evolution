// Builds the duel engine's data into server/gamedata/engine/ (gitignored: EDOPro/ProjectIgnis data, AGPL):
//
//   cards.json    cards.cdb `datas` as the OcgCardData the core reads, plus `texts` (name + str1..str16)
//   strings.json  strings.conf `!system` lines (id -> English text)
//   scripts.pack  every CardScripts .lua by basename (same resolution as YOLaucher-web apps/server/src/duel/data.ts
//                 ScriptStore) plus py's duelcore/scripts_2008 overrides, each deflate-raw compressed
//
//   nice node scripts/engine_gamedata.mjs [path/to/YOLaucher-web]
//
// It mirrors duelcore's loaders (data.ts CardDB/ScriptStore, strings.ts, duelcore.mts scripts2008) so the engine sees
// exactly the same bytes. Pack layout: "YO2SPK1\n", u32 LE index length, index JSON (utf8), then the entries.
// Index = { base: {name: [offset, length]}, y2008: {name: [offset, length]} } with offsets relative to the entry area.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "gamedata", "engine");
const YL = resolve(process.argv[2] ?? join(process.env.HOME ?? "", "Documents", "GitHub", "YOLaucher-web"));
// data.ts: VENDOR = resolve(apps/server/src/duel, "../../../../_vendor") (VENDOR_DIR unset, as py starts duelcore)
const VENDOR = resolve(YL, "apps", "server", "src", "duel", "../../../../_vendor");
const Y2008 = join(YL, "tools", "yo2emu", "duelcore", "scripts_2008");
const TYPE_LINK = 0x4000000;

mkdirSync(OUT, { recursive: true });

// ---- cards.cdb (data.ts CardDB)
{
  const db = new DatabaseSync(join(VENDOR, "cards.cdb"), { readOnly: true });
  const texts = {};
  const cols = Array.from({ length: 16 }, (_, i) => `str${i + 1}`).join(", ");
  for (const r of db.prepare(`select id, name, ${cols} from texts`).all()) {
    const strings = Array.from({ length: 16 }, (_, i) => String(r[`str${i + 1}`] ?? ""));
    while (strings.length && !strings[strings.length - 1]) strings.pop(); // describe() treats "" and missing alike
    texts[Number(r.id)] = [String(r.name), ...strings];
  }
  const stmt = db.prepare("select id, alias, setcode, type, atk, def, level, race, attribute from datas");
  stmt.setReadBigInts(true);
  const cards = [];
  for (const r of stmt.all()) {
    const type = Number(r.type);
    const level = Number(r.level);
    const setcodes = [];
    for (let s = BigInt(r.setcode); s > 0n; s >>= 16n) {
      const v = Number(s & 0xffffn);
      if (v) setcodes.push(v);
    }
    const isLink = (type & TYPE_LINK) !== 0;
    // [code, alias, setcodes, type, level, attribute, race (decimal string: 64-bit), attack, defense, lscale, rscale, link_marker]
    cards.push([Number(r.id), Number(r.alias), setcodes, type, level & 0xff, Number(r.attribute), BigInt(r.race).toString(),
      Number(r.atk), isLink ? 0 : Number(r.def), (level >> 24) & 0xff, (level >> 16) & 0xff, isLink ? Number(r.def) : 0]);
  }
  db.close();
  writeFileSync(join(OUT, "cards.json"), JSON.stringify({ cards, texts }));
  console.log(`gamedata/engine/cards.json: ${cards.length} cards, ${Object.keys(texts).length} texts`);
}

// ---- strings.conf (strings.ts SystemStrings: later lines win, like Map.set)
{
  const system = {};
  const path = join(VENDOR, "strings.conf");
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = /^!system (\d+) (.*)$/.exec(line);
      if (m) system[m[1]] = m[2];
    }
  }
  writeFileSync(join(OUT, "strings.json"), JSON.stringify({ system }));
  console.log(`gamedata/engine/strings.json: ${Object.keys(system).length} system strings`);
}

// ---- CardScripts (data.ts ScriptStore walk, same readdir order and the same "official" rule) + scripts_2008
{
  const root = join(VENDOR, "CardScripts");
  if (!existsSync(root)) throw new Error(`no CardScripts at ${root}`);
  const paths = new Map();
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".lua") && (!paths.has(f) || p.includes("official"))) paths.set(f, p);
    }
  };
  walk(root);
  const y2008 = new Map();
  if (existsSync(Y2008)) for (const f of readdirSync(Y2008)) if (/^c\d+\.lua$/.test(f)) y2008.set(f, join(Y2008, f));

  const chunks = [];
  let off = 0;
  let raw = 0;
  const add = (p) => {
    // ScriptStore/duelcore read with "utf8": keep that decoded text, re-encoded
    const src = Buffer.from(readFileSync(p, "utf8"), "utf8");
    raw += src.length;
    const z = deflateRawSync(src, { level: 9 });
    chunks.push(z);
    const e = [off, z.length];
    off += z.length;
    return e;
  };
  const index = { base: {}, y2008: {} };
  for (const [f, p] of [...paths].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) index.base[f] = add(p);
  for (const [f, p] of [...y2008].sort()) index.y2008[f] = add(p);
  const idx = Buffer.from(JSON.stringify(index), "utf8");
  const head = Buffer.alloc(12);
  head.write("YO2SPK1\n", 0, "latin1");
  head.writeUInt32LE(idx.length, 8);
  writeFileSync(join(OUT, "scripts.pack"), Buffer.concat([head, idx, ...chunks]));
  console.log(`gamedata/engine/scripts.pack: ${paths.size} scripts + ${y2008.size} 2008 overrides, ${(raw / 1e6).toFixed(1)} MB -> ${((off + idx.length) / 1e6).toFixed(1)} MB`);
}
