// Server configuration: py's "vanilla" profile with the env switches that are actually used.
import { placeOrderFrom, type PlaceOrder } from "./duel/zones.ts";

export const GATE_PORT = 5730;
export const GAME_PORT = 5731;
export const LOBBY_PORT = 5732;
export const ROOM_PORT_BASE = 5740;
export const ROOM_LANG_PORT_BASE = 5800;
export const DUEL_PORT = 5760;
/** b2 of the room entries: blue door 13, 7, 15, 8; red door 14, 1, 9, 16, 17, 10, 20 (py ROOM_KINDS). */
export const ROOM_KINDS = [13, 7, 15, 8, 14, 1, 9, 16, 17, 10, 20] as const;
export const WORLD_LANG = 6;
export const ROOM_LANGS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
/** Red-door room kinds (Duel Academy world), py bloques.ACAD_KINDS. */
export const ACAD_KINDS_SET: ReadonlySet<number> = new Set([14, 1, 9, 16, 17, 10, 20]);
export const ACAD_AREA = 5, DOMINO_AREA = 0;

export type Service = "gate" | "accounts" | "lobby" | "duel";

/** Canonical ports (no offset) the server answers on, and their service. */
export const PORTS = Object.assign(new Map<number, Service>(), { duel: DUEL_PORT });
PORTS.set(GATE_PORT, "gate").set(GAME_PORT, "accounts").set(LOBBY_PORT, "lobby").set(DUEL_PORT, "duel");
for (let i = 0; i < ROOM_KINDS.length; i++) PORTS.set(ROOM_PORT_BASE + i, "lobby");
// language rooms (py ROOM_PER_LANG): always listened on; only announced with roomPerLang
for (let i = 0; i < (ROOM_LANGS.length - 1) * ROOM_KINDS.length; i++) PORTS.set(ROOM_LANG_PORT_BASE + i, "lobby");

export interface Config {
  /** Added to every port the client sees (live site: 1000). */
  portOffset: number;
  /** Host announced in the gate's server list (py YO2_PUBLIC_IP). */
  publicIp: string;
  /** py YO2_SINGLE_LOBBY: the gate announces only the world Duel Academy room. */
  singleLobby: boolean;
  /** py YO2_ROOM_PER_LANG. */
  roomPerLang: boolean;
  /** py YO2_LOGIN_ESTRICTO (the live server runs with 0). */
  loginStrict: boolean;
  /** py YO2_OWNER_ACCT. */
  ownerAcct: string | null;
  /** wrangler dev only: allows connections without a DE user (the parity bridge's legacy 0x3003 login). */
  dev: boolean;
  /** Seed for the Python-compatible RNG (parity runs); null = random. */
  paritySeed: number | null;
  /** py YO2_PVP_TEST: the test instance (0x7ffe/0x7ffd, no NPC rock-paper-scissors luck, deck check off). */
  pvpTest: boolean;
  /** Upper bound (s) on the pause after each sent message, duel included. py sleeps 0.25 s after most messages (about
   *  10 s of a login); the recompiled client plays fine at 0.002-0.02 s. null = py's own pauses (SEND_PACE=py, parity runs). */
  sendPace: number | null;
  /** py YO2_DUEL_PAUSE: s between consecutive duel messages (ocg_duel.SEND_PAUSE). */
  duelPause: number;
  /** py YO2_DUEL_RESERVA: the duel ticket's mode (off | vigilar | on). */
  duelReserva: string;
  /** py YO2_DECK_CHECK (off | avisar | bloquear); null = avisar (off with pvpTest). */
  deckCheck: string | null;
  /** NPC_AI: the NPC player of NPC duels: "ai" (default, src/duel/ai) or "py" (the py-parity brain, parity runs only). */
  npcAi: "ai" | "py";
  /** NPC_AI_SPY=1: the elite NPC AI reads the opponent's hidden cards. Off: honest play. */
  npcAiSpy: boolean;
  /** PLACE_ORDER: the zone order of automatic placement (src/duel/zones.ts): "centre" (default, the official 2,1,3,0,4)
   *  or "py" (py's first free zone from the left, parity runs only). */
  placeOrder: PlaceOrder;
}

export function configFrom(env: Record<string, unknown>): Config {
  const s = (k: string) => (env[k] == null ? undefined : String(env[k]));
  const flag = (k: string, def: boolean) => { const v = s(k); return v === undefined ? def : !["", "0"].includes(v); };
  return {
    portOffset: Number(s("PORT_OFFSET") ?? 0) || 0,
    publicIp: s("PUBLIC_IP") || "127.0.0.1",
    singleLobby: flag("SINGLE_LOBBY", false),
    roomPerLang: flag("ROOM_PER_LANG", false),
    loginStrict: flag("LOGIN_STRICT", false),
    ownerAcct: s("OWNER_ACCT") ?? "0000000000000000",
    dev: s("DEV") === "1",
    paritySeed: s("PARITY_SEED") ? Number(s("PARITY_SEED")) : null,
    pvpTest: flag("PVP_TEST", false),
    sendPace: s("SEND_PACE") === "py" ? null : Number(s("SEND_PACE") ?? 0.005) || 0,
    duelPause: Number(s("DUEL_PAUSE")) || 0.05,
    duelReserva: (s("DUEL_RESERVA") || "vigilar").trim().toLowerCase(),
    deckCheck: s("DECK_CHECK") ? ({ "0": "off", "1": "avisar", on: "avisar" } as Record<string, string>)[s("DECK_CHECK")!.trim().toLowerCase()] ?? s("DECK_CHECK")!.trim().toLowerCase() : null,
    npcAi: s("NPC_AI")?.trim().toLowerCase() === "py" ? "py" : "ai",
    npcAiSpy: flag("NPC_AI_SPY", false),
    placeOrder: placeOrderFrom(s("PLACE_ORDER")),
  };
}
