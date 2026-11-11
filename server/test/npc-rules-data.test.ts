// The NPC card rules as data: the format (src/duel/ai/ruleExpr.ts), the live overlay over rules.json (ruleSet.ts), its
// versions in D1 and the admin endpoint's push / dry run / revert (duel/aiRulesStore.ts), and what a duel plays by.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RuleCtx } from "../src/duel/ai/cardRules.ts";
import { compileRule, compileSet, mergeSets, RuleError } from "../src/duel/ai/ruleExpr.ts";
import { activeRules, buildRules, bundledRules, rulesOf, setActiveRules } from "../src/duel/ai/ruleSet.ts";
import { HeuristicBot, NpcAi, type CardInfo } from "../src/duel/ai/index.ts";
import { brainDb } from "../src/duel/data.ts";
import { aiRulesPost, aiRulesView, loadAiRules } from "../src/duel/aiRulesStore.ts";

const ctx: RuleCtx = { myLp: 8000, oppLp: 8000, myMon: [], oppMon: [], myMaxAtk: 0, oppMaxAtk: 0, myBackrow: 0, oppBackrow: 0,
  myGraveMaxAtk: 0, oppGraveMaxAtk: 0, oppHand: 3, myHand: 2, myHandTributes: 0, myRemoved: 0, myTurn: false, oppEndPhase: false,
  attackAtk: 0, attackLethal: false, attackOnDefense: false, oppChained: false, myNames: [] };
const mon = (atk: number, more = {}) => ({ atk, def: 1000, faceDown: false, attackPos: true, ...more });
const err = (f: () => unknown): string => { try { f(); } catch (e) { if (e instanceof RuleError) return e.message; throw e; } return "no error"; };

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
function d1(): D1Database {
  const db = new DatabaseSync(":memory:");
  for (const m of ["0008_duel_archive.sql", "0009_npc_ai_rules.sql"]) db.exec(readFileSync(join(import.meta.dirname, "../migrations", m), "utf8").replaceAll("--> statement-breakpoint", ""));
  const stmt = (sql: string, args: unknown[] = []): any => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...(args as any[])) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(args as any[])) }),
    run: async () => db.prepare(sql).run(...(args as any[])),
  });
  return { prepare: (sql: string) => stmt(sql) } as any;
}

afterEach(() => setActiveRules(bundledRules()));

describe("the rule format", () => {
  it("compiles conditions, numbers and the monster aggregates", () => {
    const r = compileRule({
      idleActivate: { all: [{ ">=": [{ count: "oppMon", where: { ">=": ["atk", 1800] } }, 2] }, { canPay: 800 }] },
      chainReact: { any: [{ attacked: 1700 }, { all: ["oppEndPhase", { not: "myTurn" }] }] },
      summonScore: { if: [{ named: "gaia the fierce knight" }, 500, { "-": [0, { sum: "myMon", of: { floor: { "/": ["atk", 2] } } }] }] },
      option: { "/": [1, 0] },
      idlePriority: 90, keepInHand: false,
      number: { cover: { max: ["oppTopAtk", "attackAtk"] }, keep: 1000 },
    }, "t");
    expect(r.idleActivate!({ ...ctx, oppMon: [mon(1800), mon(2000)] })).toBe(true);
    expect(r.idleActivate!({ ...ctx, oppMon: [mon(1800), mon(1000)] })).toBe(false);
    expect(r.idleActivate!({ ...ctx, myLp: 1800, oppMon: [mon(1800), mon(2000)] })).toBe(false);
    expect([r.chainReact!({ ...ctx, attackAtk: 1700 }), r.chainReact!({ ...ctx, oppEndPhase: true }), r.chainReact!({ ...ctx, oppEndPhase: true, myTurn: true })]).toEqual([true, true, false]);
    expect(r.summonScore!({ ...ctx, myNames: ["gaia the fierce knight"] })).toBe(500);
    expect(r.summonScore!({ ...ctx, myMon: [mon(1501), mon(1000)] })).toBe(-1250);
    expect(r.option!(ctx)).toBe(0);   // x / 0 = 0, never a throw or NaN
    expect(r.number!({ ...ctx, myLp: 7400, oppMon: [mon(2300), mon(4000, { faceDown: true })] }, [1000, 2000, 3000, 4000])).toBe(2);
    expect([r.idlePriority, r.keepInHand]).toEqual([90, false]);
  });

  it("refuses what it does not know, saying where", () => {
    expect(err(() => compileRule({ idleActivate: "myLP" }, "r"))).toBe('r.idleActivate: unknown name "myLP"');
    expect(err(() => compileRule({ idleActivate: "myLp" }, "r"))).toMatch(/a number where a true\/false is needed/);
    expect(err(() => compileRule({ idleActivate: { ">=": ["myLp"] } }, "r"))).toMatch(/takes a list of 2/);
    expect(err(() => compileRule({ idleActivate: { xor: [true, false] } }, "r"))).toMatch(/unknown operator "xor"/);
    expect(err(() => compileRule({ idleActivate: { ">": ["atk", 1] } }, "r"))).toMatch(/only inside where \/ of/);
    expect(err(() => compileRule({ chainReact: true, whenever: true }, "r"))).toMatch(/unknown rule field "whenever"/);
    expect(err(() => compileRule({ idlePriority: "90" }, "r"))).toMatch(/a number/);
    const deep = Array.from({ length: 500 }).reduce<unknown>((e) => ({ not: e }), true);
    expect(err(() => compileRule({ idleActivate: deep }, "r"))).toMatch(/too big/);
    expect(err(() => compileSet({ staples: { "Pot of Greed": { idleActivate: true } } }))).toMatch(/lowercase/);
    expect(err(() => compileSet({ npcs: { abc: {} } }))).toMatch(/not an NPC id/);
    expect(err(() => compileSet({ cards: {} }))).toMatch(/unknown "cards"/);
  });

  it("an overlay replaces fields per card, null removes a field or the card's rule", () => {
    const merged = mergeSets({ staples: { a: { idleActivate: true, idlePriority: 90 }, b: { chainReact: true } }, npcs: { "84": { c: { summonScore: 1 } } } },
      { staples: { a: { idlePriority: 10, idleActivate: null }, b: null, d: { chainReact: false } }, npcs: { "84": { c: { yesNo: true } }, "85": { e: { keepInHand: true } } } });
    expect(merged).toEqual({ staples: { a: { idlePriority: 10 }, b: null, d: { chainReact: false } }, npcs: { "84": { c: { summonScore: 1, yesNo: true } }, "85": { e: { keepInHand: true } } } });
    const c = compileSet(merged);
    expect(Object.keys(c.staples).sort()).toEqual(["a", "d"]);
  });
});

describe("the live overlay", () => {
  const cards: CardInfo = { stat: (code) => ({ atk: code, def: 1000, level: 4 }), name: (code) => (code === 5318639 ? "mystical space typhoon" : ""), flipRisk: () => 0, brain: brainDb() };
  const mstWindow = () => ({ type: "SELECT_CHAIN", player: 0, turn: 1, turn_player: 1, phase: 4, lp: [8000, 8000], forced: false,
    selects: [{ code: 5318639, controller: 0, location: 8, sequence: 0, position: 10, description: 0 }],
    view: { players: [{ mzone: [], szone: [{ code: 5318639, position: 10, sequence: 0 }], hand: [] }, { mzone: [], szone: [{ code: 0, position: 10, sequence: 0 }], hand_count: 3 }] } });

  it("a bad overlay changes nothing; a good one plays from the next bot on, the ones already built keep theirs", () => {
    expect(err(() => buildRules({ staples: { "mystical space typhoon": { chainReact: "always" } } }, 1))).toMatch(/^overlay\.staples\["mystical space typhoon"\]\.chainReact: unknown name "always"/);
    const before = new HeuristicBot(0, cards);
    expect(before.choose(mstWindow())?.index).toBe(null);   // rules.json: held in the opponent's Main Phase
    setActiveRules(buildRules({ staples: { "mystical space typhoon": { chainReact: { ">=": ["oppBackrow", 1] } } } }, 7));
    expect(new HeuristicBot(0, cards).choose(mstWindow())?.index).toBe(0);
    expect(new HeuristicBot(0, cards).choose(mstWindow())?.index).toBe(0);
    expect(before.choose(mstWindow())?.index).toBe(null);
    expect(new NpcAi({ npcId: 51, seat: 0, seed: 1, cards, tier: "hard" }).rules.version).toBe(7);
  });

  it("an NPC's own rule for a card replaces the staple for that NPC, whole", () => {
    const set = buildRules({ npcs: { "84": { "pot of greed": { idlePriority: 1 } } } }, 2);
    expect([rulesOf(set, 84)["pot of greed"], rulesOf(set, 51)["pot of greed"]!.idlePriority]).toEqual([{ idlePriority: 1 }, 140]);
  });

  it("D1: versions pushed, a dry run stores nothing, a revert, the newest loaded at start", async () => {
    const db = d1();
    expect((await loadAiRules(db)).version).toBe(0);
    const [st0, bad] = await aiRulesPost(db, "u1", { overlay: { staples: { "pot of greed": { idleActivate: 1 } } } });
    expect([st0, bad.error]).toEqual([400, 'overlay.staples["pot of greed"].idleActivate: a number where a true/false is needed']);
    const one = { staples: { "pot of greed": { idlePriority: 1 } } }, two = { staples: { "dark hole": null } };
    expect((await aiRulesPost(db, "u1", { overlay: one, dryRun: true }))[1]).toMatchObject({ ok: true, dryRun: true, cards: ["pot of greed (idlePriority)"] });
    expect(activeRules().version).toBe(0);
    expect((await aiRulesPost(db, "u1", { overlay: one, note: "first" }))[1]).toMatchObject({ ok: true, version: 1 });
    expect((await aiRulesPost(db, "deploy", { overlay: two }))[1]).toMatchObject({ version: 2, cards: ["dark hole: no rule"] });
    expect(activeRules().compiled.staples["dark hole"]).toBeUndefined();
    expect((await aiRulesPost(db, "u1", { revert: 1 }))[1]).toMatchObject({ version: 3, note: "revert to version 1" });
    expect(activeRules().compiled.staples["dark hole"]).toBeDefined();
    expect(activeRules().compiled.staples["pot of greed"]!.idlePriority).toBe(1);
    const view = await aiRulesView(db) as { version: number; history: { id: number; by: string }[] };
    expect([view.version, view.history.map((h) => `${h.id} ${h.by}`)]).toEqual([3, ["3 u1", "2 deploy", "1 u1"]]);
    setActiveRules(bundledRules());
    expect((await loadAiRules(db)).version).toBe(3);
    expect((await aiRulesPost(db, "u1", { revert: 99 }))[0]).toBe(404);
  });

  it("a stored version that no longer compiles over rules.json: rules.json alone, logged", async () => {
    const db = d1();
    await db.prepare("INSERT INTO npc_ai_rules (at, by, note, overlay) VALUES (1, 'x', null, ?)").bind(JSON.stringify({ staples: { "pot of greed": { gone: true } } })).run();
    const logs: string[] = [];
    expect((await loadAiRules(db, (s) => logs.push(s))).version).toBe(0);
    expect(logs[0]).toMatch(/version 1 does not compile/);
  });
});
