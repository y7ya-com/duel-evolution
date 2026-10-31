// Modern UI's shared look (DESIGN.md beside this file): the tokens and the pieces every modern window is built from,
// injected once as a stylesheet scoped to .mu (a modern window's root element). Game pixels, as every htmlui layer.
// Colours come from the 2008 art (CONTRACT.md's sampled skin): azure #0985ff to sky #7deffc (the place plate), the
// menu bar's cyan #75ffff, the menu buttons' gold #f2e14f / #f1b323 with their brown edge #894009, silver bevels.
const CSS = `
.mu { --navy-950: #04112b; --navy-900: #061733; --navy-800: #0a2350; --navy-700: #0e3275; --navy-600: #154196;
  --azure-500: #0985ff; --azure-400: #3aa2ff; --sky-300: #7deffc; --cyan: #75ffff;
  --silver-50: #f3f7fc; --silver-200: #c9d6e6; --silver-400: #8fa3bd;
  --gold-200: #fff7c2; --gold-300: #f7e46c; --gold-400: #f1c330; --gold-500: #e7a51b; --gold-edge: #a8640f; --gold-ink: #3a2200;
  --ruby: #ff5d6c; --ink: #eaf6ff; --ink-2: #b7d3f2; --ink-3: #86a7cf;
  --ease: cubic-bezier(.16, 1, .3, 1);
  position: absolute; inset: 0; font-family: "Segoe UI Variable Text", "Segoe UI", "SF Pro Text", system-ui, -apple-system,
    "Helvetica Neue", Arial, sans-serif; font-size: 13px; line-height: 1.35; color: var(--ink);
  -webkit-font-smoothing: antialiased; font-variant-numeric: tabular-nums; }
.mu *, .mu *::before, .mu *::after { box-sizing: border-box; }
.mu ::selection { background: rgba(117, 255, 255, .35); color: #fff; }
:where(.mu) button { font: inherit; color: inherit; margin: 0; border: 0; background: none; padding: 0; text-align: inherit; }
.mu button:focus-visible, .mu input:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }

/* the plate: deep-blue glass in a silver rim, the 2008 gloss in its upper third, the art's scan lines faintly */
.mu-plate { position: absolute; border-radius: 18px 18px 18px 6px; isolation: isolate;
  background: linear-gradient(180deg, rgba(255, 255, 255, .13), rgba(255, 255, 255, 0) 34%),
    repeating-linear-gradient(180deg, rgba(255, 255, 255, .028) 0 1px, transparent 1px 3px),
    linear-gradient(160deg, #1b51b6 0%, var(--navy-700) 52%, var(--navy-800) 100%);
  box-shadow: 0 0 0 1px rgba(4, 17, 43, .92), inset 0 0 0 1px rgba(150, 205, 255, .26), inset 0 1px 0 rgba(255, 255, 255, .38),
    0 24px 48px -18px rgba(2, 10, 30, .72), 0 6px 14px rgba(2, 10, 30, .32);
  animation: mu-rise .26s var(--ease) both; }
.mu-plate::before { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1.5px; pointer-events: none; z-index: 1;
  background: linear-gradient(180deg, var(--silver-50), var(--silver-400) 46%, #dfe8f3 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }
.mu-head { display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 10px 0 16px; position: relative; }
.mu-head::after { content: ''; position: absolute; left: 14px; right: 14px; bottom: 0; height: 1px;
  background: linear-gradient(90deg, rgba(117, 255, 255, .75), rgba(117, 255, 255, .12) 70%, transparent); }
.mu-head h2 { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: .01em; color: #fff;
  text-shadow: 0 1px 1px rgba(2, 10, 30, .6); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mu-emblem { width: 22px; height: 22px; flex: none; color: var(--gold-300); filter: drop-shadow(0 1px 1px rgba(2, 10, 30, .6)); }

/* buttons: gold for the one primary action, glass for the rest, quiet for icons */
.mu-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 32px; padding: 0 16px;
  border-radius: 10px 10px 10px 4px; font-weight: 600; font-size: 13px; letter-spacing: .01em; white-space: nowrap;
  color: var(--ink); text-shadow: 0 1px 1px rgba(4, 16, 44, .55);
  background: linear-gradient(180deg, rgba(125, 239, 252, .24), rgba(9, 133, 255, .18) 50%, rgba(9, 100, 220, .26));
  box-shadow: inset 0 0 0 1px rgba(160, 225, 255, .42), inset 0 1px 0 rgba(255, 255, 255, .3), 0 2px 4px rgba(2, 10, 30, .3);
  transition: transform .14s var(--ease), box-shadow .14s, background .14s, opacity .14s; }
.mu-btn:hover, .mu-btn[data-state='hover'] { transform: translateY(-1px);
  background: linear-gradient(180deg, rgba(160, 245, 255, .38), rgba(9, 133, 255, .3) 50%, rgba(9, 110, 235, .4));
  box-shadow: inset 0 0 0 1px rgba(190, 240, 255, .78), inset 0 1px 0 rgba(255, 255, 255, .45), 0 6px 14px -5px rgba(0, 160, 255, .55); }
.mu-btn:active, .mu-btn[data-state='pressed'] { transform: translateY(0); box-shadow: inset 0 0 0 1px rgba(190, 240, 255, .6),
  inset 0 2px 4px rgba(2, 10, 30, .35); }
.mu-btn:disabled, .mu-btn[data-state='disabled'] { opacity: .42; transform: none; box-shadow: inset 0 0 0 1px rgba(160, 225, 255, .25); }
.mu-btn.gold { color: var(--gold-ink); text-shadow: 0 1px 0 rgba(255, 250, 210, .7);
  background: linear-gradient(180deg, var(--gold-200) 0%, var(--gold-300) 44%, var(--gold-400) 56%, var(--gold-500) 100%);
  box-shadow: 0 0 0 1px var(--gold-edge), inset 0 1px 0 rgba(255, 255, 255, .85), inset 0 -2px 0 rgba(137, 64, 9, .28),
    0 3px 6px rgba(40, 20, 0, .38); }
.mu-btn.gold:hover, .mu-btn.gold[data-state='hover'] {
  background: linear-gradient(180deg, #fffbd9 0%, #f9ea80 44%, #f4cc3e 56%, #eaae22 100%);
  box-shadow: 0 0 0 1px var(--gold-edge), 0 0 0 4px rgba(255, 226, 90, .28), inset 0 1px 0 #fff, inset 0 -2px 0 rgba(137, 64, 9, .28),
    0 8px 18px -6px rgba(120, 70, 0, .55); }
.mu-icon-btn { display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; color: var(--ink-2);
  transition: background .14s, color .14s, box-shadow .14s; }
.mu-icon-btn:hover { color: #fff; background: rgba(150, 205, 255, .16); box-shadow: inset 0 0 0 1px rgba(150, 205, 255, .35); }
.mu-icon-btn.danger:hover { color: #fff; background: rgba(255, 93, 108, .22); box-shadow: inset 0 0 0 1px rgba(255, 140, 150, .55); }
.mu-ico { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }

/* the level / count chip: a small silver lozenge with tabular numerals */
.mu-chip { display: inline-flex; align-items: baseline; gap: 4px; height: 20px; padding: 0 8px; border-radius: 10px; font-size: 11px;
  font-weight: 650; letter-spacing: .02em; color: var(--navy-800); line-height: 20px;
  background: linear-gradient(180deg, #fff, var(--silver-200)); box-shadow: 0 0 0 1px rgba(4, 17, 43, .5), inset 0 -1px 0 rgba(143, 163, 189, .6); }
.mu-chip b { font-size: 12px; font-weight: 750; }

.mu-scroll { overflow: auto; scrollbar-width: thin; scrollbar-color: rgba(150, 205, 255, .5) transparent; overscroll-behavior: contain; }

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
