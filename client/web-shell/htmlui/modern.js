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
      <span class="mu-switch-label">Legacy UI</span></label>`;
  const box = layer.querySelector('input'), menu = layer.querySelector('.mu-tmenu');
  const listeners = new Set();
  const set = v => {
    v = !!v && !killed;
    if (v === on) return on;
    on = v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
    if (on) load();
    box.checked = !on;
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
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let busy = false;
  menu.addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b || busy) return;
    busy = true;
    const [, x, y] = TITLE[+b.dataset.i];
    fire('mousemove', x, y); await sleep(70);
    fire('mousedown', x, y); await sleep(70);
    fire('mouseup', x, y);
    await sleep(300);
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

  return {
    killed,
    active: () => on && mods.size > 0,
    on: () => on,
    set,
    onChange: f => listeners.add(f),
    mods,
    layer,
    // the engine's title buttons, for the hide table while modern is on (the DOM menu stands in for them)
    hide: (snap, wait) => on && !wait ? (snap.title || []).map(b => b.id) : [],
    // each frame: the title layer shows on the title scene (4) once it is up, with no window over it (OPTIONS opens one)
    frame(snap, scene, wait) {
      const title = !killed && scene === 4 && !wait && !snap.windows.some(w => w.shown && w.drawn);
      if (layer.hidden === title) layer.hidden = !title;
      layer.classList.toggle('mu-on', on);
    },
  };
}

const CSS = `
#mu-title { font-family: "Segoe UI Variable Text", "Segoe UI", "SF Pro Text", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased; }
/* the menu: four bars standing on the title art as the 2008 ones do, no plate behind them; each its own depth (a white
   rim, the bar's fill, a soft drop shadow). The 2008 slant, the 2008 order; ONLINE taller and in the menu's gold */
#mu-title .mu-tmenu { position: absolute; left: 318px; top: 424px; width: 392px; display: none; flex-direction: column; gap: 7px;
  pointer-events: auto; animation: mu-rise .28s cubic-bezier(.16, 1, .3, 1) both; }
#mu-title.mu-on .mu-tmenu { display: flex; }
#mu-title .mu-tbtn { --s: 24px; position: relative; display: flex; align-items: center; justify-content: center; height: 44px; padding: 0 30px; margin: 0;
  border: 0; background: none; font-family: inherit; font-weight: 800; font-size: 20px; line-height: 1; letter-spacing: .05em; font-style: italic; color: #fff;
  filter: drop-shadow(0 7px 10px rgba(8, 32, 84, .34)) drop-shadow(0 1px 2px rgba(8, 32, 84, .4));
  transition: transform .16s cubic-bezier(.16, 1, .3, 1), filter .16s; }
#mu-title .mu-tbtn::before, #mu-title .mu-tfill { content: ''; position: absolute; clip-path: polygon(var(--s) 0, 100% 0, calc(100% - var(--s)) 100%, 0 100%); }
#mu-title .mu-tbtn::before { inset: 0; background: linear-gradient(180deg, #fff, #d3e4fb); }
#mu-title .mu-tfill { inset: 2px 3px; overflow: hidden; background: var(--bar, linear-gradient(180deg, #4b8ee3, #2462c2));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .45); }
#mu-title .mu-tfill::after { content: ''; position: absolute; inset: 0;
  background: linear-gradient(105deg, transparent 30%, rgba(255, 255, 255, .45) 45%, transparent 60%) -160% 0 / 60% 100% no-repeat;
  transition: background-position .5s cubic-bezier(.16, 1, .3, 1); }
#mu-title .mu-tlbl { position: relative; text-shadow: 0 1px 0 rgba(0, 25, 80, .55), 0 0 6px rgba(0, 25, 80, .35); }
#mu-title .mu-tbtn:hover, #mu-title .mu-tbtn:focus-visible { outline: none; transform: translateX(4px);
  filter: drop-shadow(0 10px 14px rgba(8, 32, 84, .4)) drop-shadow(0 1px 2px rgba(8, 32, 84, .4)) brightness(1.08) saturate(1.08); }
#mu-title .mu-tbtn:hover .mu-tfill::after, #mu-title .mu-tbtn:focus-visible .mu-tfill::after { background-position: 260% 0; }
#mu-title .mu-tbtn:focus-visible::before { background: linear-gradient(180deg, #fff6c8, #ffc93d); }
#mu-title .mu-tbtn:active { transform: translateX(2px); filter: drop-shadow(0 3px 5px rgba(8, 32, 84, .4)) brightness(.96); }
#mu-title .mu-tbtn-primary { --s: 28px; height: 52px; font-size: 25px; color: #3a2400; }
#mu-title .mu-tbtn-primary .mu-tfill { background: var(--gold, linear-gradient(180deg, #fff4c4, #f3c64f)); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .8); }
#mu-title .mu-tbtn-primary .mu-tlbl { text-shadow: 0 1px 0 rgba(255, 255, 220, .9); }
#mu-title .mu-switch { position: absolute; right: 20px; bottom: 20px; display: flex; align-items: center; gap: 10px; height: 34px;
  padding: 0 14px 0 8px; border-radius: 17px; pointer-events: auto; color: #0b2a5c; font-family: inherit; font-weight: 700; font-size: 13px; line-height: 1; letter-spacing: .02em;
  background: linear-gradient(180deg, rgba(255, 255, 255, .95), rgba(205, 243, 255, .95));
  box-shadow: 0 0 0 1px #2f8fd6, inset 0 1px 0 #fff, 0 8px 18px -8px rgba(10, 60, 130, .55); }
#mu-title .mu-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
#mu-title .mu-track { position: relative; width: 38px; height: 22px; border-radius: 11px; flex: none;
  background: linear-gradient(180deg, #8698bb, #a9b8d3); box-shadow: inset 0 1px 2px rgba(0, 0, 0, .35), 0 0 0 1px #5a6f95;
  transition: background .18s; }
#mu-title .mu-knob { position: absolute; left: 2px; top: 2px; width: 18px; height: 18px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff, #e8eef5 55%, #b6c4d6); box-shadow: 0 1px 3px rgba(0, 0, 0, .4);
  transition: transform .2s cubic-bezier(.16, 1, .3, 1); }
#mu-title input:checked + .mu-track { background: linear-gradient(180deg, #eca430, #fff97f); box-shadow: inset 0 1px 2px rgba(120, 60, 0, .35), 0 0 0 1px #e36f08; }
#mu-title input:checked + .mu-track .mu-knob { transform: translateX(16px); }
#mu-title input:focus-visible + .mu-track { box-shadow: 0 0 0 2px #0985ff, inset 0 1px 2px rgba(0, 0, 0, .35); }
@keyframes mu-rise { from { opacity: 0; transform: translateY(8px); filter: blur(3px); } }
@media (prefers-reduced-motion: reduce) { #mu-title *, #mu-title *::after { animation: none !important; transition: none !important; } }
`;
