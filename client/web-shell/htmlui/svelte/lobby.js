// The lobby's own windows in Svelte (supersede screens/lobby.js once their flip pairs match: ?HTML_SVELTE=lobby): the
// Main Menu (CMainMenu), the place banner (CWindowModelPlace), the menu bar (CWindowModelMenu). Pass mode: the game
// takes the input; hover and pressed come from the snapshot.
import { screen } from './screen.svelte.js';
import MainMenu from './lobby/MainMenu.svelte';
import Place from './lobby/Place.svelte';
import MenuBar, { atlas } from './lobby/MenuBar.svelte';
import { menuBox } from '../screens/lobby.js';

// the menu bar's controls, passed to the game while the bar's atlas isn't there (MenuBar.svelte's atlas)
const bar = new Set();
const note = win => { if (win.cls === 'CWindowModelMenu') { bar.clear(); for (const c of win.controls) bar.add(c.id); } };
const s = screen({ CMainMenu: MainMenu, CWindowModelPlace: Place, CWindowModelMenu: MenuBar }, {
  mode: 'pass',
  clip: false,   // the banner's window is 0 x 0 and the bar's 384 wide under a 1024-wide strip
  occlusionBox: win => win.cls === 'CMainMenu' ? menuBox(win) : null,   // the Main Menu's frame, taller than its window
  passthrough: (x, parent) => !atlas.ready && (bar.has(x.id) || !!parent && bar.has(parent.id)),
});
export default { ...s, mount: (win, ...a) => (note(win), s.mount(win, ...a)), update: (win, ...a) => (note(win), s.update(win, ...a)) };
