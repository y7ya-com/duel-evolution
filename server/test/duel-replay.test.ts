// The EDOPro replay (.yrpX, src/duel/engine/yrpx.ts): a recorded duel's file reads back as EDOPro reads it (header,
// names, flags, packets), opens with MSG_START, carries the engine's own messages in order (the prompts and private
// hints left out), every field refresh parses as EDOPro's Query::Parse reads it, and it ends with the duel's MSG_WIN.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { npcDeck, toCodes } from "../src/duel/data.ts";
import { PY_DUEL_RULE, type DuelCore, type Json } from "../src/duel/engine/core.ts";
import { createNodeDuelCore, ENGINE_DATA_DIR } from "../src/duel/engine/node.ts";
import { MSG, readYrpx } from "../src/duel/engine/yrpx.ts";

const haveData = existsSync(join(ENGINE_DATA_DIR, "scripts.pack"));
const PROMPTS = new Set([1, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 132, 140, 141, 142, 143]);

/** EDOPro's Query::Parse over one card query; returns where it stopped. */
function parseQuery(d: Uint8Array, at: number): number {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  for (;;) {
    const size = dv.getUint16(at, true);
    at += 2;
    if (size === 0) return at;
    const flag = dv.getUint32(at, true);
    at += size;
    if (flag === 0x80000000) return at;
    if (at > d.length) throw new Error("query runs past its packet");
  }
}

/** The duel's messages as the engine reported them (type ids), for the ones a replay keeps. */
function play(dc: DuelCore, id: string, first: 0 | 1, seed: number, surrenderAt = 0) {
  const a = npcDeck(35)!, b = npcDeck(53)!;
  const decks = [{ main: toCodes(a.main), extra: toCodes(a.extra) }, { main: toCodes(b.main), extra: toCodes(b.extra) }];
  // both seats as brains, every decision through `auto`: the duel runs as many commands and batches as a hosted one
  let evs = dc.new(id, decks, { first, seed, shuffle: true, rule: PY_DUEL_RULE, brain: [true, true], auto_chain: true, record: true });
  const types: number[] = [];
  let last: Json = evs[evs.length - 1]!;
  for (let n = 0; ; n++) {
    // what EDOPro's server records: no prompts, no private hints
    for (const e of evs) if (e.ev === "msg" && !PROMPTS.has(Number(e.type_id)) && !(Number(e.type_id) === MSG.HINT && [1, 2, 3, 5].includes(Number(e.hint_type)))) types.push(Number(e.type_id));
    last = evs[evs.length - 1]!;
    if (last.ev === "end") break;
    if (last.ev === "error") throw new Error(String(last.error));
    if (surrenderAt && n >= surrenderAt) { last = dc.surrender(id, 0).at(-1)!; break; }
    evs = dc.auto(id);
  }
  return { types, last };
}

describe.skipIf(!haveData)("the EDOPro replay", () => {
  let dc: DuelCore;
  beforeAll(async () => { dc = await createNodeDuelCore(); }, 60_000);

  it.each([[0, 11], [1, 12]] as const)("a whole duel (first %i): readable as EDOPro reads it, same messages, ends on the WIN", (first, seed) => {
    const id = `rep-${first}`;
    const { types, last } = play(dc, id, first, seed);
    expect(last.ev).toBe("end");
    const file = dc.takeReplay(id, { names: ["Player", "Fan de OVNIS"], at: 1794400000 })!;
    expect(dc.takeReplay(id, { names: ["a", "b"], at: 0 })).toBe(null);   // once
    const r = readYrpx(file);
    expect(r.names).toEqual(first === 1 ? ["Fan de OVNIS", "Player"] : ["Player", "Fan de OVNIS"]);   // core player 0 = who goes first
    expect(r.at).toBe(1794400000);
    expect(r.packets[0]!.message).toBe(MSG.START);
    expect(r.packets[0]!.data.length).toBe(17);
    const kept = r.packets.filter((p) => p.message !== MSG.UPDATE_DATA && p.message !== MSG.UPDATE_CARD && p.message !== MSG.START);
    expect(kept.map((p) => p.message)).toEqual(types);
    for (const p of r.packets) {
      if (p.message === MSG.UPDATE_DATA) {
        const dv = new DataView(p.data.buffer, p.data.byteOffset, p.data.byteLength);
        const size = dv.getUint32(2, true);
        expect(size + 6).toBe(p.data.length);
        let at = 6;
        while (at < p.data.length) at = parseQuery(p.data, at);
        expect(at).toBe(p.data.length);
      } else if (p.message === MSG.UPDATE_CARD) {
        expect(parseQuery(p.data, 3)).toBe(p.data.length);
      }
    }
    const win = r.packets.at(-1)!;
    expect(win.message).toBe(MSG.WIN);
    const w = win.data[0]!;
    expect(first === 1 ? 1 - w : w).toBe(last.winner);   // the WIN names the core player
  }, 120_000);

  it("a surrender ends the replay with EDOPro's surrender WIN", () => {
    play(dc, "rep-s", 0, 13, 20);
    const r = readYrpx(dc.takeReplay("rep-s", { names: ["Player", "NPC"], at: 1 })!);
    const win = r.packets.at(-1)!;
    expect([win.message, win.data[0], win.data[1]]).toEqual([MSG.WIN, 1, 0]);
  }, 120_000);

  it("a duel without record has no replay", () => {
    const d = npcDeck(35)!;
    dc.new("rep-none", [{ main: toCodes(d.main), extra: [] }, { main: toCodes(d.main), extra: [] }], { first: 0, seed: 1, bot: [true, true] });
    dc.end("rep-none");
    expect(dc.takeReplay("rep-none", { names: ["a", "b"], at: 0 })).toBe(null);
  }, 60_000);
});
