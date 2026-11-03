// Modern UI: Duel Evolution's 2026 skin, a second set of screens (svelte/modern.js -> gen/modern.js) picked over the
// legacy ones while it is on. Legacy is the default. Players see it as the "Legacy UI" switch (owner): on = the
// original UI, off = the Modern UI, on until a player turns it off. It is on the title page (it applies at once, no
// reload, and is remembered per browser) and in the modern Main Menu's System group. The code keeps "modern" (on = Modern UI):
//   on:   ?LEGACY_UI=0 | 1 or ?MODERN_UI=1 | 0 (this page only), else localStorage "yo2.modernUI" === "1"
//   kill: htmlui.json "modern": false (no switch, never on)
//   live: yo2Html.modern(true | false)
// The title scene's menu is the title movie's own buttons, not a window: in modern mode the engine stops drawing them
// (hide(): the hide table; they still take the clicks), and a DOM menu stands in their place and plays the same clicks
// on the canvas (the buttons' centres below). Everything else goes through the window screens.
const KEY = 'yo2.modernUI';
// the title scene's four buttons (scene 4, game px): their centres, as the engine lays them out
const TITLE = [['ONLINE', 512, 458], ['OPTIONS', 512, 505], ['DECK EDITOR', 512, 552], ['FREE DUEL', 512, 600]];

export function modernUi({ defaults = {}, canvas, query = new URLSearchParams(location.search) }) {
  const killed = defaults.modern === false;
  const q = query.get('MODERN_UI'), lq = query.get('LEGACY_UI');
  let on = !killed && (lq != null ? lq !== '1' : q != null ? q === '1' : (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })());
  const mods = new Map();   // window class -> modern screen module
  let loading = null;
  const load = () => loading ||= import(new URL('./gen/modern.js', import.meta.url))
    .then(m => { for (const s of m.default?.screens || [m.default]) for (const c of s?.classes || []) mods.set(c, s); })
    .catch(e => console.warn('htmlui modern', e));
  if (on) load();
  let duelSnap = null, caught = false;
  const selected = id => { globalThis.__yo2ModernCardSelection = id; globalThis.dispatchEvent?.(new CustomEvent('yo2-card-actions', { detail: id })); };
  const inside = (p, x, y) => p && Math.abs(x - p.x) <= p.w / 2 && Math.abs(y - p.y) <= p.h / 2;
  globalThis.addEventListener?.('mousedown', e => {
    if (!e.isTrusted || !on || duelSnap?.scene !== 28 || e.button !== 0) return;
    if (e.target.closest?.('[role="menu"]')) return;
    selected(0);
    if (e.target !== canvas) return;
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * 1024 / r.width, y = (e.clientY - r.top) * 768 / r.height;
    const menu = duelSnap.windows.find(w => w.shown && w.commandPoint);
    const card = (duelSnap.duelCards || []).find(c => inside(c, x, y));
    if (card || inside(menu?.commandPoint, x, y)) {
      selected(card?.id || menu.commandPointer); caught = true; e.preventDefault(); e.stopImmediatePropagation();
    } else if (menu && x >= menu.x && x < menu.x + menu.w && y >= menu.y && y < menu.y + menu.h) {
      caught = true; e.preventDefault(); e.stopImmediatePropagation(); // a hidden native hover-menu must never choose an action
    }
  }, true);
  globalThis.addEventListener?.('mouseup', e => { if (caught && e.isTrusted) { caught = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  globalThis.addEventListener?.('keydown', e => { if (on && duelSnap?.scene === 28 && e.key === 'Escape') selected(0); }, true);

  // html.mu-modern while it is on: pages outside the window screens (the Audio page) take the modern look from it
  const mark = () => document.documentElement?.classList.toggle('mu-modern', on && !killed);
  mark();

  // the layer over the canvas (placed and scaled with the bridge's): the title's switch and, modern, its menu
  const layer = document.createElement('div');
  layer.id = 'mu-title';
  layer.hidden = true;
  Object.assign(layer.style, { position: 'fixed', left: 0, top: 0, width: '1024px', height: '768px', transformOrigin: '0 0',
    pointerEvents: 'none', zIndex: 6 });
  if (!killed) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.append(st);
    document.body.append(layer);
  }
  layer.innerHTML = `
    <nav class="mu-tmenu" aria-label="Title menu">
      ${TITLE.map(([l], i) => `<button type="button" class="mu-tbtn${i ? '' : ' mu-tbtn-primary'}" data-i="${i}"><span class="mu-tfill"></span><span class="mu-tlbl">${l}</span></button>`).join('')}
    </nav>
    <label class="mu-switch"><input type="checkbox" role="switch"><span class="mu-track"><span class="mu-knob"></span></span>
      <span class="mu-switch-label">Legacy UI</span></label>
    <section class="mu-plate mu-guide" role="status" aria-live="polite" hidden><header class="mu-head"><h2>Your move</h2></header><p></p></section>
    <label class="mu-switch mu-ingame" hidden><input type="checkbox" role="switch" checked><span class="mu-track"><span class="mu-knob"></span></span>
      <span class="mu-switch-label">Legacy UI</span></label>`;
  const glows = document.createElement('div'); glows.className = 'mu-action-cards'; layer.append(glows);
  let glowSignature = '';
  const box = layer.querySelector('input'), menu = layer.querySelector('.mu-tmenu');

  // in game with the original UI: the same switch beside the original Main Menu while it is open (owner: "no way to
  // toggle Legacy UI off after turning it on"); off brings Modern UI back at once
  const ingame = layer.querySelector('.mu-ingame'), ingameBox = ingame.querySelector('input');
  // the duel's guide (read.js snapshot.duel.help: the duel waits on a field / hand click and says why, "Select a target";
  // no window carries it): a compact see-through banner over the field, the game's own words
  const guide = layer.querySelector('.mu-guide'), guideText = guide.querySelector('p');
  ingameBox.addEventListener('change', () => { if (!ingameBox.checked) set(true); ingameBox.checked = true; });
  const listeners = new Set();
  const set = v => {
    v = !!v && !killed;
    if (v === on) return on;
    on = v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
    if (on) load();
  let duelSnap = null, caught = false;
  const selected = id => { globalThis.__yo2ModernCardSelection = id; globalThis.dispatchEvent?.(new CustomEvent('yo2-card-actions', { detail: id })); };
  const inside = (p, x, y) => p && Math.abs(x - p.x) <= p.w / 2 && Math.abs(y - p.y) <= p.h / 2;
  globalThis.addEventListener?.('mousedown', e => {
    if (!e.isTrusted || !on || duelSnap?.scene !== 28 || e.button !== 0) return;
    if (e.target.closest?.('[role="menu"]')) return;
    selected(0);
    if (e.target !== canvas) return;
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * 1024 / r.width, y = (e.clientY - r.top) * 768 / r.height;
    const menu = duelSnap.windows.find(w => w.shown && w.commandPoint);
    const card = (duelSnap.duelCards || []).find(c => inside(c, x, y));
    if (card || inside(menu?.commandPoint, x, y)) {
      selected(card?.id || menu.commandPointer); caught = true; e.preventDefault(); e.stopImmediatePropagation();
    } else if (menu && x >= menu.x && x < menu.x + menu.w && y >= menu.y && y < menu.y + menu.h) {
      caught = true; e.preventDefault(); e.stopImmediatePropagation(); // a hidden native hover-menu must never choose an action
    }
  }, true);
  globalThis.addEventListener?.('mouseup', e => { if (caught && e.isTrusted) { caught = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  globalThis.addEventListener?.('keydown', e => { if (on && duelSnap?.scene === 28 && e.key === 'Escape') selected(0); }, true);

    box.checked = !on;
    mark();
    listeners.forEach(f => f(on));
    return on;
  };
  // the switch reads "Legacy UI": checked is the original UI
  box.checked = !on;
  box.addEventListener('change', () => set(!box.checked));
  // a title button: the same click on the canvas, at that button (move first: the engine takes a press only over a
  // button it has seen the mouse on)
  const fire = (type, x, y) => {
    const r = canvas.getBoundingClientRect(), k = r.width / 1024;
    canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: r.left + x * k, clientY: r.top + y * k,
      button: 0, buttons: type === 'mousedown' ? 1 : 0 }));
  };
  const nextFrame = () => {
    const before = globalThis.yo2Html?.snapshot?.()?.frame, until = performance.now() + 1000;
    return new Promise(resolve => {
      const check = () => globalThis.yo2Html?.snapshot?.()?.frame !== before || performance.now() > until ? resolve() : requestAnimationFrame(check);
      requestAnimationFrame(check);
    });
  };
  let busy = false;
  menu.addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b || busy) return;
    busy = true;
    const [, x, y] = TITLE[+b.dataset.i];
    fire('mousemove', x, y); await nextFrame();
    fire('mousedown', x, y); await nextFrame();
    fire('mouseup', x, y);
    busy = false;
  });
  // keyboard on the menu: up / down between the buttons
  menu.addEventListener('keydown', ev => {
    const bs = [...menu.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      bs[(i + (ev.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length].focus();
    }
    ev.stopPropagation();
  });
  layer.addEventListener('keydown', ev => ev.stopPropagation());
  for (const type of ['mousedown', 'mouseup', 'mousemove', 'dblclick']) layer.addEventListener(type, ev => ev.stopPropagation());

  return {
    killed,
    ready: () => load(),
    active: () => on && mods.size > 0,
    on: () => on,
    set,
    onChange: f => listeners.add(f),
    mods,
    layer,
    // the engine's title buttons, for the hide table while modern is on (the DOM menu stands in for them)
    hide: (snap, wait) => on ? (snap.title || []).map(b => b.id) : [],
    // each frame: the title layer shows on the title scene (4) once it is up, with no window over it (OPTIONS opens one)
    frame(snap, scene, wait) {
      duelSnap = snap;
      if (scene !== 28 && globalThis.__yo2ModernCardSelection) selected(0);
      const title = !killed && scene === 4 && !wait && !snap.windows.some(w => w.shown && w.drawn);
      // the original Main Menu open in game, the original UI on: the switch above it, at its left edge
      const mm = !killed && !on && !wait && scene !== 4 && snap.windows.find(w => w.cls === 'CMainMenu' && w.shown && w.drawn);
      if (ingame.hidden === !!mm) ingame.hidden = !mm;
      if (mm) { const d = mm.drawn || mm, l = `${d.x}px`, t = `${Math.max(4, d.y - 40)}px`; if (ingame.style.left !== l) ingame.style.left = l; if (ingame.style.top !== t) ingame.style.top = t; }
      const help = on && !wait && scene === 28 ? (snap.duel?.help || '').replace(/[@＠]>\d+\/?/g, ' ').replace(/[@＠]\d/g, '').trim() : '';
      if (guide.hidden === !!help) guide.hidden = !help;
      if (help && guideText.textContent !== help) guideText.textContent = help;
      const cards = on && !wait && scene === 28 ? snap.duelCards || [] : [];
      const signature = JSON.stringify(cards);
      if (signature !== glowSignature) {
        glowSignature = signature;
        glows.innerHTML = cards.map(c => `<span class="mu-action-card" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;transform:translate(-50%,-50%) rotate(${c.rotation}deg)" aria-hidden="true"></span>`).join('');
      }
      const show = title || !!mm || !!help || cards.length > 0;
      if (layer.hidden === show) layer.hidden = !show;
      if (layer.classList.contains('mu-title-on') !== title) {
        layer.classList.toggle('mu-title-on', title);
        // the modern menu up: ONLINE has the focus, so Enter starts and the arrows move (DESIGN.md UX spec 5)
        if (title && on && !layer.contains(document.activeElement)) menu.querySelector('button')?.focus({ preventScroll: true });
      }
      layer.classList.toggle('mu-on', on);
    },
  };
}

const CSS = `
.mu-action-cards { position: absolute; inset: 0; pointer-events: none; }
.mu-action-card { position: absolute; border: 2px solid #ffe58a; border-radius: 4px; pointer-events: none;
 box-shadow: 0 0 5px 2px #f3c64f99, inset 0 0 7px #f3c64f66; }

#mu-title { font-family: Arial, "Helvetica Neue", sans-serif;
  -webkit-font-smoothing: antialiased; }
/* the menu, in the title art's own language (owner: "the modern buttons look out of place"): glossy azure bars (the
   art's hard gloss split), a thick white rim inside a navy outline, the 2008 slant, the labels in the display face with
   a navy outline as the art letters theirs; ONLINE in gold. Layers: ::before the navy outline, ::after the white rim,
   .mu-tfill the gloss; a press pushes the bar in, hover lights it and sweeps a shine across */
#mu-title .mu-tmenu { position: absolute; left: 340px; top: 432px; width: 344px; display: none; flex-direction: column; gap: 4px;
  pointer-events: auto; animation: mu-rise .28s cubic-bezier(.16, 1, .3, 1) both; }
#mu-title.mu-on.mu-title-on .mu-tmenu { display: flex; }
#mu-title:not(.mu-title-on) > .mu-switch:not(.mu-ingame) { display: none; }
#mu-title .mu-switch.mu-ingame { right: auto; bottom: auto; margin-left: 4px; }
#mu-title .mu-guide { left: 332px; top: 72px; width: 360px; padding-bottom: 10px; pointer-events: none; font-size: 14px; }
#mu-title .mu-guide[hidden] { display: none; }
#mu-title .mu-guide::after { background: var(--plate, linear-gradient(#e2fcff,#9adff7)); }
#mu-title .mu-guide .mu-head { height: 30px; }
#mu-title .mu-guide p { margin: 8px 16px 0; font-weight: 750; line-height: 1.4; text-align: center; color: #0c1e3a; white-space: pre-wrap; }
#mu-title .mu-switch.mu-ingame[hidden] { display: none; }
#mu-title .mu-tbtn { --s: 22px; position: relative; display: flex; align-items: center; justify-content: center; height: 36px; padding: 0 24px; margin: 0;
  border: 0; background: none; font-family: var(--display, "Arial Black"), "Arial Black", Arial, sans-serif; font-weight: 800; font-style: italic; font-size: 18px;
  line-height: 1; letter-spacing: .07em; text-transform: uppercase; color: #fff;
  filter: drop-shadow(0 4px 6px rgba(6, 30, 80, .35)); transition: transform .07s ease-out, filter .16s; }
#mu-title .mu-tbtn::before, #mu-title .mu-tbtn::after, #mu-title .mu-tfill { content: ''; position: absolute; clip-path: polygon(var(--s) 0, 100% 0, calc(100% - var(--s)) 100%, 0 100%); }
#mu-title .mu-tbtn::before { inset: 0; background: #0b2f73; }
#mu-title .mu-tbtn::after { inset: 1.5px 2px; background: linear-gradient(180deg, #ffffff, #dff1ff); }
#mu-title .mu-tfill { z-index: 1; inset: 4px 6px; overflow: hidden;
  background: linear-gradient(180deg, #b5e7ff 0%, #66bbfb 47%, #2584ec 53%, #1a6bd8 100%); box-shadow: inset 0 -3px 6px rgba(4, 40, 120, .35); }
#mu-title .mu-tfill::after { content: ''; position: absolute; inset: 0;
  background: linear-gradient(105deg, transparent 30%, rgba(255, 255, 255, .55) 45%, transparent 60%) -160% 0 / 60% 100% no-repeat;
  transition: background-position .5s cubic-bezier(.16, 1, .3, 1); }
#mu-title .mu-tlbl { position: relative; z-index: 2; padding-right: .07em;
  text-shadow: 1.5px 0 0 #0b3a8a, -1.5px 0 0 #0b3a8a, 0 1.5px 0 #0b3a8a, 0 -1.5px 0 #0b3a8a, 1px 1px 0 #0b3a8a, -1px -1px 0 #0b3a8a, 0 3px 4px rgba(0, 20, 70, .55); }
#mu-title .mu-tbtn:hover, #mu-title .mu-tbtn:focus-visible { outline: none; transform: translateX(3px);
  filter: drop-shadow(0 4px 6px rgba(6, 30, 80, .35)) drop-shadow(0 0 10px rgba(150, 215, 255, .9)) brightness(1.06); }
#mu-title .mu-tbtn:hover .mu-tfill::after, #mu-title .mu-tbtn:focus-visible .mu-tfill::after { background-position: 260% 0; }
#mu-title .mu-tbtn:focus-visible::after { background: linear-gradient(180deg, #fff6c8, #ffd25a); }
#mu-title .mu-tbtn:active { transition-duration: .03s, .03s; transform: translateY(1px); filter: drop-shadow(0 1px 2px rgba(6, 30, 80, .4)) brightness(.95); }
#mu-title .mu-tbtn-primary { --s: 25px; height: 50px; font-size: 25px; }
#mu-title .mu-tbtn-primary::before { background: #6b3300; }
#mu-title .mu-tbtn-primary .mu-tfill { background: linear-gradient(180deg, #fff6c4 0%, #ffd94e 47%, #f6a400 53%, #e38700 100%); box-shadow: inset 0 -3px 6px rgba(120, 50, 0, .3); }
#mu-title .mu-tbtn-primary .mu-tlbl { text-shadow: 1.5px 0 0 #8a4300, -1.5px 0 0 #8a4300, 0 1.5px 0 #8a4300, 0 -1.5px 0 #8a4300, 1px 1px 0 #8a4300, -1px -1px 0 #8a4300, 0 3px 4px rgba(80, 30, 0, .5); }
#mu-title .mu-tbtn-primary:hover, #mu-title .mu-tbtn-primary:focus-visible { filter: drop-shadow(0 4px 6px rgba(6, 30, 80, .35)) drop-shadow(0 0 12px rgba(255, 210, 90, .95)) brightness(1.04); }
#mu-title .mu-switch { position: absolute; right: 20px; bottom: 20px; display: flex; align-items: center; gap: 10px; height: 34px;
  padding: 0 14px 0 8px; border-radius: 3px; pointer-events: auto; color: #0b2a5c; font-family: inherit; font-weight: 700; font-size: 13px; line-height: 1; letter-spacing: .02em;
  background: linear-gradient(180deg, rgba(255, 255, 255, .95), rgba(205, 243, 255, .95));
  box-shadow: 0 0 0 1px #2f8fd6, inset 0 1px 0 #fff, 0 8px 18px -8px rgba(10, 60, 130, .55); }
#mu-title .mu-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
#mu-title .mu-track { position: relative; width: 38px; height: 22px; border-radius: 3px; flex: none;
  background: linear-gradient(180deg, #8698bb, #a9b8d3); box-shadow: inset 0 1px 2px rgba(0, 0, 0, .35), 0 0 0 1px #5a6f95;
  transition: background .18s; }
#mu-title .mu-knob { position: absolute; left: 2px; top: 2px; width: 18px; height: 18px; border-radius: 2px;
  background: radial-gradient(circle at 35% 30%, #fff, #e8eef5 55%, #b6c4d6); box-shadow: 0 1px 3px rgba(0, 0, 0, .4);
  transition: transform .2s cubic-bezier(.16, 1, .3, 1); }
#mu-title input:checked + .mu-track { background: linear-gradient(180deg, #eca430, #fff97f); box-shadow: inset 0 1px 2px rgba(120, 60, 0, .35), 0 0 0 1px #e36f08; }
#mu-title input:checked + .mu-track .mu-knob { transform: translateX(16px); }
#mu-title input:focus-visible + .mu-track { box-shadow: 0 0 0 2px #0985ff, inset 0 1px 2px rgba(0, 0, 0, .35); }
@keyframes mu-rise { from { opacity: 0; transform: translateY(8px); filter: blur(3px); } }
@media (prefers-reduced-motion: reduce) { #mu-title *, #mu-title *::after { animation: none !important; transition: none !important; } }
`;
