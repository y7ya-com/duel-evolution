// The lobby's own windows in HTML: the Main Menu (CMainMenu, src/Game/yo2MenuMain.cpp), the place banner
// (CWindowModelPlace, src/Game/yo2MenuPlace.cpp) and the menu bar (CWindowModelMenu + CWindowTaskMenubar,
// src/Game/yo2MenuBar.cpp.wip, yo2WindowControls.cpp CWindowTaskMenubar::onInit). The owner's skin rule (CONTRACT.md
// "Skin": sharp at 2x): the Main Menu is controls/skin.js's components (panel, titleBar with its close box,
// menuButton), as skin.html lays them out; the banner and the bar's strip are CSS here in their art's sampled colours
// (for skin.js once promoted). The bar's buttons are pictures (menuicon_02_c01.png): <button>s showing the look the
// engine shows. Text: Arial (textBox, spaced as the game), white captions outlined as skin.js's.
// Pass mode: the game takes the input; hover and pressed come from the snapshot.
import { SHEET, sprite } from '../../ui.js';
import { textBox } from '../controls/basic.js';
import { menuButton, titleBar, panel } from '../controls/skin.js';

// CWindowTaskFramePlace, lobbyname_win_01_c01.png (256 x 52; the body stretched after its first 224 px): a 1 px brown
// edge, a 3 px gold bevel (light top / left, darker right / bottom), a #625d36 line, then the blue body, #0985ff to
// #7deffc over its first 219 px, every other row lighter (the art's scan lines).
// CWindowTaskMenubar, menuber_01_c01.png (1024 x 32, over menuber_02_c01.png's white field at 0.7): a cyan to blue
// strip, its top 3 rows lighter, its bottom 3 darker; the message field x 392..1016, y 8..24: menuber_02's white panel
// at 0.698 (the strip's texels there are transparent: live in My Room, over the black backdrop, the engine's field
// reads #b2b2b2), its edge a pixel of half white blended into the strip (the strip's white texel rows read half a
// texel up-left). Measured with htmlui-chat in My Room.
const CSS = `
.lb-place { position: absolute; box-sizing: border-box; height: 52px; border: 1px solid; border-radius: 6px;
  border-color: #cbb598 #894009 #893b06 #a57f4e; background: #f2e14f;
  box-shadow: inset 1px 1px 0 #f6eb89, inset 2px 2px 0 #f4e563, inset -1px -1px 0 #f1b323, inset -2px -2px 0 #f1c42f; }
.lb-place::before { content: ''; position: absolute; inset: 3px; border: 1px solid #625d36; border-radius: 2px;
  background: repeating-linear-gradient(to bottom, transparent 0 1px, rgba(255, 255, 255, .12) 1px 2px),
    linear-gradient(to right, #0985ff 0, #7deffc 219px, #7deffc 100%); }
.lb-shadow { color: #fff; text-shadow: 1px 0 #4a4a4a, -1px 0 #4a4a4a, 0 1px #4a4a4a, 0 -1px #4a4a4a; }   /* skin.js's outline */
.lb-bar { position: absolute; left: 0; top: 0; width: 1024px; height: 32px;
  background: linear-gradient(to right, #75ffff 0, #caffff 60px, #fff 150px, #e5ffff 300px, #a7ffff 385px, #47bcff 700px,
      #0f8dff 1016px, #005eff 1024px) 0 0 / 100% 3px no-repeat,
    linear-gradient(to right, #56d4f6 0, #51a1c2 60px, #86b3be 150px, #5ea8c0 300px, #347fbc 385px, #0049bc 700px,
      #0028b9 1024px) 0 29px / 100% 3px no-repeat,
    linear-gradient(to right, #70ffff 0, #6cdbff 32px, #8ae4ff 64px, #a7eeff 96px, #c1f8ff 128px, #cdfeff 160px,
      #c4feff 224px, #aefeff 256px, #a0f3ff 288px, #8ee4ff 320px, #77d3fe 352px, #64c0fe 384px, #2279fd 700px,
      #0053fb 1016px, #003dd4 1024px);
  -webkit-mask: linear-gradient(#000 0 0), linear-gradient(#000 0 0) 392px 8px / 625px 17px no-repeat;
  -webkit-mask-composite: xor; mask-composite: exclude; }
.lb-field { position: absolute; left: 392px; top: 8px; width: 625px; height: 17px;
  background: rgba(255, 255, 255, .698); box-shadow: 0 0 0 1px rgba(255, 255, 255, .5); }
.lb-icon { position: absolute; width: 80px; height: 32px; }`;

function inject() {
  if (document.getElementById('htmlui-lobby')) return;
  const st = document.createElement('style');
  st.id = 'htmlui-lobby';
  st.textContent = CSS;
  document.head.append(st);
}

// a ShadowText: white, outlined as skin.js's captions
function shadowText(parent, c) {
  const d = textBox(parent, c.text, { x: c.x, y: c.y, w: c.w, align: c.align, px: c.fontSize || 16, white: true, color: [1, 1, 1, 1] });
  d.classList.add('lb-shadow');
  return d;
}
const top = c => !c.parent;
const look = c => c.state === 'disabled' ? 'disabled' : c.state === 'pressed' ? 'pressed' : c.state === 'hover' ? 'hover' : 'normal';

// The bar's picture atlas (not in ui.js's SHEET yet), loaded as it loads one: its clamp copy's alpha says where
// sprite() needs the .rgb copy under a mask
let icons, loading;
const loadIcons = () => loading ||= (async () => {
  const base = SHEET.window.url.slice(0, SHEET.window.url.lastIndexOf('/') + 1), m = new Image();
  m.src = base + 'clamp/menuicon_02_c01.png';
  await m.decode();
  const g = new OffscreenCanvas(m.width, m.height).getContext('2d', { willReadFrequently: true });
  g.drawImage(m, 0, 0);
  const d = g.getImageData(0, 0, m.width, m.height).data, a = new Uint8Array(m.width * m.height);
  for (let i = 0; i < a.length; i++) a[i] = d[4 * i + 3];
  icons = { url: base + 'menuicon_02_c01.png', w: 240, h: 192, alpha: a };
})();

// CMainMenu: the frame (FrameMain, the window's size: skin.js panel with the bottom-thick band), the title bar with the
// × (ShadowText, IconHide), an entry per shown ButtonMain (skin.js menuButton)
function mainMenu(win, root, st) {
  const title = win.controls.find(c => c.cls === 'CWindowTaskShadowText' && top(c))?.text ?? '';
  const close = win.controls.find(c => c.cls === 'CWindowTaskIconHide');
  const key = [win.w, win.h, title].join();
  if (st.key !== key) {
    root.replaceChildren();
    st.key = key;
    st.panel = panel(root, { w: win.w, h: win.h, band: 6 });
    st.title = titleBar(st.panel, { w: win.w, title, close: !!close });
    st.buttons = new Map();
  }
  if (close) st.title.close.dataset.state = close.pressed ? 'pressed' : 'normal';
  const seen = new Set();
  for (const c of win.controls) {
    if (c.cls !== 'CWindowTaskButtonMain' || !c.shown) continue;
    seen.add(c.id);
    let b = st.buttons.get(c.id);
    if (!b) { b = menuButton(st.panel, { x: c.x, y: c.y, w: c.w, h: c.h, label: c.label }); st.buttons.set(c.id, b); }
    Object.assign(b.style, { left: c.x + 'px', top: c.y + 'px' });
    if (b.label !== c.label) { b.label = c.label; b.set({ label: c.label }); }
    b.set({ state: look(c) });
  }
  for (const [id, b] of st.buttons) if (!seen.has(id)) { b.remove(); st.buttons.delete(id); }
}

// CWindowModelPlace: the plate (FramePlace's size) and its four ShadowTexts
function place(win, root, st) {
  const f = win.controls.find(c => c.cls === 'CWindowTaskFramePlace');
  const texts = win.controls.filter(c => c.cls === 'CWindowTaskShadowText' && top(c) && c.shown);
  const key = JSON.stringify([f?.w, f?.h, f?.shown, texts.map(c => [c.text, c.x, c.y, c.w, c.align])]);
  if (st.key === key) return;
  st.key = key;
  root.replaceChildren();
  if (!f?.shown) return;
  const p = document.createElement('div');
  p.className = 'lb-place';
  Object.assign(p.style, { left: f.x + 'px', top: f.y + 'px', width: f.w + 'px' });
  root.append(p);
  for (const c of texts) shadowText(root, c);
}

// CWindowModelMenu: the strip and its message field (the Menubar), the picture buttons, the message text
function menuBar(win, root, st) {
  if (!st.bar) {
    root.replaceChildren();
    st.bar = document.createElement('div');
    st.bar.className = 'lb-bar';
    root.append(st.bar, Object.assign(document.createElement('div'), { className: 'lb-field' }));   // not in the masked strip
    st.icons = new Map();
  }
  const seen = new Set();
  for (const c of win.controls) {
    if (c.cls !== 'CWindowTaskPictureSwitch' || !c.shown) continue;
    seen.add(c.id);
    let b = st.icons.get(c.id);
    if (!b) {
      b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn lb-icon', tabIndex: -1 });
      b.sp = sprite(b, icons, 0, 0, 80, 32, 0, 0, 80, 32);
      root.append(b);
      st.icons.set(c.id, b);
    }
    // the look the engine shows: the one of its four sprites that is drawn
    const a = Object.values(c.art || {}).find(s => s?.shown) || c.art?.normal;
    Object.assign(b.style, { left: c.x + 'px', top: c.y + 'px' });
    if (a && b.uv !== a.src.join()) { b.uv = a.src.join(); b.sp.src(a.src[0], a.src[1]); }
    b.dataset.state = look(c);
  }
  for (const [id, b] of st.icons) if (!seen.has(id)) { b.remove(); st.icons.delete(id); }
  const msg = win.controls.find(c => c.cls === 'CWindowTaskText' && top(c));
  const text = msg?.shown ? msg.text : '';
  if (st.text !== text) {
    st.text = text;
    st.msg?.remove();
    st.msg = text ? textBox(root, text, { x: msg.x, y: msg.y }) : null;
  }
}

const DRAW = { CMainMenu: mainMenu, CWindowModelPlace: place, CWindowModelMenu: menuBar };
export default {
  classes: Object.keys(DRAW),
  mode: 'pass',
  clip: false,   // the banner's window is 0 x 0 and the bar's 384 wide under a 1024-wide strip
  mount: () => { inject(); return {}; },
  update(win, prev, root, api, st) {
    st.win = win;
    if (win.cls === 'CWindowModelMenu' && !icons) { loadIcons().then(() => menuBar(st.win, root, st)); return; }
    DRAW[win.cls](win, root, st);
  },
  unmount(root) { root.replaceChildren(); },
};
