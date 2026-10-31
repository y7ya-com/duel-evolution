// A direct duel invite from a player's card (CPlayerListMenu), both UIs: the server checks it may happen (POST
// /api/de/duel/challenge: busy, ignore list, one pending, cooldown; a reason when not) and then shows the player as a
// duel room's owner to us alone, so the card, reopened, has the game's own "Send Duel Request"; pressing it runs the
// game's challenge (its "Requesting Duel", the player's Accept / Decline prompt, its messages, the duel). Plain ESM:
// the legacy screens load it unbundled.
import { waitFor } from './modern/macro.js';
import { listItems, rowPoint } from './modern/logic.js';

// a click at a game point as a hand makes it (the player list opens a card only for a press held a few frames over its
// row: api.click's two-frame press only toggles an open one): canvas events, 150 ms apart
async function slowClick([x, y]) {
  const cv = document.getElementById('canvas'), r = cv.getBoundingClientRect(), k = r.width / 1024;
  const at = { clientX: r.left + x * k, clientY: r.top + y * k, bubbles: true, cancelable: true, button: 0 };
  const pause = () => new Promise(f => setTimeout(f, 150));
  cv.dispatchEvent(new MouseEvent('mousemove', { ...at, buttons: 0 })); await pause();
  cv.dispatchEvent(new MouseEvent('mousedown', { ...at, buttons: 1 })); await pause();
  cv.dispatchEvent(new MouseEvent('mouseup', { ...at, buttons: 0 }));
}

// the card's name ('LV01 Duelist E') without its level
export const cardName = s => String(s || '').replace(/^\s*LV\s*\d+\s+/i, '').trim();
const card = s => s.windows.find(w => w.cls === 'CPlayerListMenu' && w.shown);
export const nativeDuel = w => w?.controls.find(c => c.shown && !c.parent && /Duel\s*Request/i.test(c.label || ''));

// -> { ok } or { ok: false, message }
export async function inviteDuel(api, name) {
  const fail = message => ({ ok: false, message });
  if (!name) return fail('Who to challenge?');
  let r, j = {};
  try {
    r = await fetch((globalThis.ENV?.YO2_DE_HTTP || '') + '/api/de/duel/challenge', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    j = await r.json().catch(() => ({}));
  } catch { return fail('The duel request could not be sent. Try again.'); }
  if (!r.ok) return fail(j.message || 'The duel request could not be sent.');
  // reopen the card from the player list (an open card doesn't take the new room)
  const snap = () => globalThis.yo2Html.snapshot();
  const reopen = async () => {
    const pl = snap().windows.find(w => w.cls === 'CPlayerListDlg' && w.shown);
    const list = pl?.controls.find(c => /Listbox$/.test(c.cls) && c.shown);
    const names = listItems(list).map(cardName);
    const i = names.findIndex(n => n === name || n.endsWith(' ' + name));
    if (!list || i < 0) return false;
    // the row in view (the list scrolled to it first), then one held click on it: it opens the card, or rebuilds the open one
    const rows = Math.max(1, list.rows || 6);
    let top = list.top || 0;
    const sb = pl.controls.find(c => c.parent === list.id && /Scroll$/.test(c.cls) && c.shown);
    if ((i < top || i >= top + rows) && sb) { top = Math.min(i, Math.max(0, names.length - rows)); api.setValue(sb.id, top); await new Promise(f => setTimeout(f, 200)); }
    await slowClick(rowPoint(pl, list, i, top));
    return true;
  };
  // the game takes the news on its own refresh (seen: 2 to 7 s), so the card is reopened until the button is there
  let b = null;
  for (let k = 0; k < 8 && !b; k++) {
    await new Promise(r => setTimeout(r, 900));
    if (!await reopen()) return fail('That player is not in your player list.');
    b = await waitFor(s => nativeDuel(card(s)), 700);
  }
  if (!b) return fail('The duel request could not be sent. Try again.');
  await api.click(b.id);
  return { ok: true };
}
