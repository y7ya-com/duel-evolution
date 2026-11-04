#!/usr/bin/env node
// Collects browser acceptance evidence (acceptance-evidence/runs.jsonl from tests/acceptance/, and any further
// JSONL files given as arguments) into acceptance-evidence/verified.json: for each flow, the newest observation of each
// test that covers it, from runs on a clean tree. Only flows of src/parity/acceptance.ts are kept. The committed file is what the parity
// gate reads; runs.jsonl itself stays local.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ids = new Set([...readFileSync(resolve(root, 'src/parity/acceptance.ts'), 'utf8').matchAll(/^\s*\['([a-z-]+\.[a-z-]+)',/gm)].map(m => m[1]));
const sources = [resolve(root, 'acceptance-evidence/runs.jsonl'), ...process.argv.slice(2).map(p => resolve(p))].filter(existsSync);
const target = resolve(root, 'acceptance-evidence/verified.json');
const verified = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : {};
let read = 0;
for (const source of sources) for (const line of readFileSync(source, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const row = JSON.parse(line); read++;
  // A run from a tree with uncommitted changes did not test the recorded commit.
  if (!ids.has(row.flow) || !row.observed || !row.test || !row.test.startsWith('tests/acceptance/') || row.dirty !== false) continue;
  // One entry per flow and test (several tests can cover one flow, e.g. a general duel and a scenario duel): the newest.
  const entries = (verified[row.flow] = Array.isArray(verified[row.flow]) ? verified[row.flow] : verified[row.flow] ? [verified[row.flow]] : []);
  const at = entries.findIndex(e => e.test === row.test);
  const entry = { at: row.at, commit: row.commit, test: row.test, actions: row.actions, expected: row.expected, observed: row.observed, ...(row.accounts ? { accounts: row.accounts } : {}) };
  if (at < 0) entries.push(entry); else if (entries[at].at < row.at) entries[at] = entry;
}
const sorted = Object.fromEntries(Object.entries(verified).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(target, JSON.stringify(sorted, null, 1) + '\n');
console.log(`${read} evidence lines read; ${Object.keys(sorted).length}/${ids.size} flows have evidence.`);
