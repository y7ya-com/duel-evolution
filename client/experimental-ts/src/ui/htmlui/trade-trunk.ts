// The trade's trunk (the trade scene reuses the deck screen's CWindowModelKaban: screens/deck.js "the trade reuses
// CWindowModelKaban / Deck", main's captures mock/trade-present.json / trade-tp.json: the trunk at 736, 0, 288 x 608)
// through main's deck module, as the deck editor's (htmlui/deck.ts kabanWindow), its rows' pictures and input through
// the deck editor's card layer (deck-dom.ts, its own instance). Outside the deck editor main's module draws the trunk
// as the engine has it: no search panel, the game's header (screens/deck.js EDITOR_SCENE): 'Trunk' over 'Rearrange',
// the six colour keys and nine filter icons (drawn by the card layer: engineKeys), the list's own scroll bar. As live
// (its snapshot in a trade): nine rows in the order of the cards' YO2 numbers (the card box's), each with its copies
// left (the trade's trunk less soul-bound and offered copies); the count box the trunk's copies. A press on a row shows
// the card in the detail and picks it up; dropped on this side's offer area it is offered (live drags it there, as in
// the deck editor); the wheel scrolls the list. Taking a card back is the trade window's (htmlui/trade.ts). Pure but
// for the scene object's callbacks.
import { peekTable, loadTable } from '@htmlui/crafting/cards.js';
import type { SocialAction, SocialTrade } from '../../features/social';
import { tradeableCopies } from '../../features/social';
import type { CardView, DeckView } from '../contracts';
import { attrOf, deckUi, detailWindow, emptyKabanFilter, isMonster, kabanWindow, raceOf, type DeckFrom } from './deck';
/** The rows Card Swap's trunk shows (live: nine above the chat window). */
export const TRADE_ROWS = 9;
/** Where a card from the trunk is dropped to offer it: this side's offer area (trade.ts, 256, 328, 472 x 240). */
export const TRADE_DROP = { main: [256, 328, 472, 240] } as const;
import type { PowerIcons } from './deck-dom';
import type { DeckDomScene } from './deck-dom';
import type { HtmlWindow, Ids, WindowSpec } from './snapshot';

/** The trade trunk's window is marked so the deck editor's card layer leaves it to the trade's. */
export const isTradeTrunk = (w: HtmlWindow): boolean => w.tradeTrunk === true;

export class TradeTrunk implements DeckDomScene {
  // nine rows (live's 608-high trunk over the chat window: deck.ts trunkRows / shortBy)
  readonly ui = Object.assign(deckUi(), { tall: false });
  private cards: CardView[] = [];
  private byPc = new Map<number, CardView>();
  constructor(private o: { card(passcode: number): CardView; dispatch(action: SocialAction): void; rerender(): void; editable(): boolean }) {}

  /** The trunk window for this trade (null while this side cannot offer: the trunk closes once ready, as live). */
  window(ids: Ids, t: SocialTrade, open: boolean): WindowSpec | null {
    if (!open) { this.cards = []; this.byPc.clear(); return null; }
    const offered = this.offered; offered.clear(); for (const pc of t.ownOffer) offered.set(pc, (offered.get(pc) ?? 0) + 1);
    const seen = new Set<number>(); this.cards = []; this.byPc.clear();
    // live lists the trunk by the cards' YO2 numbers (the engine's card box order), whatever order the server sent
    // (the card wire's table asked for once a while until it has come, as the deck editor does)
    if (!peekTable() && Date.now() - this.tableAsked > 15000) { this.tableAsked = Date.now(); void loadTable().then(t => { if (t) this.o.rerender(); }, () => {}); }
    const yo2 = (pc: number) => peekTable()?.id(pc) || 1e9;
    const entries = t.view.trunk.map((e, i) => ({ e, i, n: yo2(e.passcode) })).sort((a, b) => a.n - b.n || a.i - b.i).map(x => x.e);
    for (const entry of entries) {
      if (seen.has(entry.passcode)) continue; seen.add(entry.passcode);
      const left = tradeableCopies(t, entry.passcode); if (left < 1) continue;
      // owned = what may be offered plus what is offered (the deck's copies: the offer), so the row's figure is the
      // copies left; no banlist dimming (limit 3): a trade is no deck; no rarity badge (main's crafting mark, the
      // deck editor's own addition)
      const { rarity: _rarity, ...base } = this.o.card(entry.passcode);
      const card: CardView = { ...base, owned: left + (offered.get(entry.passcode) ?? 0), limit: 3 };
      this.cards.push(card); this.byPc.set(entry.passcode, card);
    }
    const deck: DeckView = { name: '', main: [...t.ownOffer], side: [], extra: [] };
    this.ui.filter = emptyKabanFilter();
    // the count box: the trunk's copies, the offered ones too (live's 53 for 50 rows)
    const copies = this.cards.reduce((n, c) => n + (c.owned ?? 0), 0);
    const spec = kabanWindow({ ids, ui: this.ui, deck, card: pc => this.byPc.get(pc), trunk: this.cards, busy: !this.o.editable(), yo2: pc => peekTable()?.id(pc) ?? 0, owned: copies, engine: TRADE_ROWS });
    spec.win.tradeTrunk = true;
    // the wheel over the list a row a notch, as the editor's
    const list = spec.win.controls.find(c => c.cls === 'CWindowTaskKabanList');
    if (list) spec.handlers.set(list.id, { hover: false, wheel: d => this.wheel(d > 0 ? 1 : -1) });
    return spec;
  }
  /** The card detail beside the menu (CCardDetailViewDlg at 0, 175: live shows it in Card Swap too): the card last
   * pressed in the trunk, the card back before. */
  detail(ids: Ids): WindowSpec {
    const spec = detailWindow({ ids, ui: this.ui, deck: null, card: pc => this.byPc.get(pc) ?? (pc === this.ui.shown ? this.shownCard ?? undefined : undefined), trunk: [], busy: false, yo2: pc => peekTable()?.id(pc) ?? 0, owned: 0 });
    spec.win.tradeTrunk = true;
    return spec;
  }
  /** What the card layer draws in the detail: the big picture and a monster's power icons. */
  detailView(): { passcode: number; power: PowerIcons | null } | null {
    if (this.ui.detail !== 0) return null;
    const c = this.ui.shown ? this.byPc.get(this.ui.shown) ?? this.shownCard ?? undefined : undefined;
    return { passcode: c?.passcode ?? 0, power: c && isMonster(c) ? { race: raceOf(c), attr: attrOf(c), level: c.level ?? 0 } : null };
  }
  private shownCard: CardView | null = null;
  card(passcode: number): CardView | undefined { return this.byPc.get(passcode); }
  /** Every row of the list (not only the shown ones), with its copies left: for tests and assistive tools. */
  list(): { name: string; passcode: number; left: number; row: number }[] { return this.cards.map((c, i) => ({ name: c.name, passcode: c.passcode!, left: (c.owned ?? 0) - (this.offered.get(c.passcode!) ?? 0), row: i })); }
  /** Scroll the list so a row shows (the wheel's way). */
  reveal(row: number): void { const top = Math.max(0, Math.min(row, Math.max(0, this.cards.length - TRADE_ROWS))); if (row < this.ui.top || row >= this.ui.top + TRADE_ROWS) { this.ui.top = top; this.o.rerender(); } }
  private offered = new Map<number, number>();
  private tableAsked = 0;
  private offer(passcode: number): void { if (this.o.editable() && this.byPc.has(passcode)) this.o.dispatch({ type: 'addTradeCard', passcode }); }
  /** A press on a row: the card into the detail, and held (live: a click only shows it; a drag offers it). */
  pick(zone: DeckFrom, index: number, passcode: number, at: [number, number]): void {
    if (zone !== 'trunk') return;
    this.shownCard = this.byPc.get(passcode) ?? null; this.ui.shown = passcode;
    if (this.o.editable() && (this.offerLeft(passcode) > 0)) this.ui.drag = { passcode, from: 'trunk', index, at, start: at, moved: false };
    this.o.rerender();
  }
  private offerLeft(passcode: number): number { const c = this.byPc.get(passcode); return c ? (c.owned ?? 0) - (this.offered.get(passcode) ?? 0) : 0; }
  dragTo(at: [number, number]): void {
    const g = this.ui.drag; if (!g) return;
    g.at = at; if (!g.moved && Math.hypot(at[0] - g.start[0], at[1] - g.start[1]) > 4) g.moved = true;
    if (g.moved) this.o.rerender();
  }
  /** The held card let go: over this side's offer area (the card layer's 'main' zone, TRADE_DROP) it is offered. */
  dropOn(zone: DeckFrom | null): void {
    const g = this.ui.drag; this.ui.drag = null;
    if (g?.moved && zone === 'main') this.offer(g.passcode);
    this.o.rerender();
  }
  dragView(): { passcode: number; at: [number, number] } | null { const g = this.ui.drag; return g?.moved ? { passcode: g.passcode, at: g.at } : null; }
  toggleDetail(): void { this.ui.detail = this.ui.detail === 0 ? 2 : 0; this.o.rerender(); }
  // (live: a double-click shows the card, as a click; it offers nothing)
  quick(): void {}
  wheel(rows: number): void {
    const top = Math.max(0, Math.min(this.ui.top + rows, Math.max(0, this.cards.length - TRADE_ROWS)));
    if (top !== this.ui.top) { this.ui.top = top; this.o.rerender(); }
  }
  hover(): void {}
  sideButton(): void {}
  tab(): void {}
  fileRow(): void {}
}
