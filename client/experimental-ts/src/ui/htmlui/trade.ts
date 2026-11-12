// Card Swap through main's screens/trade.js (CWindowModelTrade and its two CWindowTaskCardAreas: read/trade.js, the
// window skin's pieces as parts and extras, CONTRACT.md), built from the rewrite's trade (features/social.ts). Layout
// from main's capture (mock/trade-swap.json; flip.mjs tl-trade: trade, trade-offer, trade-ready): the partner's area
// (248, 0) in the pink skin (window_base_01_c04), mine (248, 320) in the green (c02), 488 wide while the trunk is open,
// 776 to the screen's edge once this side is ready (the trunk closes); the partner's name centred in the pink band
// (24 px), the cards at half size (100 x 145) from (262, 52) / (262, 340), Ready to Trade. (444, 576, 130 wide) and
// Cancel (588, 576, 80 wide), the lamps (data/deck/trade_icon101: the partner thinking, 202: this side ready, 102: the
// partner ready). The request, the final confirmation and the result are main's stock dialogs (dialog.js). The trunk
// is the deck screen's CWindowModelKaban beside these windows (trade-trunk.ts). Pure: no DOM here.
import type { SocialAction, SocialTrade } from '../../features/social';
import { WindowBuilder } from './snapshot';
import type { Ids, WindowSpec } from './snapshot';
import type { Picture } from './pictures';
import { messageDialog } from './windows';
import dialogYesNo from './templates/dialog-yesno.json';
import dialogOk from './templates/dialog-ok.json';

/** The trade's own state between snapshots: the final Yes sent (the server's answer is the trade's end). */
export interface TradeLocal { confirmed: boolean; cancelAsk: boolean }
export const tradeLocal = (): TradeLocal => ({ confirmed: false, cancelAsk: false });
export interface TradeDeps {
  trade: SocialTrade; ui: TradeLocal; ids: Ids;
  dispatch(action: SocialAction): void;
  rerender(): void;
  /** A card's name (dialog texts). */
  name(passcode: number): string;
  /** The status line the social controller left ('<name> declined the trade.'). */
  status: string;
  /** The server's explanation of a refused exchange (a "Trade cancelled: ..." chat line). */
  reason?: string;
}

/** The trade scene is up: offers open, or a trade that opened has ended (its result over the scene). */
export const tradeScene = (t: SocialTrade): boolean => t.phase === 'open' || (t.phase === 'finished' || t.phase === 'closing') && (t.ownOffer.length > 0 || t.view.otherOffer.length > 0 || t.view.trunk.length > 0);
/** Whether the trunk picker is open beside the windows: this side still editing. */
export const trunkOpen = (t: SocialTrade): boolean => t.phase === 'open' && !t.view.ready;

type Piece = [string, [number, number], number, number, number, number];   // name, src u v, x, y (world), sx, sy
// the 14 frame pieces of a card area (CWindowTaskCardArea create, 0x00917240; the capture's extras L1 .. RSide)
function pieces(mine: boolean, w: number): Piece[] {
  const r = 248 + w - 8, c = (w - 16) / 8;
  return mine ? [
    ['L1', [0, 0], 248, 320, 1, 1], ['C1', [8, 0], 256, 320, c, 1], ['R1', [16, 0], r, 320, 1, 1],
    ['L2', [72, 8], 248, 568, 1, 1], ['C2', [56, 16], 256, 568, c, 1], ['R2', [80, 8], r, 568, 1, 1],
    ['L3', [24, 8], 248, 576, 1, 3], ['C3', [32, 8], 256, 576, c, 3], ['R3', [40, 8], r, 576, 1, 3],
    ['L4', [24, 16], 248, 600, 1, 1], ['C4', [32, 16], 256, 600, c, 1], ['R4', [40, 16], r, 600, 1, 1],
    ['LSide', [0, 8], 248, 328, 1, 30], ['RSide', [16, 8], r, 328, 1, 30],
  ] : [
    ['L1', [24, 0], 248, 0, 1, 1], ['C1', [32, 0], 256, 0, c, 1], ['R1', [40, 0], r, 0, 1, 1],
    ['L2', [24, 8], 248, 8, 1, 3], ['C2', [32, 8], 256, 8, c, 3], ['R2', [40, 8], r, 8, 1, 3],
    ['L3', [72, 0], 248, 32, 1, 1], ['C3', [56, 0], 256, 32, c, 1], ['R3', [80, 0], r, 32, 1, 1],
    ['L4', [0, 16], 248, 280, 1, 1], ['C4', [8, 16], 256, 280, c, 1], ['R4', [16, 16], r, 280, 1, 1],
    ['LSide', [0, 8], 248, 40, 1, 30], ['RSide', [16, 8], r, 40, 1, 30],
  ];
}
const sprite = (ids: Ids, key: string, tex: string, src: number[], wx: number, wy: number, wz: number, sx = 1, sy = 1, extra: Record<string, unknown> = {}) =>
  ({ id: ids.of(key), name: key.split('/').pop(), tex, src, x: 0, y: 0, z: 0, wx, wy, wz, a: 1, sx, sy, rgba: [1, 1, 1, 1], col: [1, 1, 1, 1], shown: true, ...extra });

/** The trade's windows (scene and dialogs) for the current phase, back to front. */
export function tradeWindows(d: TradeDeps): WindowSpec[] {
  const { trade: t, ui } = d, out: WindowSpec[] = [];
  if (t.phase === 'idle') { Object.assign(ui, tradeLocal()); return out; }
  if (!t.view.allReady) ui.confirmed = false;
  const partner = t.partner?.name || (t.partner ? `Player ${t.partner.pid}` : 'another player');
  if (tradeScene(t)) out.push(...scene(d, partner));
  const dialog = (key: string, text: string, buttons: Record<string, [string, () => void]>, yesNo = true) => out.push(messageDialog({ ids: d.ids }, key, yesNo ? dialogYesNo : dialogOk, text, buttons));
  if (t.phase === 'offered') dialog('trade-offer', `${partner}\nYou have a Trade Request!`, {
    Yes: ['trade-accept', () => d.dispatch({ type: 'replyTrade', accept: true })], No: ['trade-decline', () => d.dispatch({ type: 'replyTrade', accept: false })] });
  else if (t.phase === 'requesting' || t.phase === 'waiting') {
    // one button, Cancel: dialog-ok's OK relabelled
    const spec = messageDialog({ ids: d.ids }, 'trade-wait', dialogOk, `Waiting for ${partner} to answer…`, { OK: ['trade-cancel-request', () => d.dispatch({ type: 'cancelTrade' })] });
    for (const c of spec.win.controls) if (c.cls === 'CWindowTaskTextSwitch' && c.label === 'OK') c.label = 'Cancel';
    out.push(spec);
  } else if (t.phase === 'closing') {
    const spec = messageDialog({ ids: d.ids }, 'trade-closing', dialogOk, 'Closing the trade…', {});
    for (const c of spec.win.controls) if (c.cls === 'CWindowTaskTextSwitch') { c.state = 'disabled'; c.enabled = false; }
    out.push(spec);
  } else if (t.phase === 'finished') {
    const exchanged = t.ownOffer.length > 0 || t.view.otherOffer.length > 0;
    const text = t.view.success ? 'Trade complete. Your collection has been updated.' : !exchanged && /declined/.test(d.status) ? d.status : t.reason ?? d.reason ?? 'The trade ended without an exchange.';
    dialog('trade-result', text, { OK: ['trade-close', () => d.dispatch({ type: 'cancelTrade' })] }, false);
  } else if (t.phase === 'open' && t.view.allReady && !ui.confirmed) dialog('trade-confirm',
    `Exchange your ${t.ownOffer.length} card(s) for ${partner}'s ${t.view.otherOffer.length}?\nThis cannot be undone.`, {
      Yes: ['trade-complete', () => { ui.confirmed = true; d.dispatch({ type: 'confirmTrade', accept: true }); d.rerender(); }],
      No: ['trade-back', () => d.dispatch({ type: 'confirmTrade', accept: false })] });
  else if (t.phase === 'open' && ui.cancelAsk) dialog('trade-cancel-ask', 'Close this trade?\nOffers on both sides are abandoned.', {
    Yes: ['trade-cancel-yes', () => { ui.cancelAsk = false; d.dispatch({ type: 'cancelTrade' }); d.rerender(); }],
    No: ['trade-cancel-no', () => { ui.cancelAsk = false; d.rerender(); }] });
  return out;
}

function scene(d: TradeDeps, partner: string): WindowSpec[] {
  const { trade: t, ui, ids } = d, ready = t.view.ready, w = ready || t.phase !== 'open' ? 776 : 488;
  const editable = t.phase === 'open' && !ready && !t.view.otherReady && !t.pendingMove;
  const pics: Picture[] = [];
  // the model: every frame piece, the lamps, the partner's name, the cards (CWindowTaskTrade's parts and children)
  const model = new WindowBuilder(ids, 'trade', 'CWindowModelTrade', { x: 248, y: 0, w: 488, h: 608 }, { z: 51103, wz: 51105, modal: false, drawn: null });
  const side = (mine: boolean) => pieces(mine, w).map(([name, [u, v], x, y, sx, sy]) =>
    sprite(ids, `trade/${mine ? 'mine' : 'partner'}:${name}`, `data/common/window/window_base_01_${mine ? 'c02' : 'c04'}.png`, [u, v, 8, 8], x, y, 51103, sx, sy, { name, cls: 'CSpriteElm' }));
  const frames = { partner: side(false), mine: side(true) }, frame = [...frames.partner, ...frames.mine];
  const lampX = w === 776 ? 579 : 437;
  const lamps = [
    sprite(ids, 'trade/lamp:thinking', 'data/deck/trade_icon101_0_?.png', [0, 0, 136, 150], lampX, 191, 51123, 1, 1, { a: 0.8, shown: !t.view.otherReady }),
    sprite(ids, 'trade/lamp:other', 'data/deck/trade_icon102_0_?.png', [0, 0, 136, 150], lampX, 191, 51123, 1, 1, { a: 0.8, shown: t.view.otherReady }),
    sprite(ids, 'trade/lamp:own', 'data/deck/trade_icon202_0_?.png', [0, 0, 136, 150], 543, 267, 51123, 1, 1, { a: 0.8, shown: ready }),
  ];
  const holder = model.add('CWindowTaskTrade', 'trade', { x: 0, y: 0, w: 0, h: 0 }, { wx: 0, wy: 0, wz: 51103, otherCount: t.view.otherOffer.length, mineCount: t.ownOffer.length, ready,
    parts: { sprites: [...frame, ...lamps], labels: [], swfs: [] } });
  model.add('CWindowTaskText', 'TradeOtherName', { x: 0, y: 8, w, h: 24 }, { parent: holder.id, name: 'TradeOtherName', text: partner, align: 1, fontSize: 24, color: [1, 1, 1, 1], wx: 248, wy: 8, wz: 51104,
    parts: { sprites: [], labels: [{ id: ids.of('trade/name:l'), name: 'TradeOtherName', text: partner, x: 0, y: 0, z: 0, wx: 248, wy: 8, wz: 51104, a: 1, shown: true }], swfs: [] } });
  // the offered cards, one row each, half size; a card of mine is taken back with a click (the original drags it out)
  const row = (cards: readonly number[], y: number, mine: boolean) => {
    const pitch = cards.length > 1 ? Math.min(104, (w - 16 - 12 - 100) / (cards.length - 1)) : 104;
    cards.forEach((passcode, i) => {
      const x = Math.round(262 + pitch * i), face = sprite(ids, `trade/${mine ? 'mine' : 'other'}:${i}:${passcode}`, `data/CARD/${passcode}.png`, [0, 0, 200, 290], x, y, 51105 + i * 0.01, 0.5, 0.5);
      const c = model.add('CWindowTaskTradeCard', `${mine ? 'mine' : 'other'}:${i}`, { x: x - 248, y, w: 100, h: 145 }, { parent: holder.id, card: passcode, dragging: false, wx: x, wy: y, wz: 51105, parts: { sprites: [face], labels: [], swfs: [] } });
      if (mine && editable) model.on(c, { key: `trade-offer:${i}`, label: `Take back ${d.name(passcode)}`, click: () => d.dispatch({ type: 'removeTradeCard', index: i }) });
      pics.push({ key: `trade-card:${mine ? 'm' : 'o'}:${i}`, source: { card: passcode }, x, y, w: 100, h: 145, z: 51105 + i * 0.01, shown: true, label: d.name(passcode) });
    });
  };
  row(t.view.otherOffer, 52, false); row(t.ownOffer, 340, true);
  for (const l of lamps) pics.push({ key: `trade-${l.name}`, source: { archive: l.tex }, x: l.wx, y: l.wy, w: 136, h: 150, z: l.wz, alpha: 0.8, shown: l.shown });
  // the areas: their pieces (the model's too: it draws them), the back plane, mine its two switches
  const area = (mine: boolean) => {
    const y0 = mine ? 320 : 0, b = new WindowBuilder(ids, `trade-area:${mine ? 'mine' : 'other'}`, 'CWindowTaskCardArea', { x: 248, y: y0, w: 488, h: 288 },
      { z: mine ? 51203 : 51153, wz: mine ? 51106 : 51103, mode: mine ? 1 : 2, modal: false, drawn: { x: 256, y: y0 + (mine ? 8 : 40), w: w - 16, h: mine ? 272 : 240 } });
    (b.win as Record<string, unknown>).extras = mine ? frames.mine : frames.partner;
    b.add('CWindowTaskBackPlane', 'BG', { x: 8, y: mine ? 8 : 40, w: w - 16, h: 240 }, { name: 'BG', wx: 256, wy: y0 + (mine ? 8 : 40), wz: 51103,
      parts: { sprites: [sprite(ids, `trade/${mine ? 'mine' : 'partner'}:plane`, 'data/common/window/window_base_01_c01.png', [8, 8, 8, 8], 256, y0 + (mine ? 8 : 40), 51103, (w - 16) / 8, 30)], labels: [], swfs: [] } });
    if (mine && t.phase === 'open') {
      const sw = (name: string, x: number, wd: number, label: string, key: string, run: () => void, enabled: boolean) =>
        b.add('CWindowTaskTextSwitch', name, { x: x - 248, y: 256, w: wd, h: 24 }, { name, label, state: enabled ? 'normal' : 'disabled', checked: false, align: 1, color: [0, 0, 0, 1], wx: x, wy: 576, wz: 51104 },
          { key, click: () => { if (enabled) run(); } });
      if (!ready) sw('TradereadySwitch', 444, 130, 'Ready to Trade.', 'trade-ready', () => d.dispatch({ type: 'readyTrade' }), !t.pendingMove);
      // main shows Cancel once ready (the trunk's EXIT leaves before); here always: the deck editor's menu isn't ported
      sw('TradecancelSwitch', 588, 80, 'Cancel', 'trade-cancel', () => { ui.cancelAsk = true; d.rerender(); }, true);
    }
    return b.spec();
  };
  const pictures = new WindowBuilder(ids, 'trade-pictures', 'CEnginePictures', { x: 0, y: 0, w: 1024, h: 768 }, { z: 51102, pics });
  return [pictures.spec(), model.spec(), area(false), area(true)];
}
