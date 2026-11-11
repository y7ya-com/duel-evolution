// What a purchase gave, over the shop. The native pack opening (the pack scenes 0x19 / 0x17 / 0x18) plays only on the
// game connection's own 0x5212 answer inside the native confirm flow; a purchase through POST /api/de/shop/buy has no
// such flow to answer, so the HTML shows it: the cards face down at once (the request is in flight), turned over one by
// one when the server answers, then their rarity badges and a "New" on each card the player didn't own.
//   1 pack: five big cards in a row, names under them; 10 packs: fifty in ten columns (a pack a half row).
// A click or Space skips to the end; Esc or Done closes; "Buy again" buys the same again (when affordable).
import { h, at, card, bt, mp } from './dom.js';

const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
/** The layout for n cards: { w (card width), cols, gap, rowGap, top, names } */
export function layout(n) {
  if (n <= 5) return { w: 120, cols: 5, gap: 24, rowGap: 0, top: 232, names: true };
  return { w: 56, cols: 10, gap: 12, rowGap: 20, top: 112, names: false };
}

/**
 * Open over `root`. opts: { title, count, again() -> { label, price } | null, onAgain(), onDone() }
 * -> { el, result(summary) (shop/model.js revealSummary), close() }
 */
export function openReveal(root, { title = '', count = 1, again, onAgain, onDone } = {}) {
  const n = count * 5, L = layout(n), hh = Math.round(L.w * 1.45);
  const width = L.cols * L.w + (L.cols - 1) * L.gap;
  const rows = Math.ceil(n / L.cols), height = rows * (hh + (L.names ? 24 : 0)) + (rows - 1) * L.rowGap;
  const el = h('div', { class: 'rv', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Opening ${title}`, tabindex: '-1', data: { phase: 'wait' } });
  const head = h('div', { class: 'head', style: at(null, L.top - (n > 5 ? 72 : 96)) },
    h('div', { class: 't23 w' }, title),
    h('div', { class: 't w', style: { marginTop: '8px', opacity: .9 } }, `${count} ${count === 1 ? 'pack' : 'packs'} · ${n} cards`));
  const grid = h('div', { class: 'cards', style: { top: L.top + 'px', gridTemplateColumns: `repeat(${L.cols}, ${L.w}px)`, columnGap: L.gap + 'px', rowGap: L.rowGap + 'px' } });
  const slots = Array.from({ length: n }, () => {
    const s = h('div', { class: 'slot', style: { width: L.w + 'px', height: hh + (L.names ? 24 : 0) + 'px' } },
      h('div', { class: 'flip', style: { height: hh + 'px' } }, h('div', { class: 'back', 'aria-hidden': 'true' })));
    grid.append(s);
    return s;
  });
  const status = h('div', { class: 'head t w', role: 'status', 'aria-live': 'polite', style: at(null, L.top + height + 24) }, 'Opening…');
  const foot = h('div', { class: 'foot', style: at(null, L.top + height + 56) });
  el.append(h('div', { class: 'dim' }), head, grid, status, foot);
  root.append(el);
  el.focus({ preventScroll: true });
  void width;

  let phase = 'wait', timers = [], closed = false, cards = null, summary = '';
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const set = p => { phase = p; el.dataset.phase = p; };
  function close() {
    if (closed) return;
    closed = true; timers.forEach(clearTimeout); el.remove(); onDone?.();
  }
  function finish() {
    timers.forEach(clearTimeout); timers = [];
    slots.forEach(s => { if (s.firstChild.childElementCount > 1) { s.dataset.open = ''; s.dataset.badges = ''; } });
    set('done');
    status.textContent = summary;
    const a = again?.();
    foot.replaceChildren(
      a ? bt('primary', 48, { class: 'rel', data: { k: 'again' }, onclick: () => { close(); onAgain?.(); } }, h('span', {}, a.label + ' ·'), mp(a.price)) : null,
      bt('nav', 48, { class: 'rel', data: { k: 'done' }, onclick: close }, h('span', {}, 'Done')));
    foot.querySelector('[data-k=done]')?.focus({ preventScroll: true });
  }
  el.addEventListener('click', e => { if (phase === 'flip' && !e.target.closest('button')) finish(); });
  el.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); if (phase === 'done') close(); else if (phase === 'flip') finish(); }
    else if ((e.key === ' ' || e.key === 'Enter') && phase === 'flip') { e.preventDefault(); finish(); }
    else if (e.key === 'Tab') {   // stay inside
      const all = [...el.querySelectorAll('button:not(:disabled)')];
      if (!all.length) { e.preventDefault(); return; }
      const i = all.indexOf(document.activeElement);
      if (e.shiftKey ? i <= 0 : i === all.length - 1 || i < 0) { e.preventDefault(); all[e.shiftKey ? all.length - 1 : 0].focus({ preventScroll: true }); }
    }
  });

  function result(sum) {
    if (closed) return;
    cards = sum.cards;
    cards.forEach((c, i) => {
      const s = slots[i];
      if (!s) return;
      s.dataset.r = c.rarity;
      s.firstChild.append(card(c, { rel: false, x: 0, y: 0, w: L.w, own: c.isNew ? 0 : undefined, label: `${c.name || 'Card'}, ${c.rarity}${c.isNew ? ', new' : ''}` }));
      if (L.names) s.append(h('div', { class: 'nm t12', style: at(null, hh + 8) }, c.name));
    });
    for (let i = cards.length; i < slots.length; i++) slots[i].remove();
    const bits = [['UR', sum.UR], ['SR', sum.SR], ['R', sum.R]].filter(([, k]) => k).map(([r, k]) => `${r} ${k}`);
    summary = [sum.fresh ? `${sum.fresh} new` : 'Nothing new', ...bits].join(' · ');
    status.textContent = '';
    set('flip');
    if (reduced()) return finish();
    const step = n > 5 ? 45 : 260;
    cards.forEach((c, i) => later(() => { slots[i].dataset.open = ''; }, 120 + i * step));
    later(() => slots.forEach(s => { s.dataset.badges = ''; }), 120 + cards.length * step + 300);
    later(finish, 120 + cards.length * step + 700);
  }
  return { el, result, close };
}
