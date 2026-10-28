// NPC brain (src/duel/brain) against py research/ia/brain.py: the fixtures recorded by scripts/brain_record.py
// (py's NpcBrain in seeded duelcore duels) are replayed through the TS NpcBrain with the same profile and seed, and
// every choose() must give py's answer. Needs gamedata/ (scripts/brain_gamedata.py + scripts/brain_record.py):
// without it only the unit checks run.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { CardDB, NpcBrain, type NpcProfile, type NpcProfilesJson, PERFILES, loadNpcProfile, porNivel, pyRound } from "../src/duel/brain/index.ts";

const GD = join(import.meta.dirname, "..", "gamedata");
const FIX = join(GD, "fixtures", "brain");
const haveData = existsSync(join(GD, "brain_cards.json")) && existsSync(join(GD, "npc_profiles.json")) && existsSync(FIX);

describe("profiles", () => {
  it("por_nivel matches py (levels 0..10, clamped to 1..9)", () => {
    const py: unknown[][] = [
      ["nivel1", 0.85, false, false, true, -800, 1, 0.4, 800, 6500, 9],
      ["nivel1", 0.85, false, false, true, -800, 1, 0.4, 800, 6500, 9],
      ["nivel2", 0.8, false, false, true, -600, 1, 0.327, 850, 6500, 10],
      ["nivel3", 0.75, true, false, true, -450, 2, 0.26, 950, 6500, 11],
      ["nivel4", 0.7, true, true, true, -300, 2, 0.198, 1050, 6500, 12],
      ["nivel5", 0.65, true, true, true, -200, 2, 0.141, 1150, 6500, 13],
      ["nivel6", 0.6, true, true, true, -100, 2, 0.092, 1200, 6500, 14],
      ["nivel7", 0.55, true, true, false, -50, 2, 0.05, 1300, 6500, 15],
      ["nivel8", 0.5, true, true, false, 0, 2, 0.018, 1400, 6500, 16],
      ["nivel9", 0.45, true, true, false, 0, 2, 0.0, 1500, 6500, 17],
      ["nivel9", 0.45, true, true, false, 0, 2, 0.0, 1500, 6500, 17],
    ];
    for (let n = 0; n <= 10; n++) expect(Object.values(porNivel(n))).toEqual(py[n]);
  });

  it("pyRound is round-half-even on the exact value", () => {
    expect([pyRound(0.125, 2), pyRound(0.375, 2), pyRound(2.5), pyRound(3.5), pyRound(-2.5), pyRound(2.675, 2), pyRound(-0.5)])
      .toEqual([0.12, 0.38, 2, 4, -2, 2.67, 0]);
  });

  it("load_npc_profile falls back to por_nivel(2)", () => {
    expect(loadNpcProfile(5, null)).toEqual(porNivel(2));
    expect(loadNpcProfile(999, { 1: { perfil: {} } })).toEqual(porNivel(2));
  });
});

/** Canonical JSON (sorted keys): py dicts and TS objects compare by content. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));
}

describe.skipIf(!haveData)("parity with py brain.py (recorded duels)", () => {
  const files = haveData ? readdirSync(FIX).filter((f) => f.endsWith(".jsonl.gz")).sort() : [];
  const db = haveData ? new CardDB(JSON.parse(readFileSync(join(GD, "brain_cards.json"), "utf8"))) : null;
  const table: NpcProfilesJson | null = haveData ? JSON.parse(readFileSync(join(GD, "npc_profiles.json"), "utf8")) : null;
  const totals = { duels: 0, choices: 0, observes: 0, profiles: new Set<string>() };

  it("has fixtures", () => expect(files.length).toBeGreaterThan(0));

  it.each(files)("%s", (file) => {
    const lines = gunzipSync(readFileSync(join(FIX, file))).toString("utf8").split("\n").filter(Boolean);
    const head = JSON.parse(lines[0]);
    const brains = new Map<number, NpcBrain>();
    for (const [p, src] of Object.entries(head.brains as Record<string, { npc?: number; name?: string; perfil: NpcProfile }>)) {
      const prof = src.npc !== undefined ? loadNpcProfile(src.npc, table) : PERFILES[src.name!];
      expect(prof).toEqual(src.perfil);
      brains.set(Number(p), new NpcBrain(src.npc !== undefined ? prof : src.name!, Number(p), head.seeds[p], db!));
      totals.profiles.add(src.npc !== undefined ? `npc${src.npc}` : src.name!);
    }
    const bad: string[] = [];
    let choices = 0, observes = 0;
    for (let n = 1; n < lines.length; n++) {
      const rec = JSON.parse(lines[n]);
      if ("o" in rec) {
        observes++;
        for (const b of brains.values()) b.observe(rec.o);
        continue;
      }
      choices++;
      const b = brains.get(rec.c)!;
      let got: unknown, err: unknown = null;
      try { got = b.choose(rec.sel); } catch (e) { err = e; }
      if ("x" in rec) {
        if (err === null) bad.push(`line ${n + 1} ${rec.sel.type}: py raised ${rec.x}, ts gave ${canon(got)}`);
      } else if (err !== null) {
        bad.push(`line ${n + 1} ${rec.sel.type}: ts raised ${String(err)}, py gave ${canon(rec.r)}`);
      } else if (canon(got) !== canon(rec.r)) {
        bad.push(`line ${n + 1} ${rec.sel.type} turn ${rec.sel.turn}: py ${canon(rec.r)} ts ${canon(got)}`);
      }
      if (bad.length >= 5) break;   // after a divergence the rng / counters drift: the first ones matter
    }
    totals.duels++; totals.choices += choices; totals.observes += observes;
    if (totals.duels === files.length)
      console.log(`brain parity: ${totals.duels} duels, ${totals.choices} choices, ${totals.observes} observes, ` +
        `${totals.profiles.size} profiles (${[...totals.profiles].join(" ")})`);
    expect(bad).toEqual([]);
  }, 120_000);
});
