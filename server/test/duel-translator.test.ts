// Parity of the duel translator port (src/duel/translator) with py research/traductor/translator.py: replays the duels
// recorded by scripts/translator_record.py (py's real YO2Duel driven like ocg_duel.OcgSession / PvpSession, with
// duelcore, a deterministic client and a seeded `random`) and compares every output byte for byte, every command sent
// back to duelcore, every PyRandom draw, and the translator's final state.
//   nice python3.12 -I scripts/translator_gamedata.py && nice python3.12 -I scripts/translator_record.py
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { WireDecoder } from "./cardwire.ts";
// tokens one card makes, each with its own art in the 2008 client (Scapegoat's sheep, the Ojama tokens, ...)
const TOKEN_OF = new Map<number, number>([[73915053, 73915052], [73915054, 73915052], [73915055, 73915052],
  [29843093, 29843092], [29843094, 29843092], [14470846, 29843092], [14470847, 29843092], [60764583, 60764582], [15341823, 15341822]]);
import { CardMap, type TranslatorData } from "../src/duel/translator/cardmap.ts";
import { mirror, mirror_state, unmirror_response } from "../src/duel/translator/mirror.ts";
import { type Msg, YO2Duel } from "../src/duel/translator/translator.ts";
import { PyRandom } from "../src/util/pyrandom.ts";

const GD = join(import.meta.dirname, "..", "gamedata");
const FIX = join(GD, "fixtures", "translator");
const files = existsSync(FIX) ? readdirSync(FIX).filter((f) => f.endsWith(".json.gz")).sort() : [];
const have = files.length > 0 && existsSync(join(GD, "translator.json"));

const revive = (_k: string, v: unknown) => (typeof v === "string" && v.startsWith("#big:") ? BigInt(v.slice(5)) : v);
const hexOf = (b: Uint8Array) => Buffer.from(b).toString("hex");
const unhex = (s: string) => new Uint8Array(Buffer.from(s, "hex"));
const msgs = (out: Msg[]) => out.map(([id, b]) => [id, hexOf(b)]);
const plain = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));

let cm: CardMap | null = null;
// a card's slots compare by card, not art: py gave every card its lowest card index, the card wire its own art
const cardKey = (pc: number) => { const c = cardmap().rulesKey(pc); return TOKEN_OF.get(c) ?? c; };
const cardmap = () => (cm ??= new CardMap(JSON.parse(readFileSync(join(GD, "translator.json"), "utf8")) as TranslatorData));

interface Totals { steps: number; msgs: number; bytes: number; client: number; cmds: number; rng: number }

/** cfg: translator keys over py's; got: record every output instead of comparing it with py's. */
interface ReplayOpts { cfg?: Record<string, unknown>; got?: (s: any, out: Msg[], wire: WireDecoder) => void }

function replay(name: string, t: Totals, o: ReplayOpts = {}) {
  const doc = JSON.parse(gunzipSync(readFileSync(join(FIX, name))).toString("utf8"), revive);
  const pvp = doc.kind === "pvp";
  const rng = new PyRandom(doc.seed);
  const views: YO2Duel[] = [];
  const wires: WireDecoder[] = [];   // per view: the client's codec (py's expected bytes are the 2008 client's)
  let cur: any = null;                                     // the step being replayed (its recorded q / clk)
  const take = (k: "q" | "clk") => {
    const lst = cur?.[k];
    if (!lst || !lst.length) {
      if (cur) cur.extra = `TS asked for a ${k} py did not`;      // (the translator may swallow a failing query)
      throw new Error(`step ${cur?.i} ${cur?.op}: TS asked for a ${k} py did not`);
    }
    return lst.shift();
  };
  const fail = (s: any, what: string, got: unknown, want: unknown) => {
    const evs = (s.evs || []).map((e: any) => `${e.ev}:${e.type ?? ""}`).join(" ");
    throw new Error(`${name} step ${s.i} (${s.op} v${s.v}) ${what}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}\n  evs ${evs}`);
  };
  const cmpOut = (s: any, out0: Msg[]) => {
    const out = wires[s.v].decode(out0);
    if (o.got) { o.got(s, out, wires[s.v]); return; }
    const got = msgs(out), want = s.out || [];
    const n = Math.max(got.length, want.length);
    if (!wires[s.v].same(out, want, cardKey)) for (let k = 0; k < n; k++) {
      if (!got[k] || !want[k] || got[k][0] !== want[k][0] || got[k][1] !== want[k][1]) {
        fail(s, `output #${k} of ${want.length} (got ${got.length})`, got.slice(k, k + 3), want.slice(k, k + 3));
      }
    }
    t.msgs += want.length;
    t.bytes += want.reduce((a: number, m: any) => a + m[1].length / 2, 0);
  };
  doc.steps.forEach((s: any, i: number) => {
    s.i = i;
    cur = { ...s, q: [...(s.q || [])], clk: [...(s.clk || [])] };
    const v = views[s.v];
    switch (s.op) {
      case "new": {
        const vi = s.v;
        // py's automatic placement takes the first free zone from the left (src/duel/zones.ts); py marks fusion
        // materials whether or not the summon follows (fusion_needs_summon); py's SELECT_UNSELECT_CARD from a pile is
        // a mask on the pile, not the card list (unselect_list)
        const cfg = { place_order: "py", fusion_needs_summon: false, unselect_list: false, ...s.cfg, ...o.cfg };
        const d = new YO2Duel(s.decks, { first: s.first, cardmap: cardmap(), cfg, rng, clock: () => take("clk") });
        if (doc.kind !== "unit") d.query = () => (pvp && vi === 1 ? mirror_state(take("q")) : take("q"));
        views[vi] = d;
        wires[vi] = new WireDecoder(GD);
        break;
      }
      case "set": (v as any)[s.k] = s.val; break;
      case "start": cmpOut(s, v.start()); break;
      case "rng": {
        const got = (rng as any)[s.fn](...s.args);
        if (got !== s.val) fail(s, "PyRandom draw", got, s.val);
        t.rng++;
        break;
      }
      case "feed": cmpOut(s, v.feed_many(pvp && s.v === 1 ? s.evs.map((e: any) => mirror(e)) : s.evs)); break;
      case "sync": cmpOut(s, v.sync_stats(pvp && s.v === 1 ? mirror_state(s.state) : s.state)); break;
      case "needs_auto": if (v.needs_auto() !== s.val) fail(s, "needs_auto", v.needs_auto(), s.val); break;
      case "auto_response": {
        const cmd = v.auto_response();
        if (JSON.stringify(plain(cmd)) !== JSON.stringify(s.val)) expect(plain(cmd), `${name} step ${i} auto_response`).toEqual(s.val);
        if (s.sent !== undefined) expect(plain(unmirror_response(s.v, (cmd as any).response))).toEqual(s.sent);
        t.cmds++;
        break;
      }
      case "client": {
        t.client++;
        if (s.exc) {
          expect(() => v.on_client(s.id, wires[s.v].encode(s.id, unhex(s.data))), `${name} step ${i}: py raised ${s.exc}`).toThrow();
          break;
        }
        const [cmd, out] = v.on_client(s.id, wires[s.v].encode(s.id, unhex(s.data)));
        expect(plain(cmd), `${name} step ${i} on_client 0x${s.id.toString(16)} command`).toEqual(s.cmd ?? null);
        if (s.sent !== undefined) expect(plain(unmirror_response(s.v, (cmd as any).response))).toEqual(s.sent);
        if (cmd) t.cmds++;
        cmpOut(s, out);
        break;
      }
      case "resend": cmpOut(s, v.resend()); break;
      case "query_none": v.query = null; break;
      case "finished": v.finished = true; break;
      case "surrender": break;
      default: throw new Error(`unknown op ${s.op}`);
    }
    if (cur.extra) fail(s, cur.extra, [], []);
    if (cur.q.length || cur.clk.length) fail(s, `py consumed ${cur.q.length} more query and ${cur.clk.length} more clock values`, [], []);
    t.steps++;
  });
  doc.final.forEach(({ warns, ...f }: any, k: number) => {
    const d = views[k];
    if (warns && d.unknown.length !== warns.length) {
      throw new Error(`${name} view ${k}: ${d.unknown.length} translator warnings, py ${warns.length}\n  ts ${d.unknown.join("\n     ")}\n  py ${warns.join("\n     ")}`);
    }
    expect({
      lp: d.lp, finished: d.finished, unknown: d.unknown.length, lp_desync_n: d.lp_desync_n, waiting: d.waiting !== null,
      mode: d.state?.mode ?? null, hud: d.hud, chain: d.chain, next_serial: d.next_serial,
    }, `${name} final state of view ${k}`).toEqual(f);
  });
  return doc;
}

describe.skipIf(!have)("duel translator parity with py (recorded duels)", () => {
  const t: Totals = { steps: 0, msgs: 0, bytes: 0, client: 0, cmds: 0, rng: 0 };
  for (const f of files) it(f.replace(".json.gz", ""), () => { replay(f, t); });
  it("summary", () => {
    console.log(`translator parity: ${files.length} duels, ${t.steps} steps, ${t.msgs} messages (${t.bytes} bytes) equal, `
      + `${t.client} client messages, ${t.cmds} commands to duelcore, ${t.rng} host PyRandom draws`);
    expect(t.steps).toBeGreaterThan(0);
  });
});

// Bugs 2 + 7 (fusion_needs_summon). The client's view 0x2c (engine 0x4b, a fusion material marker) sets its "fusing"
// flag DAT_012a59d8 and only view 0x36 (0x4d RUN_FUSION) clears it; while it is set every CARD_MOVE snaps its card into
// place (FUN_0073dd80 case 0x19 -> FUN_007624d0 -> CCard::snap FUN_007583d0): draws, summons, sets and destructions
// with no animation. Future Fusion (npc_r13: player 0's, npc_r24: the NPC's) sends its materials with HINT 511 and no
// summon follows, so py left the client fusing for the rest of the duel.
describe.skipIf(!have)("fusion_needs_summon: no 0x4b without its 0x4d", () => {
  const ENG = 0, FUSION_MARK = 0x4b, FUSION_MAT = 0x4c, FUSION_RUN = 0x4d;
  const cmdOf = (hex: string) => {
    const b = Buffer.from(hex, "hex");
    return b.readUInt32BE(0) === ENG ? b.readUInt32BE(4) & 0xfff : -1;
  };
  /** Per view: the steps whose output left the client fusing, and the animated moves sent while it was. */
  function fusing(steps: { v: number; i: number; out: [number, string][] }[]) {
    const st = new Map<number, { on: boolean; since: number; moves: number }>();
    const left: string[] = [];
    for (const { v, i, out } of steps) {
      const s = st.get(v) ?? { on: false, since: -1, moves: 0 };
      st.set(v, s);
      for (const [id, h] of out) {
        if (id !== 0x6202) continue;
        const c = cmdOf(h);
        if (c === FUSION_MARK && !s.on) Object.assign(s, { on: true, since: i, moves: 0 });
        else if (c === FUSION_RUN) s.on = false;
        else if (s.on && [0x55, 0x4f, 0x50, 0x31, 0x46].includes(c)) s.moves++;   // draw, summon, set, destroy, tribute
      }
    }
    for (const [v, s] of st) if (s.on) left.push(`view ${v} fusing since step ${s.since}, ${s.moves} draw/summon/set/destroy after`);
    return left;
  }
  const run = (f: string, cfg: Record<string, unknown>) => {
    const steps: { v: number; i: number; out: [number, string][]; want: [number, string][]; raw: Msg[]; wire: WireDecoder }[] = [];
    replay(f, { steps: 0, msgs: 0, bytes: 0, client: 0, cmds: 0, rng: 0 }, { cfg, got: (s, out, wire) => steps.push({ v: s.v, i: s.i, out: msgs(out) as [number, string][], want: s.out || [], raw: out, wire }) });
    return steps;
  };

  /** py's output as the fix sends it: no 0x4b / 0x4c, and the material's 0x3f without P2 0x20 (the mark that it was one). */
  const unmarked = (out: [number, string][]) => out.filter(([id, h]) => id !== 0x6202 || ![FUSION_MARK, FUSION_MAT].includes(cmdOf(h)))
    .map(([id, h]): [number, string] => {
      if (id !== 0x6202 || cmdOf(h) !== 0x3f) return [id, h];
      const b = Buffer.from(h, "hex");
      b.writeUInt32BE(b.readUInt32BE(16) & ~0x20, 16);
      return [id, b.toString("hex")];
    });

  for (const f of ["npc_r13", "npc_r24"]) {
    it(`${f}: Future Fusion's materials go without markers (py left the client fusing)`, () => {
      const py = run(`${f}.json.gz`, { fusion_needs_summon: false });
      expect(fusing(py).length, "py's output leaves the client fusing").toBe(1);
      const ts = run(`${f}.json.gz`, { fusion_needs_summon: true });
      expect(fusing(ts)).toEqual([]);
    });
  }

  it("every recorded duel: only the summonless materials change, every real Fusion Summon is py's", () => {
    const changed: string[] = [];
    for (const f of files) {
      const ts = run(f, { fusion_needs_summon: true });
      expect(fusing(ts), f).toEqual([]);
      ts.forEach((s) => {
        if (s.wire.same(s.raw, s.want, cardKey)) return;
        if (!s.wire.same(s.raw, unmarked(s.want), cardKey)) expect(s.out, `${f} step ${s.i}`).toEqual(unmarked(s.want));
        changed.push(`${f}#${s.i}`);
      });
    }
    expect(changed).toEqual(["npc_r13.json.gz#234", "npc_r24.json.gz#116", "npc_r24.json.gz#172"]);
  }, 300_000);
});
