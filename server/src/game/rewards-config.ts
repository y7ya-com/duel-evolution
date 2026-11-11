import { shardValues } from "./shards-config.ts";
import type { NpcEvent } from "./missions.ts";

/** All reward amounts and thresholds. Existing starter grants keep their existing binding. */
export const REWARDS = {
  enabled: true,
  login: { mp: 40, milestoneMP: 100, milestoneDays: [10, 20], cycle: 30 },
  daily: { mp: 80, issued: 3, cap: 9 },
  weekly: [
    { key: "play", label: "Play 4 rewarded duels", event: "play", target: 4, mp: 600 },
    { key: "win", label: "Win 4 rewarded duels", event: "win", target: 4, mp: 600 },
    { key: "days", label: "Play on 2 UTC days", event: "days", target: 2, mp: 600 },
  ],
  first: [
    { key: "shop", label: "Visit the shop", event: "shop", target: 1, mp: 1000 },
    { key: "deck", label: "Save a playable owned deck", event: "deck", target: 1, mp: 2000 },
    { key: "packs", label: "Open 5 packs", event: "pack", target: 5, mp: 2000 },
    { key: "duel1", label: "Finish your first rewarded duel", event: "play", target: 1, mp: 2000 },
    { key: "duel4", label: "Finish 4 rewarded duels", event: "play", target: 4, mp: 6000 },
    { key: "duel8", label: "Finish 8 rewarded duels", event: "play", target: 8, mp: 10000 },
    { key: "duel12", label: "Finish 12 rewarded duels", event: "play", target: 12, mp: 17000 },
  ],
  lifetime: [
    { key: "play50", label: "Finish 50 rewarded duels", event: "play", target: 50, mp: 500 },
    { key: "play100", label: "Finish 100 rewarded duels", event: "play", target: 100, mp: 1000 },
    { key: "play500", label: "Finish 500 rewarded duels", event: "play", target: 500, mp: 2000 },
    { key: "wins100", label: "Win 100 rewarded duels", event: "win", target: 100, mp: 1000 },
    { key: "pvp25", label: "Finish 25 rewarded PvP duels", event: "pvp", target: 25, mp: 1000 },
    { key: "npc25", label: "Finish 25 rewarded NPC duels", event: "npc", target: 25, mp: 500 },
    { key: "extra10", label: "Play 10 rewarded duels with an extra deck", event: "extra", target: 10, mp: 500 },
    { key: "packs100", label: "Open 100 packs", event: "pack", target: 100, mp: 500 },
  ],
  // Limited-time events (missions.ts eventsRollover): shards, not MP; once per account (the first character to finish
  // claims it, as First Steps). Owner, 2026-11-11: beat each of the map's NPCs once from today for 2 weeks, the reward
  // worth 3 UR crafts at the shard table of the day.
  events: [
    { key: "npc-sweep-2026-11", label: "Beat all {n} NPCs on the map", from: "2026-11-11", until: "2026-11-25", shards: 3 * shardValues().craft.UR },
  ] as NpcEvent[],
} ;
