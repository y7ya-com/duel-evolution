// Builds src/duel/ai/battleProof.json: the passcodes of the 2008 card pool's monsters that cannot be destroyed by battle,
// read from the card scripts the engine runs (gamedata/engine/scripts.pack): an effect that registers
// EFFECT_INDESTRUCTABLE_BATTLE on the card itself (EFFECT_TYPE_SINGLE), with value 1 and no condition (Spirit Reaper,
// Marshmallon...). A conditional one (only in Defense Position, once per turn...) is left out: the battle model would
// trust it at the wrong time. The 2008 pool is the client's card table (gamedata/translator.json `wire`); a 2008
// override (y2008) wins over the current script.
//
//   node scripts/ai_battle_proof.mjs
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

/** Each Effect.CreateEffect(c) block of a script, up to its c:RegisterEffect. */
function effects(src) {
  const out = [];
  const re = /local\s+(\w+)\s*=\s*Effect\.CreateEffect\(c\)([\s\S]*?)c:RegisterEffect\(\1\)/g;
  for (let m; (m = re.exec(src)); ) out.push(m[2]);
  return out;
}

const battleProof = (src) => effects(src).some((e) => /SetCode\(EFFECT_INDESTRUCTABLE_BATTLE\)/.test(e)
  && /SetType\(EFFECT_TYPE_SINGLE\)/.test(e) && /SetValue\(1\)/.test(e) && !/SetCondition\(/.test(e));

// the 2008 client's card table (translator.json `wire`), its monsters (cards.cdb type, translator.json `cdb`)
const translator = JSON.parse(readFileSync(join(root, "gamedata/translator.json"), "utf8"));
const pool = [...new Set(translator.wire)].filter((code) => (translator.cdb[code]?.[0] ?? 0) & 1);
const codes = pool.filter((code) => {
  const src = read("y2008", `c${code}.lua`) ?? read("base", `c${code}.lua`);
  return !!src && battleProof(src);
}).sort((a, b) => a - b);

writeFileSync(join(root, "src/duel/ai/battleProof.json"), JSON.stringify({
  note: "Monsters that cannot be destroyed by battle (unconditionally), from the card scripts: scripts/ai_battle_proof.mjs",
  codes,
}) + "\n");
console.log(`${codes.length} of ${pool.length} cards`);
