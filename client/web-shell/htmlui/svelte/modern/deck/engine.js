// The modern deck editor's actions, each made of the engine's own input on the canvas (no new engine or server
// behaviour): a card goes in or out by the engine's drag and drop, sections by its tabs, files by its side buttons and
// file list. The rules (DeckEntryMain.cpp dragAndDrop) and their game points:
//   - a trunk row's picture pressed (KabanWindowList.cpp CWindowTaskKabanListBtn::onMessage) starts a drag; let go over
//     the deck (x in (0x100, 0x2d8), deckDropTarget): Main y in (0x58, mainBottom), Side (sideTop, sideBottom); with the
//     Fusion tab in front, anywhere in (0x58, mainBottom + 0x78) is the Fusion Deck (DeckEntry.h deckDropZones);
//   - a deck card pressed starts a drag; let go over the trunk (x in (0x2e8, 0x3bc), y in (0x58, sideBottom)) it goes
//     back, over the other of Main / Side it moves there.
// The engine's trunk list is filtered to the card's name first (ovr/decksearch.c's Module.yo2KabanFilter) so its row
// is on screen. One action at a time; each resolves once the deck's counts show it (false: the engine refused).
const snap = () => globalThis.yo2Html?.snapshot?.();
const raf = () => new Promise(r => requestAnimationFrame(r));
// n of the game's frames (Presents), not the browser's: the engine drops a press in the frame of its move
async function frames(n) {
  const f0 = snap()?.frame ?? 0;
  for (let k = 0; k < 600 && (snap()?.frame ?? f0 + n) < f0 + n; k++) await raf();
}
export async function waitFor(pick, ms = 3000) {
  for (const end = performance.now() + ms; performance.now() < end; await raf()) {
    const s = snap(), v = s && pick(s);
    if (v) return v;
  }
  return null;
}
function fire(type, [x, y]) {
  const cv = document.getElementById('canvas'), r = cv.getBoundingClientRect(), k = r.width / 1024;
  cv.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: r.left + x * k, clientY: r.top + y * k,
    button: 0, buttons: type === 'mousedown' || (type === 'mousemove' && held) ? 1 : 0 }));
}
let held = false;
async function click(p) {
  fire('mousemove', p); await frames(2);
  fire('mousedown', p); await frames(2);
  fire('mouseup', p); await frames(2);
}
async function drag(from, to) {
  fire('mousemove', from); await frames(2);
  held = true;
  fire('mousedown', from); await frames(2);
  for (let i = 1; i <= 4; i++) { fire('mousemove', [from[0] + (to[0] - from[0]) * i / 4, from[1] + (to[1] - from[1]) * i / 4]); await frames(1); }
  await frames(1);
  held = false;
  fire('mouseup', to); await frames(3);
}

// the snapshot's pieces
const win = (s, cls) => s.windows.find(w => w.cls === cls && w.shown);
const deckOf = s => win(s, 'CWindowModelDeck')?.controls.find(c => c.cls === 'CWindowTaskDeck');
const listOf = s => win(s, 'CWindowModelKaban')?.controls.find(c => c.cls === 'CWindowTaskKabanList');
const at = c => [c.wx ?? c.x, c.wy ?? c.y];
const total = d => d.counts.main + d.counts.side + d.counts.extra;
const zones = d => {   // DeckEntry.h deckDropZones (the missing row: the grid's missing list)
  const exp = d.expanded, miss = d.counts.missing > 0;
  return { mainBottom: (exp ? 0x248 : 0x1e0) - (miss ? 0x78 : 0), sideTop: exp ? 0x268 : 0x200, sideBottom: exp ? 0x2c0 : 0x258 };
};
const target = (d, to) => {
  const z = zones(d);
  return to === 'side' ? [490, (z.sideTop + z.sideBottom) / 2] : [490, (0x58 + z.mainBottom) / 2];
};
const TRUNK = [850, 300];
// a dialog of the scene's is up (file list, question, name prompt): no drag and drop then (CDeckScene busy)
export const busy = s => s.windows.some(w => w.shown && /FileList|DialogYesNo|InputValue|DialogOk|Input1/.test(w.cls));

// the Main / Fusion tab in front (CWindowTaskDeckTab MainTab / FusionTab at their game points)
async function showView(extra) {
  const s = snap(), d = deckOf(s);
  if (!d || (d.view === 'extra') === extra) return !!d;
  const tab = win(s, 'CWindowModelDeck').controls.find(c => c.name === (extra ? 'FusionTab' : 'MainTab'));
  if (!tab) return false;
  const [x, y] = at(tab);
  await click([x + 90, y + 14]);
  return !!(await waitFor(s2 => (deckOf(s2)?.view === 'extra') === extra, 1500));
}

let chain = Promise.resolve();
const queue = fn => (chain = chain.then(fn, fn).catch(e => (console.warn('modern deck', e), false)));
export const idle = () => chain;

// put card (its yo2Deck entry) into section `to` ('main' | 'side' | 'extra')
export const add = (card, to) => queue(async () => {
  let s = snap();
  if (!s || busy(s) || !(await showView(to === 'extra'))) return false;
  const list = listOf(snap());
  if (!list || !Module.yo2KabanFilter) return false;
  Module.yo2KabanFilter(list.id, { cat: 6, text: card.name });
  const row = await waitFor(s2 => win(s2, 'CWindowModelKaban')?.controls.find(c => c.cls === 'CWindowTaskKabanListBtn' && c.shown && c.card === card.id), 2000);
  if (!row) return false;
  s = snap();
  const d = deckOf(s), n = total(d), [x, y] = at(row);
  await drag([x + 32, y + 28], target(d, to));
  return !!(await waitFor(s2 => total(deckOf(s2) || d) !== n, 1500));
});

// take card id out of section `from`, back to the trunk (to null) or into the other of Main / Side
export const move = (id, from, to = null) => queue(async () => {
  if (!snap() || busy(snap()) || !(await showView(from === 'extra'))) return false;
  const s = snap(), d = deckOf(s), z = zones(d);
  const inSide = c => (c.wy ?? c.y) + 20 > z.sideTop;
  const c = win(s, 'CWindowModelDeck').controls.filter(c => c.cls === 'CWindowTaskDeckCard' && c.shown && c.card === id)
    .find(c => from === 'extra' || inSide(c) === (from === 'side'));
  if (!c) return false;
  const before = JSON.stringify(d.counts), [x, y] = at(c);
  await drag([x + 25, y + 36], to ? target(d, to) : TRUNK);
  return !!(await waitFor(s2 => JSON.stringify(deckOf(s2)?.counts) !== before, 1500));
});

// ---- the side buttons (the scene's LoadBtn .. ExitBtn: CSwfEngine elements at (0, 40 + 27 i), read/deck.js scene)
export const side = name => queue(async () => {
  const b = win(snap(), 'CWindowModelDeck')?.scene?.menu.find(m => m.name === name && m.shown);
  if (!b) return false;
  await click([b.wx + 80, b.wy + 13]);
  return true;
});

// ---- saving. The save list (side button SaveBtn, CWindowModelFileList): "Save New" opens the name prompt
// (CWindowModelInputValue "inputdialog"); its OK saves, or asks first when the file exists (CWindowModelDialogYesNo
// "confirmoverwritedialog", Yes saves). decksync.c sees the save (Module.onYo2DeckSaved: the server's copy).
const btn = (w, label) => w?.controls.find(c => c.shown && (c.label || c.text || '').trim().toLowerCase() === label);
const centre = c => [(c.wx ?? c.x) + c.w / 2, (c.wy ?? c.y) + c.h / 2];
// a dialog's switch, pressed until `until(snapshot)` holds: the engine drops a press on a window that has only just
// opened (it takes input once it is active), so it is pressed again until the next step shows
async function press(c, until, tries = 4) {
  for (let i = 0; c && i < tries; i++) {
    if (globalThis.yo2DeckDebug) console.log('modern deck press', c.name || c.label, centre(c), snap()?.frame);
    await click(centre(c));
    const v = await waitFor(until, 900);
    if (v) return v;
  }
  return null;
}
// save the deck as `name` (overwriting a deck of that name; api: the bridge's, for the prompt's keys). Resolves
// true once the engine saved it
export const saveAs = (api, name) => queue(async () => {
  name = String(name || '').trim();
  if (!name || busy(snap())) return false;
  const done = s => win(s, 'CWindowModelDialogOk');
  const b = win(snap(), 'CWindowModelDeck')?.scene?.menu.find(m => m.name === 'SaveBtn' && m.shown);
  const fl = b && await press({ wx: b.wx, wy: b.wy, w: 160, h: 26 }, s => win(s, 'CWindowModelFileList'));
  const inp = fl && await press(btn(fl, 'save new'), s => win(s, 'CWindowModelInputValue'));
  const field = inp?.controls.find(c => /Input$/.test(c.cls));
  if (!field) return false;
  // typed into it, as the player's keys (its setText shows the text but the prompt's value stays empty)
  for (const ch of name) api.char(ch.charCodeAt(0));
  await frames(3 + Math.ceil(name.length / 16));
  // OK: saved, or (a deck of that name already) the overwrite question, Yes
  const r = await press(btn(inp, 'yes') || btn(inp, 'ok'), s => done(s) || win(s, 'CWindowModelDialogYesNo'));
  const ok = r && (r.cls === 'CWindowModelDialogOk' ? r : await press(btn(r, 'yes'), done));
  if (!ok) return false;
  // its OK closes it and the save list (DeckEntryMain.cpp pollSaved); the editor says so itself
  await press(btn(ok, 'ok'), s => !done(s) && !win(s, 'CWindowModelFileList'));
  return true;
});

// the deck's file name (CDeckManager at DAT_012b28c4: fileName_ +0x5ac, "deck.ydc"; read/deck.js deckName)
export const deckName = s => (s?.deckName || '').replace(/\.ydc$/i, '');

// for the flip routes and the console: the same actions
globalThis.yo2DeckActions = { add, move, side, saveAs, idle };
