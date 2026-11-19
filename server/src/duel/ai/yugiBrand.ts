/** Yugi's own cards (the anime/manga Duel Monsters era and his themed decks): his draw skill may bring these up to the
 * engine's three copies a duel. Every other card in the pool is a one-of for him (owner: Raigeki three times looks
 * nothing like Yugi; Dark Hole and his monsters can repeat). Names are lower case. */
const ON_BRAND = new Set([
  // monsters
  "dark magician", "dark magician girl", "dark magician of chaos", "dark magician knight", "magician of black chaos",
  "dark paladin", "dark sage", "skilled dark magician", "magician's valkyria", "breaker the magical warrior",
  "kuriboh", "watapon", "big shield gardna", "buster blader", "gaia the fierce knight", "swift gaia the fierce knight",
  "gaia the dragon champion", "curse of dragon", "celtic guardian", "obnoxious celtic guard", "summoned skull",
  "feral imp", "silver fang", "mammoth graveyard", "beaver warrior", "mystical elf", "giant soldier of stone",
  "horn imp", "gazelle the king of mythical beasts", "berfomet", "chimera the flying mythical beast",
  "alpha the magnet warrior", "beta the magnet warrior", "gamma the magnet warrior", "valkyrion the magna warrior",
  "king's knight", "queen's knight", "jack's knight", "black luster soldier", "black luster soldier - envoy of the beginning",
  "gandora the dragon of destruction", "catapult turtle", "electromagnetic turtle", "slifer the sky dragon",
  "obelisk the tormentor", "the winged dragon of ra", "old vindictive magician", "apprentice magician",
  // spells
  "dark hole", "de-spell", "monster reborn", "polymerization", "de-fusion", "swords of revealing light", "change of heart",
  "brain control", "multiply", "book of secret arts", "thousand knives", "magical dimension", "dark magic attack",
  "dark magic curtain", "black luster ritual", "black magic ritual", "ancient rules", "mystic box", "dimension magic",
  "magic formula", "monster reincarnation", "sage's stone", "magician's unite", "lightforce sword", "black pendant",
  "monster recovery", "double spell", "ring of magnetism", "pot of greed",
  // traps
  "mirror force", "magic cylinder", "spellbinding circle", "magical hats", "dark spirit of the silent",
  "nightmare's steelcage", "magician's circle",
]);

/** How many copies of this card Yugi's draw skill may give him in one duel. */
export const yugiCopyLimit = (name: string): number => ON_BRAND.has(name) ? 3 : 1;

/** Owner: the lightest card that does the job: Smashing Ground for one monster, Dark Hole for several, Raigeki only
 * when Yugi would lose without it. Listed cards keep this order whoever's they are; any other card weighs 0 if it
 * is Yugi's own and 10 if not. */
const WEIGHT: Record<string, number> = {
  // De-Spell takes one Spell, MST any Spell or Trap: the lighter answer to a Messenger of Peace (owner)
  "de-spell": 4,
  "smashing ground": 5, "fissure": 5, "hammer shot": 5, "mystical space typhoon": 5, "dust tornado": 5, "book of moon": 5,
  "change of heart": 6, "brain control": 6, "snatch steal": 12,
  "dark hole": 15, "lightning vortex": 15, "torrential tribute": 15,
  "raigeki": 30, "heavy storm": 30, "giant trunade": 30, "harpie's feather duster": 30,
};

/** Board wipes Yugi draws only when every other draw leaves him losing (owner: Raigeki on one monster confuses players). */
export const YUGI_LAST_RESORT = new Set(["raigeki", "heavy storm", "giant trunade", "harpie's feather duster"]);

/** Lower is lighter (#lightestFit in heuristicBot.ts). */
export const yugiDrawWeight = (name: string): number => WEIGHT[name] ?? (ON_BRAND.has(name) ? 0 : 10);
