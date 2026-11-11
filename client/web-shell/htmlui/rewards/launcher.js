// The Missions button: one native-sized menu-bar slot right after the Wardrobe's (cosmetics/wardrobe-launcher.js), in
// the same plate and colours, with a star pictogram on the plate's x=44 axis and a red dot with the number of rewards
// ready to claim. It shows only once the server answers (rewards off on the server: no button), and is away wherever
// the Wardrobe's is (character creation, the shop, the trade, the duel...).
import { PLATE, plateBackground, reserveBar } from '../screens/lobby_icons.js';
import { launcherPlace } from '../cosmetics/wardrobe-launcher.js';
import { openMissions, isMissionsOpen, onMissionsClose } from './missions.js';
import * as api from './api.js';
import { claimableIds } from './model.js';

export const REFRESH = 60000, OFF_RETRY = 300000;
const PAL = { normal: ['#fff', '#0068f2', '#ffffff', '#dbffff'], hover: ['#fcff00', '#535353', '#f8f8f8', '#f8f8f8'], pressed: ['#fff', '#e7009e', '#f3bfe6', '#fdfbfd'] };
// a five-pointed star, in the button's own 80 x 32 box
const STAR = 'M40 7L42.5 13.1L49 13.6L44 17.8L45.6 24.2L40 20.7L34.4 24.2L36 17.8L31 13.6L37.5 13.1Z';
const svg = k => { const [halo, line, top, bottom] = PAL[k];
  return `<svg data-look="${k}" width="80" height="32" viewBox="0 0 80 32" aria-hidden="true"><defs><linearGradient id="rwl-${k}" x1="0" y1="7" x2="0" y2="25" gradientUnits="userSpaceOnUse">`
    + `<stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>`
    + `<path d="${STAR}" fill="none" stroke="${halo}" stroke-width="6" stroke-linejoin="round"/>`
    + `<path d="${STAR}" fill="url(#rwl-${k})" stroke="${line}" stroke-width="2.4" stroke-linejoin="round"/></svg>`; };
const CSS = `
/* it comes up as a scene's loading veil starts to fade (bridge.js wait), so it fades in with the bar under the veil */
.de-rwl { position: fixed; left: 0; top: 0; width: 1024px; height: 768px; transform-origin: 0 0; z-index: 2147480000; pointer-events: none;
  animation: rwl-in .3s ease-out; }
@keyframes rwl-in { from { opacity: 0; } }
/* its window open: the button stays pressed, over the window's dim (a click there closes it, as the game's own) */
.de-rwl[data-open] { z-index: 2147483001; }
.de-rwl > button { position: absolute; width: 80px; height: 32px; margin: 0; padding: 0; border: 0; background: none; pointer-events: auto; cursor: inherit; }
.de-rwl > button > i { position: absolute; left: 8px; top: 4px; width: 72px; height: 24px; box-sizing: border-box; border: 1px solid;
  clip-path: polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px), 0 3px); }
.de-rwl > button > svg { position: absolute; left: 4px; top: 0; display: none; overflow: visible; }
${['normal', 'hover', 'pressed'].map(k => `.de-rwl > button[data-look=${k}] > i { border-color: ${PLATE[k]?.border || PLATE.normal.border}; background: ${plateBackground(PLATE[k] || PLATE.normal)}; }
.de-rwl > button[data-look=${k}] > svg[data-look=${k}] { display: block; }`).join('\n')}
.de-rwl > button > b { position: absolute; left: 60px; top: -4px; min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box; border-radius: 9px;
  background: linear-gradient(#c4362a, #a3241a); box-shadow: 0 0 0 1.5px #fff, 0 1px 2px rgba(0,0,0,.5);
  color: #fff; font: 11px/18px Arial, 'Liberation Sans', sans-serif; font-weight: normal; text-align: center; font-variant-numeric: tabular-nums; }
.de-rwl > button > b[hidden] { display: none; }
`;

/** Where the button goes in this snapshot: the slot after the Wardrobe's, or null where the Wardrobe has no place. */
export function missionsPlace(snap) {
  const at = launcherPlace(snap);
  return at && { ...at, x: at.x + at.w };
}

let el = null, unsub = null, unsubView = null, count = 0, state = 'unknown', asked = 0, hover = false, held = false;
// the server's answer: the count, or why there is no button (off: rewards switched off; later: no character yet...)
function ask(force = false) {
  asked = Date.now();
  api.getView({ force }).then(v => { state = 'on'; badge(v); }, e => { state = e?.error === 'rewards-disabled' || e?.error === 'free-mode' ? 'off' : 'later'; });
}
function badge(v) {
  count = claimableIds(v).length;
  const b = el?.querySelector('button'), dot = b?.querySelector('b');
  if (!dot) return;
  dot.hidden = !count;
  dot.textContent = count > 99 ? '99+' : String(count);
  const label = count ? `Missions, ${count} reward${count === 1 ? '' : 's'} to claim` : 'Missions';
  b.title = label; b.setAttribute('aria-label', label);
}
function paint() {
  const b = el?.querySelector('button');
  if (!b) return;
  const open = isMissionsOpen(), k = open || held ? 'pressed' : hover ? 'hover' : 'normal';
  if (b.dataset.look !== k) b.dataset.look = k;
  if (el.hasAttribute('data-open') !== open) el.toggleAttribute('data-open', open);
  b.setAttribute('aria-pressed', String(open));
}
function mount() {
  if (!document.getElementById('de-rwl-css')) { const s = document.createElement('style'); s.id = 'de-rwl-css'; s.textContent = CSS; document.head.append(s); }
  el = document.createElement('div');
  el.className = 'de-c de-rwl';
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.look = 'normal';
  b.innerHTML = '<i></i>' + ['normal', 'hover', 'pressed'].map(svg).join('') + '<b hidden></b>';
  // the game's buttons' looks: hover, pressed while held, and pressed while its window is open (frame: data-open)
  b.addEventListener('mouseenter', () => { hover = true; paint(); }); b.addEventListener('mouseleave', () => { hover = held = false; paint(); });
  b.addEventListener('mousedown', () => { held = true; paint(); }); b.addEventListener('mouseup', () => { held = false; paint(); });
  // a click opens the window; on the open window's button, closes it
  b.addEventListener('click', () => { const was = isMissionsOpen(), close = openMissions(); if (was) close?.(); paint(); });
  // keys stay with the button (the game listens on window): Enter / Space open it, nothing reaches the game
  b.addEventListener('keydown', e => e.stopPropagation());
  el.append(b);
  document.body.append(el);
  badge(api.peekView());
  unsub = onMissionsClose(() => { hover = held = false; paint(); });
  unsubView = api.onChange(badge);
  place();
  addEventListener('resize', place);
}
function place() {
  if (!el) return;
  const r = document.getElementById('canvas')?.getBoundingClientRect(), s = r?.width ? r.width / 1024 : 1;
  Object.assign(el.style, { left: (r?.left || 0) + 'px', top: (r?.top || 0) + 'px', transform: `scale(${s})` });
}
function unmount() { el?.remove(); el = null; unsub?.(); unsubView?.(); unsub = unsubView = null; hover = held = false; reserveBar('missions', 0); removeEventListener('resize', place); }

let n = 0, away = true;
/** bridge.js, every frame: the button up on the menu bar while it is shown in the overworld (and rewards are on). */
export function missionsLauncherFrame(snap, wait = false) {
  const at = wait ? null : missionsPlace(snap);
  if (!at) { away = true; if (el) unmount(); return; }
  // back on the bar (a duel, the shop, a scene load ended): ask again, the progress may have moved
  const since = Date.now() - asked;
  if (away || since > (state === 'off' ? OFF_RETRY : REFRESH)) { away = false; if (since > 2000) ask(true); }
  if (state !== 'on') { if (el) unmount(); return; }
  if (!el) mount();
  Object.assign(el.firstChild.style, { left: at.x + 'px', top: at.y + 'px' });
  if (++n % 30 === 0) place();
  reserveBar('missions', at.x + at.w);
  paint();
}
export function _resetMissionsLauncher() { unmount(); state = 'unknown'; asked = 0; away = true; count = 0; }
