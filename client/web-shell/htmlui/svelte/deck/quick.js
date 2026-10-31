// Click to add / remove (owner, after EDOPro): deck.js's quickInstall on the Svelte deck's windows. Right-click or
// double-click (double-tap) moves one copy, replayed as the game's own drag (a press on the card, a release over the
// drop zone), so every deck rule stays the game's. quickMove (what moves where) is deck.js's.
import { quickMove, FUSION_TAB } from '../../screens/deck.js';
import { deck } from './state.svelte.js';
import { inEditor } from './art.js';

let busy = Promise.resolve(), on = false;
export function quickInstall() {
  const canvas = document.getElementById('canvas');
  if (on || !canvas) return;
  on = true;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const game = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * 1024 / r.width, (e.clientY - r.top) * 1024 / r.width]; };
  const client = ([x, y]) => { const r = canvas.getBoundingClientRect(), k = r.width / 1024; return [r.left + x * k, r.top + y * k]; };
  const fire = (type, p) => { const [x, y] = client(p); canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true,
    clientX: x, clientY: y, button: 0, buttons: type === 'mousedown' ? 1 : 0 })); };
  // the game reads the mouse once a frame: each step held ~3 frames
  const press = async p => { fire('mousemove', p); await sleep(50); fire('mousedown', p); await sleep(50); };
  const release = async p => { fire('mousemove', p); await sleep(50); fire('mouseup', p); await sleep(50); };
  const act = e => {
    if (!deck.wins.size || !inEditor()) return;
    const at = game(e), wins = [...deck.wins.values()].map(L => L.win), m = quickMove(wins, ...at);
    if (!m) return;
    e.preventDefault?.();
    busy = busy.then(async () => {
      const view = wins.find(w => w.cls === 'CWindowModelDeck')?.controls.find(c => c.cls === 'CWindowTaskDeck')?.view;
      if (m.fusion && view !== 'extra') { await press(FUSION_TAB); await release(FUSION_TAB); await sleep(100); }
      await press(m.press);
      await release(m.drop);
      fire('mousemove', at);   // the pointer back where the player has it
    });
  };
  canvas.addEventListener('contextmenu', act, true);
  canvas.addEventListener('dblclick', act, true);
  // a double-tap (a long press still opens the card detail: the game's)
  let tap = null;
  canvas.addEventListener('touchend', e => {
    const t = e.changedTouches[0], now = performance.now();
    if (tap && now - tap.t < 350 && Math.hypot(t.clientX - tap.x, t.clientY - tap.y) < 24) { tap = null; act(t); }
    else tap = { t: now, x: t.clientX, y: t.clientY };
  }, { capture: true, passive: true });
}
