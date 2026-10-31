// One-step actions made of the engine's own clicks (no new engine or server behaviour): the dock's quick actions open
// the Main Menu and press its button, the menu kept out of sight meanwhile (html.mu-macro: MainMenu.svelte hides).
import { rowPoint } from './logic.js';
const snap = () => globalThis.yo2Html?.snapshot?.();
const frame = () => new Promise(r => requestAnimationFrame(r));

// the first value of pick(snapshot) that is truthy within ms
export async function waitFor(pick, ms = 3000) {
  for (const end = performance.now() + ms; performance.now() < end; await frame()) {
    const s = snap(), v = s && pick(s);
    if (v) return v;
  }
  return null;
}

// the Main Menu's own switch on the menu bar (My Room: MENUBAR_MENU; lobbies: MENUBAR_MENU_MAINボタン)
export const menuSwitch = s => s.windows.find(w => w.cls === 'CWindowModelMenu' && w.shown)?.controls
  .find(c => c.cls === 'CWindowTaskPictureSwitch' && c.shown && /MENUBAR_MENU(_MAIN|$|ボタン$)/.test(c.name) && !/DUEL|MOVE/.test(c.name));
const menuButton = (s, label) => s.windows.find(w => w.cls === 'CMainMenu' && w.shown)?.controls
  .find(c => c.cls === 'CWindowTaskButtonMain' && c.shown && c.label === label);

let busy = false;
// press the Main Menu's button `label`, opening the menu first if it is closed. false: no such button here
export async function menu(api, label) {
  if (busy) return false;
  busy = true;
  document.documentElement.classList.add('mu-macro');
  try {
    let b = snap() && menuButton(snap(), label);
    if (!b) {
      const sw = snap() && menuSwitch(snap());
      if (!sw) return false;
      await api.click(sw.id);
      b = await waitFor(s => menuButton(s, label));
      if (!b) return false;
    }
    await api.click(b.id);
    return true;
  } finally {
    // the menu closes as the window opens: hidden until the game says it is closed (its frames, not the browser's: at
    // 120 Hz two browser frames are less than one of the game's, and the menu flashed at the bottom left)
    await waitFor(s => !s.windows.some(w => w.cls === 'CMainMenu' && w.shown), 1500);
    document.documentElement.classList.remove('mu-macro');
    busy = false;
  }
}

// the quick actions: [label on the dock, the Main Menu's button, icon, key]
export const QUICK = [
  ['Deck', 'Edit Deck', 'deck', 'D'],
  ['Profile', 'My Profile', 'profile', 'P'],
  ['Friends', 'Friend List', 'friends', 'F'],
  ['Mail', 'D-Mail', 'mail', 'M'],
  ['Duel Log', 'Duel Log', 'log', 'L'],
  ['Options', 'DUEL OPTIONS', 'duel', 'O'],
  ['Audio', 'Audio', 'audio', 'A'],
];
// the quick action for a key press, or null: plain letters only, never while typing
export function quickKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable) return null;
  return QUICK.find(q => q[3] === e.key.toUpperCase()) || null;
}

// D-Mail's Write Mail from anywhere the Main Menu is: the menu's D-Mail, then the inbox's Write Mail switch
export async function writeMail(api) {
  if (!await menu(api, 'D-Mail')) return false;
  const w = await waitFor(s => s.windows.find(w => w.cls === 'CWindowModelDMail' && w.shown)?.controls.find(c => c.shown && /TextSwitch$/.test(c.cls) && c.label?.trim() === 'Write Mail'));
  if (!w) return false;
  await api.click(w.id);
  return true;
}

const frames = n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); });
// click row i of a game list (window win), scrolling the list's bar to it first when it is out of view (n: its rows)
export async function pickRow(api, win, list, bar, i, n) {
  const rows = Math.max(1, list.rows || 6);
  let top = list.top || 0;
  if ((i < top || i >= top + rows) && bar) { top = Math.min(i, Math.max(0, n - rows)); api.setValue(bar.id, top); await frames(3); }
  return api.click(list.id, rowPoint(win, list, i, top));
}

// focus the first `sel` in `panel` once it can take it (a window's root turns visible a few frames after the game says
// the window is shown): tried every 50 ms for 1.5 s; returns the stop, for an $effect
export function focusSoon(panel, sel) {
  let n = 0;
  const t = setInterval(() => {
    panel?.querySelector(sel)?.focus({ preventScroll: true });
    if (panel?.contains(document.activeElement) || ++n > 30) clearInterval(t);
  }, 50);
  return () => clearInterval(t);
}
