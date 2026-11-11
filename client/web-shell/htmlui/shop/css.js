// The card shop's CSS: the approved mockup A's skin and its button system (~/.cache/de-scratch/shopmock skin.css and
// buttons.css, README "Button system"), every rule under .ns (the shop's root) so nothing reaches the rest of the HTML UI.
// Game px: the 1024 x 768 screen, an 8-px grid. The shop's own sprites (the glass, the band, the digit font, the title
// plate) are cosmetics/shopart.js's .sa-* classes; the buttons are CSS only (no sprite, no border-image).
// Three changes from the mockup (owner, at approval):
//   - the grey list rows' hard gloss line sits under the label (70%), not through it (30%)
//   - the "New" badge is dark slate (white on #5d6a72: 6.0:1), not the mockup's light slate (white on #8d989f: 3.1:1)
//   - the pack page's hero has no Collected chip (the right column's panel says it)
const FONT = `Arial, 'Liberation Sans', Arimo, Helvetica, sans-serif`;
export const SHOP_CSS = `
.ns { position: absolute; left: 0; top: 0; width: 1024px; height: 738px; overflow: hidden; pointer-events: auto; z-index: 100;
  font: 14.3px/16px ${FONT}; color: #000; -webkit-font-smoothing: antialiased; outline: none; --ring: #0b57d0;
  --ink: #000; --sub: #3c4a52; --ur: #e8b42a; --sr: #a46cf0; --r: #2fc6f4; --n: #b9c3ca; background: #e9eef1; }
.ns[hidden] { display: none; }
.ns *, .ns *::before, .ns *::after { box-sizing: border-box; }
.ns .abs { position: absolute; }
.ns .t { font-size: 14.3px; line-height: 16px; white-space: nowrap; }
.ns .t12 { font-size: 12.5px; line-height: 14px; }
.ns .t18 { font-size: 18px; line-height: 21px; }
.ns .t23 { font-size: 23px; line-height: 26px; }
.ns .t28 { font-size: 28px; line-height: 32px; }
.ns .sub { color: var(--sub); }
.ns .w { color: #fff; text-shadow: 1px 1px 0 rgba(0,0,0,.55); }
.ns .ell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ns .wrap { white-space: normal; }

/* the screen: the shop's glass, nearly opaque; the slate band across the top (22% darker, so white on it passes AA) */
.ns .bg.sa-glass { left: -16px; top: -16px; width: 1056px; height: 770px; }
.ns .bg.sa-glass::after { content: ''; position: absolute; inset: 24px; background: rgba(236,242,245,.97); }
.ns .sa-band.top { left: 0; top: 0; width: 1024px; height: 80px; }
.ns .sa-band::after { content: ''; position: absolute; inset: 0; background: rgba(16,30,38,.22); pointer-events: none; }
.ns .sa-title { z-index: 1; }

/* readouts: not buttons. Flat, sunken, 2px corners, no gloss */
.ns .readout { position: absolute; display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px;
  font-size: 14.3px; color: #1a1a1a; white-space: nowrap; border-radius: 2px; background: #f4f8fa;
  box-shadow: inset 0 1px 3px rgba(0,35,55,.4), 0 0 0 1px rgba(30,48,58,.55); }
.ns .readout .k { color: #3c4a52; }
.ns .wallet { left: 552px; top: 16px; width: 244px; height: 48px; display: grid; grid-template-columns: auto 1fr auto; column-gap: 8px;
  align-items: center; }
.ns .wallet > .v { justify-self: end; display: flex; align-items: center; }

/* ---------------------------------------------------------------- the button system (mockup A) */
.ns .bt { position: absolute; box-sizing: border-box; margin: 0; -webkit-appearance: none; appearance: none; cursor: inherit; isolation: isolate;
  --h: 40px; --fs: 15px; --c: 6px; --capw: 9px; --caph: 17px; --capx: 10px;
  --t: #f2f4f5; --b: #b4b8bb; --g: #e4e7e9; --rim: #5a6a74; --fg: #1a1a1a; --sub: #33414a; --tsh: 0 1px 0 rgba(255,255,255,.6);
  --cap: linear-gradient(#8a99a3, #5a6a74); --line: 30%;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: var(--h); padding: 0 calc(var(--h) / 2);
  font: var(--fs)/1 ${FONT}; color: var(--fg); text-shadow: var(--tsh); white-space: nowrap; border: 0; background: none;
  --glass: linear-gradient(rgba(255,255,255,.75), rgba(255,255,255,.2) calc(var(--line) - 2%), rgba(255,255,255,0) var(--line)),
           linear-gradient(var(--t) 0, var(--t) var(--line), var(--b) var(--line), var(--b) calc(var(--line) + 36%), var(--g) 100%);
  --bevel: inset 0 1px 0 rgba(255,255,255,.95), inset 0 -3px 3px -1px rgba(255,255,255,.45); }
.ns .bt.rel { position: relative; }
.ns .bt.h32 { --h: 32px; --fs: 14px; --c: 5px; --capw: 6px; --caph: 12px; --capx: 8px; }
.ns .bt.h40 { --h: 40px; --fs: 15px; --c: 6px; --capw: 8px; --caph: 15px; --capx: 10px; }
.ns .bt.h48 { --h: 48px; --fs: 16px; --c: 7px; --capw: 10px; --caph: 19px; --capx: 12px; }
.ns .bt > * { flex: none; }
/* shape 1: the pill, with inward arrow caps */
.ns .bt.primary, .ns .bt.secondary, .ns .bt.nav { border: 1px solid var(--rim); border-radius: calc(var(--h) / 2); background: var(--glass);
  box-shadow: var(--bevel), 0 0 0 1px rgba(255,255,255,.8), 0 2px 3px rgba(0,30,50,.35); padding: 0 calc(var(--h) / 2 + var(--capw)); }
.ns .bt.primary::before, .ns .bt.secondary::before, .ns .bt.nav::before,
.ns .bt.primary::after, .ns .bt.secondary::after, .ns .bt.nav::after { content: ''; position: absolute; top: 50%; width: var(--capw);
  height: var(--caph); margin-top: calc(var(--caph) / -2); background: var(--cap); }
.ns .bt.primary::before, .ns .bt.secondary::before, .ns .bt.nav::before { left: var(--capx); clip-path: polygon(0 0, 100% 50%, 0 100%); }
.ns .bt.primary::after, .ns .bt.secondary::after, .ns .bt.nav::after { right: var(--capx); clip-path: polygon(100% 0, 0 50%, 100% 100%); }
/* shape 2: the chamfered plate (rim layer + glass layer, so the focus ring is not clipped) */
.ns .bt.seg, .ns .bt.list { --oct: polygon(var(--c) 0, calc(100% - var(--c)) 0, 100% var(--c), 100% calc(100% - var(--c)),
  calc(100% - var(--c)) 100%, var(--c) 100%, 0 calc(100% - var(--c)), 0 var(--c)); }
.ns .bt.seg::before, .ns .bt.list::before, .ns .bt.seg::after, .ns .bt.list::after { content: ''; position: absolute; z-index: -1; clip-path: var(--oct); }
.ns .bt.seg::before, .ns .bt.list::before { inset: 0; background: linear-gradient(#b0c1c9, var(--rim)); }
.ns .bt.seg::after, .ns .bt.list::after { inset: 1px; background: var(--glass); box-shadow: var(--bevel); }
/* a list row: the label sits on the bright band, the hard line under it (owner: the line cut through the labels) */
.ns .bt.list { justify-content: flex-start; padding: 0 16px; --line: 70%; }
.ns .bt.list { --glass: linear-gradient(rgba(255,255,255,.75), rgba(255,255,255,.2) 68%, rgba(255,255,255,0) 70%),
  linear-gradient(var(--t) 0, var(--t) 70%, var(--b) 70%, var(--b) 84%, var(--g) 100%); }
/* variants: colour tokens only */
.ns .bt.primary { --t: #ffc56e; --b: #ff9f00; --g: #ffe94d; --rim: #b35500; --fg: #3a1b00; --sub: #3a1b00; --tsh: 0 1px 0 rgba(255,240,200,.5);
  --cap: linear-gradient(#ffff8a, #ffff00 45%, #ffd400); }
.ns .bt.nav { --t: #5cc6ec; --b: #116fa0; --g: #47c8f0; --rim: #0d4275; --fg: #ffffff; --tsh: 0 1px 0 rgba(0,25,50,.9), 0 0 2px rgba(0,25,50,.5);
  --cap: linear-gradient(#e2ffff, #bcffff 40%, #98e0ff); width: 192px; }
.ns .bt[aria-selected=true], .ns .bt[aria-pressed=true] { --t: #9ff8ff; --b: #52c6f7; --g: #a6f2ff; --rim: #0b6f9c; --fg: #06283a; --sub: #053246;
  --tsh: 0 1px 0 rgba(255,255,255,.45); }
/* states: identical for every variant */
.ns .bt:hover:not(:disabled) { filter: brightness(1.08); }
.ns .bt:active:not(:disabled) { filter: brightness(.92); transform: translateY(1px); }
.ns .bt:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.ns .bt:disabled { opacity: .45; filter: grayscale(.6); transform: none; }
.ns .bt .n, .ns .bt .meta { color: var(--sub); }
.ns .bt .meta { margin-left: auto; font-size: 13px; }
.ns .bt.list .chev { margin-left: auto; width: 8px; height: 8px; border: solid var(--fg); border-width: 2px 2px 0 0; transform: rotate(45deg); margin-right: 3px; }
.ns .bt.list .meta + .chev { margin-left: 4px; }
.ns .bt .ck { position: relative; width: 16px; height: 16px; border-radius: 3px; background: #fff; border: 1px solid #4e5e68; box-shadow: inset 0 1px 2px rgba(0,0,0,.25); }
.ns .bt[aria-pressed=true] .ck::after { content: ''; position: absolute; left: 4px; top: 0; width: 5px; height: 10px; border: solid #06283a; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.ns .bt .sa-num { flex: none; }

/* ---------------------------------------------------------------- shared pieces */
.ns .well { position: absolute; background: linear-gradient(rgba(255,255,255,.82), rgba(236,244,248,.78)); border-radius: 3px;
  box-shadow: 0 0 0 1px rgba(80,110,125,.45), inset 0 1px 0 #fff; }
.ns .bar { position: absolute; height: 12px; padding: 1px; background: linear-gradient(#4e626d, #85979f); box-shadow: 0 0 0 1px #1b252c, inset 0 1px 2px rgba(0,0,0,.5); }
.ns .bar > i { display: block; height: 100%; background: linear-gradient(rgba(255,255,255,.7), rgba(255,255,255,.15) 45%, transparent 55%, rgba(0,0,0,.18)), #3fd0ff; }
.ns .bar[data-full] > i { background-color: #ffc400; }
.ns .dia { flex: none; display: inline-block; width: 11px; height: 11px; transform: rotate(45deg); margin: 0 4px 0 2px;
  box-shadow: 0 0 0 1px #2b3b44; background: linear-gradient(135deg, #fff, #b9c3ca); }
.ns .dia[data-r=R] { background: linear-gradient(135deg, #e0fbff, #2fc6f4); }
.ns .dia[data-r=SR] { background: linear-gradient(135deg, #f2e6ff, #a46cf0); }
.ns .dia[data-r=UR] { background: linear-gradient(135deg, #fff7cf, #e8b42a 60%, #b27a0c); }
/* small tags on banners and the pack hero: over the pack art, the featured cards and the carousel (z-index 6), whatever order they are built in; white on a deep fill (AA), the yellow one dark brown */
.ns .tag { position: absolute; z-index: 6; height: 20px; line-height: 20px; padding: 0 16px 0 8px; font-size: 12.5px; color: #fff; white-space: nowrap;
  background: linear-gradient(#5e7480, #34464f); box-shadow: 0 0 0 1px rgba(10,20,25,.6); clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%); }
.ns .tag[data-k=update] { background: linear-gradient(#ffd75e, #ffb21c); color: #3a1b00; }
.ns .tag.cy, .ns .tag[data-k=deck] { background: linear-gradient(#1676a8, #0e6593); }
.ns .tag[data-k=leaving] { background: linear-gradient(#c8301b, #a82313); }
.ns .tag[data-k=bought] { background: linear-gradient(#2f8a4e, #1f6b3a); }
.ns .tag[data-k=unlocked] { background: linear-gradient(#7b45cf, #5a2aa8); }
.ns .tag.time { clip-path: none; padding: 0 10px; background: #2b3d46; }
.ns .redot { position: absolute; z-index: 2; width: 18px; height: 18px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #d8402c, #b81a12 60%);
  box-shadow: 0 0 0 1.5px #fff, 0 1px 3px rgba(0,0,0,.4); color: #fff; font-size: 12px; line-height: 18px; text-align: center; pointer-events: none; }
.ns .scroll { overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #2aa8d8 rgba(78,98,109,.25); }
.ns .scroll::-webkit-scrollbar { width: 8px; }
.ns .scroll::-webkit-scrollbar-track { border-radius: 4px; background: rgba(78,98,109,.25); }
.ns .scroll::-webkit-scrollbar-thumb { border-radius: 4px; background: linear-gradient(90deg, #8fdcf6, #2aa8d8); box-shadow: inset 0 0 0 1px #0b5f86; }

/* a card face in its rarity frame (the frame's metal: gold UR, purple SR, cyan R, silver N), the corner badge, the copies */
.ns .rf { position: absolute; padding: 3px; background: linear-gradient(160deg, #f4f7f8, #c3ccd2 45%, #8d989f); box-shadow: 0 0 0 1px #1b252c, 0 2px 4px rgba(0,30,50,.35); }
.ns .rf.rel { position: relative; }
.ns .rf[data-r=R] { background: linear-gradient(160deg, #c9f7ff, #3fd0ff 40%, #0f8fc4); }
.ns .rf[data-r=SR] { background: linear-gradient(160deg, #eedcff, #a46cf0 42%, #5a2aa8); }
.ns .rf[data-r=UR] { background: linear-gradient(135deg, #fff7cf 0%, #e2a625 22%, #fff3ad 42%, #b27a0c 60%, #ffe58a 78%, #c98f17 100%); }
.ns .rf > .face { position: relative; width: 100%; height: 100%; overflow: hidden; background: #3b4a54; }
.ns .rf > .face > img { display: block; width: 100%; height: 100%; object-fit: cover; }
.ns .rf > .face > img:not([src]) { visibility: hidden; }
.ns .rf[data-r=UR] > .face::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(115deg, transparent 25%, rgba(255,246,200,.25) 42%, rgba(255,255,255,.4) 50%, rgba(255,246,200,.25) 58%, transparent 75%); }
.ns .rf[data-miss] > .face > img { filter: grayscale(1) brightness(.75) contrast(.8); opacity: .65; }
.ns .rf .ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 4px; text-align: center;
  font-size: 11px; line-height: 13px; color: rgba(255,255,255,.75); white-space: normal; }
.ns .rb { position: absolute; left: -4px; top: -6px; z-index: 2; padding: 0 5px; height: 17px; line-height: 17px; font-size: 12px; color: #000;
  border-radius: 2px; box-shadow: 0 0 0 1px #1b252c; background: linear-gradient(#f8fafb, #c3ccd2); }
.ns .rb[data-r=UR] { background: linear-gradient(#fff6c4, #f0c440 50%, #c98f17); }
.ns .rb[data-r=SR] { background: linear-gradient(#f2e6ff, #b98af4 50%, #7b45cf); color: #fff; text-shadow: 0 1px 0 rgba(40,0,80,.6); }
.ns .rb[data-r=R] { background: linear-gradient(#e0fbff, #6fdcff 50%, #1ea5d6); }
.ns .own { position: absolute; right: -2px; bottom: -2px; z-index: 2; min-width: 22px; height: 17px; line-height: 17px; padding: 0 4px; text-align: center;
  font-size: 12px; color: #fff; background: linear-gradient(#1f8fc6, #1676a8); box-shadow: 0 0 0 1px #0b4f6d; border-radius: 2px; }
/* "New": dark slate (white on #5d6a72 6.0:1; the mockup's #8d989f was 3.1:1) */
.ns .own[data-z] { background: linear-gradient(#5d6a72, #46535b); box-shadow: 0 0 0 1px #1b252c; }
.ns .pack { position: absolute; display: block; object-fit: fill; box-shadow: 0 0 0 1px rgba(0,0,0,.45), 3px 4px 8px rgba(0,30,60,.35);
  background: linear-gradient(160deg, #cfe9f5, #6fb9dc); }
.ns .pack:not([src]) { visibility: visible; }
.ns img.pack:not([src]) { content: ''; }

/* ---------------------------------------------------------------- home */
.ns .feed { position: absolute; left: 226px; top: 150px; width: 778px; height: 578px; padding-right: 12px; }
.ns .feed > .in { position: relative; width: 766px; }
.ns .banner { position: absolute; overflow: hidden; border-radius: 4px; cursor: inherit; text-align: left;
  box-shadow: 0 0 0 1px #3d8db3, 0 0 0 3px rgba(255,255,255,.75), 0 3px 8px rgba(0,40,70,.3);
  background: radial-gradient(ellipse 70% 120% at 30% 40%, #f4fdff, #bfeeff 55%, #7fd3f2); }
.ns .banner:focus-visible { outline: 2px solid var(--ring); outline-offset: 4px; }
.ns .banner .wash { position: absolute; inset: -8px; background-size: cover; background-position: 50% 30%; filter: blur(5px) saturate(1.2); opacity: .45; }
.ns .banner .glyph, .ns .hero .glyph { position: absolute; inset: 0; background: var(--sa-bnPack, none) 0 0 / 100% 100%; opacity: .35; mix-blend-mode: multiply; pointer-events: none; }
.ns .banner .shine { position: absolute; inset: 0; background: linear-gradient(100deg, rgba(255,255,255,.9) 0 50%, rgba(255,255,255,.5) 57%, rgba(255,255,255,0) 70%); }
.ns .banner .hd { position: absolute; left: 0; right: 0; top: 0; height: 30px; padding: 0 12px; display: flex; align-items: center; gap: 8px;
  background: linear-gradient(#5b6f7a, #3f525c); color: #fff; text-shadow: 1px 1px 0 rgba(0,0,0,.5); font-size: 16px; }
.ns .banner .hd .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ns .banner .hd .t12 { flex: none; }
.ns .banner .hit { position: absolute; inset: 0; z-index: 0; margin: 0; padding: 0; border: 0; background: none; cursor: inherit; }
.ns .banner .hit:focus-visible { outline: 2px solid var(--ring); outline-offset: -3px; }
.ns .banner > :not(.hit):not(.bt) { pointer-events: none; }
.ns .banner .bt { z-index: 3; }
.ns .feed .sect { position: absolute; left: 0; width: 766px; height: 24px; display: flex; align-items: center; gap: 8px; }
.ns .feed .sect::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, rgba(60,74,82,.5), rgba(60,74,82,0)); }
.ns .side .bt.list { width: 190px; }
.ns .side .well { left: 24px; width: 190px; }
.ns .empty { position: absolute; left: 0; right: 0; top: 160px; text-align: center; color: var(--sub); }

/* ---------------------------------------------------------------- the pack page */
.ns .hero { position: absolute; overflow: hidden; border-radius: 4px; box-shadow: 0 0 0 1px #3d8db3, 0 0 0 3px rgba(255,255,255,.75), 0 3px 8px rgba(0,40,70,.3);
  background: radial-gradient(ellipse 60% 90% at 50% 45%, #ffffff, #c6f0ff 50%, #6fcaee); }
.ns .hero .rays { position: absolute; left: 50%; top: 46%; width: 900px; height: 900px; margin: -450px; opacity: .5;
  background: repeating-conic-gradient(rgba(255,255,255,.9) 0 6deg, rgba(255,255,255,0) 6deg 18deg); -webkit-mask: radial-gradient(circle, #000 10%, transparent 55%); mask: radial-gradient(circle, #000 10%, transparent 55%); }
.ns .hero .floor { position: absolute; left: 0; right: 0; bottom: 0; height: 70px; background: linear-gradient(rgba(255,255,255,0), rgba(255,255,255,.6)); }
.ns .rar { position: absolute; display: grid; grid-template-columns: 26px 1fr 64px; row-gap: 6px; align-items: center; }
.ns .rar > :nth-child(3n) { text-align: right; }
.ns .dots { position: absolute; display: flex; gap: 7px; transform: translateX(-50%); }
.ns .dots > i { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,.7); box-shadow: 0 0 0 1px #4b6470; }
.ns .dots > i[data-on] { background: #ffd200; }
.ns .fcap { position: absolute; top: 614px; width: 100px; text-align: center; white-space: normal; font-size: 12.5px; line-height: 14px;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.ns .skel { background: linear-gradient(100deg, rgba(255,255,255,.25) 30%, rgba(255,255,255,.7) 50%, rgba(255,255,255,.25) 70%) 0 0 / 300% 100%,
  rgba(160,175,185,.35); animation: ns-skel 1.3s linear infinite; }
@keyframes ns-skel { from { background-position: 100% 0, 0 0; } to { background-position: -50% 0, 0 0; } }
.ns .msg { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; }
.ns .note { position: absolute; text-align: center; }
.ns .note[data-bad] { color: #a82313; }

/* ---------------------------------------------------------------- the details sheet (a3) */
.ns .sheet { position: absolute; inset: 0; z-index: 20; }
.ns .sheet > .dim { position: absolute; inset: 0; background: rgba(20,40,55,.55); animation: ns-fade .16s ease-out; }
.ns .sheet > .box { position: absolute; left: 40px; top: 40px; width: 944px; height: 672px; animation: ns-in .18s cubic-bezier(.2,.8,.3,1); }
.ns .sheet .sa-glass { left: 0; top: 0; width: 944px; height: 672px; }
.ns .sheet .sa-glass::after { content: ''; position: absolute; inset: 24px; background: rgba(236,242,245,.97); }
.ns .sheet .sa-band { left: 0; top: 0; width: 944px; height: 66px; }
.ns table.odds { position: absolute; border-collapse: collapse; font-size: 14.3px; }
.ns table.odds th, .ns table.odds td { white-space: nowrap; height: 28px; padding: 0 8px; text-align: right; border-bottom: 1px solid #b7c4cb; font-weight: normal; }
.ns table.odds th { color: #fff; background: linear-gradient(to right, #2f6fc4, #2559a8); }
.ns table.odds td:first-child, .ns table.odds th:first-child { text-align: left; }
.ns table.odds tr:nth-child(even) td { background: rgba(212,222,228,.6); }
.ns table.odds .dia { margin-right: 6px; }
.ns .grid { position: absolute; left: 370px; top: 132px; width: 558px; height: 526px; }
.ns .grid > .in { display: grid; grid-template-columns: repeat(7, 68px); column-gap: 8px; row-gap: 12px; padding: 14px 10px 16px 14px; }
.ns .gc { position: relative; width: 68px; }
.ns .gc .rf { position: relative; width: 62px; height: 90px; margin: 0 3px; }
.ns .gc .nm { display: block; margin-top: 6px; width: 72px; margin-left: -2px; text-align: center; font-size: 12.5px; line-height: 14px; }
.ns .grid .ghd { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; height: 20px; color: var(--sub); }
.ns .grid .ghd:not(:first-child) { margin-top: 8px; }
.ns .shard { display: inline-block; width: 12px; height: 16px; vertical-align: -3px; margin: 0 3px;
  clip-path: polygon(50% 0, 100% 30%, 80% 100%, 20% 100%, 0 30%);
  background: linear-gradient(120deg, #ffe3f1 8%, #ff5fa8 34%, #c8125f 58%, #ff9ccb 80%, #a00c4a); filter: drop-shadow(0 0 .6px #3a0018) drop-shadow(0 0 .6px #3a0018); }

/* ---------------------------------------------------------------- the reveal */
.ns .rv { position: absolute; inset: 0; z-index: 30; }
.ns .rv > .dim { position: absolute; inset: 0; background: radial-gradient(ellipse 70% 60% at 50% 45%, rgba(22,56,80,.9), rgba(6,16,24,.95)); animation: ns-fade .2s ease-out; }
.ns .rv .cards { position: absolute; left: 0; right: 0; display: grid; justify-content: center; }
.ns .rv .slot { position: relative; perspective: 900px; }
.ns .rv .flip { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform .42s cubic-bezier(.3,.7,.3,1); transform: rotateY(180deg); }
.ns .rv .slot[data-open] .flip { transform: none; }
.ns .rv .flip > * { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.ns .rv .back { transform: rotateY(180deg); border-radius: 3px; box-shadow: 0 0 0 1px #1b0d04, 0 4px 10px rgba(0,0,0,.45);
  background: radial-gradient(ellipse 30% 22% at 50% 50%, #1b120c 0 60%, #6b3a17 62%, transparent 64%),
    radial-gradient(ellipse 46% 40% at 50% 50%, #c48a3c 0 30%, #7a4318 60%, #4a240c), #4a240c; }
.ns .rv .back::after { content: ''; position: absolute; inset: 5%; border: 2px solid rgba(255,214,140,.45); border-radius: 2px; }
.ns .rv .rf { position: absolute; inset: 0; }
.ns .rv .rb, .ns .rv .own { opacity: 0; transition: opacity .2s; }
.ns .rv .slot[data-badges] .rb, .ns .rv .slot[data-badges] .own { opacity: 1; }
.ns .rv .slot[data-r=UR][data-open] .rf { box-shadow: 0 0 0 1px #1b252c, 0 0 18px 4px rgba(255,214,90,.8); }
.ns .rv .slot[data-r=SR][data-open] .rf { box-shadow: 0 0 0 1px #1b252c, 0 0 14px 3px rgba(190,140,255,.7); }
.ns .rv .nm { position: absolute; left: -8px; right: -8px; text-align: center; color: #fff; text-shadow: 1px 1px 0 rgba(0,0,0,.6); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; opacity: 0; transition: opacity .2s; }
.ns .rv .slot[data-badges] .nm { opacity: 1; }
.ns .rv .head { position: absolute; left: 0; right: 0; text-align: center; }
.ns .rv .foot { position: absolute; left: 0; right: 0; display: flex; justify-content: center; gap: 16px; }
.ns .rv .sum { display: flex; justify-content: center; gap: 16px; align-items: center; }
/* the native Booster Packs window's hotspot over a pack's art (screens/pack-contents.js): a small cyan plate on hover */
.pc-art::after { content: 'See contents'; position: absolute; left: 4px; right: 4px; bottom: 6px; height: 20px; display: none;
  font: 12.5px/20px ${FONT}; color: #06283a; text-align: center; white-space: nowrap;
  background: linear-gradient(#9ff8ff, #52c6f7 50%, #a6f2ff); box-shadow: 0 0 0 1px #0b6f9c, 0 2px 4px rgba(0,0,0,.35); }
.pc-art:hover::after, .pc-art:focus-visible::after { display: block; }
@keyframes ns-fade { from { opacity: 0; } }
@keyframes ns-in { from { opacity: 0; transform: translateY(8px); } }
@media (prefers-reduced-motion: reduce) { .ns .sheet > .dim, .ns .sheet > .box, .ns .rv > .dim, .ns .skel { animation: none; } .ns .rv .flip { transition: none; } }
`;

export function injectShopCss(doc = globalThis.document) {
  if (!doc || doc.getElementById('ns-shop-css')) return;
  const s = doc.createElement('style');
  s.id = 'ns-shop-css'; s.textContent = SHOP_CSS;
  doc.head.append(s);
}
