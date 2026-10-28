// The duel port's data and the engine instance (py ocg_duel: core(), cardmap(), CardDB.shared(), npc_deck()).
// The tables come from gamedata/ (bundled); the DuelCore is created ONCE, asynchronously, at boot by the host
// (do.ts with the workerd wasm, tests with engine/node.ts) and handed in with setDuelCore: every command after that is
// synchronous, so the handlers stay synchronous.
import TJ from "../../gamedata/translator.json";
import BC from "../../gamedata/brain_cards.json";
import NP from "../../gamedata/npc_profiles.json";
import DJ from "../../gamedata/duel.json";
import { CardMap, type TranslatorData } from "./translator/cardmap.ts";
import { CardDB, type BrainCardsJson, type NpcProfilesJson } from "./brain/index.ts";
import type { DuelCore } from "./engine/core.ts";

export interface Deck { main: number[]; extra: number[] }

let CM: CardMap | null = null;
/** py ocg_duel.cardmap() */
export const cardmap = (): CardMap => (CM ??= new CardMap(TJ as unknown as TranslatorData));

/** py CardDB.shared() of the NPC brain */
export function brainDb(): CardDB {
  try { return CardDB.shared(); } catch { const db = new CardDB(BC as unknown as BrainCardsJson); CardDB.setShared(db); return db; }
}

export const NPC_PROFILES = NP as unknown as NpcProfilesJson;
/** research/ia/npc_decks.json (YO2 ids) */
export const NPC_DECKS = (DJ as unknown as { npc_decks: Record<string, Deck> }).npc_decks;
/** research/ia/cards_yo2.csv: yo2 id -> [konami id, csv kind, limit, name] */
export const DECK_CARDS = (DJ as unknown as { cards: Record<string, [number | null, number, number, string]> }).cards;

let CORE: DuelCore | null = null;
/** The engine (py: the single duelcore process). Null until the host's boot created it. */
export const duelCore = (): DuelCore | null => CORE;
export function setDuelCore(dc: DuelCore | null): void { CORE = dc; }

/** py ocg_duel.npc_deck: the NPC's official deck (YO2 ids), or null (NPC_DECKS_EXTRA is off). */
export function npcDeck(npcId: number): Deck | null {
  const d = NPC_DECKS[String(npcId)];
  if (!d || !d.main || !d.main.length) return null;
  return { main: d.main.slice(0, 80), extra: (d.extra ?? []).slice(0, 18) };
}

export const SUBSTITUTE = 15025844; // Mystical Elf: exists in YO2 and in cards.cdb (cards without a pair)
/** py ocg_duel.to_codes */
export const toCodes = (yo2: number[]): number[] => yo2.map((y) => cardmap().yo2_to_code(y) || SUBSTITUTE);
