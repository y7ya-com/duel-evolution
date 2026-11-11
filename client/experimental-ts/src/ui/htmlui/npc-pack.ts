// The NPC reward pack pick through main's pack picker (screens/packselect.js: CWindowPackSelect over CCardGetPackScene,
// scene 0x17, "Here are your Cards from your last Duel."). The engine shows it after an NPC duel the player won or lost
// with packs on offer (the server's 0x4801 list); a row picks the pack, OK claims it (0x4802, features/npc.ts
// selectPack). The window's frame (cardget_win_01, 776 x 144 at 124, 576), the list's place (8, 8; 16 px rows, six
// shown) and the rows' columns ("@>64/<name>@>600/@2<pct> %@0", src/Pack/CardPack.cpp packCompletionLine) are main's
// (packselect.js). The OK key's place under the well (the frame's 104..144 band) is measured from main's capture.
import type { NpcState } from '../../features/npc';
import type { ClientCommand } from '../contracts';
import { WindowBuilder, type Ids, type WindowSpec } from './snapshot';

/** The picker's own state between snapshots (what CWindowPackSelect keeps): the row chosen, the first row shown. */
export interface NpcPackUi { key: string; selected: number; top: number }
export const npcPackUi = (): NpcPackUi => ({ key: '', selected: 0, top: 0 });

export interface NpcPackDeps {
  ids: Ids; ui: NpcPackUi;
  packName(id: number): string | undefined;
  /** The pack's completion in percent (its cards the player owns), when the rewrite knows it. */
  completion?(id: number): number | undefined;
  send(command: Extract<ClientCommand, { type: 'npcSelectPack' }>): void;
  rerender(): void;
  busy?: boolean;
}

const ROWS = 6, ROW_H = 16;
export const FRAME = { x: 124, y: 576, w: 776, h: 144 } as const;

/** Whether the pack picker is up: the server's settlement offered packs and none is claimed yet. */
export const npcPackOpen = (npc: Readonly<NpcState> | null | undefined): npc is NpcState =>
  !!npc && !!npc.npc && !!npc.result && npc.settlementReceived && npc.packs.length > 0 && npc.packStatus === 'idle';

/** A row's line in main's format: the name at 64, the completion (blue) at 600 when known. */
export function packLine(name: string, pct?: number): string {
  return `@>64/${name}` + (pct === undefined ? '' : `@>600/@2${(Math.round(pct * 10) / 10).toFixed(1)} %@0`);
}

export function npcPackSelect(npc: Readonly<NpcState> | null | undefined, deps: NpcPackDeps): WindowSpec | null {
  if (!npcPackOpen(npc)) return null;
  const { ui, ids } = deps, packs = npc.packs, key = `${npc.npc?.id}:${packs.join(',')}`;
  if (ui.key !== key) Object.assign(ui, { key, selected: 0, top: 0 });
  ui.selected = Math.max(0, Math.min(ui.selected, packs.length - 1));
  const max = Math.max(0, packs.length - ROWS); ui.top = Math.max(0, Math.min(ui.top, max));
  const b = new WindowBuilder(ids, 'npc-pack', 'CWindowPackSelect', { ...FRAME }, { z: 51200, modal: true });
  const names = packs.map(id => deps.packName(id) ?? `Reward Pack ${id}`);
  const list = b.add('CWindowTaskNoBackList', 'list', { x: 8, y: 8, w: 744, h: ROWS * ROW_H }, {
    items: packs.map((id, i) => packLine(names[i]!, deps.completion?.(id))), selected: ui.selected, top: ui.top, topLine: ui.top, rows: ROWS,
  }, { key: 'npc-pack:list', label: 'Reward packs', click: point => {
    if (!point) return;
    const i = Math.floor((point[1] - FRAME.y - 8) / ROW_H) + ui.top;
    if (i >= 0 && i < packs.length && i !== ui.selected) { ui.selected = i; deps.rerender(); }
  }, wheel: delta => { const top = Math.max(0, Math.min(max, ui.top + Math.sign(delta))); if (top !== ui.top) { ui.top = top; deps.rerender(); } } });
  if (packs.length > ROWS) b.add('CWindowTaskScroll', 'bar', { x: 752, y: 8, w: 16, h: ROWS * ROW_H }, { parent: list.id, value: ui.top, thumb: ui.top, max, page: ROWS },
    { value: v => { const top = Math.max(0, Math.min(max, Math.round(v))); if (top !== ui.top) { ui.top = top; deps.rerender(); } } });
  const busy = !!deps.busy;
  b.add('CWindowTaskButtonDuel', 'ok', { x: 328, y: 112, w: 120, h: 24 }, { label: 'OK', state: busy ? 'disabled' : 'normal', enabled: !busy },
    { key: 'npc-pack:ok', label: `Take ${names[ui.selected]}`, click: () => { if (!busy) deps.send({ type: 'npcSelectPack', pack: packs[ui.selected]! }); } });
  return b.spec();
}
