// The Missions window's CSS (rewards/missions.js), over the box shop's skin (cosmetics/shopart.js: the glass window, its
// dark band, the cyan title plate, the price tag plates for tabs, the Avatar Parts row plates, the side pills) and
// theme.js's base. Game px on the 1024x768 stage, an 8px grid, the Wardrobe's frame (cosmetics/wardrobe.js):
//   a 904x576 window centred on the stage (60, 96), 24px padding, 16px gutters;
//   a 72px band: the title plate (192), what's waiting, the wallet readout (208), Back (160);
//   the missions column (568 + 8 for the scroll bar) at 24: four 136px tab plates (36 tall; five while a limited-time event is on), a 48px strip (what the
//   tab is: the stockpile and reset, the first steps' bar; Claim all), the rows (64 tall, 8 apart);
//   the login calendar (272) at 608: a light panel, 30 days in a 6x5 grid of 36x40 cells, today's bonus under it.
// Contrast (WCAG AA, 4.5:1 for this text size): #000 / #24343d on the light glass and the grey plates; muted #3d4f5a
// (6.9:1 on #dedede); white on the band with the skin's shadow; #06283a on the cyan plates; white on #a3241a (6.4:1).
export const REWARDS_CSS = `
.de-rw { position:fixed; left:0; top:0; width:1024px; height:768px; transform-origin:0 0; z-index:2147483000; pointer-events:auto; outline:none; color:#000;
  --rw-line:rgba(40,72,92,.28); --rw-muted:#3d4f5a; --rw-cyan:#1fb3ef; --rw-red:#a3241a; --rw-gold:#9a6a00; }
.de-rw .rw-dim { position:absolute; inset:0; background:rgba(4,22,40,.5); animation:rw-fade .18s ease-out; }
.de-rw .rw-win { position:absolute; left:60px; top:96px; width:904px; height:576px; filter:drop-shadow(0 12px 28px rgba(0,20,40,.45)); animation:rw-fade .18s ease-out; }
.de-rw .rw-win::before { content:''; position:absolute; inset:8px; background:linear-gradient(rgba(236,244,248,.82),rgba(214,230,238,.82)); }
.de-rw .rw-win > .sa-glass { left:0; top:0; width:904px; height:576px; }
.de-rw .rw-win > .sa-band { left:0; top:0; width:904px; height:72px; }
.de-rw svg { display:block; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
.de-rw .rw-sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }

/* the band */
.de-rw .rw-header { position:absolute; left:24px; top:0; width:856px; height:72px; display:flex; align-items:center; gap:16px; }
.de-rw .rw-header > .sa-title { position:relative; flex:none; width:192px; }
.de-rw .rw-meta { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; }
.de-rw .rw-wallet { position:relative; flex:none; width:208px; height:48px; padding:7px 12px; display:grid; grid-template-columns:auto 1fr auto; column-gap:8px; align-items:center;
  border-radius:4px; background:linear-gradient(#f7fafb,#e3eaee); box-shadow:0 0 0 1px #5a6a74, inset 0 1px 2px rgba(0,0,0,.28); }
.de-rw .rw-wallet > .lb { font:12.5px/16px Arial,sans-serif; color:var(--rw-muted); }
.de-rw .rw-wallet > .v { justify-self:end; height:15px; display:flex; align-items:center; }
.de-rw .rw-wallet[data-pulse] { animation:rw-pulse .7s ease-out; }
/* the orange pills: the shop A buttons' dark brown on the orange body (7.6:1), not the sprite's white (1.6:1) */
.de-rw .sa-pill[data-tone=go]:not(:disabled) { color:#3a1b00; text-shadow:0 1px 0 rgba(255,244,190,.55); }
.de-rw .rw-close { position:relative; flex:none; width:160px; height:48px; line-height:48px; }

/* the tabs: four price tag plates, the selected one cyan; a red dot with the claimable count */
.de-rw .rw-tabs { position:absolute; left:24px; top:88px; width:568px; height:36px; display:flex; gap:8px; }
.de-rw .rw-tab { position:relative; flex:1 1 0; min-width:0; height:36px; display:flex; align-items:center; justify-content:center; }
.de-rw .rw-tab[data-on] { color:#06283a; }
/* five tabs (a limited-time event's on): 107px plates, the labels a size down so Achievements fits */
.de-rw .rw-tabs[data-n="5"] .rw-tab > .lb { font-size:14px; }
.de-rw .rw-dot { position:absolute; right:6px; top:-8px; min-width:20px; height:20px; padding:0 6px; border-radius:10px; z-index:1;
  background:linear-gradient(#c4362a,var(--rw-red)); box-shadow:0 0 0 1.5px #fff, 0 1px 2px rgba(0,0,0,.45);
  color:#fff; font:12px/20px Arial,sans-serif; text-align:center; font-variant-numeric:tabular-nums; }
.de-rw .rw-dot[hidden] { display:none; }

/* the strip: what this tab is, and Claim all */
.de-rw .rw-strip { position:absolute; left:24px; top:140px; width:568px; height:48px; display:flex; align-items:center; gap:16px; }
.de-rw .rw-strip > .tx { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
.de-rw .rw-strip .a { font:14.3px/18px Arial,sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.de-rw .rw-strip .b { font:12.5px/16px Arial,sans-serif; color:var(--rw-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:8px; }
.de-rw .rw-strip .b > svg { flex:none; }
.de-rw .rw-strip .rw-total { display:flex; align-items:center; gap:12px; }
.de-rw .rw-strip .rw-total .rw-bar { width:240px; height:12px; }
.de-rw .rw-all { position:relative; flex:none; width:176px; height:48px; line-height:48px; }
.de-rw .rw-all > span { padding:0 20px; }

/* a progress bar: the pity bars' dark recessed track (boxes-css.js), filled in the game's cyan; gold when complete */
.de-rw .rw-bar { position:relative; height:10px; padding:1px; border-radius:2px; background:linear-gradient(#4e626d,#85979f);
  box-shadow:0 0 0 1px #1b252c, inset 0 1px 2px rgba(0,0,0,.5); }
.de-rw .rw-bar > i { display:block; height:100%; min-width:0; border-radius:1px; transition:width .5s cubic-bezier(.2,.8,.3,1);
  background:linear-gradient(rgba(255,255,255,.7),rgba(255,255,255,.15) 45%,transparent 55%,rgba(0,0,0,.15)),#2fc6f4; box-shadow:inset 0 0 0 1px rgba(255,255,255,.3); }
.de-rw .rw-bar[data-full] > i { background:linear-gradient(rgba(255,255,255,.7),rgba(255,255,255,.15) 45%,transparent 55%,rgba(0,0,0,.15)),#f2b51c; }

/* the rows: the Avatar Parts row plates, 64 tall (grey in progress; light cyan when it can be claimed; claimed dimmed) */
.de-rw .rw-list { position:absolute; left:24px; top:196px; width:576px; height:356px; overflow-y:auto; overflow-x:hidden; scrollbar-width:thin; scrollbar-color:#8e8e8e transparent; }
.de-rw .rw-rows { display:flex; flex-direction:column; gap:8px; width:568px; }
.de-rw .rw-row { position:relative; flex:none; width:568px; height:64px; }
.de-rw .rw-row.sa-row { position:relative; }
.de-rw .rw-row > .em { position:absolute; left:12px; top:12px; width:40px; height:40px; display:grid; place-items:center; border-radius:20px;
  background:linear-gradient(#fdfefe,#d3dde2); box-shadow:0 0 0 1px #5a6a74, inset 0 -2px 0 rgba(0,0,0,.08); color:#4a5c66; }
.de-rw .rw-row[data-state=claimable] > .em { background:linear-gradient(#fff6c8,#ffc928 55%,#f29d00); box-shadow:0 0 0 1px #9a5a00, 0 0 8px rgba(255,190,40,.8); color:#5a3000; }
.de-rw .rw-row[data-state=done] > .em { background:linear-gradient(#b4fbff,#3fbde9); box-shadow:0 0 0 1px #0b6f9c; color:#06283a; }
.de-rw .rw-row > .nm { position:absolute; left:64px; top:11px; width:256px; font:14.3px/18px Arial,sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.de-rw .rw-row > .rw-bar { position:absolute; left:64px; top:37px; width:192px; }
.de-rw .rw-row > .ct { position:absolute; left:264px; top:34px; width:64px; font:12.5px/16px Arial,sans-serif; color:var(--rw-muted); font-variant-numeric:tabular-nums; }
.de-rw .rw-row > .mp { position:absolute; left:328px; top:12px; width:96px; height:40px; display:flex; flex-direction:column; align-items:flex-end; justify-content:center; gap:3px; }
.de-rw .rw-row > .mp > .lb { font:11.5px/12px Arial,sans-serif; color:var(--rw-muted); }
.de-rw .rw-row > .act { position:absolute; left:432px; top:8px; width:120px; height:48px; display:flex; align-items:center; justify-content:center; gap:6px;
  font:12.5px/16px Arial,sans-serif; color:var(--rw-muted); }
.de-rw .rw-row > .act > .sa-pill { position:relative; width:120px; height:48px; line-height:48px; }
.de-rw .rw-row > .act > .sa-pill > span { padding:0 16px; }
.de-rw .rw-row[data-state=claimable] { color:#06283a; }
.de-rw .rw-row[data-state=claimable] > .ct, .de-rw .rw-row[data-state=claimable] > .mp > .lb { color:#123c52; }
.de-rw .rw-row[data-state=done] > .nm { color:#24343d; }
.de-rw .rw-row[data-state=done] > .act { color:#0a5f29; }
.de-rw .rw-row[data-new] { animation:rw-in .35s cubic-bezier(.2,.8,.3,1); }
.de-rw .rw-skel { flex:none; width:568px; height:64px; border-radius:4px; }
/* an event's NPCs still to beat: a light panel under its row */
.de-rw .rw-left { flex:none; width:568px; box-sizing:border-box; padding:12px 16px; border-radius:4px; background:rgba(255,255,255,.6); box-shadow:inset 0 0 0 1px var(--rw-line); }
.de-rw .rw-left > .t { font:14.3px/18px Arial,sans-serif; }
.de-rw .rw-left > .s { margin-top:6px; font:12.5px/20px Arial,sans-serif; color:var(--rw-muted); white-space:normal; }
.de-rw .rw-empty { padding:48px 48px 0; display:flex; flex-direction:column; align-items:center; text-align:center; white-space:normal; }
.de-rw .rw-empty > .ic { width:48px; height:48px; display:grid; place-items:center; margin-bottom:16px; border-radius:24px; background:rgba(255,255,255,.6);
  box-shadow:inset 0 0 0 1px var(--rw-line); color:#2a6f93; }
.de-rw .rw-empty > .t { font:14.3px/20px Arial,sans-serif; }
.de-rw .rw-empty > .s { margin-top:4px; font:12.5px/18px Arial,sans-serif; color:var(--rw-muted); text-wrap:balance; }
.de-rw .rw-empty > .sa-pill { position:relative; width:160px; height:48px; line-height:48px; margin-top:16px; }

/* the login calendar: a light panel (the Wardrobe's details) */
.de-rw .rw-cal { position:absolute; left:608px; top:88px; width:272px; height:464px; padding:16px; display:flex; flex-direction:column; border-radius:4px;
  background:linear-gradient(rgba(255,255,255,.66),rgba(232,244,250,.55)); box-shadow:inset 0 0 0 1px rgba(110,140,158,.55); }
.de-rw .rw-cal > .hd { display:flex; align-items:baseline; justify-content:space-between; }
.de-rw .rw-cal > .hd > .t { font:17px/21px Arial,sans-serif; }
.de-rw .rw-cal > .hd > .n { font:12.5px/16px Arial,sans-serif; color:var(--rw-muted); font-variant-numeric:tabular-nums; }
.de-rw .rw-cal > .sub { margin-top:4px; font:12.5px/16px Arial,sans-serif; color:var(--rw-muted); }
.de-rw .rw-days { margin-top:12px; display:grid; grid-template-columns:repeat(6,36px); grid-auto-rows:40px; gap:4px; }
.de-rw .rw-day { position:relative; border-radius:4px; background:linear-gradient(#ffffff,#e6edf1); box-shadow:inset 0 0 0 1px rgba(90,106,116,.55);
  display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:3px 0 4px; }
.de-rw .rw-day > .d { font:10.5px/12px Arial,sans-serif; color:var(--rw-muted); }
.de-rw .rw-day > .m { font:12.5px/14px Arial,sans-serif; font-variant-numeric:tabular-nums; }
.de-rw .rw-day[data-milestone] { background:linear-gradient(#fffbea,#ffe9a3); box-shadow:inset 0 0 0 1px #b88a14, inset 0 0 0 2px rgba(255,255,255,.6); }
.de-rw .rw-day[data-milestone] > .d { color:#6b4a00; }
.de-rw .rw-day[data-milestone] > .st { position:absolute; right:-4px; top:-5px; color:#c98f17; }
.de-rw .rw-day[data-milestone] > .st svg { fill:#ffd862; stroke:#8a5a00; stroke-width:1.6; }
.de-rw .rw-day[data-got] { background:linear-gradient(#b4fbff,#66dcff 55%,#5bbcff); box-shadow:inset 0 0 0 1px #0b6f9c; }
.de-rw .rw-day[data-got] > .d, .de-rw .rw-day[data-got] > .m { color:#06283a; }
.de-rw .rw-day[data-got] > .ck { position:absolute; right:3px; top:3px; color:#06283a; opacity:.6; }
.de-rw .rw-day[data-got][data-milestone] { background:linear-gradient(#fff3ad,#e8b42a 60%,#d59a10); box-shadow:inset 0 0 0 1px #8a5a00; }
.de-rw .rw-day[data-got][data-milestone] > .d, .de-rw .rw-day[data-got][data-milestone] > .m { color:#3a2400; }
.de-rw .rw-day[data-today] { box-shadow:inset 0 0 0 1px #0b6f9c, 0 0 0 2px #ffe600, 0 0 8px 2px rgba(255,200,0,.75); z-index:1; }
.de-rw .rw-today { margin-top:16px; padding:12px; display:grid; grid-template-columns:1fr auto; row-gap:4px; align-items:center; border-radius:4px;
  background:rgba(255,255,255,.7); box-shadow:inset 0 0 0 1px var(--rw-line); }
.de-rw .rw-today > .lb { font:12.5px/16px Arial,sans-serif; color:var(--rw-muted); }
.de-rw .rw-today > .v { grid-row:span 2; justify-self:end; display:flex; align-items:center; }
.de-rw .rw-today > .st { font:14.3px/18px Arial,sans-serif; display:flex; align-items:center; gap:6px; }
.de-rw .rw-today > .st[data-got] { color:#0a5f29; }
.de-rw .rw-next { margin-top:auto; padding-top:12px; border-top:1px solid var(--rw-line); display:flex; flex-direction:column; gap:4px; }
.de-rw .rw-next > div { font:12.5px/18px Arial,sans-serif; color:#24343d; display:flex; justify-content:space-between; gap:8px; }
.de-rw .rw-next > div > .k { color:var(--rw-muted); }

/* the claim: the amount rises from the button to the wallet; a toast over the window's foot */
.de-rw .rw-fly { position:absolute; z-index:5; display:flex; align-items:center; gap:2px; pointer-events:none; color:#000;
  filter:drop-shadow(0 0 4px rgba(255,220,80,.95)) drop-shadow(0 1px 1px rgba(0,0,0,.4)); }
.de-rw .rw-fly > b { font:28px/28px Arial,sans-serif; font-weight:normal; color:#fff; text-shadow:1px 0 #000,-1px 0 #000,0 1px #000,0 -1px #000; }
.de-rw .rw-toast { position:absolute; left:308px; bottom:40px; z-index:6; max-width:552px; min-height:40px; padding:10px 20px; transform:translateX(-50%);
  display:flex; align-items:center; gap:10px; border-radius:20px; background:#2b3d46; color:#fff; box-shadow:0 0 0 1px rgba(255,255,255,.35), 0 6px 16px rgba(0,20,40,.4);
  font:14.3px/20px Arial,sans-serif; white-space:normal; text-wrap:balance; animation:rw-toast .25s cubic-bezier(.2,.8,.3,1); }
.de-rw .rw-toast[hidden] { display:none; }
.de-rw .rw-toast[data-tone=error] { background:var(--rw-red); }
.de-rw .rw-toast > svg { flex:none; }
@keyframes rw-fade { from { opacity:0; } }
@keyframes rw-in { from { opacity:0; transform:translateY(-4px); } }
@keyframes rw-toast { from { opacity:0; transform:translate(-50%,8px); } }
@keyframes rw-pulse { 0% { box-shadow:0 0 0 1px #5a6a74, inset 0 1px 2px rgba(0,0,0,.28), 0 0 0 0 rgba(255,214,60,.9); }
  100% { box-shadow:0 0 0 1px #5a6a74, inset 0 1px 2px rgba(0,0,0,.28), 0 0 0 10px rgba(255,214,60,0); } }
@media (prefers-reduced-motion:reduce) { .de-rw *, .de-rw *::before, .de-rw *::after { animation:none!important; transition:none!important; } }
`;
