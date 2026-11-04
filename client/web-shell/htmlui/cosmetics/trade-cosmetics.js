// Cosmetics in Card Swap (the 2008 trade window, scene 0x26): an additive layer over the native trade. The engine (or
// screens/trade.js) still draws everything it drew; this adds, in the shop's own sprites (cosmetics/shopart.js):
//  - under each side's cards, that side's cosmetic lines: the item's real art (cosmetics/art.js) in its rarity frame,
//    the copies in the shop's digit font; a line that just changed gets the yellow corner brackets;
//  - in the band between the two areas, one line: what the trade holds, a change that reset both confirmations, a lock
//    (a side pressed Ready), a refusal (the partner's game can't show cosmetics, a spare gone);
//  - my Cosmetics button (shop_btn2) at the right of my row, which opens the picker over the trunk column: my spare
//    copies as the Avatar Parts rows (cyan = in my offer), "×N spare", and − / + for how many go in.
// Geometry and texts: cosmetics/trade-model.js. Data: cosmetics/trade-api.js (the server: game/trade-cosmetics.ts).
//
// The capability: once the panel is up over the trade window, it tells the server this game shows cosmetics (POST
// /panel on); the server refuses lines, and a commit with lines, unless both games did. It polls the
// trade's view every POLL_MS while up (the server keeps it in memory: no D1), and says off when it goes.
//
//   tradeOverlayFrame(snap, wait)  bridge.js, every frame: up with Card Swap's trade window (engine- or HTML-drawn), gone
//                                  after it; the windows in front of it (the trade question) cut holes in it
//   tradeGeometry(snap)            where it goes (pure)        _panel() / _reset()  tests: the live panel; forget it
import * as tradeApi from './trade-api.js';
import { injectTheme } from './theme.js';
import { injectShopSkin, digits } from './shopart.js';
import { renderItemArt } from './art.js';
import * as M from './trade-model.js';

export const POLL_MS = 1000, SAVE_MS = 350, ERROR_MS = 6000;
const TRADE = 'CWindowModelTrade', AREA = 'CWindowTaskCardArea';

const CSS = `
.de-tc { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; z-index: 5; }
.de-tc .tc-tile { position: absolute; width: ${M.TILE}px; height: ${M.TILE}px; }   /* no pointer: a card dropped there is the game's */
.de-tc .tc-tile > .de-rf { left: 0; top: 0; width: ${M.TILE}px; height: ${M.TILE}px; padding: 3px; }
.de-tc .tc-tile > .sa-brackets { left: -6px; top: -6px; width: ${M.TILE + 12}px; height: ${M.TILE + 12}px; }
/* the copies, the trunk's way: digits on the art's lower right corner */
.de-tc .tc-n { position: absolute; right: 1px; bottom: 1px; display: flex; align-items: flex-end; height: 14px; pointer-events: none; }
.de-tc .tc-n > .x { font: 11px/11px Arial, 'Liberation Sans', sans-serif; color: #000; text-shadow: 0 0 1px #fff, 0 0 1px #fff; margin-right: 1px; }
.de-tc .tc-btn { position: absolute; width: ${M.BUTTON.w}px; pointer-events: auto; }
.de-tc .tc-band { position: absolute; left: 8px; top: ${M.BAND.y}px; width: calc(var(--w, ${M.AREA_W}px) - 16px); height: ${M.BAND.h}px; display: flex; align-items: center;
  justify-content: center; text-align: center; padding: 0 14px; }
.de-tc .tc-band > span { overflow: hidden; text-overflow: ellipsis; }
.de-tcp { position: fixed; left: 0; top: 0; width: 1024px; height: 768px; transform-origin: 0 0; z-index: 2147482000; pointer-events: none; }
.de-tcp .tcp-win { position: absolute; left: ${M.PICKER.x}px; top: ${M.PICKER.y}px; width: ${M.PICKER.w}px; height: ${M.PICKER.h}px; pointer-events: auto;
  animation: tcp-fade .15s ease-out; }
/* an opaque well under the glass (the sprite is see-through: the trunk under it must not show) */
.de-tcp .tcp-win::before { content: ''; position: absolute; left: 4px; top: 4px; right: 4px; bottom: 4px; background: linear-gradient(#eef2f4, #d3dce1); }
.de-tcp .tcp-win > .sa-glass { left: 0; top: 0; width: ${M.PICKER.w}px; height: ${M.PICKER.h}px; }
.de-tcp .tcp-win > .sa-band { left: 7px; top: 4px; width: ${M.PICKER.w - 14}px; height: 88px; }
.de-tcp .tcp-hint { position: absolute; left: 12px; top: 13px; width: ${M.PICKER.w - 24}px; }
.de-tcp .tcp-hint > div { height: 18px; line-height: 18px; overflow: hidden; text-overflow: ellipsis; }
.de-tcp .tcp-win > .sa-title { left: -10px; top: 67px; width: 200px; }
.de-tcp .tcp-list { position: absolute; left: 12px; top: ${M.PICKER.top}px; width: 272px; height: ${M.PICKER.row * M.PICKER.rows}px; overflow-y: auto;
  overflow-x: hidden; scrollbar-width: thin; scrollbar-color: #8fa2ad rgba(0,0,0,.12); }
.de-tcp .tcp-row { position: relative; width: 264px; height: 40px; margin: 0 0 4px; }
.de-tcp .tcp-row > .de-rf { left: 6px; top: 5px; width: 30px; height: 30px; padding: 2px; }
.de-tcp .tcp-row > .nm { position: absolute; left: 44px; top: 4px; width: 118px; line-height: 16px; overflow: hidden; text-overflow: ellipsis; }
.de-tcp .tcp-row > .sp { position: absolute; left: 44px; top: 21px; width: 118px; line-height: 16px; color: #003c78; }
.de-tcp .tcp-row > .pm { position: absolute; top: 7px; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; padding: 0; }
.de-tcp .tcp-row > .pm.minus { left: 166px; } .de-tcp .tcp-row > .pm.plus { left: 230px; }
.de-tcp .tcp-row > .pm:disabled { opacity: .45; }
.de-tcp .tcp-row > .cnt { position: absolute; left: 194px; top: 13px; width: 34px; height: 14px; display: flex; justify-content: center; }
.de-tcp .tcp-empty { position: absolute; left: 0; top: 110px; width: 264px; text-align: center; white-space: normal; line-height: 18px; }
.de-tcp .tcp-foot { position: absolute; left: 12px; top: ${M.PICKER.top + M.PICKER.row * M.PICKER.rows + 8}px; width: 264px; height: 16px; text-align: center; }
.de-tcp .tcp-done { left: ${(M.PICKER.w - 110) / 2}px; top: ${M.PICKER.h - 50}px; width: 115px; }
@keyframes tcp-fade { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .de-tcp * { animation: none !important; } }
`;

const h = (tag, cls, props = {}, kids = []) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k === 'on') for (const [t, f] of Object.entries(v)) e.addEventListener(t, f);
    else if (k === 'style') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(kids)) if (c) e.append(c);
  return e;
};
const t16 = (text, extra = '') => h('span', 'sa-t' + extra, { text });

/** The panel of one trade: its three groups (the band at the trade window's origin, each side's strip at its area's). */
export class TradePanel {
  constructor({ api = tradeApi, now = () => Date.now(), poll = POLL_MS, save = SAVE_MS } = {}) {
    Object.assign(this, { api, now, pollMs: poll, saveMs: save });
    this.roots = {};          // kind ('trade' | 'mine' | 'partner') -> { root, layer }
    this.view = null; this.draft = null; this.sending = null; this.error = null; this.errorUntil = 0;
    this.seen = null; this.flash = { mine: new Set(), partner: new Set() }; this.flashUntil = 0; this.resetUntil = 0; this.changedUntil = 0;
    this.tiles = new Map();   // `${side}|${id}` -> { el, handle }
    this.picker = null; this.timer = null; this.saveTimer = null; this.live = false; this.gone = false; this.width = M.AREA_W;
  }
  attach(kind, root) {
    injectTheme(); injectShopSkin();
    if (!document.getElementById('de-trade-cos-css')) document.head.append(h('style', null, { id: 'de-trade-cos-css', text: CSS }));
    const cur = this.roots[kind];
    if (cur?.root === root) return;
    cur?.layer.remove();
    const layer = h('div', 'de-c de-tc', { 'data-side': kind });
    layer.style.setProperty('--w', this.width + 'px'); layer.dataset.w = this.width;
    root.append(layer);
    this.roots[kind] = { root, layer };
    for (const k of [...this.tiles.keys()]) if (k.startsWith(kind + '|')) { this.tiles.get(k).handle?.destroy(); this.tiles.delete(k); }
    if (kind === 'trade') layer.append(this.band = h('div', 'tc-band', { role: 'status', 'aria-live': 'polite' }, t16('')));
    if (kind === 'mine') layer.append(this.button = h('button', 'sa-btn2 tc-btn', { type: 'button', style: { left: M.BUTTON.x + 'px', top: M.BUTTON.y + 'px' },
      on: { click: () => this.togglePicker() } }, h('span', null, { text: 'Cosmetics' })));
      this.start();
    this.render();
  }
  detach(kind, root) {
    const cur = this.roots[kind];
    if (!cur || (root && cur.root !== root)) return;
    cur.layer.remove();
    delete this.roots[kind];
    for (const k of [...this.tiles.keys()]) if (k.startsWith(kind + '|')) { this.tiles.get(k).handle?.destroy(); this.tiles.delete(k); }
    if (kind === 'mine') this.closePicker();
    if (!this.ready()) this.stop();
  }
  ready() { return !!(this.roots.trade && this.roots.mine && this.roots.partner); }
  /** All three up: say so to the server (the capability), then poll. */
  start() {
    if (this.live || !this.ready()) return;
    this.live = true; this.gone = false;
    this.api.panel(true).then(v => this.take(v), e => this.fail(e));
    this.schedule();
  }
  stop() {
    if (!this.live) return;
    this.live = false;
    clearTimeout(this.timer); this.timer = null;
    clearTimeout(this.saveTimer); this.saveTimer = null;
    this.closePicker();
    if (this.view?.trading) this.api.panel(false).catch(() => {});
  }
  destroy() { for (const k of Object.keys(this.roots)) this.detach(k); this.stop(); this.gone = true; }
  schedule() {
    clearTimeout(this.timer);
    if (!this.live) return;
    this.timer = setTimeout(() => this.poll(), this.pollMs);
  }
  async poll() {
    if (!this.live) return;
    try {
      const v = await this.api.view();
      // a new trade with the panel still up, or the server forgot (a restart): register again
      if (v.trading && v.panel && !v.panel.me) this.take(await this.api.panel(true)); else this.take(v);
    } catch (e) { if (e?.error !== 'network') this.fail(e); }
    this.schedule();
  }
  /** A server view: what changed since the last one (the brackets, the reset line), then draw. */
  take(v) {
    if (!v) return;
    const prev = this.seen;
    if (prev && v.trading && v.rev !== prev.rev) {
      const theirs = M.changedIds(prev.theirs, v.theirs), mine = M.changedIds(prev.mine, v.mine);
      this.flash = { partner: theirs, mine };
      this.flashUntil = this.now() + M.FLASH_MS;
      if (v.changed?.reset) this.resetUntil = this.now() + M.FLASH_MS;
      if (v.changed?.by === 'partner') this.changedUntil = this.now() + M.FLASH_MS;
    }
    this.seen = v.trading ? { rev: v.rev, mine: v.mine, theirs: v.theirs } : prev;
    this.view = v;
    if (!v.trading || v.locked) this.closePicker();
    if (this.draft && !this.sending && !this.saveTimer && M.linesKey(this.draft) === M.linesKey(v.mine)) this.draft = null;
    this.render();
  }
  fail(e) {
    this.error = e?.message || 'Something went wrong. Please try again.';
    this.errorUntil = this.now() + ERROR_MS;
    this.render();
  }
  /** One press of + / − in the picker: the draft at once, saved shortly after (the last state wins). */
  step(id, delta) {
    if (!this.view?.trading || this.view.locked) return;
    const base = this.draft || (this.view.mine || []).map(l => ({ id: l.id, count: l.count }));
    this.draft = M.draftStep(base, id, delta, this.view.spares);
    this.error = null;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.save(); }, this.saveMs);
    this.render();
  }
  async save() {
    if (this.sending || !this.draft) return;
    const sent = this.draft;
    this.sending = sent;
    try { this.take(await this.api.setLines(sent)); }
    catch (e) { this.draft = null; this.fail(e); }
    finally {
      this.sending = null;
      if (this.draft && M.linesKey(this.draft) !== M.linesKey(sent)) this.save();
      else if (this.draft && this.view && M.linesKey(this.draft) === M.linesKey(this.view.mine)) this.draft = null;
      this.render();
    }
  }
  /** The areas' width (the trunk shown or put away). */
  setWidth(w) {
    if (w === this.width) return;
    this.width = w;
    for (const r of Object.values(this.roots)) { r.layer.style.setProperty('--w', w + 'px'); r.layer.dataset.w = w; }
    this.render();
  }
  togglePicker() { if (this.picker) this.closePicker(); else this.openPicker(); }

  // ---- drawing
  render() {
    if (this.gone) return;
    const v = this.view, now = this.now();
    if (now >= this.flashUntil) this.flash = { mine: new Set(), partner: new Set() };
    if (now >= this.errorUntil) this.error = null;
    if (this.band) {
      const b = M.bandOf(v, { error: this.error, resetUntil: this.resetUntil, changedUntil: this.changedUntil, now });
      const plate = b.tone !== 'info' && b.tone !== 'done';
      this.band.className = 'tc-band' + (plate ? ' sa-plate' : '');
      this.band.dataset.tone = b.tone;
      this.band.toggleAttribute('data-on', b.tone === 'reset');
      this.band.toggleAttribute('data-hi', b.tone === 'changed');
      this.band.toggleAttribute('hidden', !b.text);
      this.band.firstChild.className = 'sa-t' + (plate ? '' : ' sa-w');
      this.band.firstChild.textContent = b.text;
      this.band.title = b.text;
    }
    const lines = { partner: v?.trading ? v.theirs : [], mine: v?.trading ? (this.draft ? M.draftLines(this.draft, v) : v.mine) : [] };
    for (const side of ['partner', 'mine']) this.renderStrip(side, M.stripTiles(lines[side], side, this.flash[side], this.width));
    if (this.button) this.button.style.left = M.BUTTON.x + this.width - M.AREA_W + 'px';
    if (this.button) {
      const bt = M.buttonOf(v, this.draft || v?.mine);
      this.button.disabled = bt.disabled && !this.picker;
      this.button.title = bt.title;
      this.button.firstChild.textContent = this.picker ? 'Done' : bt.label;
      this.button.toggleAttribute('hidden', !v?.trading);
    }
    if (this.picker) this.renderPicker();
  }
  renderStrip(side, tiles) {
    const r = this.roots[side];
    if (!r) return;
    const keep = new Set(tiles.map(t => `${side}|${t.id}`));
    for (const [k, a] of this.tiles) if (k.startsWith(side + '|') && !keep.has(k)) { a.handle?.destroy(); a.el.remove(); this.tiles.delete(k); }
    for (const t of tiles) {
      const k = `${side}|${t.id}`;
      let a = this.tiles.get(k);
      if (!a) {
        const art = h('div', 'art'), rf = h('div', 'de-rf', {}, h('div', 'well', {}, art));
        const el = h('div', 'tc-tile', { 'data-id': t.id, role: 'img' }, [rf, h('div', 'tc-n')]);
        a = { el, rf, art, handle: renderItemArt(art, t.item || { id: t.id }, { body: this.view?.body || 'male', size: M.TILE - 8 }), count: -1, flash: null };
        this.tiles.set(k, a);
        r.layer.append(el);
      }
      Object.assign(a.el.style, { left: t.x + 'px', top: t.y + 'px' });
      a.rf.dataset.rarity = t.rarity;
      a.el.title = t.title;
      a.el.setAttribute('aria-label', `${side === 'mine' ? 'You give' : 'Your partner gives'} ${t.title}`);
      a.el.dataset.count = t.count;
      if (a.count !== t.count) {
        a.count = t.count;
        a.el.querySelector('.tc-n').replaceChildren(h('span', 'x', { text: '×' }), digits(String(t.count)));
      }
      if (t.flash && !a.flash) a.el.append(a.flash = h('div', 'sa-brackets'));
      else if (!t.flash && a.flash) { a.flash.remove(); a.flash = null; }
    }
  }

  // ---- the picker: my spare copies, over the trunk column
  openPicker() {
    if (this.picker || !this.view?.trading || this.view.locked) return;
    const stage = h('div', 'de-c de-tcp', { role: 'dialog', 'aria-label': 'Your spare cosmetics' });
    const win = h('div', 'tcp-win');
    const list = h('div', 'yo2-scroll-list tcp-list', { role: 'list' });
    const foot = h('div', 'tcp-foot sa-t');
    win.append(h('div', 'sa-glass'), h('div', 'sa-band'),
      h('div', 'tcp-hint sa-t sa-w', {}, [h('div', null, { text: 'Your spare copies: only spares trade.' }), h('div', null, { text: '+ adds one to your side of the trade.' })]),
      h('div', 'sa-title', { text: 'Cosmetics' }), list, foot,
      h('button', 'sa-btn2 tcp-done', { type: 'button', on: { click: () => this.closePicker() } }, h('span', null, { text: 'Done' })));
    stage.append(win);
    document.body.append(stage);
    const canvas = document.getElementById('canvas');
    const place = () => {
      const r = canvas?.getBoundingClientRect(), s = r?.width ? r.width / 1024 : Math.min(innerWidth / 1024, innerHeight / 768);
      Object.assign(stage.style, { left: (r?.width ? r.left : (innerWidth - 1024 * s) / 2) + 'px', top: (r?.width ? r.top : (innerHeight - 768 * s) / 2) + 'px', transform: `scale(${s})` });
    };
    place();
    const ro = canvas && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    ro?.observe(canvas);
    addEventListener('resize', place);
    // keys stay with the picker (SDL listens on window): Esc closes it
    const keys = e => { e.stopPropagation(); if (e.type === 'keydown' && e.key === 'Escape') { e.preventDefault(); this.closePicker(); } };
    for (const t of ['keydown', 'keyup', 'keypress']) win.addEventListener(t, keys);
    win.addEventListener('wheel', e => e.stopPropagation());
    this.picker = { stage, list, foot, rows: new Map(), close: () => { ro?.disconnect(); removeEventListener('resize', place); } };
    this.render();
  }
  closePicker() {
    const p = this.picker;
    if (!p) return;
    this.picker = null;
    p.close();
    for (const r of p.rows.values()) r.handle?.destroy();
    p.stage.remove();
    if (this.button) this.render();
  }
  renderPicker() {
    const p = this.picker, rows = M.pickerRows(this.view, this.draft || this.view?.mine);
    if (!rows.length) {
      if (!p.list.querySelector('.tcp-empty')) p.list.replaceChildren(h('div', 'tcp-empty sa-t', {}, [h('div', null, { text: 'You have no spare copies.' }),
        h('div', null, { text: 'A second copy from a box is a spare.' })]));
    } else {
      p.list.querySelector('.tcp-empty')?.remove();
      const keep = new Set(rows.map(r => r.id));
      for (const [id, r] of p.rows) if (!keep.has(id)) { r.handle?.destroy(); r.el.remove(); p.rows.delete(id); }
      rows.forEach((r, i) => {
        let a = p.rows.get(r.id);
        if (!a) {
          const art = h('div', 'art'), rf = h('div', 'de-rf', {}, h('div', 'well', {}, art));
          const minus = h('button', 'sa-plate pm minus', { type: 'button', 'aria-label': `One fewer ${r.name}`, on: { click: () => this.step(r.id, -1) } }, t16('−'));
          const plus = h('button', 'sa-plate pm plus', { type: 'button', 'aria-label': `One more ${r.name}`, on: { click: () => this.step(r.id, 1) } }, t16('+'));
          const el = h('div', 'sa-row tcp-row', { role: 'listitem', 'data-id': r.id }, [rf, h('span', 'sa-t nm'), h('span', 'sa-t sp'), minus, h('div', 'cnt'), plus]);
          a = { el, rf, minus, plus, handle: renderItemArt(art, r.item, { body: this.view?.body || 'male', size: 26 }), n: -1 };
          p.rows.set(r.id, a);
        }
        if (p.list.children[i] !== a.el) p.list.insertBefore(a.el, p.list.children[i] || null);
        a.rf.dataset.rarity = r.rarity;
        a.el.toggleAttribute('data-on', r.offered > 0);
        a.el.title = r.name;
        a.el.querySelector('.nm').textContent = r.name;
        a.el.querySelector('.sp').textContent = `×${r.spare} spare`;
        a.minus.disabled = !r.canRemove; a.plus.disabled = !r.canAdd;
        if (a.n !== r.offered) { a.n = r.offered; a.el.querySelector('.cnt').replaceChildren(digits(String(r.offered))); }
      });
    }
    const n = (this.draft || this.view?.mine || []).length;
    p.foot.textContent = this.sending || this.saveTimer ? 'Saving…' : `${n} of ${M.MAX_LINES} items in your offer`;
  }
}

// ---- the overlay: every frame (the bridge's, bridge.js), whoever draws the trade window, the engine or a screen
// module. Its own stage over the canvas (as the Wardrobe's), one group per window at the window's origin; the windows
// in front of the trade window (the trade question, the end box) cut holes in it, as the bridge's roots get.
const EXEMPT = new Set([TRADE, AREA, 'CWindowModelKaban', 'CWindowModelDeck', 'CCardDetailViewDlg', 'CChatWindow', 'CWindowModelMenu',
  'CWindowModelPlace', 'CDeckCardLoader', 'CMainMenu']);
export const CARD_SWAP = 0x26;
const ahead = (o, j, w, i) => o.z !== w.z ? o.z > w.z : o.wz && w.wz && o.wz !== w.wz ? o.wz > w.wz : j > i;   // bridge.js drawOrder's rule
/** The trade overlay's geometry in a snapshot: the trade window's origin, the partner's and my area's, and the rects of
 *  the windows in front of it (game px), or null when Card Swap's trade window is not up. */
export function tradeGeometry(snap) {
  if (!snap || snap.scene !== CARD_SWAP) return null;
  const i = snap.windows.findIndex(w => w.cls === TRADE && w.shown);
  if (i < 0) return null;
  const w = snap.windows[i], area = m => snap.windows.find(a => a.cls === AREA && a.mode === m && a.shown);
  // the 2008 layout (read/trade.js): the panel at (248, 0), its areas there and 320 below; the reader's own rects when
  // its extension is loaded (without it the models read (0, 0): they lay out in screen pixels)
  const o = w.x || w.y ? { x: w.x, y: w.y } : { x: 248, y: 0 };
  const at = (m, dy) => { const a = area(m); return a && (a.x || a.y) ? { x: a.x, y: a.y } : { x: o.x, y: o.y + dy }; };
  // the areas' width: their well (`drawn`, 8 px in on each side) is 472 beside the trunk, 760 once the game puts the
  // trunk away (the trade question); the trunk window itself stays "shown" either way
  const well = snap.windows.find(a => a.cls === AREA && a.shown && a.drawn?.w)?.drawn.w;
  const holes = snap.windows.filter((o, j) => o !== w && o.shown && !EXEMPT.has(o.cls) && ahead(o, j, w, i))
    .map(o => o.drawn || o).filter(o => o && o.w > 0 && o.h > 0).map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h }));
  return { trade: o, partner: at(2, 0), mine: at(1, 320), width: well > M.AREA_W ? well + 16 : M.AREA_W, holes };
}
const holePath = hs => hs.length ? `path(evenodd, "M0 0h1024v768h-1024z${hs.map(o => `M${o.x} ${o.y}h${o.w}v${o.h}h${-o.w}z`).join('')}")` : '';

let panel = null, stage = null;
export const _panel = () => panel;
export function _reset() { panel?.destroy(); panel = null; stage?.el.remove(); stage = null; }
function makeStage() {
  const el = h('div', 'de-c de-tcs', { style: { position: 'fixed', left: '0', top: '0', width: '1024px', height: '768px', transformOrigin: '0 0',
    zIndex: '2147481000', pointerEvents: 'none' } });
  const groups = Object.fromEntries(['trade', 'partner', 'mine'].map(k => [k, h('div', null, { style: { position: 'absolute', left: '0', top: '0' } })]));
  el.append(groups.trade, groups.partner, groups.mine);
  document.body.append(el);
  const canvas = document.getElementById('canvas');
  const place = () => {
    const r = canvas?.getBoundingClientRect(), s = r?.width ? r.width / 1024 : 1;
    Object.assign(el.style, { left: (r?.left || 0) + 'px', top: (r?.top || 0) + 'px', transform: `scale(${s})` });
  };
  place();
  const ro = canvas && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
  ro?.observe(canvas);
  addEventListener('resize', place);
  // a press that ends on the panel's button must still end in the game (a card drag released there)
  el.addEventListener('mouseup', e => { if (e.target !== canvas) canvas?.dispatchEvent(new MouseEvent('mouseup', e)); });
  return { el, groups, key: '', n: 0, place, close() { ro?.disconnect(); removeEventListener('resize', place); el.remove(); } };
}
/** bridge.js calls this every frame with the snapshot (`wait`: a scene is loading, no HTML shows): the panel comes up
 *  with Card Swap's trade window and goes with it. Cheap when nothing changed (one find, one string compare). */
export function tradeOverlayFrame(snap, wait = false, opts = {}) {
  const g = wait ? null : tradeGeometry(snap);
  if (!g) {
    if (panel) { panel.destroy(); panel = null; }
    if (stage) { stage.close(); stage = null; }
    return;
  }
  if (!stage) {
    stage = makeStage();
    panel = new TradePanel(opts);
    for (const k of ['trade', 'partner', 'mine']) panel.attach(k, stage.groups[k]);
  }
  if (++stage.n % 30 === 0) stage.place();   // the canvas can move without resizing (the page's letterbox)
  const key = JSON.stringify(g);
  if (key === stage.key) return;
  stage.key = key;
  for (const k of ['trade', 'partner', 'mine']) Object.assign(stage.groups[k].style, { left: g[k].x + 'px', top: g[k].y + 'px' });
  panel.setWidth(g.width);
  stage.el.style.clipPath = holePath(g.holes);
}
