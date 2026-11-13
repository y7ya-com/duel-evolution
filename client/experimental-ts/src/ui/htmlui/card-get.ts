// The card get scene after an NPC duel's reward pack, as live shows it (livetour 49-card-get: the scene after the pack
// pick's OK): the pack scene's checker backdrop (main's packselect.js, from its window kept with its frame hidden), the
// card got in the middle (100 x 144 at 512, 271), the card detail at the left (CCardDetailViewDlg: the deck screen's,
// main's deck.js, its big picture and power icons the card layer's, deck-dom.ts) and a gold "Back" plate at the bottom
// right (800, 680, 162 x 42). Back shows the next card, the last one ends the scene (the NPC's lines follow, in the
// lobby). One scene per card of the pack (the server's 0x4803 receipt).
import type { CardView } from '../contracts';
import { attrOf, deckUi, detailWindow, isMonster, raceOf, type DeckFrom } from './deck';
import type { DeckDomScene, PowerIcons } from './deck-dom';
import { cardGetBackdrop } from './npc-pack';
import { peekTable } from '@htmlui/crafting/cards.js';
import { WindowBuilder, type HtmlWindow, type Ids, type WindowSpec } from './snapshot';

export interface CardGetDeps {
  card(passcode: number): CardView | undefined;
  rerender(): void;
}
/** The card get windows are marked so the deck editor's card layer leaves them to the scene's own. */
export const isCardGet = (w: HtmlWindow): boolean => w.cardGet === true;
export const CARD_GET_CARD = { x: 512, y: 271, w: 100, h: 144 } as const;
export const CARD_GET_BACK = { x: 800, y: 680, w: 162, h: 42 } as const;

export class CardGetScene implements DeckDomScene {
  readonly ui = deckUi();
  private key = '';
  private at = 0;
  constructor(private d: CardGetDeps) {}

  /** Whether cards of this receipt (its key: the NPC session and the pack) are still to be shown. */
  pending(key: string, cards: readonly number[]): boolean { this.sync(key); return this.at < cards.length; }
  private sync(key: string): void { if (key !== this.key) { this.key = key; this.at = 0; } }

  /** The scene's windows for the receipt's next card (back to front), none once all were shown. */
  windows(ids: Ids, key: string, cards: readonly number[]): WindowSpec[] {
    this.sync(key);
    const passcode = cards[this.at]; if (passcode === undefined) { this.ui.shown = 0; return []; }
    this.ui.shown = passcode;
    const c = this.d.card(passcode), out: WindowSpec[] = this.waiting(ids);
    // live's card detail here: "[Fairy/LIGHT]" (no Normal kind) and grey (its frame, bars and planes under the scene's
    // dim; the card's picture, the card layer's, keeps its colours)
    const plain = (pc: number) => { const c = this.d.card(pc); return c && { ...c, type: (c.type ?? '').split('/').filter(k => k.trim() !== 'Normal').join('/') }; };
    const detail = detailWindow({ ids, ui: this.ui, deck: null, card: plain, trunk: [], busy: false, yo2: pc => peekTable()?.id(pc) ?? 0, owned: 0 });
    const after = detail.after; detail.after = root => { after?.(root); root.style.filter = 'brightness(.56)'; };
    out.push(detail);
    out.push(new WindowBuilder(ids, 'card-get:card', 'CEnginePictures', { x: 0, y: 0, w: 1024, h: 768 }, { z: 51305,
      pics: [{ key: 'card', source: { card: passcode }, ...CARD_GET_CARD, z: 0, shown: true, label: c?.name ?? 'The card' }] }).spec());
    const { x, y, w, h } = CARD_GET_BACK, b = new WindowBuilder(ids, 'card-get:back', 'CWindowResultNext', { x, y, w, h }, { z: 51310 });
    const back = b.add('CWindowTaskResultNext', 'back', { x: 0, y: 0, w, h }, { label: '', align: 1, state: 'normal' });
    b.on(back, { key: 'card-get-back', label: 'Back', click: () => { this.at++; this.d.rerender(); } });
    // the word black, about 22 px (result.js draws a plate's words as its ShadowText; live's has no edge)
    b.add('CWindowTaskShadowText', 'word', { x: 0, y: 8, w, h: 26 }, { text: 'Back', align: 1, fontSize: 22, color: [0, 0, 0, 1] });
    out.push(b.spec());
    for (const s of out) s.win.cardGet = true;
    return out;
  }
  /** The scene's backdrop alone (the claim on its way to the server): main's pack picker draws it while its window is
   * there, here wordless (its frame hidden). */
  waiting(ids: Ids): WindowSpec[] {
    const host = new WindowBuilder(ids, 'card-get:scene', 'CWindowPackSelect', { x: 124, y: 576, w: 400, h: 200 }, { z: 51300, cardGet: true,
      extras: [{ id: ids.of('card-get:frame'), cls: 'CSpriteElm', tex: 'data/card_get/cardget_win_01.png', shown: false } as { id: number; cls: string }] }).spec();
    host.snap = { packScene: { backdrop: cardGetBackdrop(), packs: [], frame: null } };
    return [host];
  }
  /** What the card layer draws in the detail: the big picture and a monster's power icons. */
  detailView(): { passcode: number; power: PowerIcons | null } | null {
    const c = this.ui.shown ? this.d.card(this.ui.shown) : undefined; if (!c) return null;
    return { passcode: c.passcode ?? 0, power: isMonster(c) ? { race: raceOf(c), attr: attrOf(c), level: c.level ?? 0 } : null };
  }
  card(passcode: number): CardView | undefined { return this.d.card(passcode); }
  pick(_zone: DeckFrom, _index: number, passcode: number): void { this.ui.shown = passcode; this.d.rerender(); }
  dragTo(): void {}
  dropOn(): void {}
  quick(): void {}
  wheel(): void {}
  hover(): void {}
  sideButton(): void {}
  tab(): void {}
  // live's detail keeps its picture (the ▽ key shrinks it as the deck screen's)
  toggleDetail(): void { this.ui.detail = this.ui.detail === 0 ? 2 : 0; this.d.rerender(); }
  fileRow(): void {}
}
