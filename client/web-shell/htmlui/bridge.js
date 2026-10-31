// The HTML UI bridge (CONTRACT.md): at every Present (Module.onYo2Frame, recomp/ovr/htmlui.c) read the game's window
// tree (read.js), draw the windows it owns in a DOM layer over the canvas (screens/*.js, else controls/basic.js), and
// tell the game not to draw them (the hide/pass tables htmlui.c reads in CElement::onMain).
// Kill switches: ?HTML_UI=0 | all | A,B (only those) | -A,-B (the defaults without those); defaults: htmlui.json
// ({"on": [...]}). The game cursor is the browser's own (cursor.js) on every screen unless htmlui.json has
// "cursor": false or the page ?HTML_CURSOR=0 (then the engine draws it, under any HTML window). The engine's scroll bars
// are native boxes (scrollbars.js) unless htmlui.json has "scrollbars": false or the page ?HTML_SCROLL=0.
// Live: yo2Html.toggle(cls). Off = the engine draws it again from the next frame.
// vtables.js is generated from include/yo2 (the snippet is in the htmlui-bridge commit that added it).
import { read, extend } from './read.js';
import { renderControl, syncWindow } from './controls/basic.js';
import { loadGlyphs } from '../ui.js';
import { cursorCss, ripple } from './cursor.js';
import { engineBars } from './scrollbars.js';
import { modernUi } from './modern.js';

const SCREENS = ['select', 'avatar', 'lobby', 'chat', 'social', 'deck', 'shop', 'trade', 'duel'];
let SLOTS = 63;   // the runtime's table size: htmlui.c passes it (255), an older runtime doesn't (63)

// svelte(group): a screen group whose Svelte build (gen/<group>.js, npm run build) takes its classes over the plain
// screens/<group>.js (htmlui.json "svelte" / ?HTML_SVELTE=, switches() syntax by group name: deck, chat ...; none by
// default until the group's flip pairs match). No build there: the plain module stays.
export async function loadScreens(base = new URL('./screens/', import.meta.url), svelte = () => false) {
  for (const n of SCREENS) {   // read/<group>.js: a screen group's reader extension (read.js extend), if it has one
    const m = await import(new URL(`../read/${n}.js`, base)).catch(() => null);
    if (m?.default) extend(m.default);
  }
  const by = new Map();
  for (const n of SCREENS) {
    const m = await import(new URL(n + '.js', base)).catch(() => null);
    for (const c of m?.default?.classes || []) by.set(c, m.default);
    const s = svelte(n) && await import(new URL(`../gen/${n}.js`, base)).catch(e => console.warn('htmlui svelte', n, e));
    for (const c of s?.default?.classes || []) by.set(c, s.default);
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
#htmlui-host .win { position: absolute; overflow: hidden; isolation: isolate; }
#htmlui-host .sp, #htmlui-host .tx, #htmlui-host .btn, #htmlui-host .chk, #htmlui-host .field, #htmlui-host .layer,
#htmlui-host .frame { position: absolute; display: block; }
#htmlui-host .frame, #htmlui-host .layer { left: 0; top: 0; }
#htmlui-host .sp { overflow: hidden; }
#htmlui-host .sp > b { position: absolute; display: block; left: 0; top: 0; background-repeat: no-repeat;
  mask-repeat: no-repeat; transform-origin: 0 0; }
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
  // a screen's backdrop (its scene's own pictures and title, not in any window: the deck editor's) under every window
  const back = document.createElement('div'), layer = document.createElement('div');
  back.className = 'layer';
  layer.id = 'htmlui';
  host.append(back, layer);
  const live = new Map();   // window id -> { root, mod, state, json, prev }
  function render(snap, owned, api) {
    const seen = new Set();
    // windows back to front as the engine draws them (drawOrder), then claimed non-window tasks (the shop). Each root is
    // one stacking context (.win isolation): nothing a screen stacks inside its window (chat.js's z-indexed layers)
    // reaches above another window
    for (const w of [...drawOrder(snap.windows), ...snap.tasks || []]) {
      if (!owned.has(w.id)) continue;
      seen.add(w.id);
      let e = live.get(w.id);
      const mod = screens.get(w.cls);
      // the address was reused, or another screen took the class (Modern UI switched)
      if (e && (e.cls !== w.cls || e.mod !== mod)) { unmount(w.id); e = null; }
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
      // the whole window, not its controls only: its extras fade (the deck's file-list header: 0.8 then 1) and a read
      // extension's fields change with no control changing
      const json = JSON.stringify(w);
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
    // backdrop(win, el, api, state): the first owned window or task whose module has one draws into the layer under
    // every window (its DOM kept between frames); none: the layer is cleared
    const bw = [...snap.windows, ...snap.tasks || []].find(w => owned.has(w.id) && screens.get(w.cls)?.backdrop);
    if (bw) {
      screens.get(bw.cls).backdrop(bw, back, live.get(bw.id)?.api || api, live.get(bw.id)?.state, snap);
      // every engine-drawn window draws above the backdrop (the lowest layer): cut where each one draws (the deck's
      // Save / Load lists and its Yes / No and OK dialogs)
      const cut = clip(snap.windows.filter(o => o.shown && !owned.has(o.id)).map(o => o.drawn === undefined ? o : o.drawn).filter(Boolean),
        { x: 0, y: 0, w: 1024, h: 768 });
      if (back.style.clipPath !== cut) back.style.clipPath = cut;
    } else if (back.firstChild) back.replaceChildren();
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
// In front: the larger window z (CWindowTaskModel z_ +0x34c: each window 50 above the one opened before it: the deck
// editor's Kaban 51153 < Deck 51203 < chat 51303 < its Save list 51353 < the "saved" box 51553), then the frontmost
// drawn control's world z, then the list's order. Not the controls' depth alone: one deep control (a trunk row's
// parts, a dragged card) made a window look in front of a dialog over it. The hole is where that window draws (its
// drawn box), never its nominal rect; a window that draws nothing cuts none.
// o (at j in the list) in front of w (at i)
const ahead = (o, j, w, i) => o.z !== w.z ? o.z > w.z : o.wz && w.wz && o.wz !== w.wz ? o.wz > w.wz : j > i;
// the windows back to front by that rule (the DOM order of their roots; the engine's own list order is only the tie)
export function drawOrder(wins) {
  return wins.map((w, i) => [w, i]).sort(([a, i], [b, j]) => ahead(a, i, b, j) ? 1 : ahead(b, j, a, i) ? -1 : 0).map(([w]) => w);
}
function holes(w, wins, owned) {
  const i = wins.indexOf(w);
  const front = wins.filter((o, j) => o !== w && o.shown && !owned.has(o.id) && ahead(o, j, w, i))
    .map(o => o.drawn === undefined ? o : o.drawn).filter(o => o &&
      o.x < w.x + w.w && o.x + o.w > w.x && o.y < w.y + w.h && o.y + o.h > w.y);
  return clip(front, w);
}

// A clip-path for box (its own coordinates from box.x, box.y) with holes where rects lie (game px). Overlapping rects
// are merged first (into their bounding box, until none overlap): under evenodd two overlapping holes cancel.
function clip(rects, box) {
  const rs = rects.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h }));
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < rs.length && !merged; i++) for (let j = i + 1; j < rs.length; j++) if (hit(rs[i], rs[j])) {
      const a = rs[i], b = rs.splice(j, 1)[0], x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      rs[i] = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
      merged = true;
      break;
    }
  }
  const inside = rs.filter(o => hit(o, box));
  if (!inside.length) return '';
  const r = o => `M${o.x - box.x} ${o.y - box.y}h${o.w}v${o.h}h${-o.w}z`;
  return `path(evenodd, "M0 0h${box.w}v${box.h}h${-box.w}z${inside.map(r).join('')}")`;
}

// The game side: start(Module) once the runtime exists (web-shell injects bridge.js as a module after loader.js).
export async function start(Module, { canvas = document.getElementById('canvas'), spec = new URLSearchParams(location.search).get('HTML_UI') } = {}) {
  const defaults = await fetch(new URL('htmlui.json', location.href)).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  let on = switches(spec, defaults.on || []);
  let cursorOn = defaults.cursor !== false && new URLSearchParams(location.search).get('HTML_CURSOR') !== '0';
  let barsOn = defaults.scrollbars !== false && new URLSearchParams(location.search).get('HTML_SCROLL') !== '0';
  const forced = new Map();   // yo2Html.toggle overrides
  const st = document.createElement('style');
  st.textContent = CURSOR_CSS;
  document.head.append(st);
  // The layer (screens, atlases, the host) loads only once the switches want a window or task the game shows: a page
  // with htmlui.json off for every class loads none of it (it used to block every boot on the atlases)
  // Modern UI (modern.js): its screens over the legacy ones while on; screens.get / has ask it first
  const mu = modernUi({ defaults, canvas });
  let legacy = new Map(), host = null, render = null, loading = null;
  const screens = { get: c => (mu.active() && mu.mods.get(c)) || legacy.get(c), has: c => !!screens.get(c) };
  const init = () => loading ||= (async () => {
    legacy = await loadScreens(undefined, switches(new URLSearchParams(location.search).get('HTML_SVELTE'), defaults.svelte || []));
    host = document.createElement('div');
    host.id = 'htmlui-host';
    document.body.append(host);
    ({ render } = await makeLayer(host, screens));
    place();
  })().catch(e => console.warn('htmlui', e));
  // ponytail: the sprites keep the 1x half-texel shift at any scale: the engine renders at 1x and the browser
  // upscales its canvas, so 0.5 game px IS its shift (a 0.5 / dpr shift misaligned the art: 2x flip 95 % -> 73 %)
  // the click ripple (cursor.js ripple()): the game's sprites at its positions, in a layer over everything, so the CSS
  // cursor holds the hand only and never swaps image during a click
  const fx = document.createElement('div');
  Object.assign(fx.style, { position: 'fixed', left: 0, top: 0, width: '1024px', height: '768px', transformOrigin: '0 0',
    pointerEvents: 'none', zIndex: 2147483646 });
  document.body.append(fx);
  const fxEls = [];
  const drawRipple = ss => {
    while (fxEls.length > ss.length) fxEls.pop().remove();
    ss.forEach((s, i) => {
      let e = fxEls[i];
      if (!e) {
        e = fxEls[i] = document.createElement('div');
        Object.assign(e.style, { position: 'absolute', overflow: 'hidden' });
        e.append(Object.assign(document.createElement('img'), { decoding: 'async', alt: '' }));
        Object.assign(e.firstChild.style, { position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', maxWidth: 'none' });
        fx.append(e);
      }
      const [sx, sy, sw, sh] = s.src, src = 'ui/' + s.tex.slice(s.tex.lastIndexOf('/') + 1).toLowerCase();
      Object.assign(e.style, { left: s.wx + 'px', top: s.wy + 'px', width: sw * s.wsx + 'px', height: sh * s.wsy + 'px', opacity: s.a });
      if (e.firstChild.getAttribute('src') !== src) e.firstChild.src = src;
      e.firstChild.style.transform = `scale(${s.wsx}, ${s.wsy}) translate(${-sx}px, ${-sy}px)`;
    });
  };
  const bars = engineBars(clip);
  document.body.append(bars.layer);
  let stageScale = 1;
  const place = () => {
    const r = canvas.getBoundingClientRect(), s = stageScale = r.width / 1024 || 1;
    for (const el of [host, fx, bars.layer, mu.layer]) if (el) Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px', transform: `scale(${s})` });
  };
  new ResizeObserver(place).observe(canvas);
  addEventListener('resize', place);
  place();

  let scene = 0, frameNo = 0, dv = null, H32 = null, last = null, wantParts = new Set(), isolate = null, curHid = false;
  // a scene load: from its "begin" to the first frame the engine presents after its "end" (lazyfs.js / loader.js:
  // assigning adds a listener)
  let switching = false, endFrame = 0;
  Module.onYo2Scene = (kind, from, to) => {
    scene = to; switching = kind === 'begin';
    if (switching) { if (host) host.hidden = true; bars.layer.hidden = true; } else endFrame = frameNo;   // hidden at once, not at the next Present
  };

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
    // gp: a game point [x, y] to aim at instead of the control's centre (a list whose rect reads 0 x 0, the trunk), with a
    // mousemove there first: the game scrolls a list only under its own mouse
    wheel(id, delta, gp) {
      const r = canvas.getBoundingClientRect(), k = r.width / 1024, p = gp ? [r.left + gp[0] * k, r.top + gp[1] * k] : at(id);
      if (!p) return false;
      if (gp) fire('mousemove', p);
      fire('wheel', p, { deltaY: delta, deltaMode: 0 });
      return true;
    },
    key(vk, down = true) { queue.push([1, down ? 0x100 : 0x101, vk, 0]); },   // WM_KEYDOWN / WM_KEYUP
    char(code) { queue.push([1, 0x102, code, 0]); },                         // WM_CHAR
    setText(id, s) { queue.push([2, id, String(s)]); },
    // an engine scroll bar's value (its setValue: the window is told); its vtable rides along: htmlui.c skips a bar
    // freed since this snapshot
    setValue(id, v) { queue.push([3, id, v | 0, H32 ? H32[id >>> 2] : 0]); },
    scroll() { console.warn('htmlui: api.scroll is not wired yet (use api.wheel)'); },
  };
  const QN = 32, TEXT = 1024;   // htmlui.c HtmlUiTables: after the two tables nq, q[32] {kind, a, b, c}, text[1024]
  function flush(t, H) {
    const QBASE = 2 + 2 * SLOTS;
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
  // slots: the runtime's table size, after a header word that holds it (htmlui.c checks the word is still there: an
  // older bridge's layout would overwrite it); no slots: an older runtime, 63, no header
  Module.onYo2Frame = (tables, heap, slots) => {
    SLOTS = slots || 63;
    try { frame(slots ? tables + 4 : tables, heap); } catch (e) { if (failed++ < 5) console.warn('htmlui: frame failed', e); }
  };
  function frame(tables, heap) {
    if (!dv || dv.buffer !== heap.buffer) dv = new DataView(heap.buffer), H32 = new Uint32Array(heap.buffer);
    const snap = read(dv, ++frameNo, scene, { parts: wantParts });
    last = snap;
    const want = c => forced.has(c) ? forced.get(c) : (mu.active() && mu.mods.has(c)) || on(c);
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
    let css = cursorOn ? cursorCss(snap.cursor, 'ui/', stageScale, devicePixelRatio) : null;
    if (css === undefined) css = cursorNow;   // a state still building: the last cursor stays (the engine's, if none yet)
    if (css !== null) setCursor(css); else if (!curHid) setCursor(null);
    curHid = css !== null;
    drawRipple(curHid ? ripple(snap.cursor) : []);   // the engine draws it with the rest of the cursor otherwise
    if (iso && !curHid && snap.cursor) extraPass.push(snap.cursor.id);   // isolate keeps an engine-drawn cursor
    // hide(win, snap): a screen's other elements the engine must not draw (its scene's backdrop pieces), after its windows
    const modHide = all.filter(w => owned.has(w.id) && screens.get(w.cls)?.hide).flatMap(w => screens.get(w.cls).hide(w, snap) || []);
    // no HTML window before the scene is ready (owner: the chat came up while the place was still loading): the layer
    // stays hidden through a scene load and while the loader's box (#loading: the boot, a scene's "Loading...") is up,
    // and shows with the first frame the engine presents after the scene's end, as its own windows would
    const ld = document.getElementById('loading'), wait = switching || frameNo <= endFrame || (ld && ld.style.display !== 'none');
    // the engine's scroll bars (scrollbars.js): native boxes in their place, the engine's hidden; the engine's own
    // through a scene load
    const barIds = barsOn && !wait ? bars.update(snap, owned, api.setValue) : (bars.clear(), []);
    const t = tables >>> 2, H = H32, ids = [...(curHid ? [snap.cursor.id] : []), ...owned, ...extraHide, ...modHide, ...barIds].slice(0, SLOTS);
    H[t] = ids.length;
    ids.forEach((id, i) => { H[t + 1 + i] = id; });
    flush(t, H);
    if (host && host.hidden !== wait) host.hidden = wait;
    if (bars.layer.hidden !== wait) bars.layer.hidden = wait;
    render?.(snap, owned, api);
    mu.frame(snap, scene, wait);
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
    scrollbars(v) { barsOn = v ?? !barsOn; return barsOn; },   // native boxes for the engine's scroll bars, or the engine's
    modern(v) { return mu.set(v ?? !mu.on()); },   // Modern UI on / off (remembered), as the title page's switch
  };
}
