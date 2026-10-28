// Sign-in names (the User ID of the game's login dialog, for name + password accounts). Unique case-insensitively (the
// username plugin stores them lowercased), 3-16 chars, a letter first, then letters, digits, _ or -, minus reserved
// words and a profanity list.

export const NAME_MIN = 3;
export const NAME_MAX = 16;
export const NAME_RULES = `${NAME_MIN}-${NAME_MAX} letters, digits, _ or -, starting with a letter.`;

const SHAPE = new RegExp(`^[A-Za-z][A-Za-z0-9_-]{${NAME_MIN - 1},${NAME_MAX - 1}}$`);
/** Staff-looking names: refused exactly, or as a prefix for the long ones. */
const RESERVED_EXACT = ["gm", "mod", "bot", "npc", "root", "null", "guest", "owner", "server", "support", "undefined", "anonymous"];
const RESERVED_PREFIX = ["admin", "moderator", "staff", "official", "system", "gamemaster", "duelevolution", "konami"];
// ponytail: substring list after leetspeak folding; it misses creative spellings and the odd Scunthorpe, admins rename
const PROFANE = ["fuck", "shit", "cunt", "bitch", "nigg", "faggot", "whore", "slut", "rapist", "nazi", "hitler", "porn",
  "retard", "kike", "twat", "wank", "asshole", "penis", "vagina", "dildo", "jizz"];
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g" };

const fold = (s: string) => s.toLowerCase().replace(/[0-9]/g, (d) => LEET[d] ?? d).replace(/[_-]/g, "");

export function nameProblem(name: string): string | null {
  if (!SHAPE.test(name)) return `Names are ${NAME_RULES}`;
  const f = fold(name);
  if (RESERVED_EXACT.includes(f) || RESERVED_PREFIX.some((r) => f.startsWith(r))) return "That name is reserved.";
  if (PROFANE.some((w) => f.includes(w))) return "Please pick another name.";
  return null;
}
