// Crafting's look (crafting/editor.js), in the deck editor's own visual language (screens/deck.js SEARCH_CSS, the
// editor's sprites, sampled): the blue bevel buttons (dk-btn: Filters, the side plates' gradient), the silver chips
// with a colour stripe (dk-chip: the type chips), the popup frame (dk-pop: grey body, silver bevel, the lavender header
// with its glowing outlined title, light strips for rows), the black number boxes with a grey rim and white digits
// (the Main / Fusion / Side counts), the card-type colours for tones, and the editor's Arial. The Shard is the
// magenta-rose crystal. Classes are scoped under .cr; the dk-* ones come from deck.js (deckCss()).
//
// WCAG AA: dark text only on the light strips (#cccccb, 13:1), white / green / red digits only on black, white text on
// the blue bevel with its outline (the editor's own). A disabled button is a flat grey bevel (exempt), its reason in a
// tooltip and in the aria-label.
import { FONT, fontCss } from '../controls/basic.js';

export const RARITY_LOOK = {
  N: { bg: 'linear-gradient(#ffffff, #d5dbdf 55%, #aab4ba)', fg: '#1a1a1a', rim: '#5a6a74', word: '#33414a' },
  R: { bg: 'linear-gradient(#d4f8ff, #5fd6ff 55%, #1ba2d6)', fg: '#03263a', rim: '#0b6f9c', word: '#004f7a' },
  SR: { bg: 'linear-gradient(#e8d6ff, #9a5ff0 50%, #5a2aa8)', fg: '#ffffff', rim: '#3b1a78', word: '#5a23a8' },
  UR: { bg: 'linear-gradient(135deg, #fff7cf, #e2a625 30%, #fff3ad 50%, #b27a0c 72%, #ffe58a)', fg: '#2e1c00', rim: '#7a5200', word: '#6e4700' },
};
const badge = Object.entries(RARITY_LOOK).map(([k, v]) =>
  `.cr .rb[data-r=${k}], .cr-mark[data-r=${k}] { background: ${v.bg}; color: ${v.fg}; --rim: ${v.rim}; }
.cr [data-word=${k}] { color: ${v.word}; }`).join('\n');

export const CSS = `
.cr { font: ${fontCss(14, 20)}; color: #000; -webkit-font-smoothing: antialiased; }
.cr, .cr *, .cr *::before, .cr *::after { box-sizing: border-box; }
.cr [hidden] { display: none !important; }
.cr .dk-btn, .cr .dk-chip { position: relative; cursor: inherit; pointer-events: auto; }
.cr .dk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 0 10px; line-height: 1; }
.cr .dk-chip { display: inline-flex; align-items: center; justify-content: center; line-height: 1; }
.cr .dk-btn:focus-visible, .cr .dk-chip:focus-visible { outline: 2px solid #ffe600; outline-offset: 1px; }
/* the editor has no disabled bevel: the blue one, flat and grey */
.cr .dk-btn:disabled { background: linear-gradient(#fff 0 1px, #eef0f2 1px, #d4d8dc 40%, #b9bec4 96%, #fff 96%); color: #4b5258;
  text-shadow: none; box-shadow: 0 0 0 1px #fff, 0 0 0 2px #8d919f; }
.cr .dk-btn:disabled svg.ic { stroke: #4b5258; filter: none; }
/* the second choice (Cancel): the chips' silver */
.cr .dk-btn.alt { background: linear-gradient(#f6f7f9, #d3d6dc); color: #1a1a1a; text-shadow: none; box-shadow: 0 0 0 1px #8a8a8a, 0 1px 2px rgb(0 0 60 / 0.35); }
.cr .dk-btn.alt:hover { background: linear-gradient(#fff, #e4e7ec); color: #000; }
.cr .dk-btn[aria-busy=true] { cursor: progress; }
.cr svg.ic { display: block; flex: none; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.cr .dk-btn svg.ic { stroke: #fff; filter: drop-shadow(0 0 1px #1059ff) drop-shadow(0 0 1px #1059ff); }
.cr .dk-btn:hover:not(:disabled) svg.ic { stroke: #fdff45; filter: drop-shadow(0 0 1px #ff9d10) drop-shadow(0 0 1px #ff9d10); }

/* the Shard */
.cr .shard, .cr-toast .shard { display: inline-block; flex: none; width: 9px; height: 12px; clip-path: polygon(50% 0, 100% 30%, 80% 100%, 20% 100%, 0 30%);
  background: linear-gradient(120deg, #ffe3f1 8%, #ff5fa8 34%, #c8125f 58%, #ff9ccb 80%, #a00c4a); filter: drop-shadow(0 0 .6px #3a0018); }
.cr .shard.lg { width: 14px; height: 18px; }

/* the editor's number box: black, a grey rim, white digits (the Main / Fusion / Side counts) */
.cr .nb { display: inline-flex; align-items: center; justify-content: center; flex: none; height: 24px; min-width: 40px; padding: 0 6px; line-height: 1;
  background: #000; color: #fff; box-shadow: inset 0 0 0 1px #bfbfbf, 0 0 0 1px #6e7486; font: ${fontCss(16, 24)}; letter-spacing: 1px;
  font-variant-numeric: tabular-nums; white-space: nowrap; }
.cr .nb[data-tone=gain] { color: #31f15a; }
.cr .nb[data-tone=spend], .cr .nb[data-tone=zero] { color: #ff6a5c; }
.cr .arw { flex: none; width: 0; height: 0; border-style: solid; border-width: 6px 0 6px 9px; border-color: transparent transparent transparent #1a1a1a; }

/* rarity: a small tag in the card frame's metal (the trunk rows' corner mark too) */
.cr .rb { display: inline-flex; align-items: center; justify-content: center; flex: none; min-width: 24px; height: 16px; padding: 0 3px; line-height: 1;
  font: bold 11px/1 ${FONT}; letter-spacing: .2px; border: 1px solid var(--rim); border-radius: 2px; box-shadow: inset 0 1px 0 rgba(255,255,255,.6); }
.cr .rb[data-r=SR] { text-shadow: 0 1px 0 rgba(40,0,90,.8); }
${badge}
/* no z-index: the marks layer sits under the search panel in document order, so the Filters popup covers them */
.cr-mark { position: absolute; display: flex; align-items: center; justify-content: center; min-width: 16px; height: 11px; padding: 0 2px;
  font: bold 9px/1 ${FONT}; border: 1px solid var(--rim); border-radius: 2px; pointer-events: none; box-shadow: 0 1px 1px rgba(0,0,0,.45); }
/* told apart at a glance: SR a flat deep violet with white letters; UR bigger, bright gold foil with a white halo */
.cr-mark[data-r=SR] { background: #6a2fd0; color: #fff; --rim: #2c0f66; text-shadow: none; }
.cr-mark[data-r=UR] { height: 13px; min-width: 19px; font-size: 10px; background: linear-gradient(#fffbd6, #ffd84a 45%, #e8a10c 55%, #ffe680);
  color: #3a2200; --rim: #6e4500; box-shadow: 0 0 0 1px #fff, 0 0 4px 1px rgba(255, 214, 64, .9); }

/* ---------------------------------------------------------------- the Deck header: the wallet and Dismantle Extras */
.cr-bar { position: absolute; display: flex; align-items: center; justify-content: flex-end; gap: 8px; height: 24px; pointer-events: none; }
.cr-bar .wallet { display: flex; align-items: center; gap: 6px; pointer-events: auto; }
.cr-bar .dk-btn { height: 24px; }

/* ---------------------------------------------------------------- the card detail's header bar row */
.cr-cardbar { position: absolute; height: 24px; display: flex; align-items: center; gap: 4px; padding: 0 4px; pointer-events: auto; }
.cr-cardbar .own { flex: none; display: flex; align-items: center; gap: 2px; min-width: 30px; color: #fff; font: ${fontCss(13, 20)};
  text-shadow: 0 0 2px #000, 0 0 1px #000, 0 0 1px #000; white-space: nowrap; font-variant-numeric: tabular-nums; }
.cr-cardbar .own svg.ic { stroke: #ffd862; filter: drop-shadow(0 0 1px #000); }
.cr-cardbar .dk-btn { flex: 1 1 0; min-width: 0; height: 20px; padding: 0 4px; gap: 3px; font: bold ${fontCss(12, 20)}; letter-spacing: .2px; }
.cr-cardbar .dk-btn .shard { margin-left: 1px; }

/* ---------------------------------------------------------------- popups: the editor's frame (dk-pop) */
.cr-modal { position: fixed; left: 0; top: 0; width: 1024px; height: 768px; transform-origin: 0 0; z-index: 2147483000; pointer-events: auto; outline: none; }
.cr-modal .dim { position: absolute; inset: 0; background: rgb(0 0 40 / 0.35); animation: cr-fade .14s ease-out; }
.cr-modal .dk-pop { animation: cr-fade .14s ease-out; }
.cr-modal .sub { position: absolute; left: 7px; right: 7px; top: 37px; height: 26px; display: flex; align-items: center; justify-content: center; line-height: 1;
  background: #cccccb; border-top: 1px solid #e0e1dc; border-bottom: 1px solid #a1a1a1; font: ${fontCss(14, 24)}; color: #000; }
/* the close box on the header bar (y 7..35): centred on it */
.cr-modal .x { position: absolute; top: 11px; right: 11px; width: 22px; height: 20px; padding: 0; font: bold 16px/1 ${FONT}; }
.cr-modal .panel { position: absolute; left: 7px; right: 7px; background: #cccccb; border-top: 1px solid #e0e1dc; border-bottom: 1px solid #a1a1a1; }
.cr-modal .lb { font: ${fontCss(14, 20)}; height: 20px; line-height: 20px; color: #000; }
.cr-modal .ba { display: flex; align-items: center; gap: 8px; }
.cr-modal .foot { position: absolute; left: 7px; right: 7px; bottom: 15px; height: 28px; display: flex; align-items: center; justify-content: center; gap: 16px; }
.cr-modal .foot .dk-btn { width: 128px; height: 28px; }
.cr-modal .note { font: ${fontCss(12, 16)}; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cr-modal .msg { position: absolute; left: 16px; right: 16px; font: ${fontCss(12, 16)}; color: #000; background: #ffd9d4; padding: 0 4px; }
.cr-modal .msg:empty { display: none; }

/* the Craft Card / Dismantle Card popup: 480 wide, 340 (368 with the locked strip). The top panel (164 high): the art
   (98 x 142) and the text block (name 24, 8, the columns 72: label 20, 4, the row 24, 8, the note 16) both centred
   down it; the two columns centred about their own axes (the stepper 121..289, Owned 321..457) */
.cr-modal.card .top { top: 70px; height: 164px; }
.cr-modal.card .art { position: absolute; left: 9px; top: 11px; width: 98px; height: 142px; background: #8d919f; box-shadow: 0 0 0 1px #000, 0 2px 4px rgb(0 0 40 / 0.45); }
.cr-modal.card .art > img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cr-modal.card .art > img:not([src]) { visibility: hidden; }
.cr-modal.card .art > .rb { position: absolute; right: -6px; top: -6px; }
.cr-modal.card .cn { position: absolute; left: 121px; width: 336px; top: 30px; height: 24px; line-height: 24px; text-align: center; font: ${fontCss(16, 24)}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cr-modal.card .mid { position: absolute; left: 121px; top: 62px; width: 168px; text-align: center; }
.cr-modal.card .stepper { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 4px; }
.cr-modal.card .stepper .dk-btn { width: 28px; height: 24px; padding: 0; font-size: 18px; }
.cr-modal.card .stepper .nb { min-width: 56px; justify-content: center; }
.cr-modal.card .mid .note { margin-top: 8px; height: 16px; line-height: 16px; }
.cr-modal.card .rule { position: absolute; left: 305px; top: 66px; width: 1px; height: 64px; background: #a1a1a1; box-shadow: 1px 0 0 #e0e1dc; }
.cr-modal.card .own { position: absolute; left: 321px; top: 62px; width: 136px; text-align: center; }
.cr-modal.card .own .ba { margin-top: 4px; justify-content: center; }
.cr-modal .shards { top: 240px; height: 40px; display: flex; align-items: center; gap: 8px; padding: 0 9px; }
.cr-modal .shards > .lb { width: 96px; }
.cr-modal .shards > .delta { margin-left: auto; font: ${fontCss(14, 20)}; }
.cr-modal [data-tone=gain].delta { color: #006b1d; }
.cr-modal [data-tone=spend].delta { color: #a10000; }
.cr-modal.card .locked { top: 284px; height: 24px; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 9px; }
.cr-modal.card .locked svg.ic { stroke: #6a2a00; }

/* Dismantle Extras: 480 x 440 */
.cr-modal.extras .row1 { position: absolute; left: 16px; right: 16px; top: 72px; height: 22px; display: flex; align-items: center; gap: 4px; }
.cr-modal .tabs { display: flex; gap: 4px; }
.cr-modal.extras .row1 .dk-chip { height: 22px; padding: 0 8px; }
.cr-modal.extras .row1 .sum { margin-left: auto; font: ${fontCss(13, 20)}; color: #000; }
.cr-modal.extras .list { position: absolute; left: 7px; right: 7px; top: 102px; height: 225px; background: #e0e1dc; border-top: 1px solid #8d919f; border-bottom: 1px solid #e0e1dc; }
.cr-modal.extras .list .yo2-scroll-list { scrollbar-color: #8d919f transparent; }
.cr-modal .row { display: flex; align-items: center; gap: 8px; padding: 0 9px; font: ${fontCss(14, 25)}; color: #000; background: #cccccb;
  border-bottom: 1px solid #a1a1a1; box-shadow: inset 0 1px 0 #e0e1dc; }
.cr-modal .row .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cr-modal .row .own { flex: none; width: 40px; text-align: right; font-variant-numeric: tabular-nums; }
.cr-modal .row .cost { flex: none; width: 64px; display: flex; align-items: center; justify-content: flex-end; gap: 3px; font-variant-numeric: tabular-nums; }
.cr-modal .empty { position: absolute; left: 16px; right: 16px; top: 64px; text-align: center; font: ${fontCss(14, 20)}; color: #000; white-space: normal; }
.cr-modal.extras .shards { top: 335px; }
.cr-modal.extras .msg { top: 380px; }

/* ---------------------------------------------------------------- the toast: a small dk-pop */
.cr-toast { position: fixed; z-index: 2147483001; pointer-events: none; transform-origin: 0 0; left: 0; top: 0; width: 1024px; height: 768px; }
.cr-toast > .dk-pop { left: 50%; top: 616px; transform: translateX(-50%); min-width: 272px; max-width: 520px; padding: 10px 12px;
  display: flex; align-items: center; gap: 8px; animation: cr-pop .18s ease-out; }
.cr-toast[data-over] > .dk-pop { top: 24px; }
.cr-toast .tx { position: relative; flex: 1; min-width: 0; padding: 4px 8px; background: #cccccb; border-top: 1px solid #e0e1dc; border-bottom: 1px solid #a1a1a1; }
.cr-toast .t1 { font: bold ${fontCss(14, 20)}; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cr-toast .t2 { display: flex; align-items: center; gap: 4px; font: ${fontCss(13, 18)}; color: #000; white-space: normal; }
.cr-toast .t2:empty { display: none; }
.cr-toast .t2 .sp { color: #4a1a90; }
.cr-toast .mk { position: relative; flex: none; width: 24px; height: 24px; border-radius: 3px; display: grid; place-items: center; }
.cr-toast [data-tone=ok] .mk { background: linear-gradient(#a8ffb8, #31f15a 55%, #179d33); box-shadow: 0 0 0 1px #0d5a1e; color: #063b12; }
.cr-toast [data-tone=error] .mk { background: linear-gradient(#ffb3a8, #ff4e46 55%, #930101); box-shadow: 0 0 0 1px #5a0000; color: #fff; }
.cr-toast svg.ic { display: block; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
@keyframes cr-fade { from { opacity: 0; } }
@keyframes cr-pop { from { opacity: 0; transform: translate(-50%, -6px); } }
@media (prefers-reduced-motion: reduce) { .cr *, .cr-toast * { animation: none !important; } }
`;
export function injectCss(doc = globalThis.document) {
  if (!doc || doc.getElementById('de-crafting-css')) return;
  const s = doc.createElement('style');
  s.id = 'de-crafting-css';
  s.textContent = CSS;
  doc.head.append(s);
}
