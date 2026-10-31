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
import Toast from './modern/Toast.svelte';
import Form from './modern/Form.svelte';
import Mail from './modern/Mail.svelte';
import Avatar from './modern/Avatar.svelte';
import Generic from './modern/Generic.svelte';
import { GENERIC, generic, options } from './modern/logic.js';
import DuelConfig from './modern/DuelConfig.svelte';
import Move from './modern/Move.svelte';
import ItemGet from './modern/ItemGet.svelte';
import NpcCard from './modern/NpcCard.svelte';
import Balloon from './modern/Balloon.svelte';
import PickList from './modern/PickList.svelte';
import FindMenu from './modern/FindMenu.svelte';
import DiskCase from './modern/DiskCase.svelte';
import Options from './modern/Options.svelte';
import DeckWindow from './modern/deck/DeckWindow.svelte';
import DeckKaban from './modern/deck/DeckKaban.svelte';
import DeckScene from './modern/deck/DeckScene.svelte';
import Editor from './modern/deck/Editor.svelte';
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

// Edit Deck (scene 0x24) is the modern deck editor, owned (deck/Editor.svelte, on the deck window: the whole scene); the
// trunk and the card detail draw nothing there (the editor shows both). Card Swap and Trade keep deckScreen's skin.
// The file list stays deckScreen's (the engine's dialogs of the editor's Load / Save / Structure Deck).
const deckEditor = {
  ...deckScreen,
  classes: ['CWindowModelDeck', 'CWindowModelKaban', 'CCardDetailViewDlg'],
  get mode() { return inEditor() ? 'owned' : 'pass'; },
  passthrough: x => !inEditor() && deckScreen.passthrough(x),
  mount(win, root, api) {
    if (!inEditor()) return { legacy: deckScreen.mount(win, root, api) };
    if (win.cls !== 'CWindowModelDeck') { root.style.display = 'none'; return { none: true }; }
    const view = new View(win, api), app = mount(Editor, { target: root, props: { view } });
    flushSync();
    // the bridge clips a window's root around the engine's windows in front (its rect only) and makes it take the
    // pointer: the editor covers the whole scene and cuts its own holes (Editor.svelte), so the root neither clips nor
    // takes the pointer itself (the editor does, outside its holes)
    const fix = () => { if (root.style.clipPath) root.style.clipPath = ''; if (root.style.pointerEvents !== 'none') root.style.pointerEvents = 'none'; };
    const mo = new MutationObserver(fix);
    mo.observe(root, { attributes: true, attributeFilter: ['style'] });
    fix();
    return { view, app, mo };
  },
  update(win, prev, root, api, st) {
    if (st.legacy) return deckScreen.update(win, prev, root, api, st.legacy);
    if (st.view && st.view.win !== win) { st.view.win = win; st.view.api = api; flushSync(); }
  },
  unmount(root, st) { if (st.legacy) deckScreen.unmount(root, st.legacy); else if (st.app) { st.mo.disconnect(); unmount(st.app); } },
  backdrop: (win, el, api, state) => deckScreen.backdrop(win, el, api, state, { scene: -1 }),   // no scene: the editor covers it
};

// every other window (logic.js GENERIC): the modern look over the engine's own controls, the engine keeping the input;
// what it can't draw (pictures, Flash, unknown controls, sprite extras) the engine keeps drawing, except a sprite that is
// the window's backdrop (the plate stands in for it). parts: an unknown control's sprites place its hole
const genericBase = screen(Object.fromEntries(GENERIC.map(c => [c, Generic])));
const kept = new Map();   // window id -> what the engine keeps drawing in it (logic.js generic keep)
const genericScreen = {
  ...genericBase, mode: 'pass', clip: false, parts: true,
  mount(win, root, api) { kept.set(win.id, new Set(generic(win).keep)); return { ...genericBase.mount(win, root, api), id: win.id }; },
  update(win, prev, root, api, st) { kept.set(win.id, new Set(generic(win).keep)); genericBase.update(win, prev, root, api, st); },
  unmount(root, st) { kept.delete(st.id); genericBase.unmount(root, st); },
  // a part of a kept control isn't listed: the nearest listed ancestor (the kept control) decides (htmlui.c)
  passthrough: x => [...kept.values()].some(k => k.has(x.id)),
};

// the title's Options (Options.svelte): the flags and screen modes it keeps drawing, by id (logic.js options keep)
function optionsScreen() {
  const keep = new Map(), base = screen({ COptionDlg: Options });
  return { ...base, mode: 'pass', clip: false, parts: true,
    mount(win, root, api) { keep.set(win.id, new Set(options(win).keep)); return { ...base.mount(win, root, api), id: win.id }; },
    update(win, prev, root, api, st) { keep.set(win.id, new Set(options(win).keep)); base.update(win, prev, root, api, st); },
    unmount(root, st) { keep.delete(st.id); base.unmount(root, st); },
    passthrough: x => [...keep.values()].some(k => k.has(x.id)) };
}

const screens = [
  // the hovered character's waist-up bust stays the engine's (as svelte/select.js)
  screen({ CWindowPlayerSelect: PlayerSelect }, { mode: 'owned', clip: false, passthrough: x => x.cls === 'CWaistUpAvatar' || x.cls === 'CElement' }),
  screen({ CMainMenu: MainMenu, CWindowModelMenu: MenuBar, CChatWindow: Chat, CPlayerListDlg: PlayerList,
    CWindowModelFriendlist: ListWindow, CWindowModelBlacklist: ListWindow, CWindowModelTeamlist: ListWindow,
    CWindowModelProfile: Profile, CWindowModelDialogYesNo: Dialog, CWindowModelInput1: Dialog, CWindowModelDialogError: Dialog, CWindowModelDialogOk: Toast, CWindowModelSetComment: Form, CWindowModelDMail: Mail, CWindowModelDMailSend: Mail, CWindowModelDuelConfig: DuelConfig, CWindowModelMove: Move, CWindowModelList: PickList, CFindMenu: FindMenu }, { mode: 'owned', clip: false }),
  // character creation: pass mode, as svelte/avatar.js (the game takes the input; its character, a plain CElement, passes)
  screen({ CWindowDialogAvatarSwitch: Avatar }, { mode: 'pass', clip: false, passthrough: x => x.cls === 'CElement' }),
  screen({ CWindowModelPlace: Place }, { mode: 'pass', clip: false }),
  // a duelist's card and an NPC's speech bubble: pass (the game keeps the mouse: a click anywhere goes on or closes);
  // the bubble's own button and a card's buttons take the pointer
  screen({ CNpcListMenu: NpcCard, CPlayerListMenu: NpcCard, CWindowModelBalloon: Balloon }, { mode: 'pass', clip: false }),
  // My Room's duel disk case: the engine keeps its grid of disks (sprite extras) and their drag onto the shelf
  screen({ CDuelDiskList: DiskCase }, { mode: 'pass', clip: false, passthrough: x => /^CSpriteElm/.test(x.cls) }),
  // the title's Options: painted over the game's own layout (pass); its flag and screen pictures stay the engine's
  optionsScreen(),
  // an unlock / item announcement: the engine keeps drawing its portrait card (sprite extras, plain elements)
  screen({ CWindowModelItemGet: ItemGet }, { mode: 'pass', clip: false, passthrough: x => x.cls === 'CSpriteElmOlder' || x.cls === 'CElement' }),
  genericScreen,
  deckEditor,
  { ...deckScreen, classes: ['CWindowModelFileList'], backdrop: undefined },
];
// every modern window's root says its class (data-cls): the deck editor hides the scene's dialogs by it while it drives them
for (const s of screens) { const m = s.mount; s.mount = function (win, root, api) { root.dataset.cls = win.cls; return m.call(this, win, root, api); }; }
export default { screens, classes: screens.flatMap(s => s.classes) };
