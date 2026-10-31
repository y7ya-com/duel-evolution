// The Svelte deck's plain parts: screens/deck.js's plan() as data (each item a { kind, ... } for Item.svelte, not a
// draw closure) and the private tables the components need. What deck.js exports is imported from it; this file
// takes over the rest, and deck.js goes once the Svelte deck's flip pairs match (until then a fix there is ported here).
import { spriteRect } from '../../screens/deck.js';

export const EDITOR_SCENE = 0x24;
export const inEditor = snap => (snap || globalThis.yo2Html?.snapshot?.())?.scene === EDITOR_SCENE;
// card faces: the thumbnails (data/MINI), the big ones (data/CARD), pack art: the engine draws them (holes)
export const isArt = e => /^data[\\/](mini|card|cardpack)[\\/]/i.test(e?.tex || '');
export const isSwf = e => !e.cls && !('tex' in e) && !('text' in e);   // a Swf part: { id, name, x, y, z, wx, wy, shown }
export const meet = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const SWF_BOX = 32, SWF_SIZE = { KabanCountBtn: [72, 21] };
const BUTTON = /Switch$|^CWindowTaskButton|ResultNext$/;

// the drawing list of one window: items [{ id, z, rect (screen), kind, ... }] back to front, holes [{ z, rect }] and
// co (the ids of the items under a hole: passed through as well). editor: the trunk scrolls natively (no game bar)
export function plan(win, editor = true) {
  const items = [], holes = [], ox = win.x, oy = win.y;
  const hole = (z, rect) => holes.push({ z, rect });
  const add = (id, z, rect, it) => items.push({ id, z, rect, i: items.length, ...it });
  const tree = (P, ctl) => {
    const rs = [];
    for (const s of P.sprites || []) {
      if (!s.shown || !s.tex) continue;
      const r = spriteRect(s), z = s.wz ?? 0;
      rs.push({ r, z });
      if (isArt(s)) hole(z, r); else add(s.id, z, r, { kind: 'sprite', s, x: r.x - ox, y: r.y - oy });
    }
    for (const t of P.labels || []) {
      if (!t.shown || !t.text) continue;
      // the glyph colour: black (a CTextElm's colour only shows its alpha), except a CWindowTaskShadowText's text half
      // (white glyphs in the control's colour) and a dialog's "Title" (white)
      const shadowText = ctl?.name === 'CWindowTaskShadowTextのテキスト' && ctl.color;
      const ink = shadowText ? ctl.color.slice(0, 3).reduce((v, x) => v << 8 | Math.round(x * 255), 0) : ctl?.name === 'Title' ? 0xffffff : null;
      const box = ctl && 'text' in ctl ? { align: ctl.align || 0, w: ctl.w, px: ctl.fontSize || 16, ink } : { align: 0 };
      // a paged text field (the card detail's text: pageLines 9): the whole text, wrapped by words, in a native scroll box
      if (ctl?.cls === 'CWindowTaskText' && ctl.pageLines > 1 && ctl.pageLines < 50 && box.w) {
        const h = box.px * ctl.pageLines;
        add(t.id, t.wz ?? 0, { x: t.wx, y: t.wy, w: box.w, h }, { kind: 'flow', text: t.text, x: t.wx - ox, y: t.wy - oy, w: box.w, h, alpha: t.a ?? 1, px: box.px });
        continue;
      }
      add(t.id, t.wz ?? 0, { x: t.wx, y: t.wy, w: box.w || 256, h: (box.px || 16) * t.text.split('\n').length },
        { kind: 'label', text: t.text, x: t.wx - ox, y: t.wy - oy, alpha: t.a ?? 1, box });
    }
    for (const f of P.swfs || []) {
      const [w, h] = SWF_SIZE[f.name] || [SWF_BOX, SWF_BOX];
      if (f.shown) hole(f.wz ?? 0, { x: f.wx, y: f.wy, w, h });
    }
    return rs;
  };
  // the window's own frame pieces (the file list's header): their colour reads 0.8, but the engine draws them opaque
  // (measured on its 1x render: the header within 2 levels 0.1 % at 0.8, 94.9 % at 1)
  // ponytail: by measurement; read the alpha the engine draws with if another window's extras disagree
  const own = e => ({ ...e, a: 1, rgba: e.rgba && [...e.rgba.slice(0, 3), 1], col: e.col && [...e.col.slice(0, 3), 1] });
  tree({ sprites: (win.extras || []).filter(e => e.tex).map(own), labels: win.labels }, null);
  if (win.parts) tree(win.parts, null);   // a task (the shop's) has its own raw children
  // the window's own holes (the card detail's big card): in front of everything in it, not of a window over it (the
  // file list, opened over the detail: deck.js's 1e9 cut the list there)
  for (const r of win.holes || []) hole((win.wz ?? 1e9) + 0.5, { x: ox + r.x, y: oy + r.y, w: r.w, h: r.h });
  // a list (the file list's Save / Load / Structure Deck lists): its stripes, selection and items are drawn by no
  // sprite or label (the engine fills quads); its own texts are the engine's row counter (always hidden, its name says;
  // a paged text the flow box would put over the rows, taking their clicks) and an empty one. One 'list' item instead,
  // laid out as the row counter is (its align and width: centred in Save, '@>64/' after the icon in Structure Deck)
  const lists = new Set(win.controls.filter(c => c.cls === 'CWindowTaskListbox').map(c => c.id));
  for (const c of win.controls) {
    if (!c.shown || c.cls !== 'CWindowTaskListbox') continue;
    const t = win.controls.find(o => o.parent === c.id && o.cls === 'CWindowTaskText' && o.name?.includes('行数カウント'));   // the row counter
    const top = c.top || 0, n = Math.min(c.rows || 0, Math.max(0, c.items.length - top));
    // its scroll bar (past 8 rows) as a native one (owner: native scrollers): NativeScroll over the bar's column,
    // list-local (its own x, y: a world position is only kept while the engine draws it); the engine's bar is not
    // drawn (a list's own controls are skipped below)
    const sc = win.controls.find(o => o.parent === c.id && o.cls === 'CWindowTaskScroll' && o.shown);
    const bar = sc && { id: sc.id, x: sc.x, y: sc.y, w: sc.w, length: sc.length || sc.h, value: sc.value, max: sc.max, page: sc.page };
    add(c.id, (c.wz ?? 0) + 0.25, { x: c.wx, y: c.wy, w: c.w, h: c.h }, { kind: 'list', x: c.wx - ox, y: c.wy - oy, w: c.w, rows: c.rows || 0,
      items: c.items.slice(top, top + n), selected: c.selected - top, bar, box: { align: t?.align ?? 0, w: t?.w ?? c.w - 16, px: t?.fontSize || 16 } });
    // Structure Deck's recipe icon on each row (CWindowTaskStructureIcon: the engine's, passed through; no size to
    // read: its ink is x 21..47 of a row) shows through a hole, over the engine's own stripe there
    if (win.controls.some(o => o.cls === 'CWindowTaskStructureIcon' && o.shown))
      for (let i = 0; i < n; i++) hole((c.wz ?? 0) + 0.5, { x: c.wx + 20, y: c.wy + 16 * i, w: 28, h: 16 });
  }
  for (const c of win.controls) {
    if (!c.shown || c.x >= 9999) continue;   // the detail panel parks hidden children at x 9999 / 99999
    if (editor && c.cls === 'CWindowTaskKabanScroll') continue;
    if (lists.has(c.parent)) continue;   // a list's own texts and scroll bar (above)
    const rs = c.parts ? tree(c.parts, c) : [];
    if (BUTTON.test(c.cls) && rs.length) {
      const x0 = Math.min(...rs.map(o => o.r.x)), y0 = Math.min(...rs.map(o => o.r.y));
      const r = { x: x0, y: y0, w: Math.max(...rs.map(o => o.r.x + o.r.w)) - x0, h: Math.max(...rs.map(o => o.r.y + o.r.h)) - y0 };
      add(c.id, Math.max(...rs.map(o => o.z)) + 0.5, r,
        { kind: 'button', label: c.label || c.name || '', enabled: c.enabled, state: c.state || 'normal', x: r.x - ox, y: r.y - oy, w: r.w, h: r.h });
    }
  }
  items.sort((a, b) => a.z - b.z || a.i - b.i);
  const co = items.filter(it => holes.some(h => h.z > it.z && meet(h.rect, it.rect))).map(it => it.id);
  return { items, holes, co };
}

// The small icons, vector (owner: blurry or pixelated at 2x becomes CSS / SVG). Attribute discs (icon_zokusei_01
// cells 0..8): [rim, top, bottom, kanji colour, kanji]; spell / trap symbols (icon_mahouwana_01 cells 0..6)
export const ATTR_SVG = [['#ffc850', '#fff6d0', '#e0a830', '#3f2610', '光'], ['#2f0847', '#c43ad8', '#730889', '#fff', '闇'],
  ['#002642', '#0f85ff', '#003e67', '#fff', '水'], ['#4b0310', '#ff3a33', '#b90100', '#fff', '炎'],
  ['#000', '#5a5a5a', '#000', '#fff', '地'], ['#011701', '#14be32', '#016a0c', '#fff', '風'],
  ['#f0f067', '#fffbe0', '#e8c040', '#3f2610', '神'], ['#011551', '#8ba7ff', '#0033b9', '#fff', '魔'],
  ['#010721', '#c03040', '#841c28', '#fff', '罠']];
export const ICON_PATH = ['M5 6.5a3.2 3.2 0 1 1 1 4.6M5 6.5V4.2M5 6.5h2.3', 'M8 3.6 9.2 6.8 12.4 8 9.2 9.2 8 12.4 6.8 9.2 3.6 8 6.8 6.8Z',
  'M8 4.2v7.6M4.2 8h7.6', 'M8 8c-1.2-1.6-3.6-1.6-3.6 0s2.4 1.6 3.6 0 3.6-1.6 3.6 0-2.4 1.6-3.6 0', 'M9 3.8 5.6 8.6h2.8L7 12.2l3.4-4.8H7.6Z',
  'M8 3.8c1.6 2 2.8 3.2 2.8 5a2.8 2.8 0 0 1-5.6 0c0-.9.5-1.6 1-2.1.1 1 .6 1.5 1.1 1.6C7 6.8 7.4 5.4 8 3.8Z', ''];

// the scene's bevels: [w, h, slant start, gradient stops [rgb, y]...] (deck_title_01 248 x 40, deck_bottonN 176 x 27)
export const STRIP = { w: 248, h: 40, cut: 8, stops: [['105 255 255', 2.5], ['83 231 255', 5.5], ['66 185 255', 8.5], ['36 115 254', 30.5], ['0 67 254', 34.5], ['0 0 254', 37.5]] };
export const SIDE = { w: 176, h: 27, cut: 6, stops: [['105 255 255', 1.5], ['80 228 255', 4.5], ['62 178 255', 7.5], ['37 120 254', 19.5], ['6 94 254', 21.5], ['0 0 254', 25.5]] };
export const SIDE_HOVER = { ...SIDE, stops: [['207 255 255', 1.5], ['152 255 255', 5.5], ['134 237 255', 7.5], ['118 221 255', 19.5], ['81 209 255', 22.5], ['12 188 255', 25.5]] };
export const TITLES = ['EDIT DECK', 'CARD SWAP', 'TRADE'];
export const SIDE_TEXT = { LoadBtn: ['LOAD DECK', 9, 134], SaveBtn: ['SAVE DECK', 7, 133], RecipeBtn: ['STRUCTURE DECK', 8, 150],
  ClearBtn: ['CLEAR DECK', 8, 144], ExitBtn: ['EXIT', 8, 61] };
export const inSide = (b, m) => !!m && m[0] >= b.wx && m[0] < b.wx + SIDE.w && m[1] >= b.wy && m[1] < b.wy + SIDE.h;

// the trunk search's choices (the cards' icon strip cells, the game's order)
export const CATS = [['All', 6, '#8a8a8a'], ['Normal', 0, '#f4dd3f'], ['Effect', 1, '#ffa127'], ['Fusion', 5, '#ba17ef'],
  ['Ritual', 4, '#2a98ff'], ['Spell', 2, '#31f15a'], ['Trap', 3, '#ff79c8']];
const ATTRS = ['Light', 'Dark', 'Water', 'Fire', 'Earth', 'Wind', 'Divine'];
const RACES = ['Dragon', 'Zombie', 'Fiend', 'Pyro', 'Sea Serpent', 'Rock', 'Machine', 'Fish', 'Dinosaur', 'Insect', 'Beast',
  'Beast-Warrior', 'Plant', 'Aqua', 'Warrior', 'Winged Beast', 'Fairy', 'Spellcaster', 'Thunder', 'Reptile', 'Divine-Beast'];
const ICONS = ['Counter', 'Field', 'Equip', 'Continuous', 'Quick-Play', 'Ritual', 'Normal'];
// the Filters popup's rows, in order: [kind, title, key, options]
export const FILTER_ROWS = [['select', 'Attribute', 'attr', ATTRS.map((n, i) => [n, i])], ['select', 'Type', 'race', RACES.map((n, i) => [n, i])],
  ['select', 'Spell / Trap', 'icon', ICONS.map((n, i) => [n, i])], ['select', 'Level / Rank', 'level', Array.from({ length: 12 }, (_, i) => [`Level ${i + 1}`, i + 1])],
  ['range', 'ATK', 'atk'], ['range', 'DEF', 'def'], ['select', 'Limit', 'limit', [['Forbidden', 0], ['Limited', 1], ['Semi-limited', 2], ['Unlimited', 3]]],
  ['select', 'Sort by', 'sort', [['Name', 'name'], ['ATK, high to low', 'atk-'], ['ATK, low to high', 'atk+'], ['DEF, high to low', 'def-'], ['DEF, low to high', 'def+']]]];
