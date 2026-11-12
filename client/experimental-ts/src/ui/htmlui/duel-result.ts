// The duel's end through main's screens/result.js (CResultScene: CWindowResult one per side at 250 / 530, 64, its
// 244 x 442 board; CWindowResultNext, the yellow plate) and the janken / first-player choice through main's duel.js
// dialog look (CUYesNoDialog: the bottom-thick frame, the question, TextSwitch plates). On main the engine draws the
// result titles (glowing art) under holes: the rewrite has no engine, so the title is the record's ShadowText.
// Every button is a real <button> main's modules draw (the layer takes input on elements).
import { dialogLines } from './dialog-text';
import type { DuelView } from '../contracts';
import { WindowBuilder, type HtmlWindow, type Ids, type WindowSpec } from './snapshot';
import type { Picture } from './pictures';
import { signed } from '../../duel/rewards';

export interface DuelResultContext {
  ids: Ids;
  duel: DuelView;
  match?: { round: number; scores: [number, number, number]; complete: boolean } | undefined;
  /** Leave the result (the original's Next: back to the lobby); absent while a match's next game is coming. */
  next?: (() => void) | undefined;
  /** An NPC duel: the record known from the talk (fallback until the server's 0x4140 update gives duel.npcRecord);
   * either one draws CWindowResultNpc in place of the two player records. */
  npc?: { name: string; record: { wins: number; loses: number; draws: number } } | undefined;
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

type NpcResultRecord = NonNullable<DuelView['npcRecord']>;
/** The record against the NPC: the server's post-duel 0x4140 player-data update (duel/rewards.ts, authoritative)
 * when it has arrived, else the counts the server sent when the talk opened plus this duel (features/npc.ts). */
export function npcResultRecord(ctx: DuelResultContext): NpcResultRecord | null {
  if (ctx.match) return null;
  if (ctx.duel.npcRecord) return ctx.duel.npcRecord;
  const n = ctx.npc;
  return n ? { name: n.name, wins: n.record.wins, losses: n.record.loses, draws: n.record.draws } : null;
}

/** The NPC duel's end (CWindowResultNpc, src/Result/yo2ResultWindow.cpp): the 512 x 442 board
 * (npc_result_dai_01_c01, a CSpriteElm member: an extra), the NPC's name on the plate, the result, this character's
 * wins / losses / draws against the NPC (setWins / setLoses / setDraws) and what the duel earned, as ShadowTexts with
 * their 1, 1 black shadow halves. */
export function npcResultWindow(ctx: DuelResultContext, record = npcResultRecord(ctx)): WindowSpec {
  if (!record) throw new Error('npcResultWindow needs an NPC record');
  const { duel } = ctx, x = 256, y = 64, w = 512, h = 442;
  const b = new WindowBuilder(ctx.ids, 'duel-result:npc', 'CWindowResultNpc', { x, y, w, h }, { z: 51150 });
  b.win.extras = [{ id: ctx.ids.of('duel-result:npc/board'), cls: 'CSpriteElm', shown: true, tex: 'npc_result_dai_01_c01', wx: x, wy: y, x: 0, y: 0, src: [0, 0, w, h], sx: 1, sy: 1 } as HtmlWindow['extras'][number]];
  const text = (name: string, t: string, ty: number, px = 16, color = WHITE, tx = 40, tw = w - 80, align = 0) => {
    const c = b.add('CWindowTaskShadowText', name, { x: tx, y: ty, w: tw, h: px + 4 }, { text: t, align, fontSize: px, color });
    b.add('CWindowTaskText', `${name}/shadow`, { x: tx + 1, y: ty + 1, w: tw, h: px + 4 }, { parent: c.id, text: t, color: [0, 0, 0, 1] });
    return c;
  };
  text('name', record.name, 30, 16, WHITE, 40, w - 80, 1);
  const result = outcome(duel.ended, 0);
  text('title', result || duel.ended || '', 104, 24, GOLD, 40, w - 80, 1);
  const rewards = rewardRows(duel.rewards);
  const rows: [string, string, string][] = [['wins', 'Wins', String(record.wins)], ['loses', 'Losses', String(record.losses)], ['draws', 'Draws', String(record.draws)], ...rewards];
  rows.forEach(([key, label, value], i) => {
    const ty = 160 + i * 44;
    text(`l:${key}`, label, ty, 16);
    text(`n:${key}`, value, ty - 4, 24, WHITE, 40, w - 120, 2);
  });
  const spec = b.spec();
  spec.win.controls[0]!.label = `${record.name}: ${result || duel.ended || ''}, ${record.wins} wins, ${record.losses} losses, ${record.draws} draws` +
    rewards.map(([, label, value]) => `; ${label} ${value}`).join('');
  return spec;
}

/** The board's title art (the engine's on main: result_winner / _loser / _draw_01_?, 214 x 56, centred on the header's
 * plate), per side. */
const TITLE_ART = { WIN: 'winner', LOSE: 'loser', DRAW: 'draw' } as const;

/** live's Next plate (result_btn_01 stretched, measured on live's result screen, 2026-11-12): 150 x 54 centred at
 * 437, 512, its word white in a black edge, about 30 px (the engine's CWindowTaskResultNext label). */
export const NEXT_PLATE = { x: 437, y: 512, w: 150, h: 54, px: 30 } as const;
const BLACK = [0, 0, 0, 1];
/** The black edge round the Next plate's word (the engine draws it outlined; result.js's ShadowText takes one offset). */
const OUTLINE = '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 1px 0 #000, 1px 0 0 #000, 0 -1px 0 #000, -1px 0 0 #000, 2px 2px 0 #000';

export function duelResultWindows(ctx: DuelResultContext): WindowSpec[] {
  const { duel, match } = ctx, out: WindowSpec[] = [];
  const npcRecord = npcResultRecord(ctx), titles: Picture[] = [];
  // An NPC duel's end on live is the two records too (the player's and the NPC's: WIN, LOSE, SCORE against each other).
  // As live's capture (mock/result-pvp.json): one ShadowText at 16, 99 (216 wide, 24 px lines) holding the name and
  // the captions a blank line apart, its shadow half 1, 1 black, and the numbers (CTextElms, 24 px) right-aligned on
  // the lines between, at the window's y + 168 / 216 / 264. Live shows no MP or level rows.
  ([0, 1] as const).forEach(side => {
    const p = duel.players[side], x = side === 0 ? 250 : 530, y = 64, w = 244, h = 442;
    const b = new WindowBuilder(ctx.ids, `duel-result:${side}`, 'CWindowResult', { x, y, w, h }, { z: 51150 });
    const tex = side === 0 ? 'result_dai_01_c01' : 'result_dai_01_c02';
    b.add('CWindowTaskResultBase', 'base', { x: 0, y: 0, w, h }, { parts: { sprites: [{ id: ctx.ids.of(`duel-result:${side}/board`), shown: true, tex, wx: x, wy: y, x: 0, y: 0, src: [0, 0, w, h], sx: 1, sy: 1 }] } });
    const result = outcome(duel.ended, side);
    if (result) titles.push({ key: `title:${side}`, source: { archive: `data/result/result_${TITLE_ART[result]}_01_?.png` }, x: x + 15, y: y + 11, w: 214, h: 56, z: side, shown: true, label: result === 'WIN' ? 'WINNER' : result === 'LOSE' ? 'LOSER' : 'DRAW' });
    else {
      const t = b.add('CWindowTaskShadowText', 'title', { x: 16, y: 30, w: w - 32, h: 28 }, { text: duel.ended || '', align: 1, fontSize: 24, color: GOLD });
      b.add('CWindowTaskText', 'title/shadow', { x: 17, y: 31, w: w - 32, h: 28 }, { parent: t.id, text: t.text, color: BLACK });
    }
    // the duel's rows: against an NPC its record and this duel's score; between players the duel itself
    const rows: [string, string, string][] = npcRecord
      ? [['win', 'WIN', String(side === 0 ? npcRecord.wins : npcRecord.losses)], ['lose', 'LOSE', String(side === 0 ? npcRecord.losses : npcRecord.wins)],
        ['score', 'SCORE', String(side === 0 ? duel.rewards?.score ?? 0 : 0)]]
      : [['lp', 'Life Points', String(Math.max(0, p.lp))], ['turns', 'Turns', String(duel.turn)], ...(match ? [['match', 'Games Won', String(match.scores[side] ?? 0)] as [string, string, string]] : []),
        ...(side === 0 && duel.rewards ? [['score', 'SCORE', String(duel.rewards.score)] as [string, string, string]] : [])];
    const name = npcRecord && side === 1 ? npcRecord.name : p.name, lines = [name, ...rows.flatMap(([, label]) => ['', label])];
    const text = lines.join('\n'), th = lines.length * 24;
    const record = b.add('CWindowTaskShadowText', 'record', { x: 16, y: 99, w: 216, h: th }, { text, align: 0, fontSize: 24, lineGap: 0, firstLine: 0, pageLines: lines.length, color: WHITE });
    b.add('CWindowTaskText', 'record/shadow', { x: 17, y: 100, w: 216, h: th }, { parent: record.id, text, color: BLACK });
    b.win.nums = rows.map(([key, , value], i) => ({ id: ctx.ids.of(`duel-result:${side}/n:${key}`), shown: true, text: value, wy: y + 168 + i * 48 }));
    const spec = b.spec(); spec.win.controls[0]!.label = `${name}: ${result || duel.ended || ''}, ` + rows.map(([, l, v]) => `${l} ${v}`).join(', ');
    out.push(spec);
  });
  if (titles.length) out.push(new WindowBuilder(ctx.ids, 'duel-result:titles', 'CEnginePictures', { x: 0, y: 0, w: 1024, h: 768 }, { z: 51155, pics: titles }).spec());
  const { x: NX, y: NY, w: W, h: H, px } = NEXT_PLATE, b = new WindowBuilder(ctx.ids, 'duel-result:next', 'CWindowResultNext', { x: NX, y: NY, w: W, h: H }, { z: 51160 });
  // live's plate says Next after every duel (NPC or PvP); while a match's next game is coming it waits, wordless
  const word = ctx.next ? 'Next' : 'Next game…', ty = Math.round((H - px) / 2) - 1;
  if (ctx.next) {
    const next = ctx.next, c = b.add('CWindowTaskResultNext', 'next', { x: 0, y: 0, w: W, h: H }, { label: '', align: 1, state: 'normal' });
    b.on(c, { key: 'duel-result-next', label: 'Next', click: next });
  }
  const t = b.add('CWindowTaskShadowText', 'word', { x: 0, y: ty, w: W, h: px + 4 }, { text: word, align: 1, fontSize: ctx.next ? px : 16, color: WHITE });
  b.add('CWindowTaskText', 'word/shadow', { x: 1, y: ty + 1, w: W, h: px + 4 }, { parent: t.id, text: word, color: BLACK });
  const spec = b.spec();
  // the word's black edge all round, as live's
  spec.after = root => { for (const el of root.querySelectorAll<HTMLElement>('.txt')) if (el.textContent?.trim().startsWith('Next') && el.style.textShadow !== OUTLINE) el.style.textShadow = OUTLINE; };
  out.push(spec);
  return out;
}

export interface PrepChoice { text: string; buttons: { id: string; label: string; act?: () => void }[] }
/** Janken / first player / start as a duel.js dialog (CUYesNoDialog look): the question and a plate per choice. */
export function preparationDialog(ids: Ids, busy: boolean, choice: PrepChoice): WindowSpec {
  const { text, n } = dialogLines(choice.text, 433), w = 400, h = 8 + n * 16 + 16 + 40, x = 512 - w / 2, y = 384 - h / 2;
  const b = new WindowBuilder(ids, 'duel-prep', 'CUYesNoDialog', { x, y, w, h }, { modal: true, z: 51170 });
  b.add('CWindowTaskFrameBottomThick', 'frame', { x: 0, y: 0, w, h }, { style: 1, band: 40, alpha: 0.7 });
  b.add('CWindowTaskTextField', 'text', { x: 8, y: 8, w: w - 16, h: n * 16 + 8 }, { text, align: 1, color: [0, 0, 0, 1] });
  const btns = choice.buttons, bw = btns.length > 2 ? 100 : 120, gap = (w - bw * btns.length) / (btns.length + 1);
  btns.forEach((o, i) => {
    const on = !!o.act && !busy;
    const c = b.add('CWindowTaskTextSwitch', `opt:${o.id}`, { x: Math.round(gap + i * (bw + gap)), y: h - 32, w: bw, h: 24 }, { label: o.label, align: 1, state: on ? 'normal' : 'disabled', enabled: on });
    b.on(c, { key: `prep:${o.id}`, label: o.label, click: () => { if (on) o.act!(); } });
  });
  return b.spec();
}
