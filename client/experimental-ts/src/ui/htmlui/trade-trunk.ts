// The trade's trunk (the trade scene reuses the deck screen's CWindowModelKaban: screens/deck.js "the trade reuses
// CWindowModelKaban / Deck", main's captures mock/trade-present.json / trade-tp.json: the trunk at 736, 0, 288 x 712)
// through main's deck module, as the deck editor's (htmlui/deck.ts kabanWindow), its rows' pictures and input through
// the deck editor's card layer (deck-dom.ts, its own instance). Outside the deck editor main's module draws the trunk
// as the engine has it: no search panel, the game's header (screens/deck.js EDITOR_SCENE). The rows are the cards this
// side may still offer, each with its copies left (the trade's trunk less soul-bound and offered copies); a press on a
// row offers that card, the wheel scrolls the list; the
// count box shows the cards offered. Taking a card back is the trade window's (htmlui/trade.ts). Pure but for the
// scene object's callbacks.
import { peekTable } from '@htmlui/crafting/cards.js';
import type { SocialAction, SocialTrade } from '../../features/social';
import { tradeableCopies } from '../../features/social';
import type { CardView, DeckView } from '../contracts';
import { attrOf, deckUi, detailWindow, emptyKabanFilter, isMonster, kabanWindow, raceOf, ROW_H, type DeckFrom } from './deck';
/** The rows Card Swap's trunk shows (live: nine above the chat window). */
export const TRADE_ROWS = 9;
import type { PowerIcons } from './deck-dom';
import type { DeckDomScene } from './deck-dom';
import type { HtmlWindow, Ids, WindowSpec } from './snapshot';

/** The trade trunk's window is marked so the deck editor's card layer leaves it to the trade's. */
export const isTradeTrunk = (w: HtmlWindow): boolean => w.tradeTrunk === true;

export class TradeTrunk implements DeckDomScene {
  readonly ui = deckUi();
  private cards: CardView[] = [];
  private byPc = new Map<number, CardView>();
  constructor(private o: { card(passcode: number): CardView; dispatch(action: SocialAction): void; rerender(): void; editable(): boolean }) {}

  /** The trunk window for this trade (null while this side cannot offer: the trunk closes once ready, as live). */
  window(ids: Ids, t: SocialTrade, open: boolean): WindowSpec | null {
    if (!open) { this.cards = []; this.byPc.clear(); return null; }
    const offered = this.offered; offered.clear(); for (const pc of t.ownOffer) offered.set(pc, (offered.get(pc) ?? 0) + 1);
    const seen = new Set<number>(); this.cards = []; this.byPc.clear();
    for (const entry of t.view.trunk) {
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
    const spec = kabanWindow({ ids, ui: this.ui, deck, card: pc => this.byPc.get(pc), trunk: this.cards, busy: !this.o.editable(), yo2: pc => peekTable()?.id(pc) ?? 0, owned: deck.main.length });   // the count box: the cards offered
    spec.win.tradeTrunk = true;
    // in Card Swap the trunk stops at the chat window (live: 608 high, nine rows; the editor's runs to 712, eleven)
    for (const c of spec.win.controls) {
      const wy = Number(c.wy ?? c.y);
      if (wy >= 88 + ROW_H * TRADE_ROWS && wy < 712) c.shown = false;
      if (c.cls === 'CWindowTaskFrameThin') {
        // its pieces (deck.ts frameThin): the bottom row up to 600, the sides stretched to the new height
        c.h = 528;
        for (const p of (c.parts as { sprites: { name: string; wy: number; sy: number }[] }).sprites) {
          if (p.wy === 80 + 632 - 8) p.wy = 80 + 528 - 8;
          else if (/左中央|右中央/.test(p.name)) p.sy = (528 - 16) / 8;
        }
      }
    }
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
  private offer(passcode: number): void { if (this.o.editable() && this.byPc.has(passcode)) this.o.dispatch({ type: 'addTradeCard', passcode }); }
  pick(zone: DeckFrom, _index: number, passcode: number): void {
    if (zone !== 'trunk') return;
    this.shownCard = this.byPc.get(passcode) ?? null; this.ui.shown = passcode;
    this.offer(passcode); this.o.rerender();
  }
  toggleDetail(): void { this.ui.detail = this.ui.detail === 0 ? 2 : 0; this.o.rerender(); }
  // (a double-click's presses already offered: no second offer from its dblclick)
  quick(): void {}
  wheel(rows: number): void {
    const top = Math.max(0, Math.min(this.ui.top + rows, Math.max(0, this.cards.length - TRADE_ROWS)));
    if (top !== this.ui.top) { this.ui.top = top; this.o.rerender(); }
  }
  dragTo(): void {}
  dropOn(): void {}
  hover(): void {}
  sideButton(): void {}
  tab(): void {}
  fileRow(): void {}
}
