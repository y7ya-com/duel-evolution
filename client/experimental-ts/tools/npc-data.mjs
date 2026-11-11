import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { assertPrivateOutput } from './avatar-data.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const need = (v, m) => { if (!v) throw new Error(m); };
/** Source CFukiDictionary::load: paired text/style rows, strtok skips empty tokens.
 * CStringDB offsets are little endian; original English strings use Windows-1252. */
/** CNpcListMenu::conditionText's table (client/src/Lobby/yo2NpcListMenu.cpp): the NPC card's text ids. */
export const NPC_BIO_TEXTS = [0x22c6,0x22c5,0x22c7,0x22c8,0x22c9,0x22ca,0x22cd,0x22ce,0x22cf,0x22d0,0x22d1,0x22d2,0x22d4,0x22d3,0x22d5];
export function buildNpcData(csv, index, bin) {
  need(csv.length <= 1024*1024 && index.length <= 4*1024*1024 && index.length % 4 === 0 && bin.length <= 16*1024*1024, 'NPC input budget exceeded');
  const strings = new DataView(index.buffer, index.byteOffset, index.byteLength), decoder = new TextDecoder('windows-1252');
  const rows = csv.split(/\r?\n/), lines = {};
  const dataLine = row => row && !row.startsWith('//');
  const tokens = row => row.split(',').filter(s => s.length).map(s => { need(/^-?\d+$/.test(s.trim()), 'Invalid fuki number'); return Number(s); });
  for (let i = 0; i < rows.length; i++) {
    if (!dataLine(rows[i])) continue;
    const text = tokens(rows[i]), styleRow = rows[++i];
    if (!dataLine(styleRow)) continue;
    const style = tokens(styleRow), npc = text[0];
    need(Number.isInteger(npc) && npc > 0 && npc <= 0xffff && text.length <= 101 && style.length <= 101 && Object.keys(lines).length < 120 && !lines[npc], 'Invalid or duplicate NPC row');
    const entry = {};
    for (let line = 0; line < text.length - 1; line++) {
      const textId = text[line+1]; if (textId <= 0) continue;
      // A balloon line is five consecutive strings, one per row (empty rows are blank in the balloon).
      const rows = [];
      for (let row = 0; row < 5; row++) {
        const id = textId + row; if (id*4+4 > index.length) break;
        const offset = strings.getUint32(id*4, true); need(offset < bin.length, 'NPC string offset outside table');
        const end = bin.indexOf(0, offset); need(end >= offset && end-offset <= 16384, 'Unterminated NPC string');
        rows.push(decoder.decode(bin.subarray(offset,end)));
      }
      need(rows.length > 0, 'Missing NPC string offset');
      entry[line] = { textId, text: rows.filter(row => row.trim()).map(row => row.trim()).join('\n'), style: style[line+1] ?? 0 };
    }
    lines[npc] = entry;
  }
  const presentTexts = {};
  for (const base of [0x63e2,0x655e,0x6aae]) for (let i=0;i<5;i++) {
    const id=base+i; if (id*4+4 > index.length) continue;
    const offset=strings.getUint32(id*4,true); need(offset < bin.length,'NPC eligibility string offset outside table');
    const end=bin.indexOf(0,offset); need(end>=offset && end-offset<=16384,'Unterminated NPC eligibility string');
    presentTexts[id]=decoder.decode(bin.subarray(offset,end));
  }
  // The NPC card's text (CNpcListMenu::conditionText, @yo2 0x0089e250): one yo2text string per three NPCs 0x33..0x5f
  const bios = {};
  for (const id of NPC_BIO_TEXTS) {
    if (id*4+4 > index.length) continue;
    const offset=strings.getUint32(id*4,true); need(offset < bin.length,'NPC card text offset outside table');
    const end=bin.indexOf(0,offset); need(end>=offset && end-offset<=16384,'Unterminated NPC card text');
    bios[id]=decoder.decode(bin.subarray(offset,end)).replace(/\s+$/,'');
  }
  return {version:1, lines, presentTexts, bios};
}
export async function generateNpcData(output, csvPath, indexPath, binPath) {
  const dest = await assertPrivateOutput(output), inputs = [csvPath,indexPath,binPath], limits = [1024*1024,4*1024*1024,16*1024*1024];
  for (const [i,input] of inputs.entries()) need((await stat(input)).size <= limits[i], 'NPC input budget exceeded');
  const [csv,index,bin] = await Promise.all(inputs.map(input => readFile(input)));
  const data = buildNpcData(csv.toString('utf8'),index,bin);
  await mkdir(dirname(dest),{recursive:true}); await assertPrivateOutput(dest);
  await writeFile(dest,JSON.stringify(data),{flag:'wx'});
  return {output:dest,npcs:Object.keys(data.lines).length};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [output,csv,index,bin] = process.argv.slice(2);
  need(output && csv && index && bin, 'Usage: node tools/npc-data.mjs <ignored-output.json> <fuki_index.csv> <yo2text_e.idx> <yo2text_e.bin>');
  console.log(await generateNpcData(resolve(root,output),resolve(csv),resolve(index),resolve(bin)));
}
