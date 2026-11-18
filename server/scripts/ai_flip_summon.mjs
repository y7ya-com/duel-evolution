// Builds src/duel/ai/flipSummon.json: the 2008 pool's Main Deck monsters whose own effect a Flip Summon triggers
// (EVENT_FLIP_SUMMON_SUCCESS on the card itself) but that carry no FLIP type: Swarm of Locusts, Stealth Bird, Swarm of
// Scarabs. They are played like flip monsters: set, then Flip Summoned for the effect (a face-up summon wastes it;
// production summoned Swarm of Locusts face-up into a 2300 attacker). Same reading of the card scripts as
// scripts/ai_on_summon.mjs.
//
//   node scripts/ai_flip_summon.mjs
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

const TYPE_MONSTER = 0x1, TYPE_FLIP = 0x200000, TYPE_EXTRA = 0x40 | 0x2000 | 0x800000 | 0x4000000;
const translator = JSON.parse(readFileSync(join(root, "gamedata/translator.json"), "utf8"));
const typeOf = (code) => translator.cdb[code]?.[0] ?? 0;
const pool = [...new Set(translator.wire)].filter((code) => (typeOf(code) & TYPE_MONSTER) && !(typeOf(code) & (TYPE_EXTRA | TYPE_FLIP)));

/** Each Effect.CreateEffect(c) block of a script, up to its c:RegisterEffect. */
function effects(src) {
  const out = [];
  const re = /local\s+(\w+)\s*=\s*Effect\.CreateEffect\(c\)([\s\S]*?)c:RegisterEffect\(\1\)/g;
  for (let m; (m = re.exec(src)); ) out.push(m[2]);
  return out;
}
// a trigger of the card itself on its own Flip Summon only (a Normal Summon does not trigger it too)
const onFlipSummon = (src) => {
  const own = effects(src).filter((e) => /EFFECT_TYPE_SINGLE/.test(e));
  return own.some((e) => /SetCode\(EVENT_FLIP_SUMMON_SUCCESS\)/.test(e)) && !own.some((e) => /SetCode\(EVENT_SUMMON_SUCCESS\)/.test(e));
};
const codes = pool.filter((code) => {
  const src = read("y2008", `c${code}.lua`) ?? read("base", `c${code}.lua`);
  return !!src && onFlipSummon(src);
}).sort((a, b) => a - b);
writeFileSync(join(root, "src/duel/ai/flipSummon.json"), JSON.stringify({
  note: "Main Deck monsters with no FLIP type whose own effect only a Flip Summon triggers (set them, flip them): scripts/ai_flip_summon.mjs",
  codes,
}) + "\n");
console.log(`${codes.length} of ${pool.length} monsters`);
