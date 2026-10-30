// Shared CSS components (owner's rule, CONTRACT.md "Skin"): where the game's art is a simple gradient, border or bevel
// it is CSS with the original's sampled colours, sharp at any DPR; bitmaps only for real pictures. The judgement is
// "looks the same, sharper", not pixel-identical. Sizes in game px (the layer scales). Text: Arial DOM text.
// Sampled from the engine's own 1x render of the lobby Main Menu (CMainMenu, notes nodp-mainmenu.png) and from
// window_base_01_c01.png's texels:
//  - menu button (24 high): border #e36f08 (#e99223 right, #e68317 bottom), radius 3; inside, rows from the top
//    #f1b780 #ffffc8 #fff97f #f9e45f then #f4d558, the last three #f3d054 #f0be45 #eca430; columns from the left
//    #f1b757 #ffff95 #fff673 #f9e15d, from the right #f0bd45 #f2cc51 #f3d357; caption white, outlined dark
//  - title bar (22 high): #e5f1f4 > #cae7f3 > #a3d7f3 > #9dd3f4 ... #5fa4f5 #4e93f5 #336deb, a #234cdb line under it;
//    close box 15 x 13 at 4 from the right, 4 down: white left edge, #fffec2 #fffd63 #fffc00 ... #f1bb00 #f5cf80,
//    right edge #f5cf00 #f7dc80, a #005fea X (10 x 9, 2 px strokes)
//  - panel frame (c01): 3 px #76ffff left / #a7ffff top, then #68e8ff / #79ffff, the right and bottom #41abef /
//    #329be5 after #4db9f7 / #46b1f2, all at the window's alpha 178/255; the body #84f4ff (solved from two engine pixels over a known backdrop); a
//    bottom-thick frame (the Main Menu's) has an opaque #e5e5e5 band above its bottom bevel
// States: the game's (data-state = the snapshot's hover / pressed / disabled, pass mode) or the pointer's (:hover /
// :active, owned mode). The game's own hover and pressed looks are not sampled yet: ponytail: brighter / sunk until a
// live capture of them.
import { FONT, spacing } from './basic.js';

const OUTLINE = '#4a4a4a';   // the shadow text's edge: thin, four ways (eight read bold next to the engine's)
const outlined = `text-shadow: 1px 0 ${OUTLINE}, -1px 0 ${OUTLINE}, 0 1px ${OUTLINE}, 0 -1px ${OUTLINE}`;
const BTN_V = `linear-gradient(to bottom, #f1b780 0.5px, #ffffc8 1.5px, #fff97f 2.5px, #f9e45f 3.5px, #f4d558 4.5px,
  #f4d558 calc(100% - 3.5px), #f3d054 calc(100% - 2.5px), #f0be45 calc(100% - 1.5px), #eca430 calc(100% - 0.5px))`;
const BTN_H = `linear-gradient(to right, #f1b757 0.5px, #ffff95 1.5px, #fff673 2.5px, #f9e15d 3.5px, transparent 4.5px,
  transparent calc(100% - 3.5px), #f3d357 calc(100% - 2.5px), #f2cc51 calc(100% - 1.5px), #f0bd45 calc(100% - 0.5px))`;
// pressed: the bevel turned over (dark lip on top, light at the bottom)
const BTN_V_DOWN = `linear-gradient(to bottom, #eca430 0.5px, #f0be45 1.5px, #f3d054 2.5px, #f4d558 3.5px,
  #f4d558 calc(100% - 4.5px), #f9e45f calc(100% - 3.5px), #fff97f calc(100% - 2.5px), #ffffc8 calc(100% - 1.5px), #f1b780 calc(100% - 0.5px))`;

export const SKIN_CSS = `
.yo2-mbtn { position: absolute; box-sizing: border-box; margin: 0; padding: 0; border: 1px solid; border-radius: 3px;
  border-color: #e36f08 #e99223 #e68317 #e36f08; background: ${BTN_H}, ${BTN_V}; color: #fff; ${outlined};
  font: 14.32px/22px ${FONT}; text-align: center; white-space: nowrap; overflow: hidden; cursor: inherit; }
.yo2-mbtn[data-state=hover], .yo2-mbtn:not([data-state]):hover { filter: brightness(1.07) saturate(1.05); }
.yo2-mbtn[data-state=pressed], .yo2-mbtn:not([data-state]):active { background: ${BTN_V_DOWN}; }
.yo2-mbtn[data-state=pressed] > span, .yo2-mbtn:not([data-state]):active > span { position: relative; top: 1px; }
.yo2-mbtn[data-state=disabled], .yo2-mbtn:disabled { filter: grayscale(0.8) brightness(0.92); color: #e8e8e8; }
.yo2-title { position: absolute; box-sizing: border-box; height: 22px; color: #fff; ${outlined};
  font: 14.32px/20px ${FONT}; text-align: center; white-space: nowrap;
  background: linear-gradient(to bottom, #e5f1f4 0.5px, #cae7f3 2.5px, #a3d7f3 4.5px, #9dd3f4 6.5px, #5fa4f5 17.5px,
    #4e93f5 18.5px, #336deb 19.5px, #234cdb 20.5px, #234cdb 21.5px); }
.yo2-close { position: absolute; top: 4px; right: 4px; width: 16px; height: 13px; box-sizing: border-box; margin: 0;
  padding: 0; border: 0; border-left: 1px solid #fff; cursor: inherit;
  background: linear-gradient(to right, transparent calc(100% - 2.5px), #f5cf00 calc(100% - 1.5px), #f7dc80 calc(100% - 0.5px)),
    linear-gradient(to bottom, #fffec2 0.5px, #fffd63 1.5px, #fffc00 3px, #fffc00 calc(100% - 2.5px), #f1bb00 calc(100% - 1.5px), #f5cf80 calc(100% - 0.5px)); }
.yo2-close::before, .yo2-close::after { content: ''; position: absolute; left: 1px; top: 5.5px; width: 12px; height: 2px;
  background: #005fea; border-radius: 1px; }
.yo2-close::before { transform: rotate(42deg); }
.yo2-close::after { transform: rotate(-42deg); }
.yo2-close[data-state=hover], .yo2-close:not([data-state]):hover { filter: brightness(1.08); }
.yo2-close[data-state=pressed], .yo2-close:not([data-state]):active { filter: brightness(0.9); }
.yo2-panel { position: absolute; box-sizing: border-box; }
.yo2-panel::before { content: ''; position: absolute; inset: 0; opacity: ${(178 / 255).toFixed(3)}; z-index: -1;
  background: #84f4ff; box-shadow: inset 3px 0 0 #76ffff, inset 0 3px 0 #a7ffff, inset -3px 0 0 #41abef,
    inset 0 -3px 0 #329be5, inset 4px 0 0 #68e8ff, inset 0 4px 0 #79ffff, inset -4px 0 0 #4db9f7, inset 0 -4px 0 #46b1f2,
    inset 7px 0 0 #59c6ff, inset 0 7px 0 #59c6ff, inset -7px 0 0 #59c6ff, inset 0 -7px 0 #59c6ff; }
.yo2-panel { isolation: isolate; }
.yo2-band { position: absolute; left: 7px; right: 7px; bottom: 7px; background: #e5e5e5; }`;

function inject() {
  if (document.getElementById('htmlui-skin')) return;
  const st = document.createElement('style');
  st.id = 'htmlui-skin';
  st.textContent = SKIN_CSS;
  document.head.append(st);
}
const place = (el, { x = 0, y = 0, w, h }) => Object.assign(el.style, { left: x + 'px', top: y + 'px',
  ...(w != null && { width: w + 'px' }), ...(h != null && { height: h + 'px' }) });
// state: 'normal' | 'hover' | 'pressed' | 'disabled' (the snapshot's), or null to follow the pointer (owned mode)
const setState = (el, state) => { if (state) el.dataset.state = state; else delete el.dataset.state; };

// The yellow menu button (lobby Main Menu and its kin). Returns the <button>; .set({ label, state }) updates it.
export function menuButton(parent, { x, y, w, h = 24, label = '', state = 'normal' } = {}) {
  inject();
  const b = document.createElement('button'), s = document.createElement('span');
  b.className = 'yo2-mbtn';
  b.type = 'button';
  b.append(s);
  place(b, { x, y, w, h });
  b.style.lineHeight = h - 2 + 'px';
  b.set = ({ label: l, state: st } = {}) => {
    if (l != null) { const ls = spacing(l); s.textContent = l; Object.assign(s.style, { letterSpacing: ls + 'px', marginRight: -ls + 'px' }); }
    if (st !== undefined) setState(b, st);
  };
  b.set({ label, state });
  parent.append(b);
  return b;
}

// The blue title bar, with its close box unless close is false. Returns the bar; .close is the close <button>.
export function titleBar(parent, { x = 0, y = 0, w, title = '', close = true, closeState = 'normal' } = {}) {
  inject();
  const t = document.createElement('div');
  t.className = 'yo2-title';
  place(t, { x, y, w });
  const tt = document.createElement('span'), ls = spacing(title);
  tt.textContent = title;
  Object.assign(tt.style, { letterSpacing: ls + 'px', marginRight: -ls + 'px' });
  t.append(tt);
  if (close) {
    const c = t.close = document.createElement('button');
    c.className = 'yo2-close';
    c.type = 'button';
    c.setAttribute('aria-label', 'Close');
    setState(c, closeState);
    t.append(c);
  }
  parent.append(t);
  return t;
}

// The blue panel frame (window_base_01_c01's bevel, translucent as the window draws it). Children go inside it.
// band: the bottom-thick frame's grey band above the bottom bevel, in px (the Main Menu's: 6).
export function panel(parent, { x = 0, y = 0, w, h, band = 0 } = {}) {
  inject();
  const p = document.createElement('div');
  p.className = 'yo2-panel';
  place(p, { x, y, w, h });
  if (band) { const b = document.createElement('div'); b.className = 'yo2-band'; b.style.height = band + 'px'; p.append(b); }
  parent.append(p);
  return p;
}
