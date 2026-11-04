// The trade panel's view model (pure: cosmetics/trade-cosmetics.js draws it; trade-model_test.mjs checks it). Inputs are
// the server's view (server/src/game/trade.ts cosmeticsView, through cosmetics/trade-api.js) and the panel's own state
// (the draft being saved, what it saw last, the last refusal).
//
// Geometry (game px, the 1024 x 768 stage; the 2008 trade window with its trunk shown): the partner's card area is
// (248, 0) 488 x 288, its cards along the top of the white well (40..282; cards y 52..196) and the partner's lamp at
// the well's bottom centre (x 450..535); mine is (248, 320), its well 328..568 (cards 340..484), the Ready button in
// the green foot under it. The cosmetic lines take the free row under each side's cards: the partner's in two
// groups of three round its lamp, mine in one row of six with the Cosmetics button at its right end: one grid, 16 px
// from both edges, mirrored on the areas' centre. The band between
// the two areas (y 288..320) says what is in the trade and what just changed. The picker (my spare copies) opens over
// the trunk column (736, 0) 288 x 608, the place the cards are picked from.
export const TILE = 44, STEP = 52, MAX_LINES = 6;
export const PARTNER_ROW = 222, MINE_ROW = 180;          // the tiles' top, area-local
export const PARTNER_X = [16, 68, 120, 324, 376, 428];   // area-local: three left of the lamp, three right, mirrored on 244
export const MINE_X = [16, 68, 120, 172, 224, 276];
export const BUTTON = { x: 362, y: 187, w: 115, h: 35 }; // area-local: the Cosmetics button (shop_btn2: its 110 x 30 face ends at 472)
export const AXIS = 244;                                  // the areas' centre, area-local (their wells: 8..480)
export const BAND = { y: 290, h: 26 };                    // the trade window's band between the areas
/** The areas' width: 488 beside the trunk; with the trunk put away they run on to x 1024 (the right group, the button
 *  and the band's end move with their right edge; the game puts it away at the trade question). */
export const AREA_W = 488, AREA_W_WIDE = 776;
export const PICKER = { x: 736, y: 0, w: 288, h: 608, row: 44, top: 112, rows: 9 };
export const FLASH_MS = 8000;

/** A side's lines in one comparable form (order-free). */
export const linesKey = lines => JSON.stringify([...(lines || [])].map(l => [l.id, l.count]).sort());
/** The item ids whose count differs between two sides' lines (added, changed or removed). */
export function changedIds(before, after) {
  const a = new Map((before || []).map(l => [l.id, l.count])), b = new Map((after || []).map(l => [l.id, l.count]));
  return new Set([...new Set([...a.keys(), ...b.keys()])].filter(id => a.get(id) !== b.get(id)));
}

/** The tiles of a side: its lines (item, count) placed on its row; `flash`: ids that just changed. */
export function stripTiles(lines, side, flash = new Set(), width = AREA_W) {
  const xs = side === 'partner' ? PARTNER_X.map((x, i) => (i < 3 ? x : x + width - AREA_W)) : MINE_X, y = side === 'partner' ? PARTNER_ROW : MINE_ROW;
  return (lines || []).slice(0, MAX_LINES).map((l, i) => ({ id: l.id, count: l.count, item: l.item, name: l.item?.name || l.id,
    rarity: l.item?.rarity || 'common', x: xs[i], y, w: TILE, h: TILE, flash: flash.has(l.id),
    title: `${l.item?.name || l.id}${l.count > 1 ? ` ×${l.count}` : ''}` }));
}

/** The draft after one press of + (delta 1) or − (-1) on an item: never past its spares or MAX_LINES items, never 0. */
export function draftStep(draft, id, delta, spares) {
  const spare = (spares || []).find(s => s.id === id)?.copies || 0, out = (draft || []).map(l => ({ ...l }));
  const at = out.findIndex(l => l.id === id), cur = at < 0 ? 0 : out[at].count;
  const next = Math.max(0, Math.min(spare, cur + delta));
  if (next === cur) return out;
  if (at < 0) { if (out.length >= MAX_LINES) return out; out.push({ id, count: next }); }
  else if (next === 0) out.splice(at, 1);
  else out[at].count = next;
  return out;
}

/** The picker's rows: every spare copy item, with how many are in my offer and whether + / − can be pressed. */
export function pickerRows(view, draft) {
  const offered = new Map((draft || []).map(l => [l.id, l.count])), full = (draft || []).length >= MAX_LINES, can = !view?.locked;
  return (view?.spares || []).map(s => {
    const n = offered.get(s.id) || 0;
    return { id: s.id, item: s, name: s.name, rarity: s.rarity || 'common', spare: s.copies, offered: n,
      canAdd: can && n < s.copies && (n > 0 || !full), canRemove: can && n > 0 };
  });
}

/** Lines of my draft, shaped like the server's (with the item from my spares) for the strip while it is saved. */
export function draftLines(draft, view) {
  const byId = new Map([...(view?.spares || []).map(s => [s.id, s]), ...(view?.mine || []).map(l => [l.id, l.item])]);
  return (draft || []).map(l => ({ id: l.id, count: l.count, item: byId.get(l.id) || null }));
}

const count = lines => (lines || []).reduce((n, l) => n + l.count, 0);
/** The band between the areas: the last refusal, a change that reset the confirmations, a lock, or what the trade
 *  holds. -> { text, tone: 'error' | 'reset' | 'changed' | 'lock' | 'info' | 'done' } */
export function bandOf(view, { error, resetUntil = 0, changedUntil = 0, now = Date.now() } = {}) {
  if (!view) return { text: 'Loading cosmetics…', tone: 'info' };
  if (!view.trading) return view.last ? { text: view.last.text, tone: view.last.result === 'done' ? 'done' : 'error' } : { text: '', tone: 'info' };
  if (error) return { text: error, tone: 'error' };
  if (!view.panel?.partner) return { text: "Your trade partner's game can't show cosmetics yet.", tone: 'lock' };
  if (view.changed && now < resetUntil && view.changed.reset)
    return { text: `${view.changed.by === 'me' ? 'You' : view.partner?.name || 'Your partner'} changed the cosmetics: both confirmations were reset.`, tone: 'reset' };
  if (view.changed && now < changedUntil && view.changed.by === 'partner')
    return { text: `${view.partner?.name || 'Your partner'} changed their cosmetics. Check them before you confirm.`, tone: 'changed' };
  if (view.locked === 'ready-me') return { text: 'You pressed Ready: cosmetics are locked until the trade question.', tone: 'lock' };
  if (view.locked === 'ready-partner') return { text: 'Your partner pressed Ready: cosmetics are locked until the trade question.', tone: 'lock' };
  const a = count(view.theirs), b = count(view.mine);
  if (!a && !b) return { text: view.spares?.length ? 'Cosmetics can be traded too: press Cosmetics to add your spares.' : 'No cosmetics in this trade.', tone: 'info' };
  return { text: `Cosmetics in this trade: ${view.partner?.name || 'your partner'} gives ${a || 'none'}, you give ${b || 'none'}.`, tone: 'info' };
}

/** The Cosmetics button: its label and whether it opens (it never opens while the lines can't change). */
export function buttonOf(view, draft) {
  const has = (draft || []).length > 0;
  if (!view?.trading) return { label: 'Cosmetics', disabled: true, title: '' };
  if (view.locked) return { label: has ? 'Change' : 'Cosmetics', disabled: true, title: bandOf({ ...view, changed: null }).text };
  if (!view.spares?.length && !has) return { label: 'Cosmetics', disabled: true, title: 'You have no spare copies to trade. Duplicates from boxes are spares.' };
  return { label: has ? 'Change' : 'Cosmetics', disabled: false, title: 'Add your spare cosmetics to the trade' };
}
