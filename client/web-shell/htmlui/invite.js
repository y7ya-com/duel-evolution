// A direct duel invite from a player's card (CPlayerListMenu), both UIs (screens/lobby.js: the legacy Duel tab;
// svelte/modern/NpcCard.svelte: Modern UI's Duel). The server checks it may happen (POST /api/de/duel/challenge {name}:
// busy, ignore list, one pending, cooldown; a reason when not) and then shows the player as a duel room's owner to us
// alone, so the card, reopened, has the game's own "Send Duel Request"; pressing it runs the game's challenge (its
// "Requesting Duel", the player's Accept / Decline prompt, its messages, the duel). Plain ESM, no imports: the legacy
// screens load it unbundled (ship-client.sh ships htmlui/*.js).
const untag = s => String(s ?? '').replace(/[@＠]>\d+\/?/g, ' ').replace(/[@＠]\d/g, '');
const frame = () => new Promise(r => requestAnimationFrame(r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
// the first truthy pick(snapshot) within ms
async function waitFor(pick, ms) {
  for (const end = performance.now() + ms; performance.now() < end; await frame()) {
    const s = globalThis.yo2Html?.snapshot?.(), v = s && pick(s);
    if (v) return v;
  }
  return null;
}

// the card's name ('LV01 Duelist E') or a list row's ('Lv 1 Duelist E') without its level
export const cardName = s => untag(s).replace(/^\s*LV\s*\d+\s+/i, '').trim();
const card = s => s.windows.find(w => w.cls === 'CPlayerListMenu' && w.shown);
// the game's own duel request on a card, when the player has a duel open
export const nativeDuel = w => w?.controls.find(c => c.shown && !c.parent && /Duel\s*Request/i.test(c.label || ''));

// a click at a game point as a hand makes it: the player list opens (or rebuilds) a card only for a press held a few
// frames over its row (api.click's two-frame press only toggles an open one): canvas events, 150 ms apart
async function slowClick([x, y]) {
  const cv = document.getElementById('canvas'), r = cv.getBoundingClientRect(), k = r.width / 1024;
  const at = { clientX: r.left + x * k, clientY: r.top + y * k, bubbles: true, cancelable: true, button: 0 };
  cv.dispatchEvent(new MouseEvent('mousemove', { ...at, buttons: 0 })); await sleep(150);
  cv.dispatchEvent(new MouseEvent('mousedown', { ...at, buttons: 1 })); await sleep(150);
  cv.dispatchEvent(new MouseEvent('mouseup', { ...at, buttons: 0 }));
}

// -> { ok: true } or { ok: false, message }
let pendingInvite = null;
export function inviteDuel(api, name) {
  // Both UI layers can expose Duel during the same frame. Share the in-flight
  // action: two reopen/click sequences must never drive the same engine task.
  if (pendingInvite) return pendingInvite;
  pendingInvite = sendInvite(api, name).finally(() => { pendingInvite = null; });
  return pendingInvite;
}
async function sendInvite(api, name) {
  const fail = message => ({ ok: false, message });
  if (!name) return fail('Who to challenge?');
  let r, j = {};
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
  try {
    r = await fetch((globalThis.ENV?.YO2_DE_HTTP || '') + '/api/de/duel/challenge', { method: 'POST', credentials: 'same-origin', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    j = await r.json().catch(() => ({}));
  } catch { return fail('The duel request could not be sent. Try again.'); }
  finally { clearTimeout(timeout); }
  if (!r.ok) return fail(j.message || 'The duel request could not be sent.');
  return pressDuelRequest(api, name);
}

// The game's own "Send Duel Request" on the player's card: the card reopened from the player list until the game shows
// the button (the player has a duel room open to us: an invite's, or an open duel's from the chat's Duels tab), then
// pressed. Input only: the clicks a hand makes, nothing drawn. -> { ok: true } or { ok: false, message, absent }
// (absent: the player isn't in the player list yet). Shares the invite's in-flight action.
export function requestOnCard(api, name) {
  if (pendingInvite) return pendingInvite;
  pendingInvite = pressDuelRequest(api, name).finally(() => { pendingInvite = null; });
  return pendingInvite;
}
async function pressDuelRequest(api, name) {
  const fail = (message, more) => ({ ok: false, message, ...more });
  // reopen the card from the player list (an open card doesn't take the new room): the row in view (the list
  // scrolled to it first), one held click on it
  const reopen = async () => {
    const pl = globalThis.yo2Html.snapshot().windows.find(w => w.cls === 'CPlayerListDlg' && w.shown);
    const list = pl?.controls.find(c => /Listbox$/.test(c.cls) && c.shown);
    const names = (list?.items || []).map(cardName);
    const i = names.findIndex(n => n === name || n.endsWith(' ' + name));
    if (!list || i < 0) return false;
    const rows = Math.max(1, list.rows || 6), h = list.h / rows;
    let top = list.top || 0;
    const bar = pl.controls.find(c => c.parent === list.id && /Scroll$/.test(c.cls) && c.shown);
    if ((i < top || i >= top + rows) && bar) { top = Math.min(i, Math.max(0, names.length - rows)); api.setValue(bar.id, top); await sleep(200); }
    await slowClick([pl.x + list.x + Math.min(40, list.w / 2), pl.y + list.y + h * (i - top) + h / 2]);
    return true;
  };
  // the game takes the news on its own refresh (seen: 2 to 7 s), so the card is reopened until the button is there
  let b = null;
  for (let k = 0; k < 8 && !b; k++) {
    await sleep(900);
    if (!await reopen()) return fail('That player is not in your player list.', { absent: true });
    b = await waitFor(s => nativeDuel(card(s)), 700);
  }
  if (!b) return fail('The duel request could not be sent. Try again.');
  await api.click(b.id);
  return { ok: true };
}
