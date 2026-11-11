// The card shop's DOM pieces: h(), the card face in its rarity frame, the pack picture, the buttons (mockup A's
// .bt system, shop/css.js), the wallet readout, the progress bar. Every piece is placed in game px.
import { digits } from '../cosmetics/shopart.js';
import { mpDigits } from '../cosmetics/theme.js';
import { cardImg, packImg } from './art.js';
import { LABEL } from './model.js';
import { mpInfo } from './mpinfo.js';

export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'data') for (const [dk, dv] of Object.entries(v)) { if (dv != null && dv !== false) e.dataset[dk] = dv === true ? '' : dv; }
    else if (k === 'style') { for (const [n, x] of Object.entries(v)) if (x != null) { if (n.startsWith('--')) e.style.setProperty(n, x); else e.style[n] = x; } }
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
/** left / top / width / height in px */
export const at = (x, y, w, hh) => ({ left: x == null ? null : x + 'px', top: y == null ? null : y + 'px', width: w == null ? null : w + 'px', height: hh == null ? null : hh + 'px' });
export const mp = n => digits(mpDigits(n));

/** A card face in its rarity frame. o: { x, y, w (height 1.45 w), rot, badge (corner rarity; default true but N), own
 *  (copies: 0 says New, undefined shows nothing), miss (greyed), rel (in flow), cls, label } */
export function card(c, o = {}) {
  const w = o.w ?? 62, hh = Math.round(w * 1.45);
  const img = h('img', { alt: '', draggable: 'false' });
  if (c.internalId != null) cardImg(img, c.internalId);
  const style = o.rel ? { width: w + 'px', height: hh + 'px' } : { ...at(o.x, o.y, w, hh) };
  if (o.rot) style.transform = `rotate(${o.rot}deg)`;
  return h('div', { class: `rf${o.rel ? ' rel' : ''}${o.cls ? ' ' + o.cls : ''}`, data: { r: c.rarity, miss: !!o.miss }, style,
    role: o.label === false ? null : 'img', 'aria-label': o.label === false ? null : o.label || `${c.name}, ${LABEL[c.rarity] || 'Normal'}` },
  h('div', { class: 'face' }, c.internalId == null ? h('span', { class: 'ph' }, c.name) : null, img),
  o.badge === false || c.rarity === 'N' ? null : h('span', { class: 'rb', data: { r: c.rarity }, 'aria-hidden': 'true' }, c.rarity),
  o.own === undefined ? null : h('span', { class: 'own', data: { z: !o.own }, 'aria-hidden': 'true' }, o.own ? (typeof o.own === 'string' ? o.own : '×' + o.own) : 'New'));
}
/** A pack's picture (w x 2w), rotated. */
export function pack(p, x, y, w, rot = 0, extra = {}) {
  const img = h('img', { class: 'pack', alt: '', draggable: 'false', style: { ...at(x, y, w, w * 2), transform: rot ? `rotate(${rot}deg)` : null, ...extra } });
  packImg(img, p.art);
  return img;
}
/** A progress bar (owned / total), the pity bar's recess filled cyan (gold when full). */
export const bar = (x, y, w, owned, total, label = 'Collected') => h('div', { class: 'bar', style: at(x, y, w), role: 'progressbar', 'aria-label': label,
  'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(owned), data: { full: total > 0 && owned >= total } },
h('i', { style: { width: (total ? (100 * owned / total).toFixed(2) : 0) + '%' } }));
/** A button of the .bt system: kind 'primary' | 'secondary' | 'nav' | 'seg' | 'list'; size 32 | 40 | 48. */
export const bt = (kind, size, attrs, ...kids) => h('button', { type: 'button', ...attrs, class: `bt ${kind} h${size}${attrs?.class ? ' ' + attrs.class : ''}` }, ...kids);
/** The wallet readout in the band: one MP total in the shop's digits, its (i) saying how much is starter MP (./mpinfo.js). */
export const wallet = w => h('div', { class: 'readout wallet', role: 'group', 'aria-label': 'Wallet' },
  h('span', { class: 't12 k' }, 'MP'), h('span', { class: 'v' }, mp(w?.total ?? 0)), mpInfo(w));
