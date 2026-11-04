// Game-derived output is private. This module contains conversion logic, never card records.
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = [[1, 'Monster'], [2, 'Spell'], [4, 'Trap'], [0x10, 'Normal'], [0x20, 'Effect'], [0x40, 'Fusion'], [0x80, 'Ritual'], [0x200, 'Spirit'], [0x400, 'Union'], [0x800, 'Gemini'], [0x1000, 'Tuner'], [0x2000, 'Synchro'], [0x4000, 'Token'], [0x10000, 'Quick-Play'], [0x20000, 'Continuous'], [0x40000, 'Equip'], [0x80000, 'Field'], [0x100000, 'Counter'], [0x200000, 'Flip'], [0x400000, 'Toon'], [0x800000, 'Xyz'], [0x1000000, 'Pendulum'], [0x2000000, 'Special Summon'], [0x4000000, 'Link']];
const RACES = ['Warrior', 'Spellcaster', 'Fairy', 'Fiend', 'Zombie', 'Machine', 'Aqua', 'Pyro', 'Rock', 'Winged Beast', 'Plant', 'Insect', 'Thunder', 'Dragon', 'Beast', 'Beast-Warrior', 'Dinosaur', 'Fish', 'Sea Serpent', 'Reptile', 'Psychic', 'Divine-Beast', 'Creator God', 'Wyrm', 'Cyberse', 'Illusion'];
const ATTRIBUTES = ['Earth', 'Water', 'Fire', 'Wind', 'Light', 'Dark', 'Divine'];
function uint(n, max = 0xffffffff) { return Number.isSafeInteger(n) && n >= 0 && n <= max; }
function need(ok, message) { if (!ok) throw new Error(message); }
function labels(bits, values) {
  let known = 0n;
  const names = [];
  for (const [bit, label] of values) if ((bits & BigInt(bit)) !== 0n) { names.push(label); known |= BigInt(bit); }
  const unknown = bits & ~known;
  if (unknown) names.push(`Unknown (0x${unknown.toString(16)})`);
  return names.join(' / ');
}
const flagLabels = names => names.map((name, i) => [1n << BigInt(i), name]);

/** No filesystem side effects; accepts optional read-only CDB text rows. */
export function buildCardDetails(original, duel, engine, descriptions = []) {
  need(Array.isArray(original) && original.length <= 4095, 'Invalid original card mapping');
  need(duel?.ids === 'passcode' && duel.cards && typeof duel.cards === 'object' && !Array.isArray(duel.cards), 'Expected passcode-keyed duel metadata');
  need(Array.isArray(engine?.cards) && engine.cards.length <= 100000 && engine.texts && typeof engine.texts === 'object' && !Array.isArray(engine.texts), 'Invalid engine data');
  need(Array.isArray(descriptions) && descriptions.length <= 100000, 'Invalid CDB description collection');
  const byCode = new Map(), byDescription = new Map(), seenCode = new Set(), seenId = new Set();
  for (const row of engine.cards) {
    need(Array.isArray(row) && row.length >= 9 && uint(row[0]) && row[0] > 0 && !byCode.has(row[0]), 'Ambiguous engine card identity');
    byCode.set(row[0], row);
  }
  for (const row of descriptions) {
    need(uint(row.id) && row.id > 0 && typeof row.desc === 'string' && row.desc.length <= 32768 && !byDescription.has(row.id), 'Invalid CDB text');
    byDescription.set(row.id, row.desc);
  }
  return original.map(c => {
    need(c && uint(c.i, 4095) && c.i > 0 && uint(c.pc) && c.pc > 0 && uint(c.internal, 65535) && c.internal > 0 && !seenCode.has(c.pc) && !seenId.has(c.i), 'Ambiguous original card identity');
    seenCode.add(c.pc); seenId.add(c.i);
    const row = byCode.get(c.pc), texts = engine.texts[c.pc], rule = duel.cards[c.pc];
    need(texts === undefined || (Array.isArray(texts) && texts.length <= 17 && texts.every(t => typeof t === 'string' && t.length <= 32768)), 'Invalid engine text');
    const name = texts?.[0]?.trim() ? texts[0] : typeof c.name === 'string' && c.name.trim() ? c.name : `Card ${c.pc}`;
    need(name.length <= 512, 'Card name exceeds budget');
    const out = { passcode: c.pc, legacyId: c.i, internalId: c.internal, name };
    // str1..str16 are effect-selection prompts, never the rules description.
    if (texts?.length > 1) out.effectTexts = texts.slice(1);
    const desc = byDescription.get(c.pc);
    if (desc?.trim()) { out.description = desc; out.descriptionSource = 'cards.cdb'; }
    if (row) {
      need(uint(row[3]) && uint(row[4], 255) && uint(row[5]) && typeof row[6] === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(row[6]) && BigInt(row[6]) <= 0xffffffffffffffffn && [row[7], row[8]].every(v => Number.isSafeInteger(v) && v >= -2 && v <= 0x7fffffff), 'Invalid engine statistics');
      Object.assign(out, { typeBits: row[3], type: labels(BigInt(row[3]), TYPES), level: row[4], attributeBits: row[5], attribute: labels(BigInt(row[5]), flagLabels(ATTRIBUTES)), raceBits: row[6], race: labels(BigInt(row[6]), flagLabels(RACES)), attack: row[7], defense: row[8], extra: !!(row[3] & (0x40 | 0x2000 | 0x800000 | 0x4000000)) });
    }
    if (rule !== undefined) {
      need(Array.isArray(rule) && (uint(rule[1], 3) || rule[1] === 65535), 'Invalid 2008 ban limit');
      // 65535 is the server's NO_DECK sentinel; it is not a 65535-copy allowance.
      out.deckAllowed = rule[1] !== 65535;
      if (out.deckAllowed) out.limit = rule[1];
    }
    return out;
  });
}

function readJSON(path) {
  need(statSync(path).size <= 64 * 1024 * 1024, 'Source data exceeds budget');
  return JSON.parse(readFileSync(path, 'utf8'));
}
async function main(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    need(['--data', '--cdb', '--out'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--') && options[args[i]] === undefined, 'Usage: node tools/card-data.mjs [--data directory] [--cdb cards.cdb] [--out ignored-path]');
    options[args[i]] = args[i + 1];
  }
  const data = resolve(options['--data'] ?? process.env.DE_GAMEDATA ?? resolve(root, '../../server/gamedata'));
  const output = resolve(options['--out'] ?? resolve(root, 'public/card-details.json'));
  // Do not create private data that a subsequent git add could accidentally publish.
  const ignored = spawnSync('git', ['check-ignore', '--quiet', '--', output], { cwd: root });
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', output], { cwd: root, stdio: 'pipe' });
  need(ignored.status === 0 && tracked.status === 1, `Refusing game-derived output at an unignored/tracked path. Add public/card-details.json to client/experimental-ts/.gitignore (or use --out with an ignored path).`);
  let descriptions = [];
  const cdb = options['--cdb'] ?? process.env.DE_CARDS_CDB;
  if (cdb) {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(resolve(cdb), { readOnly: true });
    try { descriptions = db.prepare('SELECT id, desc FROM texts LIMIT 100001').all(); need(descriptions.length <= 100000, 'CDB exceeds card budget'); }
    finally { db.close(); }
  }
  const details = buildCardDetails(readJSON(resolve(data, 'cards.json')), readJSON(resolve(data, 'duel.json')), readJSON(resolve(data, 'engine/cards.json')), descriptions);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(details));
  console.log(`Generated ${details.length} private card details; ${details.filter(c => c.description).length} descriptions; ${details.filter(c => c.typeBits === undefined).length} without engine statistics. No descriptions are inferred from effect prompts.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
