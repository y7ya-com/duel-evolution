// The Cosmetic Boxes tab of the full-screen shop (shop/index.js), in the shop's own look (shop/css.js: the glass, the
// slate band, the .bt pills and plates, the .rf rarity frames): the same family as Card Packs. Replaces the box shop that
// drew inside the native Avatar Parts frame (cosmetics/boxes.js: now reached only with ?HTML_SHOP=0).
//   the side    the boxes (Head & Hair / Outfit / Duel Disk) as the sub-nav, the MP (its (i): how much is starter MP)
//   the home    a banner per box: its category art, collected, the guarantees, its rarest items worn on the player, Open
//   the page    the try-on (the player's waist-up: cosmetics/waistup.js; a click on an item puts it on, Reset takes it
//               off), the items by rarity (each one worn, framed on the item), the price, the guarantees (Super Rare x/8,
//               Ultra Rare x/15), the odds, Contents & odds, Open Box (MP that isn't starter MP: "Needs 1,200 more MP ·
//               starter MP can't open boxes")
//   the sheet   Contents & odds: the odds per rarity (the next open's when a guarantee moves them), every item, owned
//   the reveal  the shop's reveal (shop/reveal.js's dim, head, foot): the box turns over to the item worn in its rarity
//               frame and glow, New or Duplicate ×n, the "can't wear yet" note, Equip, Open another, Done
// Every item is shown worn: the player's own look with only that item swapped in (boxes-model.js bustLook), an item made
// for the other body so far on that body's default look (and the "Male version coming soon" note).
// Data and actions: cosmetics/api.js (getInfo, openBox with its request ids, equip), the numbers boxes-model.js's.
import * as api from '../cosmetics/api.js';
import { RARITY } from '../cosmetics/theme.js';
import { TABS, BOX_LOOK, boxView, contents, revealView, pct, wearWorld, wipNotice, bustLook, ownLook, pityMeters, stripItems,
  RCODE } from '../cosmetics/boxes-model.js';
import { renderWaistUp, BUST } from '../cosmetics/waistup.js';
import { renderItemArt } from '../cosmetics/art.js';
import { h, at, mp, bar, bt } from './dom.js';
import { mpInfo } from './mpinfo.js';

const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const BOX_CSS = `
/* a cosmetic worn: the try-on's sky (the Wardrobe's) in the rarity frame */
.ns .sky { position: relative; overflow: hidden; background: radial-gradient(ellipse 85% 60% at 50% 58%, #f4fcff, #bfe6fa 60%, #8dcbf0); }
.ns .sky::before { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(transparent 15px, rgba(255,255,255,.4) 15px) 0 0 / 16px 16px, linear-gradient(90deg, transparent 15px, rgba(255,255,255,.4) 15px) 0 0 / 16px 16px; }
.ns .rf > .face.sky { background: radial-gradient(ellipse 85% 60% at 50% 58%, #f4fcff, #bfe6fa 60%, #8dcbf0); }
.ns .sky > .de-wu { position: absolute; inset: 0; }
.ns .sky > .de-art { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); }
.ns .rf[data-other] > .face > .de-wu { filter: saturate(.85); }
/* the home's banners: the box's category art */
.ns .bxb .art { position: absolute; left: 20px; top: 48px; width: 240px; height: 72px; background-size: 100% 100%;
  box-shadow: 0 0 0 1px rgba(0,0,0,.45), 3px 4px 8px rgba(0,30,60,.35); background-color: rgba(120,220,235,.35); }
.ns .bxb .rf { width: 88px; height: 118px; }
/* the page: the try-on, the items, the price column */
.ns .bx-try { position: absolute; left: 24px; top: 94px; width: 300px; height: 456px; border-radius: 3px;
  box-shadow: 0 0 0 1px #3d8db3, 0 0 0 3px rgba(255,255,255,.75), 0 3px 8px rgba(0,40,70,.3); }
.ns .bx-try > .de-wu { top: auto; bottom: 0; height: 369px; }
.ns .bx-chip { position: absolute; left: 12px; top: 12px; z-index: 2; height: 24px; padding: 0 10px 0 8px; display: flex; align-items: center; gap: 6px;
  border-radius: 12px; background: linear-gradient(#ffffff, #dde4e8); box-shadow: 0 0 0 1px rgba(60,80,92,.6), 0 1px 2px rgba(0,30,50,.25); font-size: 12.5px; }
.ns .bx-chip::before { content: ''; width: 8px; height: 8px; border-radius: 4px; background: #2aa8d8; box-shadow: 0 0 0 1px rgba(0,0,0,.3); }
.ns .bx-chip[data-on]::before { background: #ffb21c; }
.ns .bx-try .who { position: absolute; left: 14px; right: 14px; top: 46px; z-index: 2; text-shadow: 0 1px 0 rgba(255,255,255,.8); }
.ns .bx-items { position: absolute; left: 340px; top: 94px; width: 412px; height: 634px; }
.ns .bx-items > .in { display: grid; grid-template-columns: repeat(4, 92px); column-gap: 8px; row-gap: 10px; padding: 12px 10px 16px 12px; }
.ns .bx-items .ghd { grid-column: 1 / -1; display: flex; align-items: center; gap: 4px; height: 20px; color: var(--sub); }
.ns .bx-items .ghd:not(:first-child) { margin-top: 6px; }
.ns .bx-tile { position: relative; width: 92px; height: 152px; margin: 0; padding: 0; border: 0; background: none; cursor: inherit; text-align: center; color: #000; }
.ns .bx-tile > .rf { left: 0; top: 0; width: 92px; height: 116px; }
.ns .bx-tile > .nm { position: absolute; left: -2px; right: -2px; top: 122px; font-size: 12.5px; line-height: 14px; white-space: normal;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.ns .bx-tile:hover > .rf { filter: brightness(1.06); }
.ns .bx-tile[aria-pressed=true] > .rf { box-shadow: 0 0 0 1px #0b6f9c, 0 0 0 3px #52c6f7, 0 0 10px 3px rgba(82,198,247,.7); }
.ns .bx-tile[aria-pressed=true] > .nm { color: #053246; }
.ns .bx-tile:focus-visible { outline: none; }
.ns .bx-tile:focus-visible > .rf { outline: 2px solid var(--ring); outline-offset: 3px; }
.ns .bx-only { position: absolute; left: 4px; bottom: 4px; z-index: 2; height: 16px; line-height: 16px; padding: 0 5px; font-size: 11px; color: #fff;
  border-radius: 2px; background: rgba(43,61,70,.88); }
.ns .rf .own[data-k=owned] { background: linear-gradient(#2f8a4e, #1f6b3a); box-shadow: 0 0 0 1px #12401f; }
/* the guarantees: a clean bar each, the tier's metal; glowing when the next open lands it */
.ns .bx-pity { position: absolute; display: grid; grid-template-columns: 1fr auto; row-gap: 4px; column-gap: 8px; align-items: center; }
.ns .bx-pity .bar { position: relative; grid-column: 1 / -1; height: 10px; }
.ns .bx-pity .bar > i { background-color: var(--c); }
.ns .bx-pity [data-next] + .bar { box-shadow: 0 0 0 1px #1b252c, 0 0 6px 1px var(--c); }
/* the reveal: one item, turned over from the box */
.ns .rv .bxr { position: absolute; left: 392px; top: 124px; width: 240px; height: 320px; perspective: 1100px; }
/* the card get's glow frame, its window (30, 36, 320 x 428 of 380 x 500) on the card */
.ns .rv .bxr .glow { position: absolute; left: -23px; top: -27px; width: 285px; height: 374px; background: var(--sa-glow) 0 0 / 100% 100% no-repeat; opacity: 0; transition: opacity .3s; }
.ns .rv .bxr[data-r=N] .glow { filter: grayscale(1) brightness(1.5); }
.ns .rv .bxr[data-r=SR] .glow { filter: hue-rotate(95deg) saturate(1.2); }
.ns .rv .bxr[data-r=UR] .glow { filter: hue-rotate(-140deg) saturate(1.5) brightness(1.15); }
.ns .rv .bxr[data-open] .glow { opacity: 1; }
.ns .rv .bxr .flip { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform .5s cubic-bezier(.3,.7,.3,1); transform: rotateY(180deg); }
.ns .rv .bxr[data-open] .flip { transform: none; }
.ns .rv .bxr .flip > * { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.ns .rv .bxr .bk { transform: rotateY(180deg); border-radius: 3px; box-shadow: 0 0 0 1px #1b252c, 0 4px 12px rgba(0,0,0,.5);
  background: radial-gradient(ellipse 85% 60% at 50% 50%, #f4fcff, #8dcbf0); animation: bx-breathe .9s ease-in-out infinite alternate; }
.ns .rv .bxr .bk > .art { position: absolute; left: 12px; right: 12px; top: 124px; height: 64px; background-size: 100% 100%; box-shadow: 0 0 0 1px rgba(0,0,0,.4); }
.ns .rv .bxr .rf { position: absolute; inset: 0; padding: 4px; }
.ns .rv .bxr[data-r=UR] .rf { box-shadow: 0 0 0 1px #1b252c, 0 0 22px 5px rgba(255,214,90,.8); }
.ns .rv .bxr[data-r=SR] .rf { box-shadow: 0 0 0 1px #1b252c, 0 0 16px 4px rgba(190,140,255,.7); }
.ns .rv .bxr .sheen { position: absolute; inset: 4px; overflow: hidden; pointer-events: none; z-index: 3; }
.ns .rv .bxr .sheen::before { content: ''; position: absolute; top: -20%; bottom: -20%; left: -60%; width: 55%; transform: translateX(-100%) skewX(-18deg);
  background: linear-gradient(to right, transparent, rgba(255,240,190,.55) 40%, rgba(255,255,255,.85) 50%, rgba(255,240,190,.55) 60%, transparent); }
.ns .rv .bxr[data-open] .sheen::before { animation: bx-sweep 1.1s ease-in-out .45s 1 both; }
.ns .rv .bxinfo { position: absolute; left: 212px; width: 600px; top: 470px; display: flex; flex-direction: column; align-items: center; gap: 6px;
  opacity: 0; transition: opacity .25s; }
.ns .rv[data-phase=done] .bxinfo { opacity: 1; }
.ns .rv .bxinfo .rl[data-r=N] { color: #e4eaee; } .ns .rv .bxinfo .rl[data-r=R] { color: #8fe6ff; }
.ns .rv .bxinfo .rl[data-r=SR] { color: #d6b8ff; } .ns .rv .bxinfo .rl[data-r=UR] { color: #ffd862; }
.ns .rv .bxinfo .badges { display: flex; gap: 8px; height: 20px; }
.ns .rv .bxinfo .own { opacity: 1; position: relative; right: auto; bottom: auto; height: 20px; line-height: 20px; padding: 0 8px; font-size: 12.5px; }
.ns .rv .bxinfo .own[data-new] { background: linear-gradient(#ffd75e, #ffb21c); color: #3a1b00; box-shadow: 0 0 0 1px #8a5200; }
.ns .rv[data-phase=wait] .foot, .ns .rv[data-phase=flip] .foot { visibility: hidden; }
@keyframes bx-breathe { from { filter: brightness(.9); } to { filter: brightness(1.08); } }
@keyframes bx-sweep { from { transform: translateX(-100%) skewX(-18deg); } to { transform: translateX(380%) skewX(-18deg); } }
@media (prefers-reduced-motion: reduce) { .ns .rv .bxr .flip { transition: none; } .ns .rv .bxr .bk, .ns .rv .bxr .sheen::before { animation: none !important; } }
`;
function injectBoxCss(doc) {
  if (!doc || doc.getElementById('ns-box-css')) return;
  doc.head.append(Object.assign(doc.createElement('style'), { id: 'ns-box-css', textContent: BOX_CSS }));
}
const banner = id => `var(--sa-${BOX_LOOK[id]?.banner || 'bnHead'})`;
const BOX_NAME = { head: 'Head & Hair', outfit: 'Outfit', dueldisk: 'Duel Disk' };
const short = n => Number(n || 0).toLocaleString('en-US');

/**
 * The tab's pieces for shop/index.js, which places them: side(), home(), page(id), band(id). opts: { el (the shop's
 * root, for the sheet and the reveal), rerender(), say(text), onWallet(wallet) (the band's), onPage(id) (open a box's
 * page) } -> { side, home, page, band, load(force), destroy(), get info }
 */
export function createBoxes({ el, rerender, say, onWallet, onPage }) {
  const doc = el.ownerDocument;
  injectBoxCss(doc);
  const S = { info: api.peekInfo(), error: null, busy: false, pv: {}, dead: false };
  const off = api.onChange(i => { if (S.dead) return; S.info = i; onWallet?.(i.wallet); rerender(); });
  function load(force) {
    return api.getInfo({ force }).then(i => { if (S.dead) return; S.info = i; S.error = null; onWallet?.(i.wallet); rerender(); },
      e => { if (S.dead) return; S.error = e; rerender(); });
  }

  // ---------------------------------------------------------------- an item, worn
  // kept per place and look (a rebuild moves the drawn frame, never draws it again)
  const worn = new Map();
  /** item in its rarity frame (.rf, shop/css.js), worn on the look the reveal would show, framed on the item. */
  function wornItem(item, slot, { w, hh, min, cls = '' } = {}) {
    const look = bustLook(S.info, item), key = `${slot}|${item.id}|${look ? look.parts.join('.') + look.gender : 'art'}`;
    let a = worn.get(key);
    if (!a) {
      const face = h('div', { class: 'face sky' });
      a = { el: h('div', { class: `rf${cls ? ' ' + cls : ''}`, data: { r: RCODE[item.rarity] || 'N', other: look && !look.own }, role: 'img',
        'aria-label': `${item.name}, ${RARITY[item.rarity]?.label || 'Common'}${look && !look.own ? `, shown on the ${look.gender} body` : ''}` }, face) };
      a.el.style.width = w + 'px'; a.el.style.height = hh + 'px';
      const art = () => { const d = h('div', {}); face.replaceChildren(d); a.r = renderItemArt(d, item, { body: look?.gender || 'male', size: Math.round(w * .7) }); };
      if (look) {
        const wu = h('div', {});
        face.append(wu);
        a.r = renderWaistUp(wu, look.parts, { gender: look.gender, world: look.world, focus: look.focus, ...(min && { min }) });
        a.r.ready.then(ok => { if (!ok && !S.dead) art(); });
      } else art();
      worn.set(key, a);
    }
    return a.el;
  }
  const ownBadge = i => i.owned ? h('span', { class: 'own', data: { k: 'owned' }, 'aria-hidden': 'true' }, i.copies > 0 ? '×' + (i.copies + 1) : '✓') : null;
  const only = i => (i.bodies || []).length === 1 ? h('span', { class: 'bx-only', 'aria-hidden': 'true' }, `${i.bodies[0] === 'female' ? 'Female' : 'Male'} only`) : null;
  // a tile: the item worn, its name; a click tries it on (and again takes it off)
  function tile(v, i) {
    const on = S.pv[v.id] === i.id;
    const f = wornItem(i, 'tile', { w: 92, hh: 116, min: 300 });
    f.querySelector(':scope > .own')?.remove(); f.querySelector(':scope > .bx-only')?.remove();
    const b = ownBadge(i), o = only(i);
    if (b) f.append(b);
    if (o) f.append(o);
    return h('button', { type: 'button', class: 'bx-tile', 'aria-pressed': String(on), data: { k: 'it-' + i.id },
      'aria-label': `${i.name}, ${RARITY[i.rarity]?.label}${i.owned ? ', owned' : ''}${on ? ', trying on' : ''}`,
      onclick: () => { S.pv[v.id] = on ? null : i.id; rerender(); } },
    f, h('span', { class: 'nm' }, i.name));
  }

  // ---------------------------------------------------------------- the side: the boxes, the wallet's one MP number
  function side(current) {
    const w = S.info?.wallet;
    return h('nav', { class: 'side', 'aria-label': 'Cosmetic boxes' },
      TABS.map((t, i) => {
        const b = S.info?.boxes?.find(x => x.id === t.id);
        return bt('list', 40, { style: at(24, 152 + i * 46), 'aria-selected': String(current === t.id), data: { k: 'box-' + t.id },
          onclick: () => onPage(t.id) }, h('span', {}, t.label), b ? h('span', { class: 'meta' }, `${short(b.price)} MP`) : null);
      }),
      h('div', { class: 'well', style: at(24, 300, 190, 80) }),
      h('div', { class: 'abs t sub', style: { ...at(36, 312), display: 'flex', alignItems: 'center', gap: '8px' } }, 'Your MP', w ? mpInfo(w, { align: 'left' }) : null),
      h('div', { class: 'abs t28', style: at(36, 336) }, w ? short(w.total) : '–'));
  }

  // ---------------------------------------------------------------- the home: a banner per box
  function home() {
    if (S.error && !S.info) return [h('div', { class: 'msg', style: at(0, 160, 766), role: 'alert' }, h('div', { class: 't18' }, "Couldn't open the boxes"),
      h('div', { class: 't sub wrap', style: { maxWidth: '480px' } }, S.error.message),
      bt('secondary', 40, { class: 'rel', onclick: () => { S.error = null; rerender(); load(true); } }, h('span', {}, 'Try again'))), 400];
    if (!S.info) return [TABS.map((t, i) => h('div', { class: 'skel', style: { ...at(0, i * 198, 766, 180), position: 'absolute', borderRadius: '4px' } })), 576];
    return [TABS.map((t, i) => boxBanner(boxView(S.info, t.id), i * 198)), 576];
  }
  function boxBanner(v, y) {
    if (!v.box) return null;
    const pick = stripItems(v.box).slice(0, 3);
    const next = (v.pity || []).find(m => m.next), dy = v.name.length > 15 ? 22 : 0;
    return h('div', { class: 'banner bxb', style: at(0, y, 766, 180), data: { box: v.id } },
      h('button', { type: 'button', class: 'hit', 'aria-label': `${v.name}: open the box's page`, onclick: () => onPage(v.id) }),
      h('div', { class: 'shine' }),
      h('div', { class: 'tag cy', style: at(0, 10) }, 'Cosmetic Box'),
      next ? h('div', { class: 'tag', data: { k: 'update' }, style: at(110, 10) }, `${next.label} guaranteed next`) : null,
      h('div', { class: 'art', style: { backgroundImage: banner(v.id) } }),
      // a long name takes two lines; what follows moves down
      h('div', { class: 'abs t23 wrap', style: { ...at(280, 28, 180), color: '#0c2a38' } }, v.name),
      h('div', { class: 'abs t sub', style: at(282, 60 + dy) }, `${v.count} ${v.unit}`),
      h('div', { class: 'abs t sub', style: at(282, 84 + dy) }, 'Collected'),
      h('div', { class: 'abs t', style: { ...at(352, 84 + dy, 100), textAlign: 'right' } }, `${v.owned} / ${v.count}`),
      bar(282, 104 + dy, 170, v.owned, v.count),
      h('div', { class: 'abs t12 sub', style: at(282, 124 + dy) }, (v.pity || []).map(m => `${m.label} ${m.count}`).join(' · ')),
      pick.map((it, k) => { const f = wornItem(it, 'feat', { w: 88, hh: 118, min: 320 }); Object.assign(f.style, at(472 + k * 96, 16)); return f; }),
      bt('primary', 32, { style: { left: '20px', bottom: '14px' }, disabled: !v.affordable || S.busy, title: v.disabled || null,
        'aria-label': `Open the ${v.name} for ${v.price} MP`, data: { k: 'open-' + v.id }, onclick: e => { e.stopPropagation(); open(v.id); } },
      h('span', {}, 'Open'), mp(v.price)),
      !v.affordable && v.disabled ? h('div', { class: 'abs t12', style: { left: '156px', bottom: '22px', color: '#a82313' } }, v.disabled) : null);
  }

  // ---------------------------------------------------------------- the band over a box's page
  function band(id) {
    const v = boxView(S.info, id);
    // the tab's short name on the plate (the server's full name is on the page's banner)
    return { title: `${BOX_NAME[id] || 'Cosmetic'} Box`, lines: v.box ? [`${v.name} · ${v.count} ${v.unit}`, `${v.owned} / ${v.count} collected`] : [''] };
  }

  // ---------------------------------------------------------------- a box's page
  let tryKey = '', tryEl = null, tryR = null;
  function tryOn(v) {
    const it = (v.items || []).find(i => i.id === S.pv[v.id]) || null;
    const look = it ? bustLook(S.info, it) : ownLook(S.info);
    const key = JSON.stringify([look?.parts, look?.gender]);
    if (!tryEl) tryEl = h('div', { role: 'img' });
    if (key !== tryKey && look) { tryKey = key; tryR?.destroy(); tryR = renderWaistUp(tryEl, look.parts, { gender: look.gender, world: look.world, crop: BUST }); }
    tryEl.setAttribute('aria-label', it ? `Your look wearing ${it.name}` : 'Your look');
    const other = it && look && !look.own;
    return [h('div', { class: 'bx-try sky' }, tryEl,
      h('div', { class: 'bx-chip', data: { on: !!it } }, it ? (other ? `Shown on the ${look.gender} body` : 'Trying on') : 'Your look'),
      it ? h('div', { class: 'who' }, h('div', { class: 't18 ell' }, it.name),
        h('div', { class: 't12 sub', style: { marginTop: '4px' } }, `${RARITY[it.rarity]?.label} ${(it.kind === 'dueldisk' ? 'duel disk' : it.kind || '').toLowerCase()}`
          + (it.owned ? ` · owned${it.copies ? ' ×' + (it.copies + 1) : ''}` : ''))) : null),
    h('div', { class: 'abs t12 wrap', style: { ...at(24, 560, 300), lineHeight: '15px', textAlign: 'center', color: other ? '#7a3a00' : 'var(--sub)' } },
      it ? (other ? wipNotice(it) || "Your body can't wear it yet" : 'A preview only: nothing changes until you equip it.') : 'Click an item to try it on.'),
    bt('secondary', 48, { style: at(24, 630, 300), disabled: !it, data: { k: 'reset' }, onclick: () => { S.pv[v.id] = null; rerender(); } }, h('span', {}, 'Reset look'))];
  }
  function page(id) {
    const v = boxView(S.info, id);
    if (!S.info) return h('div', { class: 'page', role: 'main' }, S.error ? h('div', { class: 'msg', style: at(24, 300, 976), role: 'alert' },
      h('div', { class: 't' }, S.error.message), bt('secondary', 32, { class: 'rel', onclick: () => load(true) }, h('span', {}, 'Try again')))
      : [h('div', { class: 'skel', style: { ...at(24, 94, 300, 456), position: 'absolute' } }), h('div', { class: 'skel', style: { ...at(340, 94, 412, 634), position: 'absolute' } })]);
    if (!v.box) return h('div', { class: 'page', role: 'main' }, h('div', { class: 'empty t' }, "This box isn't on sale."));
    const out = [...tryOn(v)];
    // the items, rarest first, by rarity
    const list = h('div', { class: 'well bx-items scroll', role: 'group', 'aria-label': `${v.name}: items`, tabindex: '-1' });
    const inner = h('div', { class: 'in' });
    for (const g of contents(v.box)) {
      inner.append(h('div', { class: 'ghd' }, h('span', { class: 'dia', data: { r: RCODE[g.rarity] }, 'aria-hidden': 'true' }),
        h('span', { class: 't' }, g.label), h('span', { class: 't12 sub', style: { marginLeft: 'auto' } }, `${g.owned} / ${g.items.length} · ${pct(g.odds)}`)));
      for (const i of g.items) inner.append(tile(v, i));
    }
    list.append(inner);
    out.push(list);
    // the price column
    const X = 768, W = 232;
    out.push(h('div', { class: 'well', style: at(X, 94, W, 96) }),
      h('div', { class: 'abs t sub', style: at(X + 14, 114) }, 'Price'),
      h('div', { class: 'abs', style: { right: '38px', top: '112px' } }, mp(v.price)),
      h('div', { class: 'abs t sub', style: { ...at(X + 14, 152), display: 'flex', alignItems: 'center', gap: '8px' } }, 'Your MP', mpInfo(v.wallet)),
      h('div', { class: 'abs', style: { right: '38px', top: '152px' } }, mp(v.wallet.total)));
    const ms = pityMeters(v.box);
    out.push(h('div', { class: 'well', style: at(X, 202, W, 140) }),
      h('div', { class: 'abs t', style: at(X + 14, 214) }, 'Guarantees'),
      h('div', { class: 'bx-pity', style: { ...at(X + 14, 242, W - 28), rowGap: '6px' }, role: 'group', 'aria-label': 'Guarantees' }, ms.map(m => [
        h('span', { class: 't12', data: { next: m.next } }, m.next ? `${m.label} on the next open` : `${m.label} in ${m.left} opens at most`),
        h('span', { class: 't12 sub' }, m.count),
        h('div', { class: 'bar', style: { '--c': RARITY[m.key].color }, role: 'meter', 'aria-label': `${m.label} ${m.count}`, 'aria-valuemin': '0',
          'aria-valuemax': String(m.at), 'aria-valuenow': String(m.misses), data: { key: m.key } },
        h('i', { style: { width: (100 * m.misses / m.at).toFixed(1) + '%' } }))])),
      h('div', { class: 'abs t12 sub wrap', style: { ...at(X + 14, 318, W - 28), lineHeight: '14px' } }, ms.length ? 'Opens in a row without one.' : ''));
    const odds = v.odds || [];
    out.push(h('div', { class: 'well', style: at(X, 354, W, 166) }),
      h('div', { class: 'abs t', style: at(X + 14, 366) }, v.pityOn ? 'Odds of the next open' : 'Odds per open'),
      h('div', { class: 'rar', style: { ...at(X + 14, 398, W - 28), rowGap: '14px' } }, odds.map(o => [
        h('span', { class: 'dia', data: { r: RCODE[o.rarity] }, 'aria-hidden': 'true' }), h('span', { class: 't12' }, o.label),
        h('span', { class: 't12' }, pct(v.pityOn ? o.next : o.base))])),
      bt('list', 40, { style: at(X, 574, W), data: { k: 'contents' }, 'aria-haspopup': 'dialog', onclick: () => sheet(id) },
        h('span', {}, 'Contents & odds'), h('span', { class: 'chev', 'aria-hidden': 'true' })),
      bt('primary', 48, { style: at(X, 630, W), disabled: !v.affordable || S.busy, data: { k: 'open' }, 'aria-describedby': 'bx-note',
        onclick: () => open(id) }, h('span', {}, S.busy ? 'Opening…' : 'Open Box ·'), S.busy ? null : mp(v.price)),
      h('div', { class: 'note t12 wrap', id: 'bx-note', style: at(X, 688, W), data: { bad: !v.affordable } },
        v.disabled || `Opens with ${short(v.price)} MP.`));
    return h('div', { class: 'page', role: 'main', 'aria-label': v.name }, out);
  }

  // ---------------------------------------------------------------- Contents & odds (the card pack Details sheet's look)
  function sheet(id) {
    const v = boxView(S.info, id);
    if (!v.box) return;
    const back = doc.activeElement;
    const sh = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'bx-sheet-title', tabindex: '-1' });
    const close = () => { removeEventListener('keydown', keys, true); sh.remove(); try { back?.focus?.({ preventScroll: true }); } catch {} };
    const keys = e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') {
        const all = [...sh.querySelectorAll('button:not(:disabled), .grid[tabindex]')], i = all.indexOf(doc.activeElement);
        if (all.length && (e.shiftKey ? i <= 0 : i === all.length - 1 || i < 0)) { e.preventDefault(); all[e.shiftKey ? all.length - 1 : 0].focus({ preventScroll: true }); }
      }
    };
    addEventListener('keydown', keys, true);
    const dim = h('div', { class: 'dim' });
    dim.addEventListener('pointerdown', e => { e.preventDefault(); close(); });
    const groups = contents(v.box), next = v.box.nextOdds || {};
    const grid = h('div', { class: 'well grid scroll', style: at(370, 132, 558, 526), tabindex: '0', 'aria-label': 'Every item' },
      h('div', { class: 'in' }, groups.map(g => [
        h('div', { class: 'ghd' }, h('span', { class: 'dia', data: { r: RCODE[g.rarity] }, 'aria-hidden': 'true' }), h('span', { class: 't' }, g.label),
          h('span', { class: 't12' }, `${g.owned} / ${g.items.length} owned`)),
        g.items.map(i => {
          const f = wornItem(i, 'sheet', { w: 62, hh: 84, min: 300 });
          f.classList.add('rel'); f.style.margin = '0 3px';
          f.querySelector(':scope > .own')?.remove(); f.querySelector(':scope > .bx-only')?.remove();
          const b = ownBadge(i), o = only(i); if (b) f.append(b); if (o) f.append(o);
          return h('div', { class: 'gc', role: 'group', 'aria-label': `${i.name}, ${g.label}, ${pct(i.chance)}${i.owned ? ', owned' : ''}` }, f,
            h('span', { class: 'nm' }, i.name), h('span', { class: 'nm sub', style: { marginTop: '2px' } }, pct(i.chance)));
        })])));
    const rows = [...groups].map(g => h('tr', {}, h('td', {}, h('span', { class: 'dia', data: { r: RCODE[g.rarity] } }), g.label),
      h('td', {}, pct(g.odds)), v.pityOn ? h('td', {}, pct(next[g.rarity] ?? g.odds)) : null, h('td', {}, `${g.owned} / ${g.items.length}`)));
    const ms = pityMeters(v.box);
    sh.append(dim, h('div', { class: 'box' },
      h('div', { class: 'sa-glass' }), h('div', { class: 'sa-band' }),
      h('div', { class: 'sa-title', style: at(14, 15, 290), 'aria-hidden': 'true' }, 'Contents'),
      h('div', { class: 'abs t w', style: at(320, 26, 400) }, h('span', { class: 'ell', id: 'bx-sheet-title', style: { display: 'block' } },
        `${v.name} · ${v.count} ${v.unit}`)),
      bt('nav', 48, { style: at(740, 9), 'aria-label': 'Close', title: 'Close (Esc)', data: { k: 'x' }, onclick: close }, h('span', {}, 'Close')),
      h('div', { class: 'well', style: at(22, 82, 330, 576) }),
      h('div', { class: 'abs t18', style: at(36, 94) }, 'Odds per open'),
      h('div', { class: 'abs t12 sub wrap', style: { ...at(36, 120, 300), lineHeight: '15px' } }, 'Each open gives one item. Within a rarity every item is as likely.'),
      h('table', { class: 'odds', style: { ...at(36, 158), width: '302px' } },
        h('tr', {}, h('th', {}, 'Rarity'), h('th', {}, 'Chance'), v.pityOn ? h('th', {}, 'Next') : null, h('th', {}, 'Owned')), rows),
      h('div', { class: 'abs t18', style: at(36, 330) }, 'Guarantees'),
      h('div', { class: 'bx-pity', style: at(36, 360, 300) }, ms.map(m => [
        h('span', { class: 't12', data: { next: m.next } }, `${m.label}: by the ${m.at}th open`),
        h('span', { class: 't12 sub' }, m.count),
        h('div', { class: 'bar', style: { '--c': RARITY[m.key].color } }, h('i', { style: { width: (100 * m.misses / m.at).toFixed(1) + '%' } }))])),
      h('div', { class: 'abs t12 sub wrap', style: { ...at(36, 470, 300), lineHeight: '15px' } },
        'A duplicate is kept as a spare: trade it in Card Swap.', h('br'), 'Items marked with a body are made for that body so far.'),
      h('div', { class: 'abs t', style: at(370, 100) }, 'Every item'),
      h('div', { class: 'abs t12 sub', style: { right: '24px', top: '102px' } }, `${v.owned} of ${v.count} owned`),
      grid));
    el.append(sh);
    sh.querySelector('[data-k=x]')?.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- opening a box
  async function open(id) {
    const v = boxView(S.info, id);
    if (S.busy || !v.box) return;
    if (!v.affordable) { say(v.disabled); return; }
    S.busy = true; rerender();
    const rv = reveal(v);
    try {
      const out = await api.openBox(id);
      if (S.dead) return;
      S.info = out.info; onWallet?.(out.info.wallet);
      rv.result(out.reward);
    } catch (e) {
      if (S.dead) return;
      rv.close();
      say(e.message || 'The box could not be opened.');
      if (e.error === 'stale-request' || e.error === 'insufficient-earned-mp') S.info = api.peekInfo() || S.info;
    } finally {
      S.busy = false;
      if (!S.dead) rerender();
    }
  }
  // the shop's reveal (shop/reveal.js): the dim, the head, the one item turning over, the foot's pills
  function reveal(v) {
    const ov = h('div', { class: 'rv', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Opening the ${v.name}`, tabindex: '-1', data: { phase: 'wait' } });
    const sub = h('div', { class: 't w', style: { marginTop: '8px', opacity: .9 } }, 'Opening…');
    const slot = h('div', { class: 'bxr', data: { r: 'N' } }, h('div', { class: 'glow' }),
      h('div', { class: 'flip' }, h('div', { class: 'bk', 'aria-hidden': 'true' }, h('div', { class: 'art', style: { backgroundImage: banner(v.id) } }))));
    const info = h('div', { class: 'bxinfo' });
    const status = h('div', { class: 'head t w', role: 'status', 'aria-live': 'polite', style: at(null, 690) });
    const foot = h('div', { class: 'foot', style: at(null, 630) });
    ov.append(h('div', { class: 'dim' }), h('div', { class: 'head', style: at(null, 40) }, h('div', { class: 't23 w' }, v.name), sub), slot, info, foot, status);
    el.append(ov);
    ov.focus({ preventScroll: true });
    let phase = 'wait', timers = [], closed = false, r = null;
    const t0 = performance.now();
    const set = p => { phase = p; ov.dataset.phase = p; };
    const close = () => { if (closed) return; closed = true; timers.forEach(clearTimeout); ov.remove(); el.querySelector('[data-k=open], [data-k^=open-]')?.focus({ preventScroll: true }); };
    function finish() {
      timers.forEach(clearTimeout); timers = [];
      slot.dataset.open = '';
      set('done');
      foot.querySelector('[data-k=equip]:not(:disabled), [data-k=again]:not(:disabled), [data-k=done]')?.focus({ preventScroll: true });
    }
    ov.addEventListener('click', e => { if (r && phase !== 'done' && !e.target.closest('button')) finish(); });
    ov.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); if (phase === 'done') close(); else if (r) finish(); }
      else if ((e.key === ' ' || e.key === 'Enter') && phase !== 'done' && r && !e.target.closest('button')) { e.preventDefault(); finish(); }
      else if (e.key === 'Tab') {
        const all = [...ov.querySelectorAll('button:not(:disabled)')], i = all.indexOf(doc.activeElement);
        if (!all.length) { e.preventDefault(); return; }
        if (e.shiftKey ? i <= 0 : i === all.length - 1 || i < 0) { e.preventDefault(); all[e.shiftKey ? all.length - 1 : 0].focus({ preventScroll: true }); }
      }
    });
    function result(reward) {
      if (closed) return;
      const body = S.info?.appearance?.gender || 'male';
      r = revealView(reward, body);
      const code = RCODE[r.rarity];
      slot.dataset.r = code;
      ov.setAttribute('aria-label', `${r.label}: ${r.name}`);
      sub.textContent = r.duplicate ? 'You got a duplicate' : 'You got a new item';
      const f = wornItem(r.item, 'reveal', { w: 240, hh: 320, min: 432 });
      slot.querySelector('.flip').append(f, r.rarity === 'ultra' ? h('div', { class: 'sheen' }) : null);
      const look = bustLook(S.info, r.item);
      info.replaceChildren(
        h('div', { class: 't23 w' }, r.name),
        h('div', { class: 't rl', data: { r: code } }, `${r.label} ${(r.kind || '').toLowerCase()}`.trim()),
        h('div', { class: 'badges' }, r.duplicate ? h('span', { class: 'own' }, r.dupText) : h('span', { class: 'own', data: { new: true } }, 'New')),
        ...(r.notice || (look && !look.own) ? [h('div', { class: 't w' }, r.notice || wipNotice(r.item))] : []));
      const v2 = () => boxView(S.info, v.id);
      const equipBtn = bt('secondary', 48, { class: 'rel', disabled: !r.compatible, data: { k: 'equip' }, style: { width: '200px' }, onclick: async () => {
        equipBtn.disabled = true; equipBtn.firstChild.textContent = 'Equipping…'; status.textContent = '';
        try {
          const w = wearWorld(r.item, body, S.info?.appearance?.world);
          await api.equip(r.id, w?.world);
          equipBtn.firstChild.textContent = '✓ Equipped';
        } catch (e) { equipBtn.disabled = false; equipBtn.firstChild.textContent = 'Equip'; status.textContent = e.message; }
      } }, h('span', {}, r.compatible ? 'Equip' : "Can't wear yet"));
      const nv = v2();
      foot.replaceChildren(equipBtn,
        bt('primary', 48, { class: 'rel', disabled: !nv.affordable, title: nv.disabled || null, data: { k: 'again' }, onclick: () => { close(); open(v.id); } },
          h('span', {}, 'Open another ·'), mp(nv.price)),
        bt('nav', 48, { class: 'rel', data: { k: 'done' }, onclick: close }, h('span', {}, 'Done')));
      status.textContent = nv.affordable ? '' : nv.disabled;
      set('flip');
      if (reduced()) return finish();
      const left = Math.max(0, r.anticipation - (performance.now() - t0));
      timers.push(setTimeout(() => { slot.dataset.open = ''; timers.push(setTimeout(finish, r.tempo === 'special' ? 1300 : 700)); }, left));
    }
    return { result, close };
  }

  return {
    side, home, page, band, load, open,
    get info() { return S.info; },
    destroy() { S.dead = true; off(); tryR?.destroy(); for (const a of worn.values()) a.r?.destroy?.(); worn.clear(); },
  };
}
