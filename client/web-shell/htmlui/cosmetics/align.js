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
  for (const sel of ['.bx-pity', '.bx-why']) { const e = root.querySelector(sel); if (shown(e) && e.textContent) C.centred(sel.slice(4) + ' line', textBox(e, S), A); }
  const pair = ['.bx-link', '.bx-wd'].map(s => root.querySelector(s)).filter(shown).map(e => box(e, S));
  if (pair.length === 2) { C.centred('Contents & odds + Wardrobe (as a pair)', union(pair), A); C.same('the two buttons\' widths', pair.map(b => b.w)); C.same('the two buttons\' tops', pair.map(b => b.t)); }
  for (const b of root.querySelectorAll('.bx-link, .bx-wd')) if (shown(b)) { const p = box(b, S), t = textBox(b.querySelector('span'), S); C.centred('button text ' + b.textContent, t, p.cx); C.vcentred('button text ' + b.textContent, t, p); }
}
function contents(root, S, C) {
  const sheet = box(root.querySelector('.bx-sheet'), S), A = sheet.cx, hd = root.querySelector('.bx-sheet .hd');
  C.note('the panel axis (the sheet)', true, r1(A));
  for (const l of root.querySelectorAll('.bx-band > div')) C.centred('band line ' + l.dataset.l, textBox(l, S), box(root.querySelector('.bx-band'), S).cx);
  const list = root.querySelector('.bx-list');
  C.edges('the head row and the list', [box(hd, S), box(list, S)]);
  // the head's labels centred over their columns; the rows' numbers right-aligned on the column's right edge
  for (const c of ['c-bd', 'c-pc', 'c-ow']) {
    const h = hd.querySelector('.' + c), hb = box(h, S);
    C.centred('head ' + h.textContent, textBox(h, S), hb.cx);
    const cells = [...list.querySelectorAll('.bx-row .' + c + ', .bx-grp .' + c)].filter(e => e.textContent).slice(0, 8);
    for (const e of cells) {
      const t = textBox(e, S);
      if (c === 'c-bd') C.centred(`row ${e.textContent} (${c})`, t, hb.cx);
      else C.rightOn(`row ${e.textContent} (${c}), right-aligned`, t, hb.r);
    }
  }
  for (const e of [...list.querySelectorAll('.bx-row, .bx-grp')].slice(0, 6)) {
    const rb = box(e, S);
    for (const t of e.querySelectorAll('.sa-t')) if (t.textContent) C.vcentred(`row text ${t.textContent}`, textBox(t, S), rb);
    const rf = e.querySelector('.de-rf');
    if (rf) C.vcentred('row icon ' + e.querySelector('.c-nm').textContent, box(rf, S), rb);
  }
  const rules = root.querySelector('.bx-rules');
  if (shown(rules)) { C.edges('the rules and the sheet', [sheet, box(rules, S)]); C.centred('the rules text', textBox(rules, S), A); }
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
  const win = box(root.querySelector('.wd-win'), S), side = box(root.querySelector('.wd-side'), S);
  C.centred('the window and the side column (as a pair, on the stage)', union([win, side]), 512);
  const A = win.cx;
  const rows = [...root.querySelectorAll('.wd-row')].filter(shown);
  const list = root.querySelector('.wd-list');
  const lb = box(list, S);
  const visible = rows.map(r => [r, box(r, S)]).filter(([, b]) => b.t >= lb.t - TOL && b.b <= lb.b + TOL);
  const tabs = [...root.querySelectorAll('.wd-tab')].map(e => box(e, S)), worlds = [...root.querySelectorAll('.wd-worlds .sa-plate')].map(e => box(e, S));
  if (visible.length) {
    const rb = visible[0][1];
    C.centred('the rows (on the window)', rb, A);
    C.edges('the tabs and the rows', [union(tabs), rb]);
    C.rightOn('the world switch (on the rows\')', union(worlds), rb.r);
    C.edges('the world plates on the tab columns', [tabs[2], worlds[0]]); C.edges('the world plates on the tab columns', [tabs[3], worlds[1]]);
    C.leftOn('the hint (on the rows\')', box(root.querySelector('.wd-hint'), S), rb.l);
    const foot = root.querySelector('.wd-foot');
    C.edges('the foot and the rows', [rb, box(foot, S)]);
    if (foot.textContent) C.centred('the graduation line', textBox(foot, S), A);
    for (const [r, b] of visible.slice(0, 6)) {
      const name = r.querySelector('.nm').textContent;
      C.vcentred('row icon ' + name, box(r.querySelector('.de-rf'), S), b);
      C.vcentred('row name ' + name, textBox(r.querySelector('.nm'), S), b);
      const wr = r.querySelector('.wr');
      if (wr.textContent) C.vcentred('row label ' + wr.textContent + ' (' + name + ')', textBox(wr, S), b);
    }
    const wrs = visible.map(([r]) => r.querySelector('.wr')).filter(e => e.textContent).map(e => textBox(e, S).r);
    C.same('the rows\' Wearing / Locked labels: right edges', wrs);
  }
  C.same('the tabs\' widths', [...tabs, ...worlds].map(b => b.w));
  C.same('the tabs\' gaps', tabs.slice(1).map((b, i) => b.l - tabs[i].r));
  for (const t of [...root.querySelectorAll('.wd-tab, .wd-worlds .sa-plate')]) { const p = box(t, S), tb = textBox(t, S); C.centred('plate text ' + t.textContent, tb, p.cx); C.vcentred('plate text ' + t.textContent, tb, p); }
  // the side column: one width top to bottom, equal gaps, the state plate on its axis
  const stack = ['.wd-bust', '.wd-side > .sa-band', '.wd-equip', '.wd-close'].map(s => box(root.querySelector(s), S));
  C.edges('the bust frame, the detail band, Equip, Close', stack);
  C.same('the side column\'s gaps (band, Equip, Close)', stack.slice(2).map((b, i) => b.t - stack[i + 1].b));
  const stateEl = root.querySelector('.wd-state');
  C.centred('the bust\'s state plate', box(stateEl, S), side.cx);
  C.centred('the bust\'s state text', textBox(stateEl, S), side.cx);
  C.vcentred('the bust\'s state text', textBox(stateEl, S), box(stateEl, S));
  for (const p of root.querySelectorAll('.wd-side > .sa-pill')) { const pb = box(p, S), t = textBox(p.querySelector('span'), S); C.centred('button text ' + p.textContent, t, pb.cx); C.vcentred('button text ' + p.textContent, t, pb); }
  const head = root.querySelector('.wd-head'), rf = root.querySelector('.wd-info > .de-rf');
  if (head && rf) C.vcentred('the item\'s art beside its name', box(rf, S), box(head, S));
}

/** Measure the screen that is up. */
export function checkAlign() {
  const S = stage(), C = checker();
  let screen = null;
  const wd = document.querySelector('.de-wd'), rv = document.querySelector('.bx-rv[data-phase=done]'), bx = document.querySelector('.bx');
  if (wd) { screen = 'wardrobe'; wardrobe(wd, S, C); }
  else if (rv) { screen = 'reveal'; reveal(rv, S, C); }
  else if (bx?.querySelector('.bx-sheet')) { screen = 'contents'; contents(bx, S, C); }
  else if (bx?.querySelector('.bx-head')) { screen = 'showcase'; showcase(bx, S, C); }
  return { screen, ok: C.checks.every(c => c.ok), checks: C.checks };
}
