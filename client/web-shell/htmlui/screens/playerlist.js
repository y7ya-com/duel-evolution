// The lobby's player list (CPlayerListDlg : CWindowModelInformation, include/yo2/System/CPlayerListDlg.h: not
// decompiled; its controls as the snapshot reports them), owned by the DOM through screens/duelsetup.js (the owner of
// CFindMenu, the list's search menu, which hangs off it). The window: an icon bar (CWindowTaskIconbar, 248 x 24) with the
// search switch (CWindowTaskPictureSwitch '検索ボタン', icon_02_c01.png) and the taller / shorter icons (IconExpand /
// IconHide, one over the other at its right), the thin frame under it (CWindowTaskThinChop) and the list
// (CWindowTaskActiveListbox, 8 in, 16-pixel rows over its BackStripe: window_base_01_c01's tiles at 0.7, every even
// item #eeeeed, the others #fff, the row under the mouse #0084ff; CWindowTaskBackStripe::applyLooks).
// - Drawing: the bar, the frame and the icons are controls/skin.js's (the chat's: the same classes); the search switch
//   is CSS + SVG here (its atlas texels below); the rows are a native scroller (controls/scroll.js scrollList, the
//   owner's Scrolling rule), each a real <button> whose text is Arial (textBox, spaced as the game), laid out by the
//   row's own tags ("@0Lv 1@>40/Name": AtConverter's pen moves, src/System/yo2TagConverter.cpp).
// - Input: a row's click is the game's: its row brought into the engine's view first (the list's scroll bar set,
//   CWindowTaskScrollBase::setValue), then a press at that row's game point (CWindowTaskActiveListbox::onMain picks the
//   row under the mouse; a press there opens the player's card, CPlayerListMenu). Hover is the DOM's (:hover), as the
//   engine's follows its mouse. The native scroller keeps the engine's list on the same first row (setValue).
// - Discord: duelists online on Discord but not in the game (GET /api/de/discord-online, on opening and every 30 s)
//   follow the game's rows in our scroller only, as "Name (Discord)": not the engine's items, never pressed, no card.
//   The game's rows keep their item indexes (listRows), so a pick still presses the engine's own row.
const ui = await import('../../ui.js').catch(() => null);   // null under node (the unit test needs no DOM)
const basic = ui && await import('../controls/basic.js');
const skin = ui && await import('../controls/skin.js');
const scroll = ui && await import('../controls/scroll.js');

export const CLS = 'CPlayerListDlg';
const ROW = 16;   // CWindowTaskActiveListbox::onMain: 16-pixel rows; BackStripe rowH_ 16

// the window's parts: its list (the top-level ActiveListbox), the list's scroll bar, the search switch
export function parts(win) {
  const cs = win.controls, list = cs.find(c => /ActiveListbox$/.test(c.cls) && !c.parent);
  return {
    list,
    bar: list && cs.find(c => c.parent === list.id && /Scroll$/.test(c.cls)),
    stripe: list && cs.find(c => c.parent === list.id && /BackStripe$/.test(c.cls)),
  };
}

// A row's text as AtConverter::convert reads it (src/System/yo2TagConverter.cpp): "@0".."@9" a style (all black in a
// list: a CTextElm's colour multiplies its glyphs), "@>N/" the pen to x = N (the '/' optional), "@@" an '@'. Returns
// the pieces placed: [{ x, s }] (x: the pen, from the row's left; a piece without a pen move follows the one before)
export function rowRuns(text = '') {
  const out = [];
  let x = 0, s = '';
  const put = () => { if (s) out.push({ x, s }); s = ''; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c !== '@' && c !== '\uff20') { s += c; continue; }
    if (n >= '0' && n <= '9') { i++; continue; }   // a style: the same black
    if (n === '@') { s += '@'; i++; continue; }
    if (n === '>') {
      let j = i + 2, v = 0;
      while (text[j] >= '0' && text[j] <= '9') v = v * 10 + +text[j++];
      put();
      x = v;
      i = text[j] === '/' ? j : j - 1;
      continue;
    }
    s += c;
  }
  put();
  // pieces with no pen move between them are one (the pen only moves at "@>N/")
  return out.reduce((a, r) => { if (a.length && a.at(-1).x === r.x) a.at(-1).s += r.s; else a.push({ ...r }); return a; }, []);
}

// the first item the engine must show for item i to be in view (rows of it fit), else its own
export function topFor(i, top, rows, n) {
  if (i >= top && i < top + rows) return top;
  return Math.max(0, Math.min(i, n - rows));
}
// the game point at item i's row (its first item shown: top), 40 in (as invite.js and tools/flip.mjs ROW press it)
export const rowPoint = (win, list, i, top = list.top || 0) =>
  [win.x + list.x + Math.min(40, Math.floor(list.w / 2)), win.y + list.y + ROW * (i - top) + ROW / 2];

// The scroller's rows: the game's items (their engine index i), then the Discord duelists (the first marked, for the
// separator over it), then empty striped rows down to the box's last. Stripes go by the row's place, so they run on.
export function listRows(items = [], discord = [], nrows = 1) {
  const out = items.map((s, i) => ({ kind: 'player', i, s }));
  discord.forEach((name, k) => out.push({ kind: 'discord', name, first: k === 0 }));
  while (out.length < nrows) out.push({ kind: 'fill' });
  return out;
}
// GET /api/de/discord-online -> the names (none on any failure, silently)
export async function discordOnline() {
  try {
    const r = await fetch((globalThis.ENV?.YO2_DE_HTTP || '') + '/api/de/discord-online', { credentials: 'same-origin' });
    const j = r.ok ? await r.json() : null;
    return Array.isArray(j?.players) ? j.players.map(p => String(p?.name ?? '')).filter(Boolean).slice(0, 200) : [];
  } catch { return []; }
}
const POLL = 30000;

// What owned() redraws from (screens/chat.js: a control redrawn when its snapshot changes): the list is this file's own
// scroller (CWindowTaskPlayerRows: no drawing there, no native list of owned()'s), the search switch drawn from its
// checked / disabled only (hover and press are the DOM's), world positions and the focus left out
export function prepList(win) {
  return { ...win, controls: win.controls.map(c => {
    const { wx, wy, wz, focused, ...k } = c;
    if (/ActiveListbox$/.test(c.cls) && !c.parent) return { id: c.id, cls: 'CWindowTaskPlayerRows', parent: 0, x: c.x, y: c.y, w: c.w, h: c.h, shown: c.shown };
    if (/PictureSwitch$/.test(c.cls)) { const { state, art, ...b } = k; return { ...b, cls: 'CWindowTaskSearchSwitch', disabled: state === 'disabled' }; }
    return k;
  }) };
}

// --- The search switch (icon_02_c01.png row 0: 32 x 24 at u 0 normal, 32 hover, 64 pressed and checked): a 31 x 14 plate
// at (0, 3) inside a 1-px white edge, the magnifier over it. The plate's rows 4..15 (its middle colour), and its columns
// 1, 2 (left) and 28, 29 (right) where they differ, texel for texel:
const PLATE = {
  normal: { m: ['fed5f1', 'febde9', ...Array(8).fill('fda7e1'), 'ee76da', 'd72bcf'],
    l1: ['fedbf3', 'fec8ec', ...Array(8).fill('fdbce8'), 'fdaee3', 'ec70d9'], l2: ['fedaf2', 'fec6eb', ...Array(8).fill('fdb3e5'), 'f690de', 'da36d1'],
    r2: ['fecbed', 'fdade3', ...Array(8).fill('f489dd'), 'e861d7', 'd72bcf'], r1: ['fdace3', 'eb6ed9', ...Array(8).fill('e24ed4'), 'dc3bd1', 'd72bcf'],
    line: '#005fea', fill: '#fff' },
  hover: { m: ['fff3fb', 'ffecf9', ...Array(8).fill('ffe5f7'), 'f0a2ef', 'd93be4'],
    l1: ['fff4fc', 'ffeffa', ...Array(8).fill('ffebf9'), 'ffe7f8', 'ee99ee'], l2: ['fff4fc', 'ffeefa', ...Array(8).fill('ffe8f8'), 'f8c5f3', 'dc4be5'],
    r2: ['fff0fa', 'ffe7f8', ...Array(8).fill('f6bcf2'), 'ea86ec', 'd93be4'], r1: ['ffe6f7', 'ed97ee', ...Array(8).fill('e46be9'), 'de51e6', 'd93be4'],
    line: '#4abdff', fill: '#fff' },
  pressed: { m: ['d91cbf', 'f04dc9', ...Array(8).fill('ff6dcf'), 'ff92db', 'ffbae8'],
    l1: ['d91cbf', 'de27c1', ...Array(8).fill('e433c3'), 'ed48c7', 'ff75d2'], l2: ['d91cbf', 'ea40c6', ...Array(8).fill('f65acb'), 'ff77d2', 'ffa8e2'],
    r2: ['dc24c0', 'f85ecc', ...Array(8).fill('ff80d5'), 'ffa0e0', 'ffc2eb'], r1: ['ee49c8', 'ff78d3', ...Array(8).fill('ff90da'), 'ffa5e1', 'ffc3eb'],
    line: '#005fea', fill: '#fffd46' },
};
const col = list => `linear-gradient(to bottom, ${list.map((c, i) => `#${c} ${i}px ${i + 1}px`).join(', ')})`;
const plate = p => [`${col(p.l1)} 1px 1px / 1px 12px no-repeat`, `${col(p.l2)} 2px 1px / 1px 12px no-repeat`,
  `${col(p.r2)} 28px 1px / 1px 12px no-repeat`, `${col(p.r1)} 29px 1px / 1px 12px no-repeat`, `${col(p.m)} 1px 1px / 29px 12px no-repeat`, '#fff'].join(', ');
// the magnifier (the atlas's pixels: a lens 15..24 x 4..13, a 1-px outline round a 1-px light band round a 1-px ring
// round a light middle, centre (20, 9); the handle down to the lower left, 2 px a row, from (14, 10) to (7, 14)), drawn
// as circles and a stroke in the button's 32 x 24 box
const lens = p => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 24'>`
  + `<path d='M7 14.5L14.6 10.7' stroke='${p.line}' stroke-width='1.8'/>`
  + `<circle cx='20' cy='9' r='4.5' fill='${p.fill}' stroke='${p.line}' stroke-width='1'/>`
  + `<circle cx='20' cy='9' r='2.5' fill='none' stroke='${p.line}' stroke-width='1'/></svg>`)}")`;
const look = p => `background: ${plate(p)};`;

const CSS = () => `
.pl-search { position: absolute; width: 32px; height: 24px; margin: 0; padding: 0; border: 0; background: none; cursor: inherit; }
.pl-search::before { content: ''; position: absolute; left: 0; top: 3px; width: 31px; height: 14px; ${look(PLATE.normal)} }
.pl-search::after { content: ''; position: absolute; inset: 0; background: ${lens(PLATE.normal)} 0 0 / 32px 24px no-repeat; }
.pl-search:hover::before { ${look(PLATE.hover)} }
.pl-search:hover::after { background-image: ${lens(PLATE.hover)}; }
.pl-search:active:not(:disabled)::before, .pl-search[aria-pressed=true]::before { ${look(PLATE.pressed)} }
.pl-search:active:not(:disabled)::after, .pl-search[aria-pressed=true]::after { background-image: ${lens(PLATE.pressed)}; }
/* the rows (CWindowTaskBackStripe, 70 %): even items #eeeeed, odd #fff, past the last item too (the box's rows: .pl-fill);
   each row its own tile, so the highlighted one replaces its stripe as the engine's tile does */
.pl-list { font: ${basic ? basic.fontCss() : '14px Arial'}; color: #000; }
.pl-row, .pl-fill { display: block; width: 100%; margin: 0; padding: 0; border: 0; background: rgb(255 255 255 / .7); color: #000;
  text-align: left; overflow: hidden; cursor: inherit; }
/* the shaded tile (56, 8), #eeeeed, between #fff texels: its ends half white over the first and last half texel */
.pl-row[data-even], .pl-fill[data-even] {
  background: linear-gradient(to right, rgb(247 247 246 / .7), rgb(238 238 237 / .7) 14.5px, rgb(238 238 237 / .7) calc(100% - 14.5px), rgb(247 247 246 / .7)); }
/* the row the mouse is on, and stays on after it leaves the list (the engine's look keeps the last row it was over):
   window_base_01_c01's (72, 16) tile, #0084ff, stretched over the row, so its first and last half texel (14.5 px) take
   in the atlas's neighbours, #59c6ff on the left, #ff8a8a on the right (half each at the ends; sampled from the
   engine's 2x render: #2880c4 > #0d6cc2 > #646d99 over the lobby) */
.pl-row[data-sel], .pl-row:focus-visible, .pl-row[data-even][data-sel] { outline: none;
  background: linear-gradient(to right, rgb(45 165 255 / .7), rgb(0 132 255 / .7) 14.5px, rgb(0 132 255 / .7) calc(100% - 14.5px), rgb(128 135 197 / .7)); }
.pl-row > .txt { position: absolute; pointer-events: none; }
/* a Discord duelist: the row's own stripe, no highlight, not a button; "(Discord)" quieter; a hairline over the first */
.pl-row.pl-dc { cursor: default; }
.pl-row.pl-dc[data-first] { box-shadow: inset 0 1px rgb(0 0 0 / .22); }
.pl-row.pl-dc > .txt { display: flex; }
.pl-row.pl-dc .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; }   /* a long name gives way; "(Discord)" stays whole */
.pl-row.pl-dc .tag { flex: none; color: #6a6f78; }
`;
function inject() {
  if (!ui || document.getElementById('htmlui-plist')) return;
  const st = document.createElement('style');
  st.id = 'htmlui-plist';
  st.textContent = CSS();
  document.head.append(st);
}

export const DRAW = {
  Iconbar: (el, c) => skin.iconbar(el, c),
  ThinChop: (el, c) => skin.chop(el, c),
  IconExpand(el, c, api) { icon(el, c, api, 'expand', 'Taller'); },
  PlayerRows: () => {},   // the rows are this file's scroller (rows())
  SearchSwitch(el, c, api) {
    inject();
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pl-search';
    Object.assign(b.style, { left: c.x + 'px', top: c.y + 'px' });
    b.disabled = c.disabled;
    b.setAttribute('aria-pressed', !!c.checked);
    b.setAttribute('aria-label', 'Find a player');
    b.addEventListener('click', () => api.click(c.id));
    el.append(b);
  },
};
function icon(el, c, api, kind, label) {
  const b = skin.icon(el, { x: c.x, y: c.y, kind, label, state: c.pressed ? 'pressed' : null });
  b.disabled = c.enabled === false;
  b.addEventListener('click', () => api.click(c.id));
}
export const iconHide = (el, c, api) => icon(el, c, api, 'hide', 'Shorter');

// The rows: a native scroller over the list's rect, kept in the window's state (st.pl) across redraws, so its scroll
// position stays. st.win is the window's latest snapshot (duelsetup.js keeps it).
const frames = n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); });
async function pick(st, api, i) {
  if (st.pl.busy) return;
  st.pl.busy = true;
  try {
    let { list, bar } = parts(st.win);
    if (!list) return;
    const rows = Math.max(1, list.rows || Math.floor(list.h / ROW)), n = (list.items || []).length;
    if (i >= n) return;
    const want = topFor(i, list.top || 0, rows, n);
    if (want !== (list.top || 0) && bar) {   // the row into the engine's view first: its bar's value, then a few frames
      api.setValue?.(bar.id, want);
      st.pl.sent = performance.now();
      for (let k = 0; k < 40 && (parts(st.win).list?.top || 0) !== want; k++) await frames(1);
      ({ list } = parts(st.win));
    }
    await api.click(list.id, rowPoint(st.win, list, i, list.top || 0));
  } finally { st.pl.busy = false; }
}

function select(st, i) {
  st.pl.sel = i;
  st.pl.list.rows.querySelectorAll('.pl-row').forEach(b => { if (b.dataset.i == i) b.dataset.sel = ''; else delete b.dataset.sel; });
}

// the list window's own CDupSprite (data/guns_trial/guns_star16_01.png: a player's stars, a picture): the engine keeps
// drawing it (duelsetup.js passthrough). ponytail: never seen drawn (disp 0, no tiles in the live lobby), so where it
// would sit under the rows is untested
export const stars = new Set();

export function rows(win, root, api, st) {
  const { list, bar } = parts(win);
  for (const e of win.extras || []) if (e.cls === 'CDupSprite') stars.add(e.id);
  if (!st.pl) {
    inject();
    const l = scroll.scrollList(root, { rowH: ROW });
    l.el.classList.add('pl-list');
    l.el.setAttribute('role', 'list');
    l.el.setAttribute('aria-label', 'Players here');
    // the engine's list on the DOM's first row (its scroll bar, as a drag of its thumb would)
    l.onTop = i => {
      const b = parts(st.win).bar;
      if (b && b.max > 0) { api.setValue?.(b.id, Math.max(0, Math.min(b.max, i))); st.pl.sent = performance.now(); }
    };
    st.pl = { list: l, items: null, discord: [] };
    // the Discord duelists: now and every 30 s while the window is open (stopRows on unmount)
    const poll = async () => {
      const names = await discordOnline();
      if (st.pl.stopped) return;
      st.pl.discord = names;
      rows(st.win || win, root, api, st);
      st.pl.timer = setTimeout(poll, POLL);
    };
    poll();
  }
  const l = st.pl.list;
  l.el.style.display = list?.shown ? '' : 'none';
  if (!list) return;
  Object.assign(l.el.style, { left: list.x + 'px', top: list.y + 'px', width: list.w + 'px', height: list.h + 'px' });
  const items = list.items || [], nrows = Math.max(1, list.rows || Math.floor(list.h / ROW));
  const tw = list.w - 16;   // the list's text (CWindowTaskListbox text_): w - 16, the scroll bar's column
  const discord = st.pl.discord || [];
  const key = JSON.stringify([items, nrows, discord]);
  if (key !== st.pl.items) {
    st.pl.items = key;
    l.set(listRows(items, discord, nrows), (r, n) => {
      if (r.kind === 'fill') {
        const f = document.createElement('div');
        f.className = 'pl-fill';
        if (n % 2 === 0) f.dataset.even = '';
        return f;
      }
      if (r.kind === 'discord') {
        // the name where the game's rows have theirs (the pen's 40), "(Discord)" after it, to 4 px short of the row's end
        // (no engine scroll bar column to keep: the rows past the game's are ours); nothing to press
        const d = document.createElement('div');
        d.className = 'pl-row pl-dc';
        if (n % 2 === 0) d.dataset.even = '';
        if (r.first) d.dataset.first = '';
        d.setAttribute('role', 'listitem');
        d.setAttribute('aria-label', r.name + ' (on Discord, not in the game)');
        const t = document.createElement('div'), nm = document.createElement('span'), tag = document.createElement('span');
        t.className = 'txt';
        Object.assign(t.style, { left: '40px', top: '1px', width: Math.max(0, list.w - 44) + 'px', height: ROW - 1 + 'px', overflow: 'hidden',
          whiteSpace: 'pre', font: basic.fontCss(ROW, ROW) });
        nm.className = 'nm';
        nm.textContent = r.name;
        tag.className = 'tag';
        tag.textContent = '\u00a0(Discord)';
        for (const e of [nm, tag]) e.style.letterSpacing = basic.spacing(e.textContent) + 'px';
        t.append(nm, tag);
        d.append(t);
        return d;
      }
      const { i, s } = r;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pl-row';
      b.dataset.i = i;
      if (n % 2 === 0) b.dataset.even = '';
      b.setAttribute('role', 'listitem');
      // the text a pixel down (the engine's glyphs sit 1.5 px lower in the row than Arial's on a 16-px line)
      for (const q of rowRuns(s)) basic.textBox(b, q.s, { x: q.x, y: 1, w: Math.max(0, tw - q.x), h: ROW - 1 });
      b.addEventListener('pointerenter', () => select(st, i));
      b.setAttribute('aria-label', basic.untag(s).replace(/@>\d+\/?/g, ' ').replace(/\s+/g, ' ').trim());
      b.addEventListener('click', () => pick(st, api, i));
      return b;
    }, (r, n) => r.kind === 'player' ? 'p' + r.i + '\u0000' + r.s : r.kind === 'discord' ? 'd' + n + '\u0000' + r.name + (r.first ? '1' : '') : 'f' + n);
  }
  // the highlighted row: the engine's own (its mouse moved over the list: a press there) when it changes, else the
  // last row the DOM's pointer was on
  const sel = list.selected ?? -1;
  if (sel !== st.pl.gameSel) { st.pl.gameSel = sel; if (sel >= 0) st.pl.sel = sel; }
  select(st, st.pl.sel ?? -1);
  // the game moved its list itself (not to where the DOM is, and not in answer to the DOM's own setValue, which lands
  // a frame or more later): the DOM follows
  const top = list.top || 0, shown = Math.round(l.el.scrollTop / ROW), ours = performance.now() - (st.pl.sent || -1e9) < 1500;
  if (bar && top !== st.pl.top && top !== shown && !ours) l.top(top);
  st.pl.top = top;
}

// the window closed: no more polling
export function stopRows(st) { if (!st.pl) return; st.pl.stopped = true; clearTimeout(st.pl.timer); }
