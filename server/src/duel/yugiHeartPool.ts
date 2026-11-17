import DJ from "../../gamedata/duel.json";
import CJ from "../../gamedata/cards.json";
import BC from "../../gamedata/brain_cards.json";

/** Whole supported client pool, with obvious rival-character archetypes excluded.
 * Generic spells/traps, classic monsters and the Egyptian Gods remain eligible.
 * The virtual pool excludes Exodia/alternate-win packages: this boss wins through Yugi's duel plans. */
const OFF_THEME = /hero|neo[ -]?spac|\bneos\b|skyscraper|cyberdark|cyber dragon|chimeratech|cyber angel|cyber blader|blade skater|etoile cyber|cyber tutu|cyber gymnast|cyber prima|crystal beast|rainbow dragon|rainbow dark dragon|rainbow ruins|ancient gear|harpie|amazoness|gladiator beast|lightsworn|arcana force|volcanic|ojama|cloudian|\balien\b|venom|\btoon\b|blue-eyes|blue eyes|relinquished|black illusion ritual|armed dragon|x-head cannon|y-dragon head|z-metal tank|v-tiger jet|w-wing catapult|xyz-dragon cannon|vwxyz|water dragon|ro[yi]d\b|sacred beast|uria,|hamon,|raviel,|destiny end dragoon|a-to-z|spyral|infernity|blackwing/i;
const types = new Map((BC.cards as number[][]).map(c => [c[0]!, c[1]!]));
const aliases = new Map((BC.cards as number[][]).map(c => [c[0]!, c[7]!]));
const ALT_WIN = /exodia|forbidden one|exodius|destiny board|spirit message|final countdown|last turn|victory dragon|reversal quiz|self-destruct button|exchange of the spirit/i;
const supported = new Set(Object.keys(DJ.cards).map(Number));
const names = new Map<string, number>();
for (const c of [...CJ].sort((a, b) => a.pc - b.pc)) {
  // Native ANNOUNCE_CARD accepts original passcodes, not alternate-art aliases.
  const pc = aliases.get(c.pc) || c.pc;
  const type = types.get(pc) ?? 0;
  if (!c.name || aliases.get(pc) || !supported.has(pc) || !(type & 7) || (type & (0x40 | 0x2000 | 0x4000 | 0x800000 | 0x4000000)) || OFF_THEME.test(c.name) || ALT_WIN.test(c.name)) continue;
  const name = c.name.toLowerCase();
  if (!names.has(name)) names.set(name, pc);
}
export const YUGI_HEART_POOL: readonly number[] = [...new Set(names.values())];
/** A private, semantically true opcode suffix identifies only the skill's own announcement. */
export const YUGI_HEART_MARKER = 0x59475549;
