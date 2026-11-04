// The box shop's CSS (cosmetics/boxes.js), over the native shop's sprites (cosmetics/shopart.js) and theme.js's rarity
// frame. Game px, window-local to CShopAvatarWindow's root (264, 0; the layer scales: crisp at any DPR). The places are
// the native frame's, from the engine's 1x render: the dark band 16..528 x 3..92, the glass 23..521 x 95..582, the title
// plate 6..262 x 70..106, the side pills 531..754 (Confirm 481..529, Back 541..590), the pack display's columns 98 apart.
export const BOXES_CSS = `
.bx { position: absolute; left: 0; top: 0; width: 760px; height: 600px; pointer-events: none; }
.bx-main { position: absolute; inset: 0; pointer-events: none; }
.bx button, .bx .bx-list { pointer-events: auto; }
.bx button { -webkit-tap-highlight-color: transparent; }

/* the band: the selected item, three lines at most, centred on the panel's axis (272) as everything under it is */
.bx-band { position: absolute; left: 30px; top: 10px; width: 484px; }
.bx-band > div { height: 18px; overflow: hidden; text-overflow: ellipsis; text-align: center; }
.bx-title { left: 6px; top: 70px; width: 256px; }

/* the boxes: three price tags */
.bx-tabs { position: absolute; inset: 0; pointer-events: none; }
.bx-tab .nm, .bx-tab .pr { position: absolute; left: 0; right: 0; text-align: center; }
.bx-tab .nm { top: 6px; }
.bx-tab .pr { top: 24px; display: flex; justify-content: center; }

/* the header: the box's banner in the selection frame */
.bx-head .bn { left: 84px; top: 174px; width: 376px; height: 112px; background-color: rgba(120,220,235,.35); }
.bx-head .fr { left: 67px; top: 156px; width: 410px; height: 148px; }

/* the strip: the pack display's row */
.bx-strip { position: absolute; left: 28px; top: 306px; width: 488px; height: 150px; }
.bx-cell { position: absolute; margin: 0; padding: 0; border: 0; background: none; cursor: inherit; color: #000; }
.bx-cell > .sa-brackets { left: 0; top: 0; width: 96px; height: 104px; display: none; }
.bx-cell[data-on] > .sa-brackets, .bx-cell:hover > .sa-brackets { display: block; }
.bx-cell > .tag { left: 0; top: 108px; width: 96px; height: 42px; display: flex; align-items: center; justify-content: center; }
.bx-cell > .tag > span { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  max-width: 88px; white-space: normal; text-align: center; line-height: 15px; overflow-wrap: anywhere; text-wrap: balance; }
.bx-cell:focus-visible { outline: none; }
.bx-cell:focus-visible > .tag::after { content: ''; position: absolute; inset: 2px; outline: 1px dotted #000; }
.bx-sk { position: absolute; }
.bx-fail { position: absolute; left: 0; top: 30px; width: 488px; text-align: center; white-space: normal; }
.bx-prev { left: -6px; top: 326px; } .bx-next { left: 518px; top: 326px; }

/* the foot: the pity line, why Open can't be pressed, the two small buttons */
.bx-pity, .bx-why { position: absolute; left: 28px; width: 488px; text-align: center; }
.bx-pity { top: 466px; }
.bx-why { top: 486px; white-space: normal; line-height: 16px; max-height: 40px; overflow: hidden; }
.bx-open > span { padding: 0 34px; }
.bx-sidebtn { position: absolute; margin: 0; padding: 0; border: 0; border-radius: 24px; background: transparent; cursor: inherit;
  color: #fff; text-align: center; }
.bx-sidebtn > span { color: #fff; line-height: 49px; text-shadow: 1px 1px 0 rgba(0,40,70,.55); }
.bx-sidebtn:hover { background: rgba(255,255,255,.16); }

/* the contents & odds sheet: the yellow list window, its blue head row and grey rows */
.bx-sheet { left: 24px; top: 110px; width: 496px; height: 404px; }
.bx-sheet .hd { position: absolute; left: 16px; top: 16px; width: 464px; height: 28px; color: #fff;
  background: linear-gradient(to right, #6dbcfb, #6aaefb 60%, #5e93fc); box-shadow: inset 0 -1px #2b4f8f; }
.bx-sheet .hd .sa-t { color: #fff; text-shadow: 1px 1px 0 rgba(0,30,90,.5); line-height: 28px; }
.bx-list { position: absolute; left: 16px; top: 44px; width: 464px; height: 296px; overflow-y: auto; overflow-x: hidden;
  background: #e7e7e7; scrollbar-width: thin; scrollbar-color: #8e8e8e #c2c2c2; }
.bx-row, .bx-grp { position: relative; height: 28px; border-bottom: 1px solid #7a7a7a; }
.bx-row { background: #e7e7e7; } .bx-row:nth-child(even) { background: #d4d4d4; }
.bx-grp { height: 24px; background: linear-gradient(#d6ecff, #a9d2fb); }
.bx-row .sa-t, .bx-grp .sa-t, .bx-sheet .hd .sa-t { position: absolute; top: 0; overflow: hidden; text-overflow: ellipsis; }
.bx-row .sa-t { line-height: 28px; } .bx-grp .sa-t { line-height: 24px; }
/* the columns: the name, the body (centred), the chance and the owned count (numbers right-aligned on the column's
   right edge); the head row's labels centred over their columns */
.c-nm { left: 34px; width: 232px; } .bx-grp .c-nm, .bx-sheet .hd .c-nm { left: 8px; width: 258px; }
.c-bd { left: 270px; width: 62px; text-align: center; } .c-pc { left: 334px; width: 56px; text-align: right; } .c-ow { left: 398px; width: 50px; text-align: right; }
.bx-sheet .hd .c-bd, .bx-sheet .hd .c-pc, .bx-sheet .hd .c-ow { text-align: center; }
.bx-row .de-rf { padding: 2px; }
.bx-rules { position: absolute; left: 24px; top: 522px; width: 496px; white-space: normal; line-height: 18px; text-align: center; }

/* the wallet in the MP plate (its root at 795, 390): the shop's digits */
.bx-wallet { position: absolute; left: 0; top: 0; width: 229px; height: 84px; pointer-events: none; }
.bx-wallet .tot { position: absolute; right: 24px; top: 13px; }
.bx-wallet .ern { position: absolute; right: 24px; top: 54px; display: flex; align-items: center; gap: 8px; }
.bx-wallet .ern .sa-t { line-height: 14px; }

/* the category menu's banner, named */
.bx-cat { position: absolute; width: 194px; height: 30px; font-size: 17px; }

/* the reveal: over the whole screen, dimmed */
.bx-rv { position: absolute; left: -264px; top: 0; width: 1024px; height: 768px; pointer-events: auto; overflow: hidden; outline: none; }
.bx-rv .dim { position: absolute; inset: 0; background: rgba(2,9,16,.9); animation: bx-fade .2s ease-out; }
.bx-rv .wait { position: absolute; inset: 0; transition: opacity .2s; }
.bx-rv .wait .bn { left: 324px; top: 244px; width: 376px; height: 112px; }
.bx-rv .wait .fr { left: 307px; top: 226px; width: 410px; height: 148px; animation: bx-breathe .9s ease-in-out infinite alternate; }
.bx-rv .wait .nm { position: absolute; left: 0; right: 0; top: 384px; text-align: center; }
.bx-rv:not([data-phase=wait]) .wait, .bx-rv:not([data-phase=wait]) .skip { opacity: 0; pointer-events: none; }
.bx-rv .skip { position: absolute; left: 0; right: 0; top: 700px; text-align: center; opacity: .75; }
/* the column: the card (228 wide, on the screen's centre 512), and under it everything at the card's width */
.bx-card { position: absolute; left: 398px; top: 26px; width: 228px; height: 300px; opacity: 0; }
.bx-card .glow { position: absolute; inset: 0; background: var(--sa-glow) 0 0 / 100% 100% no-repeat; }
.bx-card[data-rarity=common] .glow { filter: grayscale(1) brightness(1.5); }
.bx-card[data-rarity=super] .glow { filter: hue-rotate(95deg) saturate(1.2); }
.bx-card[data-rarity=ultra] .glow { filter: hue-rotate(-140deg) saturate(1.5) brightness(1.15); }
.bx-card .de-rf { padding: 4px; }
.bx-card .sheen { position: absolute; left: 18px; top: 22px; width: 192px; height: 256px; overflow: hidden; pointer-events: none; }
.bx-card .sheen::before { content: ''; position: absolute; top: -20%; bottom: -20%; left: -60%; width: 55%; transform: translateX(-100%) skewX(-18deg);
  background: linear-gradient(to right, transparent, rgba(255,240,190,.55) 40%, rgba(255,255,255,.85) 50%, rgba(255,240,190,.55) 60%, transparent); }
.bx-rv[data-phase=card] .bx-card, .bx-rv[data-phase=done] .bx-card { opacity: 1; animation: bx-in .35s cubic-bezier(.2,.8,.3,1); }
.bx-rv[data-phase=card] .bx-card .sheen::before, .bx-rv[data-phase=done] .bx-card .sheen::before { animation: bx-sweep 1.1s ease-in-out .3s 1 both; }
.bx-rv .after { position: absolute; left: 398px; top: 334px; width: 228px; display: flex; flex-direction: column; align-items: center; gap: 6px;
  opacity: 0; pointer-events: none; transition: opacity .25s; }
.bx-rv .after > * { flex: none; max-width: 228px; }
.bx-rv[data-phase=done] .after { opacity: 1; pointer-events: auto; }
.bx-rv .after .nm { max-height: 48px; overflow: hidden; white-space: normal; text-align: center; text-wrap: balance;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.bx-rv .after .rl { margin-top: -4px; margin-bottom: 2px; }
.bx-rv .rl[data-rarity=common] { color: #e4eaee; } .bx-rv .rl[data-rarity=rare] { color: #8fe6ff; }
.bx-rv .rl[data-rarity=super] { color: #d6b8ff; } .bx-rv .rl[data-rarity=ultra] { color: #ffd862; }
.bx-rv .news { position: relative; width: 228px; height: 30px; display: flex; align-items: center; justify-content: center; }
.bx-rv .notice { white-space: normal; text-align: center; line-height: 16px; text-wrap: balance; }
.bx-rv .sa-pill { position: relative; width: 228px; }
.bx-rv .equip { margin-top: 2px; }
.bx-rv .status { min-height: 16px; text-align: center; white-space: normal; text-wrap: balance; }
.bx-rv .status[data-bad] { color: #ffd0b0; }
@keyframes bx-fade { from { opacity: 0; } }
@keyframes bx-breathe { from { opacity: .55; } to { opacity: 1; } }
@keyframes bx-in { from { opacity: 0; transform: scale(.94); } }
@keyframes bx-sweep { from { transform: translateX(-100%) skewX(-18deg); } to { transform: translateX(380%) skewX(-18deg); } }
@media (prefers-reduced-motion: reduce) {
  .bx-rv *, .bx-rv *::before { animation: none !important; transition: none !important; }
  .bx-rv[data-phase=done] .bx-card { opacity: 1; }
}
`;
