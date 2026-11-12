// What an NPC duel gave, as live shows it after the NPC's lines and the reward pack pick (htmlui/npc-talk.ts,
// npc-pack.ts): the item-get message (CWindowModelItemGet, "You got <X>!"), one at a time in main's Ok dialog
// (dialog.js: mock/dialog-ok.json), the last OK ending the talk. The pack's cards (the server's 0x4803 receipt), the
// gift's cards and items (0x5205). A claim the server refused or that could not be delivered says so in main's error
// dialog first. Nothing else: no panel of receipts, statuses or refresh keys (live has none).
import type { NpcState } from '../../features/npc';
import { npcPackOpen } from './npc-pack';
import { stockDialog } from './windows';
import type { Ids, WindowSpec } from './snapshot';

/** Which message of this NPC's rewards is up (the key: the NPC session's rewards, so a new one starts again). */
export interface NpcItemGetUi { key: string; at: number; closing: string }
export const npcItemGetUi = (): NpcItemGetUi => ({ key: '', at: 0, closing: '' });

export interface NpcItemGetDeps {
  ids: Ids; ui: NpcItemGetUi;
  /** A received card's name (the catalogue's), when known. */
  cardName(id: number): string | undefined;
  /** A gifted PBIN bit's name (npcs/gift-names.ts), or null. */
  itemName(bit: number): string | null;
  /** The talk ends (the app's npcClose). */
  close(): void;
  rerender(): void;
}
export interface NpcItemMessage { kind: 'ok' | 'error'; text: string }

/** The rewards are settled: after the duel, its lines said, no pack left to pick, no claim waiting on the server. */
export const npcItemGetReady = (npc: Readonly<NpcState> | null | undefined): npc is NpcState =>
  !!npc?.npc && npc.result !== null && (npc.stage === 'done' || npc.stage === 'claiming') && !npcPackOpen(npc)
  && npc.packStatus !== 'pending' && npc.giftStatus !== 'pending';

/** The controller lets the talk end (features/npc.ts close): nothing pending or uncertain about eligibility or contact. */
const closable = (npc: Readonly<NpcState>): boolean => npc.stage === 'done' && !npc.eligibility.refreshing
  && !['pending', 'uncertain'].includes(npc.eligibility.status) && !['pending', 'uncertain'].includes(npc.firstContactStatus);

export function npcItemMessages(npc: Readonly<NpcState>, d: Pick<NpcItemGetDeps, 'cardName' | 'itemName'>): NpcItemMessage[] {
  const out: NpcItemMessage[] = [];
  const refused = [npc.packStatus, npc.giftStatus].some(s => s === 'failed' || s === 'uncertain');
  if (refused && npc.error) out.push({ kind: 'error', text: npc.error });
  for (const id of [...npc.cards.map(c => c.id), ...npc.giftCards]) out.push({ kind: 'ok', text: `You got ${d.cardName(id) ?? 'a card'}!` });
  for (const bit of npc.giftBits) out.push({ kind: 'ok', text: `You got ${d.itemName(bit) ?? 'an item'}!` });
  return out;
}

export function npcItemGetWindows(npc: Readonly<NpcState> | null | undefined, d: NpcItemGetDeps): WindowSpec[] {
  if (!npcItemGetReady(npc)) return [];
  const messages = npcItemMessages(npc, d), ui = d.ui;
  const key = `${npc.npc!.id}:${npc.result}:${npc.packStatus}:${npc.giftStatus}:${messages.length}`;
  if (ui.key !== key) Object.assign(ui, { key, at: 0 });
  const m = messages[ui.at];
  if (!m) {
    // all said (or nothing to say): the talk ends once the controller lets it, once per rewards
    if (closable(npc) && ui.closing !== key) { ui.closing = key; queueMicrotask(() => d.close()); }
    return [];
  }
  const spec = stockDialog({ ids: d.ids }, `npc-itemget:${ui.at}`, m.kind, m.text,
    [{ from: 'OK', key: 'npc-itemget-ok', click: () => { ui.at++; d.rerender(); } }]);
  // over everything the lobby shows (the menus 51603), as live's item-get
  Object.assign(spec.win, { z: 51620, topmost: true });
  return [spec];
}
