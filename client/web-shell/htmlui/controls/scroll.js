// Native scrolling (owner: "the overflow scrollers are just so broken all across the game. Can we please use native
// HTML scrollers"): every HTML list is a real overflow: auto box with the browser's own scroll bar, so wheel, drag,
// touch momentum and keys behave as the player's browser does; the game's scroll bar and arrows are not redrawn.
//
// scrollList(parent, { x, y, w, h, rowH = 16, stick = false }) -> list
//   list.set(items, render, key = (item, i) => i): one row per item (render(item, i) -> element, placed at i * rowH);
//     rows are kept by key between calls, so an update moves no scroll position by itself
//   stick: a log (the chat): new items keep it at the bottom while the player is there, never when they scrolled up
//   list.onTop = i => {}: the first row in view after the player scrolls (to drive the game's list, below)
//   list.top(i): show row i first (the game moved its list: a search, a jump)
// wheelTo(api, ctl, i, gp): for a list whose rows the ENGINE still draws (card faces in the trunk): one wheel notch per
//   frame toward ctl's top line i (ctl: its snapshot control, topLine read by read.js), through api.wheel, aimed at the
//   game point gp when given (a list whose rect reads 0 x 0), else ctl's centre
import { FONT } from './basic.js';

const CSS = `
.yo2-scroll-list { position: absolute; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain;
  scrollbar-width: thin; scrollbar-color: #5f9fd3 rgba(255, 255, 255, 0.35); font-family: ${FONT}; pointer-events: auto; }
.yo2-scroll-list > .yo2-rows { position: relative; }
.yo2-scroll-list > .yo2-rows > * { position: absolute; left: 0; right: 0; }`;

let injected = false;
export const inject = () => {   // the CSS, once (bridge.js's engine bars use it too)
  if (injected || document.getElementById('htmlui-scroll')) return;
  injected = true;
  const st = document.createElement('style');
  st.id = 'htmlui-scroll';
  st.textContent = CSS;
  document.head.append(st);
};

export function scrollList(parent, { x = 0, y = 0, w, h, rowH = 16, stick = false } = {}) {
  inject();
  const el = document.createElement('div'), rows = document.createElement('div');
  el.className = 'yo2-scroll-list';
  rows.className = 'yo2-rows';
  Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  el.append(rows);
  parent.append(el);
  // the keys the game sends (arrows, page keys) are the list's while it has focus, not the game's (SDL listens on window)
  for (const t of ['keydown', 'keyup', 'keypress']) el.addEventListener(t, e => e.stopPropagation());
  const kept = new Map();
  let byUser = true;   // false only between top() and the scroll event it causes
  const list = {
    el, rows, onTop: null,
    atBottom: () => el.scrollHeight - el.scrollTop - el.clientHeight < 2,
    set(items, render, key = (item, i) => i) {
      const stay = stick && list.atBottom(), seen = new Set();
      items.forEach((item, i) => {
        const k = key(item, i);
        seen.add(k);
        let r = kept.get(k);
        if (!r) { r = render(item, i); kept.set(k, r); rows.append(r); }
        r.style.top = i * rowH + 'px';
        r.style.height = rowH + 'px';
      });
      for (const [k, r] of kept) if (!seen.has(k)) { r.remove(); kept.delete(k); }
      rows.style.height = items.length * rowH + 'px';
      if (stay) el.scrollTop = el.scrollHeight;
    },
    top(i) { byUser = false; el.scrollTop = i * rowH; },
  };
  el.addEventListener('scroll', () => {
    if (!byUser) { byUser = true; return; }   // the first event after top() is ours
    list.onTop?.(Math.round(el.scrollTop / rowH));
  }, { passive: true });
  el.addEventListener('wheel', () => { byUser = true; }, { passive: true });
  el.addEventListener('pointerdown', () => { byUser = true; }, { passive: true });
  return list;
}

// One wheel notch per call toward top line i of the game's list ctl (call it from the screen's update, every frame,
// until ctl.topLine === i): the game scrolls its own rows, which the engine keeps drawing under the DOM.
export function wheelTo(api, ctl, i, gp) {
  const at = ctl.topLine ?? ctl.top ?? 0;
  if (at !== i) api.wheel(ctl.id, i > at ? 120 : -120, gp);
}
