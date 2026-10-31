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
#mu-title .mu-tmenu { position: absolute; left: 300px; top: 420px; width: 424px; padding: 14px 18px 16px;
  display: none; flex-direction: column; gap: 10px; pointer-events: auto; box-sizing: border-box; border-radius: 22px 22px 22px 8px;
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
#mu-title .mu-tbtn { position: relative; display: flex; align-items: center; justify-content: space-between; height: 40px;
  padding: 0 14px 0 20px; margin: 0; border: 0; border-radius: 12px 12px 12px 4px; font-family: inherit; font-weight: 650; font-size: 17px; line-height: 1; letter-spacing: .06em;
  color: #eaf6ff; text-shadow: 0 1px 1px rgba(4, 16, 44, .6);
  background: linear-gradient(180deg, rgba(125, 239, 252, .28), rgba(9, 133, 255, .22) 50%, rgba(9, 100, 220, .30));
  box-shadow: inset 0 0 0 1px rgba(160, 225, 255, .45), inset 0 1px 0 rgba(255, 255, 255, .35), 0 2px 4px rgba(2, 10, 30, .35);
  transition: transform .14s cubic-bezier(.16, 1, .3, 1), box-shadow .14s, background .14s; }
#mu-title .mu-tbtn svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round;
  stroke-linejoin: round; opacity: .55; transition: transform .14s, opacity .14s; }
#mu-title .mu-tbtn:hover, #mu-title .mu-tbtn:focus-visible { outline: none; transform: translateY(-1px);
  background: linear-gradient(180deg, rgba(160, 245, 255, .42), rgba(9, 133, 255, .34) 50%, rgba(9, 110, 235, .44));
  box-shadow: inset 0 0 0 1px rgba(190, 240, 255, .8), inset 0 1px 0 rgba(255, 255, 255, .5), 0 6px 14px -4px rgba(0, 160, 255, .55); }
#mu-title .mu-tbtn:hover svg, #mu-title .mu-tbtn:focus-visible svg { opacity: 1; transform: translateX(2px); }
#mu-title .mu-tbtn:active { transform: translateY(0); }
#mu-title .mu-tbtn-primary { height: 52px; font-size: 21px; color: #3a2200; text-shadow: 0 1px 0 rgba(255, 250, 210, .7);
  background: linear-gradient(180deg, #fff7c2 0%, #f7e46c 44%, #f1c330 56%, #e7a51b 100%);
  box-shadow: 0 0 0 1px #a8640f, inset 0 1px 0 rgba(255, 255, 255, .85), inset 0 -2px 0 rgba(137, 64, 9, .3), 0 3px 6px rgba(40, 20, 0, .4); }
#mu-title .mu-tbtn-primary:hover, #mu-title .mu-tbtn-primary:focus-visible {
  background: linear-gradient(180deg, #fffbd9 0%, #f9ea80 44%, #f4cc3e 56%, #eaae22 100%);
  box-shadow: 0 0 0 1px #a8640f, 0 0 0 4px rgba(255, 226, 90, .35), inset 0 1px 0 #fff, inset 0 -2px 0 rgba(137, 64, 9, .3),
    0 8px 18px -6px rgba(120, 70, 0, .6); }
#mu-title .mu-switch { position: absolute; right: 20px; bottom: 20px; display: flex; align-items: center; gap: 10px; height: 34px;
  padding: 0 14px 0 8px; border-radius: 17px; pointer-events: auto; color: #eaf6ff; font-family: inherit; font-weight: 600; font-size: 13px; line-height: 1; letter-spacing: .02em;
  background: linear-gradient(180deg, rgba(14, 50, 117, .88), rgba(10, 35, 80, .92));
  box-shadow: 0 0 0 1px rgba(6, 20, 52, .85), inset 0 0 0 1px rgba(150, 205, 255, .3), inset 0 1px 0 rgba(255, 255, 255, .25),
    0 8px 20px -8px rgba(2, 10, 30, .7); }
#mu-title .mu-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
#mu-title .mu-track { position: relative; width: 38px; height: 22px; border-radius: 11px; flex: none;
  background: linear-gradient(180deg, #4b5d7e, #66789a); box-shadow: inset 0 1px 2px rgba(0, 0, 0, .45), 0 0 0 1px rgba(6, 20, 52, .8);
  transition: background .18s; }
#mu-title .mu-knob { position: absolute; left: 2px; top: 2px; width: 18px; height: 18px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff, #dfe8f3 55%, #9fb3cc); box-shadow: 0 1px 3px rgba(0, 0, 0, .45);
  transition: transform .2s cubic-bezier(.16, 1, .3, 1); }
#mu-title input:checked + .mu-track { background: linear-gradient(180deg, #f1c330, #f7e46c); }
#mu-title input:checked + .mu-track .mu-knob { transform: translateX(16px); }
#mu-title input:focus-visible + .mu-track { box-shadow: 0 0 0 2px #75ffff, inset 0 1px 2px rgba(0, 0, 0, .45); }
@keyframes mu-rise { from { opacity: 0; transform: translateY(8px); filter: blur(3px); } }
`;
