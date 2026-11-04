// Generated display metadata is private game-derived data: output is ignored and never committed.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const data = resolve(process.env.DE_GAMEDATA || resolve(root, '../../server/gamedata'));
const engine = JSON.parse(readFileSync(resolve(data, 'engine/cards.json'), 'utf8'));
const original = JSON.parse(readFileSync(resolve(data, 'cards.json'), 'utf8'));
const byCode = new Map(engine.cards.map(c => [c[0], c]));
const catalog = original.map(c => {
  const row = byCode.get(c.pc), type = row?.[3] ?? 0;
  return { passcode: c.pc, name: typeof engine.texts[c.pc]?.[0] === 'string' && engine.texts[c.pc][0].trim() ? engine.texts[c.pc][0] : typeof c.name === 'string' && c.name.trim() ? c.name : `Card ${c.pc}`,
    type: type & 1 ? 'Monster' : type & 2 ? 'Spell' : type & 4 ? 'Trap' : 'Unknown',
    ...(row ? { level: row[4] & 255, attack: row[7], defense: row[8], extra: !!(type & (0x40 | 0x2000 | 0x800000 | 0x4000000)) } : {}),
    ...(c.big ? { mergePath: `data/card/${c.big}` } : {}) };
});
mkdirSync(resolve(root, 'public'), { recursive: true });
writeFileSync(resolve(root, 'public/card-catalog.json'), JSON.stringify(catalog));
console.log(`Generated private display metadata for ${catalog.length} cards.`);
