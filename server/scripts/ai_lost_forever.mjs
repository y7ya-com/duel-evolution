// Builds src/duel/ai/lostForever.json: the 2008 pool's Main Deck monsters that cannot come back once they leave (Master
// Duel's CPU keeps them in hand: md-ai/port/D-costs.md §1.2 F1): a monster that must be properly summoned first
// (c:EnableReviveLimit: Dark Necrofear, Rituals, the LV monsters of a named card), one that cannot be Special Summoned
// at all (EFFECT_SPSUMMON_CONDITION with aux.FALSE) and every Spirit monster, read from the card scripts the engine runs
// (gamedata/engine/scripts.pack; a 2008 override wins). Same reading as scripts/ai_battle_proof.mjs.
//
//   node scripts/ai_lost_forever.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pack = readFileSync(join(root, "gamedata/engine/scripts.pack"));
if (pack.subarray(0, 8).toString() !== "YO2SPK1\n") throw new Error("scripts.pack: not a YO2SPK1 pack");
const n = pack.readUInt32LE(8);
const index = JSON.parse(pack.subarray(12, 12 + n).toString("utf8"));
const entries = 12 + n;
const read = (group, name) => {
  const at = index[group]?.[name];
  return at ? inflateRawSync(pack.subarray(entries + at[0], entries + at[0] + at[1])).toString("utf8") : null;
};

const TYPE_MONSTER = 0x1, TYPE_SPIRIT = 0x200, TYPE_EXTRA = 0x40 | 0x2000 | 0x800000 | 0x4000000;
const translator = JSON.parse(readFileSync(join(root, "gamedata/translator.json"), "utf8"));
const typeOf = (code) => translator.cdb[code]?.[0] ?? 0;
const pool = [...new Set(translator.wire)].filter((code) => (typeOf(code) & TYPE_MONSTER) && !(typeOf(code) & TYPE_EXTRA));
const lost = (code) => {
  if (typeOf(code) & TYPE_SPIRIT) return true;
  const src = read("y2008", `c${code}.lua`) ?? read("base", `c${code}.lua`);
  return !!src && (/EnableReviveLimit\(\)/.test(src) || /EFFECT_SPSUMMON_CONDITION[\s\S]{0,200}?aux\.FALSE/.test(src));
};
const codes = pool.filter(lost).sort((a, b) => a - b);
writeFileSync(join(root, "src/duel/ai/lostForever.json"), JSON.stringify({
  note: "Main Deck monsters that cannot come back once they leave (nomi, cannot be Special Summoned, Spirit): scripts/ai_lost_forever.mjs",
  codes,
}) + "\n");
console.log(`${codes.length} of ${pool.length} monsters`);
