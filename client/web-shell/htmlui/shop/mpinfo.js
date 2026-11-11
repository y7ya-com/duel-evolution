// One MP number everywhere (the shop's band, the Cosmetic Boxes tab and box page, the native shop's MP plate, the
// Missions header), and beside it a small (i): on hover, focus or click, how much of it is starter MP (the wallet's
// `bound`: it buys card packs, never cosmetic boxes). Self-contained CSS, so it sits in any of those windows.
//   mpNote(wallet)        the tooltip's words
//   mpInfo(wallet, o)     the (i) button with its tooltip; o.align 'right' (default: the tip's right edge under the
//                         icon's, for a readout near the screen's right) or 'left'; o.below (default true)
const fmt = n => Math.max(0, Math.round(+n || 0)).toLocaleString('en-US');
export const starterMp = w => Math.max(0, Math.min(+w?.total || 0, w?.bound ?? ((+w?.total || 0) - (+w?.earned || 0))));

export function mpNote(w) {
  const total = +w?.total || 0, bound = starterMp(w);
  return bound > 0
    ? `${fmt(total)} MP total · ${fmt(bound)} MP is starter MP: it buys card packs but not cosmetic boxes.`
    : `${fmt(total)} MP total · none of it is starter MP: it buys card packs and cosmetic boxes.`;
}

// the game's cyan info plate: #06283a on #8fe0ff is 10.9:1; the tip #fff on #06283a 15.1:1
const CSS = `
.mpi { position: relative; display: inline-grid; place-items: center; flex: none; width: 16px; height: 16px; margin: 0; padding: 0;
  border: 0; border-radius: 8px; background: linear-gradient(#c7f1ff, #8fe0ff); box-shadow: 0 0 0 1px #0b6f9c, inset 0 1px 0 rgba(255,255,255,.8);
  color: #06283a; font: bold 11px/16px Georgia, 'Times New Roman', serif; font-style: italic; text-align: center; cursor: inherit;
  pointer-events: auto; vertical-align: middle; }
.mpi:hover, .mpi:focus-visible, .mpi[data-open] { background: linear-gradient(#fffbd0, #ffd75e); box-shadow: 0 0 0 1px #8a5a00, inset 0 1px 0 #fff; }
.mpi:focus-visible { outline: 2px solid #ffe600; outline-offset: 1px; }
.mpi > .mpi-tip { position: absolute; top: calc(100% + 8px); right: -8px; z-index: 10; display: none; width: max-content; max-width: 232px;
  padding: 8px 12px; box-sizing: border-box; border-radius: 4px; background: #06283a; box-shadow: 0 0 0 1px #8fe0ff, 0 4px 12px rgba(0,20,40,.45);
  color: #fff; font: normal 12px/16px Arial, 'Liberation Sans', sans-serif; letter-spacing: 0; text-align: center; white-space: normal;
  pointer-events: none; text-shadow: none; }
.mpi[data-align=left] > .mpi-tip { right: auto; left: -8px; }
.mpi[data-above] > .mpi-tip { top: auto; bottom: calc(100% + 8px); }
.mpi:hover > .mpi-tip, .mpi:focus-visible > .mpi-tip, .mpi[data-open] > .mpi-tip { display: block; }
`;
function inject(doc) {
  if (doc.getElementById('de-mpi-css')) return;
  const s = doc.createElement('style');
  s.id = 'de-mpi-css'; s.textContent = CSS;
  doc.head.append(s);
}

let uid = 0;
/** The (i) and its tooltip; `set(wallet)` on the element updates the words. */
export function mpInfo(w, { align = 'right', below = true, doc = document } = {}) {
  inject(doc);
  const b = doc.createElement('button'), tip = doc.createElement('span');
  b.type = 'button'; b.className = 'mpi'; b.textContent = 'i';
  if (align === 'left') b.dataset.align = 'left';
  if (!below) b.dataset.above = '';
  tip.className = 'mpi-tip'; tip.id = 'mpi-tip-' + ++uid; tip.setAttribute('role', 'tooltip');
  b.setAttribute('aria-describedby', tip.id);
  b.append(tip);
  b.set = w => { tip.textContent = mpNote(w); b.setAttribute('aria-label', 'About your MP: ' + tip.textContent); };
  b.set(w);
  // a click (or a tap) keeps it open until the next click, a click elsewhere or Escape
  const shut = e => { if (!b.contains(e.target)) { b.removeAttribute('data-open'); doc.removeEventListener('pointerdown', shut, true); } };
  b.addEventListener('click', e => {
    e.stopPropagation();
    if (b.toggleAttribute('data-open')) doc.addEventListener('pointerdown', shut, true); else doc.removeEventListener('pointerdown', shut, true);
  });
  b.addEventListener('keydown', e => { if (e.key === 'Escape' && b.hasAttribute('data-open')) { e.stopPropagation(); b.removeAttribute('data-open'); } });
  return b;
}
