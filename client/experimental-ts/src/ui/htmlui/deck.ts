// The deck editor (CDeckScene, client/src/Deck) through main's own deck screen (client/web-shell/htmlui/screens/deck.js).
// main's module draws the editor from the engine's raw sprite trees (each control's `parts`: CSpriteElm / CTextElm /
// CSwfEngine children with their texture, source cell and world position); the rewrite builds those trees here from
// its deck editor's state, with the numbers of main's captures (tools/flip.mjs deck: 1024 x 768, the windows at
// Detail 0, 175 / Deck 248, 0 / Trunk 736, 0) and the decomp (DeckWindow.cpp, KabanWindowList.cpp, DeckUtilFileList.cpp).
// What the engine draws under main's DOM (the card pictures, the trunk's count box) the rewrite draws itself
// (deck-stage.ts). Pure: no DOM here.
import type { CardView, DeckView, DeckZone } from '../contracts';
import { cardKind, cardSearchRank } from '../deck';
import { Ids, WindowBuilder } from './snapshot';
import type { HtmlControl, HtmlWindow, WindowSpec } from './snapshot';

// ---------------------------------------------------------------- the editor's own state (what the engine's windows keep)
/** main's trunk search (screens/deck.js searchPanel: emptyFilter), as its panel hands it to the game. */
export interface KabanFilter { cat: number; text: string; attr: number[]; race: number[]; icon: number[]; level: number[]; limit: number[]; atk: [number | null, number | null]; def: [number | null, number | null]; sort: string;
  /** The Filters popup's Show and Rarity rows (main's crafting additions, shown when Module.yo2KabanPool is set): which
   * cards the list holds (owned, every collectible card, the ones not owned, the ones the Shards craft now). */
  show?: 'owned' | 'all' | 'missing' | 'craftable'; rarity?: string[] }
export const emptyKabanFilter = (): KabanFilter => ({ cat: 6, text: '', attr: [], race: [], icon: [], level: [], limit: [], atk: [null, null], def: [null, null], sort: '' });
export type DeckFrom = 'trunk' | DeckZone;
/** A card picked up (CDeckScene's drag, DeckWindow.h DeckDragState): where from, and where the pointer has it. */
export interface DeckDrag { passcode: number; from: DeckFrom; index: number; at: [number, number]; start: [number, number]; moved: boolean }
/** The Load / Save / Structure Deck list (CWindowModelFileList) and the rewrite's export format list in the same window. */
export interface DeckFiles { mode: 'load' | 'save' | 'recipe' | 'export'; selected: number }
export type DeckDialog =
  | { kind: 'name'; name: string }
  | { kind: 'confirm'; text: string; yes(): void }
  | { kind: 'ok'; text: string };
export interface DeckUi {
  view: 'main' | 'extra';
  /** The trunk's first row (CWindowTaskKabanList top). */
  top: number;
  filter: KabanFilter;
  /** The card the detail shows (CCardDetailViewDlg card), 0: none (the card back). */
  shown: number;
  /** The detail's mode: 0 picture and text, 2 the bar alone (the ▽ / △ keys). */
  detail: 0 | 2;
  mouse: [number, number] | null;
  drag: DeckDrag | null;
  files: DeckFiles | null;
  dialog: DeckDialog | null;
}
export const deckUi = (): DeckUi => ({ view: 'main', top: 0, filter: emptyKabanFilter(), shown: 0, detail: 0, mouse: null, drag: null, files: null, dialog: null });

// ---------------------------------------------------------------- the cards as the engine sorts and names them
// The icon strips' cells (screens/deck.js ATTRS / RACES / ICONS: the game's own order)
export const ATTRS = ['Light', 'Dark', 'Water', 'Fire', 'Earth', 'Wind', 'Divine'];
export const RACES = ['Dragon', 'Zombie', 'Fiend', 'Pyro', 'Sea Serpent', 'Rock', 'Machine', 'Fish', 'Dinosaur', 'Insect', 'Beast',
  'Beast-Warrior', 'Plant', 'Aqua', 'Warrior', 'Winged Beast', 'Fairy', 'Spellcaster', 'Thunder', 'Reptile', 'Divine-Beast'];
const ICONS = ['Counter', 'Field', 'Equip', 'Continuous', 'Quick-Play', 'Ritual'];
const index = (list: readonly string[], v: unknown) => list.findIndex(x => x.toLowerCase() === String(v ?? '').trim().toLowerCase());
export const isSpell = (c: CardView) => /^spell/i.test(c.type ?? ''), isTrap = (c: CardView) => /^trap/i.test(c.type ?? '');
export const isMonster = (c: CardView) => !isSpell(c) && !isTrap(c);
export const isFusion = (c: CardView) => !!c.extra || /\bfusion\b/i.test(c.type ?? '') && isMonster(c);
/** A spell / trap's icon cell (icon_mahouwana_01: 0 counter .. 5 ritual, 6 normal). */
export const iconOf = (c: CardView) => { const i = index(ICONS, (c.type ?? '').split('/')[1]); return i < 0 ? 6 : i; };
/** The attribute disc's cell (icon_zokusei_01: 0 Light .. 6 Divine, 7 spell, 8 trap). */
export const attrOf = (c: CardView) => isSpell(c) ? 7 : isTrap(c) ? 8 : Math.max(0, index(ATTRS, c.attribute));
export const raceOf = (c: CardView) => Math.max(0, index(RACES, c.race));
/** The engine's category (KabanWindowList applyCategory; screens/deck.js CATS): 0 normal, 1 effect, 2 spell, 3 trap,
 * 4 ritual, 5 fusion. */
export const categoryOf = (c: CardView) => isSpell(c) ? 2 : isTrap(c) ? 3 : isFusion(c) ? 5 : ({ normal: 0, ritual: 4 } as Record<string, number>)[cardKind(c)] ?? 1;
/** A trunk row's frame colour (KabanWindowList.h KLB_*: 1 spell, 2 trap, 3 normal, 4 effect, 5 ritual, 6 fusion). */
export const rowColor = (c: CardView) => [3, 4, 1, 2, 5, 6][categoryOf(c)]!;
/** A card's rarity as the crafting rules name it (N / R / SR / UR; an unknown one counts as N, crafting/model.js). */
export const RARITIES = ['N', 'R', 'SR', 'UR'] as const;
export const rarityOf = (c: CardView): string => RARITIES.includes(c.rarity as never) ? c.rarity! : 'N';
const limitOf = (c: CardView) => Math.max(0, Math.min(3, c.limit ?? 3));
const stat = (v: number | undefined) => v === undefined ? '' : v < 0 ? '?' : String(v);

/** The trunk as the game lists it under main's search panel: the owned cards (Free mode: the whole pool the server
 * gives), filtered and sorted as the panel asks (no sort: the card box's order). `cards` is every collectible card;
 * the panel's Show row widens the list past the owned ones (All / Missing) or narrows it to what the Shards craft now
 * (`craftable`: the crafting view's rule), its Rarity row to some of N / R / SR / UR. */
export function trunkCards(cards: readonly CardView[], f: KabanFilter, order: (c: CardView) => number, craftable: (c: CardView) => boolean = () => false): CardView[] {
  const text = f.text.trim(), [alo, ahi] = f.atk, [dlo, dhi] = f.def, show = f.show ?? 'owned', rarity = f.rarity ?? [];
  const rows: { c: CardView; rank: number }[] = [];
  for (const c of cards) {
    const owned = (c.owned ?? 0) > 0;
    if (show === 'owned' && !owned || show === 'missing' && owned || show === 'craftable' && !craftable(c)) continue;
    if (rarity.length && !rarity.includes(rarityOf(c))) continue;
    if (f.cat !== 6 && categoryOf(c) !== f.cat) continue;
    const monster = isMonster(c);
    if (f.attr.length && (!monster || !f.attr.includes(attrOf(c)))) continue;
    if (f.race.length && (!monster || !f.race.includes(raceOf(c)))) continue;
    if (f.icon.length && (monster || !f.icon.includes(iconOf(c)))) continue;
    if (f.level.length && (!monster || !f.level.includes(c.level ?? -1))) continue;
    if (f.limit.length && !f.limit.includes(limitOf(c))) continue;
    if ((alo !== null || ahi !== null) && (!monster || c.attack === undefined || alo !== null && c.attack < alo || ahi !== null && c.attack > ahi)) continue;
    if ((dlo !== null || dhi !== null) && (!monster || c.defense === undefined || dlo !== null && c.defense < dlo || dhi !== null && c.defense > dhi)) continue;
    const rank = text ? cardSearchRank(c, text) : 0; if (rank < 0) continue;
    rows.push({ c, rank });
  }
  const by: Record<string, (a: CardView, b: CardView) => number> = {
    name: (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    'atk-': (a, b) => (b.attack ?? -1) - (a.attack ?? -1), 'atk+': (a, b) => (a.attack ?? -1) - (b.attack ?? -1),
    'def-': (a, b) => (b.defense ?? -1) - (a.defense ?? -1), 'def+': (a, b) => (a.defense ?? -1) - (b.defense ?? -1),
  };
  const sort = by[f.sort];
  rows.sort((a, b) => (sort ? sort(a.c, b.c) : text ? a.rank - b.rank : 0) || order(a.c) - order(b.c));
  return rows.map(r => r.c);
}
const copies = (deck: DeckView | null, pc: number) => deck ? deck.main.filter(x => x === pc).length + deck.side.filter(x => x === pc).length + deck.extra.filter(x => x === pc).length : 0;
/** Copies of a card still in the trunk (the row's figure): owned less those in the deck. */
export const copiesLeft = (c: CardView, deck: DeckView | null) => Math.max(0, (c.owned ?? 0) - copies(deck, c.passcode ?? -1));
/** Whether the trunk may give another copy (KabanWindowList kabanCanTake: copies left, the three-copy and banlist limits). */
const canTake = (c: CardView, deck: DeckView | null) => copiesLeft(c, deck) > 0 && copies(deck, c.passcode ?? -1) < Math.min(3, limitOf(c));

// ---------------------------------------------------------------- the engine's parts
interface Sprite { id: number; name: string; tex: string; src: [number, number, number, number]; x: 0; y: 0; z: number; wx: number; wy: number; wz: number; a: number; sx: number; sy: number; rgba: number[]; col: number[]; shown: true }
interface Label { id: number; name: string; text: string; x: 0; y: 0; z: number; wx: number; wy: number; wz: number; a: number; shown: true }
interface Swf { id: number; name: string; x: 0; y: 0; z: number; wx: number; wy: number; wz: number; a: number; shown: true }
interface Parts { sprites: Sprite[]; labels: Label[]; swfs: Swf[] }
/** A card's picture as main's deck module recognises card faces (data/MINI/*: the engine draws them; here deck-stage.ts). */
export const cardTex = (pc: number) => `data/MINI/${pc}.png`;
export const texCard = (tex: string): number | null => { const m = /^data\/MINI\/(\d+)\.png$/.exec(tex); return m ? Number(m[1]) : null; };

class Tree {
  constructor(private ids: Ids, private key: string) {}
  private n = 0;
  parts(): Parts { return { sprites: [], labels: [], swfs: [] }; }
  sprite(p: Parts, name: string, tex: string, src: [number, number, number, number], wx: number, wy: number, wz: number, o: { sx?: number; sy?: number; a?: number; col?: number[] } = {}): Sprite {
    const a = o.a ?? 1, col = o.col ?? [1, 1, 1, a];
    const s: Sprite = { id: this.ids.of(`${this.key}/s${this.n++}`), name, tex, src, x: 0, y: 0, z: 0, wx, wy, wz, a, sx: o.sx ?? 1, sy: o.sy ?? 1, rgba: col.length ? [col[0]!, col[1]!, col[2]!, 1] : [1, 1, 1, 1], col, shown: true };
    p.sprites.push(s); return s;
  }
  label(p: Parts, name: string, text: string, wx: number, wy: number, wz: number): Label {
    const t: Label = { id: this.ids.of(`${this.key}/l${this.n++}`), name, text, x: 0, y: 0, z: 0, wx, wy, wz, a: 1, shown: true };
    p.labels.push(t); return t;
  }
  swf(p: Parts, name: string, wx: number, wy: number, wz: number): Swf {
    const f: Swf = { id: this.ids.of(`${this.key}/f${this.n++}`), name, x: 0, y: 0, z: 0, wx, wy, wz, a: 1, shown: true };
    p.swfs.push(f); return f;
  }
}
/** A control at a world position (main's module places by its parts; it checks x only for 9999, "parked"). */
function control(b: WindowBuilder, ids: Ids, key: string, cls: string, name: string, at: { x: number; y: number; w?: number; h?: number; z?: number }, fields: Record<string, unknown> = {}): HtmlControl {
  // x / y window-local (the layer's hit test and tags), wx / wy the world position main's module and quickMove read
  const c: HtmlControl = { id: ids.of(`${b.key}/${key}`), cls, name, parent: 0, x: at.x - b.win.x, y: at.y - b.win.y, w: at.w ?? 0, h: at.h ?? 0, z: at.z ?? 0, alpha: 1, shown: true, enabled: true, focused: false,
    wx: at.x, wy: at.y, wz: at.z ?? 0, ...fields };
  b.win.controls.push(c);
  return c;
}
// CWindowTaskFrameThin (window_base_01_c0<style>): its eight 8 x 8 pieces, the edges stretched, at alpha 0.7
function frameThin(t: Tree, p: Parts, style: number, x: number, y: number, w: number, h: number, z: number): void {
  const tex = `data/common/window/window_base_01_c0${style}.png`, a = 0.699999988079071, sx = (w - 16) / 8, sy = (h - 16) / 8;
  const piece = (name: string, u: number, v: number, px: number, py: number, o: { sx?: number; sy?: number } = {}) => t.sprite(p, `CWindowTaskFrameThinの${name}画像`, tex, [u, v, 8, 8], px, py, z, { ...o, a });
  piece('左上', 0, 0, x, y); piece('中央上', 8, 0, x + 8, y, { sx }); piece('右上', 16, 0, x + w - 8, y);
  piece('左中央', 0, 8, x, y + 8, { sy }); piece('右中央', 16, 8, x + w - 8, y + 8, { sy });
  piece('左下', 0, 16, x, y + h - 8); piece('中央下', 8, 16, x + 8, y + h - 8, { sx }); piece('右下', 16, 16, x + w - 8, y + h - 8);
}
// CWindowTaskBackPlane: window_base_01_c01's middle cell stretched over the plane, grey (0.63) under the deck grids
function backPlane(t: Tree, p: Parts, x: number, y: number, w: number, h: number, z: number, col = [0.6299999952316284, 0.6299999952316284, 0.6299999952316284, 1], a = 1): void {
  t.sprite(p, 'CWindowTaskBackPlaneの画像', 'data/common/window/window_base_01_c01.png', [8, 8, 8, 8], x, y, z, { sx: w / 8, sy: h / 8, a, col });
}

// The scene around the windows (DeckEntry.cpp init; read/deck.js scene): the background, the "EDIT DECK" strip and the
// five side buttons at 0, 40 + 27 i, with the game's mouse for their hover look. main's module draws it (backdrop).
export const SIDE_BUTTONS = ['LoadBtn', 'SaveBtn', 'RecipeBtn', 'ClearBtn', 'ExitBtn'] as const;
export const sideButtonAt = (x: number, y: number): typeof SIDE_BUTTONS[number] | null => x >= 0 && x < 176 && y >= 40 && y < 175 ? SIDE_BUTTONS[Math.floor((y - 40) / 27)] ?? null : null;
function scene(ids: Ids, mouse: [number, number] | null) {
  const s = (name: string, tex: string, src: [number, number, number, number], sx: number, z: number) =>
    ({ id: ids.of(`scene/${name}`), name, tex, src, x: 0, y: 0, z, wx: 0, wy: 0, wz: z, a: 1, sx, sy: sx, rgba: [1, 1, 1, 1], col: [1, 1, 1, 1], shown: true });
  return { bg: s('BG', 'data/deck/deck_bg_01.png', [0, 0, 512, 384], 2, 0), title: s('title', 'data/deck/deck_title_01_?.png', [0, 0, 248, 40], 1, 1),
    menu: SIDE_BUTTONS.map((name, i) => ({ id: ids.of(`scene/${name}`), name, x: 0, y: 40 + 27 * i, z: 1, wx: 0, wy: 40 + 27 * i, wz: 1, a: 1, shown: true })),
    // only the hovered button matters to main's module (its look): the mouse kept only over the buttons
    mouse: mouse && sideButtonAt(mouse[0], mouse[1]) ? [Math.min(mouse[0], 175), mouse[1]] : [2, 2] };
}

// ---------------------------------------------------------------- the windows
export interface DeckContext {
  ids: Ids; ui: DeckUi;
  deck: DeckView | null;
  /** Every card the editor knows (with owned counts), by passcode. */
  card(pc: number): CardView | undefined;
  /** The trunk's cards, filtered and sorted (trunkCards). */
  trunk: readonly CardView[];
  /** The deck's card description (the detail's text). */
  busy: boolean;
}
export const TRUNK_ROWS = 11, ROW_H = 56;
const WZ = { detail: 51103, kaban: 51153, deck: 51203 };

// The card detail (CCardDetailViewDlg / CWindowModelCardDetail, 0, 175, 248 x 559): the icon bar and its ▽ key, the
// big card's plane (8, 24, 232 x 290: the picture is a hole), the text field (8, 322, 232 x 208) and the power strip
// (8, 530, 232 x 22: a monster's race, attribute and level icons, holes, and its " 4 ATK1400/DEF1100" text at 60, 712).
export function detailWindow(ctx: DeckContext): WindowSpec {
  const { ids, ui } = ctx, top = ui.detail === 2 ? 712 - 24 : 175, h = ui.detail === 2 ? 24 : 559, c = ui.shown ? ctx.card(ui.shown) : undefined, monster = !!c && isMonster(c);
  const b = new WindowBuilder(ids, 'deck-detail', 'CCardDetailViewDlg', { x: 0, y: top, w: 248, h }, { z: WZ.detail, wz: WZ.detail + 2, modal: true, drawn: { x: 0, y: top, w: 256, h: h + 1 },
    mode: ui.detail, card: c ? 1 : 0, monster, scene: scene(ids, ui.mouse), extras: [{ id: ids.of('deck-detail/power'), cls: 'CTextElm' }], holes: [] as { x: number; y: number; w: number; h: number }[], labels: [] as Label[] });
  const t = new Tree(ids, 'deck-detail'), z = WZ.detail, full = ui.detail === 0;
  const bar = t.parts();
  for (const [name, u, x, sx] of [['左', 0, 0, 1], ['中央', 8, 8, 29], ['右', 16, 240, 1]] as const) t.sprite(bar, `CWindowTaskIconbarの${name}画像`, 'data/common/window/iconbar_01_c01.png', [u, 0, 8, 24], x, top, z, { sx, a: 0.699999988079071 });
  control(b, ids, 'bar', 'CWindowTaskIconbar', 'CWindowModelCardDetailの', { x: 0, y: top, w: 248, h: 24, z }, { active: true, parts: bar });
  // the key: ▽ shrinks the detail to its bar, △ opens it again (icon_01_c01 cells 0, 72 / 0, 48)
  const key = t.parts(); t.sprite(key, full ? 'CWindowTaskIconShrinkの画像' : 'CWindowTaskIconExpandの画像', 'data/common/window/icon_01_c01.png', [0, full ? 72 : 48, 16, 24], 229, top, z + 2);
  control(b, ids, 'key', full ? 'CWindowTaskIconShrink' : 'CWindowTaskIconExpand', full ? 'CWindowModelCardDetailの▽ボタン' : 'CWindowModelCardDetailの△ボタン', { x: 229, y: top, w: 16, h: 24, z: z + 2 }, { pressed: false, parts: key });
  if (!full) return b.spec();
  const chop = t.parts(), a = 0.699999988079071, base = 'data/common/window/window_base_01_c01.png';
  t.sprite(chop, 'CWindowTaskThinChopの左画像', base, [0, 8, 8, 8], 0, 489, z, { sy: 29.75, a }); t.sprite(chop, 'CWindowTaskThinChopの右画像', base, [16, 8, 8, 8], 240, 489, z, { sy: 29.75, a });
  t.sprite(chop, 'CWindowTaskThinChopの左下画像', base, [0, 16, 8, 8], 0, 727, z, { a }); t.sprite(chop, 'CWindowTaskThinChopの中央下画像', base, [8, 16, 8, 8], 8, 727, z, { sx: 29, a });
  t.sprite(chop, 'CWindowTaskThinChopの右下画像', base, [16, 16, 8, 8], 240, 727, z, { a });
  control(b, ids, 'chop', 'CWindowTaskThinChop', 'CWindowModelCardDetailのフレーム２', { x: 0, y: 489, w: 248, h: 246, z }, { parts: chop });
  const plane = (key: string, name: string, x: number, y: number, w: number, h: number) => { const p = t.parts(); backPlane(t, p, x, y, w, h, z, [1, 1, 1, a], a); control(b, ids, key, 'CWindowTaskBackPlane', name, { x, y, w, h, z }, { parts: p }); };
  plane('picture', 'CWindowModelCardDetailの背景', 8, 199, 232, 290);
  plane('textPlane', 'CWindowTaskTextFieldの背景', 8, 497, 232, 208);
  plane('power', 'CWindowModelCardDetailの攻撃力/防御力', 8, 705, 232, 22);
  // the big card: a hole the stage fills (the card, or its back with none shown)
  (b.win.holes as { x: number; y: number; w: number; h: number }[]).push({ x: 8, y: 24, w: 232, h: 290 });
  const text = c ? detailText(c) : '';
  control(b, ids, 'field', 'CWindowTaskTextField', 'CWindowModelCardDetailのカードテキスト', { x: 8, y: 497, w: 232, h: 208, z }, { text, align: 0, fontSize: 16, lineGap: 0, firstLine: 0, pageLines: 13, color: [1, 1, 1, 1] });
  const tp = t.parts(); t.label(tp, 'CWindowTaskTextのテキスト', text, 8, 497, z + 2);
  control(b, ids, 'text', 'CWindowTaskText', 'CWindowTaskTextFieldのテキスト', { x: 8, y: 497, w: 216, h: 208, z: z + 2 }, { text, align: 0, fontSize: 16, lineGap: 0, firstLine: 0, pageLines: 13, color: [1, 1, 1, 1], parts: tp });
  if (c && monster) {
    for (const x of [8, 24, 40]) (b.win.holes as { x: number; y: number; w: number; h: number }[]).push({ x, y: 712 - top, w: 16, h: 16 });
    (b.win.labels as Label[]).push({ id: ids.of('deck-detail/power'), name: 'CCardDetailViewDlg(m_pPowerText)', text: ` ${c.level ?? 0} ATK${stat(c.attack)}/DEF${stat(c.defense)}`, x: 0, y: 0, z: 51613, wx: 60, wy: 712, wz: 51613, a: 1, shown: true });
  }
  return b.spec();
}
/** The detail's text as the game writes it (@4 name, @3 [race/type/ATTRIBUTE] for a monster, @0 the card text). */
export function detailText(c: CardView): string {
  const kinds = (c.type ?? '').split('/').map(s => s.trim()).filter(s => s && !/^monster$/i.test(s));
  const head = isMonster(c) ? `\n@3[${[c.race, ...kinds, String(c.attribute ?? '').toUpperCase()].filter(Boolean).join('/')}]` : '';
  return `@4${c.name}${head}\n@0${(c.description ?? '').replace(/@/g, '@@')}`;
}

// The trunk (CWindowModelKaban, 736, 0, 288 x 712): the frame (style 8, 736, 80, 288 x 632), the header bar
// (deckbar_01_c03, "Trunk" and "Rearrange"), the count box (a swf the stage draws, its "40" text), the order and search
// key rows (swfs: main's search panel stands over them), the list (744, 88: 11 rows of 256 x 56) and its rows.
export function kabanWindow(ctx: DeckContext): WindowSpec {
  const { ids, ui, deck } = ctx;
  const b = new WindowBuilder(ids, 'deck-kaban', 'CWindowModelKaban', { x: 736, y: 0, w: 288, h: 712 }, { z: WZ.kaban, wz: WZ.kaban + 15, modal: true, drawn: null, scene: scene(ids, ui.mouse) });
  const t = new Tree(ids, 'deck-kaban'), z = WZ.kaban;
  control(b, ids, 'kaban', 'CWindowTaskKaban', 'Kaban', { x: 0, y: 0, z: z + 1 });
  control(b, ids, 'select', 'CWindowTaskKabanCard', 'SelectCard', { x: 0, y: 0, z: z + 1 }, { card: 0 });
  const frame = t.parts(); frameThin(t, frame, 8, 736, 80, 288, 632, z + 6);
  control(b, ids, 'frame', 'CWindowTaskFrameThin', 'Frame', { x: 736, y: 80, w: 288, h: 632, z: z + 6 }, { style: 8, parts: frame });
  const bar = t.parts(), tex = 'data/deck/deckbar_01_c03.png';
  t.sprite(bar, 'LT', tex, [0, 0, 8, 88], 736, 0, z + 7); t.sprite(bar, 'Top', tex, [8, 0, 8, 88], 744, 0, z + 7, { sx: 34 }); t.sprite(bar, 'RT', tex, [16, 0, 8, 88], 1016, 0, z + 7);
  t.sprite(bar, 'TitleTop', 'data/deck/deck_moji_01_?.png', [0, 84, 160, 28], 744, 0, z + 14); t.sprite(bar, 'TitleMiddle', 'data/deck/deck_moji_01_?.png', [0, 112, 160, 28], 744, 28, z + 14);
  control(b, ids, 'bar', 'CWindowTaskDeckBar', 'Bar', { x: 736, y: 0, z: z + 7 }, { parts: bar });
  const total = deck ? deck.main.length + deck.side.length + deck.extra.length : 0;
  const num = t.parts(); t.swf(num, 'KabanCountBtn', 944, 4, z + 10); t.label(num, 'KabanCountNumber', `@9${total}`, total < 10 ? 1000 : total < 100 ? 992 : 984, 6, z + 16);
  control(b, ids, 'num', 'CWindowTaskKabanNumber', 'KabanNum', { x: 944, y: 4, z: z + 8 }, { count: total, parts: num });
  const order = t.parts(); ['MagicBtn', 'TrapBtn', 'NormalBtn', 'EffectBtn', 'RitualBtn', 'FusionBtn'].forEach((n, i) => t.swf(order, n, 832 + 32 * i, 29, z + 15));
  control(b, ids, 'order', 'CWindowTaskKabanOrder', 'Order', { x: 832, y: 29, z: z + 8 }, { parts: order });
  const search = t.parts(); ['AtkBtn', 'DefBtn', 'TypeBtn', 'AttrBtn', 'EffectBtn', 'NameBtn', 'StrBtn', 'LevelBtn', 'ForbiBtn'].forEach((n, i) => t.swf(search, n, 800 + 24 * i, 57, z + 15));
  control(b, ids, 'search', 'CWindowTaskKabanSearch', 'Search', { x: 800, y: 57, z: z + 8 }, { parts: search });
  const hits = ctx.trunk.length, maxTop = Math.max(0, hits - TRUNK_ROWS);
  ui.top = Math.max(0, Math.min(ui.top, maxTop));
  control(b, ids, 'list', 'CWindowTaskKabanList', 'KabanList', { x: 744, y: 88, z: z + 9 }, { rowCount: TRUNK_ROWS, category: ui.filter.cat, top: ui.top, hits, pool: `${hits}` });
  for (let r = 0; r < TRUNK_ROWS; r++) trunkRow(b, t, ids, r, ctx.trunk[ui.top + r], deck, z);
  return b.spec();
}
// A trunk row (CWindowTaskKabanListBtn, 744, 88 + 56 r): its frame's left column in the card kind's colour
// (deck_carddai_01_c0<KLB>), the rest of the frame (c01; an empty row c00's "nothing"), the mini picture (759, +3, at
// 0.694) dimmed to half when the trunk can't give another copy, the copies figure (×000 at +16, +40) and the info line
// (KabanWindowList.cpp: the race 56, attribute 72, spell / trap icon 88, star 104 and level 122, ATK 140 / DEF 184
// right-aligned in 40, "/" 176, the limit 232, all at +8; the name 56, 32 in 200).
function trunkRow(b: WindowBuilder, t: Tree, ids: Ids, r: number, c: CardView | undefined, deck: DeckView | null, z: number): void {
  const x = 744, y = 88 + ROW_H * r, p = t.parts(), color = c ? rowColor(c) : 0, v = !c || canTake(c, deck) ? 1 : 0.5, col = [v, v, v, 1];
  const carddai = (n: number) => `data/deck/deck_carddai_01_c0${n}.png`;
  const column = (names: [string, string, string], tex: string, px: number, sx: number) => {
    t.sprite(p, names[0], tex, [px === x ? 0 : 8, 0, 8, 8], px, y, z + 12, { sx, col }); t.sprite(p, names[1], tex, [px === x ? 0 : 8, 8, 8, 8], px, y + 8, z + 12, { sx, sy: 5, col });
    t.sprite(p, names[2], tex, [px === x ? 0 : 8, 16, 8, 8], px, y + 48, z + 12, { sx, col });
  };
  column(['picLT', 'picLC', 'picLB'], carddai(color), x, 1);
  if (c) column(['picRT', 'picRC', 'picRB'], carddai(1), x + 8, 31); else column(['picNothingT', 'picNothingC', 'picNothingB'], carddai(0), x + 8, 31);
  if (c?.passcode !== undefined) t.sprite(p, 'picElm', cardTex(c.passcode), [0, 0, 50, 72], x + 15, y + 3, z + 20, { sx: 0.6944444179534912, sy: 0.6944444179534912, col });
  control(b, ids, `row${r}`, 'CWindowTaskKabanListBtn', 'ListBtn', { x, y, w: 256, h: ROW_H, z: z + 11 }, { card: c ? 1 + r : 0, passcode: c?.passcode ?? 0, color, parts: p });
  if (!c) return;
  // the copies figure: "×" then three digits (deck_font_01_c01 cells 8 x 12: 0-9, then ×)
  const fig = t.parts(), left = Math.min(999, copiesLeft(c, deck)), digits = String(left).padStart(3, '0');
  t.sprite(fig, 'figure4', 'data/deck/deck_font_01_c01.png', [80, 0, 8, 12], x + 16, y + 40, z + 23);
  [...digits].forEach((d, i) => t.sprite(fig, `figure${3 - i}`, 'data/deck/deck_font_01_c01.png', [8 * Number(d), 0, 8, 12], x + 24 + 8 * i, y + 40, z + 23));
  control(b, ids, `fig${r}`, 'CWindowTaskDeckFigure', 'Number', { x, y, z: z + 13 }, { parts: fig });
  const info = (key: string, cls: string, name: string, px: number, part: (p: Parts) => void, fields: Record<string, unknown> = {}) => {
    const ip = t.parts(); part(ip); control(b, ids, `${key}${r}`, cls, name, { x: x + px, y: y + 8, w: 16, h: 16, z: z + 15 }, { ...fields, parts: ip });
  };
  const icon = (tex: string, src: [number, number, number, number], px: number, o: { sy?: number } = {}) => (ip: Parts) => t.sprite(ip, 'CWindowTaskImgの画像', tex, src, x + px, y + 8, z + 15, o);
  const monster = isMonster(c);
  if (monster) info('type', 'CWindowTaskImageCardType', 'CWindowTaskCardInfoItem::m_type', 56, icon('data/common/icon/icon_syuzoku_01.png', [16 * raceOf(c), 0, 16, 16], 56), { value: raceOf(c) });
  info('attr', 'CWindowTaskImageCardAttr', 'CWindowTaskCardInfoItem::m_attr', 72, icon('data/common/icon/icon_zokusei_01.png', [16 * attrOf(c), 0, 16, 16], 72), { value: attrOf(c) + 1 });
  if (!monster && iconOf(c) < 6) info('icon', 'CWindowTaskImageCardIcon', 'CWindowTaskCardInfoItem::m_icon', 88, icon('data/common/icon/icon_mahouwana_01.png', [16 * iconOf(c), 0, 16, 16], 88));
  if (monster && (c.level ?? 0) > 0) {
    info('star', 'CWindowTaskImageCardStar', 'CWindowTaskCardInfoItem::m_star', 104, icon('data/common/icon/icon_star_01.png', [0, 0, 19, 16], 104, { sy: 0.8421052694320679 }));
    info('lv', 'CWindowTaskImageCardStarLv', 'CBgCommon::m_starlv', 122, icon('data/common/icon/font_k_star.png', [14 * (Math.min(12, c.level!) - 1), 0, 14, 14], 122));
  }
  if (limitOf(c) < 3) info('forbi', 'CWindowTaskImageCardForbi', 'CWindowTaskCardInfoItem::m_forbi', 232, icon('data/common/icon/icon_seigen_01.png', [16 * limitOf(c), 0, 16, 16], 232));
  const text = (key: string, name: string, px: number, py: number, w: number, s: string, align: number) => {
    const tp = t.parts(); t.label(tp, 'CWindowTaskTextのテキスト', s, x + px, y + py, z + 15);
    control(b, ids, `${key}${r}`, 'CWindowTaskText', name, { x: x + px, y: y + py, w, h: 16, z: z + 15 }, { text: s, align, fontSize: 16, lineGap: 0, firstLine: 0, pageLines: 1, color: [1, 1, 1, 1], parts: tp });
  };
  text('atk', 'CWindowTaskCardInfoItem::m_atk', 140, 8, 40, monster ? stat(c.attack).padStart(4) : '-', 2);
  text('sep', 'CWindowTaskCardInfoItem::m_sep', 176, 8, 16, '/', 1);
  text('def', 'CWindowTaskCardInfoItem::m_def', 184, 8, 40, monster ? stat(c.defense).padStart(4) : '-', 2);
  text('name', 'CWindowTaskCardInfoItem::m_name', 56, 32, 200, c.name.replace(/@/g, '@@'), 0);
}

// The deck (CWindowModelDeck, 248, 0, 488 x 712): the header bar (deckbar_01_c02, "Deck", "Number of Cards", the
// "Side" band at 584), the counters (deck_cardcount_01: main 402, 60, the spells / traps / normal / effect / ritual
// boxes from 480, 29, Fusion 596, 60, side 318, 587), the Main / Fusion tabs (256 / 450, 56), the main frame and grey
// plane (248, 80 / 256, 88), the side's (248, 608 / 256, 616; the Fusion view's main frame runs to 712), and the cards:
// 16 to a row at 262 + 28 c, 96 + 80 r (the side's at 624), each a 50 x 72 picture (a hole) with its limit icon.
export const GRID = { x: 262, y: 96, dx: 28, dy: 80, perRow: 16, sideY: 624 } as const;
export function deckWindow(ctx: DeckContext): WindowSpec {
  const { ids, ui, deck } = ctx, extra = ui.view === 'extra';
  const b = new WindowBuilder(ids, 'deck-deck', 'CWindowModelDeck', { x: 248, y: 0, w: 488, h: 712 }, { z: WZ.deck, wz: WZ.deck + 43, modal: true, drawn: null, scene: scene(ids, ui.mouse) });
  const t = new Tree(ids, 'deck-deck'), z = WZ.deck, main = deck?.main ?? [], side = deck?.side ?? [], ext = deck?.extra ?? [];
  control(b, ids, 'deck', 'CWindowTaskDeck', 'deck', { x: 0, y: 0, z }, { view: ui.view, expanded: true, counts: { main: main.length, side: side.length, extra: ext.length, missing: 0 },
    grids: { main: [...main], side: [...side], extra: [...ext], missing: [] } });
  const mainH = extra ? 616 : 496;
  const plane = t.parts(); backPlane(t, plane, 256, 88, 472, mainH, z + 1);
  control(b, ids, 'mainPlane', 'CWindowTaskBackPlane', 'CWindowTaskTextFieldの背景', { x: 256, y: 88, w: 472, h: mainH, z: z + 1 }, { parts: plane });
  const dragging = ui.drag?.moved && ui.drag.from !== 'trunk' ? ui.drag : null;
  const cards = (zone: DeckZone, list: readonly number[], y0: number) => list.forEach((pc, i) => {
    const col = i % GRID.perRow, row = Math.floor(i / GRID.perRow), x = GRID.x + GRID.dx * col, y = y0 + GRID.dy * row, wz = z + 2 + col, c = ctx.card(pc), p = t.parts();
    const lifted = dragging?.from === zone && dragging.index === i;
    if (!lifted) {
      t.sprite(p, 'picCard', cardTex(pc), [0, 0, 50, 72], x, y, wz);
      if (c && limitOf(c) < 3) t.sprite(p, 'picLimit', 'data/common/icon/icon_seigen_01.png', [16 * limitOf(c), 0, 16, 16], x, y, wz + 1);
    }
    control(b, ids, `${zone}${i}`, 'CWindowTaskDeckCard', 'noname', { x, y, w: 50, h: 72, z: wz }, { card: lifted ? 0 : i + 1, passcode: pc, zone, index: i, dragging: false, parts: p });
  });
  if (extra) cards('extra', ext, GRID.y); else cards('main', main, GRID.y);
  const mframe = t.parts(); frameThin(t, mframe, 7, 248, 80, 488, extra ? 632 : 512, z + 5);
  control(b, ids, 'frameMain', 'CWindowTaskFrameThin', 'frameMain', { x: 248, y: 80, w: 488, h: extra ? 632 : 512, z: z + 5 }, { style: 7, parts: mframe });
  if (!extra) {
    const sp = t.parts(); frameThin(t, sp, 7, 248, 608, 488, 104, z + 25);
    control(b, ids, 'frameSide', 'CWindowTaskFrameThin', 'frameSide', { x: 248, y: 608, w: 488, h: 104, z: z + 25 }, { style: 7, parts: sp });
  }
  const bar = t.parts(), tex = 'data/deck/deckbar_01_c02.png', w7 = 'data/common/window/window_base_01_c07.png';
  t.sprite(bar, 'LT', tex, [0, 0, 8, 88], 248, 0, z + 26); t.sprite(bar, 'Top', tex, [8, 0, 8, 88], 256, 0, z + 26, { sx: 59 }); t.sprite(bar, 'RT', tex, [16, 0, 8, 88], 728, 0, z + 26);
  if (!extra) {
    // the side's band under the main grid: three rows of window_base_01_c07 cells (584, 592 twice the height, 608)
    for (const [nm, u, v, y, sy] of [['U', [72, 56, 80], [8, 16, 8], 584, 1], ['C', [24, 32, 40], [8, 8, 8], 592, 2], ['D', [72, 56, 80], [0, 0, 0], 608, 1]] as const) {
      t.sprite(bar, `LB${nm}`, w7, [u[0], v[0], 8, 8], 248, y, z + 26, { sy }); t.sprite(bar, `Bottom${nm}`, w7, [u[1], v[1], 8, 8], 256, y, z + 26, { sx: 59, sy });
      t.sprite(bar, `RB${nm}`, w7, [u[2], v[2], 8, 8], 728, y, z + 26, { sy });
    }
  }
  t.sprite(bar, 'TitleTop', 'data/deck/deck_moji_01_?.png', [0, 0, 160, 28], 256, 0, z + 53); t.sprite(bar, 'TitleMiddle', 'data/deck/deck_moji_01_?.png', [0, 28, 160, 28], 256, 28, z + 53);
  if (!extra) t.sprite(bar, 'TitleBottom', 'data/deck/deck_moji_01_?.png', [0, 56, 160, 28], 256, 584, z + 53);
  control(b, ids, 'bar', 'CWindowTaskDeckBar', 'bar', { x: 248, y: 0, z: z + 26 }, { parts: bar });
  // the tabs: the front one's cells from 0, the back one's from 41; its word bright (u 128) in front
  const tab = (key: 'MainTab' | 'FusionTab', x: number, front: boolean, v: number, wz: number) => {
    const p = t.parts(), tt = 'data/deck/decktab_01_c02.png', o = front ? 0 : 41;
    t.sprite(p, 'leftTab', tt, [o, 0, 24, 28], x, 56, wz); t.sprite(p, 'centerTab', tt, [o + 24 - (front ? 0 : 1), 0, 8, 28], x + 24, 56, wz, { sx: 20.25 });
    t.sprite(p, 'rightTab', tt, [o + 32 - (front ? 0 : 1), 0, 8, 28], x + 186, 56, wz); t.sprite(p, 'titleTab', 'data/deck/deck_tabmoji_01_?.png', [front ? 128 : 0, v, 128, 24], x + 23, 61, wz + 28 + (key === 'MainTab' ? 1 : 0));
    control(b, ids, key, 'CWindowTaskDeckTab', key, { x, y: 56, w: 192, h: 28, z: wz }, { parts: p });
  };
  tab('FusionTab', 450, extra, 24, z + 27); tab('MainTab', 256, !extra, 0, z + 28);
  // the counters: the main deck's by kind (spell, trap, normal, effect, ritual), main red under 40, Fusion, side
  const kinds = [0, 0, 0, 0, 0]; for (const pc of main) { const c = ctx.card(pc); if (c) { const k = categoryOf(c); kinds[k === 2 ? 0 : k === 3 ? 1 : k === 0 ? 2 : k === 4 ? 4 : 3]!++; } }
  const num = t.parts(), cnt = 'data/deck/deck_cardcount_01_?.png';
  t.sprite(num, 'mainBG', cnt, [0, 0, 34, 25], 402, 60, z + 54);
  if (!extra) t.sprite(num, 'sideBG', cnt, [34, 0, 34, 25], 318, 587, z + 54);
  ['magic', 'trap', 'normal', 'effect', 'ritual'].forEach((n, i) => t.sprite(num, `${n}BG`, cnt, [68 + 34 * i, 0, 34, 25], 480 + 40 * i, 29, z + 54));
  t.sprite(num, 'fusionBG', cnt, [34, 0, 34, 25], 596, 60, z + 54);
  // the numbers right of their box's left edge as the game pens them (one digit 9 px further than two)
  const pen = (x: number, n: number) => x + (n < 10 ? 17 : 9);
  t.label(num, 'mainNumber', `${main.length < 40 ? '@1' : '@9'}${main.length}`, pen(402, main.length), 64, z + 55);
  if (!extra) t.label(num, 'sideNumber', `@9${side.length}`, pen(318, side.length), 591, z + 55);
  kinds.forEach((n, i) => t.label(num, `${['magic', 'trap', 'normal', 'effect', 'ritual'][i]}Number`, `@0${n}`, pen(480 + 40 * i, n), 33, z + 55));
  t.label(num, 'fusionNumber', `@9${ext.length}`, pen(596, ext.length), 64, z + 55);
  control(b, ids, 'num', 'CWindowTaskDeckNumber', 'DeckNum', { x: 248, y: 29, z: z + 27 }, { parts: num });
  if (!extra) {
    const sp = t.parts(); backPlane(t, sp, 256, 616, 472, 88, z + 41);
    control(b, ids, 'sidePlane', 'CWindowTaskBackPlane', 'CWindowTaskTextFieldの背景', { x: 256, y: 616, w: 472, h: 88, z: z + 41 }, { parts: sp });
    // the side's cards over its plane (their own depth above it)
    const before = b.win.controls.length; cards('side', side, GRID.sideY);
    for (const c of b.win.controls.slice(before)) for (const s of (c.parts as Parts).sprites) s.wz += 40;
  }
  return b.spec();
}

/** Which deck card is under a game point (the one drawn on top: the later column), from the window built. */
export function deckCardAt(win: HtmlWindow, x: number, y: number): { zone: DeckZone; index: number; passcode: number } | null {
  let best: HtmlControl | null = null;
  for (const c of win.controls) {
    const cx = Number(c.wx), cy = Number(c.wy);
    if (c.cls === 'CWindowTaskDeckCard' && Number(c.card) > 0 && x >= cx && x < cx + 50 && y >= cy && y < cy + 72 && (!best || c.z > best.z)) best = c;
  }
  return best ? { zone: best.zone as DeckZone, index: Number(best.index), passcode: Number(best.passcode) } : null;
}
/** A grid's slot at a game point (a reorder's target), or the end of the grid. */
export function gridIndex(zone: DeckZone, count: number, x: number, y: number): number {
  const col = Math.max(0, Math.min(GRID.perRow - 1, Math.floor((x - GRID.x) / GRID.dx))), row = zone === 'side' ? 0 : Math.max(0, Math.floor((y - GRID.y) / GRID.dy));
  return Math.max(0, Math.min(count - 1, row * GRID.perRow + col));
}
/** The drop zones (DeckEntryMain.cpp deckDropTarget / inTrunkZone): the grids 256..728, the trunk 744..956. */
export function dropZone(view: 'main' | 'extra', x: number, y: number): DeckFrom | null {
  if (x > 744 && x < 956 && y > 88 && y < 704) return 'trunk';
  if (x >= 256 && x < 728) {
    if (view === 'extra') return y >= 88 && y < 704 ? 'extra' : null;
    if (y >= 88 && y < 584) return 'main';
    if (y >= 616 && y < 704) return 'side';
  }
  return null;
}

// ---------------------------------------------------------------- the file list (CWindowModelFileList, 164, 312)
// main's capture (deck-files): 696 wide; the title band (window_base_01_c01 cells 24..40, 0 and 8 at alpha 0.8, the
// title 24 px white, centred), the list frame (FrameBottomThick, 164, 344, 696 x 176: its band under the list) over the
// list's eight 16 px rows (172, 352, 680 wide), and the four switches at 46 / 221 / 395 / 569, 176 (80 x 24; "Save
// New" 82): new / delete / yes / no. Load hides "new" (the rewrite's Import there), Structure Deck "new" and "delete".
export interface FileRow { label: string }
export interface FileButton { label: string; key: string; run: (() => void) | null }
export function fileListWindow(ids: Ids, title: string, rows: readonly FileRow[], selected: number, top: number, pick: (i: number) => void, buttons: (FileButton | null)[]): WindowSpec {
  const X = 164, Y = 312, W = 696, b = new WindowBuilder(ids, 'deck-files', 'CWindowModelFileList', { x: X, y: Y, w: W, h: 144 }, { z: 51353, wz: 51387, modal: true, topmost: true, drawn: { x: X, y: Y + 8, w: W, h: 200 } });
  const t = new Tree(ids, 'deck-files'), z = 51383, base = 'data/common/window/window_base_01_c01.png', a = 0.800000011920929;
  b.win.extras = ([['LT1', 24, 0, 0, 0, 1, 1], ['Top1', 32, 0, 8, 0, 85, 1], ['RT1', 40, 0, 688, 0, 1, 1], ['LT2', 24, 8, 0, 8, 1, 3], ['Top2', 32, 8, 8, 8, 85, 3], ['RT2', 40, 8, 688, 8, 1, 3],
    ['LT3', 72, 0, 0, 32, 1, 1], ['Top3', 56, 0, 8, 32, 85, 1], ['RT3', 80, 0, 688, 32, 1, 1]] as const).map(([name, u, v, x, y, sx, sy]) =>
    ({ id: ids.of(`deck-files/${name}`), cls: 'CSpriteElm', name, tex: base, src: [u, v, 8, 8], x, y, z: 31, wx: X + x, wy: Y + y, wz: z + 1, a, sx, sy, rgba: [1, 1, 1, a], col: [1, 1, 1, a], shown: true }));
  const fp = t.parts(), piece = (name: string, u: number, v: number, x: number, y: number, sx = 1, sy = 1) => t.sprite(fp, `CWindowTaskFrameBottomThickの${name}画像`, base, [u, v, 8, 8], x, y, z, { sx, sy });
  piece('左上', 0, 0, 164, 344); piece('中央上', 8, 0, 172, 344, 85); piece('右上', 16, 0, 852, 344); piece('左中央', 0, 8, 164, 352, 1, 16); piece('右中央', 16, 8, 852, 352, 1, 16);
  piece('左下', 72, 8, 164, 480); piece('中央下', 56, 16, 172, 480, 85); piece('右下', 80, 8, 852, 480);
  piece('下部分の左', 24, 8, 164, 488, 1, 3); piece('下部分の右', 40, 8, 852, 488, 1, 3); piece('下部分の左下', 24, 16, 164, 512); piece('下部分の中央下', 32, 16, 172, 512, 85); piece('下部分の右下', 40, 16, 852, 512);
  piece('下部分の中央部', 32, 8, 172, 488, 85, 3);
  control(b, ids, 'frame', 'CWindowTaskFrameBottomThick', 'FileListframe', { x: 164, y: 344, w: 696, h: 176, z }, { band: 32, style: 1, parts: fp });
  // the list: its rows as the listbox's text (black), the chosen one on a light stripe
  const shown = rows.slice(top, top + 8);
  control(b, ids, 'list', 'CWindowTaskListbox', 'FileListlistbox', { x: 172, y: 352, w: 680, h: 128, z }, { items: rows.map(r => r.label), selected, top, topLine: top, rows: 8 });
  shown.forEach((row, i) => {
    const p = t.parts(), y = 352 + 16 * i, on = top + i === selected;
    if (on) t.sprite(p, 'CWindowTaskBackStripeの画像', base, [8, 8, 8, 8], 172, y, z + 1, { sx: 85, sy: 2, col: [0.55, 0.75, 1, 1] });
    t.label(p, 'CWindowTaskTextのテキスト', `${on ? '@2' : '@0'}${row.label.replace(/@/g, '@@')}`, 180, y, z + 2);
    const rc = control(b, ids, `row${i}`, 'CWindowTaskText', `FileListrow${i}`, { x: 172, y, w: 680, h: 16, z: z + 2 }, { text: row.label, align: 0, fontSize: 16, lineGap: 0, firstLine: 0, pageLines: 1, color: [0, 0, 0, 1], parts: p });
    b.on(rc, { label: row.label, hover: false, click: () => pick(top + i) });
  });
  // the switches: swich_01_c00's nine cells around the label (CWindowTaskTextSwitch), the label a shadow text
  [46, 221, 395, 569].forEach((bx, i) => {
    const btn = buttons[i]; if (!btn) return;
    const w = btn.label.length > 7 ? 82 : 80, x = X + bx, y = 488, sw = 'data/common/window/swich_01_c00.png', p = t.parts(), sx = (w - 16) / 8;
    for (const [name, u, v, px, py, ssx] of [['左上', 0, 0, 0, 0, 1], ['中央上', 8, 0, 8, 0, sx], ['右上', 16, 0, w - 8, 0, 1], ['左中央', 0, 8, 0, 8, 1], ['右中央', 16, 8, w - 8, 8, 1],
      ['左下', 0, 16, 0, 16, 1], ['中央下', 8, 16, 8, 16, sx], ['右下', 16, 16, w - 8, 16, 1], ['中央', 8, 8, 8, 8, sx]] as const)
      t.sprite(p, `CWindowTaskSwitchの${name}画像`, sw, [u, v, 8, 8], x + px, y + py, z + 2, { sx: ssx, col: btn.run ? [1, 1, 1, 1] : [0.6, 0.6, 0.6, 1] });
    const c = control(b, ids, `btn${i}`, 'CWindowTaskTextSwitch', `FileList${['new', 'delete', 'yes', 'no'][i]}Switch`, { x, y, w, h: 24, z: z + 2 }, { label: btn.label, state: btn.run ? 'normal' : 'disabled', checked: false, align: 1, color: [0, 0, 0, 1], shadow: null, parts: p });
    b.on(c, { key: btn.key, label: btn.label, hover: false, click: () => btn.run?.() });
    const lp = t.parts(); t.label(lp, 'CWindowTaskTextのテキスト', btn.label, x, y + 4, z + 4);
    control(b, ids, `btnText${i}`, 'CWindowTaskText', 'CWindowTaskShadowTextのテキスト', { x, y: y + 4, w, h: 16, z: z + 4 }, { text: btn.label, align: 1, fontSize: 16, lineGap: 0, firstLine: 0, pageLines: 1, color: btn.run ? [0, 0, 0, 1] : [0.45, 0.45, 0.45, 1], parts: lp });
  });
  const tp = t.parts(); t.label(tp, 'CWindowTaskTextのテキスト', title, X, Y + 8, z + 3);
  control(b, ids, 'title', 'CWindowTaskText', 'Title', { x: X, y: Y + 8, w: W, h: 24, z: z + 3 }, { text: title, align: 1, fontSize: 24, lineGap: 0, firstLine: 0, pageLines: 100, color: [1, 1, 1, 1], parts: tp });
  return b.spec();
}
