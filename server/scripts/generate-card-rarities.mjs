#!/usr/bin/env node
// Offline, deterministic generation. No Master Duel rarity input or network access.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
export function buildRarities(cards, curated, duel) {
  const byPasscode = new Map(cards.map(c => [c.pc, c]));
  if (byPasscode.size !== cards.length) throw new Error('Duplicate card passcode');
  const rarity = Object.fromEntries([...byPasscode.keys()].sort((a,b) => a-b).map(pc => [pc, 'N']));
  const seen = new Set();
  for (const pick of curated.picks) {
    const card = byPasscode.get(pick.passcode);
    if (!card || (card.name ?? 'Unnamed World Championship prize') !== pick.name) throw new Error(`Unknown or mismatched pick ${pick.passcode}: ${pick.name}`);
    if (seen.has(pick.passcode)) throw new Error(`Duplicate pick ${pick.passcode}`);
    if (!['UR', 'SR', 'R'].includes(pick.tier) || !pick.reason?.trim() || !pick.group?.trim()) throw new Error(`Invalid pick ${pick.passcode}`);
    if (duel.cards[String(pick.passcode)]?.[0] === 20) throw new Error(`Token cannot be a premium pick: ${pick.passcode}`);
    seen.add(pick.passcode); rarity[pick.passcode] = pick.tier;
  }
  const nonCollectible = cards.filter(c => duel.cards[String(c.pc)]?.[0] === 20).map(c => c.pc).sort((a,b) => a-b);
  return { version: curated.version, source: 'server/scripts/card-rarity-picks.json; historical sources and methodology: server/docs/card-rarities.md',
    classification: 'Custom 2002–2008 TCG/OCG competitive-era design; iconic bosses and championship prizes are collection exceptions; N = Normal. Tokens have an N baseline in the complete native table but are not collectible.',
    nonCollectible, rarity };
}
export function packSpreads(table, shop) {
  return Object.entries(shop.iid).sort(([a],[b]) => Number(a)-Number(b)).map(([id, pool]) => {
    const counts = {N:0,R:0,SR:0,UR:0};
    for (const pc of new Set(pool)) {
      if (!table.rarity[pc] || table.nonCollectible.includes(pc)) throw new Error(`Pack ${id}: unclassified/non-collectible ${pc}`);
      counts[table.rarity[pc]]++;
    }
    return { id, total: new Set(pool).size, ...counts };
  });
}
export function renderReport(table, curated, shop) {
  const counts = {N:0,R:0,SR:0,UR:0}, tokens = new Set(table.nonCollectible);
  for (const [pc,r] of Object.entries(table.rarity)) if (!tokens.has(Number(pc))) counts[r]++;
  const total = Object.values(counts).reduce((a,b)=>a+b,0);
  const rows = packSpreads(table,shop);
  const lines = ['<!-- BEGIN GENERATED RARITIES -->', '', `Version: \`${table.version}\`. Native rows: ${Object.keys(table.rarity).length}; collectible passcodes: ${total}; non-collectible token rows: ${tokens.size} (N baseline, excluded from economy and counts below).`, '', '| Tier | Label | Collectible cards | Share |','| --- | --- | ---: | ---: |'];
  for (const [r,label] of Object.entries({N:'Normal',R:'Rare',SR:'Super Rare',UR:'Ultra Rare'})) lines.push(`| ${r} | ${label} | ${counts[r]} | ${(counts[r]/total*100).toFixed(2)}% |`);
  for (const tier of ['UR','SR']) {
    lines.push('',`## Full ${tier} list`,'');
    const groups = [...new Set(curated.picks.filter(p=>p.tier===tier).map(p=>p.group))].sort();
    for (const group of groups) {
      lines.push(`### ${group}`,'','| Card (passcode) | Design reason |','| --- | --- |');
      for (const p of curated.picks.filter(p=>p.tier===tier && p.group===group).sort((a,b)=>a.name.localeCompare(b.name,'en') || a.passcode-b.passcode)) lines.push(`| ${p.name} (${p.passcode}) | ${p.reason} |`);
      lines.push('');
    }
  }
  lines.push('## Per-pack rarity spread','','All `shop.json.iid` pools, including reward/special pools. IDs are pack parameters, not catalogue item indices. Entries are already passcodes, as consumed by `packContents`/`shopPurchase`; no translator conversion applies. Counts are unique passcodes, matching runtime rarity buckets. Fixed `ydc` decks are not random packs. Pool 8999 is an aggregate special pool. This report does not change pack membership or shop availability.','','| Pack param | Total | N | R | SR | UR | Spread |','| --- | ---: | ---: | ---: | ---: | ---: | --- |');
  for(const row of rows) lines.push(`| ${row.id} | ${row.total} | ${row.N} | ${row.R} | ${row.SR} | ${row.UR} | ${!row.R&&!row.SR&&!row.UR?'NO R+':!row.SR&&!row.UR?'NO SR/UR':row.SR+row.UR<=2?'Thin: at most 2 SR/UR':'OK'} |`);
  lines.push('',`No R+: ${rows.filter(p=>!p.R&&!p.SR&&!p.UR).map(p=>p.id).join(', ') || 'none'}.`, '',`No SR/UR: ${rows.filter(p=>!p.SR&&!p.UR).map(p=>p.id).join(', ') || 'none'}.`, '',`Thin premium spread (1–2 SR/UR): ${rows.filter(p=>p.SR+p.UR>0&&p.SR+p.UR<=2).map(p=>`${p.id} (${p.SR} SR, ${p.UR} UR)`).join('; ') || 'none'}.`, '', '<!-- END GENERATED RARITIES -->');
  return lines.join('\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const curated = read('scripts/card-rarity-picks.json');
  const table = buildRarities(read('gamedata/cards.json'),curated,read('gamedata/duel.json'));
  const json = JSON.stringify(table,null,2)+'\n';
  const docPath = resolve(root,'docs/card-rarities.md');
  const doc = readFileSync(docPath,'utf8');
  if (!doc.includes('<!-- BEGIN GENERATED RARITIES -->') || !doc.includes('<!-- END GENERATED RARITIES -->')) throw new Error('Missing documentation markers');
  const updated = doc.replace(/<!-- BEGIN GENERATED RARITIES -->[\s\S]*?<!-- END GENERATED RARITIES -->/,renderReport(table,curated,read('gamedata/shop.json')));
  if (process.argv.includes('--check')) {
    if (readFileSync(resolve(root,'data/card-rarities.json'),'utf8') !== json || doc !== updated) throw new Error('Generated rarity table/documentation is stale');
  } else {
    writeFileSync(resolve(root,'data/card-rarities.json'),json);
    writeFileSync(docPath,updated);
  }
  console.log(`${curated.version}: ${Object.keys(table.rarity).length} native rows; ${table.nonCollectible.length} tokens; table and documentation ${process.argv.includes('--check')?'verified':'generated'}`);
}
