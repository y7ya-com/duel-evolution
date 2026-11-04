// Game-derived output is private. This file contains format/selection algorithms only.
import { readFile, lstat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, parse, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertPrivateOutput } from './avatar-data.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const need = (condition, message) => { if (!condition) throw new Error(message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const MAX_OUTPUT = 1024 * 1024;

/** Exact server source names; parse string literals as JSON, never execute source. */
export function recipeNames(source) {
  need(typeof source === 'string' && source.length <= 1024 * 1024, 'Starter source exceeds budget');
  const block = source.match(/export const STARTER_DECKS:[^=]+=[ \t]*\{([\s\S]*?)\n\};/);
  need(block, 'Missing STARTER_DECKS source');
  const names = {};
  for (const line of block[1].split('\n')) {
    if (!line.trim()) continue;
    const row = line.match(/^\s*(\d+):\s*\[\s*("(?:[^"\\]|\\.)*")\s*,/);
    need(row && !Object.hasOwn(names, row[1]), 'Malformed or duplicate starter name');
    names[row[1]] = JSON.parse(row[2]);
  }
  return names;
}

/** persist.recipeBit = shop pack right+1; only kind-1 shop products have a
 * source-proven purchasable recipe. Never infer rights for other YDC files.
 * Default PBIN has no built-in recipe grants in the current source. The wire
 * remains the authority even if defaults change later. No legalDeck rewriting. */
export function buildRecipeData({ ydc, shop, persist, names }) {
  need(object(ydc) && Object.keys(ydc).length <= 10000 && object(shop) && Array.isArray(shop.packs) && shop.packs.length <= 192, 'Invalid recipe sources');
  need(object(persist) && Array.isArray(persist.default_pbin_bits) && persist.default_pbin_bits.length <= 1024 && persist.default_pbin_bits.every(b => integer(b, 0, 1023)), 'Invalid default PBIN');
  need(object(names) && Object.keys(names).length <= 192, 'Invalid recipe names');
  const recipes = [], ids = new Set(), rights = new Set();
  for (const row of shop.packs) {
    need(Array.isArray(row) && row.length === 3 && integer(row[0], 1, 999999999) && integer(row[1], 0, 4) && (row[2] === null || integer(row[2], 0, 1022)), 'Invalid shop pack row');
    const [id, kind, right] = row;
    need(!ids.has(id), 'Duplicate pack identity'); ids.add(id);
    if (kind !== 1) continue;
    need(right !== null && !rights.has(right + 1), 'Missing or duplicate recipe right'); rights.add(right + 1);
    const name = names[id], deck = ydc[id];
    need(typeof name === 'string' && name.trim() && name.length <= 512 && !/[\u0000-\u001f\u007f]/.test(name), 'Missing or invalid source recipe name');
    need(object(deck), 'Missing source YDC');
    const entry = { id: String(id), name, recipeBit: right + 1 };
    for (const [zone, capacity] of [['main',80],['side',15],['extra',30]]) {
      const cards = deck[zone];
      need(Array.isArray(cards) && cards.length <= capacity && cards.every(c => integer(c, 1, 0xfffffeff)), 'Invalid source YDC cards');
      entry[zone] = [...cards];
    }
    recipes.push(entry);
  }
  recipes.sort((a,b) => Number(a.id)-Number(b.id)); // native catalogue is a map keyed by pack id
  const result = { version: 1, deckSource: 'original-ydc', recipes };
  need(Buffer.byteLength(JSON.stringify(result)) <= MAX_OUTPUT, 'Recipe output exceeds budget');
  return result;
}
async function noSymlinks(path) {
  const absolute = resolve(path), parts = relative(parse(absolute).root,absolute).split('/');
  let current = parse(absolute).root;
  for (const part of parts) {
    current = resolve(current,part);
    try { need(!(await lstat(current)).isSymbolicLink(), 'Refusing symlink recipe output path'); }
    catch(e) { if(e.code !== 'ENOENT') throw e; }
  }
}
export async function generateRecipes(output = resolve(root,'public/deck-recipes.json'), sourceDir = resolve(root,'../../server')) {
  await noSymlinks(output);
  const dest = await assertPrivateOutput(output);
  const paths = ['gamedata/ydc.json','gamedata/shop.json','gamedata/persist.json','src/game/starter.ts'];
  const limits = [8*1024*1024, 4*1024*1024, 1024*1024, 1024*1024];
  const bytes = await Promise.all(paths.map(async(p,i) => {
    const path = resolve(sourceDir,p), info = await lstat(path);
    need(info.isFile() && info.size <= limits[i], 'Recipe input exceeds budget or is not a regular file');
    const data = await readFile(path); need(data.length <= limits[i], 'Recipe input exceeds budget'); return data.toString('utf8');
  }));
  const data = buildRecipeData({ydc:JSON.parse(bytes[0]),shop:JSON.parse(bytes[1]),persist:JSON.parse(bytes[2]),names:recipeNames(bytes[3])});
  const json = JSON.stringify(data); need(Buffer.byteLength(json) <= MAX_OUTPUT,'Recipe output exceeds budget');
  await mkdir(dirname(dest),{recursive:true}); await noSymlinks(dest); await assertPrivateOutput(dest);
  await writeFile(dest,json,{flag:'wx'});
  return {output:dest,count:data.recipes.length};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [output='public/deck-recipes.json',sourceDir=resolve(root,'../../server')] = process.argv.slice(2);
  console.log(await generateRecipes(resolve(root,output),resolve(sourceDir)));
}
