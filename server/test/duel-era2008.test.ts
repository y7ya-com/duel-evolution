import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { OcgCoreSync, OcgResponse } from "ocgcore-wasm";
import { OcgDuelMode, OcgMessageType as T, OcgResponseType as R, SelectIdleCMDAction as A, OcgQueryFlags as Q } from "ocgcore-wasm";
import { createNodeDuelCore, ENGINE_DATA_DIR, loadEngineData } from "../src/duel/engine/node.ts";
import { COMPAT_CHAININFO_LUA, type DuelCore } from "../src/duel/engine/core.ts";
import { ScriptPack } from "../src/duel/engine/data.ts";
import { ERA_2008 } from "../src/duel/engine/era2008.ts";
import { Duel, type SelectMessage } from "../src/duel/engine/duel.ts";
import { Bot } from "../src/duel/engine/bot.ts";

const have = existsSync(join(ENGINE_DATA_DIR, "scripts.pack"));
describe.skipIf(!have)("September 2008 effects", () => {
  let dc: DuelCore, core: OcgCoreSync, scripts: ScriptPack;
  const duels: Duel[] = [];
  beforeAll(async () => {
    dc = await createNodeDuelCore();
    core = (dc as unknown as { core: OcgCoreSync }).core;
    scripts = new ScriptPack(loadEngineData().scripts);
  });
  afterEach(() => { for (const d of duels.splice(0)) d.destroy(); });

  // Preload real core positions before starting; no mocked effects or source-string assertions.
  function setup(cards: [number, number, number, number?][], modern = false) {
    const errors: string[] = [];
    const team = { startingLP: 8000, startingDrawCount: 0, drawCountPerTurn: 0 };
    const h = core.createDuel({ flags: OcgDuelMode.MODE_MR1, seed: [1n, 2n, 3n, 4n], team1: team, team2: team,
      cardReader: c => dc.cardDB.get(c), scriptReader: n => modern ? scripts.read(n) : scripts.read2008(n),
      errorHandler: (_t, s) => { if (!/not found|cannot open/.test(s)) errors.push(s); },
    });
    if (!h) throw new Error("createDuel failed");
    for (const n of ["constant.lua", "utility.lua"]) core.loadScript(h, n, scripts.read(n)!);
    core.loadScript(h, "yo2_compat.lua", COMPAT_CHAININFO_LUA);
    const seq = new Map<string, number>();
    for (const [code, p, location, position = 1] of cards) {
      const key = `${p}/${location}`, index = seq.get(key) ?? 0;
      core.duelNewCard(h, { code, team: p as 0 | 1, duelist: 0, controller: p as 0 | 1, location,
        sequence: code === 47355498 ? 5 : index, position } as Parameters<typeof core.duelNewCard>[1]);
      seq.set(key, index + 1);
    }
    const d = new Duel(core, h); duels.push(d); core.startDuel(h);
    const bot = new Bot(c => dc.cardDB.get(c));
    const events: any[] = [];
    let waiting: SelectMessage;
    function next(response?: OcgResponse) {
      if (response) d.respond(response);
      const r = d.step(); events.push(...r.messages);
      expect(errors).toEqual([]);
      expect(r.messages.some(m => m.type === T.RETRY)).toBe(false);
      waiting = r.waiting!;
      return waiting;
    }
    function answer() {
      if (waiting.type === T.SELECT_CHAIN && !waiting.forced) return next({ type: R.SELECT_CHAIN, index: null });
      return next(bot.choose(waiting));
    }
    function until(predicate: (s: any) => boolean) {
      for (let n = 0; n < 100; n++) {
        if (predicate(waiting)) return waiting as any;
        if (!waiting) throw new Error("duel ended before expected selection");
        answer();
      }
      throw new Error("selection not reached");
    }
    const codes = (p: number, location: number) => core.duelQueryLocation(h, { controller: p as 0 | 1, location,
      flags: Q.CODE | Q.POSITION } as Parameters<typeof core.duelQueryLocation>[1]).filter(Boolean);
    next();
    return { next, answer, until, events, codes };
  }
  const filler = (p = 0, count = 20): [number, number, number][] => Array.from({ length: count }, () => [15025844, p, 1]);

  it("reports every legacy override and can initialize every affected card", () => {
    expect(dc.ready.scripts_2008).toEqual(scripts.scripts2008);
    for (const code of Object.keys(ERA_2008).map(Number)) {
      const type = dc.cardDB.get(code)!.type;
      const p = setup([[code, 0, type & 1 ? 4 : 8], ...filler(), ...filler(1)]);
      expect(p.events.length).toBeGreaterThan(0);
    }
  });

  it.each([false, true])("Brain Control can target a Fusion monster only with old rules (modern=%s)", modern => {
    const p = setup([[87910978, 0, 2], [23995346, 1, 4], ...filler(), ...filler(1)], modern);
    const s = p.until(s => s?.type === T.SELECT_IDLECMD);
    const index = s.activates.findIndex((c: any) => c.code === 87910978);
    expect(index >= 0).toBe(!modern);
    if (!modern) {
      p.next({ type: R.SELECT_IDLECMD, action: A.SELECT_ACTIVATE, index });
      p.until(s => s?.type === T.SELECT_CARD);
      p.answer();
      p.until(s => s?.type === T.SELECT_IDLECMD);
      expect(p.codes(0, 4)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 23995346 })]));
    }
  });

  it.each([false, true])("Exchange needs fifteen cards only in your own graveyard (modern=%s)", modern => {
    const p = setup([[17484499, 0, 8, 8], ...Array.from({ length: 15 }, (): [number, number, number] => [15025844, 0, 16]),
      [15025844, 1, 16], ...filler(), ...filler(1)], modern);
    const s = p.until(s => s?.type === T.SELECT_IDLECMD);
    expect(s.activates.some((c: any) => c.code === 17484499)).toBe(!modern);
  });

  it("Ring can destroy your own monster and damages both players", () => {
    const p = setup([[83555666, 0, 8, 8], [15025844, 0, 4], ...filler(), ...filler(1)]);
    const s = p.until(s => s?.type === T.SELECT_IDLECMD);
    const index = s.activates.findIndex((c: any) => c.code === 83555666);
    expect(index).toBeGreaterThanOrEqual(0);
    p.next({ type: R.SELECT_IDLECMD, action: A.SELECT_ACTIVATE, index });
    const target = p.until(s => s?.type === T.SELECT_CARD);
    expect(target.selects[0]).toMatchObject({ controller: 0, code: 15025844 });
    p.answer(); p.until(s => s?.type === T.SELECT_IDLECMD);
    expect(p.events.filter(e => e.type === T.DAMAGE).map(e => [e.player, e.amount]).sort()).toEqual([[0, 800], [1, 800]]);
    expect(p.codes(0, 16)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 15025844 })]));
  });

  it("Imperial Order lets its controller decline upkeep and destroys itself", () => {
    const p = setup([[61740673, 0, 8], ...filler(), ...filler(1)]);
    p.until(s => s?.type === T.SELECT_YESNO);
    p.next({ type: R.SELECT_YESNO, yes: false });
    p.until(s => s?.type === T.SELECT_IDLECMD);
    expect(p.events.some(e => e.type === T.PAY_LPCOST)).toBe(false);
    expect(p.codes(0, 16)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 61740673 })]));
  });

  it("Future Fusion sends materials when activated, before any later Standby Phase", () => {
    const p = setup([[77565204, 0, 2], [88819587, 0, 1], [71625222, 0, 1], [41462083, 0, 64], ...filler(), ...filler(1)]);
    const s = p.until(s => s?.type === T.SELECT_IDLECMD);
    const index = s.activates.findIndex((c: any) => c.code === 77565204);
    expect(index).toBeGreaterThanOrEqual(0);
    p.next({ type: R.SELECT_IDLECMD, action: A.SELECT_ACTIVATE, index });
    p.until(s => s?.type === T.SELECT_IDLECMD);
    expect(p.codes(0, 16).map(c => c!.code).sort()).toEqual([71625222, 88819587]);
    expect(p.events.filter(e => e.type === T.NEW_TURN)).toHaveLength(1);
    for (let turn = 2; turn <= 5; turn++) {
      p.next({ type: R.SELECT_IDLECMD, action: A.TO_EP, index: null });
      p.until(s => s?.type === T.SELECT_IDLECMD);
      const fused = p.codes(0, 4).some(c => c!.code === 41462083);
      expect(fused).toBe(turn === 5);
    }
  });
  it("Chaos Emperor Dragon burns for cards sent from BOTH sides", () => {
    const p = setup([[82301904, 0, 4], [15025844, 0, 2], [15025844, 1, 4], [15025844, 1, 2], ...filler(), ...filler(1)]);
    const s = p.until(s => s?.type === T.SELECT_IDLECMD);
    p.next({ type: R.SELECT_IDLECMD, action: A.SELECT_ACTIVATE, index: s.activates.findIndex((c: any) => c.code === 82301904) });
    p.until(s => s?.type === T.SELECT_IDLECMD);
    expect(p.events.filter(e => e.type === T.DAMAGE).map(e => [e.player, e.amount])).toEqual([[1, 1200]]);
  });

  it("Temple permits more than one newly set Trap in a turn", () => {
    const p = setup([[29762407, 0, 8], [83968380, 0, 8, 8], [83968380, 0, 8, 8], ...filler(), ...filler(1)]);
    for (let n = 0; n < 2; n++) {
      const s = p.until(s => s?.type === T.SELECT_IDLECMD);
      const index = s.activates.findIndex((c: any) => c.code === 83968380);
      expect(index).toBeGreaterThanOrEqual(0);
      p.next({ type: R.SELECT_IDLECMD, action: A.SELECT_ACTIVATE, index });
    }
    p.until(s => s?.type === T.SELECT_IDLECMD);
    expect(p.codes(0, 16).filter(c => c!.code === 83968380)).toHaveLength(2);
  });

  it("Darkness Approaches preserves Attack Position when setting a monster", () => {
    const p = setup([[80168720, 0, 2], [15025844, 0, 2], [15025844, 0, 2], [15025844, 0, 4], ...filler(), ...filler(1)]);
    const s = p.until(s => s?.type === T.SELECT_IDLECMD);
    p.next({ type: R.SELECT_IDLECMD, action: A.SELECT_ACTIVATE, index: s.activates.findIndex((c: any) => c.code === 80168720) });
    p.until(s => s?.type === T.SELECT_IDLECMD);
    expect(p.codes(0, 4)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 15025844, position: 2 })]));
  });

  it("Red-Eyes Darkness Metal Dragon's summon effect is once per copy", () => {
    const p = setup([[88264978, 0, 4], [88264978, 0, 4], [88819587, 0, 2], [88819587, 0, 2], ...filler(), ...filler(1)]);
    for (let n = 0; n < 2; n++) {
      const s = p.until(s => s?.type === T.SELECT_IDLECMD);
      const index = s.activates.findIndex((c: any) => c.code === 88264978);
      expect(index).toBeGreaterThanOrEqual(0);
      p.next({ type: R.SELECT_IDLECMD, action: A.SELECT_ACTIVATE, index });
    }
    p.until(s => s?.type === T.SELECT_IDLECMD);
    expect(p.codes(0, 4).filter(c => c!.code === 88819587)).toHaveLength(2);
  });

  it("Necrovalley allows a graveyard card to return itself", () => {
    const p = setup([[47355498, 0, 8, 1], [8131171, 0, 16], ...filler(), ...filler(1)]);
    p.until(s => s?.type === T.SELECT_IDLECMD);
    expect(p.codes(0, 2)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 8131171 })]));
  });

});
