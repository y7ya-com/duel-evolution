// The duel's end through main's screens/result.js (CResultScene: CWindowResult one per side at 250 / 530, 64, its
// 244 x 442 board; CWindowResultNext, the yellow plate) and the janken / first-player choice through main's duel.js
// dialog look (CUYesNoDialog: the bottom-thick frame, the question, TextSwitch plates). On main the engine draws the
// result titles (glowing art) under holes: the rewrite has no engine, so the title is the record's ShadowText.
// Every button is a real <button> main's modules draw (the layer takes input on elements).
import type { DuelView } from '../contracts';
import { WindowBuilder, type HtmlWindow, type Ids, type WindowSpec } from './snapshot';
import type { Picture } from './pictures';

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

type NpcResultRecord = NonNullable<DuelView['npcRecord']>;
/** The record against the NPC: the server's post-duel 0x4140 player-data update (duel/rewards.ts, authoritative)
 * when it has arrived, else the counts the server sent when the talk opened plus this duel (features/npc.ts). */
export function npcResultRecord(ctx: DuelResultContext): NpcResultRecord | null {
  if (ctx.match) return null;
  if (ctx.duel.npcRecord) return ctx.duel.npcRecord;
  const n = ctx.npc;
  return n ? { name: n.name, wins: n.record.wins, losses: n.record.loses, draws: n.record.draws } : null;
}

/** The NPC duel's end as live shows it (livetour 46-result-wl, main's mock/result-npc.json; CWindowResultNpc,
 * src/Result/yo2ResultWindow.cpp): one 512 x 442 board at 250, 64 (npc_result_dai_01_c01, a CSpriteElm member: an
 * extra), its "W-L RECORD" title art at 274, 75 (npc_result_title_01_?, 464 x 56: the engine's, a picture here), this
 * character's name centred at 282, 158 and its record against the NPC: WIN / LOSE / DRAW at 282, 182 + 48 i, the counts
 * right-aligned a line under each (432 wide), ShadowTexts with their 1, 1 black shadow halves. No score, MP or level
 * rows (live shows none). The window's controls stand at their world places (its rect is the screen's, as the mock's). */
export function npcResultWindow(ctx: DuelResultContext, record = npcResultRecord(ctx)): WindowSpec {
  if (!record) throw new Error('npcResultWindow needs an NPC record');
  const x = 250, y = 64, w = 512, h = 442;
  const b = new WindowBuilder(ctx.ids, 'duel-result:npc', 'CWindowResultNpc', { x: 0, y: 0, w: x + w, h: y + h }, { z: 51150 });
  b.win.extras = [{ id: ctx.ids.of('duel-result:npc/board'), cls: 'CSpriteElm', shown: true, tex: 'data/result/npc_result_dai_01_c01.png', wx: x, wy: y, x, y, src: [0, 0, w, h], sx: 1, sy: 1, z: 0, wz: 51000, a: 1 } as unknown as HtmlWindow['extras'][number]];
  const text = (name: string, t: string, ty: number, align: number) => {
    const c = b.add('CWindowTaskShadowText', name, { x: 282, y: ty, w: 432, h: 328 }, { text: t, align, fontSize: 24, lineGap: 0, firstLine: 0, pageLines: 13, color: WHITE });
    b.add('CWindowTaskText', `${name}/shadow`, { x: 283, y: ty + 1, w: 432, h: 328 }, { parent: c.id, text: t, align, fontSize: 24, color: BLACK });
  };
  const name = ctx.duel.players[0]?.name ?? '';
  text('name', name, 158, 1);
  const rows: [string, string, number][] = [['win', 'WIN', record.wins], ['lose', 'LOSE', record.losses], ['draw', 'DRAW', record.draws]];
  rows.forEach(([key, label, value], i) => { text(`l:${key}`, label, 182 + 48 * i, 0); text(`n:${key}`, String(value), 206 + 48 * i, 2); });
  const spec = b.spec();
  spec.win.controls[0]!.label = `${name}: W-L RECORD against ${record.name}: ${record.wins} wins, ${record.losses} losses, ${record.draws} draws`;
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
  // Between players (an NPC duel is its W-L RECORD board above), as live's capture (mock/result-pvp.json): one ShadowText at 16, 99 (216 wide, 24 px lines) holding the name and
  // the captions a blank line apart, its shadow half 1, 1 black, and the numbers (CTextElms, 24 px) right-aligned on
  // the lines between, at the window's y + 168 / 216 / 264. Live shows no MP or level rows.
  // an NPC duel: its W-L RECORD board alone, as live
  if (npcRecord) {
    out.push(npcResultWindow(ctx, npcRecord));
    titles.push({ key: 'title:npc', source: { archive: 'data/result/npc_result_title_01_?.png' }, x: 274, y: 75, w: 464, h: 56, z: 1, shown: true, label: 'W-L RECORD' });
  }
  else ([0, 1] as const).forEach(side => {
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
    // the rows between players, as live's (livetour2 69-pvp-board, main's mock/result-pvp.json m_WinNum / m_LoseNum /
    // m_ScoreNum): each side's WIN / LOSE (this duel's, a match's games) and SCORE (this player's from the server's
    // rewards; the other's 0)
    const other = side === 0 ? 1 : 0, won = match ? match.scores[side] ?? 0 : result === 'WIN' ? 1 : 0, lost = match ? match.scores[other] ?? 0 : result === 'LOSE' ? 1 : 0;
    const rows: [string, string, string][] = [['win', 'WIN', String(won)], ['lose', 'LOSE', String(lost)], ['score', 'SCORE', String(side === 0 ? duel.rewards?.score ?? 0 : 0)]];
    const name = p.name, lines = [name, ...rows.flatMap(([, label]) => ['', label])];
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
