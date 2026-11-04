// The box shop's CSS (cosmetics/boxes.js), over theme.js's shared pieces. Game px (the layer scales: crisp at any DPR).
// The item plates are the native Avatar Parts list's (CShopAvatarWindow 商品プレート, sampled from the engine's 1x render):
// a chamfered plate (6 px off the top-left and bottom-right corners), a #97adb8 top edge, a #54636a bottom one;
// normal #f8f8f8 > #efefef > #dedede > #cacaca > #b6b6b6 > #a6a6a6 > #9c9c9c; selected #7ffeff > #78f6ff > #6ce7ff >
// #5fd7ff > #5bc8ff > #5bbeff; hover #daffff > #cbffff > #baffff > #a5ffff.
const PLATE = 'linear-gradient(to bottom, #f8f8f8, #efefef 15%, #dedede 32%, #cacaca 50%, #b6b6b6 68%, #a6a6a6 85%, #9c9c9c)';
const PLATE_ON = 'linear-gradient(to bottom, #7ffeff, #78f6ff 15%, #6ce7ff 32%, #5fd7ff 50%, #5bc8ff 68%, #5bbeff 85%, #5bbcff)';
const PLATE_HOVER = 'linear-gradient(to bottom, #daffff, #d5ffff 15%, #cbffff 32%, #baffff 55%, #abffff 80%, #a5ffff)';
const CHAMFER = c => `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px)`;

export const BOXES_CSS = `
.bx { position: absolute; left: 0; top: 0; width: 760px; height: 600px; pointer-events: none; }
.bx-hit { position: absolute; pointer-events: auto; }
.bx-main { position: absolute; inset: 0; pointer-events: none; }
.bx button { font-family: inherit; }

/* the plates: tabs, featured items, content tiles */
.bx-plate { position: absolute; border: 0; margin: 0; padding: 0; cursor: inherit; color: #1f2d36; background: ${PLATE};
  clip-path: ${CHAMFER(6)}; box-shadow: inset 0 1px #97adb8, inset 0 -1px #54636a, inset 1px 0 #ced2d4, inset -1px 0 #abb2b6; }
.bx-plate[data-on] { background: ${PLATE_ON}; color: #04324d; }
button.bx-plate:hover:not([data-on]):not(:disabled) { background: ${PLATE_HOVER}; }
button.bx-plate:active:not(:disabled) { filter: brightness(.93); }

/* the title plate over the native one ("Avatar Parts" baked in its art): covers it exactly */
.bx-title { left: 6px; top: 70px; width: 256px; justify-content: center; padding: 0 0 2px; }

/* tabs */
.bx-tabs { position: absolute; left: 36px; top: 112px; width: 470px; height: 34px; pointer-events: auto; }
.bx-tab { top: 0; width: 152px; height: 34px; display: flex; align-items: center; gap: 6px; padding: 0 10px 0 6px;
  font: bold 14px/1 Arial, sans-serif; text-align: left; transition: background .15s; }
.bx-tab .ic { flex: none; width: 28px; height: 28px; }
.bx-tab .lb { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.bx-tab .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bx-tab .pr { font: bold 10px/1 Arial, sans-serif; color: #4b5b66; }
.bx-tab[data-on] .pr { color: #0b4c70; }
.bx-tab[data-short]:not([data-on]) .pr { color: #a64b00; }

/* the hero */
.bx-hero { position: absolute; left: 36px; top: 152px; width: 470px; height: 196px; overflow: hidden; border-radius: 4px;
  pointer-events: auto; background: radial-gradient(ellipse 240px 150px at 50% 56%, var(--glow-a) 0%, transparent 72%),
  linear-gradient(to bottom, rgba(240,246,249,.94), rgba(196,208,216,.94));
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.8), inset 0 -24px 32px rgba(70,90,105,.18), 0 0 0 1px #7f8f99, 0 2px 4px rgba(0,0,0,.25); }
.bx-rays { position: absolute; left: 50%; top: 56%; width: 520px; height: 520px; margin: -260px 0 0 -260px; opacity: .42;
  background: repeating-conic-gradient(var(--glow-b) 0 7deg, transparent 7deg 20deg); border-radius: 50%;
  -webkit-mask: radial-gradient(circle, #000 0 18%, transparent 60%); mask: radial-gradient(circle, #000 0 18%, transparent 60%);
  animation: bx-spin 40s linear infinite; }
@keyframes bx-spin { to { transform: rotate(360deg); } }
.bx-feat-tag { position: absolute; left: 10px; top: 8px; height: 18px; display: flex; align-items: center; gap: 4px; padding: 0 8px;
  border-radius: 9px; font: bold 11px/1 Arial, sans-serif; color: #5b4000; background: linear-gradient(#fff1c4, #ffd977);
  box-shadow: inset 0 0 0 1px #c9921f; }
.bx-feat-tag::before { content: '★'; color: #c27a00; }
.bx-count { position: absolute; right: 10px; top: 8px; height: 18px; display: flex; align-items: center; padding: 0 8px; border-radius: 9px;
  font: bold 11px/1 Arial, sans-serif; color: #2a3d4a; background: rgba(255,255,255,.75); box-shadow: inset 0 0 0 1px #9fb0ba; }
.bx-side { position: absolute; top: 34px; width: 140px; display: flex; flex-direction: column; gap: 8px; }
.bx-side.l { left: 10px; } .bx-side.r { right: 10px; }
.bx-mini { position: relative; height: 66px; display: flex; align-items: center; gap: 6px; padding: 0 6px 0 4px; border-radius: 3px;
  background: rgba(255,255,255,.86); box-shadow: inset 0 0 0 1px var(--rc), inset 4px 0 var(--rc), 0 1px 3px rgba(0,0,0,.18);
  animation: bx-float 5s ease-in-out infinite; }
.bx-side.r .bx-mini { animation-delay: -2.5s; }
.bx-mini[data-rarity=ultra] { background: linear-gradient(100deg, rgba(255,247,222,.95), rgba(255,255,255,.88)); }
@keyframes bx-float { 50% { transform: translateY(-2px); } }
.bx-mini .art { flex: none; width: 50px; height: 50px; }
.bx-mini .de-chip { letter-spacing: .2px; padding: 0 5px; }
.bx-mini .mtx { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.bx-mini .nm { font: bold 12px/1.15 Arial, sans-serif; color: #1f2d36; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.bx-mini .bd { font: 10px/1.1 Arial, sans-serif; color: #50606b; white-space: nowrap; }
.bx-mini .own { position: absolute; right: 4px; top: 4px; }

/* the box itself (CSS): a gold lid with a ribbon, a front with its featured item in a glowing window, a side in
   shadow (an oblique view: 20 px deep, 11 up); an idle shimmer across the front, the window's glow breathing */
.bx-box { position: absolute; left: 50%; top: 16px; width: 164px; height: 164px; margin-left: -80px; }
.bx-box > i { position: absolute; inset: 0; display: block; }
.bx-box .sh { inset: auto -8px 0 -4px; height: 18px; border-radius: 50%; background: radial-gradient(ellipse at center, rgba(10,30,50,.5), transparent 70%); }
.bx-box .side { background: linear-gradient(to bottom, var(--b2), #000 160%); clip-path: polygon(140px 62px, 160px 51px, 160px 143px, 140px 154px); }
.bx-box .lidside { background: linear-gradient(to bottom, #d79a26, #8a5a0b); clip-path: polygon(144px 40px, 164px 29px, 164px 51px, 144px 62px); }
.bx-box .lidtop { background: linear-gradient(100deg, #fff4c8, #f6cd62 50%, #e0a02a); clip-path: polygon(-4px 40px, 144px 40px, 164px 29px, 16px 29px); }
.bx-box .ribtop { background: linear-gradient(to right, #b51f1f, #ff7466, #b51f1f); clip-path: polygon(62px 40px, 82px 40px, 102px 29px, 82px 29px); }
.bx-box .front { left: 0; top: 54px; width: 140px; height: 100px; inset: 54px auto auto 0; border-radius: 0 0 5px 5px; overflow: hidden;
  background: linear-gradient(100deg, var(--b2), var(--b0) 35%, var(--b1) 65%, var(--b2));
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.45), inset 0 0 0 3px var(--trim), inset 0 -12px 18px rgba(0,0,0,.35); }
.bx-box .front::after { content: ''; position: absolute; inset: 0; background: linear-gradient(115deg, transparent 35%, rgba(255,255,255,.5) 48%, transparent 60%);
  transform: translateX(-120%); animation: bx-shine 4.2s ease-in-out infinite 1s; }
@keyframes bx-shine { 0%, 55% { transform: translateX(-120%); } 85%, 100% { transform: translateX(120%); } }
.bx-box .lid { inset: 40px auto auto -4px; width: 148px; height: 22px; border-radius: 2px;
  background: linear-gradient(to bottom, #fff0b3, #f0b33a 55%, #b47813); box-shadow: inset 0 1px #fffbe2, 0 2px 0 rgba(90,55,5,.6), 0 0 0 1px #8a5a0b; }
.bx-box .lid::before { content: ''; position: absolute; left: 66px; top: -1px; width: 20px; height: 24px;
  background: linear-gradient(to right, #b51f1f, #ff6a5a 50%, #b51f1f); box-shadow: 0 0 0 1px #7a1010; }
.bx-box .win { position: absolute; left: 20px; top: 14px; width: 100px; height: 62px; border-radius: 5px; overflow: hidden;
  background: radial-gradient(circle at 50% 60%, #fffbe6, var(--glow-b) 55%, var(--b2) 130%);
  box-shadow: inset 0 0 0 2px var(--trim), inset 0 0 14px rgba(0,0,0,.45), 0 0 10px var(--glow-b); animation: bx-pulse 2.6s ease-in-out infinite; }
@keyframes bx-pulse { 50% { box-shadow: inset 0 0 0 2px var(--trim), inset 0 0 14px rgba(0,0,0,.3), 0 0 22px var(--glow-b); } }
.bx-box .win .art { position: absolute; left: 50%; top: 50%; width: 72px; height: 72px; margin: -38px 0 0 -36px; filter: drop-shadow(0 0 4px #fff); }
.bx-box .word { position: absolute; left: 0; right: 0; bottom: 6px; text-align: center; color: #fff; font: 900 11px/1 Arial, sans-serif;
  letter-spacing: 1.5px; text-shadow: 1px 0 rgba(0,0,0,.6), -1px 0 rgba(0,0,0,.6), 0 1px rgba(0,0,0,.6), 0 -1px rgba(0,0,0,.6); }
.bx-spark { position: absolute; width: 12px; height: 12px; background: #fff; pointer-events: none;
  clip-path: polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%); animation: bx-twinkle 2.4s ease-in-out infinite; }
@keyframes bx-twinkle { 0%, 100% { opacity: 0; transform: scale(.4) rotate(0); } 50% { opacity: 1; transform: scale(1) rotate(45deg); } }

/* odds */
.bx-odds { position: absolute; left: 36px; top: 354px; width: 470px; height: 44px; pointer-events: auto; }
.bx-odds .hd { position: absolute; left: 0; top: 0; right: 0; height: 16px; display: flex; align-items: center; justify-content: space-between;
  font: bold 11px/1 Arial, sans-serif; letter-spacing: .6px; color: #23343f; text-shadow: 0 1px rgba(255,255,255,.7); }
.bx-link { border: 0; background: none; padding: 2px 4px; margin: -2px -4px; cursor: inherit; font: bold 11px/1 Arial, sans-serif; color: #0a5f97;
  border-radius: 3px; text-shadow: 0 1px rgba(255,255,255,.7); }
.bx-link:hover { color: #0b7fcf; background: rgba(255,255,255,.55); }
.bx-link::after { content: ' ▸'; }
.bx-bar { position: absolute; left: 0; right: 0; top: 20px; height: 22px; display: flex; border-radius: 3px; overflow: hidden;
  box-shadow: 0 0 0 1px #6f818c, 0 1px 2px rgba(0,0,0,.25); background: #e7ecef; }
.bx-seg { position: relative; min-width: 22px; display: flex; align-items: center; justify-content: center; gap: 4px; overflow: hidden;
  font: bold 11px/1 Arial, sans-serif; color: #1d2a33; white-space: nowrap;
  background: linear-gradient(to bottom, rgba(255,255,255,.6), rgba(255,255,255,0) 50%, rgba(0,0,0,.08)), var(--rc); }
.bx-seg + .bx-seg { box-shadow: -1px 0 rgba(0,0,0,.25); }
.bx-seg[data-rarity=rare] { color: #033a55; } .bx-seg[data-rarity=super] { color: #2c0f63; } .bx-seg[data-rarity=ultra] { color: #4a2a00; }
.bx-seg .nm { overflow: hidden; text-overflow: ellipsis; }
.bx-seg[data-narrow] .nm { display: none; }
.bx-pityon { color: #8a4b00; }

/* pity meters */
.bx-pity { position: absolute; left: 36px; top: 404px; width: 470px; height: 38px; display: flex; gap: 8px; pointer-events: auto; }
.bx-meter { flex: 1; position: relative; border-radius: 3px; padding: 6px 8px 0; background: rgba(240,245,248,.92);
  box-shadow: inset 0 0 0 1px #8a9ba6, 0 1px 2px rgba(0,0,0,.18); }
.bx-meter .hd { display: flex; justify-content: space-between; font: bold 11px/1 Arial, sans-serif; color: #23343f; }
.bx-meter .hd b { font-weight: bold; color: #4b5c67; }
.bx-meter[data-next] .hd b { color: #b35a00; }
.bx-meter .tr { position: absolute; left: 8px; right: 8px; bottom: 7px; height: 7px; border-radius: 4px; background: #c7d1d7;
  box-shadow: inset 0 1px 2px rgba(0,0,0,.25); overflow: hidden; }
.bx-meter .fi { height: 100%; border-radius: 4px; transition: width .6s ease-out;
  background: linear-gradient(to bottom, rgba(255,255,255,.5), transparent 60%), var(--rc); box-shadow: 0 0 6px var(--rg); }
.bx-meter[data-next] .fi { animation: bx-ready 1.2s ease-in-out infinite; }
@keyframes bx-ready { 50% { filter: brightness(1.25); } }

/* price + open */
.bx-price { position: absolute; left: 36px; top: 450px; width: 150px; height: 56px; padding: 7px 10px 0; border-radius: 4px; pointer-events: auto;
  background: linear-gradient(to bottom, #f9fbfc, #dde5ea); box-shadow: inset 0 0 0 1px #7f8f99, inset 0 1px #fff, 0 1px 3px rgba(0,0,0,.25); }
.bx-price .v { font: 900 22px/1 Arial, sans-serif; color: #0d5d93; letter-spacing: .3px; white-space: nowrap; }
.bx-price .s { margin-top: 5px; font: bold 10px/1 Arial, sans-serif; letter-spacing: .4px; color: #8a4b00; text-transform: uppercase; }
.bx-open { left: 196px; top: 450px; width: 310px; height: 56px; pointer-events: auto; }
.bx-open[data-busy] { color: #fff8e0; }
.bx-why { position: absolute; left: 36px; top: 514px; width: 470px; min-height: 30px; pointer-events: auto; }
.bx-why .de-msg { position: relative; }
.bx-note { position: absolute; left: 36px; top: 516px; width: 470px; font: 11px/1.35 Arial, sans-serif; color: #2b3b46;
  padding: 5px 8px; border-radius: 3px; background: rgba(240,245,248,.8); box-shadow: inset 0 0 0 1px rgba(127,143,153,.6); pointer-events: auto; }
.bx-note b { color: #5b4000; }

/* arrows and side buttons (over the engine's own Confirm / Back pills: their art stays the game's) */
.bx-prev { left: 2px; top: 220px; pointer-events: auto; } .bx-next { left: 512px; top: 220px; pointer-events: auto; }
.bx-sidebtn { position: absolute; width: 223px; height: 48px; border: 0; margin: 0; padding: 0; border-radius: 24px; background: transparent;
  cursor: inherit; pointer-events: auto; color: #fff; font: bold 15px/1 Arial, sans-serif; letter-spacing: .5px;
  text-shadow: 1px 0 #0b4a66, -1px 0 #0b4a66, 0 1px #0b4a66, 0 -1px #0b4a66; transition: background .12s, box-shadow .12s; }
.bx-sidebtn:hover { background: rgba(255,255,255,.2); box-shadow: 0 0 10px rgba(160,240,255,.8); }
.bx-sidebtn:active { background: rgba(0,60,90,.18); }
.bx-sidebtn[data-cover] { background: linear-gradient(to bottom, #1a82aa, #92d1e4 12%, #3cb7dc 40%, #39c5ea 70%, #58e4f9);
  box-shadow: 0 0 0 1px #0f3f55, inset 0 1px #e8ffff; }
.bx-sidebtn[data-cover]:hover { filter: brightness(1.1); }

/* the category menu's banner label */
.bx-cat { position: absolute; width: 192px; height: 32px; pointer-events: none; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
.bx-cat .de-title { position: absolute; left: 0; top: 4px; width: 192px; height: 28px; justify-content: center; padding: 0 0 2px; font-size: 17px; }
.bx-cat b { position: absolute; right: -8px; top: -6px; padding: 3px 6px; border-radius: 3px; transform: rotate(8deg); color: #fff;
  font: 900 11px/1 Arial, sans-serif; letter-spacing: .5px; background: linear-gradient(#ff5a5a, #d11f2f); box-shadow: 0 0 0 1.5px #fff; }

/* skeletons (loading) */
.bx-skel-hero { position: absolute; inset: 0; }
.bx-sk { position: absolute; }

/* contents & odds */
.bx-contents { position: absolute; left: 36px; top: 112px; width: 470px; height: 466px; border-radius: 4px; pointer-events: auto;
  background: rgba(240,245,248,.95); box-shadow: inset 0 0 0 1px #7f8f99, 0 2px 4px rgba(0,0,0,.25); }
.bx-contents .hd { position: absolute; left: 10px; right: 10px; top: 0; height: 30px; display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid #b8c4cb; font: bold 13px/1 Arial, sans-serif; color: #1f2d36; }
.bx-contents .hd span { font: bold 11px/1 Arial, sans-serif; color: #50606b; }
.bx-list { position: absolute; left: 4px; top: 32px; width: 462px; height: 368px; padding: 0 6px 8px; overflow-x: hidden; overflow-y: auto;
  overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #5f9fd3 rgba(255, 255, 255, 0.35); }
.bx-grp { margin-top: 8px; }
.bx-grp .gh { display: flex; align-items: baseline; gap: 8px; margin: 0 0 5px 2px; font: bold 11px/1 Arial, sans-serif; letter-spacing: .6px; }
.bx-grp .gh .r { color: var(--rk); text-transform: uppercase; }
.bx-grp[data-rarity=ultra] .gh .r { color: #9a6200; }
.bx-grp .gh .e { color: #50606b; letter-spacing: 0; font-weight: normal; }
.bx-grid { display: grid; grid-template-columns: repeat(5, 82px); gap: 6px; }
.bx-tile { position: relative; height: 104px; border-radius: 3px; background: #fff; box-shadow: inset 0 0 0 1px var(--rc), 0 1px 2px rgba(0,0,0,.15); overflow: hidden; }
.bx-tile[data-rarity=ultra] { background: linear-gradient(to bottom, #fff6dc, #fff 60%); }
.bx-tile[data-rarity=super] { background: linear-gradient(to bottom, #f4edff, #fff 60%); }
.bx-tile[data-rarity=rare] { background: linear-gradient(to bottom, #e7f8ff, #fff 60%); }
.bx-tile .art { position: absolute; left: 11px; top: 4px; width: 60px; height: 60px; }
.bx-tile .nm { position: absolute; left: 3px; right: 3px; top: 64px; height: 24px; text-align: center; font: bold 10px/12px Arial, sans-serif; color: #1f2d36;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.bx-tile .ft { position: absolute; left: 3px; right: 3px; bottom: 3px; height: 13px; display: flex; align-items: center; justify-content: space-between; gap: 2px; }
.bx-tile .pc { font: bold 10px/1 Arial, sans-serif; color: #4b5c67; }
.bx-tile .sx { display: flex; gap: 1px; }
.bx-tile .sx .de-sex { min-width: 13px; height: 13px; font-size: 10px; border-radius: 2px; }
.bx-tile .fn { white-space: nowrap; display: inline-flex; align-items: center; gap: 2px; height: 13px; padding: 0 3px 0 0; border-radius: 2px; font: bold 9px/1 Arial, sans-serif; color: #fff; }
.bx-tile .fn[data-body=male] { background: #2f7fd6; } .bx-tile .fn[data-body=female] { background: #e0569a; }
.bx-tile .fn .de-sex { background: none; }
.bx-own { position: absolute; display: grid; place-items: center; width: 17px; height: 17px; border-radius: 50%; color: #fff; font: bold 11px/1 Arial, sans-serif;
  background: #1fae4b; box-shadow: 0 0 0 1.5px #fff, 0 1px 2px rgba(0,0,0,.3); }
.bx-tile .bx-own { right: 3px; top: 3px; }
.bx-copies { position: absolute; left: 3px; top: 3px; height: 15px; padding: 0 4px; border-radius: 8px; display: flex; align-items: center;
  font: bold 10px/1 Arial, sans-serif; color: #fff; background: #3a4c58; }
.bx-tile:not([data-owned]) .art { filter: saturate(.75); opacity: .9; }
.bx-rules { position: absolute; left: 10px; right: 10px; bottom: 4px; height: 60px; border-top: 1px solid #b8c4cb; padding-top: 5px;
  font: 10.5px/1.35 Arial, sans-serif; color: #33444f; overflow: hidden; }

/* the reveal: over the whole screen (the root is the window's, at 264, 0) */
.bx-rv { position: absolute; left: -264px; top: 0; width: 1024px; height: 768px; pointer-events: auto; overflow: hidden;
  background: radial-gradient(ellipse 520px 420px at 50% 40%, rgba(16,40,66,.72), rgba(3,10,20,.9)); animation: bx-fade .25s ease-out; }
@keyframes bx-fade { from { opacity: 0; } }
.bx-rv .stage { position: absolute; left: 512px; top: 260px; width: 0; height: 0; }
.bx-rv .glow { position: absolute; left: -260px; top: -260px; width: 520px; height: 520px; border-radius: 50%; opacity: .0;
  background: radial-gradient(circle, var(--rv) 0%, transparent 62%); transition: opacity .4s; }
.bx-rv[data-phase=shake] .glow { opacity: .55; animation: bx-breathe .5s ease-in-out infinite; }
@keyframes bx-breathe { 50% { transform: scale(1.12); } }
.bx-rv .rays { position: absolute; left: -440px; top: -440px; width: 880px; height: 880px; border-radius: 50%; opacity: 0;
  background: repeating-conic-gradient(var(--rv) 0 6deg, transparent 6deg 16deg);
  -webkit-mask: radial-gradient(circle, #000 0 12%, transparent 62%); mask: radial-gradient(circle, #000 0 12%, transparent 62%); }
.bx-rv[data-phase=card] .rays, .bx-rv[data-phase=done] .rays { opacity: .5; animation: bx-spin 30s linear infinite; transition: opacity .5s; }
.bx-rv[data-tempo=special][data-phase=card] .rays, .bx-rv[data-tempo=special][data-phase=done] .rays { opacity: .75; }
.bx-rv .burst { position: absolute; left: -200px; top: -200px; width: 400px; height: 400px; border-radius: 50%; opacity: 0; pointer-events: none;
  background: radial-gradient(circle, #fff 0%, var(--rv) 30%, transparent 66%); }
.bx-rv[data-phase=card] .burst { animation: bx-burst .7s ease-out forwards; }
.bx-rv[data-tempo=special][data-phase=card] .burst { animation: bx-burst-big 1s ease-out forwards; }
@keyframes bx-burst { 0% { opacity: 1; transform: scale(.2); } 100% { opacity: 0; transform: scale(2.4); } }
@keyframes bx-burst-big { 0% { opacity: 1; transform: scale(.2); } 30% { opacity: 1; } 100% { opacity: 0; transform: scale(3.6); } }
.bx-rv .rvbox { position: absolute; left: -78px; top: -100px; transform: scale(1.35); }
.bx-rv .rvbox .bx-box { position: relative; left: 0; top: 0; margin: 0; }
.bx-rv[data-phase=shake] .rvbox { animation: bx-shake .42s ease-in-out infinite; }
.bx-rv[data-phase=shake][data-late] .rvbox { animation-duration: .22s; }
@keyframes bx-shake { 0%, 100% { transform: scale(1.35) rotate(0); } 20% { transform: scale(1.37) rotate(-4deg) translateX(-3px); }
  45% { transform: scale(1.34) rotate(3.5deg) translateX(3px); } 70% { transform: scale(1.37) rotate(-2.5deg); } }
.bx-rv[data-phase=card] .rvbox, .bx-rv[data-phase=done] .rvbox { display: none; }
.bx-rv .parts { position: absolute; left: 0; top: 0; }
.bx-rv .pt { position: absolute; left: -6px; top: -6px; width: 12px; height: 12px; background: var(--rv); opacity: 0;
  clip-path: polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%); }
.bx-rv[data-phase=card] .pt { animation: bx-fly 1.3s cubic-bezier(.15,.7,.3,1) forwards; }
@keyframes bx-fly { 0% { opacity: 1; transform: translate(0, 0) scale(.6); } 70% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(1.3) rotate(140deg); } }
.bx-rv .shine { position: absolute; left: -5px; top: -5px; width: 10px; height: 10px; border-radius: 50%; background: #fff; opacity: 0;
  box-shadow: 0 0 8px 3px var(--rv); }
.bx-rv[data-phase=done][data-tempo=special] .shine { animation: bx-twinkle2 2.2s ease-in-out infinite; }
@keyframes bx-twinkle2 { 0%, 100% { opacity: 0; transform: scale(.3); } 50% { opacity: .95; transform: scale(1); } }

.bx-card { position: absolute; left: 394px; top: 62px; width: 236px; height: 312px; border-radius: 10px; perspective: 900px; opacity: 0; }
.bx-rv[data-phase=card] .bx-card, .bx-rv[data-phase=done] .bx-card { opacity: 1; }
.bx-card .in { position: absolute; inset: 0; border-radius: 10px; padding: 10px 12px 0; text-align: center;
  background: linear-gradient(to bottom, #17283a, #0d1824); box-shadow: 0 0 0 2px var(--rc), 0 0 26px var(--rg), 0 10px 30px rgba(0,0,0,.6); }
.bx-rv[data-phase=card] .bx-card .in { animation: bx-flip .55s cubic-bezier(.2,.8,.3,1.15) both .12s; }
@keyframes bx-flip { from { transform: rotateY(95deg) scale(.82); filter: brightness(2.2); } to { transform: none; filter: none; } }
.bx-card[data-rarity=ultra] .in { background: linear-gradient(to bottom, #2a1d05, #120c02);
  box-shadow: 0 0 0 2px #fff2c0, 0 0 0 5px #ffc23d, 0 0 0 6px #8a5a0b, 0 0 40px rgba(255,194,61,.9), 0 10px 30px rgba(0,0,0,.6); }
.bx-card .rl { height: 20px; display: flex; align-items: center; justify-content: center; gap: 6px; font: 900 13px/1 Arial, sans-serif; letter-spacing: 2.5px;
  color: var(--rc); text-transform: uppercase; text-shadow: 0 0 8px var(--rg); }
.bx-card[data-rarity=ultra] .rl::before, .bx-card[data-rarity=ultra] .rl::after { content: '★'; font-size: 11px; }
.bx-card .well { position: relative; margin: 8px auto 0; width: 200px; height: 150px; border-radius: 6px; overflow: hidden;
  background: radial-gradient(circle at 50% 55%, #fff, var(--rc) 70%, var(--rk) 140%); box-shadow: inset 0 0 0 1px rgba(255,255,255,.7), inset 0 0 20px rgba(0,0,0,.25); }
.bx-card .well .art { position: absolute; left: 25px; top: 0; width: 150px; height: 150px; }
.bx-card .nm { margin-top: 10px; font: bold 18px/1.1 Arial, sans-serif; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bx-card .ln { margin-top: 6px; font: 12px/1.35 Arial, sans-serif; color: #c3d2dc; }
.bx-card .ln b { color: #ffe08a; font-weight: bold; }
.bx-card .dup { margin-top: 7px; font: bold 12px/1.3 Arial, sans-serif; color: #9fe6ff; }
.bx-new { position: absolute; right: -16px; top: -12px; padding: 5px 12px; border-radius: 4px; transform: rotate(12deg); color: #fff;
  font: 900 15px/1 Arial, sans-serif; letter-spacing: 1px; background: linear-gradient(#ff5a5a, #d11f2f); text-shadow: 0 1px rgba(0,0,0,.4);
  box-shadow: 0 0 0 2px #fff, 0 3px 8px rgba(0,0,0,.5); }
.bx-rv[data-phase=card] .bx-new { animation: bx-pop .4s cubic-bezier(.2,.9,.3,1.6) both .6s; }
@keyframes bx-pop { from { transform: rotate(12deg) scale(0); } }
.bx-rv .after { position: absolute; left: 262px; top: 386px; width: 500px; display: flex; flex-direction: column; align-items: center; gap: 8px; opacity: 0; }
.bx-rv[data-phase=done] .after { opacity: 1; transition: opacity .3s; }
.bx-rv .notice { width: 440px; padding: 7px 12px; border-radius: 4px; font: 12px/1.35 Arial, sans-serif; color: #ffe8b0; text-align: center;
  background: rgba(60,40,0,.55); box-shadow: inset 0 0 0 1px rgba(255,194,61,.6); }
.bx-rv .notice::before { content: '♂♀ '; color: #ffc23d; font-weight: bold; }
.bx-rv .row { display: flex; gap: 10px; }
.bx-rv .equip { position: relative; width: 356px; height: 50px; }
.bx-rv .equip[data-done]:disabled { color: #fff; border-color: #1c7a35; text-shadow: 1px 0 #145a26, -1px 0 #145a26, 0 1px #145a26, 0 -1px #145a26;
  background: linear-gradient(to bottom, #d9ffd9, #6fe08a 12%, #2fbf57 50%, #22a548 70%, #4fd06f); }
.bx-rv .de-pill { position: relative; height: 36px; }
.bx-rv .again { width: 250px; padding: 0 26px; } .bx-rv .done { width: 120px; }
.bx-rv .wd { font-size: 12px; color: #9fe6ff; text-shadow: none; }
.bx-rv .wd:hover { background: rgba(255,255,255,.1); color: #d4f6ff; }
.bx-rv .status { min-height: 18px; font: bold 13px/1.3 Arial, sans-serif; color: #b8ffc8; text-align: center; }
.bx-rv .status[data-bad] { color: #ffb08a; }
.bx-rv .foot { position: absolute; left: 0; right: 0; top: 650px; text-align: center; font: 11px/1 Arial, sans-serif; color: #8ea6b8; }
.bx-rv .skip { position: absolute; left: 0; right: 0; top: 520px; text-align: center; font: 12px/1 Arial, sans-serif; color: rgba(200,220,235,.7); }
.bx-rv:not([data-phase=shake]) .skip { display: none; }

@media (prefers-reduced-motion: reduce) {
  .bx-rays, .bx-mini, .bx-box .front::after, .bx-box .win, .bx-spark, .bx-meter .fi { animation: none !important; }
  .bx-rv, .bx-rv * { animation: none !important; transition: none !important; }
  .bx-rv[data-phase=card] .rays, .bx-rv[data-phase=done] .rays { opacity: .35; }
  .bx-rv[data-phase=card] .after { opacity: 1; }
}
`;
