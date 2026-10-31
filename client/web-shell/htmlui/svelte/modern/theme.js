// Modern UI's shared look (DESIGN.md beside this file): the tokens and the pieces every modern window is built from,
// injected once as a stylesheet scoped to .mu (a modern window's root element). Game pixels, as every htmlui layer.
// Colours come from the 2008 art (controls/skin.js's sampled skin): the windows' light cyan glass (#84f4ff, bevels
// #76ffff / #a7ffff / #41abef), the title bar's white-to-azure (#e5f1f4 > #a3d7f3 > #336deb, a #234cdb line), the menu
// buttons' gold (#ffffc8 > #f4d558 > #eca430, edge #e36f08), the place plate's azure #0985ff to sky #7deffc.
const CSS = `
.mu { --navy-950: #04112b; --navy-900: #0b2a5c; --navy-800: #0a2350; --navy-700: #0e3275; --navy-600: #154196;
  --azure-500: #0a62d8; --azure-400: #2f86f0; --sky-300: #0050c8; --cyan: #00b4ff; --brand: #1f6fe0; --brand-deep: #1650c8;
  --silver-50: #f6f9fc; --silver-200: #d7e2ee; --silver-400: #8fa3bd;
  --gold-200: #ffffc8; --gold-300: #fff97f; --gold-400: #f4d558; --gold-500: #eca430; --gold-edge: #e36f08; --gold-ink: #4a2600;
  --ruby: #b8121c; --ink: #0b2a5c; --ink-2: #24497a; --ink-3: #3a5a82; --ink-strong: #06204a; --icon: #c25a00;
  --link: #0050c8; --ok: #0b7a2a; --warm: #9a4a00; --bad: #b8121c; --sel: linear-gradient(180deg, #2f80ec, #1a5fd6);
  --r-plate: 16px; --r-ctl: 10px; --r-row: 7px;
  --well: linear-gradient(180deg, #ffffff, #f2fbff); --well-shadow: inset 0 1px 2px rgba(11, 42, 92, .18), inset 0 0 0 1px rgba(65, 171, 239, .55);
  --sky-glass: linear-gradient(180deg, #ffffff 0%, #d9f5ff 45%, #a8e6ff 55%, #7fd3fb 100%);
  --sky-glass-hover: linear-gradient(180deg, #ffffff 0%, #e9fbff 45%, #c4f0ff 55%, #9fe1ff 100%);
  --ease: cubic-bezier(.16, 1, .3, 1);
  position: absolute; inset: 0; font-family: "Segoe UI Variable Text", "Segoe UI", "SF Pro Text", system-ui, -apple-system,
    "Helvetica Neue", Arial, sans-serif; font-size: 13px; line-height: 1.35; color: var(--ink);
  -webkit-font-smoothing: antialiased; font-variant-numeric: tabular-nums; }
.mu *, .mu *::before, .mu *::after { box-sizing: border-box; }
.mu ::selection { background: rgba(0, 180, 255, .3); color: var(--ink-strong); }
:where(.mu) button { font: inherit; color: inherit; margin: 0; border: 0; background: none; padding: 0; text-align: inherit; }
.mu button:focus-visible, .mu input:focus-visible, .mu textarea:focus-visible { outline: 2px solid var(--azure-500); outline-offset: 2px; }

/* the plate: the 2008 window (light cyan glass in its cyan bevel), glossier and crisper: a white sheen over its top half,
   the art's faint scan lines, a soft offset shadow */
.mu-plate { position: absolute; border-radius: var(--r-plate) var(--r-plate) var(--r-plate) 6px; isolation: isolate;
  background: linear-gradient(180deg, rgba(255, 255, 255, .55), rgba(255, 255, 255, 0) 46%),
    repeating-linear-gradient(180deg, rgba(255, 255, 255, .3) 0 1px, transparent 1px 3px),
    linear-gradient(180deg, #f5fcff 0%, #e3f6fe 50%, #cdeefc 100%);
  box-shadow: 0 0 0 1px #2f8fd6, inset 0 0 0 2px rgba(167, 255, 255, .9), inset 0 -2px 0 2px rgba(65, 171, 239, .45),
    0 18px 36px -14px rgba(10, 60, 130, .55), 0 4px 10px rgba(10, 60, 130, .22);
  animation: mu-rise .26s var(--ease) both; }
.mu-plate::before { content: none; }
/* the title band: the 2008 title bar's white-to-azure gradient, its blue line under it */
.mu-head { display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 8px 0 14px; position: relative; border-radius: 16px 16px 0 0;
  background: linear-gradient(180deg, #4a96f0 0%, #2b7ee8 22%, #1f6fe0 50%, #1a5fd6 62%, #1650c8 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .55), inset 0 -1px 0 #1240a8, 0 1px 0 #234cdb; }
.mu-head h2 { margin: 0; font-size: 15px; font-weight: 750; letter-spacing: .01em; color: #fff;
  text-shadow: 0 1px 0 #0e3a9a; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mu-head .mu-icon-btn { color: #fff; }
.mu-head .mu-icon-btn:hover { background: rgba(255, 255, 255, .25); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .6); }
.mu-emblem { width: 22px; height: 22px; flex: none; color: #fff97f; filter: drop-shadow(0 1px 0 #b05a00); }

/* buttons: gold (the 2008 menu buttons) for the primary action and the menu, sky glass for the rest */
.mu-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 32px; padding: 0 16px;
  border-radius: var(--r-ctl) var(--r-ctl) var(--r-ctl) 4px; font-weight: 700; font-size: 13px; letter-spacing: .01em; white-space: nowrap;
  color: var(--ink-strong); background: var(--sky-glass);
  box-shadow: 0 0 0 1px #3a9de6, inset 0 1px 0 #fff, inset 0 -2px 0 rgba(41, 120, 210, .25), 0 2px 4px rgba(10, 60, 130, .25);
  transition: transform .14s var(--ease), box-shadow .14s, background .14s, opacity .14s, filter .14s; }
.mu-btn:hover, .mu-btn[data-state='hover'] { transform: translateY(-1px); background: var(--sky-glass-hover);
  box-shadow: 0 0 0 1px #2a8fe0, 0 0 0 3px rgba(0, 180, 255, .25), inset 0 1px 0 #fff, 0 6px 14px -5px rgba(0, 120, 230, .5); }
.mu-btn:active, .mu-btn[data-state='pressed'] { transform: translateY(0); filter: brightness(.96); box-shadow: 0 0 0 1px #2a8fe0, inset 0 2px 3px rgba(10, 60, 130, .25); }
.mu-btn:disabled, .mu-btn[data-state='disabled'] { opacity: .5; transform: none; filter: saturate(.3); }
.mu-btn.gold { color: var(--gold-ink);
  background: linear-gradient(180deg, #ffffc8 0%, #fff97f 30%, #f9e45f 50%, #f4d558 62%, #f0be45 85%, #eca430 100%);
  box-shadow: 0 0 0 1px var(--gold-edge), inset 0 1px 0 #fff, inset 0 -2px 0 rgba(200, 100, 0, .25), 0 3px 6px rgba(160, 80, 0, .3); }
.mu-btn.gold:hover, .mu-btn.gold[data-state='hover'] {
  background: linear-gradient(180deg, #ffffff 0%, #ffffe2 30%, #fcf4b8 50%, #faeaac 62%, #f6d086 85%, #f2b55e 100%);
  box-shadow: 0 0 0 1px var(--gold-edge), 0 0 0 3px rgba(255, 200, 40, .35), inset 0 1px 0 #fff, 0 8px 18px -6px rgba(180, 90, 0, .45); }
.mu-btn.gold:disabled, .mu-btn.gold[data-state='disabled'] { opacity: .6; filter: saturate(.3); }
.mu-icon-btn { display: inline-grid; place-items: center; width: 30px; height: 30px; min-width: 28px; min-height: 26px; border-radius: 8px; color: var(--ink-2);
  transition: background .14s, color .14s, box-shadow .14s; }
.mu-icon-btn:hover { color: var(--ink-strong); background: rgba(0, 150, 255, .12); box-shadow: inset 0 0 0 1px rgba(0, 150, 255, .4); }
.mu-icon-btn:disabled { opacity: .35; background: none; box-shadow: none; }
.mu-icon-btn.danger:hover { color: #fff; background: var(--bad); box-shadow: inset 0 0 0 1px #8a0c14; }
.mu-ico { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }

/* the level / count chip: the place plate's blue with gold edge, white figures */
.mu-chip { display: inline-flex; align-items: baseline; gap: 4px; height: 20px; padding: 0 8px; border-radius: 10px; font-size: 11px;
  font-weight: 700; letter-spacing: .02em; color: #fff; line-height: 20px; text-shadow: 0 1px 0 #0e3a9a;
  background: linear-gradient(180deg, #2f80ec, #164fc4); box-shadow: 0 0 0 1px #e3a52c, inset 0 1px 0 rgba(255, 255, 255, .45); }
.mu-chip b { font-size: 12px; font-weight: 800; }

.mu-scroll { overflow: auto; scrollbar-width: thin; scrollbar-color: #59c6ff transparent; overscroll-behavior: contain; }

@keyframes mu-rise { from { opacity: 0; transform: translateY(8px); filter: blur(3px); } }
@media (prefers-reduced-motion: reduce) { .mu *, .mu-plate { animation: none !important; transition: none !important; } }
`;

export function theme() {
  if (document.getElementById('mu-theme')) return;
  const st = document.createElement('style');
  st.id = 'mu-theme';
  st.textContent = CSS;
  document.head.append(st);
}
