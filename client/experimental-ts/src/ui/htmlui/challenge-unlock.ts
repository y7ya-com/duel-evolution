// The famous-NPC unlock picture live shows on reaching the world (CWindowModelItemGet, 0x00ac2cd0): the area map's
// ITEMGET(1, 0) (features/npc.ts checkEligibility) answers with the challenge rights the character has just been given
// (server persist.ts challengeRightsDue: PBIN 592 Seto Kaiba, 593 Alexis Rhodes, 594 Yami Marik), and for each the
// engine opens its item window: the frame (itemget_win_01_c01.png, 512 x 512 at 256, 112: the a01 movie's last frame),
// the NPC's waist-up picture inside it (CWaistUpNpcScale: the NPC's own picture, data/avatar/npc/<set>.csv), the item's
// name in red (yo2text 0xd87 / 0xd88 / 0xd91, "@1": red, centred in 448 at 288, 528) and OK (abmake_btn_03_01, 162 x 42
// at 431, 650; its caption at 431, 658). One window at a time; OK goes on to the next.
import { npcChibiSet } from '../../avatars/npc';
import { WindowBuilder, type Ids, type WindowSpec } from './snapshot';

/** Each challenge right's NPC (its first id: its picture set) and its line's yo2text id. */
export const CHALLENGE_UNLOCKS: Readonly<Record<number, { npc: number; text: number; fallback: string }>> = {
  592: { npc: 54, text: 0xd87, fallback: ' Now, you can challenge Seto Kaiba to a Duel!' },
  593: { npc: 66, text: 0xd88, fallback: ' Now, you can challenge Alexis Rhodes to a Duel!' },
  594: { npc: 75, text: 0xd91, fallback: ' Now, you can challenge Yami Marik to a Duel!' },
};
export const ITEMGET_FRAME = 'data/itemget/itemget_win_01_c01.png';
/** The waist-up picture in the frame, measured on live's capture: the NPC's 768-px picture at 0.539 from (328, 134),
 * cut off at the name's panel (y 512). */
export const UNLOCK_PORTRAIT = { x: 328, y: 134, scale: 0.539, bottom: 512 } as const;
/** The item's name as the engine draws "@1" text in a ShadowText: red, bold, 18 px, its black shadow 1 px down-right. */
export const itemLine = (text: string) => `itemline:${encodeURIComponent(text)}`;

export interface ChallengeUnlockUi { key: unknown; at: number }
export const challengeUnlockUi = (): ChallengeUnlockUi => ({ key: null, at: 0 });
export interface ChallengeUnlockDeps { ids: Ids; ui: ChallengeUnlockUi; text?(id: number): string | undefined; rerender(): void }

/** The unlocks to show for one ITEMGET(1) receipt (`key`: the receipt, so a new one starts again). */
export function challengeUnlockWindows(key: unknown, bits: readonly number[], d: ChallengeUnlockDeps): WindowSpec[] {
  const unlocks = bits.filter(b => CHALLENGE_UNLOCKS[b]);
  if (d.ui.key !== key) Object.assign(d.ui, { key, at: 0 });
  const bit = unlocks[d.ui.at]; if (bit === undefined) return [];
  const u = CHALLENGE_UNLOCKS[bit]!, set = npcChibiSet(u.npc), line = d.text?.(u.text) ?? u.fallback;
  const pics = new WindowBuilder(d.ids, `unlock:${bit}:pictures`, 'CEnginePictures', { x: 0, y: 0, w: 1024, h: 768 }, { z: 51618, topmost: true,
    pics: [{ key: 'frame', source: { archive: ITEMGET_FRAME }, x: 256, y: 112, w: 512, h: 512, z: 0, shown: true },
      ...(set ? [{ key: 'npc', source: { canvas: `clerk:${set}` }, x: UNLOCK_PORTRAIT.x, y: UNLOCK_PORTRAIT.y, w: 768 * UNLOCK_PORTRAIT.scale, h: UNLOCK_PORTRAIT.bottom - UNLOCK_PORTRAIT.y, z: 1, shown: true,
        crop: [0, 0, 768, Math.round((UNLOCK_PORTRAIT.bottom - UNLOCK_PORTRAIT.y) / UNLOCK_PORTRAIT.scale)] as [number, number, number, number] }] : []),
      { key: 'line', source: { canvas: itemLine(line) }, x: 288, y: 524, w: 448, h: 24, z: 2, shown: true, label: line.trim() },
      { key: 'ok', source: { archive: 'data/Scene/AvatarChange/abmake_btn_03_01.png' }, x: 431, y: 650, w: 162, h: 42, z: 2, shown: true, crop: [0, 0, 162, 42] as [number, number, number, number] }] }).spec();
  const b = new WindowBuilder(d.ids, `unlock:${bit}`, 'CWindowModelItemGet', { x: 0, y: 0, w: 1024, h: 768 }, { z: 51620, modal: true, topmost: true });
  b.add('CWindowTaskText', 'ok', { x: 431, y: 658, w: 162, h: 42 }, { text: 'OK', align: 1, fontSize: 16, color: [0, 0, 0, 1] },
    { key: 'unlock-ok', label: 'OK', click: () => { d.ui.at++; d.rerender(); } });
  return [pics, b.spec()];
}
