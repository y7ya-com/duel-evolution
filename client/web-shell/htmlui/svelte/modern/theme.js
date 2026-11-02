// Modern UI's shared look (DESIGN.md beside this file): the tokens and the pieces every modern window is built from,
// injected once (palette tokens on :root, the pieces scoped to .mu, a modern window's root). Game pixels, as every layer.
// Colours come from the 2008 art (controls/skin.js's sampled skin): the windows' light cyan glass (#84f4ff, bevels
// #76ffff / #a7ffff / #41abef), the title bar's white-to-azure (#e5f1f4 > #a3d7f3 > #336deb, a #234cdb line), the menu
// buttons' gold (#ffffc8 > #f4d558 > #eca430, edge #e36f08), the place plate's azure #0985ff to sky #7deffc.
const CSS = `
/* the palette: one primary blue in three values, cool silver neutrals, gold for the primary action only. Three
   variants on the same roles (?MU_PALETTE=a|b|c, html[data-mu-palette]): a silver remaster (default), b sky, c deep */
:root { --p900: #163f85; --p700: #2462c2; --p600: #2c6fd1; --p500: #3b82e0; --p200: #cfe1f6; --p50: #eef5fc;
  --n0: #ffffff; --n50: #f7f9fc; --n100: #eef2f7; --n200: #dde4ee; --n300: #c3cedc; --n500: #8a98ad;
  --stage: radial-gradient(120% 90% at 30% 0%, #2a63bd 0%, #1d4f9f 45%, #143d80 100%);
  --plate: linear-gradient(180deg, #ffffff 0%, #f6f8fb 55%, #eaeff5 100%);
  --plate-edge: #b6c4d6; --plate-hi: rgba(255, 255, 255, .9);
  --band: linear-gradient(180deg, #3478d6 0%, #2a6bcc 55%, #2462c2 100%); --band-edge: #1d54a8;
  --bar: linear-gradient(180deg, #4b8ee3 0%, #2d6fd1 50%, #2462c2 100%); --bar-edge: #1b4f9f;
  --btn: linear-gradient(180deg, #ffffff 0%, #f1f5fa 100%); --btn-hover: linear-gradient(180deg, #ffffff 0%, #e7f0fb 100%); --btn-edge: #b3c3d8;
  --dock: linear-gradient(180deg, #3478d6 0%, #2462c2 100%); --dock-field: rgba(255, 255, 255, .92);
  --card: linear-gradient(180deg, #ffffff, #f4f7fb); --sel: linear-gradient(180deg, #3b82e0, #2462c2);
  --well: #ffffff; --well-shadow: inset 0 1px 2px rgba(20, 50, 100, .1), inset 0 0 0 1px #cdd7e4;
  --gold-200: #fff4c4; --gold-300: #ffe58a; --gold-400: #f3c64f; --gold-500: #e2a72e; --gold-edge: #b7791a; --gold-ink: #3a2400;
  --gold: linear-gradient(180deg, #fff4c4 0%, #ffe58a 35%, #f3c64f 70%, #e2a72e 100%);
  --ink: #142a4c; --ink-2: #33496d; --ink-3: #536886; --ink-strong: #0c1e3a; --link: #1d5bc0; --icon: #2462c2; --icon-warm: #b7791a;
  --ok: #19803a; --warm: #9a5a00; --bad: #b8121c; --focus: #2f7cf0;
  --r-plate: 14px; --r-ctl: 9px; --r-row: 7px; --ease: cubic-bezier(.16, 1, .3, 1);
  /* the game's frame: brushed silver-blue metal, light from above, and the display face for titles */
  --frame: linear-gradient(180deg, #f4f8fc 0%, #cfdbea 16%, #a7b9d2 58%, #8195b6 100%); --frame-rim: #5f7699;
  --lip: #6a81a6; --lip-gold: #a5650d; --display: Audiowide, "Arial Black", Arial, sans-serif;
  /* a key's motion (owner: "they spring back so quickly, it doesn't really feel natural"): the press near instant, the
     release eased back up with a touch of overshoot */
  --press: .03s; --release: .18s; --spring: cubic-bezier(.34, 1.4, .64, 1); }
:root[data-mu-palette='b'] { --p900: #1d5bb0; --p700: #2f74cc; --p600: #3a82d8; --p500: #4b95e6; --p200: #d3e8fb; --p50: #f0f7fe;
  --stage: radial-gradient(120% 90% at 30% 0%, #79b6ee 0%, #4f93dc 50%, #3473c4 100%);
  --plate: linear-gradient(180deg, #fbfdff 0%, #eef6fe 55%, #e2eefb 100%); --plate-edge: #a9c6e6;
  --band: linear-gradient(180deg, #4a90e2 0%, #3a80d6 55%, #2f74cc 100%); --band-edge: #2763b4;
  --bar: linear-gradient(180deg, #62a4ec 0%, #3d86dc 50%, #2f74cc 100%); --bar-edge: #2763b4;
  --btn: linear-gradient(180deg, #ffffff 0%, #eaf3fd 100%); --btn-hover: linear-gradient(180deg, #ffffff 0%, #dcecfc 100%); --btn-edge: #9cbfe6;
  --dock: linear-gradient(180deg, #5a9ce8 0%, #3a80d6 100%); --sel: linear-gradient(180deg, #4b95e6, #2f74cc); --well-shadow: inset 0 1px 2px rgba(20, 60, 120, .1), inset 0 0 0 1px #c3d7ee; }
:root[data-mu-palette='c'] { --p900: #102f63; --p700: #173f82; --p600: #1e4d9a; --p500: #2f6cc4; --p200: #cbd9ee; --p50: #eef3fa;
  --stage: radial-gradient(120% 90% at 30% 0%, #1d4b93 0%, #143a76 50%, #0d2a59 100%);
  --plate: linear-gradient(180deg, #ffffff 0%, #f3f5f9 55%, #e6ebf2 100%); --plate-edge: #a9b6c9;
  --band: linear-gradient(180deg, #24579f 0%, #1c4a8f 55%, #173f82 100%); --band-edge: #10306a;
  --bar: linear-gradient(180deg, #2f64b0 0%, #1e4d9a 50%, #173f82 100%); --bar-edge: #10306a;
  --dock: linear-gradient(180deg, #1f4d96 0%, #163d7c 100%); --sel: linear-gradient(180deg, #2f6cc4, #173f82); --icon: #1e4d9a; --link: #1e4d9a; }
.mu { position: absolute; inset: 0; font-family: "Segoe UI Variable Text", "Segoe UI", "SF Pro Text", system-ui, -apple-system,
    "Helvetica Neue", Arial, sans-serif; font-size: 13px; line-height: 1.35; color: var(--ink);
  -webkit-font-smoothing: antialiased; font-variant-numeric: tabular-nums;
  /* names the components still use, on the palette's roles */
  --azure-500: var(--p700); --azure-400: var(--p500); --sky-300: var(--link); --brand: var(--p700); --brand-deep: var(--p900);
  --sky-glass: var(--btn); --sky-glass-hover: var(--btn-hover); --navy-900: var(--ink-strong); --silver-50: var(--n50); --silver-200: var(--n200); --silver-400: var(--n500); }
.mu *, .mu *::before, .mu *::after { box-sizing: border-box; }
.mu ::selection { background: var(--p200); color: var(--ink-strong); }
:where(.mu) button { font: inherit; color: inherit; margin: 0; border: 0; background: none; padding: 0; text-align: inherit; }
.mu button:focus-visible, .mu input:focus-visible, .mu textarea:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

/* GAME UI LANGUAGE (DESIGN.md "Game UI"): game windows, not web cards. */
/* the panel (GamePanel): a bevelled metal frame (::before) round an inner field (::after), the top-left and bottom-right
   corners cut with a gold line along each cut, the shadow following the cut shape (drop-shadow, not box-shadow).
   It paints opaque, in place, from its first frame (html-ui-pixel): the game draws a new window its own way for that one
   frame (the hide table takes effect at the next Present), so a plate fading, scaling or rising in showed it through.
   No arrival pass either: a third of a second of glow after the window is already there read as lag (owner: "feels
   super slow to open"). The panel is simply there, finished, in the frame the game shows the window */
.mu-plate { position: absolute; isolation: isolate; border-radius: 0; background: none;
  filter: drop-shadow(0 14px 18px rgba(6, 24, 64, .42)) drop-shadow(0 2px 2px rgba(6, 24, 64, .35)); }
.mu-plate::before, .mu-plate::after { content: ''; position: absolute; pointer-events: none; }
.mu-plate::before { inset: 0; z-index: -2; border: 1px solid #3d5579; clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
  background: linear-gradient(135deg, transparent 10.5px, var(--gold-300) 10.5px 13px, transparent 13px) 0 0 / 24px 24px no-repeat,
    linear-gradient(-45deg, transparent 10.5px, var(--gold-300) 10.5px 13px, transparent 13px) 100% 100% / 24px 24px no-repeat,
    linear-gradient(180deg, rgba(255, 255, 255, .7), rgba(255, 255, 255, 0) 3px), var(--frame); }
.mu-plate::after { inset: 6px; z-index: -1; border: 1px solid var(--frame-rim);
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  background: linear-gradient(180deg, rgba(10, 40, 90, .12), rgba(10, 40, 90, 0) 7px),
    repeating-linear-gradient(135deg, rgba(36, 98, 194, .028) 0 2px, rgba(36, 98, 194, 0) 2px 7px), var(--plate); }
/* the title plaque (GamePanel's title): the band in the frame, its cut corner, a gold base line, the display face */
.mu-head, .mu-plaque { display: flex; align-items: center; gap: 10px; height: 36px; margin: 6px 6px 0; padding: 0 8px 0 16px; position: relative;
  clip-path: polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px);
  background: linear-gradient(180deg, rgba(255, 255, 255, .3), rgba(255, 255, 255, 0) 52%), var(--band);
  box-shadow: inset 0 -2px 0 var(--gold-400), inset 0 1px 0 rgba(255, 255, 255, .35); }
.mu-head h2, .mu-plaque > :is(h2, span) { margin: 0; font-family: var(--display); font-size: 14px; font-weight: 400; letter-spacing: .07em; text-transform: uppercase;
  color: #fff; text-shadow: 0 2px 0 rgba(0, 20, 60, .45), 0 0 10px rgba(120, 190, 255, .45);
  flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mu-head .mu-icon-btn, .mu-plaque .mu-icon-btn { color: rgba(255, 255, 255, .92); }
.mu-head .mu-icon-btn:hover, .mu-plaque .mu-icon-btn:hover { color: #fff; background: rgba(255, 255, 255, .2); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .4); }
.mu-emblem { width: 20px; height: 20px; flex: none; color: var(--gold-300); }

/* the button (GameButton): a physical key. A glossy bevel (the split highlight), a rim, a solid lip under it that the
   press pushes in, a shine that sweeps across on hover with a glow; gold for the one primary action */
.mu-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 32px; padding: 0 18px;
  overflow: hidden; border-radius: 7px; font-weight: 800; font-size: 13px; letter-spacing: .02em; white-space: nowrap; color: var(--ink-strong);
  text-shadow: 0 1px 0 rgba(255, 255, 255, .8);
  background: linear-gradient(180deg, #ffffff 0%, #eef3f9 46%, #d6e0ee 54%, #c6d3e5 100%);
  box-shadow: inset 0 1px 0 #fff, inset 0 -2px 0 rgba(60, 85, 125, .18), 0 0 0 1px #7088ab, 0 3px 0 var(--lip), 0 5px 7px -2px rgba(8, 30, 70, .4);
  transition: transform var(--release) var(--spring), box-shadow .16s ease-out, filter .14s, opacity .14s; }
.mu-btn::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, .65) 50%, transparent 65%) -160% 0 / 55% 100% no-repeat;
  transition: background-position .45s var(--ease); }
.mu-btn:hover, .mu-btn[data-state='hover'] { filter: brightness(1.04) saturate(1.08);
  box-shadow: inset 0 1px 0 #fff, inset 0 -2px 0 rgba(60, 85, 125, .18), 0 0 0 1px var(--p500), 0 3px 0 var(--lip), 0 0 14px rgba(59, 130, 224, .5); }
.mu-btn:hover::after, .mu-btn[data-state='hover']::after { background-position: 260% 0; }
.mu-btn:active, .mu-btn[data-state='pressed'] { transition-duration: var(--press), var(--press), .14s, .14s; transform: translateY(3px) scale(.985); filter: brightness(.96);
  box-shadow: inset 0 2px 3px rgba(10, 35, 80, .3), 0 0 0 1px #7088ab, 0 0 0 var(--lip); }
.mu-btn:disabled, .mu-btn[data-state='disabled'] { opacity: .5; filter: saturate(.4); transform: none; }
.mu-btn:disabled::after, .mu-btn[data-state='disabled']::after { display: none; }
.mu-btn.gold { color: var(--gold-ink); text-shadow: 0 1px 0 rgba(255, 250, 220, .9);
  background: linear-gradient(180deg, #fff8d8 0%, #ffe68a 44%, #f6c443 54%, #e49e22 100%);
  box-shadow: inset 0 1px 0 #fffbe8, inset 0 -2px 0 rgba(140, 80, 0, .22), 0 0 0 1px var(--gold-edge), 0 3px 0 var(--lip-gold), 0 5px 7px -2px rgba(90, 50, 0, .4); }
.mu-btn.gold:hover, .mu-btn.gold[data-state='hover'] { filter: brightness(1.05) saturate(1.1);
  box-shadow: inset 0 1px 0 #fffbe8, inset 0 -2px 0 rgba(140, 80, 0, .22), 0 0 0 1px var(--gold-edge), 0 3px 0 var(--lip-gold), 0 0 16px rgba(255, 196, 60, .65); }
.mu-btn.gold:active, .mu-btn.gold[data-state='pressed'] { box-shadow: inset 0 2px 3px rgba(110, 60, 0, .35), 0 0 0 1px var(--gold-edge), 0 0 0 var(--lip-gold); }
.mu-btn.gold:disabled, .mu-btn.gold[data-state='disabled'] { opacity: .55; filter: saturate(.3); }
.mu-icon-btn { display: inline-grid; place-items: center; width: 30px; height: 30px; min-width: 28px; min-height: 26px; border-radius: 7px; color: var(--ink-2);
  transition: background .14s, color .14s, box-shadow .14s, transform var(--release) var(--spring); }
.mu-icon-btn:hover { color: var(--ink-strong); background: var(--p50); box-shadow: inset 0 0 0 1px var(--p200); }
.mu-icon-btn:active { transition-duration: .14s, .14s, .14s, var(--press); transform: translateY(1px) scale(.94); }
.mu-icon-btn:disabled { opacity: .35; background: none; box-shadow: none; }
.mu-icon-btn.danger:hover { color: #fff; background: var(--bad); box-shadow: inset 0 0 0 1px #8a0c14; }
.mu-ico { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }

/* the field (GameField): an inset slot cut into the panel (a dark top edge, a light bottom edge); focus lights it gold */
.mu-field { display: block; width: 100%; height: 32px; padding: 0 12px; border: 0; border-radius: 6px; font: inherit; font-size: 13px; color: var(--ink-strong);
  background: linear-gradient(180deg, #e9eff7 0%, #ffffff 30%); user-select: text;
  box-shadow: inset 0 2px 3px rgba(10, 35, 80, .22), inset 0 0 0 1px #8ea2bf, 0 1px 0 rgba(255, 255, 255, .9); }
textarea.mu-field { height: auto; padding: 8px 12px; resize: none; line-height: 1.45; }
.mu-field::placeholder { color: #5b6f8c; }
.mu-field:focus { outline: none; box-shadow: inset 0 2px 3px rgba(10, 35, 80, .22), inset 0 0 0 1px var(--gold-edge), 0 0 0 2px rgba(255, 200, 70, .55), 0 0 12px rgba(255, 200, 70, .4); }

/* tabs (GameTabs): raised plates on a rail; the chosen one blue and lifted, a gold top line */
.mu-tabs { display: flex; gap: 4px; padding: 4px; border-radius: 8px; background: linear-gradient(180deg, #b7c6da, #cfdae8);
  box-shadow: inset 0 2px 3px rgba(10, 35, 80, .25), 0 1px 0 #fff; }
.mu-tab { flex: 1; height: 28px; padding: 0 12px; border-radius: 5px; font-weight: 800; font-size: 12px; letter-spacing: .03em; color: var(--ink-2);
  background: linear-gradient(180deg, #f6f9fc, #dde5f0); box-shadow: 0 1px 0 rgba(255, 255, 255, .8), 0 0 0 1px #8ea2bf; transition: transform var(--release) var(--spring), filter .14s; }
.mu-tab:hover { filter: brightness(1.05); }
.mu-tab:active { transition-duration: var(--press), .14s; transform: translateY(1px); }
.mu-tab[aria-selected='true'], .mu-tab.on { color: #fff; text-shadow: 0 1px 0 rgba(0, 20, 60, .45); background: var(--sel);
  box-shadow: inset 0 2px 0 var(--gold-300), 0 0 0 1px var(--p900), 0 2px 6px rgba(20, 60, 140, .45); }

/* list rows (GameList): rows in a well; hover lights the row, the chosen one is a blue bar with a gold notch */
.mu-list { border-radius: 6px; background: var(--well); box-shadow: inset 0 2px 3px rgba(10, 35, 80, .18), inset 0 0 0 1px #8ea2bf; }
.mu-row { position: relative; display: flex; align-items: center; gap: 8px; min-height: 30px; padding: 0 12px; color: var(--ink); }
.mu-row:nth-child(even) { background: rgba(20, 60, 120, .035); }
.mu-row:hover { background: linear-gradient(90deg, rgba(59, 130, 224, .16), rgba(59, 130, 224, .04)); }
.mu-row[aria-selected='true'], .mu-row.on { color: #fff; background: var(--sel); text-shadow: 0 1px 0 rgba(0, 20, 60, .35); }
.mu-row[aria-selected='true']::before, .mu-row.on::before { content: ''; position: absolute; left: 0; top: 3px; bottom: 3px; width: 4px;
  background: var(--gold-300); clip-path: polygon(0 0, 100% 3px, 100% calc(100% - 3px), 0 100%); }

/* the level / count chip: the primary blue, white figures, a hairline gold edge */
.mu-chip { display: inline-flex; align-items: baseline; gap: 4px; height: 20px; padding: 0 8px; border-radius: 10px; font-size: 11px;
  font-weight: 700; letter-spacing: .02em; color: #fff; line-height: 20px; background: var(--sel); box-shadow: 0 0 0 1px var(--gold-edge); }
.mu-chip b { font-size: 12px; font-weight: 800; }

.mu-scroll { overflow: auto; scrollbar-width: thin; scrollbar-color: var(--n300) transparent; overscroll-behavior: contain; }

/* the Audio window (web/audiopage.js, its own page over the canvas) in Modern UI (html.mu-modern, modern.js): a game
   panel with its plaque, dark ink on the light field, game keys, the toggles as tabs, the file lists as wells */
html.mu-modern #rc-audio { font: 13px/1.4 "Segoe UI Variable Text", "Segoe UI", "SF Pro Text", system-ui, -apple-system, Arial, sans-serif; color: var(--ink);
  background: rgba(6, 30, 80, .32); }
html.mu-modern #rc-audio .win { position: relative; isolation: isolate; border: 0; border-radius: 0; background: none; box-shadow: none;
  filter: drop-shadow(0 14px 18px rgba(6, 24, 64, .42)) drop-shadow(0 2px 2px rgba(6, 24, 64, .35)); }
html.mu-modern #rc-audio .win::before, html.mu-modern #rc-audio .win::after { content: ''; position: absolute; pointer-events: none; }
html.mu-modern #rc-audio .win::before { inset: 0; z-index: -2; border: 1px solid #3d5579;
  clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
  background: linear-gradient(135deg, transparent 10.5px, var(--gold-300) 10.5px 13px, transparent 13px) 0 0 / 24px 24px no-repeat,
    linear-gradient(-45deg, transparent 10.5px, var(--gold-300) 10.5px 13px, transparent 13px) 100% 100% / 24px 24px no-repeat, var(--frame); }
html.mu-modern #rc-audio .win::after { inset: 6px; z-index: -1; border: 1px solid var(--frame-rim);
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px); background: var(--plate); }
html.mu-modern #rc-audio .bar { height: 36px; line-height: 34px; margin: 6px 6px 0; padding: 0 16px; text-align: left; border: 0;
  clip-path: polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px);
  background: linear-gradient(180deg, rgba(255, 255, 255, .3), rgba(255, 255, 255, 0) 52%), var(--band); box-shadow: inset 0 -2px 0 var(--gold-400);
  font-family: var(--display); font-size: 14px; letter-spacing: .07em; text-transform: uppercase; color: #fff; text-shadow: 0 2px 0 rgba(0, 20, 60, .45); }
html.mu-modern #rc-audio .body { margin: 0 6px; padding: 14px 16px 12px; gap: 10px; scrollbar-width: thin; scrollbar-color: var(--n300) transparent; }
html.mu-modern #rc-audio .note { padding: 10px 12px; border: 0; border-radius: 6px; color: var(--ink-2); text-shadow: none; background: var(--p50);
  box-shadow: inset 0 0 0 1px var(--p200); }
html.mu-modern #rc-audio .err { color: var(--bad); }
html.mu-modern #rc-audio .group { padding-top: 10px; border-top: 1px solid var(--n200); box-shadow: none; }
html.mu-modern #rc-audio .ghead { gap: 8px; min-height: 32px; }
html.mu-modern #rc-audio .tog::before { color: var(--p700); text-shadow: none; }
html.mu-modern #rc-audio .label { font-family: var(--display); font-weight: 400; font-size: 12.5px; letter-spacing: .08em; text-transform: uppercase;
  color: var(--p700); text-shadow: none; }
html.mu-modern #rc-audio .sub .label { font-size: 11.5px; }
html.mu-modern #rc-audio :is(.count, .hint, .desc) { color: var(--ink-3); text-shadow: none; }
html.mu-modern #rc-audio .gbody { gap: 8px; padding: 6px 0 4px 18px; }
html.mu-modern #rc-audio .slot { gap: 8px; padding: 10px 12px; border: 0; border-radius: 6px; background: #fff;
  box-shadow: inset 0 0 0 1px var(--n200), 0 1px 2px rgba(10, 35, 80, .08); }
html.mu-modern #rc-audio .slot.now { box-shadow: inset 0 0 0 2px var(--gold-400), 0 0 12px rgba(255, 196, 60, .45); }
html.mu-modern #rc-audio .name { color: var(--ink-strong); text-shadow: none; }
html.mu-modern #rc-audio .live { color: #b25a00; text-shadow: none; }
html.mu-modern #rc-audio .list { border: 0; border-radius: 6px; color: var(--ink); background: var(--well);
  box-shadow: inset 0 2px 3px rgba(10, 35, 80, .18), inset 0 0 0 1px #8ea2bf; overflow: hidden; }
html.mu-modern #rc-audio .list > div { height: 28px; padding: 0 6px 0 12px; border-bottom: 1px solid var(--n100); }
html.mu-modern #rc-audio .list .none { color: var(--ink-3); }
html.mu-modern #rc-audio .rm { color: var(--ink-2); }
html.mu-modern #rc-audio .ctl { gap: 8px; }
html.mu-modern #rc-audio :is(.cbtn, .ok) { position: relative; height: 30px; padding: 0 14px; border: 0; border-radius: 7px; font-weight: 800; font-size: 12.5px;
  letter-spacing: .02em; color: var(--ink-strong); text-shadow: 0 1px 0 rgba(255, 255, 255, .8);
  background: linear-gradient(180deg, #ffffff 0%, #eef3f9 46%, #d6e0ee 54%, #c6d3e5 100%);
  box-shadow: inset 0 1px 0 #fff, 0 0 0 1px #7088ab, 0 3px 0 var(--lip), 0 5px 7px -2px rgba(8, 30, 70, .4); transition: transform var(--release) var(--spring), box-shadow .16s ease-out; }
html.mu-modern #rc-audio :is(.cbtn, .ok):not(:disabled):hover { background: linear-gradient(180deg, #ffffff 0%, #eef3f9 46%, #d6e0ee 54%, #c6d3e5 100%);
  filter: brightness(1.04); box-shadow: inset 0 1px 0 #fff, 0 0 0 1px var(--p500), 0 3px 0 var(--lip), 0 0 14px rgba(59, 130, 224, .5); }
html.mu-modern #rc-audio :is(.cbtn, .ok):not(:disabled):active { transition-duration: var(--press); transform: translateY(3px); box-shadow: inset 0 2px 3px rgba(10, 35, 80, .3), 0 0 0 1px #7088ab; }
html.mu-modern #rc-audio .opt { height: 28px; min-width: 76px; border-radius: 6px; font-weight: 800; font-size: 12px; color: var(--ink-2); text-shadow: none;
  background: linear-gradient(180deg, #f6f9fc, #dde5f0); box-shadow: 0 1px 0 rgba(255, 255, 255, .8), 0 0 0 1px #8ea2bf; }
html.mu-modern #rc-audio .opt.on { color: #fff; text-shadow: 0 1px 0 rgba(0, 20, 60, .45); background: var(--sel);
  box-shadow: inset 0 2px 0 var(--gold-300), 0 0 0 1px var(--p900); }
html.mu-modern #rc-audio .vol { gap: 8px; color: var(--ink-2); text-shadow: none; font-weight: 600; }
html.mu-modern #rc-audio input[type=range] { width: 120px; accent-color: var(--p700); }
html.mu-modern #rc-audio input[type=range]::-webkit-slider-runnable-track { height: 6px; border: 0; border-radius: 3px; background: var(--n200);
  box-shadow: inset 0 1px 1px rgba(11, 42, 92, .2); }
html.mu-modern #rc-audio input[type=range]::-webkit-slider-thumb { width: 18px; height: 18px; margin-top: -6px; border: 0; border-radius: 50%; background: #fff;
  box-shadow: 0 1px 3px rgba(11, 42, 92, .35), 0 0 0 1px var(--btn-edge); }
html.mu-modern #rc-audio .foot { margin: 0 6px 6px; padding: 12px 16px 16px; border: 0; background: none; }
html.mu-modern #rc-audio .ok { min-width: 132px; height: 32px; color: var(--gold-ink); text-shadow: 0 1px 0 rgba(255, 250, 220, .9);
  background: linear-gradient(180deg, #fff8d8 0%, #ffe68a 44%, #f6c443 54%, #e49e22 100%);
  box-shadow: inset 0 1px 0 #fffbe8, 0 0 0 1px var(--gold-edge), 0 3px 0 var(--lip-gold), 0 5px 7px -2px rgba(90, 50, 0, .4); }
html.mu-modern #rc-audio .ok:hover { background: linear-gradient(180deg, #fff8d8 0%, #ffe68a 44%, #f6c443 54%, #e49e22 100%);
  box-shadow: inset 0 1px 0 #fffbe8, 0 0 0 1px var(--gold-edge), 0 3px 0 var(--lip-gold), 0 0 16px rgba(255, 196, 60, .65); }
html.mu-modern #rc-audio :is(button, input):focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

@keyframes mu-rise { from { opacity: 0; transform: translateY(8px); filter: blur(3px); } }
@keyframes mu-arrive { from { filter: drop-shadow(0 14px 18px rgba(6, 24, 64, .42)) drop-shadow(0 2px 2px rgba(6, 24, 64, .35)) brightness(1.18) drop-shadow(0 0 10px rgba(120, 190, 255, .7)); } }
@media (prefers-reduced-motion: reduce) { .mu *, .mu-plate { animation: none !important; transition: none !important; } }
`;

// the palette variant: ?MU_PALETTE=a|b|c, else the one kept from last time, else a
export function theme() {
  const q = new URLSearchParams(location.search).get('MU_PALETTE');
  let v = q;
  try { if (q) localStorage.setItem('yo2.muPalette', q); else v = localStorage.getItem('yo2.muPalette'); } catch {}
  if (/^[bc]$/.test(v || '')) document.documentElement.dataset.muPalette = v; else delete document.documentElement.dataset.muPalette;
  if (document.getElementById('mu-theme')) return;
  const st = document.createElement('style');
  st.id = 'mu-theme';
  // the display face, self-hosted with the art (ui/fonts/: the repo takes no binaries, players' browsers no Google; OFL).
  // ui/ as the bridge's art base (makeLayer's default): ui.js's SHEET urls aren't rebased yet when Modern UI loads first
  st.textContent = `@font-face { font-family: Audiowide; font-display: swap; src: url(ui/fonts/Audiowide-Regular.woff2) format('woff2'); }` + CSS;
  document.head.append(st);
}
