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
  --r-plate: 14px; --r-ctl: 9px; --r-row: 7px; --ease: cubic-bezier(.16, 1, .3, 1); }
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

/* the plate: a white-to-silver panel with real depth (an inner top light, a crisp edge, a soft shadow) */
.mu-plate { position: absolute; border-radius: var(--r-plate) var(--r-plate) var(--r-plate) 6px; isolation: isolate; background: var(--plate);
  box-shadow: 0 0 0 1px var(--plate-edge), inset 0 1px 0 var(--plate-hi), inset 0 -1px 0 rgba(20, 50, 100, .05),
    0 16px 32px -14px rgba(10, 35, 80, .45), 0 3px 8px rgba(10, 35, 80, .16);
  animation: mu-rise .26s var(--ease) both; }
/* the title band: the 2008 title bar's blue, calmer */
.mu-head { display: flex; align-items: center; gap: 10px; height: 38px; padding: 0 8px 0 14px; position: relative;
  border-radius: var(--r-plate) var(--r-plate) 0 0; background: var(--band);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .28), inset 0 -1px 0 var(--band-edge); }
.mu-head h2 { margin: 0; font-size: 14px; font-weight: 700; letter-spacing: .01em; color: #fff; text-shadow: 0 1px 0 rgba(0, 20, 60, .35);
  flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mu-head .mu-icon-btn { color: rgba(255, 255, 255, .9); }
.mu-head .mu-icon-btn:hover { color: #fff; background: rgba(255, 255, 255, .18); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .35); }
.mu-emblem { width: 20px; height: 20px; flex: none; color: var(--gold-300); }

/* buttons: gold for the one primary action, silver for the rest */
.mu-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 32px; padding: 0 16px;
  border-radius: var(--r-ctl); font-weight: 650; font-size: 13px; letter-spacing: .01em; white-space: nowrap; color: var(--ink-strong);
  background: var(--btn); box-shadow: 0 0 0 1px var(--btn-edge), inset 0 1px 0 #fff, 0 1px 2px rgba(10, 35, 80, .12);
  transition: transform .14s var(--ease), box-shadow .14s, background .14s, opacity .14s, filter .14s; }
.mu-btn:hover, .mu-btn[data-state='hover'] { transform: translateY(-1px); background: var(--btn-hover);
  box-shadow: 0 0 0 1px var(--p500), inset 0 1px 0 #fff, 0 6px 14px -6px rgba(20, 70, 160, .45); }
.mu-btn:active, .mu-btn[data-state='pressed'] { transform: translateY(0); filter: brightness(.97); box-shadow: 0 0 0 1px var(--p500), inset 0 1px 2px rgba(10, 35, 80, .15); }
.mu-btn:disabled, .mu-btn[data-state='disabled'] { opacity: .5; transform: none; }
.mu-btn.gold { color: var(--gold-ink); background: var(--gold);
  box-shadow: 0 0 0 1px var(--gold-edge), inset 0 1px 0 rgba(255, 255, 255, .8), 0 2px 4px rgba(120, 70, 0, .22); }
.mu-btn.gold:hover, .mu-btn.gold[data-state='hover'] { filter: brightness(1.04) saturate(1.05);
  box-shadow: 0 0 0 1px var(--gold-edge), inset 0 1px 0 #fff, 0 6px 14px -6px rgba(140, 80, 0, .45); }
.mu-btn.gold:disabled, .mu-btn.gold[data-state='disabled'] { opacity: .55; filter: saturate(.3); }
.mu-icon-btn { display: inline-grid; place-items: center; width: 30px; height: 30px; min-width: 28px; min-height: 26px; border-radius: 8px; color: var(--ink-2);
  transition: background .14s, color .14s, box-shadow .14s; }
.mu-icon-btn:hover { color: var(--ink-strong); background: var(--p50); box-shadow: inset 0 0 0 1px var(--p200); }
.mu-icon-btn:disabled { opacity: .35; background: none; box-shadow: none; }
.mu-icon-btn.danger:hover { color: #fff; background: var(--bad); box-shadow: inset 0 0 0 1px #8a0c14; }
.mu-ico { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }

/* the level / count chip: the primary blue, white figures, a hairline gold edge */
.mu-chip { display: inline-flex; align-items: baseline; gap: 4px; height: 20px; padding: 0 8px; border-radius: 10px; font-size: 11px;
  font-weight: 700; letter-spacing: .02em; color: #fff; line-height: 20px; background: var(--sel); box-shadow: 0 0 0 1px var(--gold-edge); }
.mu-chip b { font-size: 12px; font-weight: 800; }

.mu-scroll { overflow: auto; scrollbar-width: thin; scrollbar-color: var(--n300) transparent; overscroll-behavior: contain; }

@keyframes mu-rise { from { opacity: 0; transform: translateY(8px); filter: blur(3px); } }
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
  st.textContent = CSS;
  document.head.append(st);
}
