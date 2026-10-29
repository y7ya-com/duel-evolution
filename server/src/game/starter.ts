// The free starter deck (owner's call, 2026-10-29, replacing the 40-card Startup Present): a new character picks ONE of
// the game's structure decks (the shop's 7000+ products) on the web client's HTML picker, through
// GET /api/de/starter and POST /api/de/starter/claim (worker.ts -> WorldDO, do.ts). Once per character: p.starter =
// the deck id. A character that already claimed the old 40-card pick (its "GET済み" bit) keeps those cards and has no
// starter claim. Names and blurbs are ours (the client holds none on the server side); covers are each deck's ace.
// 7 of the 9 products hold cards the 2008 list forbids or limits (Graceful Charity, Magician of Faith, ...): each
// copy over the limit is swapped for one more copy of a legal card of the same deck, so the 40 cards given are a
// deck that passes the deck check as it is (the deck itself is built in the client's Edit Deck).
import YDC from "../../gamedata/ydc.json";
import * as PP from "./persist.ts";
import { duelCore } from "../duel/data.ts";
import { check } from "../duel/deckCheck.ts";
import type { Game } from "./game.ts";
import type { Session } from "./hub.ts";
import { isFree } from "./freemode.ts";

/** id -> [name, blurb, cover (passcode)]: the structure decks the shop sells (shop.json packs 7000-8999). */
export const STARTER_DECKS: Record<number, [string, string, number]> = {
  7001: ["Elemental HEROes", "Fuse HERO monsters into Flame Wingman and friends.", 35809262],
  7003: ["Dark Magicians", "Spellcasters led by Dark Magician and Dark Magician Girl.", 46986414],
  7005: ["Ancient Gear", "Heavy machines that shut down your opponent's spells and traps.", 83104731],
  8001: ["Iron Warriors", "Gearfried, Cyber Raider and a solid warrior beatdown.", 423705],
  8002: ["Raw Power", "Big attackers like Giant Orc and Lei Lei: hit hard, hit first.", 73698349],
  8003: ["Dark World", "Fiends that power up when they're discarded.", 78004197],
  8004: ["Black Flame Dragons", "Level up Horus from LV4 to LV8.", 48229808],
  8005: ["Dimension Shift", "Banish your opponent's monsters with the D.D. crew.", 7572887],
  8006: ["Flip Control", "Flip effects and Chaos Necromancer for a patient game.", 1434352],
};

const TYPE_MONSTER = 0x1, TYPE_SPELL = 0x2;

const ydc = YDC as unknown as Record<string, { main: number[]; extra: number[] }>;

/** Deck k (passcodes) with every copy over the 2008 limit list swapped for a legal card of the same deck. */
export function legalDeck(k: number): { main: number[]; extra: number[] } {
  const own = (l: number[]) => { const t: Record<string, number> = {}; for (const c of l) t[c] = (t[c] ?? 0) + 1; return t; };
  const d = { main: [...ydc[k].main], extra: [...ydc[k].extra] };
  const bad = check(d.main, d.extra, own([...d.main, ...d.extra])).filter((x) => x.regla === "lista");
  const limited = new Set(bad.map((x) => x.id!));
  for (const x of bad) {
    const id = x.id!;
    for (let i = 0; i < x.usa - x.max; i++) {
      const list = d.extra.includes(id) ? d.extra : d.main;
      list.splice(list.indexOf(id), 1);
      const n = own(d.main);
      const sub = Object.keys(n).map(Number).filter((c) => !limited.has(c) && n[c] < 3).sort((a, b) => n[b] - n[a] || a - b)[0];
      if (sub && list === d.main) d.main.push(sub);
    }
  }
  return d;
}
/** The ready deck a claim gives, for the client to install as the active deck (phase2-duel's .ydc): legalDeck as
 *  [{passcode, n}], main (40 cards) and extra; ydc.json holds passcodes. */
export function starterDeckOut(id: number): { deck: { passcode: number; n: number }[]; extra: { passcode: number; n: number }[] } {
  const d = legalDeck(id);
  const counts = (l: number[]) => { const m = new Map<number, number>(); for (const c of l) m.set(c, (m.get(c) ?? 0) + 1); return [...m].map(([passcode, n]) => ({ passcode, n })); };
  return { deck: counts(d.main), extra: counts(d.extra) };
}
type Card = { id: number; name: string; n: number; type: "monster" | "spell" | "trap" | "extra" };
let CATALOG: { id: number; name: string; blurb: string; cover: number; cards: Card[] }[] | null = null;

/** The decks with passcodes, names and counts (main, then extra); built once the duel engine is up. */
export function starterCatalog() {
  if (CATALOG) return CATALOG;
  const dc = duelCore();
  const code = (pc: number) => pc;   // ydc.json holds passcodes (the card wire)
  const decks = Object.fromEntries(Object.keys(STARTER_DECKS).map((k) => [k, legalDeck(Number(k))]));
  const all = Object.values(decks).flatMap((d) => [...d.main, ...d.extra]).map(code);
  const info = new Map((dc?.cardinfo([...new Set(all)]) ?? []).map((c) => [Number(c.code), c]));
  const out = Object.entries(STARTER_DECKS).map(([k, [name, blurb, cover]]) => {
    const cards: Card[] = [];
    for (const [list, extra] of [[decks[k].main, false], [decks[k].extra, true]] as [number[], boolean][]) {
      const n = new Map<number, number>();
      for (const y of list) n.set(code(y), (n.get(code(y)) ?? 0) + 1);
      for (const [pc, count] of n) {
        const c = info.get(pc), t = Number(c?.type ?? 0);
        cards.push({ id: pc, name: String(c?.name ?? pc), n: count,
          type: extra ? "extra" : t & TYPE_MONSTER ? "monster" : t & TYPE_SPELL ? "spell" : "trap" });
      }
    }
    return { id: Number(k), name, blurb, cover: code(cover), cards };
  });
  if (dc) CATALOG = out; // without the engine (names missing) try again next time
  return out;
}

export const starterClaimable = (p: PP.P) => PP.progression() && !p.starter && !PP.pbinTest(p, PP.STARTER_RIGHT + 1);

/** The live session of a DE user with its character chosen, or why not. */
function active(g: Game, userId: string): Session | string {
  if (!PP.progression()) return "off";
  const acct = g.store.accountOfUser(userId);
  const s = acct ? g.hub.sessions.get(acct) : undefined;
  // free mode (freemode.ts) claims nothing: the starter deck is the MMO's
  return !s ? "not-in-game" : s.slot === null ? "no-character" : isFree(s) ? "free" : s;
}

/** A grant made outside a client request (the web claim): the connected client's trunk as the trade trunk table
 *  (0x7125-0x7127, which the 2008 client takes unsolicited and syncs its card DB with; phase2-duel, live-trunk.md) and
 *  its player data (0x4140, MP). No 0x5205 for the recipe bit: a class-5 bit is a blank gift page (persist bitShown);
 *  the client gets it with its next 0x3114. */
export function pushInventory(g: Game, s: Session, p: PP.P): boolean {
  const lc = s.lobby;
  if (!lc || lc.closed) return false;
  for (const [mid, d] of PP.pairTable(0x7125, 0x7126, 0x7127, PP.trunkPairs(p))) g.lp.post(lc, mid, d);
  g.lp.post(lc, 0x4140, (g.ph as any).player_data_update() as Uint8Array);
  return true;
}

/** GET /api/de/starter */
export function starterInfo(g: Game, userId: string): Record<string, unknown> {
  const s = active(g, userId);
  if (typeof s === "string") return { claimable: false, reason: s };
  const p = g.withCtx(s, () => PP.profile(g.loadState(), s.slot!, false));
  if (!p) return { claimable: false, reason: "no-character" };
  if (!starterClaimable(p)) {
    // a past claim: its ready deck, so the client installs it at login (an old 40-card pick has none)
    const id = PP.int(p.starter ?? 0);
    return { claimable: false, reason: "claimed", claimed: id in STARTER_DECKS ? { id, name: STARTER_DECKS[id][0], ...starterDeckOut(id) } : null };
  }
  return { claimable: true, decks: starterCatalog() };
}

/** POST /api/de/starter/claim: [http status, body]. Runs inside one World handler, so check-then-write is atomic. */
export function starterClaim(g: Game, userId: string, id: number): [number, Record<string, unknown>] {
  const s = active(g, userId);
  if (typeof s === "string") return [409, { error: s }];
  if (!(id in STARTER_DECKS) || !ydc[String(id)]) return [400, { error: "bad deck" }];
  const deck = legalDeck(id);
  return g.withCtx(s, () => {
    const st = g.loadState();
    const p = PP.profile(st, s.slot!, false);
    if (!p) return [409, { error: "no-character" }];
    if (!starterClaimable(p)) return [409, { error: "claimed" }];
    const cards = [...deck.main, ...deck.extra];
    PP.trunkAdd(g, p, cards, 1, `starter deck ${id}`);
    const recipe = PP.recipeBit(id);
    if (recipe !== null) PP.pbinSet(p, recipe); // the deck's recipe, as a purchase gives it: Edit Deck's Recipe list (next 0x3114)
    p.starter = id;
    g.saveState(st);
    g.log(`[economia] ${s.acct.slice(0, 6)}: free starter deck ${id} (${STARTER_DECKS[id][0]}), +${cards.length} cards`);
    pushInventory(g, s, p);
    return [200, { ok: true, id, cards: cards.length, ...starterDeckOut(id) }];
  });
}
