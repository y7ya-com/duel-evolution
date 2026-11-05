// The Wardrobe's place in the overworld: one more picture button on the menu bar (CWindowModelMenu, the bottom strip of
// My Room, the lobbies and the map), after the game's own three (Main Menu, Duel, Move: 80 x 32 each from x 0) and the
// notice icons (x 248..), in the bar's own plate (screens/lobby_icons.js PLATE: normal / hover / pressed) with a
// hanger drawn in the bar's pictogram colours. A click opens the Wardrobe (cosmetics/wardrobe.js). Like the trade
// overlay it is the bridge's (bridge.js calls wardrobeLauncherFrame every frame), so it is there whoever draws the bar:
// the engine, the HTML lobby screens or Modern UI.
//   wardrobeLauncherFrame(snap, wait)   up while the bar is shown in the overworld, not in a scene load, not while the
//                                       Wardrobe is open
//   launcherPlace(snap)                 where it goes, or null (pure)
import { PLATE, plateBackground } from '../screens/lobby_icons.js';
import { openWardrobe, isWardrobeOpen, onWardrobeClose } from './wardrobe.js';

export const SPOT = { x: 304, y: 736, w: 80, h: 32 };
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
.de-wdl { position: fixed; left: 0; top: 0; width: 1024px; height: 768px; transform-origin: 0 0; z-index: 2147480000; pointer-events: none; }
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
  const bar = (snap.windows || []).find(w => w.cls === 'CWindowModelMenu' && w.shown);
  return bar ? SPOT : null;
}

let el = null, unsub = null;
function mount() {
  if (!document.getElementById('de-wdl-css')) { const s = document.createElement('style'); s.id = 'de-wdl-css'; s.textContent = CSS; document.head.append(s); }
  el = document.createElement('div');
  el.className = 'de-c de-wdl';
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.look = 'normal'; b.title = 'Wardrobe'; b.setAttribute('aria-label', 'Wardrobe');
  b.innerHTML = '<i></i>' + ['normal', 'hover', 'pressed'].map(svg).join('');
  const look = k => () => { b.dataset.look = k; };
  b.addEventListener('mouseenter', look('hover')); b.addEventListener('mouseleave', look('normal'));
  b.addEventListener('mousedown', look('pressed')); b.addEventListener('mouseup', look('hover'));
  b.addEventListener('click', () => { b.dataset.look = 'normal'; openWardrobe(); el.hidden = true; });
  // keys stay with the button (the game listens on window): Enter / Space open it, nothing reaches the game
  b.addEventListener('keydown', e => e.stopPropagation());
  el.append(b);
  document.body.append(el);
  unsub = onWardrobeClose(() => { if (el) el.hidden = false; });
  place();
  addEventListener('resize', place);
}
function place() {
  if (!el) return;
  const r = document.getElementById('canvas')?.getBoundingClientRect(), s = r?.width ? r.width / 1024 : 1;
  Object.assign(el.style, { left: (r?.left || 0) + 'px', top: (r?.top || 0) + 'px', transform: `scale(${s})` });
}
function unmount() { el?.remove(); el = null; unsub?.(); unsub = null; removeEventListener('resize', place); }

let n = 0;
/** bridge.js, every frame: the launcher up on the menu bar while it is shown in the overworld. */
export function wardrobeLauncherFrame(snap, wait = false) {
  const at = wait ? null : launcherPlace(snap);
  if (!at) { if (el) unmount(); return; }
  if (!el) mount();
  else if (++n % 30 === 0) place();
  const hide = isWardrobeOpen();
  if (el.hidden !== hide) el.hidden = hide;
}
export function _resetLauncher() { unmount(); }
