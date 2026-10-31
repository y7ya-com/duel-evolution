// Modern UI (../modern.js picks these over the legacy screens while it is on): Duel Evolution's 2026 skin, one Svelte
// component per window, all owned (the DOM takes the input and plays it into the game through the api: the same
// engine controls, never a new action). DESIGN.md beside svelte/modern/ has the direction.
import { screen } from './screen.svelte.js';
import { theme } from './modern/theme.js';
import PlayerSelect from './modern/PlayerSelect.svelte';
import MainMenu from './modern/MainMenu.svelte';
import MenuBar from './modern/MenuBar.svelte';
import Place from './modern/Place.svelte';
import Chat from './modern/Chat.svelte';
import PlayerList from './modern/PlayerList.svelte';

theme();
const screens = [
  // the hovered character's waist-up bust stays the engine's (as svelte/select.js)
  screen({ CWindowPlayerSelect: PlayerSelect }, { mode: 'owned', clip: false, passthrough: x => x.cls === 'CWaistUpAvatar' || x.cls === 'CElement' }),
  screen({ CMainMenu: MainMenu, CWindowModelMenu: MenuBar, CChatWindow: Chat, CPlayerListDlg: PlayerList }, { mode: 'owned', clip: false }),
  screen({ CWindowModelPlace: Place }, { mode: 'pass', clip: false }),
];
export default { screens, classes: screens.flatMap(s => s.classes) };
