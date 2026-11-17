import { beforeAll, expect, it } from "vitest";
import { createNodeDuelCore } from "../src/duel/engine/node.ts";
import type { DuelCore } from "../src/duel/engine/core.ts";
import { obeliskPlan } from "../src/duel/ai/yugiObelisk.ts";
import { code, play, npcActivated, activating, type Played } from "./npcScenario.ts";

let dc: DuelCore;
beforeAll(async () => { dc = await createNodeDuelCore(); }, 60000);
const god = "Obelisk the Tormentor", sanctuary = "Fiend's Sanctuary";
const summoned = (p: Played) => p.msgs.some(m => m.type === "SUMMONING" && m.code === code(god));
const summons = (p: Played) => p.msgs.filter(m => m.type === "SUMMONING" && m.code === code(god));

it.each([51, 52, 53])("Yugi stage %i makes three Sanctuary tokens and normally summons Obelisk in one turn", npcId => {
  const p = play(dc, {npcId, heart_of_cards: 1, heart_pool: [code(sanctuary)], first: "player", turns: 2,
    npc: {hand: [god, sanctuary, sanctuary, sanctuary]}, player: {mzone: ["Gladiator Beast Gyzarus"]}});
  expect(p.msgs.filter(m => m.type === "CHAINING" && m.code === code(sanctuary) && m.controller === 1)).toHaveLength(3);
  expect(summons(p)).toHaveLength(1);
  expect(p.npc.some(d => d.turn === 2 && d.resp?.action === "SELECT_SUMMON" && (d.sel.summons as any[])[Number(d.resp.index)]?.code === code(god))).toBe(true);
  expect(p.npc.length).toBeLessThan(100);
});

it("splits Valkyrion into the Magnet Warriors and tributes them for Obelisk that turn", () => {
  const p = play(dc, {npcId: 53, heart_of_cards: 1, first: "player", turns: 2,
    npc: {hand: [god, "Valkyrion the Magna Warrior", "Alpha The Magnet Warrior", "Beta The Magnet Warrior", "Gamma The Magnet Warrior"]},
    player: {mzone: ["Gladiator Beast Gyzarus"]}});
  expect(npcActivated(p, "Valkyrion the Magna Warrior")).toBe(true);
  expect(summoned(p)).toBe(true);
});

it("uses Tricky's discarded monster, Monster Reborn and Sanctuary as three tributes", () => {
  const p = play(dc, {npcId: 52, heart_of_cards: 1, first: "player", turns: 2,
    npc: {hand: [god, "The Tricky", "Mystical Elf", "Monster Reborn", sanctuary]},
    player: {mzone: ["Gladiator Beast Laquari"]}});
  expect(p.msgs.some(m => m.type === "SPSUMMONING" && m.code === code("The Tricky"))).toBe(true);
  expect(npcActivated(p, "Monster Reborn")).toBe(true);
  expect(npcActivated(p, sanctuary)).toBe(true);
  expect(summoned(p)).toBe(true);
});

it("materialises Obelisk when Sanctuary plus two existing bodies can summon it immediately", () => {
  const p = play(dc, {npcId: 51, heart_of_cards: 1, first: "player", turns: 2,
    npc: {hand: [sanctuary], mzone: ["Alpha The Magnet Warrior", "Beta The Magnet Warrior"]},
    player: {mzone: ["Gladiator Beast Gyzarus"]}});
  expect(p.npc.filter(d => d.sel.heart_of_cards).map(d => d.resp?.card)).toContain(code(god));
  expect(summoned(p)).toBe(true);
});

it("materialises the third Sanctuary within the three-copy cap to finish an empty-field Obelisk line", () => {
  const p = play(dc, {npcId: 52, heart_of_cards: 1, first: "player", turns: 2,
    npc: {hand: [god, sanctuary, sanctuary]}, player: {mzone: ["Gladiator Beast Gyzarus"]}});
  expect(p.npc.filter(d => d.sel.heart_of_cards).map(d => d.resp?.card)).toContain(code(sanctuary));
  expect(summoned(p)).toBe(true);
});

it("uses the existing Valkyrion as its single three-body generator", () => {
  const p = play(dc, {npcId: 53, heart_of_cards: 1, first: "player", turns: 2,
    npc: {hand: [god], mzone: ["Valkyrion the Magna Warrior"], grave: ["Alpha The Magnet Warrior", "Beta The Magnet Warrior", "Gamma The Magnet Warrior"]},
    player: {mzone: ["Gladiator Beast Gyzarus"]}});
  expect(npcActivated(p, "Valkyrion the Magna Warrior")).toBe(true);
  expect(summoned(p)).toBe(true);
  expect(npcActivated(p, sanctuary)).toBe(false);
});

it("recognises that drawing Obelisk completes an existing Valkyrion setup", () => {
  const p = play(dc, {npcId: 52, heart_of_cards: 1, first: "player", turns: 2,
    npc: {mzone: ["Valkyrion the Magna Warrior"], grave: ["Alpha The Magnet Warrior", "Beta The Magnet Warrior", "Gamma The Magnet Warrior"]},
    player: {mzone: ["Gladiator Beast Gyzarus"]}});
  expect(p.npc.filter(d => d.sel.heart_of_cards).map(d => d.resp?.card)).toContain(code(god));
  expect(summoned(p)).toBe(true);
});

it("revives actual tribute fodder instead of a temporary special-summoned Obelisk", () => {
  const p = play(dc, {npcId: 52, heart_of_cards: 1, heart_pool: [code(sanctuary)], first: "player", turns: 2,
    npc: {hand: [god, "Monster Reborn", sanctuary, sanctuary, sanctuary], grave: [god, "Mystical Elf"], mzone: ["Alpha The Magnet Warrior"]},
    player: {mzone: ["Gladiator Beast Gyzarus"]}});
  expect(summoned(p)).toBe(true);
  expect(p.msgs.some(m => m.type === "SPSUMMONING" && m.code === code(god))).toBe(false);
});

it.each(["sheep token", "kuriboh token", "fluff token"])("does not plan a same-turn Tribute Summon using restricted %s fodder", token => {
  expect(obeliskPlan({hand: [god.toLowerCase()], field: Array(3).fill(token), grave: [], removed: [],
    dimensionSafe: true, lp: 8000, normalLeft: true, normalMonster: () => false, spellLocked: false, effectsNegated: false})).toBeNull();
});

it("does not spend Dimension Fusion when restricted tokens leave room for only two tributes", () => {
  expect(obeliskPlan({hand: [god.toLowerCase(), "dimension fusion"], field: Array(3).fill("sheep token"),
    grave: [], removed: Array(3).fill("mystical elf"), dimensionSafe: true, lp: 8000, normalLeft: true,
    normalMonster: n => n === "mystical elf", spellLocked: false, effectsNegated: false})).toBeNull();
});

it("draws Dimension Fusion as a single spell to recover three already banished tributes", () => {
  const p = play(dc, {npcId: 51, heart_of_cards: 1, heart_pool: [code("Dimension Fusion")], first: "player", turns: 2,
    npc: {hand: [god], grave: ["Alpha The Magnet Warrior", "Beta The Magnet Warrior", "Gamma The Magnet Warrior"]},
    player: {hand: ["Soul Release"], mzone: ["Gladiator Beast Gyzarus"]}, player_policy: sel => {
      if (sel.type === "SELECT_CARD") return {type: "SELECT_CARD", indicies: [0,1,2]};
      return activating("Soul Release")(sel);
    }});
  expect(npcActivated(p, "Dimension Fusion")).toBe(true);
  expect(summoned(p)).toBe(true);
  expect(npcActivated(p, sanctuary)).toBe(false);
});

it("protects the setup by bouncing unknown backrow before making its first token", () => {
  const p = play(dc, {npcId: 52, heart_of_cards: 1, heart_pool: [code(sanctuary)], first: "player", turns: 2,
    npc: {hand: [god, sanctuary, sanctuary, sanctuary, "Giant Trunade"]},
    player: {mzone: ["Gladiator Beast Gyzarus"], szone: ["Mirror Force"]}, player_policy: activating("Mirror Force")});
  const acts = p.msgs.filter(m => m.type === "CHAINING" && m.controller === 1).map(m => m.code);
  expect(acts.indexOf(code("Giant Trunade"))).toBeLessThan(acts.indexOf(code(sanctuary)));
  expect(summoned(p)).toBe(true);
  expect(p.msgs.some(m => m.type === "MOVE" && m.card === code(god) && (m.to as any)?.location === 16)).toBe(false);
});

it("abandons the three-token route when a real counter trap removes one extender", () => {
  const p = play(dc, {npcId: 51, heart_of_cards: 1, heart_pool: [code(sanctuary)], first: "player", turns: 2,
    npc: {hand: [god, sanctuary, sanctuary, sanctuary]},
    player: {mzone: ["Gladiator Beast Gyzarus"], szone: ["Solemn Judgment"]}, player_policy: activating("Solemn Judgment")});
  expect(p.msgs.some(m => m.type === "CHAINING" && m.code === code("Solemn Judgment"))).toBe(true);
  expect(summoned(p)).toBe(false);
  expect(p.npc.length).toBeLessThan(100);
});

it("does not offer a Sanctuary combo into visible Spell Canceller", () => {
  const p = play(dc, {npcId: 51, heart_of_cards: 1, heart_pool: [code(sanctuary)], first: "player", turns: 2,
    npc: {hand: [god, sanctuary, sanctuary, sanctuary]}, player: {mzone: ["Spell Canceller"]}});
  expect(npcActivated(p, sanctuary)).toBe(false);
  expect(summoned(p)).toBe(false);
});

it("keeps an already lethal attack instead of tributing the attackers", () => {
  const p = play(dc, {npcId: 53, heart_of_cards: 1, heart_pool: [code(sanctuary)], first: "player", turns: 2,
    npc: {hand: [god, sanctuary, sanctuary, sanctuary], mzone: ["Alpha The Magnet Warrior", "Beta The Magnet Warrior", "Gamma The Magnet Warrior"]},
    player: {lp: 1500}});
  expect(summoned(p)).toBe(false);
  expect(p.end?.winner).toBe(1);
});
