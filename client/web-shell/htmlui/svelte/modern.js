// Modern UI (../modern.js picks these over the legacy screens while it is on): Duel Evolution's 2026 skin, one Svelte
// component per window, all owned (the DOM takes the input and plays it into the game through the api: the same
// engine controls, never a new action). DESIGN.md beside svelte/modern/ has the direction.
import { mount, unmount, flushSync } from 'svelte';
import { screen, View } from './screen.svelte.js';
import { theme } from './modern/theme.js';
import PlayerSelect from './modern/PlayerSelect.svelte';
import MainMenu from './modern/MainMenu.svelte';
import MenuBar from './modern/MenuBar.svelte';
import Place from './modern/Place.svelte';
import Chat from './modern/Chat.svelte';
import PlayerList from './modern/PlayerList.svelte';
import ListWindow from './modern/ListWindow.svelte';
import Profile from './modern/Profile.svelte';
import Dialog from './modern/Dialog.svelte';
import Mail from './modern/Mail.svelte';
import Avatar from './modern/Avatar.svelte';
import DeckWindow from './modern/deck/DeckWindow.svelte';
import DeckKaban from './modern/deck/DeckKaban.svelte';
import DeckScene from './modern/deck/DeckScene.svelte';
import { deck } from './deck/state.svelte.js';
import { isArt, isSwf, inEditor } from './deck/art.js';
import { quickInstall } from './deck/quick.js';

theme();

// the deck editor (and Card Swap / Trade, which reuse its windows): svelte/deck.js's module (pass mode: the game takes
// the mouse, drag and drop; its plan and state), drawn by the modern skin's components and scene
const deckBase = screen({ CWindowModelDeck: DeckWindow, CWindowModelKaban: DeckKaban, CWindowModelFileList: DeckWindow, CCardDetailViewDlg: DeckWindow });
let scene = null;
const deckScreen = {
  ...deckBase,
  mode: 'pass',
  parts: true,
  clip: false,
  passthrough: x => isArt(x) || isSwf(x) || deck.co.has(x.id),
  mount(win, root, api) {
    quickInstall();
    const editor = inEditor();
    deck.set(win, editor);
    return { ...deckBase.mount(win, root, api), editor, id: win.id };
  },
  update(win, prev, root, api, st) { deck.set(win, st.editor); deckBase.update(win, prev, root, api, st); },
  unmount(root, st) { deckBase.unmount(root, st); deck.drop(st.id); },
  hide: (win, snap) => win.scene && inEditor(snap) ? [win.scene.bg, win.scene.title, ...win.scene.menu].filter(Boolean).map(e => e.id) : [],
  backdrop(win, el, api, state, snap) {
    const sc = inEditor(snap) && win.scene;
    if (scene && (!sc || scene.el !== el || !el.contains(scene.node))) { unmount(scene.app); scene = null; }
    if (!sc) { if (el.firstChild) el.replaceChildren(); return; }
    if (!scene) {
      el.replaceChildren();
      const view = new View(sc, api);
      scene = { el, view, app: mount(DeckScene, { target: el, props: { view } }) };
      scene.node = el.firstElementChild;
    } else scene.view.win = sc;
    flushSync();
  },
};

const screens = [
  // the hovered character's waist-up bust stays the engine's (as svelte/select.js)
  screen({ CWindowPlayerSelect: PlayerSelect }, { mode: 'owned', clip: false, passthrough: x => x.cls === 'CWaistUpAvatar' || x.cls === 'CElement' }),
  screen({ CMainMenu: MainMenu, CWindowModelMenu: MenuBar, CChatWindow: Chat, CPlayerListDlg: PlayerList,
    CWindowModelFriendlist: ListWindow, CWindowModelBlacklist: ListWindow, CWindowModelTeamlist: ListWindow,
    CWindowModelProfile: Profile, CWindowModelDialogYesNo: Dialog, CWindowModelDMail: Mail, CWindowModelDMailSend: Mail }, { mode: 'owned', clip: false }),
  // character creation: pass mode, as svelte/avatar.js (the game takes the input; its character, a plain CElement, passes)
  screen({ CWindowDialogAvatarSwitch: Avatar }, { mode: 'pass', clip: false, passthrough: x => x.cls === 'CElement' }),
  screen({ CWindowModelPlace: Place }, { mode: 'pass', clip: false }),
  deckScreen,
];
export default { screens, classes: screens.flatMap(s => s.classes) };
