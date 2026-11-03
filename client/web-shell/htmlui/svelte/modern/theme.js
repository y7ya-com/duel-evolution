// Shared Modern UI materials, sampled from the original window/title/button atlases (controls/skin.js).
// Geometry stays in game pixels; the bridge scales the whole HUD with the native 1024×768 scene.
const CSS = `
:root {
  --p900:#073e91; --p700:#075db9; --p600:#0878d4; --p500:#168cf0; --p200:#a7e4fa; --p50:#e2f8ff;
  --n0:#fff; --n50:#f0fcff; --n100:#ddf4fc; --n200:#b6dfef; --n300:#85bcd6; --n500:#487d9f;
  --stage:radial-gradient(ellipse at 48% 20%,#8ce8ff 0%,#41a9e5 44%,#1167b3 100%);
  --plate:linear-gradient(180deg,rgba(226,252,255,.98),rgba(169,232,251,.96) 45%,rgba(119,207,242,.97));
  --plate-edge:#1476c4; --plate-hi:#c3ffff;
  --band:linear-gradient(180deg,#e4fcff 0%,#a1def9 12%,#5eb3f0 44%,#2585dc 49%,#1761bf 100%);
  --band-edge:#104eaa; --bar:linear-gradient(180deg,#d8faff,#79d6fc 12%,#2189e4 70%,#145ec9); --bar-edge:#104eaa;
  --btn:linear-gradient(180deg,#fff 0%,#e7fbff 12%,#b5eaff 48%,#83cef5 51%,#5bb3e9 100%);
  --btn-hover:linear-gradient(180deg,#fff,#d7ffff 50%,#a3edff 52%,#7acdf5); --btn-edge:#267dbb;
  --dock:linear-gradient(180deg,#d7ffff 0%,#9ceaff 8%,#4bb9ed 20%,#247bc9 100%); --dock-field:rgba(234,252,255,.97);
  --card:linear-gradient(180deg,#f4fdff,#c9effb); --sel:linear-gradient(180deg,#61c7ff 0%,#258ee8 45%,#0963c7 52%,#0752a9 100%);
  --well:#effcff; --well-shadow:inset 0 1px 3px #164c7738,inset 0 0 0 1px #6299bd,0 1px 0 #e3ffff;
  --gold-200:#ffffd8; --gold-300:#fff99b; --gold-400:#f6d65c; --gold-500:#e8a937; --gold-edge:#bf7819; --gold-ink:#432e08;
  --gold:linear-gradient(180deg,#fffbd0 0%,#fffba1 12%,#fae773 47%,#f2cd51 51%,#eca431 100%);
  --ink:#14365b; --ink-2:#244f76; --ink-3:#376384; --ink-strong:#072b50; --link:#004fb1; --icon:#0864b7; --icon-warm:#b37414;
  --ok:#18763f; --warm:#895000; --bad:#b01f2b; --focus:#ffdc65;
  --r-plate:4px; --r-ctl:3px; --r-row:2px;
  --frame:linear-gradient(135deg,#d1ffff,#72e1ff 40%,#2789d2); --frame-rim:#207bb9;
  --lip:#246b9f; --lip-gold:#a36b17;
  --display:"Arial Black",Arial,sans-serif; --ease:cubic-bezier(.16,1,.3,1); --press:.035s; --release:.09s; --spring:ease-out;
}
/* Saved alternate palettes remain supported; all retain the same window materials. */
:root[data-mu-palette='b'] { --plate:linear-gradient(180deg,#eaffff,#b4f2ff 50%,#83ddfa); --stage:radial-gradient(ellipse at 50% 20%,#c3f5ff,#5bbcf0 55%,#227cc7); }
:root[data-mu-palette='c'] { --plate:linear-gradient(180deg,#c7edfa,#9cd4ef 50%,#6cb3df); --band:linear-gradient(180deg,#bfedff,#60afea 30%,#176cc3 52%,#104c99); }
.mu { position:absolute; inset:0; font:13px/1.35 Arial,"Helvetica Neue",sans-serif; color:var(--ink); font-variant-numeric:tabular-nums;
  --azure-500:var(--p700); --azure-400:var(--p500); --sky-300:var(--link); --brand:var(--p700); --brand-deep:var(--p900);
  --sky-glass:var(--btn); --sky-glass-hover:var(--btn-hover); --navy-900:var(--ink-strong); --silver-50:var(--n50); --silver-200:var(--n200); --silver-400:var(--n500); }
.mu *, .mu *::before, .mu *::after { box-sizing:border-box; }
#htmlui [data-modern-owned='1'] .mu-plate,.mu button,.mu input,.mu textarea,.mu select { pointer-events:auto; }
:where(.mu) button { font:inherit; color:inherit; margin:0; border:0; background:none; padding:0; text-align:inherit; }
.mu ::selection { background:#91d6ff; color:#092f58; }
.mu :is(button,input,textarea,select):focus-visible { outline:2px solid var(--focus); outline-offset:2px; }
/* A cyan bevel around an opaque reading surface: no cut-out metal cards or blurred game art. */
.mu-plate { position:absolute; isolation:isolate; border:1px solid #1268b2; border-radius:4px; background:none;
  box-shadow:0 2px 0 #07549b80,0 5px 12px #082f6755; filter:none; }
.mu-plate::before,.mu-plate::after { content:''; position:absolute; pointer-events:none; border-radius:inherit; }
.mu-plate::before { inset:0; z-index:-2; border:2px solid; border-color:#b6ffff #3b9eda #2885ca #87f4ff; background:var(--frame); }
.mu-plate::after { inset:3px; z-index:-1; border:1px solid #4fa9d6; background:linear-gradient(180deg,#ffffff42,transparent 34px),var(--plate); }
.mu-head,.mu-plaque { position:relative; display:flex; align-items:center; gap:8px; min-height:29px; height:29px; margin:3px 3px 0; padding:0 5px 0 9px;
  background:var(--band); border:1px solid #599bdd; border-bottom-color:#074bad; border-radius:2px 2px 0 0; box-shadow:inset 0 1px 0 #e5ffff,inset 0 -1px 0 #71b4f3; clip-path:none; }
.mu-head h2,.mu-plaque>:is(h2,span) { flex:1; min-width:0; margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  font:700 15px Arial,sans-serif; letter-spacing:.015em; color:#fff; text-shadow:0 1px 0 #114d91,1px 0 #1d5da5,-1px 0 #1d5da5; }
.mu-head .mu-icon-btn,.mu-plaque .mu-icon-btn { width:22px; height:20px; min-width:20px; min-height:20px; border-radius:2px; color:#0a4c9b;
  background:var(--gold); box-shadow:inset 0 1px #fffbd9,0 0 0 1px #9d7c3f; }
.mu-head .mu-icon-btn:hover,.mu-plaque .mu-icon-btn:hover { filter:brightness(1.12); background:var(--gold); color:#062d68; }
.mu-emblem { width:18px; height:18px; flex:none; color:#fff9b1; filter:drop-shadow(0 1px #315c91); }
/* Physical keys: original blue and yellow, restrained two-pixel lower bevel and no hover movement. */
.mu-btn { position:relative; display:inline-flex; align-items:center; justify-content:center; gap:7px; height:28px; padding:0 12px; overflow:hidden; border:1px solid var(--btn-edge);
  border-radius:3px; font-weight:700; font-size:13px; white-space:nowrap; color:var(--ink-strong); text-shadow:0 1px #f0ffff;
  background:var(--btn); box-shadow:inset 0 1px #fff,inset 1px 0 #d9ffff,inset 0 -2px #2d83b74d,0 1px 0 #1f629a;
  transition:filter .1s,box-shadow .1s,transform var(--release); }
.mu-btn::after { content:''; pointer-events:none; position:absolute; inset:0; box-shadow:inset 0 0 0 1px #ffffff45; border-radius:2px; }
.mu-btn:hover,.mu-btn[data-state='hover'] { background:var(--btn-hover); filter:brightness(1.04); box-shadow:inset 0 1px #fff,0 0 0 1px #bcffff,0 1px 0 #1e659a; }
.mu-btn:active,.mu-btn[data-state='pressed'] { transform:translateY(1px); box-shadow:inset 0 2px 3px #12538455,0 0 0 1px #efffff; }
.mu-btn:disabled,.mu-btn[data-state='disabled'] { opacity:.5; filter:saturate(.35); transform:none; }
.mu-btn.gold { border-color:var(--gold-edge); background:var(--gold); color:var(--gold-ink); text-shadow:0 1px #fffddd;
  box-shadow:inset 0 1px #ffffe6,inset 1px 0 #fff8bc,inset 0 -2px #be7c2440,0 1px #9e6117; }
.mu-btn.gold:hover,.mu-btn.gold[data-state='hover'] { filter:brightness(1.08); box-shadow:inset 0 1px #fff,0 0 0 1px #fffeb8,0 1px #a36a18; }
.mu-btn.gold:active { box-shadow:inset 0 2px 3px #a8653155; }
.mu-icon-btn { display:inline-grid; place-items:center; width:25px; height:25px; min-width:24px; min-height:24px; border-radius:3px; color:var(--ink-2); }
.mu-icon-btn:hover { background:#c4f2ff; box-shadow:inset 0 0 0 1px #5da9d5; }
.mu-icon-btn:active { transform:translateY(1px); }
.mu-icon-btn:disabled { opacity:.4; }
.mu-icon-btn.danger:hover { color:#fff; background:var(--bad); }
.mu-ico { width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; flex:none; }
.mu-field { display:block; width:100%; height:29px; padding:0 8px; border:1px solid #5d95b6; border-radius:2px; font:inherit; font-size:13px; color:var(--ink-strong);
  background:linear-gradient(180deg,#d5eaf2 0,#f9ffff 5px,#effbff); box-shadow:inset 1px 1px 2px #16476a30,0 1px #e3ffff; user-select:text; }
textarea.mu-field { height:auto; padding:8px 10px; resize:none; line-height:1.45; }
.mu-field::placeholder { color:#52758f; }
.mu-field:focus { outline:2px solid #f4d66c; outline-offset:0; background:#faffff; }
.mu-tabs { display:flex; gap:3px; padding:3px 3px 0; border-radius:3px 3px 0 0; background:#5ba8d3; box-shadow:inset 0 1px 2px #12548555; }
.mu-tab { flex:1; min-height:25px; height:25px; padding:0 9px; border:1px solid #5c95bf; border-radius:4px 4px 0 0; font-weight:700; font-size:12px; color:#234f78;
  background:linear-gradient(#f1ffff,#b2ddf4); box-shadow:inset 0 1px #fff; }
.mu-tab:hover { background:#eaffff; }
.mu-tab[aria-selected='true'],.mu-tab.on { color:#fff; background:var(--sel); text-shadow:0 1px #18417d; border-color:#1666ad; box-shadow:inset 0 2px #ffef9b; }
.mu-list { border-radius:2px; background:var(--well); box-shadow:var(--well-shadow); }
.mu-row { position:relative; display:flex; align-items:center; gap:8px; min-height:27px; padding:0 9px; color:var(--ink); border-bottom:1px solid #b3d9ec66; }
.mu-row:nth-child(even) { background:#d8eff966; }
.mu-row:hover { background:#bceaff; }
.mu-row[aria-selected='true'],.mu-row.on { color:#fff; background:var(--sel); text-shadow:0 1px #154278; }
.mu-row[aria-selected='true']::before,.mu-row.on::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; background:#fff098; }
.mu-chip { display:inline-flex; align-items:baseline; gap:4px; height:21px; padding:0 7px; border:1px solid #1d6cab; border-radius:3px; font-size:11px; font-weight:700; line-height:19px;
  color:#fff; background:var(--sel); text-shadow:0 1px #164a7c; box-shadow:inset 0 1px #7cd3ff; }
.mu-chip b { font-size:12px; }
.mu-scroll { overflow:auto; scrollbar-width:thin; scrollbar-color:#378bd0 #c2eaf8; overscroll-behavior:contain; }
html.mu-modern #rc-audio { font:13px/1.4 Arial,sans-serif; color:var(--ink); background:#073c7355; }
html.mu-modern #rc-audio .win { background:var(--plate); border:3px solid #76dfff; outline:1px solid #1268b2; border-radius:4px; box-shadow:0 5px 16px #082f6760; }
html.mu-modern #rc-audio .bar { background:var(--band); color:#fff; font:bold 15px/32px Arial,sans-serif; text-shadow:0 1px #125799; border-bottom:1px solid #124fa9; }
html.mu-modern #rc-audio .note,html.mu-modern #rc-audio .slot,html.mu-modern #rc-audio .list { background:var(--well); border:1px solid #75a8c5; border-radius:2px; color:var(--ink); }
html.mu-modern #rc-audio :is(.label,.name) { color:var(--ink-strong); text-shadow:none; }
html.mu-modern #rc-audio :is(.count,.hint,.desc,.vol) { color:var(--ink-3); text-shadow:none; }
html.mu-modern #rc-audio :is(.cbtn,.ok,.opt) { border:1px solid var(--btn-edge); border-radius:3px; background:var(--btn); color:var(--ink-strong); font:700 13px Arial,sans-serif; box-shadow:inset 0 1px #fff,0 1px #246b9f; }
html.mu-modern #rc-audio .ok { background:var(--gold); border-color:var(--gold-edge); }
html.mu-modern #rc-audio .opt.on { background:var(--sel); color:#fff; }
html.mu-modern #rc-audio .foot { background:none; border-top:1px solid #6ba9cf; }
@keyframes mu-rise { from { opacity:0; } }
@media(prefers-reduced-motion:reduce) { .mu *, .mu *::after { animation:none!important; transition:none!important; } }
`;
export function theme() {
  const q = new URLSearchParams(location.search).get('MU_PALETTE');
  let v = q;
  try { if (q) localStorage.setItem('yo2.muPalette', q); else v = localStorage.getItem('yo2.muPalette'); } catch {}
  if (/^[bc]$/.test(v || '')) document.documentElement.dataset.muPalette = v; else delete document.documentElement.dataset.muPalette;
  if (document.getElementById('mu-theme')) return;
  const st = document.createElement('style'); st.id = 'mu-theme'; st.textContent = CSS; document.head.append(st);
}
