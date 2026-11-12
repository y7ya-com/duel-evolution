// The card pack catalogue's texts as the engine reads them (src/Pack/PackInfo.cpp, data/cardpack/PACK_*.bin in
// merge.dat): PACK_Prop.bin a u32 per catalogue slot 1..0xc0 (its low 15 bits, sign-extended, the pack id), PACK_Indx_<L>
// per slot the u32 offsets of its name and its text in PACK_Name_<L> / PACK_Desc_<L> (NUL-terminated, the Windows code
// page). The deck screen's STRUCTURE DECK shows a pack's text under its list (DeckEntryMain.cpp pollRecipeList).
const SLOTS = 0xc0;
const word = (b: Uint8Array, at: number) => at + 4 > b.length ? 0 : (b[at]! | b[at + 1]! << 8 | b[at + 2]! << 16 | b[at + 3]! << 24) >>> 0;
const text = (b: Uint8Array, at: number) => {
  if (at >= b.length) return '';
  let end = at; while (end < b.length && b[end] !== 0) end++;
  return new TextDecoder('windows-1252').decode(b.subarray(at, end));
};
/** Pack id -> its text, from the three tables' bytes. */
export function packTexts(prop: Uint8Array, indx: Uint8Array, desc: Uint8Array): Map<number, string> {
  const out = new Map<number, string>();
  for (let i = 1; i <= SLOTS; i++) {
    const id = (word(prop, 4 * i) << 17) >> 17;
    if (id > 0 && !out.has(id)) out.set(id, text(desc, word(indx, 8 * i + 4)));
  }
  return out;
}
/** The texts in a language (the engine's letter: J E G F I S K), read through `read` (merge.dat's entries). */
export async function loadPackTexts(read: (path: string) => Promise<Uint8Array>, language = 'E'): Promise<Map<number, string>> {
  const [prop, indx, desc] = await Promise.all(['PACK_Prop.bin', `PACK_Indx_${language}.bin`, `PACK_Desc_${language}.bin`].map(n => read(`data/cardpack/${n}`)));
  return packTexts(prop!, indx!, desc!);
}
