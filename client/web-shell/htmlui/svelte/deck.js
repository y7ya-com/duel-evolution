// The deck editor in Svelte (supersedes screens/deck.js once its flip pairs match: ?HTML_SVELTE=deck): one component
// per window, the shared deck state (state.svelte.js) for the holes every window is clipped around, the scene
// backdrop as a component in the bridge's backdrop layer. Pass mode: the game takes the mouse (drag and drop).
import { mount, unmount, flushSync } from 'svelte';
import { screen, View } from './screen.svelte.js';
import { deck } from './deck/state.svelte.js';
import { isArt, isSwf, inEditor } from './deck/art.js';
import { quickInstall } from './deck/quick.js';
import Window from './deck/Window.svelte';
import Kaban from './deck/Kaban.svelte';
import Scene from './deck/Scene.svelte';

const base = screen({ CWindowModelDeck: Window, CWindowModelKaban: Kaban, CWindowModelFileList: Window, CCardDetailViewDlg: Window });
let scene = null;   // the backdrop: { el, app, view }
export default {
  ...base,
  mode: 'pass',
  parts: true,    // the controls' raw sprites / texts / swfs: most of the editor's art
  clip: false,    // the deck models lay out in screen pixels outside their nominal 336 x 144
  // what the engine keeps drawing under the DOM: card faces, swfs, and what this draws under them (last frame's plan)
  // (Structure Deck's recipe icons: a control the reader can't read, drawn through holes in the list)
  passthrough: x => isArt(x) || isSwf(x) || x.cls === 'CWindowTaskStructureIcon' || deck.co.has(x.id),
  mount(win, root, api) {
    quickInstall();
    const editor = inEditor();
    deck.api = api;
    deck.set(win, editor);
    return { ...base.mount(win, root, api), editor, id: win.id };
  },
  update(win, prev, root, api, st) {
    root.setAttribute('aria-label', win.cls);
    deck.set(win, st.editor);
    base.update(win, prev, root, api, st);
  },
  unmount(root, st) { base.unmount(root, st); deck.drop(st.id); },
  // the scene (the Deck window's `scene`): the engine's background, title strip and side buttons are hidden and drawn
  // by Scene in the backdrop layer
  hide: (win, snap) => win.scene && inEditor(snap) ? [win.scene.bg, win.scene.title, ...win.scene.menu].filter(Boolean).map(e => e.id) : [],
  backdrop(win, el, api, state, snap) {
    const sc = inEditor(snap) && win.scene;
    if (scene && (!sc || scene.el !== el || !el.contains(scene.node))) { unmount(scene.app); scene = null; }
    if (!sc) { if (el.firstChild) el.replaceChildren(); return; }   // a window without the scene: no stale backdrop
    if (!scene) {
      el.replaceChildren();
      const view = new View(sc, api);
      scene = { el, view, app: mount(Scene, { target: el, props: { view } }) };
      scene.node = el.firstElementChild;
    } else scene.view.win = sc;
    flushSync();
  },
};
