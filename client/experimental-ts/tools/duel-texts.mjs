// Maps authored translator IDs to private engine display text. Generated text is never committed.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const data = resolve(process.env.DE_GAMEDATA || resolve(root, '../../server/gamedata'));
const source = readFileSync(resolve(root, '../../server/src/duel/translator/consts.ts'), 'utf8');
const engine = JSON.parse(readFileSync(resolve(data, 'engine/cards.json'), 'utf8'));
const system = JSON.parse(readFileSync(resolve(data, 'engine/strings.json'), 'utf8')).system;
const original = JSON.parse(readFileSync(resolve(data, 'cards.json'), 'utf8'));
const output = { v: 1, legacyOptions: {}, legacyPrompts: {}, cardNames: {} };
const block = name => {
  const start = source.indexOf(`export const ${name} = new Map`);
  if (start < 0) throw new Error(`Translator mapping ${name} not found`);
  const end = source.indexOf(']);', start);
  if (end < 0) throw new Error(`Translator mapping ${name} is unterminated`);
  return source.slice(start, end);
};
const append = (table, legacy, card, text) => {
  if (typeof text !== 'string' || !text.trim()) return;
  const values = table[legacy] ||= [];
  if (!values.some(v => v.card === card && v.text === text.trim())) values.push({ card, text: text.trim() });
};
// Never evaluate TypeScript source. Only the two explicit OPTION_DLG entry forms are accepted.
const options = block('OPTION_DLG');
for (const match of options.matchAll(/\[\s*_sid\((\d+),\s*(\d+)\),\s*(\d+)\s*\]/g)) {
  const [, card, index, legacy] = match;
  append(output.legacyOptions, legacy, Number(card), engine.texts[card]?.[Number(index) + 1]);
}
for (const match of options.matchAll(/\[\s*(\d+),\s*(\d+)\s*\]/g)) append(output.legacyOptions, match[2], 0, system[match[1]]);
for (const match of block('YESNO_SYS_DLG').matchAll(/\[\s*(\d+),\s*(\d+)\s*\]/g)) append(output.legacyPrompts, match[2], 0, system[match[1]]);
for (const match of block('YESNO_DLG').matchAll(/\["(\d+),(\d+)",\s*\[(\d+),/g)) {
  append(output.legacyPrompts, match[3], Number(match[1]), engine.texts[match[1]]?.[Number(match[2]) + 1]);
}
for (const card of original) {
  const name = engine.texts[card.pc]?.[0];
  if (typeof name === 'string' && name.trim()) output.cardNames[card.pc] = name.trim();
}
mkdirSync(resolve(root, 'public'), { recursive: true });
writeFileSync(resolve(root, 'public/duel-texts.json'), JSON.stringify(output));
console.log(`Generated private duel labels: ${Object.keys(output.legacyOptions).length} option IDs, ${Object.keys(output.legacyPrompts).length} prompt IDs, ${Object.keys(output.cardNames).length} card names.`);
