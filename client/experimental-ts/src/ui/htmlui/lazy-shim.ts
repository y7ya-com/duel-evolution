// What main's page modules read the game's files through on live: lazyfs.js's Module.yo2Lazy (client/recomp/web).
// cosmetics/art.js and cosmetics/waistup.js (the Wardrobe's item art, its try-on bust) call entry(name) for any name
// files2 lists; card-pictures.js (the card shop's card faces) and crafting/editor.js call cardArt(id) by the card's YO2
// id (merge.dat's data/card/list_card.txt names each id's picture). The rewrite answers both from its own archive reader
// (app.ts readGameFile), and cardArt as lazyfs does: card.dat's 2x art (app.ts readCardArt), merge.dat's data/card only
// without it. files2 answers has() for every name (entry() reads any), and its keys name the folders the modules ask to
// find listed: the card shop's pack art (shop/art.js listPacks) needs merge.dat in `files` and data/cardpack/ listed in
// files2, else it reads merge.dat's whole directory itself (or, with no archive in `files`, never shows a pack's art).
// With both there, the modules never range-read the archive themselves: every read is entry() / cardArt().
type Read = (path: string) => Promise<Uint8Array>;

export interface LazyShim {
  files: Map<string, { ver?: string }>;
  files2: { has(name: string): boolean; get(name: string): undefined; set(name: string, v: unknown): void; keys(): IterableIterator<string> };
  entry(name: string): Promise<Uint8Array | null>;
  cardArt(id: number): Promise<Uint8Array | null>;
}

/** The folders files2 lists for main's modules (shop/art.js listPacks: PACKS). */
const LISTED = ['data/cardpack/'];

export function lazyShim(read: Read, art?: (id: number) => Promise<Uint8Array | null>, archive?: string, passcodes?: string): LazyShim {
  let names: Promise<string[] | null> | null = null;
  const entry = (name: string) => read(name.toLowerCase()).catch(() => null);
  const list = () => names ??= entry('data/card/list_card.txt').then(b => {
    if (!b) { names = null; return null; }
    return new TextDecoder('latin1').decode(b).split(/\r?\n/).map(x => x.trim().toLowerCase());
  });
  return {
    // (and the card wire's table, merge/data/card_passcode.bin: crafting/cards.js loadTable finds it here, as on live)
    files: new Map([...archive ? [[archive, {}] as [string, { ver?: string }]] : [], ...passcodes ? [[passcodes, {}] as [string, { ver?: string }]] : []]),
    files2: { has: () => true, get: () => undefined, set: () => {}, keys: () => LISTED[Symbol.iterator]() },
    entry,
    async cardArt(id: number) {
      if (art) { const b = await art(id).catch(() => null); if (b) return b; }
      const n = (await list())?.[id]; return n ? entry('data/card/' + n) : null;
    },
  };
}

/** Puts the shim on globalThis.Module.yo2Lazy unless a runtime already has one (the engine's own lazyfs). */
export function installLazyShim(read: Read, art?: (id: number) => Promise<Uint8Array | null>, archive?: string, passcodes?: string): void {
  const g = globalThis as { Module?: Record<string, unknown> };
  g.Module ??= {};
  if (!g.Module.yo2Lazy) g.Module.yo2Lazy = lazyShim(read, art, archive, passcodes);
}
