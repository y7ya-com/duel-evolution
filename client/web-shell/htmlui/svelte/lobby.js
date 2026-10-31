// The lobby's own windows in Svelte (supersede screens/lobby.js once their flip pairs match: ?HTML_SVELTE=lobby): the
// Main Menu (CMainMenu), the place banner (CWindowModelPlace), the menu bar (CWindowModelMenu), and (Svelte only) the
// Move list (CWindowModelMove), the pick list over a click (CWindowModelList) and the search menu (CFindMenu). Pass
// mode: the game takes the input; hover and pressed come from the snapshot.
import { screen } from './screen.svelte.js';
import MainMenu from './lobby/MainMenu.svelte';
import Place from './lobby/Place.svelte';
import MenuBar from './lobby/MenuBar.svelte';
import Move from './lobby/Move.svelte';
import ListWindow from './lobby/ListWindow.svelte';

export default screen({ CMainMenu: MainMenu, CWindowModelPlace: Place, CWindowModelMenu: MenuBar, CWindowModelMove: Move, CWindowModelList: ListWindow, CFindMenu: ListWindow }, {
  mode: 'pass',
  clip: false,   // the banner's window is 0 x 0 and the bar's 384 wide under a 1024-wide strip
});
