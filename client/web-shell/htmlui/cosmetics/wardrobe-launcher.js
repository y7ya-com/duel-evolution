// One native-sized menu-bar slot after the visible overworld buttons. My Room has one button;
// lobbies have more. Keep the 80px rhythm and reserve any occupied engine notification slots.
// The hanger is centred on the plate's x=44 axis, with the same plate and interaction colours.
import { PLATE, plateBackground, reserveBar } from '../screens/lobby_icons.js';
import { openWardrobe, isWardrobeOpen, onWardrobeClose } from './wardrobe.js';

export const SPOT = { x: 240, y: 736, w: 80, h: 32 };
// scenes with the bar up where the Wardrobe has no place: the deck editor, the shop, the trade / present / TP, the
// pack opening, the duel and its result
const AWAY = new Set([0x0e, 0x18, 0x24, 0x26, 0x27, 0x28, 0x1c, 0x1e, 0x20]);
const PAL = { normal: ['#fff', '#0068f2', '#ffffff', '#dbffff'], hover: ['#fcff00', '#535353', '#f8f8f8', '#f8f8f8'], pressed: ['#fff', '#e7009e', '#f3bfe6', '#fdfbfd'] };
// a hanger: the hook, the shoulders and the bar, in the button's own 80 x 32 box (the pictogram sits on the plate's middle)
const HANGER = 'M40 9.5c0-2 1.6-3.2 3.2-3.2s3.2 1.3 3.2 3.2c0 1.6-1.2 2.4-2.6 3.3L40 15.5 27 22.5c-1.2.7-.7 2.5.7 2.5h24.6c1.4 0 1.9-1.8.7-2.5L40 15.5';
const svg = k => { const [halo, line, top, bottom] = PAL[k];
  return `<svg data-look="${k}" width="80" height="32" viewBox="0 0 80 32" aria-hidden="true"><defs><linearGradient id="wdl-${k}" x1="0" y1="6" x2="0" y2="26" gradientUnits="userSpaceOnUse">`
    + `<stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>`
    + `<path d="${HANGER}" fill="none" stroke="${halo}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<path d="${HANGER}" fill="none" stroke="${line}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<path d="${HANGER}" fill="none" stroke="url(#wdl-${k})" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`; };
const CSS = `
/* it comes up as a scene's loading veil starts to fade (bridge.js wait), so it fades in with the bar under the veil */
.de-wdl { position: fixed; left: 0; top: 0; width: 1024px; height: 768px; transform-origin: 0 0; z-index: 2147480000; pointer-events: none;
  animation: wdl-in .3s ease-out; }
@keyframes wdl-in { from { opacity: 0; } }
/* its window open: the button stays pressed, over the window's dim (a click there closes it, as the game's own) */
.de-wdl[data-open] { z-index: 2147483001; }
.de-wdl > button { position: absolute; left: ${SPOT.x}px; top: ${SPOT.y}px; width: ${SPOT.w}px; height: ${SPOT.h}px; margin: 0; padding: 0;
  border: 0; background: none; pointer-events: auto; cursor: inherit; }
.de-wdl > button > i { position: absolute; left: 8px; top: 4px; width: 72px; height: 24px; box-sizing: border-box; border: 1px solid;
  clip-path: polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px), 0 3px); }
.de-wdl > button > svg { position: absolute; left: 4px; top: 0; display: none; overflow: visible; }
${['normal', 'hover', 'pressed'].map(k => `.de-wdl > button[data-look=${k}] > i { border-color: ${PLATE[k]?.border || PLATE.normal.border}; background: ${plateBackground(PLATE[k] || PLATE.normal)}; }
.de-wdl > button[data-look=${k}] > svg[data-look=${k}] { display: block; }`).join('\n')}
`;

/** Where the launcher goes in this snapshot (SPOT), or null: the bar not shown, a scene it has no place in. */
export function launcherPlace(snap) {
  if (!snap || AWAY.has(snap.scene)) return null;
  // character creation (CWindowDialogAvatarSwitch) has the bar but no place for the Wardrobe
  if ((snap.windows || []).some(w => w.cls === 'CWindowDialogAvatarSwitch')) return null;
  const bar = (snap.windows || []).find(w => w.cls === 'CWindowModelMenu' && w.shown);
  if (!bar) return null;
  const buttons = (bar.controls || []).filter(c => c.cls === 'CWindowTaskPictureSwitch' && c.shown);
  // only beside the game's own buttons (the overworld: My Room, lobbies, the map); a bar with none is a start screen
  // (Select Player, character creation), where the Wardrobe has no place
  if (!buttons.length) return null;
  const end = Math.max(...buttons.map(c => c.x + (c.w || 80)));
  // Notices stay engine-drawn. Reserve their occupied slot rather than covering a live notification.
  const notices = (bar.controls || []).filter(c => /^CNoticeIcon/.test(c.cls) && c.shown);
  const occupied = Math.max(end, ...notices.map(c => c.x + (c.w || 48)));
  return { ...SPOT, x: (bar.x || 0) + Math.ceil(occupied / SPOT.w) * SPOT.w, y: bar.y ?? SPOT.y };
}

let el = null, unsub = null, hover = false, held = false;
function paint() {
  const b = el?.firstChild;
  if (!b) return;
  const open = isWardrobeOpen(), k = open || held ? 'pressed' : hover ? 'hover' : 'normal';
  if (b.dataset.look !== k) b.dataset.look = k;
  if (el.hasAttribute('data-open') !== open) el.toggleAttribute('data-open', open);
  b.setAttribute('aria-pressed', String(open));
}
function mount() {
  if (!document.getElementById('de-wdl-css')) { const s = document.createElement('style'); s.id = 'de-wdl-css'; s.textContent = CSS; document.head.append(s); }
  el = document.createElement('div');
  el.className = 'de-c de-wdl';
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.look = 'normal'; b.title = 'Wardrobe'; b.setAttribute('aria-label', 'Wardrobe');
  b.innerHTML = '<i></i>' + ['normal', 'hover', 'pressed'].map(svg).join('');
  // the game's buttons' looks: hover, pressed while held, and pressed while its window is open (frame: data-open)
  b.addEventListener('mouseenter', () => { hover = true; paint(); }); b.addEventListener('mouseleave', () => { hover = held = false; paint(); });
  b.addEventListener('mousedown', () => { held = true; paint(); }); b.addEventListener('mouseup', () => { held = false; paint(); });
  // a click opens the window; on the open window's button, closes it
  b.addEventListener('click', () => { const was = isWardrobeOpen(), close = openWardrobe(); if (was) close?.(); paint(); });
  // keys stay with the button (the game listens on window): Enter / Space open it, nothing reaches the game
  b.addEventListener('keydown', e => e.stopPropagation());
  el.append(b);
  document.body.append(el);
  unsub = onWardrobeClose(() => { hover = held = false; paint(); });
  place();
  addEventListener('resize', place);
}
function place() {
  if (!el) return;
  const r = document.getElementById('canvas')?.getBoundingClientRect(), s = r?.width ? r.width / 1024 : 1;
  Object.assign(el.style, { left: (r?.left || 0) + 'px', top: (r?.top || 0) + 'px', transform: `scale(${s})` });
}
function unmount() { el?.remove(); el = null; unsub?.(); unsub = null; hover = held = false; reserveBar('wardrobe', 0); removeEventListener('resize', place); }

let n = 0;
/** bridge.js, every frame: the launcher up on the menu bar while it is shown in the overworld. */
export function wardrobeLauncherFrame(snap, wait = false) {
  const at = wait ? null : launcherPlace(snap);
  if (!at) { if (el) unmount(); return; }
  if (!el) mount();
  Object.assign(el.firstChild.style, { left: at.x + 'px', top: at.y + 'px' });
  if (++n % 30 === 0) place();
  reserveBar('wardrobe', at.x + at.w);
  paint();
}
export function _resetLauncher() { unmount(); }
