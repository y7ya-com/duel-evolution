import { beforeAll, expect, it } from "vitest";
import { createNodeDuelCore } from "../src/duel/engine/node.ts";
import type { DuelCore, Json, NewOptions, SetupCard } from "../src/duel/engine/core.ts";
import { YUGI_DECKS } from "../src/duel/yugiDecks.ts";
import { buildServer } from "../src/server.ts";
import { configFrom, DUEL_PORT } from "../src/config.ts";
import { Conn } from "../src/net/conn.ts";
import { OcgSession } from "../src/duel/ocgSession.ts";
import { setDuelCore } from "../src/duel/data.ts";
import { W } from "../src/net/proto.ts";
import { code, passive, activating } from "./npcScenario.ts";

let dc: DuelCore, seq = 0;
beforeAll(async () => { dc = await createNodeDuelCore(); }, 60000);
const filler = () => ["Mystical Elf", "Petit Moth", "Giant Soldier of Stone", "Beaver Warrior"].flatMap(n => Array(3).fill(code(n)));
const identity = (c: number) => dc.cardDB.get(c)?.alias || c;
const canonical = (evs: Json[]) => evs.map(({id, ms, ...e}) => e);

function run(o: { first?: 0 | 1; limit?: 3 | null; main?: number[]; cards?: SetupCard[]; pool?: number[]; turns?: number;
  pick?: (sel: Json, n: number) => number; npc?: (sel: Json) => Json | null; player?: (sel: Json) => Json | null; auto?: boolean }) {
  const id = `yugi-copies-${++seq}`;
  const decks = [{main: filler(), extra: []}, {main: o.main ?? filler(), extra: []}];
  const opts: NewOptions = { first: o.first ?? 1, seed: 88, rule: "MR1", shuffle: false, brain: [true, true], heart_of_cards: 1,
    heart_pool: o.pool ?? [code("Raigeki"), code("Book of Moon")], heart_copy_limit: o.limit === null ? undefined : 3,
    setup: {draw: 0, cards: o.cards ?? []} };
  let evs = dc.new(id, decks, opts), ended = false;
  const msgs: Json[] = [], prompts: Json[] = [], batches: Json[][] = [], commands: {r?: Json; p?: number}[] = [];
  try {
    for (let n = 0; n < 1000; n++) {
      batches.push(canonical(evs));
      msgs.push(...evs.filter(e => e.ev === "msg"));
      const s = evs.at(-1)!;
      if (s.ev === "end") { ended = true; break; }
      expect(s.ev).toBe("select"); expect(s.retry).toBeFalsy();
      if (Number(s.turn) > (o.turns ?? 14)) break;
      let r: Json | null;
      if (s.heart_of_cards) {
        const c = o.pick?.(s, prompts.length) ?? Number((s.heart_pool as number[])[0]);
        prompts.push(s);
        r = o.auto ? null : {type: "ANNOUNCE_CARD", card: c};
      } else r = Number(s.player) === 1 ? (o.npc ?? passive)(s) : (o.player ?? passive)(s);
      commands.push(r ? {r, p: Number(s.player)} : {});
      evs = r ? dc.respond(id, r, Number(s.player)) : dc.auto(id);
    }
    return {decks, opts, msgs, prompts, batches, commands};
  } finally { if (!ended) dc.end(id); }
}
const drawn = (r: ReturnType<typeof run>) => r.msgs.filter(e => e.type === "DRAW" && e.player === 1).flatMap(e => (e.drawn as Json[]).map(d => Number(d.code)));

it.each([0, 1] as const)("allows three new copies across turns, then switches cards and draws normally when exhausted, first %i", first => {
  const r = run({first});
  expect(drawn(r).filter(c => c === code("Raigeki"))).toHaveLength(3);
  expect(drawn(r).filter(c => c === code("Book of Moon"))).toHaveLength(3);
  expect(drawn(r).length).toBeGreaterThan(6);
  expect(r.prompts).toHaveLength(6);
  expect(r.prompts[3]!.heart_pool).not.toContain(code("Raigeki"));
});

it("auto responses obey the same cap", () => {
  const r = run({auto: true});
  expect(drawn(r).filter(c => c === code("Raigeki"))).toHaveLength(3);
  expect(drawn(r).filter(c => c === code("Book of Moon"))).toHaveLength(3);
  expect(r.prompts).toHaveLength(6);
});

it("the built-in engine bot cannot bypass the cap", () => {
  const id = "yugi-copy-native-bot", d = {main: filler(), extra: []}, msgs: Json[] = [];
  let evs = dc.new(id, [d, d], {first: 1, seed: 44, lp: 100000, rule: "MR1", shuffle: false, brain: [true, false], bot: [false, true],
    heart_of_cards: 1, heart_copy_limit: 3, heart_pool: [code("Raigeki"), code("Book of Moon")], setup: {draw: 0}});
  try {
    for (let n = 0; n < 100; n++) {
      msgs.push(...evs.filter(e => e.ev === "msg"));
      const s = evs.at(-1)!;
      if (s.ev === "end" || Number(s.turn) > 16) break;
      expect(s.ev).toBe("select"); expect(s.player).toBe(0); expect(s.retry).toBeFalsy();
      const r = passive(s); evs = r ? dc.respond(id, r, 0) : dc.auto(id);
    }
    const draws = msgs.filter(m => m.type === "DRAW" && m.player === 1).flatMap(m => (m.drawn as Json[]).map(c => c.code));
    expect(draws.filter(c => c === code("Raigeki"))).toHaveLength(3);
    expect(draws.filter(c => c === code("Book of Moon"))).toHaveLength(3);
    expect(draws.length).toBeGreaterThan(6);
  } finally { dc.end(id); }
});

it("counts original deck, hand, field, grave and banished copies, including alternate artworks", () => {
  const r = run({pool: [46986414, code("Raigeki")], main: [46986414, ...filler()], cards: [
    {player: 1, location: "hand", code: 36996508}, {player: 1, location: "grave", code: 46986415},
    {player: 1, location: "mzone", code: code("Raigeki")}, {player: 1, location: "removed", code: code("Raigeki")},
  ], turns: 4});
  expect(r.prompts[0]!.heart_pool).toEqual([code("Raigeki")]);
  expect(drawn(r).filter(c => c === code("Raigeki"))).toHaveLength(1);
  expect(r.prompts).toHaveLength(1);
});

it("drawing original copies at the three-copy limit does not create extra copies or charge them twice", () => {
  const r = run({main: [...filler(), ...Array(3).fill(code("Raigeki"))]});
  expect(drawn(r).filter(c => c === code("Raigeki"))).toHaveLength(3);
  expect(r.prompts.slice(0, 3).every(s => (s.heart_pool as number[]).includes(code("Raigeki")))).toBe(true);
  expect(r.prompts[3]!.heart_pool).not.toContain(code("Raigeki"));
});

it("does not count the opponent's copies against Yugi's allowance", () => {
  const r = run({cards: Array.from({length: 3}, (): SetupCard => ({player: 0, location: "hand", code: code("Raigeki")}))});
  expect(drawn(r).filter(c => c === code("Raigeki"))).toHaveLength(3);
});

it("used copies in the graveyard keep their allowance spent", () => {
  const r = run({cards: Array.from({length: 3}, (): SetupCard => ({player: 0, location: "hand", code: code("Heavy Storm")})),
    npc: s => s.type === "SELECT_IDLECMD" && (s.spell_sets as Json[]).some(c => c.code === code("Raigeki"))
      ? {type: "SELECT_IDLECMD", action: "SELECT_SPELL_SET", index: (s.spell_sets as Json[]).findIndex(c => c.code === code("Raigeki"))} : passive(s),
    player: activating("Heavy Storm")});
  expect(r.msgs.filter(m => m.type === "MOVE" && m.card === code("Raigeki") && (m.from as Json)?.location === 8 && (m.to as Json)?.location === 16)).toHaveLength(3);
  expect(drawn(r).filter(c => c === code("Raigeki"))).toHaveLength(3);
});

it("returning and redrawing the same materialised copy neither spends nor restores an allowance", () => {
  const r = run({pool: [code("Raigeki")], turns: 8, cards: [
    ...Array.from({length: 2}, (): SetupCard => ({player: 1, location: "grave", code: code("Raigeki")})),
    {player: 0, location: "hand", code: code("Petit Moth")}, {player: 0, location: "szone", code: code("Phoenix Wing Wind Blast"), pos: "set"}],
    npc: s => s.type === "SELECT_IDLECMD" && (s.spell_sets as Json[]).some(c => c.code === code("Raigeki"))
      ? {type: "SELECT_IDLECMD", action: "SELECT_SPELL_SET", index: (s.spell_sets as Json[]).findIndex(c => c.code === code("Raigeki"))} : passive(s),
    player: s => Number(s.turn) === 2 ? activating("Phoenix Wing Wind Blast")(s) : passive(s)});
  expect(r.msgs.some(m => m.type === "MOVE" && m.card === code("Raigeki") && (m.from as Json)?.location === 8 && (m.to as Json)?.location === 1)).toBe(true);
  expect(drawn(r).filter(c => c === code("Raigeki"))).toHaveLength(2);
  expect(r.prompts).toHaveLength(2);
});

it("updates the legal pool between cards of one Pot of Greed draw", () => {
  const r = run({cards: [{player: 1, location: "hand", code: code("Pot of Greed")},
    ...Array.from({length: 2}, (): SetupCard => ({player: 1, location: "grave", code: code("Raigeki")}))],
    turns: 1, pick: (s, n) => n === 0 ? code("Book of Moon") : (s.heart_pool as number[])[0]!, npc: activating("Pot of Greed")});
  const draws = r.msgs.filter(m => m.type === "DRAW" && m.player === 1);
  expect(draws.map(m => (m.drawn as Json[]).length)).toEqual([1, 2]);
  expect((draws[1]!.drawn as Json[]).map(c => c.code)).toEqual([code("Raigeki"), code("Book of Moon")]);
  expect(r.prompts[2]!.heart_pool).not.toContain(code("Raigeki"));
});

it("rejects a forged fourth-copy choice without consuming the pending legal prompt", () => {
  const id = "yugi-copy-forged", d = {main: filler(), extra: []};
  const evs = dc.new(id, [d, d], {first: 1, rule: "MR1", brain: [true, true], shuffle: false, heart_of_cards: 1,
    heart_pool: [code("Raigeki"), code("Book of Moon")], heart_copy_limit: 3,
    setup: {draw: 0, cards: Array.from({length: 3}, (): SetupCard => ({player: 1, location: "grave", code: code("Raigeki")}))}});
  try {
    expect(evs.at(-1)?.heart_pool).toEqual([code("Book of Moon")]);
    const bad = dc.respond(id, {type: "ANNOUNCE_CARD", card: code("Raigeki")}, 1);
    expect(bad.at(-1)?.ev).toBe("error"); expect(String(bad.at(-1)?.error)).toContain("three-copy limit");
    const good = dc.respond(id, {type: "ANNOUNCE_CARD", card: code("Book of Moon")}, 1);
    expect(good.some(e => e.ev === "msg" && e.type === "DRAW" && (e.drawn as Json[])[0]?.code === code("Book of Moon"))).toBe(true);
  } finally { dc.end(id); }
});

it("replays the changing pool and exhausted fallback exactly", () => {
  const r = run({}), id = "yugi-copy-replay";
  try {
    expect(canonical(dc.new(id, r.decks, r.opts))).toEqual(r.batches[0]);
    r.commands.forEach((c, i) => expect(canonical(c.r ? dc.respond(id, c.r, c.p) : dc.auto(id))).toEqual(r.batches[i + 1]));
  } finally { dc.end(id); }
});

it("retains the old unlimited semantics only for archives without the versioned cap option", () => {
  const r = run({limit: null, pool: [code("Raigeki")], turns: 9});
  expect(drawn(r).filter(c => c === code("Raigeki")).length).toBeGreaterThan(3);
});

it.each([51, 52, 53])("production Yugi stage %i always starts capped at full strength", async npc => {
  setDuelCore(dc);
  const srv = buildServer(configFrom({PARITY_SEED: "1", DUEL_PAUSE: "0.0005"}), {accounts: {}}, () => {});
  const conn = new Conn(srv.world, srv.world.seqTable, DUEL_PORT, "copy-test", () => true, DUEL_PORT);
  const s = new OcgSession(srv.game, conn, () => {}, npc, 0.0005);
  const d = YUGI_DECKS["51"]!, pack = (cs: number[]) => { const w = new W().u32(cs.length); for (const c of cs) w.u32(c); return w.bytes(); };
  try {
    s.clientDeck(0x6601, pack(d.main)); s.clientDeck(0x6603, pack(d.extra));
    await s.start(0);
    const rec = (s as any).rec;
    expect(rec.opts.heart_copy_limit).toBe(3); expect(rec.opts.heart_of_cards).toBe(1); expect(rec.tier).toBe("elite");
    expect(rec.opts.heart_opening).toHaveLength(5);
    const counts = new Map<number, number>();
    for (const c of [...YUGI_DECKS[String(npc)]!.main, ...YUGI_DECKS[String(npc)]!.extra]) counts.set(identity(c), (counts.get(identity(c)) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
  } finally { s.surrender(); setDuelCore(null); }
}, 60000);
