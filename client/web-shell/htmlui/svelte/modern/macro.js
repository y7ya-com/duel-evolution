// One-step actions made of the engine's own clicks (no new engine or server behaviour): the dock's quick actions open
// the Main Menu and press its button, the menu kept out of sight meanwhile (html.mu-macro: MainMenu.svelte hides).
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
    // the menu closes as the window opens: keep it hidden through that frame
    await frame(); await frame();
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
