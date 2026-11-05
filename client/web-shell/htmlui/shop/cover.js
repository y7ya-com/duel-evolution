// The cover over the engine's shop scene (0x0e): the native shop (Sadie, the player's bust, the menu and its category
// windows, her balloons) must never be seen, on the way in or out. bridge.js reports every scene load (onYo2Scene) here, at its
// "begin", before the engine draws anything of the new scene:
//   - a load of the shop scene: the cover (the shop's backdrop, band and title, "Loading...") goes up at once and stays
//     until the shop itself is up and has its data (screens/shop.js says so: whenReady), or 10 s after the load ends
//   - a load away from it (Back: the menu's Exit and Sadie's farewell balloon were clicked behind the shop): the same
//     cover through the load and two frames after it, so the map comes back whole
// It is a layer of its own, outside #htmlui-host (the host is hidden through a scene load). ?HTML_SHOP=0 or "cardShop":
// false: no cover (the native shop as before).
import { injectShopSkin } from '../cosmetics/shopart.js';
import { injectShopCss } from './css.js';
import { h, at } from './dom.js';

export const SHOP_SCENE = 0x0e;
export const shopOn = () => { try { return new URLSearchParams(location.search).get('HTML_SHOP') !== '0'; } catch { return true; } };
/** The cover is on with the HTML shop; ?SHOP_COVER=0 is the filming switch (the shop as it was before the cover). */
export const coverOn = () => { try { return shopOn() && new URLSearchParams(location.search).get('SHOP_COVER') !== '0'; } catch { return true; } };

/** A click the game takes as a player's (game px): the mouse over the point for a while first, then pressed and
 *  released. The menu's swf Exit button only takes a press after it has seen the mouse over it for some frames (live:
 *  the bridge's api.click, two frames of hover, never left the shop; a second did, most times). The events go to the canvas (SDL
 *  listens on the window: they bubble there); the shop's layer keeps the player's own mouse from the game meanwhile. -> a Promise */
export async function nativeClick([x, y], { hover = 1200, hold = 250, doc = globalThis.document } = {}) {
  const c = doc?.getElementById('canvas');
  if (!c) return false;
  const r = c.getBoundingClientRect(), k = r.width / 1024, at = [r.left + x * k, r.top + y * k];
  const fire = (type, [cx, cy], buttons = 0) => c.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0, buttons }));
  const wait = ms => new Promise(ok => setTimeout(ok, ms));
  fire('mousemove', [at[0] - 2, at[1] - 2]);
  for (let t = 0; t < hover; t += 40) { await wait(40); fire('mousemove', at); }
  fire('mousedown', at, 1); await wait(hold); fire('mouseup', at);
  return true;
}

const C = { canvas: null, layer: null, mode: null, ready: null, leave: null, endFrame: 0, ended: false, timer: 0, greeting: 0 };

/** The stage's place, as bridge.js's place() puts the host: left, top, scale. */
export function coverPlace(canvas = C.canvas) {
  C.canvas = canvas;
  if (!C.layer || !canvas) return;
  const r = canvas.getBoundingClientRect(), s = r.width / 1024 || 1;
  Object.assign(C.layer.style, { left: r.left + 'px', top: r.top + 'px', transform: `scale(${s})` });
}
function build(doc) {
  injectShopSkin(doc); injectShopCss(doc);
  const l = doc.createElement('div');
  l.id = 'shop-cover';
  l.setAttribute('aria-hidden', 'true');
  Object.assign(l.style, { position: 'fixed', width: '1024px', height: '768px', transformOrigin: '0 0', zIndex: 6, pointerEvents: 'auto', background: '#e9eef1' });
  const shell = h('div', { class: 'ns de-c' },
    h('div', { class: 'sa-glass bg', 'aria-hidden': 'true' }), h('div', { class: 'sa-band top' }),
    h('div', { class: 'sa-title', style: at(22, 26, 236) }, 'Card Shop'),
    h('div', { class: 'abs t w', style: at(278, 36) }, 'Loading...'));
  l.append(shell);
  return l;
}
function up(mode) {
  if (typeof document === 'undefined' || !coverOn()) return;
  C.layer ||= build(document);
  if (!C.layer.isConnected) document.body.append(C.layer);
  C.mode = mode; C.ended = false;
  coverPlace();
  clearTimeout(C.timer);
  C.timer = setTimeout(down, 30000);   // never stuck: a load that never ends
}
export function down() {
  clearTimeout(C.timer);
  C.mode = null;
  C.layer?.remove();
}
/** The cover is up (mode 'in' or 'out'), or not (null). */
export const coverMode = () => C.mode;

/** A scene load, bridge.js's Module.onYo2Scene (kind 'begin' | 'end'). */
export function coverScene(kind, from, to, frameNo = 0) {
  if (kind === 'begin') {
    if (to === SHOP_SCENE && from !== SHOP_SCENE) up('in');
    else if (from === SHOP_SCENE && to !== SHOP_SCENE) { up('out'); C.leave?.(); }
  } else if (C.mode) {
    C.ended = true; C.endFrame = frameNo;
    if (C.mode === 'in') { clearTimeout(C.timer); C.timer = setTimeout(down, 10000); }
  }
}
/** Every engine frame (bridge.js frame()): the way out ends two frames after the load; the way in when the shop says it is ready. */
export function coverFrame(frameNo, switching, snap) {
  if (!C.mode || switching || !C.ended) return;
  if (C.mode === 'out' && frameNo > C.endFrame + 2) down();
  else if (C.mode === 'in' && C.ready?.()) down();
  else if (C.mode === 'in') greet(snap);
}
// Sadie's greeting (her balloon, and her profile card) waits for a click before the menu comes up: clicked for the player, behind the cover
function greet(snap) {
  if (!snap || snap.scene !== SHOP_SCENE || C.greeting) return;
  if ((snap.tasks || []).some(t => t.cls === 'CShopCategoryWindow' && t.shown)) return;
  const b = (snap.windows || []).find(w => w.cls === 'CWindowModelBalloon' && w.shown);
  if (!b) return;
  C.greeting = 1;
  nativeClick([Math.round(b.x + b.w / 2), Math.round(b.y + b.h / 2)], { hover: 200, hold: 120 }).finally(() => setTimeout(() => { C.greeting = 0; }, 1200));
}
/** screens/shop.js: whenReady() -> true once the shop is shown with its data; leave(): the shop scene is being left. */
export function coverWhen(whenReady, leave) { C.ready = whenReady; C.leave = leave; }
