/** What a duel earned, as the server reports it after the duel. On the lobby connection the duel's end sends 0x4140
 * PLAYERDATAUPDATE (server/src/game/persist.ts PDU_SPEC, big-endian: lv u8, score u32 (the XP the level grows from),
 * mp u32, ... and, after an NPC duel, npc_index u32 + that NPC's NPCBIN row: wins, losses, draws, rank). The original's
 * CResultScene shows the NPC row on CWindowResultNpc (setWins / setLoses / setDraws, src/Result/yo2ResultWindow.cpp). */
export interface ProfileSnapshot { level: number; score: number; mp: number }
export interface DuelRewards { mp: number; score: number; level: [number, number] }
export interface NpcRecord { npc: number; wins: number; losses: number; draws: number }

/** 0x4140's fixed layout: npc_index sits after 115 bytes of record fields; the whole message is 125 bytes. */
export const PDU_NPC_OFFSET = 115, PDU_LENGTH = 125;

/** The change between the profile when the duel began and now; null when nothing changed (or nothing is known). */
export function duelRewards(before: ProfileSnapshot | null | undefined, after: ProfileSnapshot | null | undefined): DuelRewards | null {
  if (!before || !after) return null;
  const mp = after.mp - before.mp, score = after.score - before.score;
  if (!mp && !score && after.level === before.level) return null;
  return { mp, score, level: [before.level, after.level] };
}

/** The NPC record a 0x4140 carries after an NPC duel (npc_index 0: not an NPC duel's update). */
export function pduNpcRecord(data: Uint8Array): NpcRecord | null {
  if (data.length < PDU_LENGTH) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength), npc = view.getUint32(PDU_NPC_OFFSET);
  if (!npc) return null;
  return { npc, wins: data[PDU_NPC_OFFSET + 4]!, losses: data[PDU_NPC_OFFSET + 5]!, draws: data[PDU_NPC_OFFSET + 6]! };
}

/** "+120" / "-40" / "0". */
export const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));
