// The duel's end through main's screens/result.js (CResultScene: CWindowResult one per side at 250 / 530, 64, its
// 244 x 442 board; CWindowResultNext, the yellow plate) and the janken / first-player choice through main's duel.js
// dialog look (CUYesNoDialog: the bottom-thick frame, the question, TextSwitch plates). On main the engine draws the
// result titles (glowing art) under holes: the rewrite has no engine, so the title is the record's ShadowText.
// Every button is a real <button> main's modules draw (the layer takes input on elements).
import type { DuelView } from '../contracts';
import { WindowBuilder, type Ids, type WindowSpec } from './snapshot';
import { signed } from '../../duel/rewards';

export interface DuelResultContext {
  ids: Ids;
  duel: DuelView;
  match?: { round: number; scores: [number, number, number]; complete: boolean } | undefined;
  /** Leave the result (the original's Next: back to the lobby); absent while a match's next game is coming. */
  next?: (() => void) | undefined;
}
const WHITE = [1, 1, 1, 1], GOLD = [1, 0.9, 0.3, 1];

/** 'Victory' / 'Defeat' / 'Draw' for side 0's (this player's) point of view, per side. */
function outcome(ended: string | undefined, side: 0 | 1): 'WIN' | 'LOSE' | 'DRAW' | '' {
  if (ended === 'Draw') return 'DRAW';
  if (ended === 'Victory') return side === 0 ? 'WIN' : 'LOSE';
  if (ended === 'Defeat') return side === 0 ? 'LOSE' : 'WIN';
  return '';
}

/** The rewards' rows (MP, the XP score, the level when it moved), each a caption and its number. */
function rewardRows(rewards: DuelView['rewards']): [string, string, string][] {
  if (!rewards) return [];
  const rows: [string, string, string][] = [['mp', 'MP', signed(rewards.mp)], ['score', 'Score', signed(rewards.score)]];
  if (rewards.level[0] !== rewards.level[1]) rows.push(['level', 'Level', `${rewards.level[0]} → ${rewards.level[1]}`]);
  return rows;
}

/** An NPC duel's end (CResultScene's CWindowResultNpc: the 512-wide npc_result_dai_01_c01 board, its counts ShadowText
 * controls): the NPC's name, this duel's outcome, the record against the NPC (setWins / setLoses / setDraws) and what
 * the duel earned. */
function npcResultWindow(ctx: DuelResultContext, record: NonNullable<DuelView['npcRecord']>): WindowSpec {
  const w = 512, h = 442, x = 512 - w / 2, y = 64;
  const b = new WindowBuilder(ctx.ids, 'duel-result:npc', 'CWindowResultNpc', { x, y, w, h }, { z: 51150 });
  b.add('CWindowTaskResultBase', 'base', { x: 0, y: 0, w, h }, { parts: { sprites: [{ id: ctx.ids.of('duel-result:npc/board'), shown: true, tex: 'npc_result_dai_01_c01', wx: x, wy: y, x: 0, y: 0, src: [0, 0, w, h], sx: 1, sy: 1 }] } });
  const text = (name: string, t: string, ty: number, px = 16, color = WHITE, tx = 16, tw = w - 32, align = 0) =>
    b.add('CWindowTaskShadowText', name, { x: tx, y: ty, w: tw, h: px + 4 }, { text: t, align, fontSize: px, color });
  text('name', record.name, 30, 16, WHITE, 16, w - 32, 1);
  const result = outcome(ctx.duel.ended, 0);
  text('title', result || ctx.duel.ended || '', 104, 24, GOLD, 16, w - 32, 1);
  const rows: [string, string, string][] = [['wins', 'WIN', String(record.wins)], ['losses', 'LOSE', String(record.losses)], ['draws', 'DRAW', String(record.draws)], ...rewardRows(ctx.duel.rewards)];
  rows.forEach(([key, label, value], i) => {
    const ty = 150 + i * 44;
    text(`l:${key}`, label, ty, 16, WHITE, 120);
    text(`n:${key}`, value, ty - 4, 24, WHITE, 120, w - 240, 2);
  });
  const spec = b.spec();
  spec.win.controls[0]!.label = `${record.name}: ${result || ctx.duel.ended || ''}; record ${record.wins} wins, ${record.losses} losses, ${record.draws} draws` +
    rewardRows(ctx.duel.rewards).map(([, label, value]) => `; ${label} ${value}`).join('');
  return spec;
}

export function duelResultWindows(ctx: DuelResultContext): WindowSpec[] {
  const { duel, match } = ctx, out: WindowSpec[] = [];
  if (duel.npcRecord && !match) out.push(npcResultWindow(ctx, duel.npcRecord));
  else ([0, 1] as const).forEach(side => {
    const p = duel.players[side], x = side === 0 ? 250 : 530, y = 64, w = 244, h = 442;
    const b = new WindowBuilder(ctx.ids, `duel-result:${side}`, 'CWindowResult', { x, y, w, h }, { z: 51150 });
    const tex = side === 0 ? 'result_dai_01_c01' : 'result_dai_01_c02';
    b.add('CWindowTaskResultBase', 'base', { x: 0, y: 0, w, h }, { parts: { sprites: [{ id: ctx.ids.of(`duel-result:${side}/board`), shown: true, tex, wx: x, wy: y, x: 0, y: 0, src: [0, 0, w, h], sx: 1, sy: 1 }] } });
    const text = (name: string, t: string, ty: number, px = 16, color = WHITE, tx = 16, tw = w - 32, align = 0) =>
      b.add('CWindowTaskShadowText', name, { x: tx, y: ty, w: tw, h: px + 4 }, { text: t, align, fontSize: px, color });
    text('name', p.name, 30, 16, WHITE, 16, w - 32, 1);
    const result = outcome(duel.ended, side);
    text('title', result || duel.ended || '', 104, 24, GOLD, 16, w - 32, 1);
    const nums: { id: number; shown: boolean; text: string; wy: number }[] = [];
    const row = (key: string, label: string, value: string, ty: number) => { text(`l:${key}`, label, ty); nums.push({ id: ctx.ids.of(`duel-result:${side}/n:${key}`), shown: true, text: value, wy: y + ty + 18 }); };
    // Rows 48 apart, as the original's placeNumber rows (168 / 216 / 264): the duel, then what it earned this player.
    const rows: [string, string, string][] = [['lp', 'Life Points', String(Math.max(0, p.lp))], ['turns', 'Turns', String(duel.turn)]];
    if (match) rows.push(['match', 'Games Won', String(match.scores[side] ?? 0)]);
    if (side === 0) rows.push(...rewardRows(duel.rewards));
    rows.forEach(([key, label, value], i) => row(key, label, value, 140 + i * 48));
    b.win.nums = nums;
    const spec = b.spec(); spec.win.controls[0]!.label = `${p.name}: ${result || duel.ended || ''}, ${Math.max(0, p.lp)} LP`;
    out.push(spec);
  });
  const W = 200, H = 40, b = new WindowBuilder(ctx.ids, 'duel-result:next', 'CWindowResultNext', { x: 512 - W / 2, y: 524, w: W, h: H }, { z: 51160 });
  if (ctx.next) {
    const next = ctx.next, c = b.add('CWindowTaskResultNext', 'next', { x: 0, y: 0, w: W, h: H }, { label: 'Return to Lobby', align: 1, state: 'normal' });
    b.on(c, { key: 'duel-result-next', label: 'Return to Lobby', click: next });
  } else b.add('CWindowTaskShadowText', 'wait', { x: 0, y: 10, w: W, h: 20 }, { text: 'Next game…', align: 1, fontSize: 16, color: WHITE });
  out.push(b.spec());
  return out;
}

export interface PrepChoice { text: string; buttons: { id: string; label: string; act?: () => void }[] }
/** Janken / first player / start as a duel.js dialog (CUYesNoDialog look): the question and a plate per choice. */
export function preparationDialog(ids: Ids, busy: boolean, choice: PrepChoice): WindowSpec {
  const n = Math.max(1, Math.min(4, Math.ceil(choice.text.length / 46))), w = 400, h = 8 + n * 16 + 16 + 40, x = 512 - w / 2, y = 384 - h / 2;
  const b = new WindowBuilder(ids, 'duel-prep', 'CUYesNoDialog', { x, y, w, h }, { modal: true, z: 51170 });
  b.add('CWindowTaskFrameBottomThick', 'frame', { x: 0, y: 0, w, h }, { style: 1, band: 40, alpha: 0.7 });
  b.add('CWindowTaskTextField', 'text', { x: 8, y: 8, w: w - 16, h: n * 16 + 8 }, { text: choice.text, align: 1, color: [0, 0, 0, 1] });
  const btns = choice.buttons, bw = btns.length > 2 ? 100 : 120, gap = (w - bw * btns.length) / (btns.length + 1);
  btns.forEach((o, i) => {
    const on = !!o.act && !busy;
    const c = b.add('CWindowTaskTextSwitch', `opt:${o.id}`, { x: Math.round(gap + i * (bw + gap)), y: h - 32, w: bw, h: 24 }, { label: o.label, align: 1, state: on ? 'normal' : 'disabled', enabled: on });
    b.on(c, { key: `prep:${o.id}`, label: o.label, click: () => { if (on) o.act!(); } });
  });
  return b.spec();
}
