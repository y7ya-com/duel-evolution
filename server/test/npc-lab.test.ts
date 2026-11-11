// The NPC lab: the NPC AI on its official deck (seat 1, its production tier) against player decks, in-process on
// DuelCore. Production keeps no play-by-play of NPC duels (only the totals in npc_progress and the [economia] lines),
// so this is where the AI's play is read and measured: a win-rate table per NPC, and with NPC_LAB_TRACE a text
// trace per duel (the Duel Log lines plus, at each NPC decision, its hand, both fields and what it chose).
//
// Opt-in (slow):
//   NPC_LAB=<duels per NPC> NPC_LAB_DECKS=<players.json> [NPC_LAB_NPCS=35,51,53] [NPC_LAB_TRACE=<dir>]
//     [NPC_LAB_AI=<dir under src/duel, default ai>] [NPC_LAB_PILOT=<dir under src/duel, default ai>]
//     nice npx vitest run test/npc-lab.test.ts
// players.json: [{ "main": [passcodes], "extra": [passcodes] }, ...] (player decks: never committed).
// NPC_LAB_AI / NPC_LAB_PILOT name a copy of src/duel/ai (say ai_base, a checkout of another commit's) for the NPC and
// for the player's pilot: the same seeds and the same pilot with two NPC_LAB_AI values is the A/B.
//
// The NPC duels players really had (duel_archive, src/duel/duelArchive.ts), as the same traces with both hands shown:
//   npx wrangler d1 execute duel-evolution-prod --env production --remote --json \
//     --command "select * from duel_archive where kind = 'npc' and at > unixepoch() - 7*86400" > rows.json
//   NPC_LAB_REPLAY=rows.json NPC_LAB_TRACE=<dir> npx vitest run test/npc-lab.test.ts
// NPC_LAB_RULES=<overlay.json>: the NPC plays by rules.json with this card-rule overlay on top (src/duel/ai/ruleSet.ts,
// what POST /__admin/ai-rules would make live; scripts/ai-rules.sh lab); the player's pilot does not.
// NPC_LAB_ASK=ai_base,ai (dirs under src/duel, each with an optional :tier and @overlay.json): at every NPC decision those
// AIs (rebuilt as production built the NPC: its seed, its tier unless one is given) are asked too, and the trace shows each answer that differs from the recorded one. The AI that
// played the duel answers as it did (a check of the replay); a newer one shows what it would do there.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type * as Ai from "../src/duel/ai/index.ts";
import { brainDb, npcDeck, NPC_PROFILES, toCodes } from "../src/duel/data.ts";
import { DuelLog } from "../src/duel/duelText.ts";
import { PY_DUEL_RULE, type DuelCore, type Json, type NewOptions } from "../src/duel/engine/core.ts";
import { createNodeDuelCore, ENGINE_DATA_DIR } from "../src/duel/engine/node.ts";
import { unpackCommands } from "../src/duel/duelArchive.ts";

const N = Number(process.env.NPC_LAB ?? 0);
const DECKS = process.env.NPC_LAB_DECKS ?? "";
const TRACE = process.env.NPC_LAB_TRACE ?? "";
const REPLAY = process.env.NPC_LAB_REPLAY ?? "";
const haveEngine = existsSync(join(ENGINE_DATA_DIR, "scripts.pack"));
const haveData = haveEngine && !!DECKS && existsSync(DECKS);
const MAX_DECISIONS = 3000; // ocgSession.MAX_NPC_DECISIONS

type AiModule = typeof Ai;
interface Outcome { winner: "npc" | "player" | "draw" | "stall" | "error"; turns: number; illegal: number; lp: [number, number]; ms: number; decisions: number }

const POS_NAME: Record<number, string> = { 1: "ATK", 2: "set-ATK", 4: "DEF", 8: "set" };
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);

/** Two lines per decision of seat `me` (the NPC is seat 1): what it held and faced, then the prompt and its answer. */
function describe1(dc: DuelCore, sel: Json, r: Json | null, me = 1): string {
  const tag = me === 1 ? "npc>" : "you>", opp = 1 - me;
  const name = (c: unknown) => (Number(c) ? dc.cardDB.name(Number(c)) : "?");
  const view = sel.view as Json | undefined;
  const players = arr(view?.players);
  const field = (p: Json | undefined) => arr(p?.mzone).filter((c) => c && (Number(c.code) || c.position !== undefined))
    .map((c) => `${name(c.code)} ${c.attack ?? "?"}/${c.defense ?? "?"} ${POS_NAME[Number(c.position)] ?? c.position}`).join(", ") || "-";
  const back = (p: Json | undefined) => arr(p?.szone).filter((c) => c && (Number(c.code) || c.position !== undefined))
    .map((c) => `${name(c.code)}${Number(c.position) & 0xa ? " (set)" : ""}`).join(", ") || "-";
  const hand = (Array.isArray(players[me]?.hand) ? (players[me]!.hand as unknown[]) : []).map((c) => name(typeof c === "object" && c ? (c as Json).code : c)).join(", ") || "-";
  const lp = Array.isArray(sel.lp) ? `${(sel.lp as number[])[me]} (opp ${(sel.lp as number[])[opp]})` : "?";
  const list = (k: string) => arr(sel[k]).map((c) => name(c.code)).join(", ");
  let what = `${sel.type}`;
  if (sel.type === "SELECT_IDLECMD") {
    what = `IDLE summon[${list("summons")}] sp[${list("special_summons")}] mset[${list("monster_sets")}] sset[${list("spell_sets")}] act[${list("activates")}] pos[${list("pos_changes")}]`;
  } else if (sel.type === "SELECT_BATTLECMD") what = `BATTLE attackers[${list("attacks")}] act[${list("chains")}]`;
  else if (sel.type === "SELECT_CHAIN") what = `CHAIN[${list("selects")}]${sel.forced ? " forced" : ""}`;
  else if (sel.type === "SELECT_CARD" || sel.type === "SELECT_TRIBUTE") what = `${sel.type} ${sel.min}-${sel.max} of [${arr(sel.selects).map((c) => `${Number(c.controller) === me ? "" : "opp "}${name(c.code)}`).join(", ")}]`;
  else if (sel.type === "SELECT_EFFECTYN") what = `EFFECT? ${name(sel.code)}`;
  else if (sel.type === "SELECT_POSITION") what = `POSITION ${name(sel.code)}`;
  else if (sel.type === "SELECT_YESNO") what = `YESNO "${sel.desc_text ?? sel.description}"`;
  else if (sel.type === "SELECT_OPTION") what = `OPTION [${arr(sel.options).map((o) => `"${(o as Json).desc_text ?? JSON.stringify(o)}"`).join(", ")}]`;
  else if (sel.type === "ANNOUNCE_NUMBER") what = `NUMBER [${arr(sel.options).map((o) => (typeof o === "object" ? JSON.stringify(o) : o)).join(", ")}]`;
  const answer = r === null ? "(engine)" : JSON.stringify(r).replace(/"type":"[A-Z_]+",?/, "");
  return `    ${tag} LP ${lp} | hand: ${hand} | field: ${field(players[me])} | back: ${back(players[me])} || opp field: ${field(players[opp])} | opp back: ${back(players[opp])} (hand ${players[opp]?.hand_count ?? "?"})\n`
    + `    ${tag} ${what} -> ${answer}`;
}

let seq = 0;
/** An AI module's rule set for an overlay file (scripts/ai-rules.sh's format: the overlay, or { overlay }). */
function rulesFrom(mod: AiModule, file: string | undefined): Ai.RuleSet | undefined {
  if (!file) return undefined;
  const j = JSON.parse(readFileSync(file, "utf8"));
  return mod.buildRules(j && typeof j === "object" && "overlay" in j ? j.overlay : j, -1);
}

function duel(dc: DuelCore, npcMod: AiModule, pilotMod: AiModule, npcId: number, player: { main: number[]; extra: number[] }, first: 0 | 1, seed: number, trace: string[] | null, rules?: Ai.RuleSet): Outcome {
  const nd = npcDeck(npcId)!;
  const decks = [{ main: toCodes(player.main), extra: toCodes(player.extra ?? []) }, { main: toCodes(nd.main), extra: toCodes(nd.extra) }];
  const opts: NewOptions = { first, seed, shuffle: true, rule: PY_DUEL_RULE, brain: [true, true], auto_chain: true };
  const id = `lab-${++seq}`;
  const log: Ai.LoggedCmd[] = [];
  const tier = npcMod.tierFor(npcId, NPC_PROFILES);
  const npc = new npcMod.NpcAi({ npcId, seat: 1, seed, cards: npcMod.cardInfo(dc.cardDB, brainDb()), tier, link: () => ({ dc, decks, opts, log }), peek: () => dc.query(id), rules });
  // The player's pilot: the hard tier (no blunders, no lookahead) with no NPC plan, on the player's own deck.
  const pilot = new pilotMod.NpcAi({ npcId: 0, seat: 0, seed: seed + 1, cards: pilotMod.cardInfo(dc.cardDB, brainDb()), tier: "hard" });
  const text = trace ? new DuelLog(["Player", "NPC"], { name: (c) => (dc.cardDB.get(c) ? dc.cardDB.name(c) : ""), stats: (c) => ({ atk: dc.cardDB.get(c)?.attack ?? 0, def: dc.cardDB.get(c)?.defense ?? 0 }) }) : null;
  let evs = dc.new(id, decks, opts);
  let decisions = 0, illegal = 0, errors = 0, lp: [number, number] = [8000, 8000];
  const done = (winner: Outcome["winner"], turns: number): Outcome => ({ winner, turns, illegal: illegal + npc.stats.errors, lp, ms: npc.stats.ms, decisions: npc.stats.decisions });
  for (;;) {
    for (const e of evs) if (e.ev === "msg") { npc.observe(e); pilot.observe(e); }
    if (text) for (const l of text.feed(evs)) trace!.push(l);
    const last = evs[evs.length - 1]!;
    if (Array.isArray(last.lp)) lp = last.lp as [number, number];
    if (last.ev === "end") {
      const w = last.winner;
      trace?.push(`== end: winner ${w === 1 ? "NPC" : w === 0 ? "Player" : "-"}, reason ${last.reason}, turns ${last.turns}`);
      return done(w === 1 ? "npc" : w === 0 ? "player" : last.reason === "error" ? "error" : "draw", Number(last.turns));
    }
    if (++decisions > MAX_DECISIONS) { dc.end(id); return done("stall", Number(last.turn ?? 0)); }
    if (last.ev === "error") {
      if (++errors > 1) { dc.end(id); return done("error", 0); }
      illegal++;
      trace?.push(`    !! engine error: ${last.error}`);
      log.push({});
      evs = dc.auto(id);
      continue;
    }
    errors = 0;
    const p = Number(last.player);
    if (last.retry) {
      if (p === 1) { illegal++; trace?.push(`    !! NPC retry on ${last.type}`); }
      log.push({});
      evs = dc.auto(id);
      continue;
    }
    const r = (p === 1 ? npc.choose(last) : pilot.choose(last)) as Json | null;
    if (trace && p === 1 && last.type !== "SELECT_PLACE" && !(last.type === "SELECT_CHAIN" && !arr(last.selects).length)) trace.push(describe1(dc, last, r));
    if (r) { log.push({ r, p }); evs = dc.respond(id, r, p); }
    else { log.push({}); evs = dc.auto(id); }
  }
}

describe.skipIf(!haveData || !N)("NPC lab", () => {
  let dc: DuelCore, npcMod: AiModule, pilotMod: AiModule, npcRules: Ai.RuleSet | undefined;
  beforeAll(async () => {
    dc = await createNodeDuelCore();
    const load = (dir: string): Promise<AiModule> => import(/* @vite-ignore */ join(ENGINE_DATA_DIR, "..", "..", "src", "duel", dir, "index.ts"));
    npcMod = await load(process.env.NPC_LAB_AI ?? "ai");
    npcRules = rulesFrom(npcMod, process.env.NPC_LAB_RULES);
    pilotMod = await load(process.env.NPC_LAB_PILOT ?? "ai");
  }, 60_000);

  it("the NPCs against player decks", () => {
    const players = (JSON.parse(readFileSync(DECKS, "utf8")) as { main: number[]; extra?: number[] }[]).map((d) => ({ main: d.main, extra: d.extra ?? [] }));
    const npcs = (process.env.NPC_LAB_NPCS ?? Object.keys(NPC_PROFILES).join(",")).split(",").map(Number).filter((n) => npcDeck(n));
    if (TRACE) mkdirSync(TRACE, { recursive: true });
    const rows: string[] = [];
    const total = { duels: 0, npc: 0, bad: 0, illegal: 0 };
    const byTier: Record<string, [number, number]> = {};
    for (const npcId of npcs) {
      let npc = 0, player = 0, other = 0, illegal = 0, turns = 0, ms = 0, dec = 0, lpDiff = 0;
      for (let g = 0; g < N; g++) {
        const trace: string[] | null = TRACE ? [] : null;
        const deck = players[(npcId * 7 + g) % players.length]!;
        const r = duel(dc, npcMod, pilotMod, npcId, deck, (g % 2) as 0 | 1, 5000 * npcId + g, trace, npcRules);
        if (r.winner === "npc") npc++; else if (r.winner === "player") player++; else other++;
        if (r.winner === "stall" || r.winner === "error") total.bad++;
        illegal += r.illegal; turns += r.turns; ms += r.ms; dec += r.decisions; lpDiff += r.lp[1] - r.lp[0];
        if (trace) writeFileSync(join(TRACE, `npc${npcId}-g${g}-${r.winner}.txt`), `NPC ${npcId} (${NPC_PROFILES[String(npcId)]?.nombre}, ${npcMod.tierFor(npcId, NPC_PROFILES)}) game ${g}, first ${g % 2}, player deck ${(npcId * 7 + g) % players.length}\n${trace.join("\n")}\n`);
      }
      const tier = npcMod.tierFor(npcId, NPC_PROFILES);
      (byTier[tier] ??= [0, 0])[0] += npc; byTier[tier]![1] += N;
      total.duels += N; total.npc += npc; total.illegal += illegal;
      const row = `npc ${String(npcId).padStart(2)} L${NPC_PROFILES[String(npcId)]?.nivel} ${tier.padEnd(5)}: NPC ${npc}-${player}${other ? `-${other}` : ""} = ${((100 * npc) / N).toFixed(0)}% | turns ${(turns / N).toFixed(1)} `
        + `| LP diff ${(lpDiff / N).toFixed(0)} | ${(ms / Math.max(1, dec)).toFixed(1)} ms/decision | illegal ${illegal}`;
      rows.push(row);
      console.log(row);
    }
    const tiers = Object.entries(byTier).map(([t, [w, n]]) => `${t} ${((100 * w) / n).toFixed(1)}% (${w}/${n})`).join(", ");
    console.log(`\nNPC lab (${N} duels per NPC, AI ${process.env.NPC_LAB_AI ?? "ai"}${process.env.NPC_LAB_RULES ? ` + ${process.env.NPC_LAB_RULES}` : ""}, pilot ${process.env.NPC_LAB_PILOT ?? "ai"}): NPC wins ${total.npc}/${total.duels} = ${((100 * total.npc) / total.duels).toFixed(1)}% | ${tiers}\n${rows.join("\n")}`);
    expect({ bad: total.bad, illegal: total.illegal }).toEqual({ bad: 0, illegal: 0 });
  }, 7_200_000);
});

// A row of duel_archive, replayed: the engine's `new` and every recorded command, with both seats' decisions shown.
interface LogRow { id: number; at: number; a_name: string | null; rival: number | null; npc: number; tier: string | null; ai_rev: number; result: string; reason: string | null; turns: number; secs: number; commands: string | null }

describe.skipIf(!haveEngine || !REPLAY || !existsSync(REPLAY))("NPC lab: recorded duels", () => {
  let dc: DuelCore;
  const askDirs = (process.env.NPC_LAB_ASK ?? "").split(",").filter(Boolean);
  const askMods: AiModule[] = [];
  const askRules: (Ai.RuleSet | undefined)[] = [];
  beforeAll(async () => {
    dc = await createNodeDuelCore();
    for (const ask of askDirs) {
      const m: AiModule = await import(/* @vite-ignore */ join(ENGINE_DATA_DIR, "..", "..", "src", "duel", ask.split(/[:@]/)[0]!, "index.ts"));
      askMods.push(m);
      askRules.push(rulesFrom(m, ask.split("@")[1]));
    }
  }, 60_000);

  it("duel_archive rows replay to the end they recorded", async () => {
    const json = JSON.parse(readFileSync(REPLAY, "utf8"));
    const rows: LogRow[] = Array.isArray(json) && json[0]?.results ? json[0].results : json;   // wrangler's --json, or the rows
    if (TRACE) mkdirSync(TRACE, { recursive: true });
    let drift = 0;
    const tally: Record<string, [number, number]> = {};
    const askTally: Record<string, [number, number]> = {};   // per asked AI: NPC decisions it answered differently, of all
    for (const row of rows) {
      const t = (tally[`npc ${row.npc} ${row.tier} rev ${row.ai_rev}`] ??= [0, 0]);
      t[1]++; if (row.result === "lose" || row.result === "abandon") t[0]++;
      if (!row.commands) continue;
      const r = await unpackCommands(row.commands);
      const id = `log-${row.id}`;
      const text = new DuelLog([row.a_name || "Player", NPC_PROFILES[String(row.rival ?? row.npc)]?.nombre as string ?? "NPC"],
        { name: (c) => (dc.cardDB.get(c) ? dc.cardDB.name(c) : ""), stats: (c) => ({ atk: dc.cardDB.get(c)?.attack ?? 0, def: dc.cardDB.get(c)?.defense ?? 0 }) });
      const trace: string[] = [];
      const asked: Ai.LoggedCmd[] = [];
      const asks = askMods.map((m, k) => new m.NpcAi({ npcId: row.npc, seat: 1, seed: Number(r.opts.seed), cards: m.cardInfo(dc.cardDB, brainDb()), tier: (askDirs[k]!.split("@")[0]!.split(":")[1] ?? row.tier ?? m.tierFor(row.npc, NPC_PROFILES)) as Ai.Tier, rules: askRules[k],
        link: () => ({ dc, decks: r.decks, opts: r.opts, log: asked }), peek: () => dc.query(id) }));
      let evs = dc.new(id, r.decks, { ...r.opts, brain: [true, true] });
      for (let i = 0; ; i++) {
        for (const e of evs) if (e.ev === "msg") for (const a of asks) a.observe(e);
        for (const l of text.feed(evs)) trace.push(l);
        const last = evs[evs.length - 1]!;
        const c = r.cmds[i];
        if (last.ev === "end" || !c) {
          const ended = last.ev === "end";
          const result = !ended ? row.result : last.winner === 0 ? "win" : last.winner === 1 ? "lose" : "draw";
          // a duel the engine ended must replay to that end; a surrender or an abandoned duel just stops
          if (ended !== ["win", "lose", "draw"].includes(row.result) && row.reason !== "surrender" && row.reason !== "timeout" && row.reason !== "loop") drift++;
          else if (ended && (result !== row.result || Number(last.turns) !== row.turns)) drift++;
          trace.push(`== ${row.result} (${row.reason}), turns ${row.turns}, ${row.secs} s${ended ? "" : `; the record stops here, on ${last.ev} ${last.type ?? ""}`}`);
          if (!ended) dc.end(id);
          break;
        }
        const shown = last.ev === "select" && !last.retry && !(last.type === "SELECT_PLACE") && !(last.type === "SELECT_CHAIN" && !arr(last.selects).length);
        if (shown) trace.push(describe1(dc, last, c.r ?? null, Number(last.player)));
        // as ocgSession.npcDecide asks it: not on a retry, not on a chain window with nothing to chain
        if (last.ev === "select" && !last.retry && Number(last.player) === 1 && !(last.type === "SELECT_CHAIN" && !last.selects && !last.forced)) {
          const was = JSON.stringify(c.r ?? null);
          asks.forEach((a, k) => {
            const now = JSON.stringify(a.choose(last) ?? null);
            const label = askDirs[k]!.replace(/@.*\//, "@");   // an overlay by its file name
            const tally = (askTally[label] ??= [0, 0]);
            tally[1]++;
            if (now === was) return;
            tally[0]++;
            if (shown) trace.push(`    ${label}> ${now.replace(/"type":"[A-Z_]+",?/, "")}`);
          });
        }
        asked.push(c);
        evs = c.r ? dc.respond(id, c.r, c.p) : dc.auto(id);
      }
      if (TRACE) writeFileSync(join(TRACE, `log${row.id}-npc${row.npc}-${row.result}.txt`), `Duel ${row.id}: ${row.a_name} vs NPC ${row.rival} (recipe ${row.npc}, ${row.tier}, AI rev ${row.ai_rev}), ${new Date(row.at * 1000).toISOString()}\n${trace.join("\n")}\n`);
    }
    console.log(`\nNPC duels recorded: ${rows.length}\n${Object.entries(tally).sort().map(([k, [w, n]]) => `${k}: NPC won ${w}/${n}`).join("\n")}`
      + Object.entries(askTally).map(([k, [d, n]]) => `\nasked ${k}: ${d} of ${n} NPC decisions differ from the recorded ones`).join(""));
    expect(drift).toBe(0);
  }, 3_600_000);
});
