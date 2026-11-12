// Builds src/duel/ai/onSummon.json: the 2008 pool's Main Deck monsters with an effect of their own that their Normal
// Summon triggers (EVENT_SUMMON_SUCCESS on the card itself: Manju of the Ten Thousand Hands' search, Zaborg's
// destruction, Dark Red Enchanter's counters). Master Duel summons them face-up for it (its per-card effect-use
// table); set, the effect never happens. Same reading of the card scripts as scripts/ai_battle_proof.mjs.
//
//   node scripts/ai_on_summon.mjs
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

const TYPE_MONSTER = 0x1, TYPE_EXTRA = 0x40 | 0x2000 | 0x800000 | 0x4000000;
const translator = JSON.parse(readFileSync(join(root, "gamedata/translator.json"), "utf8"));
const typeOf = (code) => translator.cdb[code]?.[0] ?? 0;
const pool = [...new Set(translator.wire)].filter((code) => (typeOf(code) & TYPE_MONSTER) && !(typeOf(code) & TYPE_EXTRA));

/** Each Effect.CreateEffect(c) block of a script, up to its c:RegisterEffect. */
function effects(src) {
  const out = [];
  const re = /local\s+(\w+)\s*=\s*Effect\.CreateEffect\(c\)([\s\S]*?)c:RegisterEffect\(\1\)/g;
  for (let m; (m = re.exec(src)); ) out.push(m[2]);
  return out;
}
// a trigger of the card itself on its own Normal Summon (a search, a destruction, counters)
const onSummon = (src) => effects(src).some((e) => /SetCode\(EVENT_SUMMON_SUCCESS\)/.test(e) && /EFFECT_TYPE_SINGLE/.test(e));
const codes = pool.filter((code) => {
  const src = read("y2008", `c${code}.lua`) ?? read("base", `c${code}.lua`);
  return !!src && onSummon(src);
}).sort((a, b) => a - b);
writeFileSync(join(root, "src/duel/ai/onSummon.json"), JSON.stringify({
  note: "Main Deck monsters with an effect of their own that a Normal Summon triggers (summon them face-up): scripts/ai_on_summon.mjs",
  codes,
}) + "\n");
console.log(`${codes.length} of ${pool.length} monsters`);
