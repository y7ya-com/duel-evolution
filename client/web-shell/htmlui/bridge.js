// The HTML UI bridge (CONTRACT.md): at every Present (Module.onYo2Frame, recomp/ovr/htmlui.c) read the game's window
// tree (read.js), draw the windows it owns in a DOM layer over the canvas (screens/*.js, else controls/basic.js), and
// tell the game not to draw them (the hide/pass tables htmlui.c reads in CElement::onMain).
// Kill switches: ?HTML_UI=0 | all | A,B (only those) | -A,-B (the defaults without those); defaults: htmlui.json
// ({"on": [...]}). The game cursor is the browser's own (cursor.js) on every screen unless htmlui.json has
// "cursor": false or the page ?HTML_CURSOR=0 (then the engine draws it, under any HTML window). Live: yo2Html.toggle(cls). Off = the engine draws it again from the next frame.
// vtables.js is generated from include/yo2 (the snippet is in the htmlui-bridge commit that added it).
import { read, extend } from './read.js';
import { renderControl, syncWindow } from './controls/basic.js';
import { loadGlyphs } from '../ui.js';
import { cursorCss } from './cursor.js';

const SCREENS = ['select', 'avatar', 'lobby', 'chat', 'social', 'deck', 'shop', 'trade', 'duel'];
const SLOTS = 63;

export async function loadScreens(base = new URL('./screens/', import.meta.url)) {
  for (const n of SCREENS) {   // read/<group>.js: a screen group's reader extension (read.js extend), if it has one
    const m = await import(new URL(`../read/${n}.js`, base)).catch(() => null);
    if (m?.default) extend(m.default);
  }
  const by = new Map();
  for (const n of SCREENS) {
    const m = await import(new URL(n + '.js', base)).catch(() => null);
    for (const c of m?.default?.classes || []) by.set(c, m.default);
  }
  return by;
}

export function switches(spec, defaults = []) {
  if (spec === '0') return () => false;
  if (spec === 'all') return () => true;
  const parts = (spec || '').split(',').filter(Boolean);
  if (parts.length && parts.every(p => !p.startsWith('-'))) { const s = new Set(parts); return c => s.has(c); }
  const s = new Set(defaults);
  parts.forEach(p => s.delete(p.slice(1)));
  return c => s.has(c);
}

const CSS = `#htmlui-host { position: fixed; left: 0; top: 0; width: 1024px; height: 768px; transform-origin: 0 0;
  pointer-events: none; z-index: 5; }
#htmlui-host .win { position: absolute; overflow: hidden; }
#htmlui-host .sp, #htmlui-host .tx, #htmlui-host .btn, #htmlui-host .chk, #htmlui-host .field, #htmlui-host .layer,
#htmlui-host .frame { position: absolute; display: block; }
#htmlui-host .frame, #htmlui-host .layer { left: 0; top: 0; }
#htmlui-host .sp { overflow: hidden; }
#htmlui-host .sp > b { position: absolute; display: block; left: 0; top: 0; background-repeat: no-repeat;
  mask-repeat: no-repeat; transform-origin: 0 0; }
#htmlui-host .native { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0; border: 0; opacity: 0; }
#htmlui-host button.btn { margin: 0; padding: 0; border: 0; background: none; font: inherit; color: inherit; }
#htmlui-host .txt { position: absolute; }
`;
// the game cursor (cursor.js) on every element: its own rule, so the cursor never needs the layer
const CURSOR_CSS = 'html.yo2c, html.yo2c * { cursor: var(--yo2-cursor) !important; }';

// The DOM side, shared by the game and mock.html: one root per owned window, back to front. art: the ui/ atlases
// and glyphs (R2; never in git).
export async function makeLayer(host, screens, art = 'ui/') {
  await loadGlyphs(art);   // the atlases (its glyphs are for the pixel-exact pages; the HTML UI's text is DOM text)
  if (!document.getElementById('htmlui-css')) {
    const st = document.createElement('style');
    st.id = 'htmlui-css';
    st.textContent = CSS;
    document.head.append(st);
  }
  const layer = document.createElement('div');
  layer.id = 'htmlui';
  host.append(layer);
  const live = new Map();   // window id -> { root, mod, state, json, prev }
  function render(snap, owned, api) {
    const seen = new Set();
    for (const w of [...snap.windows, ...snap.tasks || []]) {   // windows, then claimed non-window tasks (the shop)
      if (!owned.has(w.id)) continue;
      seen.add(w.id);
      let e = live.get(w.id);
      const mod = screens.get(w.cls);
      if (e && e.cls !== w.cls) { unmount(w.id); e = null; }   // the address was reused
      if (!e) {
        const root = document.createElement('div');
        root.className = 'win';
        // keys typed into an owned window's DOM (its <input>, its buttons) are not the game's too: SDL listens on
        // window in the bubbling phase
        for (const t of ['keydown', 'keyup', 'keypress']) root.addEventListener(t, ev => ev.stopPropagation());
        e = { root, mod, cls: w.cls, json: '' };
        live.set(w.id, e);
      }
      if (layer.children[seen.size - 1] !== e.root) layer.insertBefore(e.root, layer.children[seen.size - 1] || null);   // DOM order = draw order
      Object.assign(e.root.style, {
        left: w.x + 'px', top: w.y + 'px', width: w.w + 'px', height: w.h + 'px', opacity: w.alpha ?? 1,
        visibility: w.shown ? '' : 'hidden', pointerEvents: mod?.mode === 'owned' ? 'auto' : 'none',
        overflow: mod?.clip === false ? 'visible' : '',   // windows whose controls sit outside their rect (the deck)
        clipPath: holes(w, snap.windows, owned),
      });
      const json = JSON.stringify(w.controls);
      if (json === e.json) continue;
      e.json = json;
      const a = e.api ||= { ...api, owned: mod?.mode === 'owned' };
      a.renderControl = (c, el, opts) => renderControl(c, el, a, opts);
      a.syncWindow = (root, win, st) => syncWindow(root, win, st, a);
      if (mod) {
        if (!e.mounted) { e.state = mod.mount(w, e.root, a); e.mounted = true; }
        mod.update?.(w, e.prev, e.root, a, e.state);
      } else syncWindow(e.root, w, e.st ||= new Map(), a);
      e.prev = w;
    }
    for (const id of [...live.keys()]) if (!seen.has(id)) unmount(id);
  }
  function unmount(id) {
    const e = live.get(id);
    e.mod?.unmount?.(e.root, e.state);
    e.root.remove();
    live.delete(id);
  }
  return { layer, render };
}

// An engine-drawn window in front of an HTML one shows through a hole in it (the DOM is always over the canvas).
function holes(w, wins, owned) {
  const front = wins.slice(wins.indexOf(w) + 1).filter(o => o.shown && !owned.has(o.id) &&
    o.x < w.x + w.w && o.x + o.w > w.x && o.y < w.y + w.h && o.y + o.h > w.y);
  if (!front.length) return '';
  const r = o => `M${o.x - w.x} ${o.y - w.y}h${o.w}v${o.h}h${-o.w}z`;
  return `path(evenodd, "M0 0h${w.w}v${w.h}h${-w.w}z${front.map(r).join('')}")`;
}

// The game side: start(Module) once the runtime exists (web-shell injects bridge.js as a module after loader.js).
export async function start(Module, { canvas = document.getElementById('canvas'), spec = new URLSearchParams(location.search).get('HTML_UI') } = {}) {
  const defaults = await fetch(new URL('htmlui.json', location.href)).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  let on = switches(spec, defaults.on || []);
  let cursorOn = defaults.cursor !== false && new URLSearchParams(location.search).get('HTML_CURSOR') !== '0';
  const forced = new Map();   // yo2Html.toggle overrides
  const st = document.createElement('style');
  st.textContent = CURSOR_CSS;
  document.head.append(st);
  // The layer (screens, atlases, the host) loads only once the switches want a window or task the game shows: a page
  // with htmlui.json off for every class loads none of it (it used to block every boot on the atlases)
  let screens = new Map(), host = null, render = null, loading = null;
  const init = () => loading ||= (async () => {
    screens = await loadScreens();
    host = document.createElement('div');
    host.id = 'htmlui-host';
    document.body.append(host);
    ({ render } = await makeLayer(host, screens));
    place();
  })().catch(e => console.warn('htmlui', e));
  // ponytail: the sprites keep the 1x half-texel shift at any scale: the engine renders at 1x and the browser
  // upscales its canvas, so 0.5 game px IS its shift (a 0.5 / dpr shift misaligned the art: 2x flip 95 % -> 73 %)
  let stageScale = 1;
  const place = () => {
    const r = canvas.getBoundingClientRect(), s = stageScale = r.width / 1024 || 1;
    if (host) Object.assign(host.style, { left: r.left + 'px', top: r.top + 'px', transform: `scale(${s})` });
  };
  new ResizeObserver(place).observe(canvas);
  addEventListener('resize', place);
  place();

  let scene = 0, frameNo = 0, dv = null, H32 = null, last = null, wantParts = new Set(), isolate = null, curHid = false;
  Module.onYo2Scene = (kind, from, to) => { scene = to; };   // adds a listener (lazyfs.js / loader.js)

  // Owned-mode input. Mouse: real canvas events at the control, as a player's mouse (the game polls the mouse in its
  // controls' onMain, and drops a press that comes in the same frame as the move). Keys, characters and text: queued
  // into the tables, played by htmlui.c at the next Present through the factory's dispatch / the control's setText.
  const queue = [], waiters = [];
  const frames = n => new Promise(r => waiters.push([frameNo + n, r]));
  const at = id => {   // a control's centre in client pixels
    for (const w of last?.windows || []) for (const c of w.controls) if (c.id === id) {
      const r = canvas.getBoundingClientRect(), k = r.width / 1024;
      return [r.left + (w.x + c.x + c.w / 2) * k, r.top + (w.y + c.y + c.h / 2) * k];
    }
    return null;
  };
  const fire = (type, [x, y], extra = {}) => canvas.dispatchEvent(new (type === 'wheel' ? WheelEvent : MouseEvent)(type,
    { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'mousedown' ? 1 : 0, ...extra }));
  const api = {
    async click(id) {
      const p = at(id);
      if (!p) return false;
      fire('mousemove', p); await frames(2);
      fire('mousedown', p); await frames(2);
      fire('mouseup', p); return true;
    },
    hover(id) { const p = at(id); if (p) fire('mousemove', p); return !!p; },
    wheel(id, delta) { const p = at(id); if (p) fire('wheel', p, { deltaY: delta, deltaMode: 0 }); return !!p; },
    key(vk, down = true) { queue.push([1, down ? 0x100 : 0x101, vk, 0]); },   // WM_KEYDOWN / WM_KEYUP
    char(code) { queue.push([1, 0x102, code, 0]); },                         // WM_CHAR
    setText(id, s) { queue.push([2, id, String(s)]); },
    scroll() { console.warn('htmlui: api.scroll is not wired yet (use api.wheel)'); },
  };
  const QBASE = 2 + 2 * SLOTS, QN = 32, TEXT = 1024;   // htmlui.c HtmlUiTables: nq, q[32] {kind, a, b, c}, text[1024]
  function flush(t, H) {
    if (!queue.length || H[t + QBASE]) return;   // the last batch not played yet
    const T = new Uint16Array(H.buffer, (t + QBASE + 1 + 4 * QN) * 4, TEXT);
    let n = 0, used = 0;
    while (queue.length && n < QN) {
      const [kind, a, b, c] = queue[0], o = t + QBASE + 1 + 4 * n;
      if (kind === 2) {
        if (used + b.length > TEXT) break;
        for (let i = 0; i < b.length; i++) T[used + i] = b.charCodeAt(i);
        H[o] = 2; H[o + 1] = a; H[o + 2] = used; H[o + 3] = b.length; used += b.length;
      } else { H[o] = kind; H[o + 1] = a; H[o + 2] = b; H[o + 3] = c; }
      queue.shift(); n++;
    }
    H[t + QBASE] = n;
  }
  let cursorNow = null;
  const setCursor = v => {   // the CSS cursor on every element (html.yo2c *), or none of ours (null)
    if (v === cursorNow) return;
    cursorNow = v;
    document.documentElement.classList.toggle('yo2c', v !== null);
    if (v !== null) document.documentElement.style.setProperty('--yo2-cursor', v);
  };
  let failed = 0;
  // never throws: this runs inside the game's Present, where an exception is a crash
  Module.onYo2Frame = (tables, heap) => {
    try { frame(tables, heap); } catch (e) { if (failed++ < 5) console.warn('htmlui: frame failed', e); }
  };
  function frame(tables, heap) {
    if (!dv || dv.buffer !== heap.buffer) dv = new DataView(heap.buffer), H32 = new Uint32Array(heap.buffer);
    const snap = read(dv, ++frameNo, scene, { parts: wantParts });
    last = snap;
    const want = c => forced.has(c) ? forced.get(c) : on(c);
    // windows and non-window tasks (snapshot.tasks: the shop) a screen claims and the switches allow
    if (!render && [...snap.windows, ...snap.tasks].some(w => want(w.cls))) init();
    const all = [...snap.windows, ...snap.tasks.filter(t => screens.has(t.cls))];
    const owned = new Set(render ? all.filter(w => want(w.cls)).slice(-SLOTS).map(w => w.id) : []);
    wantParts = new Set(all.filter(w => owned.has(w.id) && screens.get(w.cls)?.parts).map(w => w.id));
    // isolate (the flip test): everything but one window hidden, so both captures have the same (empty) backdrop.
    // The window's top CTask ancestor goes into the hide table; an engine-drawn window passes (the nearest listed
    // ancestor decides in htmlui.c), an HTML-drawn one stays hidden with the rest.
    const extraHide = [], extraPass = [];
    const iso = isolate && snap.windows.find(w => w.cls === isolate);
    if (iso) {
      let r = iso.id;
      for (let d = 0, p; d < 64 && (p = dv.getUint32(r + 8, true)); d++) r = p;   // CTask parent_
      extraHide.push(r);
      if (!owned.has(iso.id)) extraPass.push(iso.id);
    }
    // the cursor (cursor.js): the browser draws it as a CSS cursor, the engine's (that one CMouseManager element) is
    // hidden. The table takes effect at the next frame, so when the CSS one stops it stays up one more frame (the
    // engine's is still hidden in it): never a frame without a cursor
    const css = cursorOn ? cursorCss(snap.cursor, 'ui/', stageScale, devicePixelRatio) : null;
    if (css !== null) setCursor(css); else if (!curHid) setCursor(null);
    curHid = css !== null;
    if (iso && !curHid && snap.cursor) extraPass.push(snap.cursor.id);   // isolate keeps an engine-drawn cursor
    const t = tables >>> 2, H = H32, ids = [...(curHid ? [snap.cursor.id] : []), ...owned, ...extraHide].slice(0, SLOTS);
    H[t] = ids.length;
    ids.forEach((id, i) => { H[t + 1 + i] = id; });
    flush(t, H);
    render?.(snap, owned, api);
    // after render: a screen's passthrough may use what its update just worked out
    const pass = [...extraPass];
    for (const w of all) {
      const mod = screens.get(w.cls);
      if (!owned.has(w.id) || !mod?.passthrough) continue;
      for (const c of [...w.controls, ...w.extras]) {
        if (mod.passthrough(c)) pass.push(c.id);
        for (const q of [...c.parts?.sprites || [], ...c.parts?.labels || [], ...c.parts?.swfs || []]) if (mod.passthrough(q, c)) pass.push(q.id);
      }
    }
    H[t + 1 + SLOTS] = Math.min(pass.length, SLOTS);
    pass.slice(0, SLOTS).forEach((id, i) => { H[t + 2 + SLOTS + i] = id; });
    for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i][0] <= frameNo) waiters.splice(i, 1)[0][1]();
  }

  return window.yo2Html = {
    snapshot: () => last,
    toggle(cls, v) { forced.set(cls, v ?? !(forced.has(cls) ? forced.get(cls) : on(cls))); return forced.get(cls); },
    set(spec2) { on = switches(spec2, defaults.on || []); forced.clear(); },
    isolate(cls) { isolate = cls || null; },   // the flip test: only this window drawn (engine or DOM), on an empty canvas
    cursor(v) { cursorOn = v ?? !cursorOn; return cursorOn; },   // the CSS cursor (true) or the engine's (false)
    cursorCss: () => cursorNow,
  };
}
