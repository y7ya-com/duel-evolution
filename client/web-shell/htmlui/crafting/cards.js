// The deck editor's card ids <-> the server's passcodes, and the cards' names. The editor (read/deck.js, CardDB) names
// a card by its YO2 id (its row in the exe's card tables); the server, D1 and /api/de/craft by its real passcode. The
// bridge between the two is the card wire's own table (rt/cardwire.cpp, tools/cardart.py `table`): the game file
// merge/data/card_passcode.bin, "YO2CARDS", u32 count, 3 x u32 placeholders, then per YO2 id a u32 passcode and a u16
// Konami id (LE). It is read once a session through lazyfs (Module.yo2Lazy.files lists its URL), never from git.
// Names come from the exe's own CARD_Name table (globalThis.yo2Deck, read/deck.js).
export function parseTable(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b.length < 24 || String.fromCharCode(...b.subarray(0, 8)) !== 'YO2CARDS') return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), n = dv.getUint32(8, true);
  const toPc = new Uint32Array(n), toId = new Map();
  for (let i = 0; i < n && 24 + 6 * i + 6 <= b.length; i++) {
    const pc = dv.getUint32(24 + 6 * i, true);
    toPc[i] = pc;
    if (pc && !toId.has(pc)) toId.set(pc, i);
  }
  return { passcode: id => (id > 0 && id < n ? toPc[id] || 0 : 0), id: pc => toId.get(Number(pc)) ?? 0, size: n };
}

let table = null, loading = null;
/** The table now (null until loaded). */
export const peekTable = () => table;
/** Load it (once; again after a failure). -> the table or null */
export function loadTable(L = globalThis.Module?.yo2Lazy) {
  if (table) return Promise.resolve(table);
  return loading ||= (async () => {
    const url = L?.files && [...L.files.keys()].find(u => /(^|\/)merge\/data\/card_passcode\.bin$/i.test(u));
    if (!url) return null;
    const r = await fetch(url + (L.files.get(url)?.ver || ''));
    if (!r.ok) return null;
    return (table = parseTable(await r.arrayBuffer()));
  })().catch(() => null).then(t => { if (!t) loading = null; return t; });
}
/** Tests: a table in place of the game's. */
export function _setTable(t) { table = t; loading = null; }

let names = null, namesFor = null;
/** Map passcode -> name for every card the game knows (built once the table and the card DB are both there). */
export function cardNames(t = table, db = globalThis.yo2Deck) {
  if (!t || !db?.cards) return new Map();
  if (names && namesFor === t) return names;
  const all = db.cards();
  if (!all) return new Map();
  names = new Map();
  namesFor = t;
  for (const c of all) { const pc = t.passcode(c.id); if (pc && !names.has(pc)) names.set(pc, c.name); }
  return names;
}
