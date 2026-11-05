// The cosmetics screens' alignment, measured in the running page (the owner: "the non-centered elements here and there
// are throwing me off"). checkAlign() finds the screen that is up (the box showcase, the contents & odds sheet, the
// reveal, the Wardrobe) and measures its key boxes in game px (the canvas is 1024 game px wide): the centred groups
// must have equal left and right margins about their panel's axis, the column stacks shared left and right edges,
// the labels their text centred on their plates, within TOL (1 game px).
//   checkAlign() -> { screen, ok, checks: [{ name, ok, got, want? }] }   (an empty checks list: no screen is up)
// Run live with cosmetics/align_check.mjs (DevTools port), and in boxes_dom_test.mjs / wardrobe_dom_test.mjs.
import { FACE } from './shopart.js';
export const TOL = 1;

function stage() {
  const c = document.getElementById('canvas')?.getBoundingClientRect();
  const s = c?.width ? c.width / 1024 : 1;
  return { s, x: c?.width ? c.left : 0, y: c?.width ? c.top : 0 };
}
const shown = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
// an element's box, or its text's box (the glyphs' line boxes: a Range over its contents), in game px
function boxOf(r, S) {
  return { l: (r.left - S.x) / S.s, r: (r.right - S.x) / S.s, t: (r.top - S.y) / S.s, b: (r.bottom - S.y) / S.s,
    get cx() { return (this.l + this.r) / 2; }, get cy() { return (this.t + this.b) / 2; }, get w() { return this.r - this.l; }, get h() { return this.b - this.t; } };
}
// an element's box; a piece with a shadow inside its box (shopart.js FACE): its face
function box(e, S) {
  const b = boxOf(e.getBoundingClientRect(), S), f = Object.entries(FACE).find(([c]) => e.classList?.contains(c))?.[1];
  if (!f) return b;
  return boxOf({ left: b.l + f[3], right: b.r - f[1], top: b.t + f[0], bottom: b.b - f[2] }, { s: 1, x: 0, y: 0 });
}
function textBox(e, S) {
  const rg = document.createRange();
  rg.selectNodeContents(e);
  const rs = [...rg.getClientRects()].filter(r => r.width > 0);
  if (!rs.length) return null;
  return boxOf({ left: Math.min(...rs.map(r => r.left)), right: Math.max(...rs.map(r => r.right)), top: Math.min(...rs.map(r => r.top)),
    bottom: Math.max(...rs.map(r => r.bottom)) }, S);
}
const union = bs => boxOf({ left: Math.min(...bs.map(b => b.l)), right: Math.max(...bs.map(b => b.r)), top: Math.min(...bs.map(b => b.t)),
  bottom: Math.max(...bs.map(b => b.b)) }, { s: 1, x: 0, y: 0 });
const r1 = n => Math.round(n * 10) / 10;

function checker() {
  const checks = [];
  const near = (name, got, want, tol = TOL) => checks.push({ name, ok: Math.abs(got - want) <= tol, got: r1(got), want: r1(want) });
  return {
    checks,
    // b centred on the axis x: equal margins
    centred: (name, b, axis) => b && near(name + ': centred', b.cx, axis),
    vcentred: (name, b, on) => b && near(name + ': centred vertically', b.cy, on.cy),
    edges: (name, bs) => {
      if (bs.length < 2) return;
      for (const [i, b] of bs.entries()) if (i) { near(`${name}: left edge ${i}`, b.l, bs[0].l); near(`${name}: right edge ${i}`, b.r, bs[0].r); }
    },
    same: (name, vals) => { for (const [i, v] of vals.entries()) if (i) near(`${name} ${i}`, v, vals[0]); },
    within: (name, b, outer) => b && checks.push({ name: name + ': within', ok: b.l >= outer.l - TOL && b.r <= outer.r + TOL,
      got: [r1(b.l), r1(b.r)], want: [r1(outer.l), r1(outer.r)] }),
    note: (name, ok, got) => checks.push({ name, ok, got }),
    leftOn: (name, b, x) => b && near(name + ': left edge', b.l, x),
    rightOn: (name, b, x) => b && near(name + ': right edge', b.r, x),
  };
}

function showcase(root, S, C) {
  const fr = root.querySelector('.bx-head .fr'), A = box(fr, S).cx;
  C.note('the panel axis (the banner frame)', true, r1(A));
  for (const l of root.querySelectorAll('.bx-band > div')) C.centred('band line ' + l.dataset.l, textBox(l, S), A);
  const tabs = [...root.querySelectorAll('.bx-tab')].map(e => box(e, S));
  C.centred('the box tabs', union(tabs), A);
  C.same('the tabs\' gaps', tabs.slice(1).map((b, i) => b.l - tabs[i].r));
  for (const t of root.querySelectorAll('.bx-tab')) { const p = box(t, S); C.centred('tab name ' + t.querySelector('.nm').textContent, textBox(t.querySelector('.nm'), S), p.cx); }
  const cells = [...root.querySelectorAll('.bx-cell')];
  if (cells.length) {
    const cb = cells.map(e => box(e, S));
    C.centred('the item strip', union(cb), A);
    const tags = cells.map(c => box(c.querySelector('.tag'), S));
    C.same('the label plates\' heights', tags.map(b => b.h));
    C.same('the label plates\' tops', tags.map(b => b.t));
    cells.forEach((c, i) => {
      const nm = c.querySelector('.tag > span').textContent, tb = textBox(c.querySelector('.tag > span'), S);
      C.centred('label ' + nm, tb, tags[i].cx); C.vcentred('label ' + nm, tb, tags[i]);
      C.centred('art ' + nm, box(c.querySelector('.de-rf'), S), cb[i].cx);
      const br = c.querySelector('.sa-brackets');
      if (shown(br)) C.centred('brackets ' + nm, box(br, S), cb[i].cx);
    });
    const arrows = [...root.querySelectorAll('.bx-prev, .bx-next')].map(e => box(e, S));
    C.centred('the paging arrows (as a pair)', union(arrows), A);
  }
  const why = root.querySelector('.bx-why');
  if (shown(why) && why.textContent) C.centred('why line', textBox(why, S), A);
  pityBars(root, S, C, A);
  const link = root.querySelector('.bx-link');
  if (shown(link)) { const p = box(link, S), t = textBox(link.querySelector('span'), S); C.centred('Contents & odds', p, A); C.centred('button text ' + link.textContent, t, p.cx); C.vcentred('button text ' + link.textContent, t, p); }
  // the preview: its Preview plate centred on its frame, its text on the plate
  const pv = root.querySelector('.bx-pv');
  if (shown(pv)) {
    const fr = box(pv.querySelector('.sa-frame'), S), tag = pv.querySelector('.pv-tag'), tb = box(tag, S), tt = textBox(tag.querySelector('span'), S);
    C.centred('the Preview plate', tb, fr.cx); C.centred('the Preview text', tt, tb.cx); C.vcentred('the Preview text', tt, tb);
    const note = pv.querySelector('.pv-note');
    if (shown(note) && note.textContent) { C.centred('the preview notice', textBox(note, S), fr.cx); C.centred('the preview art', box(pv.querySelector('.pv-art > .de-rf'), S), fr.cx); }
  }
}
// the pity bars: centred on the axis, every bar on the same track (shared left and right edges), the texts on their row
function pityBars(root, S, C, A) {
  const g = root.querySelector('.bx-pity');
  if (!shown(g)) return;
  C.centred('the pity bars', box(g, S), A);
  const rows = [...g.querySelectorAll('.pm')];
  C.edges('the pity tracks', rows.map(r => box(r.querySelector('.bar'), S)));
  for (const r of rows) {
    const rb = box(r, S);
    for (const t of r.querySelectorAll('.sa-t')) C.vcentred('pity text ' + t.textContent, textBox(t, S), rb);
    C.vcentred('pity track ' + r.dataset.key, box(r.querySelector('.bar'), S), rb);
  }
}
function contents(root, S, C) {
  const sheet = box(root.querySelector('.bx-sheet'), S), A = sheet.cx, hd = root.querySelector('.bx-sheet .hd');
  C.note('the panel axis (the sheet)', true, r1(A));
  for (const l of root.querySelectorAll('.bx-band > div')) C.centred('band line ' + l.dataset.l, textBox(l, S), box(root.querySelector('.bx-band'), S).cx);
  const list = root.querySelector('.bx-list');
  C.edges('the head row and the list', [box(hd, S), box(list, S)]);
  // the head's labels centred over their columns; the rows' numbers right-aligned on the column's right edge
  for (const c of ['c-pc', 'c-ow']) {
    const h = hd.querySelector('.' + c), hb = box(h, S);
    C.centred('head ' + h.textContent, textBox(h, S), hb.cx);
    const cells = [...list.querySelectorAll('.bx-row .' + c + ', .bx-grp .' + c)].filter(e => e.textContent).slice(0, 8);
    for (const e of cells) {
      const t = textBox(e, S);
      C.rightOn(`row ${e.textContent} (${c}), right-aligned`, t, hb.r);
    }
  }
  for (const e of [...list.querySelectorAll('.bx-row, .bx-grp')].slice(0, 6)) {
    const rb = box(e, S);
    for (const t of e.querySelectorAll('.sa-t')) if (t.textContent) C.vcentred(`row text ${t.textContent}`, textBox(t, S), rb);
    const rf = e.querySelector('.de-rf');
    if (rf) C.vcentred('row icon ' + e.querySelector('.c-nm').textContent, box(rf, S), rb);
  }
  pityBars(root, S, C, A);
}
function reveal(rv, S, C) {
  const card = box(rv.querySelector('.bx-card'), S), A = card.cx;
  C.note('the column axis (the card)', true, r1(A));
  C.centred('the stage (the card on the screen)', card, 512);
  const after = rv.querySelector('.after'), col = [...after.children].filter(shown);
  const pills = col.filter(e => e.classList.contains('sa-pill'));
  for (const e of col) {
    const name = e.classList.contains('sa-pill') ? 'button ' + e.textContent : (e.className.split(' ')[0] || 'line') + ' ' + e.textContent.slice(0, 24);
    const b = box(e, S), t = e.classList.contains('nm') || e.classList.contains('rl') || e.classList.contains('notice') || e.classList.contains('status') ? textBox(e, S) : b;
    if (t) C.centred(name, t, A);
    C.within(name + ' (the card\'s width)', b, card);
  }
  C.same('the buttons\' widths', pills.map(p => box(p, S).w));
  C.same('the column\'s width (the buttons, the card)', [card.w, ...pills.map(p => box(p, S).w)]);
  for (const p of pills) { const pb = box(p, S), t = textBox(p.querySelector('span'), S); C.centred('button text ' + p.textContent, t, pb.cx); C.vcentred('button text ' + p.textContent, t, pb); }
  const news = rv.querySelector('.news');
  if (shown(news)) { const nb = box(news, S), t = textBox(news.querySelector('span'), S); C.centred('the news plate text', t, nb.cx); C.vcentred('the news plate text', t, nb); }
}
function wardrobe(root, S, C) {
  const win = box(root.querySelector('.wd-win'), S), A = win.cx;
  C.centred('the window (on the stage)', win, 512);
  C.same('the window (on the stage, vertically)', [win.t, 768 - win.b]);
  const tabs = [...root.querySelectorAll('.wd-tab')].map(e => box(e, S)), bar = box(root.querySelector('.wd-tabs'), S);
  C.same('the tabs\' widths', tabs.map(b => b.w));
  C.same('the tabs\' gaps', tabs.slice(1).map((b, i) => b.l - tabs[i].r));
  for (const t of root.querySelectorAll('.wd-tab')) { const p = box(t, S), tb = textBox(t, S); C.centred('tab text ' + t.textContent, tb, p.cx); C.vcentred('tab text ' + t.textContent, tb, p); }
  const bust = box(root.querySelector('.wd-bust'), S), side = box(root.querySelector('.wd-side'), S), grid = box(root.querySelector('.wd-grid'), S);
  const tiles = [...root.querySelectorAll('.wd-tile')].filter(shown).map(e => box(e, S));
  if (tiles.length) {
    C.leftOn('the grid (on the tabs\' left)', tiles[0], bar.l);
    const subs = [...root.querySelectorAll('.wd-sub')].filter(shown).map(e => box(e, S));
    if (subs.length) C.same('the grid under the sub-categories (8 px)', [tiles[0].t - Math.max(...subs.map(b => b.b)), 8]);
    else C.same('the grid under the tabs (16 px)', [tiles[0].t - bar.b, 16]);
    const row = tiles.filter(b => Math.abs(b.t - tiles[0].t) < 1).slice(0, 3);
    C.same('a row\'s tops', row.map(b => b.t));
    C.same('a row\'s gaps', row.slice(1).map((b, i) => b.l - row[i].r));
    if (row.length === 3) C.rightOn('a full row (on the tabs\' right)', row[2], bar.r);
    C.same('the cards\' sizes', tiles.flatMap(b => [b.w - tiles[0].w, b.h - tiles[0].h]).concat(0));
  }
  // the sub-categories: 8 px under the tabs, on the tabs' left, inside their width, one height, their text centred
  const subEls = [...root.querySelectorAll('.wd-sub')].filter(shown);
  if (subEls.length) {
    const sb = subEls.map(e => box(e, S));
    C.same('the sub-categories under the tabs (8 px)', [sb[0].t - bar.b, 8]);
    C.leftOn('the sub-categories (on the tabs\' left)', sb[0], bar.l);
    C.same('the sub-categories\' heights', sb.map(b => b.h));
    for (const [i, e] of subEls.entries()) { C.within('sub-category ' + e.textContent, sb[i], { l: bar.l, r: bar.r, t: bar.b, b: grid.b }); C.vcentred('sub-category text ' + e.textContent, textBox(e, S), sb[i]); }
  }
  // the columns: one top, one bottom, 16 px gutters, the window's 24 px padding on both sides
  C.same('the columns\' tops (tabs, try-on, details)', [bar.t, bust.t, side.t]);
  C.same('the columns\' bottoms (grid, try-on, details)', [grid.b, bust.b, side.b]);
  C.same('the gutters (16 px)', [bust.l - bar.r, side.l - bust.r, 16]);
  C.same('the window\'s side padding (24 px)', [bar.l - win.l, win.r - side.r, win.b - side.b, 24]);
  // the header band: the title plate 24 px in, Back on the details' right, both centred on the band, the meta's text too
  const band = box(root.querySelector('.wd-win > .sa-band'), S), title = box(root.querySelector('.wd-header > .sa-title'), S), close = box(root.querySelector('.wd-close'), S);
  C.leftOn('the title plate (24 px in)', title, win.l + 24);
  C.rightOn('Back (on the details\' right)', close, side.r);
  C.vcentred('the title plate on the band', title, band);
  C.vcentred('Back on the band', close, band);
  C.vcentred('Back\'s text', textBox(root.querySelector('.wd-close > span'), S), close);
  const meta = root.querySelector('.wd-meta');
  if (meta?.textContent) C.vcentred('the meta on the band', textBox(meta, S), band);
  C.same('the columns under the band (16 px)', [bar.t - band.b, 16]);
  const stateEl = root.querySelector('.wd-state');
  if (shown(stateEl)) { const sb = box(stateEl, S); C.same('the try-on\'s state chip (16 px in)', [sb.l - bust.l, sb.t - bust.t, 16]); C.vcentred('the state chip\'s text', textBox(stateEl, S), sb); }
  // the bust: on the try-on's foot, its top (where the tallest hair reaches) 8 px under the state chip
  const wu = box(root.querySelector('.wd-wu'), S);
  C.same('the bust on the try-on\'s foot', [wu.b, bust.b]);
  if (shown(stateEl)) C.same('the bust under the state chip (8 px)', [wu.t - box(stateEl, S).b, 8]);
  for (const p of root.querySelectorAll('.wd-side .wd-btn')) if (shown(p)) { const pb = box(p, S), t = textBox(p.querySelector('span'), S); C.vcentred('button text ' + p.textContent, t, pb); C.within('button ' + p.textContent, pb, side); }
  const btns = [...root.querySelectorAll('.wd-actions .wd-btn')].filter(shown).map(e => box(e, S));
  if (btns.length) { C.leftOn('the buttons (16 px in)', btns[0], side.l + 16); C.rightOn('the buttons (16 px in)', btns.at(-1), side.r - 16); }
  const head = root.querySelector('.wd-head'), rf = root.querySelector('.wd-info > .de-rf');
  if (head && rf) { C.vcentred('the item\'s art beside its name', box(head, S), box(rf, S)); C.leftOn('the item\'s art (16 px in)', box(rf, S), side.l + 16); }
}
// Card Swap's cosmetics (cosmetics/trade-cosmetics.js): each side's tiles on one row and one grid mirrored on its area's
// centre (16 px from both edges, the Cosmetics button's face ending where the partner's last column does), the button
// centred on my row, the band's line on the same axis; the picker's rows on one column with the hint, Done centred.
function trade(layers, S, C) {
  for (const l of layers) {
    const side = l.dataset.side, at = box(l, S), w = +l.dataset.w || 488, axis = at.l + w / 2;   // the layer sits at its window's origin
    if (side === 'trade') {
      const band = l.querySelector('.tc-band');
      if (shown(band) && band.textContent) { C.centred('the band', box(band, S), axis); C.centred('the band\'s line', textBox(band.firstChild, S), axis); C.vcentred('the band\'s line', textBox(band.firstChild, S), box(band, S)); }
      continue;
    }
    const tiles = [...l.querySelectorAll('.tc-tile')].map(e => box(e, S));
    C.same(`${side}: the tiles' tops`, tiles.map(b => b.t));
    C.same(`${side}: the tiles' gaps`, tiles.slice(1).map((b, i) => b.l - tiles[i].r).filter(g => g < 20));
    if (tiles.length) C.leftOn(`${side}: the first tile (16 px in)`, tiles[0], at.l + 16);
    for (const e of l.querySelectorAll('.tc-tile')) {
      const br = e.querySelector('.sa-brackets');
      if (shown(br)) C.centred(`${side}: brackets on ${e.dataset.id}`, box(br, S), box(e, S).cx);
    }
    const bt = l.querySelector('.tc-btn');
    if (shown(bt)) {
      const f = box(bt, S), t = textBox(bt.querySelector('span'), S);
      C.rightOn('the Cosmetics button (16 px in, as the first tile)', f, axis + w / 2 - 16);
      if (tiles.length) C.vcentred('the Cosmetics button on my row', f, tiles[0]);
      C.centred('the Cosmetics button\'s text', t, f.cx); C.vcentred('the Cosmetics button\'s text', t, f);
    }
  }
}
function tradePicker(root, S, C) {
  const win = box(root.querySelector('.tcp-win'), S), A = win.cx;
  const rows = [...root.querySelectorAll('.tcp-row')].filter(shown).map(r => [r, box(r, S)]);
  if (rows.length) {
    C.edges('the picker rows', rows.map(([, b]) => b));
    C.leftOn('the hint (on the rows\')', box(root.querySelector('.tcp-hint'), S), rows[0][1].l);
    for (const [r, b] of rows.slice(0, 6)) {
      const name = r.querySelector('.nm').textContent;
      C.vcentred('row icon ' + name, box(r.querySelector('.de-rf'), S), b);
      C.vcentred('row − ' + name, box(r.querySelector('.minus'), S), b);
      C.vcentred('row + ' + name, box(r.querySelector('.plus'), S), b);
      C.vcentred('row count ' + name, box(r.querySelector('.cnt'), S), b);
      for (const p of r.querySelectorAll('.pm')) { const pb = box(p, S), t = textBox(p.firstChild, S); C.centred('sign on its plate ' + p.textContent, t, pb.cx); }
    }
    C.same('the − and + plates\' tops', rows.flatMap(([r]) => [...r.querySelectorAll('.pm')].map(p => box(p, S).t - box(r, S).t)));
  }
  const done = root.querySelector('.tcp-done');
  C.centred('Done (on the picker)', box(done, S), A);
  const t = textBox(done.querySelector('span'), S), f = box(done, S);
  C.centred('Done\'s text', t, f.cx); C.vcentred('Done\'s text', t, f);
  const foot = root.querySelector('.tcp-foot');
  if (foot.textContent) C.centred('the picker\'s foot line', textBox(foot, S), A);
}

/** Measure the screen that is up. */
export function checkAlign() {
  const S = stage(), C = checker();
  let screen = null;
  const wd = document.querySelector('.de-wd'), rv = document.querySelector('.bx-rv[data-phase=done]'), bx = document.querySelector('.bx');
  const tcp = document.querySelector('.de-tcp'), tc = [...document.querySelectorAll('.de-tc')].filter(shown);
  if (tcp) { screen = 'trade-picker'; tradePicker(tcp, S, C); trade(tc, S, C); }
  else if (tc.length) { screen = 'trade'; trade(tc, S, C); }
  else if (wd) { screen = 'wardrobe'; wardrobe(wd, S, C); }
  else if (rv) { screen = 'reveal'; reveal(rv, S, C); }
  else if (bx?.querySelector('.bx-sheet')) { screen = 'contents'; contents(bx, S, C); }
  else if (bx?.querySelector('.bx-head')) { screen = 'showcase'; showcase(bx, S, C); }
  return { screen, ok: C.checks.every(c => c.ok), checks: C.checks };
}
