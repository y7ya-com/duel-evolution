// The Wardrobe: the cosmetics a player owns, with their real in-game art (cosmetics/art.js), to see and equip per world.
// An overlay over whatever scene is up (the Card Shop, a lobby, My Room), in the game's native skin (cosmetics/theme.js:
// the cyan title plate, the gray glass panel, cyan and orange buttons), laid out in game px on a 1024 x 768 stage that
// follows the canvas (crisp at any DPR: CSS and canvases at the device's pixels).
//   openWardrobe({ focusId, world }) -> close(): opens it (or, already open, selects focusId there); focusId an item id
//     (the box reveal's reward), world 0 Domino City / 1 Duel Academy (default: the world the character is in)
// Callers: the shop's Wardrobe button and the box reveal (cosmetics/boxes*.js).
// Data: cosmetics/api.js getInfo (inventory, appearance per world, rank), equip(id, world) (the server's error text on
// a refusal); the view model is cosmetics/wardrobe-model.js. The rank uniforms are worn through api.setAppearance when
// api.js has it (POST /appearance: they are not catalog items); without it the panel says where to wear them.
// Preview: the selected item large (a composited live chibi needs the motion files' part offsets: ponytail).
// Keys: Esc closes, arrows move through the grid, Enter equips. While it is up no key or click reaches the game.
import * as api from './api.js';
import { injectTheme, RARITY, BODY_SIGN, WORLD_LABEL } from './theme.js';
import { renderItemArt } from './art.js';
import { wardrobeView, tabOfId, uniformParts, WORLDS } from './wardrobe-model.js';
import { SCHOOL } from '../rank.js';

const CSS = `
.de-wd { position: fixed; left: 0; top: 0; width: 1024px; height: 768px; transform-origin: 0 0; z-index: 2147483000;
  pointer-events: auto; outline: none; }
.de-wd .wd-dim { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 45%, rgba(8,24,36,.35), rgba(4,12,20,.72));
  animation: wd-fade .18s ease-out; }
.de-wd .wd-panel { left: 92px; top: 76px; width: 840px; height: 616px; border-radius: 6px;
  box-shadow: inset 0 0 0 3px #d3d6da, inset 0 0 0 4px #8a979f, 0 10px 40px rgba(0,0,0,.55), 0 0 0 1px #3d4d57;
  animation: wd-in .22s cubic-bezier(.2,.9,.3,1.2); }
.de-wd .wd-band { position: absolute; left: 4px; right: 4px; top: 4px; height: 60px; border-radius: 3px 3px 0 0;
  background: linear-gradient(to bottom, #85979f, #627580); box-shadow: inset 0 -1px rgba(255,255,255,.25); }
.de-wd .de-title { left: 18px; top: -17px; z-index: 2; border-radius: 3px; }
.de-wd .wd-sub { position: absolute; left: 196px; top: -24px; z-index: 2; font: bold 12px/20px Arial, sans-serif; color: #e9f8ff;
  text-shadow: 0 1px 2px rgba(0,0,0,.6); white-space: nowrap; }
.de-wd .wd-close { position: absolute; right: -12px; top: -14px; z-index: 3; width: 32px; height: 32px; margin: 0; padding: 0;
  border: 1px solid #b35300; border-radius: 50%; cursor: inherit; color: #fff; font: 900 16px/1 Arial, sans-serif;
  text-shadow: 1px 0 #7a3200, -1px 0 #7a3200, 0 1px #7a3200, 0 -1px #7a3200;
  background: radial-gradient(circle at 50% 30%, #fff1b8, #ffb12a 45%, #f07d00 80%);
  box-shadow: inset 0 1px #fffbe4, 0 2px 4px rgba(0,0,0,.4); transition: filter .12s, transform .12s; }
.de-wd .wd-close:hover { filter: brightness(1.1); transform: scale(1.06); }
/* the world switch: two cyan pills, the current one lit */
.de-wd .wd-worlds { position: absolute; left: 18px; top: 24px; display: flex; gap: 8px; }
.de-wd .wd-worlds .de-pill { position: relative; height: 30px; width: 170px; font-size: 14px; }
.de-wd .wd-worlds .de-pill[aria-pressed=false] { filter: saturate(.55) brightness(.82); }
.de-wd .wd-worlds .de-pill[aria-pressed=false]::before, .de-wd .wd-worlds .de-pill[aria-pressed=false]::after { opacity: 0; }
.de-wd .wd-worlds .de-pill[aria-pressed=true] { box-shadow: 0 0 0 1px #0f3f55, 0 0 0 3px rgba(255,255,255,.85), 0 0 12px rgba(120,240,255,.8), inset 0 1px #e8ffff; }
.de-wd .wd-grad { position: absolute; right: 18px; top: 21px; width: 360px; height: 36px; padding: 3px 10px; border-radius: 5px;
  color: #fff; font: bold 11px/14px Arial, sans-serif; text-shadow: 0 1px 1px rgba(0,0,0,.6);
  background: rgba(20,40,52,.35); box-shadow: inset 0 0 0 1px rgba(255,255,255,.25); }
.de-wd .wd-grad[data-done] { background: linear-gradient(to right, rgba(255,200,60,.35), rgba(255,230,140,.2)); box-shadow: inset 0 0 0 1px rgba(255,230,150,.7); }
.de-wd .wd-grad .bars { display: flex; gap: 8px; margin-top: 3px; }
.de-wd .wd-grad .bar { flex: 1; height: 7px; border-radius: 4px; background: rgba(0,0,0,.35); overflow: hidden; }
.de-wd .wd-grad .bar > i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(#a9f6ff, #3cc9ee); }
/* the category tabs */
.de-wd .wd-tabs { position: absolute; left: 16px; top: 72px; display: flex; gap: 6px; }
.de-wd .wd-tab { position: relative; height: 30px; min-width: 124px; margin: 0; padding: 0 14px; cursor: inherit; border-radius: 5px 5px 0 0;
  border: 1px solid #0132d3; border-bottom: 0; color: #fff; font: bold 14px/28px Arial, sans-serif; white-space: nowrap;
  text-shadow: 1px 0 #0b3a66, -1px 0 #0b3a66, 0 1px #0b3a66, 0 -1px #0b3a66;
  background: linear-gradient(to bottom, #4690d5, #3d98ec 40%, #379dfd); box-shadow: inset 0 1px #dbdbdb; transition: filter .12s; }
.de-wd .wd-tab:hover { filter: brightness(1.12); }
.de-wd .wd-tab[aria-selected=true] { color: #0b3a66; text-shadow: none; height: 32px; margin-top: -2px;
  background: linear-gradient(to bottom, #fafeff, #dcfaff 30%, #b3f4ff 60%, #81edff); box-shadow: inset 0 2px #fff; }
.de-wd .wd-tab b { display: inline-block; min-width: 20px; height: 17px; margin-left: 7px; padding: 0 5px; border-radius: 9px;
  font: bold 11px/17px Arial, sans-serif; text-shadow: none; color: #0b3a66; background: rgba(255,255,255,.85); vertical-align: 1px; }
.de-wd .wd-tab[aria-selected=true] b { color: #fff; background: #1677c9; }
/* the grid */
.de-wd .wd-grid { left: 16px; top: 102px; width: 548px; height: 446px; overflow-y: auto; overflow-x: hidden; padding: 10px;
  display: grid; grid-template-columns: repeat(4, 122px); grid-auto-rows: min-content; gap: 10px; align-content: start;
  scrollbar-width: thin; scrollbar-color: #4db9f7 rgba(0,0,0,.08); border-radius: 0 3px 3px 3px; }
.de-wd .wd-sect { grid-column: 1 / -1; height: 18px; margin-top: 4px; display: flex; align-items: center; gap: 8px;
  font: bold 12px/1 Arial, sans-serif; color: #2b4656; letter-spacing: .4px; text-transform: uppercase; }
.de-wd .wd-sect::after { content: ''; flex: 1; height: 1px; background: linear-gradient(to right, #8fa3ae, transparent); }
.de-wd .wd-tile { position: relative; height: 152px; margin: 0; padding: 0; cursor: inherit; text-align: center; border-radius: 7px;
  border: 2px solid var(--rc, #c9d3dc); color: #1c2b36;
  background: radial-gradient(ellipse 80% 60% at 50% 38%, #ffffff, #e9f0f4 60%, #d3dde3);
  box-shadow: 0 1px 2px rgba(20,40,55,.35), inset 0 0 0 1px rgba(255,255,255,.8);
  transition: transform .14s cubic-bezier(.2,.9,.3,1.3), box-shadow .14s, filter .14s; overflow: hidden; }
.de-wd .wd-tile:hover { transform: translateY(-3px); box-shadow: 0 6px 12px rgba(20,40,55,.35), 0 0 10px var(--rg, rgba(255,255,255,.6)), inset 0 0 0 1px #fff; }
.de-wd .wd-tile[aria-selected=true] { box-shadow: 0 0 0 3px #fff, 0 0 0 5px #1593d6, 0 0 16px var(--rg, rgba(120,220,255,.8)); }
.de-wd .wd-tile[data-rarity=super], .de-wd .wd-tile[data-rarity=ultra] { box-shadow: 0 1px 2px rgba(20,40,55,.35), 0 0 7px var(--rg), inset 0 0 0 1px rgba(255,255,255,.8); }
.de-wd .wd-tile[data-rarity=ultra]::after { content: ''; position: absolute; inset: -40%; pointer-events: none;
  background: linear-gradient(115deg, transparent 42%, rgba(255,248,210,.75) 50%, transparent 58%); animation: wd-shine 3.6s ease-in-out infinite; }
.de-wd .wd-tile .art { position: absolute; left: 13px; top: 8px; }
.de-wd .wd-tile > .rr, .de-wd .wd-tile > .nm, .de-wd .wd-tile > .wh, .de-wd .wd-tile > .sp, .de-wd .wd-tile > .eq, .de-wd .wd-tile > .lk { z-index: 2; }
.de-wd .wd-tile::after { z-index: 1; }
.de-wd .wd-tile .nm { position: absolute; left: 4px; right: 4px; top: 108px; font: bold 12px/14px Arial, sans-serif;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.de-wd .wd-tile .wh { position: absolute; left: 4px; right: 4px; top: 124px; font: 10px/12px Arial, sans-serif; color: #4f6472;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.de-wd .wd-tile .rr { position: absolute; left: 5px; top: 5px; padding: 0 4px; border-radius: 3px; font: bold 9px/13px Arial, sans-serif;
  color: #fff; background: var(--rk, #56636e); letter-spacing: .3px; }
.de-wd .wd-tile[data-rarity=common] .rr { color: #2c3740; background: #dfe5ea; box-shadow: inset 0 0 0 1px #9aa6b0; }
.de-wd .wd-tile[data-rarity=ultra] .rr { color: #4a2c00; background: linear-gradient(#ffe7a0, #ffc23d); }
.de-wd .wd-tile .eq { position: absolute; right: -24px; top: 9px; width: 92px; transform: rotate(38deg); z-index: 2;
  font: bold 9px/15px Arial, sans-serif; letter-spacing: .6px; color: #fff; text-shadow: 0 1px #7a3200;
  background: linear-gradient(#ffb12a, #f07d00); box-shadow: 0 1px 3px rgba(0,0,0,.35); }
.de-wd .wd-tile .sp { position: absolute; right: 5px; top: 88px; min-width: 22px; height: 16px; padding: 0 4px; border-radius: 8px;
  font: bold 10px/16px Arial, sans-serif; color: #fff; background: #1677c9; box-shadow: 0 0 0 1px #fff; }
.de-wd .wd-tile[data-wear=no] .art { filter: grayscale(.7) opacity(.65); }
.de-wd .wd-tile[data-wear=no] .wh { color: #a2441a; }
.de-wd .wd-tile[data-school] { --rc: var(--sc); --rg: color-mix(in srgb, var(--sc) 70%, transparent); }
.de-wd .wd-tile[data-school] .rr { background: var(--sc); color: var(--sk); }
.de-wd .wd-tile[data-locked] { background: repeating-linear-gradient(135deg, #e6eaed 0 8px, #dde2e6 8px 16px); border-style: dashed; }
.de-wd .wd-tile[data-locked] .art { filter: grayscale(1) brightness(.5) opacity(.45); }
.de-wd .wd-tile .lk { position: absolute; left: 50%; top: 40px; width: 30px; height: 26px; margin-left: -15px; border-radius: 5px;
  background: linear-gradient(#7d8b94, #4c5961); box-shadow: 0 2px 3px rgba(0,0,0,.35); }
.de-wd .wd-tile .lk::before { content: ''; position: absolute; left: 6px; top: -12px; width: 12px; height: 14px; border: 3px solid #6d7a83;
  border-bottom: 0; border-radius: 9px 9px 0 0; }
.de-wd .wd-empty { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  height: 200px; color: #2b4656; text-align: center; font: bold 15px/1.35 Arial, sans-serif; }
.de-wd .wd-empty small { font: 13px/1.35 Arial, sans-serif; color: #4f6472; }
.de-wd .wd-empty .box { width: 64px; height: 52px; border-radius: 6px; position: relative;
  background: linear-gradient(#ffd166, #f07d00); box-shadow: inset 0 -6px rgba(150,60,0,.35), 0 3px 6px rgba(0,0,0,.25); animation: wd-bob 2.4s ease-in-out infinite; }
.de-wd .wd-empty .box::before { content: ''; position: absolute; left: -4px; right: -4px; top: -8px; height: 14px; border-radius: 4px; background: linear-gradient(#fff1b8, #ffb12a); }
.de-wd .wd-empty .box::after { content: ''; position: absolute; left: 27px; top: -8px; width: 10px; bottom: 0; background: rgba(255,255,255,.55); }
.de-wd .wd-tile.skel { border-color: transparent; background: none; box-shadow: none; }
/* the detail panel */
.de-wd .wd-detail { position: absolute; left: 576px; top: 72px; width: 248px; height: 528px; border-radius: 4px; overflow: hidden;
  background: linear-gradient(to bottom, #eef6f9, #d6e1e7); box-shadow: inset 0 0 0 1px #7f8f99, 0 1px rgba(255,255,255,.6); }
.de-wd .wd-stage { position: absolute; left: 0; top: 0; width: 248px; height: 232px; overflow: hidden;
  background: radial-gradient(ellipse 60% 45% at 50% 58%, color-mix(in srgb, var(--rc, #9fe8ff) 55%, white), transparent 70%),
    linear-gradient(to bottom, #2a6d8f, #5fb7d8 55%, #c9eef9); border-bottom: 1px solid #7f8f99; }
.de-wd .wd-stage::before { content: ''; position: absolute; left: 34px; right: 34px; bottom: 18px; height: 26px; border-radius: 50%;
  background: radial-gradient(ellipse, rgba(255,255,255,.95), rgba(150,230,255,.45) 55%, transparent 72%); }
.de-wd .wd-stage[data-rarity=ultra]::after, .de-wd .wd-stage[data-rarity=super]::after { content: ''; position: absolute; inset: 0;
  background: conic-gradient(from 0deg at 50% 58%, transparent 0 20deg, color-mix(in srgb, var(--rc) 35%, transparent) 30deg, transparent 40deg 80deg,
    color-mix(in srgb, var(--rc) 35%, transparent) 90deg, transparent 100deg 140deg, color-mix(in srgb, var(--rc) 35%, transparent) 150deg, transparent 160deg 200deg,
    color-mix(in srgb, var(--rc) 35%, transparent) 210deg, transparent 220deg 260deg, color-mix(in srgb, var(--rc) 35%, transparent) 270deg, transparent 280deg 320deg,
    color-mix(in srgb, var(--rc) 35%, transparent) 330deg, transparent 340deg); animation: wd-spin 18s linear infinite; mix-blend-mode: screen; }
.de-wd .wd-stage[data-school] { --rc: var(--sc); }
.de-wd .wd-stage .big { position: absolute; left: 24px; top: 14px; z-index: 1; animation: wd-pop .3s cubic-bezier(.2,.9,.3,1.3); }
.de-wd .wd-stage[data-locked] .big { filter: grayscale(1) brightness(.55) opacity(.6); }
.de-wd .wd-info { position: absolute; left: 12px; right: 12px; top: 240px; }
.de-wd .wd-name { font: 900 18px/21px Arial, sans-serif; color: #10283c; max-height: 42px; overflow: hidden; }
.de-wd .wd-chips { display: flex; align-items: center; gap: 4px; margin-top: 6px; flex-wrap: wrap; }
.de-wd .wd-facts { margin: 9px 0 0; padding: 0; list-style: none; font: 12px/16px Arial, sans-serif; color: #2b4656; }
.de-wd .wd-facts li { display: flex; gap: 6px; padding: 3px 0; border-top: 1px solid rgba(80,110,125,.18); }
.de-wd .wd-facts li[data-k=Copies] > span:nth-child(2) { white-space: nowrap; }
.de-wd .wd-facts li > span:first-child { flex: none; width: 66px; font-weight: bold; color: #4f6472; }
.de-wd .wd-facts .trade { margin-left: -6px; padding: 0 7px; border-radius: 8px; font: bold 10px/16px Arial, sans-serif; color: #6d7a83;
  background: #e1e6e9; box-shadow: inset 0 0 0 1px #b2bcc2; white-space: nowrap; cursor: default; }
.de-wd .wd-why { position: absolute; left: 12px; right: 12px; bottom: 66px; padding: 6px 8px; border-radius: 4px;
  font: bold 11px/14px Arial, sans-serif; color: #6a2a00; background: linear-gradient(#fff4e6, #ffe6cc); border: 1px solid #f0a060; }
.de-wd .wd-why[data-tone=info] { color: #0b3a66; background: linear-gradient(#f2fbff, #dcf3fd); border-color: #8cc8e6; }
.de-wd .wd-equip.de-btn { left: 12px; right: 12px; bottom: 12px; height: 46px; padding: 0 26px; font-size: 20px; }
.de-wd .wd-equip[data-state=on]:disabled { color: #fff; border-color: #2e8a2e; text-shadow: 1px 0 #1d5e1d, -1px 0 #1d5e1d, 0 1px #1d5e1d, 0 -1px #1d5e1d;
  background: linear-gradient(to bottom, #d8ffd0, #8be27a 30%, #4fc63e 60%, #3aa52c); }
.de-wd .wd-equip[data-state=busy] { filter: saturate(.7); }
.de-wd .wd-none { position: absolute; inset: 0; display: grid; place-items: center; padding: 30px; text-align: center; font: bold 13px/1.4 Arial, sans-serif; color: #4f6472; }
/* the footer note, the toast, the load error */
.de-wd .wd-foot { position: absolute; left: 16px; top: 556px; width: 548px; height: 44px; display: flex; align-items: center; gap: 10px;
  padding: 0 12px; border-radius: 4px; font: 12px/15px Arial, sans-serif; color: #1c2b36; background: rgba(255,255,255,.4);
  box-shadow: inset 0 0 0 1px rgba(80,110,125,.35); }
.de-wd .wd-foot b { color: #10283c; }
.de-wd .wd-toast { position: absolute; left: 50%; bottom: 26px; z-index: 5; transform: translateX(-50%); display: flex; align-items: center; gap: 10px;
  padding: 10px 18px 10px 12px; border-radius: 22px; white-space: nowrap; color: #fff; font: bold 14px/18px Arial, sans-serif;
  text-shadow: 0 1px 1px rgba(0,60,0,.6); background: linear-gradient(#5fd34b, #2f9a22); border: 1px solid #1f6e16;
  box-shadow: 0 0 0 2px rgba(255,255,255,.75), 0 6px 18px rgba(0,0,0,.4); animation: wd-toast .35s cubic-bezier(.2,.9,.3,1.3); }
.de-wd .wd-toast::before { content: '✓'; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; color: #2f9a22;
  background: #fff; font: 900 15px/1 Arial, sans-serif; text-shadow: none; }
.de-wd .wd-toast small { display: block; font: 12px/15px Arial, sans-serif; opacity: .95; }
.de-wd .wd-toast[data-tone=error] { background: linear-gradient(#ffb06a, #e36f08); border-color: #a04a00; text-shadow: 0 1px 1px rgba(90,30,0,.6); }
.de-wd .wd-toast[data-tone=error]::before { content: '!'; color: #e36f08; }
.de-wd .wd-fail { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
  font: bold 15px/1.4 Arial, sans-serif; color: #10283c; text-align: center; padding: 0 120px; }
.de-wd .wd-fail .de-pill { position: relative; height: 32px; }
@keyframes wd-fade { from { opacity: 0; } }
@keyframes wd-in { from { opacity: 0; transform: translateY(14px) scale(.97); } }
@keyframes wd-pop { from { opacity: .2; transform: scale(.86); } }
@keyframes wd-toast { from { opacity: 0; transform: translate(-50%, 12px) scale(.9); } }
@keyframes wd-shine { 0%, 55% { transform: translateX(-60%); } 85%, 100% { transform: translateX(60%); } }
@keyframes wd-spin { to { transform: rotate(360deg); } }
@keyframes wd-bob { 50% { transform: translateY(-5px); } }
@media (prefers-reduced-motion: reduce) { .de-wd *, .de-wd *::before, .de-wd *::after { animation: none !important; transition: none !important; } }
`;

const h = (tag, cls, props = {}, kids = []) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k === 'on') for (const [t, f] of Object.entries(v)) e.addEventListener(t, f);
    else if (k === 'style') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(kids)) if (c) e.append(c);
  return e;
};
const RSHORT = r => RARITY[r]?.short || '';
const schoolVars = (el, s) => { el.style.setProperty('--sc', SCHOOL[s]?.fill || '#999'); el.style.setProperty('--sk', s === 'ra' ? '#4a3600' : '#fff'); };

let open = null;   // the one open Wardrobe: { close, focus(id) }

/** Open the Wardrobe over the current scene. -> close(). Opened again while open: selects focusId in it. */
export function openWardrobe({ focusId, world } = {}) {
  if (open) { open.focus(focusId, world); return open.close; }
  injectTheme();
  if (!document.getElementById('de-wardrobe-css')) document.head.append(h('style', null, { id: 'de-wardrobe-css', text: CSS }));
  const st = { info: api.peekInfo?.() || null, world, tab: 'outfit', selectedId: focusId || null, busy: false, error: null, loadError: null,
    toast: null, why: null };
  if (focusId && st.info) st.tab = tabOfId(st.info, focusId) || st.tab;
  const root = h('div', 'de-c de-wd', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Wardrobe', tabindex: '-1' });
  const dim = h('div', 'wd-dim', { on: { click: () => close() } });
  const panel = h('div', 'de-glass wd-panel');
  root.append(dim, panel);
  panel.append(h('div', 'wd-band'), h('div', 'de-title', { text: 'Wardrobe' }), h('div', 'wd-sub', { text: 'Looks are saved per world' }),
    h('button', 'wd-close', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', text: '✕', on: { click: () => close() } }));
  const worlds = h('div', 'wd-worlds', { role: 'group', 'aria-label': 'World' });
  const grad = h('div', 'wd-grad');
  const tabs = h('div', 'wd-tabs', { role: 'tablist' });
  const grid = h('div', 'de-well wd-grid', { role: 'listbox', 'aria-label': 'Your wearables' });
  const detail = h('div', 'wd-detail');
  const foot = h('div', 'wd-foot');
  panel.append(worlds, grad, tabs, grid, detail, foot);
  for (const w of WORLDS) worlds.append(h('button', 'de-pill', { type: 'button', 'data-world': w.id,
    text: w.label, on: { click: () => { st.world = w.id; st.why = null; render(); } } }));
  document.body.append(root);

  // the stage over the canvas: its rect and the scale the bridge gives its layers (bridge.js place())
  const canvas = document.getElementById('canvas');
  const place = () => {
    const r = canvas?.getBoundingClientRect(), s = r?.width ? r.width / 1024 : Math.min(innerWidth / 1024, innerHeight / 768);
    Object.assign(root.style, { left: (r?.width ? r.left : (innerWidth - 1024 * s) / 2) + 'px', top: (r?.width ? r.top : (innerHeight - 768 * s) / 2) + 'px',
      transform: `scale(${s})` });
  };
  place();
  const ro = canvas && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
  ro?.observe(canvas);
  addEventListener('resize', place);

  // no key reaches the game while it is up (SDL listens on window, bubbling): handled here, stopped at the root, and
  // a key aimed elsewhere (the chat line had focus) is taken in the capture phase
  const keys = e => {
    e.stopPropagation();
    if (e.type !== 'keydown') return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    const v = view(), list = v.tiles.filter(t => !t.skel), i = list.findIndex(t => t.id === v.selected?.id);
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[e.key];
    if (step && list.length && e.target.closest?.('.wd-grid, .de-wd') && !e.target.closest('.wd-worlds, .wd-tabs')) {
      e.preventDefault();
      const n = list[Math.max(0, Math.min(list.length - 1, (i < 0 ? 0 : i) + step))];
      select(n.id, true);
    } else if (e.key === 'Enter' && e.target === root) { e.preventDefault(); equip(); }
  };
  for (const t of ['keydown', 'keyup', 'keypress']) root.addEventListener(t, keys);
  const outside = e => { if (!root.contains(e.target)) { e.stopPropagation(); if (e.type === 'keydown' && e.key === 'Escape') close(); } };
  for (const t of ['keydown', 'keyup', 'keypress']) addEventListener(t, outside, true);
  root.addEventListener('wheel', e => e.stopPropagation());
  root.focus({ preventScroll: true });

  const unsub = api.onChange?.(info => { st.info = info; render(); }) || (() => {});
  const arts = new Map();   // tile id -> { el, body, handle }
  let bigArt = null, toastTimer = 0, closed = false;

  const view = () => st.info ? wardrobeView(st.info, st) : { tiles: [], tabs: [], selected: null, loading: true };
  function select(id, scroll) {
    st.selectedId = id; st.why = null;
    render();
    if (scroll) grid.querySelector(`[data-id="${CSS_ESC(id)}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  function load(force) {
    st.loadError = null;
    api.getInfo({ force }).then(info => {
      if (closed) return;
      st.info = info;
      if (st.world == null) st.world = info.appearance?.world === 0 ? 0 : 1;
      const first = focusId && !st.tabFixed;
      if (first) { st.tab = tabOfId(info, focusId) || st.tab; st.tabFixed = true; }
      render();
      if (first) grid.querySelector(`[data-id="${CSS_ESC(st.selectedId || focusId)}"]`)?.scrollIntoView({ block: 'nearest' });
    }, e => { if (!closed) { st.loadError = e?.message || 'Couldn\'t load your wardrobe.'; render(); } });
  }

  function render() {
    if (closed) return;
    const v = view();
    const w = st.world ?? (st.info?.appearance?.world === 0 ? 0 : 1);
    for (const b of worlds.children) b.setAttribute('aria-pressed', String(+b.dataset.world === w));
    // graduation, top right
    const g = v.graduation;
    grad.toggleAttribute('data-done', !!g?.graduated);
    grad.replaceChildren(...!g ? [] : g.graduated ? [h('div', null, { text: '🎓 Graduated' }), h('div', null, { style: { fontWeight: 'normal' }, text: 'Any outfit you own can be worn in either world.' })]
      : [h('div', null, { text: `Graduation · LV ${Math.min(g.level, g.levelRequired)}/${g.levelRequired} · Rivals beaten ${Math.min(g.opponents, g.opponentsRequired)}/${g.opponentsRequired}` }),
        h('div', 'bars', {}, [h('div', 'bar', { title: 'Character level' }, h('i', null, { style: { width: g.levelPct + '%' } })),
          h('div', 'bar', { title: 'Different opponents beaten in ranked duels' }, h('i', null, { style: { width: g.opponentsPct + '%' } }))])]);
    grad.title = g?.text || '';
    // tabs
    tabs.replaceChildren(...(v.tabs.length ? v.tabs : [{ id: 'outfit', label: 'Outfits' }, { id: 'hair', label: 'Hair' }, { id: 'accessory', label: 'Accessories' }, { id: 'dueldisk', label: 'Duel Disks' }])
      .map(t => h('button', 'wd-tab', { type: 'button', role: 'tab', 'aria-selected': String(t.id === st.tab), 'data-tab': t.id,
        on: { click: () => { if (st.tab !== t.id) { st.tab = t.id; st.selectedId = null; st.why = null; grid.scrollTop = 0; render(); } } } },
        [t.label, t.count != null ? h('b', null, { text: String(t.count) }) : null])));
    if (st.loadError) { renderFail(); return; }
    if (!st.info) { renderSkeleton(); return; }
    renderGrid(v);
    renderDetail(v);
    renderFoot(v);
  }
  function renderFail() {
    grid.replaceChildren(); detail.replaceChildren(); foot.replaceChildren();
    grid.append(h('div', 'wd-fail', { style: { gridColumn: '1 / -1', position: 'relative', height: '400px', padding: '0 40px' } },
      [h('div', null, { text: st.loadError }), h('button', 'de-pill', { type: 'button', text: 'Try again', on: { click: () => load(true) } })]));
  }
  function renderSkeleton() {
    if (grid.firstChild?.classList.contains('skel')) return;
    grid.replaceChildren(...Array.from({ length: 8 }, () => h('div', 'wd-tile skel', {}, h('div', 'de-skel', { style: { position: 'absolute', inset: '0', borderRadius: '7px' } }))));
    detail.replaceChildren(h('div', 'de-skel', { style: { position: 'absolute', left: '0', top: '0', width: '248px', height: '232px', borderRadius: '0' } }));
    foot.replaceChildren(h('span', null, { text: 'Opening your wardrobe…' }));
  }
  function tileEl(t, body) {
    let a = arts.get(t.id);
    if (!a || a.body !== body) {
      a?.handle.destroy();
      const el = h('button', 'wd-tile', { type: 'button', role: 'option', 'data-id': t.id, on: { click: () => select(t.id), dblclick: () => { select(t.id); equip(); } } });
      const art = h('div', 'art');
      el.append(art, h('span', 'rr'), h('div', 'nm'), h('div', 'wh'));
      a = { el, art, body, handle: null };
      arts.set(t.id, a);
    }
    const el = a.el;
    el.dataset.rarity = t.uniform ? '' : t.rarity;
    if (t.uniform) { el.dataset.school = t.school; schoolVars(el, t.school); }
    el.toggleAttribute('data-locked', t.locked);
    el.dataset.wear = t.wearable || t.locked ? 'yes' : 'no';
    el.setAttribute('aria-selected', String(t.id === st.selectedId));
    el.title = t.locked ? t.status : t.reason || t.name;
    el.querySelector('.rr').textContent = t.uniform ? 'RANK' : RSHORT(t.rarity);
    el.querySelector('.nm').textContent = t.name;
    el.querySelector('.wh').textContent = t.uniform ? t.status : t.wearable || !t.reason ? t.where : t.single && t.otherBody ? `${BODY_SIGN[t.single]} only for now` : `${t.where} only`;
    el.querySelector('.eq')?.remove(); el.querySelector('.sp')?.remove(); el.querySelector('.lk')?.remove();
    if (t.equipped) el.append(h('div', 'eq', { text: 'EQUIPPED' }));
    if (t.spares) el.append(h('div', 'sp', { title: `${t.spares} spare ${t.spares === 1 ? 'copy' : 'copies'}`, text: `×${t.spares + 1}` }));
    if (t.locked) el.append(h('div', 'lk'));
    return a;
  }
  function renderGrid(v) {
    const body = v.body, kids = [];
    if (v.empty) kids.push(h('div', 'wd-empty', {}, [h('div', 'box'), h('div', null, { text: v.emptyAll ? 'Your wardrobe is empty.' : v.emptyText }),
      h('small', null, { text: v.hint })]));
    for (const t of v.items) kids.push(tileEl(t, body).el);
    if (v.uniforms.length) {
      kids.push(h('div', 'wd-sect', { text: 'Rank uniforms' }));
      for (const t of v.uniforms) kids.push(tileEl(t, body).el);
    }
    // the same nodes in the new order (a tile keeps its drawn art)
    if (kids.length !== grid.children.length || kids.some((k, i) => grid.children[i] !== k)) grid.replaceChildren(...kids);
    for (const t of v.tiles) {
      const a = arts.get(t.id);
      if (!a.handle) a.handle = renderItemArt(a.art, t.item, { body, size: 96 });
    }
  }
  function renderDetail(v) {
    const t = v.selected;
    if (!t) { bigArt?.destroy(); bigArt = null; detail.replaceChildren(h('div', 'wd-none', { text: v.emptyAll ? 'Wearables you win from boxes appear here.' : 'Choose an item to see it here.' })); return; }
    const w = v.world, it = t.item, key = `${t.id}|${v.body}`;
    let stage = detail.querySelector('.wd-stage');
    if (!stage || stage.dataset.key !== key) {
      bigArt?.destroy();
      stage = h('div', 'wd-stage', { 'data-key': key });
      const big = h('div', 'big');
      stage.append(big);
      detail.replaceChildren(stage);
      bigArt = renderItemArt(big, it, { body: v.body, size: 200, pad: 0.06 });
    } else detail.replaceChildren(stage);
    stage.dataset.rarity = t.uniform ? '' : t.rarity;
    if (t.uniform) { stage.dataset.school = t.school; schoolVars(stage, t.school); } else { delete stage.dataset.school; stage.style.cssText = ''; }
    if (!t.uniform && RARITY[t.rarity]) stage.style.setProperty('--rc', RARITY[t.rarity].color);
    stage.toggleAttribute('data-locked', t.locked);
    const chips = h('div', 'wd-chips', {}, [
      t.uniform ? h('span', 'de-chip', { style: { background: SCHOOL[t.school]?.fill, color: t.school === 'ra' ? '#4a3600' : '#fff', boxShadow: 'none' }, text: 'Rank uniform' })
        : h('span', 'de-chip', { 'data-rarity': t.rarity, text: RARITY[t.rarity]?.label || t.rarity }),
      ...['male', 'female'].map(b => h('span', 'de-sex', { 'data-body': b, 'data-off': !(it.bodies || []).includes(b), title: (it.bodies || []).includes(b) ? `Made for ${b === 'male' ? 'male' : 'female'} characters` : `No ${b} version yet`, text: BODY_SIGN[b] })),
    ]);
    const facts = h('ul', 'wd-facts');
    const fact = (k, val, extra) => facts.append(h('li', null, { 'data-k': k }, [h('span', null, { text: k }), h('span', null, { text: val }), extra]));
    if (t.slotName) fact('Slot', t.slotName);
    fact('Worn in', t.uniform ? 'Both worlds' : t.worlds.length ? t.where : `${t.single ? BODY_SIGN[t.single] + ' characters' : 'No one'} for now`);
    if (t.uniform) fact('Status', t.status);
    else {
      fact('Copies', t.spares ? `${t.spares + 1} · ${t.spares} spare` : '1');
      if (t.spares) fact('Trade', '', h('span', 'trade', { title: 'Trading spare copies is coming soon', 'aria-disabled': 'true', text: 'Trade (coming soon)' }));
    }
    if (t.equippedIn.length) fact('Wearing', t.equippedIn.map(x => WORLD_LABEL[x]).join(' and '));
    if (it.notice && t.otherBody) fact('Note', it.notice);
    detail.append(h('div', 'wd-info', {}, [h('div', 'wd-name', { text: t.name }), chips, facts]));
    // the reason it can't be worn (or the server's last answer), then EQUIP
    const uniformNoApi = t.uniform && !t.locked && typeof api.setAppearance !== 'function';
    const why = st.why || (t.equipped ? null : t.locked ? { text: t.status + '.', tone: 'warn' } : !t.wearable ? { text: t.reason, tone: 'warn' }
      : uniformNoApi ? { text: 'Put this uniform on from the avatar editor for now.', tone: 'info' } : null);
    if (why) detail.append(h('div', 'wd-why', { 'data-tone': why.tone === 'info' ? 'info' : undefined, role: why.tone === 'error' ? 'alert' : undefined, text: why.text }));
    const can = !t.equipped && t.wearable && !t.locked && !uniformNoApi && !st.busy;
    detail.append(h('button', 'de-btn wd-equip', { type: 'button', 'data-state': st.busy ? 'busy' : t.equipped ? 'on' : undefined, disabled: !can,
      text: st.busy ? 'EQUIPPING…' : t.equipped ? 'EQUIPPED' : t.locked ? 'LOCKED' : 'EQUIP',
      title: can ? `Wear it in ${WORLD_LABEL[w]}` : undefined, on: { click: () => equip() } }));
  }
  function renderFoot(v) {
    const t = v.selected, kids = [];
    if (v.emptyAll) kids.push(h('span', null, {}, [h('b', null, { text: 'Tip: ' }), v.hint]));
    else if (t?.spares) kids.push(h('span', null, { text: `You have ${t.spares} spare ${t.spares === 1 ? 'copy' : 'copies'} of ${t.name}. Trading spares is coming soon.` }));
    else kids.push(h('span', null, {}, [h('b', null, { text: `${WORLD_LABEL[v.world]}: ` }), v.world === 1 && !v.graduation.graduated
      ? 'Academy outfits, rank uniforms and every duel disk. Domino outfits once you graduate.' : 'Your look here is separate from your other world\'s look.']));
    foot.replaceChildren(...kids);
  }
  function toast(text, sub, tone) {
    clearTimeout(toastTimer);
    panel.querySelector('.wd-toast')?.remove();
    const e = h('div', 'wd-toast', { role: 'status', 'data-tone': tone }, h('div', null, {}, [text, sub ? h('small', null, { text: sub }) : null]));
    panel.append(e);
    toastTimer = setTimeout(() => e.remove(), 4200);
  }
  async function equip() {
    const v = view(), t = v.selected;
    if (!t || st.busy || t.equipped || !t.wearable || t.locked) return;
    const w = v.world;
    st.busy = true; st.why = null; render();
    try {
      if (t.uniform) {
        if (typeof api.setAppearance !== 'function') throw { message: 'Put this uniform on from the avatar editor for now.' };
        const r = await api.setAppearance(w, uniformParts(st.info, t.item, w));
        if (r?.info) st.info = r.info;
      } else {
        const r = await api.equip(t.id, w);
        if (r?.info) st.info = r.info;
      }
      if (closed) return;
      toast(`${t.name} equipped in ${WORLD_LABEL[w]}!`, 'Other players will see your new look.');
    } catch (e) {
      if (closed) return;
      st.why = { text: e?.message || 'Something went wrong. Please try again.', tone: 'error' };
    } finally { st.busy = false; }
    render();
  }
  function close() {
    if (closed) return;
    closed = true; open = null;
    clearTimeout(toastTimer);
    unsub();
    ro?.disconnect();
    removeEventListener('resize', place);
    for (const t of ['keydown', 'keyup', 'keypress']) removeEventListener(t, outside, true);
    for (const a of arts.values()) a.handle?.destroy();
    bigArt?.destroy();
    root.remove();
  }
  open = { close, focus(id, wd) {
    if (wd === 0 || wd === 1) st.world = wd;
    if (id) { st.selectedId = id; st.tab = tabOfId(st.info, id) || st.tab; }
    load(true); render(); root.focus({ preventScroll: true });
  } };
  render();
  load(!!focusId);   // a reward just opened: the inventory must have it
  return close;
}
const CSS_ESC = s => (globalThis.CSS?.escape ? globalThis.CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));
