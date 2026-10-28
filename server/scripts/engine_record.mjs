// Records duelcore (py's REAL engine process, YOLaucher-web tools/yo2emu/duelcore/duelcore.mts) for the duel engine
// parity test (test/duel-engine.test.ts). Fixtures go to server/gamedata/fixtures/engine/ (gitignored: card texts).
//
//   nice node scripts/engine_record.mjs [path/to/YOLaucher-web]
//
// duelcore is started the way duelcore.py starts it: `node --disable-warning=ExperimentalWarning --import <tsx
// loader> duelcore.mts`, cwd apps/server, inherited env. Each scenario is a seeded command sequence: a simple policy
// (pruebas_comun.SimplePolicy, ported) plus `auto`, queries, bad responses, a surrender... The commands depend only on
// the events, so the fixture stores the commands and duelcore's raw stdout lines for each: the test replays the
// commands into the TS engine and compares the lines.
//
// Fixture: <scenario>.jsonl, one {"cmd": {...}, "out": ["<raw line>", ...]} per command; ready.json = the ready event.
import { spawn } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "gamedata", "fixtures", "engine");
const YL = resolve(process.argv[2] ?? join(process.env.HOME ?? "", "Documents", "GitHub", "YOLaucher-web"));
const SERVER = join(YL, "apps", "server");
const SCRIPT = join(YL, "tools", "yo2emu", "duelcore", "duelcore.mts");
const LOADER = join(realpathSync(join(SERVER, "node_modules", "tsx")), "dist", "loader.mjs");

// ---- duelcore process -------------------------------------------------------------------------------------------
const proc = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "--import", pathToFileURL(LOADER).href, SCRIPT], {
  cwd: SERVER,
  stdio: ["pipe", "pipe", "pipe"],
});
const stderr = [];
proc.stderr.setEncoding("utf8");
proc.stderr.on("data", (d) => {
  stderr.push(d);
  if (stderr.length > 200) stderr.shift();
});
const lines = [];
let waiter = null;
createInterface({ input: proc.stdout, crlfDelay: Infinity }).on("line", (l) => {
  if (!l.trim()) return;
  lines.push(l);
  waiter?.();
});
proc.on("exit", (code) => {
  if (code) console.error(`duelcore exited ${code}\n${stderr.join("")}`);
  waiter?.();
});

async function nextLine() {
  while (!lines.length) {
    if (proc.exitCode !== null) throw new Error(`duelcore died\n${stderr.join("")}`);
    await new Promise((r) => (waiter = r));
    waiter = null;
  }
  return lines.shift();
}

let syncN = 0;
/** Sends a command and returns every line duelcore wrote for it (a ping with a unique req marks the end). */
async function send(cmd) {
  proc.stdin.write(JSON.stringify(cmd) + "\n");
  const tag = `__sync${++syncN}`;
  proc.stdin.write(JSON.stringify({ cmd: "ping", req: tag }) + "\n");
  const out = [];
  for (;;) {
    const l = await nextLine();
    if (l.startsWith(`{"req":${JSON.stringify(tag)},`)) return out;
    out.push(l);
  }
}

// ---- decks (pruebas_comun.py; real passcodes from cards.cdb) ----------------------------------------------------
const [ALEXANDRITE, LUSTER, VORSE, WARWOLF, CELTIC, GAMMA, FERAL, SKULL, DMAGICIAN, ELF] = [43096270, 11091375, 14898066, 69247929, 91152256, 11549357, 41392891, 70781052, 46986414, 15025844];
const [STONE, WITTY, DOOMED, HITOTSU, MAMMOTH, LEOTRON, MEGALO, GAIA, BLUEEYES, ACID] = [13039848, 36304921, 49218300, 76184692, 40374923, 47226949, 81823360, 6368038, 89631139, 77568553];
const [DIAN_KETO, POT, HINOTAMA, SPARKS, FISSURE, RAIGEKI, REBORN, SWORDS, STORM, TRAP_HOLE] = [84257639, 55144522, 46130346, 76103675, 66788016, 12580477, 83764718, 72302403, 19613556, 4206964];
const rep = (c, n) => Array(n).fill(c);
const DECK_A = [...rep(ALEXANDRITE, 3), ...rep(LUSTER, 3), ...rep(VORSE, 3), ...rep(WARWOLF, 3), ...rep(CELTIC, 3), ...rep(GAMMA, 3),
  ...rep(FERAL, 2), ...rep(SKULL, 2), ...rep(DMAGICIAN, 2), ELF, ...rep(DIAN_KETO, 2), POT, ...rep(HINOTAMA, 2), ...rep(SPARKS, 2),
  FISSURE, RAIGEKI, REBORN, SWORDS, STORM, ...rep(TRAP_HOLE, 3)];
const DECK_B = [...rep(STONE, 3), ...rep(ELF, 3), ...rep(WITTY, 3), ...rep(DOOMED, 3), ...rep(HITOTSU, 3), ...rep(MAMMOTH, 3),
  ...rep(LEOTRON, 3), ...rep(MEGALO, 3), ...rep(GAIA, 2), BLUEEYES, ACID, ...rep(DIAN_KETO, 2), ...rep(HINOTAMA, 2), ...rep(SPARKS, 2),
  FISSURE, REBORN, POT, ...rep(TRAP_HOLE, 3)];
const DECKS = [{ main: DECK_A, extra: [] }, { main: DECK_B, extra: [] }];
// fusion + ritual deck (Polymerization, Black Luster Ritual, Advanced Ritual Art) with an extra deck
const [POLY, CURSE, GAIA_DC, FLAME_MANIP, MASAKI, FLAME_SW, BLR, ARA, BLS] = [24094653, 28279543, 66889139, 34460851, 44287299, 45231177, 55761792, 46052429, 5405694];
const DECK_F = [...rep(POLY, 3), ...rep(GAIA, 3), ...rep(CURSE, 3), ...rep(FLAME_MANIP, 3), ...rep(MASAKI, 3), ...rep(BLR, 2), ...rep(ARA, 2),
  ...rep(BLS, 3), ...rep(CELTIC, 3), ...rep(ELF, 3), ...rep(SKULL, 3), ...rep(LUSTER, 3), POT, RAIGEKI, REBORN, ...rep(TRAP_HOLE, 3), ...rep(SPARKS, 2)];

// ---- policy (pruebas_comun.SimplePolicy) ------------------------------------------------------------------------
function freePlaces(mask, count, me) {
  const out = [];
  for (const [side, player] of [[0, me], [1, 1 - me]]) {
    for (const [base, loc] of [[0, 4], [8, 8]]) {
      for (let seq = 0; seq < 8; seq++) {
        if (out.length >= count) return out;
        if (!(mask & (1 << (side * 16 + base + seq)))) out.push({ player, location: loc, sequence: seq });
      }
    }
  }
  return out;
}

class SimplePolicy {
  turn = -1;
  actions = 0;
  attacks = 0;
  bpDone = false;
  decide(sel) {
    if (sel.turn !== this.turn) Object.assign(this, { turn: sel.turn, actions: 0, attacks: 0, bpDone: false });
    const t = sel.type;
    switch (t) {
      case "SELECT_IDLECMD": {
        this.actions++;
        if (this.actions <= 6) {
          if (sel.summons.length) return { type: t, action: "SELECT_SUMMON", index: 0 };
          const hand = sel.activates.map((c, i) => [c, i]).filter(([c]) => c.location === 2).map(([, i]) => i);
          if (hand.length && this.actions <= 3) return { type: t, action: "SELECT_ACTIVATE", index: hand[0] };
          if (sel.monster_sets.length) return { type: t, action: "SELECT_MONSTER_SET", index: 0 };
        }
        if (sel.to_bp && !this.bpDone) {
          this.bpDone = true;
          return { type: t, action: "TO_BP", index: null };
        }
        if (sel.to_ep) return { type: t, action: "TO_EP", index: null };
        return { type: t, action: "TO_BP", index: null };
      }
      case "SELECT_BATTLECMD":
        this.attacks++;
        if (sel.attacks.length && this.attacks <= 5) return { type: t, action: "SELECT_BATTLE", index: 0 };
        return { type: t, action: sel.to_ep ? "TO_EP" : "TO_M2", index: null };
      case "SELECT_CHAIN":
        return { type: t, index: sel.forced && sel.selects.length ? 0 : null };
      case "SELECT_EFFECTYN":
      case "SELECT_YESNO":
        return { type: t, yes: true };
      case "SELECT_OPTION":
        return { type: t, index: 0 };
      case "SELECT_CARD": {
        const n = Math.min(Math.max(1, sel.min), sel.max, sel.selects.length);
        return { type: t, indicies: [...Array(n).keys()] };
      }
      case "SELECT_TRIBUTE":
        return { type: t, indicies: [...Array(sel.min).keys()] };
      case "SELECT_UNSELECT_CARD":
        if (sel.can_finish || !sel.select_cards.length) return { type: t, index: null };
        return { type: t, index: 0 };
      case "SELECT_PLACE":
      case "SELECT_DISFIELD":
        return { type: t, places: freePlaces(sel.field_mask, sel.count, sel.player) };
      case "SELECT_POSITION":
        return { type: t, position: [1, 8, 4, 2].find((p) => sel.positions & p) };
      case "SORT_CARD":
      case "SORT_CHAIN":
        return { type: "SORT_CARD", order: null };
      case "ROCK_PAPER_SCISSORS":
        return { type: t, value: 1 };
      case "ANNOUNCE_NUMBER":
        return { type: t, value: 0 };
    }
    return null; // no policy: bot.ts answers (cmd "auto")
  }
}

// ---- scenarios --------------------------------------------------------------------------------------------------
/**
 * Plays one duel: new, then answer every select (policy per player, `auto` every `autoEvery` decisions, a query every
 * `queryEvery`), `end` past `maxTurns`. `hooks(k, sel)` may send extra commands (bad responses...) and return a
 * command to send instead of the normal answer, or the output lines of one it already sent.
 */
async function playDuel(rec, id, newCmd, { autoEvery = 0, queryEvery = 0, maxTurns = 40, maxDecisions = 1500, withPlayer = false, hooks } = {}) {
  const pols = [new SimplePolicy(), new SimplePolicy()];
  let out = await rec(newCmd);
  for (let k = 0; k < maxDecisions; k++) {
    const last = JSON.parse(out[out.length - 1]);
    if (last.ev !== "select") return last;
    if (queryEvery && k % queryEvery === queryEvery - 1) await rec({ cmd: "query", id });
    if (last.turn > maxTurns) return JSON.parse((await rec({ cmd: "end", id })).at(-1));
    const p = last.player;
    let cmd = hooks ? await hooks(k, last, rec) : undefined;
    if (Array.isArray(cmd)) {
      out = cmd; // the hook already answered (its command's output)
      continue;
    }
    if (!cmd) {
      const r = autoEvery && k % autoEvery === autoEvery - 1 ? null : pols[p].decide(last);
      cmd = r === null ? { cmd: "auto", id } : { cmd: "respond", id, response: r };
      if (withPlayer) cmd.player = p;
    }
    out = await rec(cmd);
    // an error keeps the duel waiting on the same select: answer it with bot.ts
    while (JSON.parse(out.at(-1)).ev === "error" && !out.some((l) => JSON.parse(l).ev === "end")) out = await rec({ cmd: "auto", id });
  }
  return JSON.parse((await rec({ cmd: "end", id })).at(-1));
}

const scenarios = {
  // NPC duels as py runs them (ocg_duel.py: shuffle, rule MR1, bot [false, true]); player 0 = simple policy + auto
  npc_mr1_first0: async (rec) => playDuel(rec, "n0", { cmd: "new", id: "n0", decks: DECKS, first: 0, lp: 8000, bot: [false, true], auto_chain: true, shuffle: true, rule: "MR1", seed: 1234 }, { autoEvery: 7, queryEvery: 25 }),
  npc_mr1_first1: async (rec) => playDuel(rec, "n1", { cmd: "new", id: "n1", decks: DECKS, first: 1, lp: 8000, bot: [false, true], auto_chain: true, shuffle: true, rule: "MR1", seed: 99 }, { autoEvery: 5, queryEvery: 30 }),
  // duelcore's own default rule (no `rule`: MR5) and numeric / string seeds
  npc_default_rule: async (rec) => {
    await playDuel(rec, 7, { cmd: "new", id: 7, decks: DECKS, first: 0, seed: 7 }, { autoEvery: 3 });
    await playDuel(rec, [1, "x"], { cmd: "new", id: [1, "x"], decks: [DECKS[1], DECKS[0]], first: 1, seed: "123456789012", rule: "mr5" }, { autoEvery: 4 });
  },
  // brain mode (py's NPC brain: brain "python" = player 1, `view` on its selects, respond with player)
  brain_first1: async (rec) => {
    let wrongPlayerDone = false;
    return playDuel(rec, "b1", { cmd: "new", id: "b1", decks: DECKS, first: 1, lp: 8000, bot: [false, true], auto_chain: true, shuffle: true, rule: "MR1", seed: 4242, brain: "python" }, {
      autoEvery: 6, queryEvery: 20, withPlayer: true,
      hooks: async (k, sel) => {
        if (!wrongPlayerDone && sel.player === 1) {
          wrongPlayerDone = true;
          await rec({ cmd: "respond", id: "b1", response: { type: "SELECT_CHAIN", index: null }, player: 0 }); // not player 0's decision
        }
        if (sel.player === 1 && k % 9 === 4) return { cmd: "auto", id: "b1", player: 1 };
      },
    });
  },
  brain_both_first0: async (rec) => playDuel(rec, "bb", { cmd: "new", id: "bb", decks: DECKS, first: 0, bot: [false, false], rule: "MR1", seed: 31337, brain: [true, true] }, { autoEvery: 4, withPlayer: true, maxTurns: 14 }),
  // errors, RETRY, malformed responses, surrender, other commands, req
  errors_surrender: async (rec) => {
    await rec({ cmd: "cardinfo", codes: [ALEXANDRITE, BLUEEYES, POT, 1, GAIA_DC] });
    await rec({ cmd: "ping", req: 1 });
    await rec({ cmd: "list" });
    await rec({ cmd: "nope" });
    await rec({ cmd: "respond", id: "missing", response: { type: "SELECT_CHAIN", index: null } });
    await rec({ cmd: "new", id: "bad", decks: [{ main: [] }, { main: DECK_B }] });
    await rec({ cmd: "new", id: "bad", decks: [{ main: [1, 2, ALEXANDRITE] }, { main: DECK_B }] });
    await rec({ cmd: "new", id: "bad", decks: DECKS, first: 2 });
    await rec({ cmd: "new", id: "bad", decks: DECKS, rule: "MR9" });
    await rec({ cmd: "new", id: "bad", decks: DECKS, seed: [1] });
    await rec({ cmd: "new", id: "bad", decks: DECKS, brain: 5 });
    let n = 0;
    const last = await playDuel(rec, "e", { cmd: "new", id: "e", decks: DECKS, first: 0, bot: [false, true], rule: "MR1", seed: 5, req: "r-new" }, {
      autoEvery: 9,
      hooks: async (k, sel) => {
        n++;
        if (n === 2) await rec({ cmd: "new", id: "e", decks: DECKS }); // duplicate id
        if (sel.type === "SELECT_IDLECMD" && n < 40 && n % 6 === 1) {
          return rec({ cmd: "respond", id: "e", response: { type: "SELECT_IDLECMD", action: "SELECT_SUMMON", index: 99 } }); // RETRY
        }
        if (n === 5) await rec({ cmd: "respond", id: "e", response: { type: "SELECT_CHAIN", index: null }, req: { a: [1] } }); // wrong type
        if (n === 6) await rec({ cmd: "respond", id: "e", response: "x" });
        if (n === 7) await rec({ cmd: "respond", id: "e", response: { type: "WHAT" } });
        if (n === 8 && sel.type === "SELECT_IDLECMD") await rec({ cmd: "respond", id: "e", response: { type: "SELECT_IDLECMD", action: "FLY", index: 0 } });
        if (n === 9) await rec({ cmd: "query", id: "e", req: "q" });
        if (n === 60) return { cmd: "surrender", id: "e" };
      },
    });
    await rec({ cmd: "respond", id: "e", response: { type: "SELECT_CHAIN", index: null } }); // duel is gone
    await rec({ cmd: "query", id: "e" });
    // surrender of player 1 while waiting, then end of another
    await rec({ cmd: "new", id: "s2", decks: DECKS, first: 1, seed: 8, rule: "MR1" });
    await rec({ cmd: "auto", id: "s2" });
    await rec({ cmd: "surrender", id: "s2", player: 1 });
    await rec({ cmd: "new", id: "s3", decks: DECKS, first: 0, seed: 9, rule: "MR1", auto_chain: false });
    for (let i = 0; i < 12; i++) await rec({ cmd: "auto", id: "s3" });
    await rec({ cmd: "list" });
    await rec({ cmd: "end", id: "s3" });
    await rec({ cmd: "end", id: "s3" });
    return last;
  },
  // PvP shape (bot [false, false]), auto_chain false (py's chain_none_prompt); both players answer with `player`
  pvp_no_autochain: async (rec) => playDuel(rec, "p", { cmd: "new", id: "p", decks: DECKS, first: 1, bot: [false, false], auto_chain: false, shuffle: true, rule: "MR1", seed: 2024 }, { autoEvery: 5, withPlayer: true, queryEvery: 40, maxTurns: 16 }),
  // the bot plays both sides (the whole duel happens inside `new`)
  bot_vs_bot: async (rec) => {
    await rec({ cmd: "new", id: "bot1", decks: DECKS, bot: [true, true], rule: "MR1", seed: 11 });
    await rec({ cmd: "new", id: "bot2", decks: [{ main: DECK_F, extra: [GAIA_DC, FLAME_SW, GAIA_DC] }, { main: DECK_B }], first: 1, bot: [true, true], rule: "MR5", seed: 12 });
  },
  // fusions / rituals (SELECT_SUM through the reader patch, the bot's pickSum, explicit indices)
  fusion_ritual: async (rec) => {
    for (const [id, first, seed, rule, autoEvery] of [["f0", 0, 77, "MR1", 2], ["f1", 1, 78, "MR1", 3], ["f2", 0, 79, "MR5", 1]]) {
      await playDuel(rec, id, { cmd: "new", id, decks: [{ main: DECK_F, extra: [GAIA_DC, FLAME_SW] }, { main: DECK_F, extra: [GAIA_DC, FLAME_SW] }], first, seed, rule, shuffle: true }, { autoEvery, maxTurns: 30 });
    }
    // test_parche_sum.py: unshuffled hand with Black Luster Ritual / Advanced Ritual Art
    for (const [id, spell, first, hand, idx] of [["blr", BLR, 0, [BLR, BLS, CELTIC, ELF, CELTIC], [0, 1]], ["ara", ARA, 1, [ARA, BLS, ELF, ELF, CELTIC], null], ["blr2", BLR, 1, [BLR, BLS, SKULL, ELF, SKULL], [0, 1, 2]]]) {
      const main = [...rep(ELF, 35), ...[...hand].reverse()];
      await playDuel(rec, id, { cmd: "new", id, decks: [{ main }, { main: rep(ELF, 40) }], first, seed: 7, shuffle: false, rule: "MR1" }, {
        maxTurns: 6,
        hooks: async (k, sel) => {
          if (sel.type === "SELECT_IDLECMD") {
            const i = sel.activates.findIndex((a) => a.code === spell);
            if (i >= 0) return { cmd: "respond", id, response: { type: sel.type, action: "SELECT_ACTIVATE", index: i } };
          }
          if (sel.type === "SELECT_SUM") return idx && !sel.retry ? { cmd: "respond", id, response: { type: "SELECT_SUM", indicies: idx } } : { cmd: "auto", id };
        },
      });
    }
  },
  // more seeds, mostly bot.ts for player 0 (py's `auto` on time-outs), both orders and rules
  npc_seeds: async (rec) => {
    for (let i = 0; i < 6; i++) {
      const id = `s${i}`;
      await playDuel(rec, id, { cmd: "new", id, decks: i % 2 ? [DECKS[1], DECKS[0]] : DECKS, first: i % 2, bot: [false, true], rule: i % 3 === 2 ? "MR5" : "MR1", seed: 1000 + i, shuffle: true }, { autoEvery: 1 + (i % 3), queryEvery: 50 });
    }
  },
};

// ---- main -------------------------------------------------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
try {
  const ready = await nextLine();
  writeFileSync(join(OUT, "ready.json"), ready + "\n");
  let total = 0;
  for (const [name, run] of Object.entries(scenarios)) {
    const recs = [];
    const rec = async (cmd) => {
      const out = await send(cmd);
      recs.push({ cmd, out });
      return out;
    };
    await run(rec);
    writeFileSync(join(OUT, `${name}.jsonl`), recs.map((r) => JSON.stringify(r)).join("\n") + "\n");
    const n = recs.reduce((t, r) => t + r.out.length, 0);
    total += n;
    console.log(`${name}: ${recs.length} commands, ${n} events`);
  }
  console.log(`fixtures in ${OUT}: ${total} events`);
} finally {
  proc.stdin.end();
  await new Promise((r) => (proc.exitCode !== null ? r() : proc.on("exit", r)));
}
