// Modern UI: Duel Evolution's 2026 skin, a second set of screens (svelte/modern.js -> gen/modern.js) picked over the
// legacy ones while it is on. Legacy is the default. The title page carries the "Modern UI" switch (it applies at
// once, no reload, and is remembered per browser); the modern Main Menu has it too.
//   on:   ?MODERN_UI=1 | 0 (this page only), else localStorage "yo2.modernUI" === "1"
//   kill: htmlui.json "modern": false (no switch, never on)
//   live: yo2Html.modern(true | false)
// The title scene's menu is the scene's own art, not a window: in modern mode a DOM menu covers it and plays the
// same clicks on the canvas (the buttons' centres below). Everything else goes through the window screens.
const KEY = 'yo2.modernUI';
// the title scene's four buttons (scene 4, game px): their centres, as the engine lays them out
const TITLE = [['ONLINE', 512, 458], ['OPTIONS', 512, 505], ['DECK EDITOR', 512, 552], ['FREE DUEL', 512, 600]];

export function modernUi({ defaults = {}, canvas, query = new URLSearchParams(location.search) }) {
  const killed = defaults.modern === false;
  const q = query.get('MODERN_UI');
  let on = !killed && (q != null ? q === '1' : (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })());
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
      ${TITLE.map(([l], i) => `<button type="button" class="mu-tbtn${i ? '' : ' mu-tbtn-primary'}" data-i="${i}"><span>${l}</span>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5 13 10l-5.5 5.5"/></svg></button>`).join('')}
    </nav>
    <label class="mu-switch"><input type="checkbox" role="switch"><span class="mu-track"><span class="mu-knob"></span></span>
      <span class="mu-switch-label">Modern UI</span></label>`;
  const box = layer.querySelector('input'), menu = layer.querySelector('.mu-tmenu');
  const listeners = new Set();
  const set = v => {
    v = !!v && !killed;
    if (v === on) return on;
    on = v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
    if (on) load();
    box.checked = on;
    listeners.forEach(f => f(on));
    return on;
  };
  box.checked = on;
  box.addEventListener('change', () => set(box.checked));
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
#mu-title .mu-tmenu { position: absolute; left: 306px; top: 424px; width: 412px; padding: 14px 22px 16px;
  display: none; flex-direction: column; gap: 8px; pointer-events: auto; box-sizing: border-box; border-radius: 24px 24px 24px 8px;
  background: linear-gradient(180deg, rgba(255, 255, 255, .16), rgba(255, 255, 255, 0) 42%),
    repeating-linear-gradient(180deg, rgba(255, 255, 255, .03) 0 1px, transparent 1px 3px),
    linear-gradient(160deg, #1d56c0 0%, #0e3275 58%, #0a2350 100%);
  box-shadow: 0 0 0 1px rgba(6, 20, 52, .9), inset 0 0 0 1px rgba(150, 205, 255, .32), inset 0 1px 0 rgba(255, 255, 255, .4),
    0 26px 50px -18px rgba(2, 10, 30, .7), 0 6px 14px rgba(2, 10, 30, .35);
  animation: mu-rise .28s cubic-bezier(.16, 1, .3, 1) both; }
#mu-title.mu-on .mu-tmenu { display: flex; }
#mu-title .mu-tmenu::before { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1.5px; pointer-events: none;
  background: linear-gradient(180deg, #f3f7fc, #8fa3bd 48%, #dfe8f3 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }
/* the 2008 title buttons' slant (a parallelogram plate, its right end raked), now glass with a sheen */
#mu-title .mu-tbtn { position: relative; display: flex; align-items: center; justify-content: center; height: 40px; padding: 0 28px; margin: 0;
  border: 0; font-family: inherit; font-weight: 800; font-size: 20px; line-height: 1; letter-spacing: .05em; font-style: italic;
  color: #eaf6ff; text-shadow: 0 1px 2px rgba(4, 16, 44, .7);
  clip-path: polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%);
  background: linear-gradient(180deg, rgba(160, 245, 255, .55) 0, rgba(125, 239, 252, .35) 2px, rgba(9, 133, 255, .42) 48%, rgba(0, 70, 220, .72) 52%, rgba(0, 40, 170, .8) 100%);
  transition: transform .16s cubic-bezier(.16, 1, .3, 1), filter .16s, background .16s; }
#mu-title .mu-tbtn::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(105deg, transparent 30%, rgba(255, 255, 255, .28) 45%, transparent 60%) -160% 0 / 60% 100% no-repeat;
  transition: background-position .5s cubic-bezier(.16, 1, .3, 1); }
#mu-title .mu-tbtn svg { display: none; }
#mu-title .mu-tbtn:hover, #mu-title .mu-tbtn:focus-visible { outline: none; transform: translateX(4px); filter: brightness(1.12) saturate(1.1); }
#mu-title .mu-tbtn:hover::after, #mu-title .mu-tbtn:focus-visible::after { background-position: 260% 0; }
#mu-title .mu-tbtn:focus-visible { filter: brightness(1.12); outline: 2px solid #75ffff; outline-offset: 3px; text-decoration: underline 2px #75ffff; text-underline-offset: 5px; }
#mu-title .mu-tbtn:active { transform: translateX(2px); filter: brightness(.95); }
#mu-title .mu-tbtn-primary { height: 54px; font-size: 24px; color: #3a2200; text-shadow: 0 1px 0 rgba(255, 250, 210, .75);
  clip-path: polygon(18px 0, 100% 0, calc(100% - 18px) 100%, 0 100%);
  background: linear-gradient(180deg, #fffbe0 0, #f7e46c 46%, #f1c330 54%, #e39a14 100%); }
#mu-title .mu-tbtn-primary:hover, #mu-title .mu-tbtn-primary:focus-visible { filter: brightness(1.06) saturate(1.15); }
#mu-title .mu-switch { position: absolute; right: 20px; bottom: 20px; display: flex; align-items: center; gap: 10px; height: 34px;
  padding: 0 14px 0 8px; border-radius: 17px; pointer-events: auto; color: #eaf6ff; font-family: inherit; font-weight: 600; font-size: 13px; line-height: 1; letter-spacing: .02em;
  background: linear-gradient(180deg, rgba(14, 50, 117, .88), rgba(10, 35, 80, .92));
  box-shadow: 0 0 0 1px rgba(6, 20, 52, .85), inset 0 0 0 1px rgba(150, 205, 255, .3), inset 0 1px 0 rgba(255, 255, 255, .25),
    0 8px 20px -8px rgba(2, 10, 30, .7); }
#mu-title .mu-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
#mu-title .mu-track { position: relative; width: 38px; height: 22px; border-radius: 11px; flex: none;
  background: linear-gradient(180deg, #6f82a6, #8698bb); box-shadow: inset 0 1px 2px rgba(0, 0, 0, .45), 0 0 0 1px rgba(6, 20, 52, .8);
  transition: background .18s; }
#mu-title .mu-knob { position: absolute; left: 2px; top: 2px; width: 18px; height: 18px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff, #dfe8f3 55%, #9fb3cc); box-shadow: 0 1px 3px rgba(0, 0, 0, .45);
  transition: transform .2s cubic-bezier(.16, 1, .3, 1); }
#mu-title input:checked + .mu-track { background: linear-gradient(180deg, #f1c330, #f7e46c); }
#mu-title input:checked + .mu-track .mu-knob { transform: translateX(16px); }
#mu-title input:focus-visible + .mu-track { box-shadow: 0 0 0 2px #75ffff, inset 0 1px 2px rgba(0, 0, 0, .45); }
@keyframes mu-rise { from { opacity: 0; transform: translateY(8px); filter: blur(3px); } }
@media (prefers-reduced-motion: reduce) { #mu-title *, #mu-title *::after { animation: none !important; transition: none !important; } }
`;
