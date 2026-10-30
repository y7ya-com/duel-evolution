// The engine's scroll bars, native (owner: "pls remove the original scrollbars just use native scrolls everywhere").
// Every shown CWindowTaskScrollBase (the arrows, three-piece thumb and track) in a window no HTML screen owns goes into
// the hide table (its sprites are its children) and a native overflow box takes its place over the bar's own rect: the
// browser's scroll bar, wheel, drag and touch. Scrolling the box sets the bar's value through the game's own setValue
// (htmlui.c Q_SETVALUE; the window is told, as when the thumb is dragged), and the game moving its list (the wheel over
// its rows, a search) moves the box. A window an HTML screen owns scrolls its own way (controls/scroll.js scrollList).
import { inject } from './controls/scroll.js';

const PARKED = 9999;

// clip: bridge.js's clip(rects, box) (overlapping holes merged)
export function engineBars(clip) {
  inject();
  const layer = document.createElement('div');
  layer.id = 'htmlui-bars';
  Object.assign(layer.style, { position: 'fixed', left: 0, top: 0, width: '1024px', height: '768px', transformOrigin: '0 0',
    pointerEvents: 'none', zIndex: 4 });   // under the HTML host (5): an HTML window in front covers a bar
  const live = new Map();   // bar id -> { el, inner, at (the value the box shows), want (the value sent), wantFrames }

  // the engine's value v as the box's scroll offset, and back
  const range = (b, h) => h ? b.el.scrollWidth - b.el.clientWidth : b.el.scrollHeight - b.el.clientHeight;
  const toPos = (b, v) => b.max ? v / b.max * range(b, b.h) : 0;
  const toValue = b => { const r = range(b, b.h); return r > 0 ? Math.round((b.h ? b.el.scrollLeft : b.el.scrollTop) / r * b.max) : 0; };

  // the bars to hide this frame; setValue(id, v) queues the game's setValue
  function update(snap, owned, setValue) {
    const wins = [...snap.windows, ...snap.tasks || []], seen = [];
    wins.forEach((w, i) => {
      if (owned.has(w.id) || !w.shown) return;
      for (const c of w.controls) {
        if (c.thumb === undefined || !c.shown || c.max <= 0 || Math.max(c.wx, c.wy) >= PARKED) continue;
        seen.push(c.id);
        let b = live.get(c.id);
        if (!b) {
          b = { el: document.createElement('div'), inner: document.createElement('div'), at: -1, want: null, wantFrames: 0 };
          b.el.className = 'yo2-scroll-list';
          b.el.append(b.inner);
          b.el.addEventListener('scroll', () => {
            const v = toValue(b);
            if (v === b.at) return;   // our own move to the game's value
            b.at = b.want = v;
            b.wantFrames = 0;
            setValue(c.id, v);
          }, { passive: true });
          layer.append(b.el);
          live.set(c.id, b);
        }
        b.h = c.horizontal;
        b.max = c.max;
        const page = Math.max(1, c.page || 1), len = c.length, along = len * (c.max + page) / page;
        Object.assign(b.el.style, { left: c.wx + 'px', top: c.wy + 'px', width: c.w + 'px', height: c.h + 'px',
          overflowX: b.h ? 'scroll' : 'hidden', overflowY: b.h ? 'hidden' : 'scroll',
          clipPath: clip(front(w, i, wins), { x: c.wx, y: c.wy, w: c.w, h: c.h }) });
        Object.assign(b.inner.style, b.h ? { width: along + 'px', height: '1px' } : { width: '1px', height: along + 'px' });
        // the game's value moves the box, except while it is still taking the one the player scrolled to
        if (b.want !== null && (c.value === b.want || ++b.wantFrames > 10)) b.want = null;
        if (b.want === null && c.value !== b.at) {
          b.at = c.value;
          b.el[b.h ? 'scrollLeft' : 'scrollTop'] = toPos(b, c.value);
        }
      }
    });
    const keep = new Set(seen);
    for (const [id, b] of live) if (!keep.has(id)) { b.el.remove(); live.delete(id); }
    return seen;
  }
  return { layer, update, clear() { for (const b of live.values()) b.el.remove(); live.clear(); } };
}

// the rects of the shown windows in front of window w (bridge.js holes()' order: window z, then drawn depth, then list
// order), HTML-drawn ones too: their clicks are theirs
function front(w, i, wins) {
  const ahead = (o, j) => o.z !== w.z ? o.z > w.z : o.wz && w.wz && o.wz !== w.wz ? o.wz > w.wz : j > i;
  return wins.filter((o, j) => o !== w && o.shown && ahead(o, j)).map(o => o.drawn === undefined ? o : o.drawn).filter(Boolean);
}
