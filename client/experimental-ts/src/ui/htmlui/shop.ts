// The card shop through main's screens/shop.js (the CShop* tasks: read/shop.js's rects and fields, CONTRACT.md's parts):
// the rewrite builds each task's sprite / label / swf tree as the engine lays it out (yo2shopEntry.cpp, main's captures
// mock/shop-menu.json, shop-packs.json, shop-cards.json, shop-avatar.json, shop-confirm.json; flip.mjs shop-menu,
// shop-packs, shop-confirm), filled from the rewrite's catalogue, wallet and cart. main's module draws what it has a
// recipe for (panels, plates, tags, arrows, the swf buttons, every text) and leaves holes where the engine draws a
// picture; the rewrite draws those pictures itself (pictures.ts: the backdrop, the clerk, the player's waist-up portrait,
// the category banners, pack art, card faces). Pure: no DOM here.
import type { ShopItem, ShopView } from '../contracts';
import { WindowBuilder } from './snapshot';
import type { ControlHandlers, HtmlControl, Ids, WindowSpec } from './snapshot';
import type { Picture } from './pictures';

export type ShopPage = 'menu' | 'cards' | 'packs' | 'avatar';
/** The shop's own state between snapshots (what the CShop* tasks keep). One product in the cart, with its count. */
export interface ShopLocal { page: ShopPage; index: number; cart: { itemId: number; count: number } | null; confirm: boolean;
  /** The product the pointer is over (the title band shows its description). */
  over: number | null;
  /** What the clerk says (a refusal, the server's error), until the next action. */
  say: string }
export const shopLocal = (): ShopLocal => ({ page: 'menu', index: 0, cart: null, confirm: false, over: null, say: '' });

export interface ShopDeps {
  shop: ShopView; ui: ShopLocal; ids: Ids; busy: boolean;
  /** 0 Domino (shopbg_d, Grandpa), 1 Academia (shopbg_a, the clerk of Beginner's Lobby A). */
  world: 0 | 1;
  /** The canvas key of the player's composed waist-up portrait (pictures.ts), if the avatar is known. */
  portrait: string | null;
  name(item: ShopItem): string;
  rerender(): void;
  buy(itemId: number, count: number): void;
  exit(): void;
  /** The rewrite's own cosmetic departments (boxes, wardrobe), when online. */
  cosmetics?: () => void;
  /** A refusal or the server's error: the clerk says it. */
  error?: string;
}

/** Where a product is sold: main's three windows (singles, packs and decks, avatar parts). */
export const pageOf = (item: ShopItem): Exclude<ShopPage, 'menu'> => item.category === 'singles' ? 'cards' : item.category === 'accessories' ? 'avatar' : 'packs';
const PER_PAGE: Record<Exclude<ShopPage, 'menu'>, number> = { cards: 10, packs: 10, avatar: 7 };
/** Starter MP is spent first: while any is left, what the player buys comes soul-bound (main's no-trade mark). */
export const boundMp = (shop: Pick<ShopView, 'mp' | 'earnedMp'>): number | null => shop.earnedMp === undefined ? null : Math.max(0, shop.mp - shop.earnedMp);
// the engine's text tags (AtConverter): a product's own '@' is not one
const plain = (s: string) => s.replace(/@/g, '＠');

// ---------------------------------------------------------------- the engine's pieces
type Sprite = Record<string, unknown> & { id: number; tex: string; src: number[]; wx: number; wy: number; wz: number; shown: boolean };
class Tree {
  sprites: Sprite[] = []; labels: Record<string, unknown>[] = []; swfs: Record<string, unknown>[] = [];
  constructor(private b: WindowBuilder, private ids: Ids) {}
  sprite(key: string, tex: string, src: number[], wx: number, wy: number, wz: number, extra: Record<string, unknown> = {}): Sprite {
    const s: Sprite = { id: this.ids.of(`${this.b.key}/s:${key}`), name: key, tex, src, x: 0, y: 0, z: 0, wx, wy, wz, a: 1, sx: 1, sy: 1, rgba: [1, 1, 1, 1], col: [1, 1, 1, 1], shown: true, ...extra };
    this.sprites.push(s); return s;
  }
  swf(key: string, wx: number, wy: number, wz: number): void { this.swfs.push({ id: this.ids.of(`${this.b.key}/f:${key}`), name: key, x: wx, y: Math.floor(wy), z: wz, wx, wy, wz, a: 1, shown: true }); }
  parts() { return { sprites: this.sprites, labels: this.labels, swfs: this.swfs }; }
}
const label = (ids: Ids, key: string, text: string, wx: number, wy: number, wz: number) => ({ id: ids.of(key), name: 'CWindowTaskTextのテキスト', text, x: 0, y: 0, z: 0, wx, wy, wz, a: 1, shown: true });
/** A CWindowTaskShadowText: the control and its white text half (its shadow half hidden, as the engine leaves it). */
function shadowText(b: WindowBuilder, ids: Ids, key: string, wx: number, wy: number, w: number, h: number, text: string, wz: number, o: { align?: number; fontSize?: number } = {}): HtmlControl {
  const t = { align: o.align ?? 1, fontSize: o.fontSize ?? 16, lineGap: 0, firstLine: 0, pageLines: 100, color: [1, 1, 1, 1] };
  const parent = b.add('CWindowTaskShadowText', `${key}`, { x: wx - b.win.x, y: wy - b.win.y, w, h }, { ...t, text, wx: 0, wy: 0, wz, name: key });
  b.add('CWindowTaskText', `${key}:text`, { x: wx - b.win.x, y: wy - b.win.y, w, h }, { ...t, text, parent: parent.id, wx, wy, wz: wz + 1, name: 'CWindowTaskShadowTextのテキスト',
    parts: { sprites: [], labels: [label(ids, `${b.key}/${key}:l`, text, wx, wy, wz + 1)], swfs: [] } });
  return parent;
}
/** A plain CWindowTaskText at a world place. */
function text(b: WindowBuilder, ids: Ids, key: string, wx: number, wy: number, w: number, h: number, value: string, wz: number, o: { align?: number; fontSize?: number } = {}): HtmlControl {
  return b.add('CWindowTaskText', key, { x: wx - b.win.x, y: wy - b.win.y, w, h }, { text: value, align: o.align ?? 0, fontSize: o.fontSize ?? 16, lineGap: 0, firstLine: 0, pageLines: 100,
    color: [1, 1, 1, 1], wx, wy, wz, name: 'noname', parts: { sprites: [], labels: value ? [label(ids, `${b.key}/${key}:l`, value, wx, wy, wz)] : [], swfs: [] } });
}
/** A CWindowTaskPictureSwitch: its four looks, the sprite of the current one shown (applyPointer swaps them; the same
 * objects are its parts, so main's module and the pictures window both see the swap). `hit`: its clickable box. */
function pictureSwitch(b: WindowBuilder, ids: Ids, key: string, looks: [string, string, string, string], src: number[], wx: number, wy: number, wz: number,
  hit: { x: number; y: number; w: number; h: number }, state: { checked?: boolean; disabled?: boolean; shown?: boolean }, handlers: ControlHandlers): HtmlControl {
  const names = ['normal', 'hover', 'pressed', 'checked'] as const;
  const look = state.checked ? 3 : 0;
  const art = Object.fromEntries(names.map((n, i) => [n, { id: ids.of(`${b.key}/${key}:${n}`), name: n, tex: looks[i], src, x: 0, y: 0, z: 0, wx, wy, wz, a: 1, sx: 1, sy: 1,
    rgba: [1, 1, 1, 1], col: [1, 1, 1, 1], shown: i === look }]));
  const c = b.add('CWindowTaskPictureSwitch', key, { x: hit.x - b.win.x, y: hit.y - b.win.y, w: hit.w, h: hit.h },
    { label: '', state: state.disabled ? 'disabled' : 'normal', checked: !!state.checked, shown: state.shown ?? true, enabled: !state.disabled, wx, wy, wz, art, parts: { sprites: Object.values(art), labels: [], swfs: [] } });
  b.on(c, handlers);
  return c;
}
/** A swf button's hit box (the shop's pills: the swf tracks the mouse itself, read/shop.js `mouse`): 223 x 50 at its place. */
function pill(b: WindowBuilder, tree: Tree, key: string, wx: number, wy: number, wz: number, label: string, handlers: ControlHandlers): void {
  tree.swf(key, wx, wy, wz);
  b.add('CWindowTaskSwfHit', key, { x: wx - b.win.x, y: Math.floor(wy) - b.win.y, w: 223, h: 50 }, { mouseAt: [wx + 111, wy + 25], label, parts: undefined }, { hover: true, ...handlers });
}

// ---------------------------------------------------------------- the windows
const PANEL = 'data/shop/shop_win_01_c01.png', BAND = 'data/shop/shop_win_00_01c.png', SEIGEN = 'data/shop/icon_seigen_01.png';
const INTRO = (n: number) => `data/shop/shop_Introduction_0${n}_?.png`;
// the category banners (mock/shop-menu.json): Single Cards, Booster Packs, Avatar Parts (the world's: domino / akademia)
const CATEGORIES = (world: 0 | 1): [Exclude<ShopPage, 'menu'>, string][] => [['cards', 'card'], ['packs', 'pack'], ['avatar', world ? 'akademia_avatar' : 'domino_avatar']];
const LABELS: Record<Exclude<ShopPage, 'menu'>, string> = { cards: 'Single Cards', packs: 'Booster Packs', avatar: 'Avatar Parts' };

interface Built { specs: WindowSpec[]; pics: Picture[] }

/** The shop scene's windows, back to front: the pictures, the task windows, the price plates, the mileage plate, the
 * confirm window and the clerk's balloon. */
export function shopWindows(d: ShopDeps): WindowSpec[] {
  const { shop, ui } = d, out: Built = { specs: [], pics: [] };
  const bound = boundMp(shop), items = shop.items, cart = ui.cart && items.find(i => i.id === ui.cart!.itemId) || null;
  if (ui.cart && !cart) ui.cart = null;
  const total = cart ? cart.price * ui.cart!.count : 0;
  const idle = () => !d.busy && !shop.loading;
  const go = (page: ShopPage) => { ui.page = page; ui.index = 0; ui.cart = null; ui.confirm = false; ui.over = null; ui.say = ''; d.rerender(); };
  // the backdrop (shopbg_?_01, 512 x 384 at 2x), the player's portrait (the duel's place and scale, mirrored: duel-scene.ts
  // PORTRAIT_PLACE), the clerk (data/avatar/npc a02 / d02 at 500, 31: matched against main's capture)
  out.pics.push({ key: 'bg', source: { archive: `data/shop/shopbg_${d.world ? 'a' : 'd'}_01.png` }, x: 0, y: 0, w: 1024, h: 768, z: 0, shown: true });
  if (d.portrait) out.pics.push({ key: 'portrait', source: { canvas: d.portrait }, x: -230, y: 26, w: 768 * 0.9, h: 768 * 0.9, z: 1, flip: true, shown: true });
  out.pics.push({ key: 'clerk', source: { canvas: `clerk:${d.world ? 'a02' : 'd02'}` }, x: 500, y: 31, w: 768, h: 768, z: 2, shown: true });

  if (ui.page === 'menu') menu(d, out, go, bound);
  else items_(d, out, ui.page, go, bound, total, cart, idle);
  out.specs.push(mileage(d, total, ui.page !== 'menu'));
  if (ui.confirm && cart) out.specs.push(confirmWindow(d, cart, total, idle));
  const says = ui.confirm && cart ? `That will be ${total}MP.\nIs that OK?${bound ? '\n(Starter MP pays first: these cards are soul-bound.)' : ''}` : ui.say || d.error || '';
  if (says) out.specs.push(balloon(d, says));
  // every picture the windows leave to the engine (pictures.ts), from the same sprite objects
  for (const spec of out.specs) collect(spec, out.pics);
  return [picturesWindow(d, out.pics), ...out.specs];
}

function picturesWindow(d: ShopDeps, pics: Picture[]): WindowSpec {
  const b = new WindowBuilder(d.ids, 'shop-pictures', 'CEnginePictures', { x: 0, y: 0, w: 1024, h: 768 }, { z: -1, pics });
  return b.spec();
}
// a sprite main's module doesn't draw (shop.js mine(): no recipe, not a text or swf): a picture of the engine's
const SHOP_DRAWN = /^data\/shop\/(shop_win_|shop_introduction_|shop_money_|icon_seigen_|shop_pricetag_|shop_avatar_0|shop_arrow_|shop_btn2_|scroll)/i;
function collect(spec: WindowSpec, pics: Picture[]): void {
  const take = (s: Sprite, owner: string) => {
    if (!s.tex || SHOP_DRAWN.test(s.tex) || /^data\/common\//i.test(s.tex)) return;
    const card = /^data\/CARD\/(\d+)\.png$/i.exec(s.tex);
    const sx = Number(s.sx ?? 1), sy = Number(s.sy ?? 1), src = s.src as [number, number, number, number];
    const pic = { key: `${owner}:${s.id}`, source: card ? { card: Number(card[1]) } : { archive: s.tex.replace('?', 'e') }, x: s.wx, y: s.wy, w: src[2] * sx, h: src[3] * sy, z: s.wz,
      ...(card ? {} : { crop: src }) } as Omit<Picture, 'shown'>;
    // shown as the sprite is when the layer draws (its pointer looks swap a switch's sprites after this is built)
    pics.push(Object.defineProperty(pic, 'shown', { get: () => s.shown, enumerable: true }) as Picture);
  };
  const w = spec.win as { parts?: { sprites: Sprite[] } };
  for (const s of w.parts?.sprites ?? []) take(s, spec.win.cls);
  for (const c of spec.win.controls) for (const s of (c.parts as { sprites?: Sprite[] } | undefined)?.sprites ?? []) take(s, spec.win.cls);
}

// CShopCategoryWindow (onInit 0x00ae61c0; mock/shop-menu.json): the panel, the Item Selection banner, three banners
// (picture switches, 319, 125 + 141 i), Exit Store (the swf at 795, 540 and its ShadowText at 807, 556). The rewrite's
// cosmetic departments: a pill where the item windows have Confirm (795, 480). The wallet's two parts under the plate.
function menu(d: ShopDeps, out: Built, go: (p: ShopPage) => void, bound: number | null): void {
  const b = new WindowBuilder(d.ids, 'shop-category', 'CShopCategoryWindow', { x: 270, y: 70, w: 754, h: 530 }, { z: 1011, chosen: -1, mouse: null }), tree = new Tree(b, d.ids);
  tree.sprite('panel', PANEL, [0, 0, 512, 512], 280, 84, 1011);
  tree.sprite('intro', INTRO(1), [0, 0, 256, 64], 270, 70, 1013);
  CATEGORIES(d.world).forEach(([page, art], i) => {
    const y = 125 + 141 * i, looks = [1, 2, 3, 2].map(n => `data/shop/shop_${art}_0${n}_c01.png`) as [string, string, string, string];
    pictureSwitch(b, d.ids, `cat:${page}`, looks, [0, 0, 512, 256], 319, y, 1018, { x: 319 + 24, y: y + 29, w: 376, h: 112 }, {}, { key: `shop-category:${page}`, label: LABELS[page], click: () => go(page) });
  });
  pill(b, tree, 'exit', 795, 540.5, 1016, 'Exit Store', { key: 'shop-exit', click: () => d.exit() });
  shadowText(b, d.ids, 'exitText', 807, 556, 200, 16, 'Exit Store', 1017);
  if (d.cosmetics) {
    const open = d.cosmetics;
    pill(b, tree, 'cosmetics', 795, 480.5, 1016, 'Cosmetics', { key: 'shop-cosmetics', click: () => open() });
    shadowText(b, d.ids, 'cosmeticsText', 807, 496, 200, 16, 'Cosmetics', 1017);
  }
  (b.win as Record<string, unknown>).parts = tree.parts();
  out.specs.push(b.spec());
}

// CShopCardWindow / PackWindow / AvatarWindow (0x00aedd70 / 0x00af2040 / 0x00af75a0): the panel, banner 02 / 04 / 03,
// the title band (280, 3) and its text (288, 8: the product's description), Confirm (795, 480) and Back (795, 540), the
// page arrows (774, 332 and 264, 326); cards and packs ten a page in price plates (CShopPricePlate, 289 + 99 col,
// 70 + 234 row), the pack art (data/cardpack, 299 + 99 col, 114 + 234 row, 0.4) or the card face (holes at 301 + 98 col,
// 140 + 240 row, 80 x 116), the no-trade mark (365 + 99 col, 280 + 234 row); avatar parts seven rows (328, 194 + 49 i).
function items_(d: ShopDeps, out: Built, page: Exclude<ShopPage, 'menu'>, go: (p: ShopPage) => void, bound: number | null, total: number, cart: ShopItem | null, idle: () => boolean): void {
  const { shop, ui } = d, list = shop.items.filter(i => pageOf(i) === page), per = PER_PAGE[page];
  const pages = Math.max(1, Math.ceil(list.length / per)); ui.index = Math.max(0, Math.min(pages - 1, ui.index));
  const shown = list.slice(ui.index * per, ui.index * per + per);
  const cls = { cards: 'CShopCardWindow', packs: 'CShopPackWindow', avatar: 'CShopAvatarWindow' }[page];
  const b = new WindowBuilder(d.ids, `shop-${page}`, cls, { x: 264, y: 0, w: 760, h: 600 }, { z: 1011, page: ui.index, maxPage: pages, mouse: null,
    // the packs' ids in the window's order (read/shop.js packs): main's screens/pack-contents.js hotspots open what a pack holds from its art
    ...(page === 'packs' ? { packs: list.map(i => i.packId ?? null) } : {}) }), tree = new Tree(b, d.ids);
  tree.sprite('panel', PANEL, [0, 0, 512, 512], 280, 84, 1011);
  tree.sprite('intro', INTRO({ cards: 2, packs: 4, avatar: 3 }[page]), [0, 0, 256, 64], 270, 70, 1014);
  tree.sprite('band', BAND, [0, 0, 512, 128], 280, 3, 1012);
  const pick = (item: ShopItem) => {
    if (!idle()) return;
    ui.confirm = false;
    const count = ui.cart?.itemId === item.id ? ui.cart.count + 1 : 1;
    if (item.owned) ui.say = 'You already own this.';
    else if (count > 50) ui.say = 'Choose a quantity from 1 to 50.';
    else if (item.price * count > shop.mp) ui.say = `Not enough MP: ${count} × ${item.price.toLocaleString('en-US')} MP is ${(item.price * count).toLocaleString('en-US')} MP and you have ${shop.mp.toLocaleString('en-US')} MP.`;
    else { ui.cart = { itemId: item.id, count }; ui.say = ''; }
    d.rerender();
  };
  const over = (item: ShopItem) => (on: boolean) => { const next = on ? item.id : ui.over === item.id ? null : ui.over; if (next !== ui.over) { ui.over = next; d.rerender(); } };
  const described = shown.find(i => i.id === ui.over) ?? cart ?? shown[0];
  shadowText(b, d.ids, 'band', 288, 8, 496, 128, described?.description ? plain(described.description) : described ? plain(d.name(described)) : '', 1013, { align: 0 });
  if (page === 'avatar') shown.forEach((item, i) => {
    const y = 194 + 49 * i, owned = !!item.owned, chosen = ui.cart?.itemId === item.id;
    const looks = owned ? Array(4).fill('data/shop/shop_avatar_04_c01.png') as [string, string, string, string]
      : ['data/shop/shop_avatar_01_c01.png', 'data/shop/shop_avatar_03_c01.png', 'data/shop/shop_avatar_03_c01.png', 'data/shop/shop_avatar_02_c01.png'] as [string, string, string, string];
    pictureSwitch(b, d.ids, `row:${item.id}`, looks, [0, 0, 512, 64], 328, y, 1018, { x: 328, y, w: 400, h: 40 }, { checked: chosen, disabled: owned },
      { key: `shop-item:${item.id}`, label: `${d.name(item)}, ${item.price} MP${owned ? ', owned' : ''}`, click: () => pick(item), pointer: over(item), area: true });
    text(b, d.ids, `rowText:${item.id}`, 336, y + 12, 400, 16, `${plain(d.name(item))}${chosen && ui.cart!.count > 1 ? ` x${ui.cart!.count}` : ''}@>330/${item.price}MP`, 1019);
  });
  else shown.forEach((item, i) => {
    const col = i % 5, row = Math.floor(i / 5);
    out.specs.push(pricePlate(d, page, item, 289 + 99 * col + (page === 'cards' ? 1 : 0), 70 + 234 * row, ui.cart?.itemId === item.id ? ui.cart.count : 0, pick, over(item)));
    if (bound) tree.sprite(`seigen:${item.id}`, SEIGEN, [0, 0, 16, 16], 365 + 99 * col, 280 + 234 * row, page === 'cards' ? 1023 : 1022);
    if (page === 'packs' && item.imagePath) tree.sprite(`pack:${item.id}`, item.imagePath, [0, 0, 200, 400], 299 + 99 * col, 114 + 234 * row, 1019, { sx: 0.4, sy: 0.4 });
    if (page === 'cards' && item.card?.passcode) tree.sprite(`card:${item.id}`, `data/CARD/${item.card.passcode}.png`, [0, 0, 200, 290], 301 + 98 * col, 140 + 240 * row, 1020, { sx: 0.4, sy: 0.4 });
  });
  // the card faces are drawn each frame, not elements (read/shop.js cardHoles): holes, window-local
  if (page === 'cards') (b.win as Record<string, unknown>).holes = shown.map((_, i) => ({ x: 301 + 98 * (i % 5) - 264, y: 140 + 240 * Math.floor(i / 5), w: 80, h: 116 }));
  pill(b, tree, 'confirm', 795, 480.5, 1017, 'Confirm', { key: 'shop-confirm', click: () => { if (!cart || !idle()) return; ui.confirm = true; ui.say = ''; d.rerender(); } });
  pill(b, tree, 'back', 795, 540.5, 1017, 'Back', { key: 'shop-back', click: () => go('menu') });
  shadowText(b, d.ids, 'confirmText', 807, 496, 200, 16, 'Confirm', 1018);
  shadowText(b, d.ids, 'backText', 807, 556, 200, 16, 'Back', 1018);
  const turn = (by: number) => () => { ui.index += by; ui.over = null; d.rerender(); };
  pictureSwitch(b, d.ids, 'prev', ['data/shop/shop_arrow_10_c01.png', 'data/shop/shop_arrow_11_c01.png', 'data/shop/shop_arrow_12_c01.png', 'data/shop/shop_arrow_12_c01.png'], [0, 0, 32, 64], 264, 326, 1021,
    { x: 264, y: 326, w: 32, h: 64 }, { shown: ui.index > 0 }, { key: 'shop-prev', label: 'Previous page', click: turn(-1) });
  pictureSwitch(b, d.ids, 'next', ['data/shop/shop_arrow_04_c01.png', 'data/shop/shop_arrow_05_c01.png', 'data/shop/shop_arrow_06_c01.png', 'data/shop/shop_arrow_06_c01.png'], [0, 0, 32, 64], 774, 332, 1021,
    { x: 774, y: 332, w: 32, h: 64 }, { shown: ui.index + 1 < pages }, { key: 'shop-next', label: 'Next page', click: turn(1) });
  // a hidden switch keeps no element (the module skips it): its sprites too
  for (const c of b.win.controls) if (!c.shown && c.parts) for (const s of (c.parts as { sprites: Sprite[] }).sprites) s.shown = false;
  (b.win as Record<string, unknown>).parts = tree.parts();
  out.specs.unshift(b.spec());
}

// CShopPricePlate (src/shop/yo2ShopPlates.cpp; mock/shop-packs.json): a 99 x 234 slot, its tag a picture switch
// (packs shop_pricetag_01 / 02 / 03, cards 06 / 04 / 05: up, hover, chosen), the price at (10, 216) and the pack's
// completion at (10, 236) (the rewrite doesn't know a pack's contents: left out); in the cart: chosen, its count after
// the price.
function pricePlate(d: ShopDeps, page: 'cards' | 'packs', item: ShopItem, x: number, y: number, count: number, pick: (i: ShopItem) => void, over: (on: boolean) => void): WindowSpec {
  const b = new WindowBuilder(d.ids, `shop-plate:${item.id}`, 'CShopPricePlate', { x, y, w: 99, h: 234 }, { z: 1020, state: count ? 2 : 0, price: item.price, rate: -1 });
  const n = page === 'packs' ? [1, 2, 3, 3] : [6, 4, 5, 5];
  pictureSwitch(b, d.ids, 'tag', n.map(k => `data/shop/shop_pricetag_0${k}_c01.png`) as [string, string, string, string], [0, 0, 128, 256], x, y, page === 'cards' ? 1021 : 1020,
    { x, y, w: 99, h: 234 }, { checked: count > 0, disabled: !!item.owned }, { key: `shop-item:${item.id}`, label: `${d.name(item)}, ${item.price} MP${count ? `, ${count} in the cart` : ''}`, click: () => pick(item), pointer: over, area: true });
  text(b, d.ids, 'price', x + 10, y + 216, 256, 256, `${item.price}MP${count > 1 ? ` x${count}` : ''}`, page === 'cards' ? 1024 : 1023);
  (b.win as Record<string, unknown>).parts = { sprites: [], labels: [], swfs: [] };
  return b.spec();
}

// CShopMileagePlate (base at 795, 390; @0xaeade0 / @0xaeb130): shop_money_01_c01, the player's MP in the upper field
// (807, 397) and the cart's total in the lower (807, 438), 24-pixel figures right-aligned in 200.
function mileage(d: ShopDeps, total: number, items: boolean): WindowSpec {
  const b = new WindowBuilder(d.ids, 'shop-mileage', 'CShopMileagePlate', { x: 795, y: 390, w: 229, h: 128 }, { z: 1015, mp: d.shop.mp, total });
  const tree = new Tree(b, d.ids);
  tree.sprite('plate', 'data/shop/shop_money_01_c01.png', [0, 0, 256, 128], 795, 390, 1015);
  const bound = boundMp(d.shop);
  shadowText(b, d.ids, 'mp', 807, 397, 200, 24, `${d.shop.mp}MP`, 1016, { align: 2, fontSize: 24 });
  // the lower field holds the cart's total in the item windows; on Item Selection, where main leaves it empty, the
  // wallet's two parts (starter MP, spent first and soul-binding what it buys, and earned MP)
  if (items) shadowText(b, d.ids, 'total', 807, 438, 200, 24, `${total}MP`, 1016, { align: 2, fontSize: 24 });
  else if (bound !== null) shadowText(b, d.ids, 'wallet', 807, 442, 200, 16, `${bound} starter · ${d.shop.earnedMp} earned`, 1016, { align: 2 });
  (b.win as Record<string, unknown>).parts = tree.parts();
  return b.spec();
}

// CShopConfirmWindow (src/shop/yo2ShopConfirm.cpp; mock/shop-confirm.json): shop_win_01_c00 at (300, 330), the cart
// lines "<name>@>320/x<n>@>360/<MP>MP" (the native list), Yes (339, 547) and No (638, 547): shop_btn2 keys, their
// captions at (339 / 638, 554) 110 wide. Yes buys (one request: the app's idempotent request id), No leaves the cart.
function confirmWindow(d: ShopDeps, cart: ShopItem, total: number, idle: () => boolean): WindowSpec {
  const { ui } = d, count = ui.cart!.count;
  const b = new WindowBuilder(d.ids, 'shop-confirm', 'CShopConfirmWindow', { x: 300, y: 330, w: 512, h: 256 }, { z: 51003, modal: true, result: -1, total, lines: [`${plain(d.name(cart))}@>320/x${count}@>360/${total}MP`] });
  const tree = new Tree(b, d.ids);
  tree.sprite('frame', 'data/shop/shop_win_01_c00.png', [0, 0, 512, 256], 300, 330, 51003);
  b.add('CWindowTaskScroll', 'scroll', { x: 448, y: 17, w: 16, h: 190 }, { shown: false, value: 0, max: 0, page: 6, parts: { sprites: [], labels: [], swfs: [] } });
  text(b, d.ids, 'prompt', 316, 346, 300, 32, '', 51004, { fontSize: 15 });
  const keys = ['data/shop/shop_btn2_01_c01.png', 'data/shop/shop_btn2_02_c01.png', 'data/shop/shop_btn2_03_c01.png', 'data/shop/shop_btn2_03_c01.png'] as [string, string, string, string];
  const yes = () => { if (!ui.confirm || !idle()) return; ui.confirm = false; ui.cart = null; d.buy(cart.id, count); d.rerender(); };
  const no = () => { ui.confirm = false; ui.cart = null; d.rerender(); };
  pictureSwitch(b, d.ids, 'ok', keys, [0, 0, 128, 64], 339, 547, 51004, { x: 339, y: 547, w: 116, h: 36 }, {}, { key: 'shop-yes', label: 'Yes', click: yes });
  pictureSwitch(b, d.ids, 'cancel', keys, [0, 0, 128, 64], 638, 547, 51004, { x: 638, y: 547, w: 116, h: 36 }, {}, { key: 'shop-no', label: 'No', click: no });
  text(b, d.ids, 'yesText', 339, 554, 110, 32, 'Yes', 51006, { align: 1 });
  text(b, d.ids, 'noText', 638, 554, 110, 32, 'No', 51006, { align: 1 });
  (b.win as Record<string, unknown>).parts = tree.parts();
  return b.spec();
}

// The clerk's balloon (the engine's speech window over the shop: main's confirm capture, 290, 95 to 790, 240, its tail
// to the clerk on the right): drawn by pictures.ts's balloon screen
function balloon(d: ShopDeps, says: string): WindowSpec {
  const b = new WindowBuilder(d.ids, 'shop-balloon', 'CShopBalloon', { x: 290, y: 95, w: 510, h: 146 }, { z: 51004, text: says });
  b.add('CWindowTaskText', 'text', { x: 46, y: 28, w: 420, h: 96 }, { text: says, align: 0, fontSize: 16, color: [0, 0, 0, 1] });
  return b.spec();
}
