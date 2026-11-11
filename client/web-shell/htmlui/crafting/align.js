// Crafting's alignment, measured in the running page (the owner: "use better centering"), as cosmetics/align.js does
// for the Wardrobe. checkAlign() measures whatever crafting shows now, in game px (the canvas is 1024 game px wide):
//   - every label, chip, button and number box: its text centred in its box (the glyphs' ink-free line box, a Range),
//     both ways; an icon + label group centred as one
//   - the rows (the detail bar, the header bar, the trunk's chip rows): their items on one centre line, equal gaps
//   - the popups: the title centred on its header bar, the stepper and Owned groups centred in their columns, the art
//     centred against its text block, the footer buttons equal and centred on the window's axis
//   - nothing clipped (a chip's or field's text wider than its box)
// within TOL (1 game px).   checkAlign() -> { ok, checks: [{ name, ok, got, want }] }
export const TOL = 1;

function stage() {
  const c = document.getElementById('canvas')?.getBoundingClientRect();
  const s = c?.width ? c.width / 1024 : 1;
  return { s, x: c?.width ? c.left : 0, y: c?.width ? c.top : 0 };
}
const shown = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
const B = (r, S) => ({ l: (r.left - S.x) / S.s, r: (r.right - S.x) / S.s, t: (r.top - S.y) / S.s, b: (r.bottom - S.y) / S.s,
  get cx() { return (this.l + this.r) / 2; }, get cy() { return (this.t + this.b) / 2; }, get w() { return this.r - this.l; }, get h() { return this.b - this.t; } });
const union = bs => ({ left: Math.min(...bs.map(b => b.left)), right: Math.max(...bs.map(b => b.right)),
  top: Math.min(...bs.map(b => b.top)), bottom: Math.max(...bs.map(b => b.bottom)) });
// the box of an element's content (its text and its replaced / icon children), not its padding: what the eye centres.
// Text: the glyph boxes (a Range); an svg / shard: its own box. Text lines are the font's line box: Arial's ascent and
// descent are near-symmetric about the x-height's middle at these sizes, so a centred line box reads centred.
function contentBox(e, S) {
  const rs = [];
  const walk = n => {
    for (const k of n.childNodes) {
      if (k.nodeType === 3 && k.textContent.trim()) {
        const rg = document.createRange();
        rg.selectNodeContents(k);
        rs.push(...[...rg.getClientRects()].filter(r => r.width > 0));
      } else if (k.nodeType === 1 && shown(k)) {
        if (k.matches('svg, .shard, img')) rs.push(k.getBoundingClientRect());
        else walk(k);
      }
    }
  };
  if (e.matches('input')) return null;
  walk(e);
  return rs.length ? B(union(rs), S) : null;
}
const r1 = n => Math.round(n * 10) / 10;

export function checkAlign(root = document) {
  const S = stage(), checks = [];
  const box = e => B(e.getBoundingClientRect(), S);
  const add = (name, got, want = 0, tol = TOL) => checks.push({ name, ok: Math.abs(got - want) <= tol, got: r1(got), want });
  const yes = (name, ok, got = '') => checks.push({ name, ok: !!ok, got });
  // text centred in its box (both axes, or only one)
  // a rarity chip's face is right of its 4 px colour stripe (deck.js .dk-rar, as the type chips): its text centres on it
  const face = e => { const b = box(e); return e.matches?.('.dk-rar[data-r]') ? B({ left: (b.l + 4) * S.s + S.x, right: b.r * S.s + S.x, top: b.t * S.s + S.y, bottom: b.b * S.s + S.y }, S) : b; };
  const centred = (name, e, { x = true, y = true } = {}) => {
    if (!shown(e)) return;
    const b = face(e), c = contentBox(e, S);
    if (!c) return;
    if (x) add(`${name}: centred across`, c.cx - b.cx);
    if (y) add(`${name}: centred down`, c.cy - b.cy);
  };
  // a row: items on the row's centre line, equal gaps
  const row = (name, items, { gaps = true } = {}) => {
    items = items.filter(shown);
    if (items.length < 2) return;
    const bs = items.map(box), mid = bs[0].cy;
    bs.forEach((b, i) => add(`${name}: item ${i + 1} on the centre line`, b.cy - mid));
    if (!gaps) return;
    const g = bs.slice(1).map((b, i) => b.l - bs[i].r);
    g.forEach((v, i) => add(`${name}: gap ${i + 1} equals gap 1`, v - g[0]));
  };
  const unclipped = (name, e) => { if (shown(e)) yes(`${name}: not clipped`, e.scrollWidth <= e.clientWidth + 1, `${e.scrollWidth}/${e.clientWidth}`); };
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];

  // ---- the detail panel's bar row
  const bar = $('.cr-cardbar');
  if (shown(bar)) {
    row('detail bar', [...bar.children]);
    centred('detail bar rarity', bar.querySelector('.rb'));
    centred('detail bar owned', bar.querySelector('.own'), { x: false });
    bar.querySelectorAll('.dk-btn').forEach((b, i) => centred(`detail bar button ${i + 1}`, b));
    add('detail bar: its height', box(bar).h, 24);
  }
  // ---- the Deck header: the wallet and Dismantle Extras
  const hb = $('.cr-bar');
  if (shown(hb)) {
    row('header bar', [hb.querySelector('.shard'), hb.querySelector('.nb'), hb.querySelector('.dk-btn')], { gaps: false });
    centred('header Shards box', hb.querySelector('.nb'));
    centred('header Dismantle Extras', hb.querySelector('.dk-btn'));
  }
  // ---- the trunk header (the editor's own layout: the search box and Filters on one line, nothing of crafting's in it)
  const search = $('.dk-search');
  if (shown(search)) {
    const input = search.querySelector(':scope > .dk-field'), filters = search.querySelector(':scope > .dk-btn');
    yes('trunk header: no crafting controls in it', !search.querySelector(':scope > .dk-pool, :scope > .dk-rar'));
    add('trunk header: search box and Filters on one line', box(input).cy - box(filters).cy);
    // the word centred on the button (the badge is on its corner, outside the count)
    const word = (() => { const rg = document.createRange(); rg.selectNodeContents(filters.firstChild); return B(rg.getBoundingClientRect(), S); })();
    add('Filters word: centred across', word.cx - box(filters).cx);
    add('Filters word: centred down', word.cy - box(filters).cy);
    const badge = filters.querySelector('.dk-badge');
    if (shown(badge)) {
      centred('Filters badge', badge);
      yes('Filters badge: clear of the word', box(badge).l >= word.r + 2, r1(box(badge).l - word.r));
    }
  }
  // ---- the Filters popup's Show and Rarity rows
  const pop = $('.dk-search .dk-pop');
  if (shown(pop)) {
    // the popup is on top: nothing of crafting's (the trunk rows' rarity marks) drawn over it
    const pb = pop.getBoundingClientRect();
    const over = $$('.cr-mark').filter(m => { const r = m.getBoundingClientRect(), x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
      return x > pb.left && x < pb.right && y > pb.top && y < pb.bottom && !pop.contains(document.elementFromPoint(x, y)); });
    yes('popup: no rarity mark drawn over it', !over.length, over.length);
    const show = pop.querySelector('select[aria-label=Show]'), rr = pop.querySelector('[role=group][aria-label=Rarity]');
    const lbl = t => [...pop.querySelectorAll('.dk-lbl')].find(l => l.textContent === t);
    if (show && rr) {
      const attr = pop.querySelector('select[aria-label=Attribute]');
      add('popup: Rarity chips start at the selects\' left edge', box(rr).l - box(show).l);
      add('popup: Rarity chips end at the selects\' right edge', box(rr).r - box(show).r);
      add('popup: Show as tall as the other selects', box(show).h - box(attr).h);
      add('popup: Rarity row on its label\'s line', box(rr).cy - contentBox(lbl('Rarity'), S).cy);
      add('popup: Show on its label\'s line', box(show).cy - contentBox(lbl('Show'), S).cy);
      add('popup: Attribute on its label\'s line (unchanged)', box(attr).cy - contentBox(lbl('Attribute'), S).cy);
      row('popup Rarity chips', [...rr.children]);
      const ws = [...rr.children].map(c => box(c).w);
      ws.forEach((w, i) => add(`popup Rarity chip ${i + 1}: equal width`, w - ws[0]));
      [...rr.children].forEach(c => centred(`popup ${c.textContent} chip`, c));
    }
  }
  // ---- the popups
  for (const m of $$('.cr-modal')) {
    const win = m.querySelector('.dk-pop'), wb = box(win), head = m.querySelector('.dk-head'), title = m.querySelector('.dk-pop > svg text');
    const kind = m.classList.contains('card') ? 'card popup' : 'extras popup';
    if (head && title) add(`${kind}: title centred on its header bar`, B(title.getBoundingClientRect(), S).cy - box(head).cy);
    const x = m.querySelector('.x');
    if (x && head) { add(`${kind}: close box centred on its header bar`, box(x).cy - box(head).cy); centred(`${kind} close box`, x); }
    centred(`${kind} subtitle`, m.querySelector('.sub'));
    const foot = [...m.querySelectorAll('.foot .dk-btn')];
    if (foot.length === 2) {
      const [a, b] = foot.map(box);
      add(`${kind}: footer buttons equal widths`, a.w - b.w);
      add(`${kind}: footer row centred in the window`, (a.l + b.r) / 2 - wb.cx);
      add(`${kind}: footer buttons on one line`, a.cy - b.cy);
      foot.forEach(f => centred(`${kind} ${f.textContent} button`, f));
    }
    m.querySelectorAll('.nb').forEach((n, i) => centred(`${kind} number box ${i + 1}`, n));
    m.querySelectorAll('.step').forEach(s => centred(`${kind} ${s.getAttribute('aria-label')} button`, s));
    const shards = m.querySelector('.shards');
    if (shards) row(`${kind} Shards row`, [...shards.children].filter(e => e.textContent || e.matches('.shard')), { gaps: false });
    if (kind === 'card popup') {
      const mid = m.querySelector('.mid'), own = m.querySelector('.own'), art = m.querySelector('.art'), top = m.querySelector('.top');
      const step = m.querySelector('.stepper'), ba = own.querySelector('.ba');
      add('card popup: stepper centred in its column', box(step).cx - box(mid).cx);
      add('card popup: Owned before > after centred in its column', box(ba).cx - box(own).cx);
      centred('card popup "Cards to …" label', mid.querySelector('.lb'), { y: false });
      centred('card popup "Owned" label', own.querySelector('.lb'), { y: false });
      add('card popup: stepper and Owned on one line', box(step).cy - box(ba).cy);
      add('card popup: name centred over the two columns', contentBox(m.querySelector('.cn'), S).cx - (box(mid).l + box(own).r) / 2);
      add('card popup: art centred down its panel', box(art).cy - box(top).cy);
      const block = B(union([m.querySelector('.cn'), mid, own].map(e => e.getBoundingClientRect())), S);
      add('card popup: art centred against the text block', box(art).cy - block.cy);
      row('card popup steppers', [...step.children]);
    } else {
      m.querySelectorAll('.row1 .dk-chip').forEach(c => centred(`extras ${c.textContent} chip`, c));
      const r = m.querySelector('.row');
      if (r) row('extras list row', [...r.children], { gaps: false });
    }
  }
  return { ok: checks.every(c => c.ok), checks };
}
