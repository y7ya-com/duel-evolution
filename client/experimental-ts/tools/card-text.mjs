// Node 22.18+ native type stripping; generated wording must stay private and ignored.
import { open, readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { decodeLzss } from '../src/assets/lzss.ts';
import { decodeOriginalCardTextTables, OriginalCardTextCatalog } from '../src/cards/original-text.ts';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const need = (value, message) => { if (!value) throw new Error(message); };
export function buildOriginalCardTexts(tables, original) {
  need(Array.isArray(original) && original.length <= 100000, 'Invalid original card mapping');
  const byId = decodeOriginalCardTextTables(tables), cards = [], missing = new Set(), seen = new Set();
  for (const c of original) {
    need(c && Number.isSafeInteger(c.pc) && c.pc > 0 && c.pc <= 0xffffffff && Number.isSafeInteger(c.internal) && c.internal > 0 && c.internal <= 0xffff && !seen.has(c.pc), 'Ambiguous original card mapping');
    seen.add(c.pc);
    const text = byId.get(c.internal);
    if (text) cards.push({ passcode: c.pc, internalId: c.internal, ...text });
    else missing.add(c.internal);
  }
  const data = { v: 1, language: 'E', source: 'merge.dat/CARD_Desc_E', cards, missingInternalIds: [...missing].sort((a, b) => a - b) };
  new OriginalCardTextCatalog().install(data);
  return data;
}
async function archiveTables(options) {
  let file, total, etag;
  if (options['--archive']) { file = await open(resolve(options['--archive']), 'r'); total = (await file.stat()).size; }
  const range = async (start, length) => {
    need(Number.isSafeInteger(start) && start >= 0 && Number.isSafeInteger(length) && length > 0 && length <= 16 * 1024 * 1024 && (total === undefined || start + length <= total), 'Invalid archive range');
    if (file) { const b = new Uint8Array(length); const r = await file.read(b, 0, length, start); need(r.bytesRead === length, 'Truncated archive'); return b; }
    const end = start + length - 1, controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(options['--url'], { headers: { Range: `bytes=${start}-${end}`, ...(etag ? { 'If-Range': etag } : {}) }, signal: controller.signal });
      try {
        const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers.get('Content-Range') ?? '');
        need(res.status === 206 && m && Number(m[1]) === start && Number(m[2]) === end && Number.isSafeInteger(Number(m[3])) && Number(m[3]) > end && (total === undefined || total === Number(m[3])), 'Invalid archive HTTP range');
        total = Number(m[3]); const tag = res.headers.get('ETag');
        need(etag === undefined || etag === tag, 'Archive ETag changed');
        if (tag && !tag.startsWith('W/')) etag = tag;
        need(!res.headers.get('Content-Encoding') || res.headers.get('Content-Encoding') === 'identity', 'Encoded archive range');
        need(res.body, 'Missing archive body');
        const reader = res.body.getReader(), out = new Uint8Array(length); let at = 0;
        try {
          for (;;) { const part = await reader.read(); if (part.done) break; need(at + part.value.length <= length, 'Oversized archive response'); out.set(part.value, at); at += part.value.length; }
          need(at === length, 'Truncated archive response'); return out;
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      } finally { if (res.body && !res.body.locked) await res.body.cancel().catch(() => {}); }
    } finally { clearTimeout(timeout); }
  };
  try {
    const head = await range(0, 12);
    need(new TextDecoder().decode(head.subarray(0, 8)) === 'KCEJYUGI', 'Invalid archive magic');
    const count = new DataView(head.buffer).getUint32(8, true), directoryEnd = 12 + count * 268;
    need(count > 0 && count <= 60000 && directoryEnd <= total, 'Invalid archive directory');
    const directory = await range(12, count * 268), dv = new DataView(directory.buffer), files = new Map();
    for (let i = 0; i < count; i++) {
      const start = i * 268; let name = '', ended = false;
      for (let j = 0; j < 256; j++) { const b = directory[start + j], c = (b & 15) << 4 | b >> 4; if (!c) { ended = true; break; } name += String.fromCharCode(c); }
      need(ended, 'Unterminated archive name'); name = name.replaceAll('\\', '/').toLowerCase();
      if (!/^data\/bin#\/card_(prop|indx_e|name_e|desc_e)\.bin$/.test(name)) continue;
      need(!files.has(name), 'Duplicate text table');
      const offset = dv.getUint32(start + 256, true), size = dv.getUint32(start + 260, true), stored = dv.getUint32(start + 264, true);
      need(offset >= directoryEnd && offset + stored <= total && size > 0 && size <= 4 * 1024 * 1024 && stored > 0 && stored <= 4 * 1024 * 1024, 'Invalid text table range');
      files.set(name, { offset, size, stored });
    }
    const tables = {};
    for (const [field, short] of [['properties', 'prop'], ['index', 'indx_e'], ['names', 'name_e'], ['descriptions', 'desc_e']]) {
      const e = files.get(`data/bin#/card_${short}.bin`); need(e, `Missing CARD_${short}`);
      const stored = await range(e.offset, e.stored); tables[field] = e.size === e.stored ? stored : decodeLzss(stored, e.size, 4 * 1024 * 1024);
    }
    return tables;
  } finally { await file?.close(); }
}
async function main(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    need(['--archive', '--url', '--data', '--out'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--') && options[args[i]] === undefined, 'Usage: node tools/card-text.mjs (--archive merge.dat | --url archive-url) [--data gamedata-directory] [--out ignored-path]');
    options[args[i]] = args[i + 1];
  }
  need(Boolean(options['--archive']) !== Boolean(options['--url']), 'Specify exactly one of --archive or --url');
  if (options['--url']) need(/^https?:\/\//.test(options['--url']), 'Expected HTTP(S) archive URL');
  const output = resolve(options['--out'] ?? resolve(root, 'public/card-texts.json'));
  const ignored = spawnSync('git', ['check-ignore', '--quiet', '--', output], { cwd: root });
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', output], { cwd: root, stdio: 'pipe' });
  need(ignored.status === 0 && tracked.status === 1, 'Refusing game-derived text at an unignored/tracked output path');
  const source = resolve(options['--data'] ?? process.env.DE_GAMEDATA ?? resolve(root, '../../server/gamedata'), 'cards.json');
  need((await stat(source)).size <= 16 * 1024 * 1024, 'Original mapping exceeds budget');
  const original = await readFile(source); need(original.length <= 16 * 1024 * 1024, 'Original mapping exceeds budget');
  const result = buildOriginalCardTexts(await archiveTables(options), JSON.parse(original.toString('utf8')));
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(result));
  console.log(`Generated ${result.cards.length} original English rules descriptions; ${result.missingInternalIds.length} internal IDs absent from this archive. Private output: ${output}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
