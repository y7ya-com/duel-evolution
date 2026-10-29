// Picking cards in the deck, graveyard, banished zone or extra deck: the translator must open the client's card list
// (CWindowDeckList: 0x6610 SELDUELLIST_DATA with the candidates + 0x6202 type 0x1b B=0x33 RUN_LIST (player, kind)),
// because the client shows no card of a pile on the mat, only the pile. In-process DuelCore (unshuffled decks, so the
// hands are known) + the translator, driven like ocgSession; the client's clicks are its real messages (0x6350 move,
// 0x6426 / 0x6432 list marks, 0x6423 list closed).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PY_DUEL_RULE, type DuelCore, type Json } from "../src/duel/engine/core.ts";
import { createNodeDuelCore, ENGINE_DATA_DIR } from "../src/duel/engine/node.ts";
import { cardmap } from "../src/duel/data.ts";
import { LIST_ANY, LIST_ONE, M_LIST, T_VIEW_LIST } from "../src/duel/translator/consts.ts";
import { type Msg, YO2Duel } from "../src/duel/translator/translator.ts";
import { PyRandom } from "../src/util/pyrandom.ts";
import { WireDecoder } from "./cardwire.ts";

const haveData = existsSync(join(ENGINE_DATA_DIR, "scripts.pack"));
const GD = join(import.meta.dirname, "..", "gamedata");
const ELF = 15025844, DARK_MAGICIAN = 46986414, FOOLISH_BURIAL = 81439173, MONSTER_REBORN = 83764718;
const CHAOS_SORCERER = 9596126;
const ZONE_HAND = 0x0b, CMD_SPSUMMON = 2, CMD_ACTIVATE = 3;

const u32 = (...xs: number[]) => {
  const b = Buffer.alloc(4 * xs.length);
  xs.forEach((x, i) => b.writeUInt32BE(x >>> 0, 4 * i));
  return new Uint8Array(b);
};

/** What the client is told to show (`out` as the client's codec hands it to the exe): the 0x6610 list (kind + YO2
 *  ids) and the RUN_LIST views, the pile masks. */
function shown(out: Msg[]) {
  const lists = out.filter(([id]) => id === M_LIST).map(([, b]) => {
    const v = Buffer.from(b);
    const n = v.readUInt32BE(9);
    return { kind: v.readUInt32BE(1), ids: Array.from({ length: n }, (_, i) => v.readUInt16BE(17 + 8 * i)) };
  });
  const views = out.filter(([id, b]) => id === 0x6202 && Buffer.from(b).readUInt32BE(0) === 0x1b && Buffer.from(b).readUInt32BE(4) === T_VIEW_LIST)
    .map(([, b]) => [Buffer.from(b).readUInt32BE(8), Buffer.from(b).readUInt32BE(12)]);
  return { lists, views, request: out.some(([id]) => id === 0x6611) };
}

/** One duel: player 0 = the translator's client, `top` = its first cards in draw order over 5 Dark Magicians and
 *  Mystical Elves; player 1 = duelcore's bot. */
class Duel {
  d: YO2Duel;
  evs: Json[];
  last: any = null;
  out: Msg[] = [];
  /** the client's codec (client/recomp/rt/cardwire.cpp): the translator speaks the card wire */
  wire = new WireDecoder(GD);
  constructor(private dc: DuelCore, private id: string, top: number[], cfg: Record<string, unknown> = {}) {
    const main = [...Array(35 - top.length).fill(ELF), ...Array(5).fill(DARK_MAGICIAN), ...top.slice().reverse()];
    const decks = [{ main, extra: [] }, { main: Array(40).fill(ELF), extra: [] }];
    this.d = new YO2Duel(decks, { first: 0, cardmap: cardmap(), cfg, rng: new PyRandom(1) });
    this.d.query = () => dc.query(id);
    this.d.start();
    this.evs = dc.new(id, decks, { first: 0, seed: 1, shuffle: false, rule: PY_DUEL_RULE, bot: [false, true] });
    this.pump();
  }

  /** feed the engine's events up to player 0's next decision the client sees (answering automatic ones as the host) */
  pump() {
    for (;;) {
      this.out = this.wire.decode(this.d.feed_many(this.evs as any));
      this.last = this.evs[this.evs.length - 1];
      if (this.last.ev !== "select") return;
      if (this.last.player === 1) { this.evs = this.dc.auto(this.id, 1); continue; }
      if (!this.d.needs_auto()) return;
      const c: any = this.d.auto_response();
      this.evs = c.cmd === "auto" ? this.dc.auto(this.id) : this.dc.respond(this.id, c.response);
    }
  }

  /** a client message; its answer (if any) goes to the engine */
  client(id: number, data: Uint8Array): Json | null {
    const [cmd, out] = this.d.on_client(id, this.wire.encode(id, data));
    if (!cmd) { this.out = this.wire.decode(out); return null; }
    const r = (cmd as any).response;
    this.evs = this.dc.respond(this.id, r);
    this.pump();
    return r;
  }

  /** click a card of the hand with an idle command */
  play(code: number, cmd: number) {
    const lst = this.last[cmd === CMD_SPSUMMON ? "special_summons" : "activates"] as any[];
    const c = lst.find((x) => x.code === code);
    expect(c, `${code} playable`).toBeTruthy();
    return this.client(0x6350, u32(0, ZONE_HAND, c.sequence, cmd));
  }

  /** the YO2 id the client shows for a card */
  yo2(code: number): number {
    const y = this.wire.index(cardmap().wire(code) ?? 0);
    expect(y, `${code} in the client's card table`).toBeGreaterThan(0);
    return y;
  }

  /** list items (in order) whose YO2 id is that card's */
  items(code: number): number[] {
    const y = this.yo2(code);
    const l = shown(this.out).lists[0];
    return l.ids.flatMap((id, i) => (id === y ? [i] : []));
  }

  /** Foolish Burial the first `code` of the deck */
  bury(code: number) {
    this.play(FOOLISH_BURIAL, CMD_ACTIVATE);
    expect(this.last.type).toBe("SELECT_CARD");
    const i = this.items(code)[0];
    this.client(0x6426, u32(i));
    this.client(0x6432, u32(i, 1));
    return this.client(0x6423, u32(1));
  }
}

describe.skipIf(!haveData)("picking from the deck / graveyard shows the client's card list", () => {
  let dc: DuelCore;
  beforeAll(async () => { dc = await createNodeDuelCore(); }, 60_000);

  it("SELECT_CARD (Foolish Burial from the deck, Monster Reborn on the graveyard): 0x6610 + RUN_LIST, kind LIST_ONE", () => {
    const g = new Duel(dc, "pick-card", [FOOLISH_BURIAL, MONSTER_REBORN, ELF, ELF, ELF]);
    g.play(FOOLISH_BURIAL, CMD_ACTIVATE);
    expect(g.last.type).toBe("SELECT_CARD");
    let s = shown(g.out);
    expect(s.lists).toHaveLength(1);
    expect(s.lists[0].kind).toBe(LIST_ONE);
    expect(s.lists[0].ids).toHaveLength(g.last.selects.length);
    expect(s.views).toEqual([[0, LIST_ONE]]);
    const dm = g.items(DARK_MAGICIAN)[0];
    g.client(0x6426, u32(dm));
    g.client(0x6432, u32(dm, 1));
    expect(g.client(0x6423, u32(1))).toEqual({ type: "SELECT_CARD", indicies: [dm] });

    g.play(MONSTER_REBORN, CMD_ACTIVATE);
    expect([g.last.type, g.last.selects.map((x: any) => x.location)]).toEqual(["SELECT_CARD", [0x10]]);
    s = shown(g.out);
    expect([s.lists.map((l) => [l.kind, l.ids]), s.views]).toEqual([[[LIST_ONE, [g.yo2(DARK_MAGICIAN)]]], [[0, LIST_ONE]]]);
  }, 60_000);

  // The bug: SELECT_UNSELECT_CARD (aux.SelectUnselectGroup: Chaos Sorcerer banishes 1 LIGHT + 1 DARK from the
  // graveyard) only got a mask on the graveyard pile, so the player saw no card to pick.
  const sorcerer = (id: string, cfg: Record<string, unknown> = {}) => {
    const g = new Duel(dc, id, [FOOLISH_BURIAL, FOOLISH_BURIAL, CHAOS_SORCERER, ELF, ELF], cfg);
    g.bury(DARK_MAGICIAN);
    g.bury(ELF);
    g.play(CHAOS_SORCERER, CMD_SPSUMMON);
    expect(g.last.type).toBe("SELECT_UNSELECT_CARD");
    expect(g.last.select_cards.map((x: any) => x.code).sort()).toEqual([ELF, DARK_MAGICIAN].sort());
    return g;
  };

  it("unselect_list off (py): only a mask on the graveyard pile, no card list", () => {
    const g = sorcerer("pick-unsel-py", { unselect_list: false });
    const s = shown(g.out);
    expect([s.lists, s.views, s.request, g.d.state.mode]).toEqual([[], [], true, "unselect"]);
  }, 60_000);

  it("SELECT_UNSELECT_CARD from the graveyard (Chaos Sorcerer): the card list; both cards in one list, the summon follows", () => {
    const g = sorcerer("pick-unsel");
    const s = shown(g.out);
    // can_cancel (nothing picked yet): kind LIST_ANY, right click may close it empty
    expect([s.lists.length, s.lists[0].kind, s.lists[0].ids.length, s.views, s.request]).toEqual([1, LIST_ANY, 2, [[0, LIST_ANY]], false]);
    const dm = g.items(DARK_MAGICIAN)[0], elf = g.items(ELF)[0];
    g.client(0x6432, u32(dm, 1));
    g.client(0x6432, u32(elf, 2));
    const first = g.client(0x6423, u32(2));
    expect(first).toEqual({ type: "SELECT_UNSELECT_CARD", index: dm });
    // the second prompt took the other marked card by itself: the summon goes on (position, then the next idle)
    expect(g.last.type).not.toBe("SELECT_UNSELECT_CARD");
    const q = dc.query("pick-unsel") as any;
    expect(q.players[0].removed.map((c: any) => c.code).sort()).toEqual([ELF, DARK_MAGICIAN].sort());
  }, 60_000);

  it("SELECT_UNSELECT_CARD: one card marked, the next prompt (no cancel) opens LIST_ONE; closing empty cancels", () => {
    const g = sorcerer("pick-unsel-one");
    const elf = g.items(ELF)[0];
    g.client(0x6432, u32(elf, 1));
    expect(g.client(0x6423, u32(1))).toEqual({ type: "SELECT_UNSELECT_CARD", index: elf });
    expect([g.last.type, g.last.can_cancel, g.last.can_finish, g.last.select_cards.map((x: any) => x.code)])
      .toEqual(["SELECT_UNSELECT_CARD", false, false, [DARK_MAGICIAN]]);
    const s = shown(g.out);
    expect([s.lists.map((l) => [l.kind, l.ids]), s.views]).toEqual([[[LIST_ONE, [g.yo2(DARK_MAGICIAN)]]], [[0, LIST_ONE]]]);
    g.client(0x6426, u32(0));
    g.client(0x6432, u32(0, 1));
    expect(g.client(0x6423, u32(1))).toEqual({ type: "SELECT_UNSELECT_CARD", index: 0 });

    const h = sorcerer("pick-unsel-cancel");
    expect(h.client(0x6423, u32(0))).toEqual({ type: "SELECT_UNSELECT_CARD", index: null });
    expect(h.last.type).toBe("SELECT_IDLECMD");
    expect((dc.query("pick-unsel-cancel") as any).players[0].grave.length).toBe(4);
  }, 60_000);
});

describe.skipIf(!haveData)("a list prompt never shows the other side's face-down cards", () => {
  it("an opponent's set card among the candidates wears its cover, a graveyard card shows", () => {
    const MIRROR_FORCE = 44095762;
    const d = new YO2Duel([{ main: Array(40).fill(ELF), extra: [] }, { main: [MIRROR_FORCE, ...Array(39).fill(ELF)], extra: [] }],
      { first: 0, cardmap: cardmap(), rng: new PyRandom(1) });
    d.start();
    const s1 = d.side[1];
    const set = s1.deck.find((u) => d.card(u).code === MIRROR_FORCE)!, gy = s1.deck.find((u) => d.card(u).code === ELF)!;
    s1.deck = s1.deck.filter((u) => u !== set && u !== gy);
    s1.sz[0] = set; d.card(set).face = false;                    // set face-down in the opponent's spell & trap zone
    s1.grave.push(gy); d.card(gy).face = true;
    const out = d._s_SELECT_CARD({ ev: "select", type: "SELECT_CARD", player: 0, min: 1, max: 1, cancelable: false,
      selects: [{ controller: 1, location: 8, sequence: 0, code: MIRROR_FORCE }, { controller: 1, location: 16, sequence: 0, code: ELF }] } as any);
    const list = out.find((m) => Array.isArray(m) && m[0] === M_LIST) as Msg | undefined;
    expect(list).toBeDefined();
    const body = Buffer.from(list![1]);
    const has = (pc: number) => body.includes(Buffer.from(u32(pc)));
    expect(has(ELF)).toBe(true);
    expect(has(MIRROR_FORCE)).toBe(false);
  });
});
