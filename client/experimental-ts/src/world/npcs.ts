import type { NpcSpot, WorldMap, WorldPosition } from './maps';

/** Where My Room's scene stands its player (CMyRoomScene's init, 0x00825823: (790.0, 430.0)), facing front. */
export const MY_ROOM_SPAWN: WorldPosition = Object.freeze({ x: 790, y: 430, direction: 0 });

/** An NPC of the server's NPCINFOLIST (0x4233): the row's spot (+0x38), friendship threshold (+0x34) and previous (+0x40). */
export interface ListedNpc { readonly id: number; readonly threshold: number; readonly spot: number; readonly previous: number }

/** The NPCs standing on `map`, as the area map's NPC builder (0x009ff2d0) picks them from the NPC list:
 * - the row's spot record (the exe's spot tables, tools/npc-spots.mjs) must be on this map;
 * - a row with a previous level stands only once the player's rank with that previous NPC reached the previous row's
 *   threshold (0x009ff369..0x009ff3b5: the player's NPC record byte 3, npcbin[id * 4 + 3]);
 * - a row whose own threshold is reached gives way to the row that names it as previous, when there is one
 *   (0x009ff3b7..0x009ff400). */
export function npcsOnMap<T extends ListedNpc>(map: Pick<WorldMap, 'npcSpots'>, npcs: readonly T[], rank: (id: number) => number): { npc: T; spot: NpcSpot }[] {
  const spots = new Map(map.npcSpots.map(s => [s.spot, s])), byId = new Map(npcs.map(n => [n.id, n])), out: { npc: T; spot: NpcSpot }[] = [];
  for (const npc of npcs) {
    const spot = spots.get(npc.spot); if (!spot) continue;
    if (npc.previous !== 0) { const previous = byId.get(npc.previous); if (rank(npc.previous) < (previous?.threshold ?? 0)) continue; }
    if (rank(npc.id) >= npc.threshold && npcs.some(n => n.previous === npc.id)) continue;
    out.push({ npc, spot });
  }
  return out;
}

/** Where an NPC stands and faces: the spot's (x, y) and direction, or rand() % 8 for a spot flagged to look any way
 * (record byte +0x11 bit 2, 0x009ff549). */
export function npcStance(spot: NpcSpot, random: () => number = Math.random): WorldPosition {
  return { x: spot.x, y: spot.y, direction: spot.randomDirection ? Math.min(7, Math.floor(random() * 8)) : spot.direction };
}
