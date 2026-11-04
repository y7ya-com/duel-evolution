import { describe, expect, it } from 'vitest';
import { buildCardDetails } from '../tools/card-data.mjs';
import { CardDetailsCatalog, decodeLegacyDeck, encodeLegacyDeck } from '../src/cards';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const original = [{ i: 1, pc: 100001, internal: 5001, name: 'Synthetic fallback' }];
const duel = { ids: 'passcode', cards: { '100001': [1, 2, 'Synthetic localized name'] } };
const engine = { cards: [[100001, 0, [], 0x21, 4, 16, '8192', 1500, 1200]], texts: { '100001': ['Synthetic engine name', 'Synthetic choice prompt'] } };
describe('source-backed detail conversion', () => {
  it('joins passcodes and preserves distinct descriptions, prompts and ID spaces', () => {
    const rows = buildCardDetails(original, duel, engine, [{ id: 100001, desc: 'Synthetic rules description' }]);
    expect(rows).toEqual([{
      passcode: 100001, legacyId: 1, internalId: 5001, name: 'Synthetic engine name',
      description: 'Synthetic rules description', descriptionSource: 'cards.cdb', effectTexts: ['Synthetic choice prompt'],
      typeBits: 0x21, type: 'Monster / Effect', level: 4, attributeBits: 16, attribute: 'Light',
      raceBits: '8192', race: 'Dragon', attack: 1500, defense: 1200, extra: false, limit: 2, deckAllowed: true,
    }]);
    const c = new CardDetailsCatalog(); c.install(rows); expect(c.size).toBe(1);
  });
  it('leaves absent descriptions and absent engine data visibly absent', () => {
    const [row] = buildCardDetails(original, { ids: 'passcode', cards: {} }, { cards: [], texts: {} });
    expect(row.name).toBe('Synthetic fallback'); expect(row).not.toHaveProperty('description');
    expect(row).not.toHaveProperty('limit'); expect(row).not.toHaveProperty('attack');
    expect(buildCardDetails(original, duel, engine)[0]).not.toHaveProperty('description');
  });
  it('treats NO_DECK separately from banned and unrestricted cards', () => {
    for (const limit of [0, 1, 2, 3, 65535]) {
      const [row] = buildCardDetails(original, { ids: 'passcode', cards: { 100001: [1, limit] } }, engine);
      expect(row.deckAllowed).toBe(limit !== 65535);
      if (limit === 65535) expect(row).not.toHaveProperty('limit'); else expect(row.limit).toBe(limit);
    }
  });
  it('does not lose wide race masks or hide unknown bits', () => {
    const e = { ...engine, cards: [[100001, 0, [], 1, 4, 0x100, '9223372036854775808', -2, -2]] };
    const [row] = buildCardDetails(original, duel, e);
    expect(row.raceBits).toBe('9223372036854775808'); expect(row.race).toContain('Unknown'); expect(row.attribute).toContain('Unknown');
  });
  it('rejects ambiguous source identities and malformed source statistics', () => {
    expect(() => buildCardDetails([...original, ...original], duel, engine)).toThrow('identity');
    expect(() => buildCardDetails(original, duel, { ...engine, cards: [...engine.cards, ...engine.cards] })).toThrow('identity');
    expect(() => buildCardDetails(original, { ids: 'internal', cards: {} }, engine)).toThrow('passcode');
    expect(() => buildCardDetails(original, { ids: 'passcode', cards: { 100001: [1, 4] } }, engine)).toThrow('limit');
    expect(() => buildCardDetails(original, duel, { ...engine, cards: [[100001, 0, [], -1, 4, 16, '8192', 0, 0]] })).toThrow('statistics');
    expect(() => buildCardDetails(original, duel, engine, [{ id: 100001, desc: 'a' }, { id: 100001, desc: 'b' }])).toThrow('CDB');
  });
  it('generates private output from read-only CDB descriptions without altering the database', () => {
    const root = resolve(import.meta.dirname, '..');
    mkdirSync(resolve(root, '.vite'), { recursive: true });
    const dir = mkdtempSync(resolve(root, '.vite/cards-test-'));
    try {
      mkdirSync(resolve(dir, 'engine'));
      writeFileSync(resolve(dir, 'cards.json'), JSON.stringify(original));
      writeFileSync(resolve(dir, 'duel.json'), JSON.stringify(duel));
      writeFileSync(resolve(dir, 'engine/cards.json'), JSON.stringify(engine));
      const cdb = resolve(dir, 'cards.cdb');
      const created = spawnSync(process.execPath, ['--input-type=module', '-e', `
        import { DatabaseSync } from 'node:sqlite';
        const db = new DatabaseSync(process.argv[1]);
        db.exec('CREATE TABLE texts (id INTEGER PRIMARY KEY, desc TEXT)');
        db.prepare('INSERT INTO texts VALUES (?, ?)').run(100001, 'Synthetic complete description');
        db.close();
      `, cdb], { encoding: 'utf8' });
      expect(created.status, created.stderr).toBe(0);
      const before = readFileSync(cdb);
      const out = resolve(dir, 'card-details.json');
      const result = spawnSync(process.execPath, [resolve(root, 'tools/card-data.mjs'), '--data', dir, '--cdb', cdb, '--out', out], { encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('1 descriptions');
      const rows = JSON.parse(readFileSync(out, 'utf8'));
      const c = new CardDetailsCatalog(); c.install(rows);
      expect(c.get(100001)?.description).toBe('Synthetic complete description');
      expect(c.get(100001)?.effectTexts).toEqual(['Synthetic choice prompt']);
      expect(readFileSync(cdb)).toEqual(before);
      const missing = resolve(dir, 'missing.cdb');
      const bad = spawnSync(process.execPath, [resolve(root, 'tools/card-data.mjs'), '--data', dir, '--cdb', missing, '--out', out], { encoding: 'utf8' });
      expect(bad.status).not.toBe(0); expect(existsSync(missing)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('refuses an unignored output path before writing any data', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'cards-output-'));
    try {
      const out = resolve(dir, 'card-details.json');
      const result = spawnSync(process.execPath, [resolve(import.meta.dirname, '../tools/card-data.mjs'), '--out', out], { encoding: 'utf8' });
      expect(result.status).not.toBe(0); expect(result.stderr).toContain('unignored/tracked');
      expect(existsSync(out)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

const sourceRoot = resolve(import.meta.dirname, '../../../server/gamedata');
const paths = ['cards.json', 'duel.json', 'engine/cards.json'].map(p => resolve(sourceRoot, p));
it.skipIf(!paths.every(existsSync))('accepts and round-trips every identity in available private source data', () => {
  const [original, duel, engine] = paths.map(p => JSON.parse(readFileSync(p, 'utf8')));
  const rows = buildCardDetails(original, duel, engine);
  const c = new CardDetailsCatalog(); c.install(rows);
  expect(c.size).toBe(original.length);
  for (const row of original) {
    expect(c.passcodeForId(row.i)).toBe(row.pc);
    expect(c.idForPasscode(row.pc)).toBe(row.i);
    expect(c.get(row.pc)?.internalId).toBe(row.internal);
  }
  for (let at = 0; at < rows.length; at += 80) {
    const deck = { main: rows.slice(at, at + 80).map(c => c.passcode), side: [], extra: [] };
    expect(decodeLegacyDeck(encodeLegacyDeck(deck, c), c)).toEqual(deck);
  }
});
