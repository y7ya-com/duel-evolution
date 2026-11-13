// Builds src/duel/ai/battleProof.json: the passcodes of the 2008 card pool's monsters that cannot be destroyed by battle,
// read from the card scripts the engine runs (gamedata/engine/scripts.pack): an effect that registers
// EFFECT_INDESTRUCTABLE_BATTLE on the card itself (EFFECT_TYPE_SINGLE), with value 1 and no condition (Spirit Reaper,
// Marshmallon...). A conditional one (only in Defense Position, once per turn...) is left out: the battle model would
// trust it at the wrong time. The 2008 pool is the client's card table (gamedata/translator.json `wire`); a 2008
// override (y2008) wins over the current script.
// Also, from the same scripts:
//   - equips: Equip Spells whose equipped monster cannot be destroyed by battle (EFFECT_INDESTRUCTABLE_BATTLE) or has a
//     card destroyed in its place (EFFECT_DESTROY_SUBSTITUTE), unconditionally (Gladiator Beast's Battle Manica);
//   - battleTrigger: Gladiator Beasts, whose "if this card battled" effect a battle they survive sets off (production
//     attacked a Secutor it could not destroy and it brought out two more Gladiator Beasts);
//   - revenge: monsters whose destruction destroys a monster (a destroy target picked on its EVENT_DESTROYED /
//     EVENT_BATTLE_DESTROYED trigger: Newdoria): killing one in battle costs the attacker;
//   - pierce: monsters that deal piercing damage (EFFECT_PIERCE on themselves, unconditionally: Gravekeeper's Spear
//     Soldier);
//   - direct: monsters that can attack directly (EFFECT_DIRECT_ATTACK on themselves, unconditionally: Spell Striker).
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
const scriptOf = (code) => read("y2008", `c${code}.lua`) ?? read("base", `c${code}.lua`);
const codes = pool.filter((code) => {
  const src = scriptOf(code);
  return !!src && battleProof(src);
}).sort((a, b) => a - b);
const spells = [...new Set(translator.wire)].filter((code) => (translator.cdb[code]?.[0] ?? 0) & 2);
const equips = spells.filter((code) => {
  const src = scriptOf(code);
  return !!src && effects(src).some((e) => /SetType\(EFFECT_TYPE_EQUIP\)/.test(e)
    && /SetCode\(EFFECT_(INDESTRUCTABLE_BATTLE|DESTROY_SUBSTITUTE)\)/.test(e) && !/SetCondition\(/.test(e));
}).sort((a, b) => a - b);
const battleTrigger = pool.filter((code) => {
  const src = scriptOf(code);
  return !!src && /GetBattledGroupCount\(\)\s*>\s*0/.test(src) && /SET_GLADIATOR/.test(src);
}).sort((a, b) => a - b);
const pierce = pool.filter((code) => {
  const src = scriptOf(code);
  return !!src && effects(src).some((e) => /SetCode\(EFFECT_PIERCE\)/.test(e) && /SetType\(EFFECT_TYPE_SINGLE\)/.test(e) && !/SetCondition\(/.test(e));
}).sort((a, b) => a - b);
const direct = pool.filter((code) => {
  const src = scriptOf(code);
  return !!src && effects(src).some((e) => /SetCode\(EFFECT_DIRECT_ATTACK\)/.test(e) && /SetType\(EFFECT_TYPE_SINGLE\)/.test(e) && !/SetCondition\(/.test(e));
}).sort((a, b) => a - b);
const revenge = pool.filter((code) => {
  const src = scriptOf(code);
  return !!src && /LOCATION_MZONE/.test(src) && /HINTMSG_DESTROY/.test(src)
    && effects(src).some((e) => /EVENT_(BATTLE_)?DESTROYED/.test(e) && /CATEGORY_DESTROY/.test(e));
}).sort((a, b) => a - b);

writeFileSync(join(root, "src/duel/ai/battleProof.json"), JSON.stringify({
  note: "Monsters that cannot be destroyed by battle (unconditionally), the Equip Spells that make theirs so, the monsters whose surviving a battle triggers them, those whose destruction destroys a monster, and those that pierce, and those that attack directly: from the card scripts, scripts/ai_battle_proof.mjs",
  codes, equips, battleTrigger, revenge, pierce, direct,
}) + "\n");
console.log(`${codes.length} of ${pool.length} cards; ${equips.length} equips, ${battleTrigger.length} battle triggers, ${revenge.length} revenge, ${pierce.length} pierce, ${direct.length} direct`);
