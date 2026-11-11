import type { SocialAction, SocialTrade } from '../../features/social';
import { tradeableCopies } from '../../features/social';
import type { CardView } from '../contracts';

export interface SocialUIOptions {
  /** Display data for a passcode (name, art); identities only come from the server. */
  card?: (passcode: number) => CardView;
  drawCard?: (card: CardView) => HTMLElement;
  /** The account's friends from GET /api/de/friends: name, online state and place. */
  friendList?: readonly { id?: string | number; name: string; online?: boolean; status?: string }[];
  onWhisper?: (name: string) => void;
  onDuel?: (pid: number) => void;
}

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, value?: string, className = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag); if (value !== undefined) node.textContent = value; if (className) node.className = className; return node;
};
/** The trade window: shown over any scene while a trade is in progress. Cards are shown, never typed. */
/** The trade scene's ground and its trunk (the cards this side may offer), under main's trade windows (src/ui/htmlui/
 * trade.ts): main's deck-scene backdrop (screens/deck.js deckBackdrop) and the rewrite's picker where main's trunk
 * (CWindowModelKaban, 736, 0, 288 x 608) stands, until the deck editor's trunk is ported. Only copies the server lets
 * this side offer (tradeableCopies: the trunk less the soul-bound limit table and what is offered already). */
export function renderTradeTrunk(trade: SocialTrade, dispatch: (action: SocialAction) => void, options: SocialUIOptions & { search?: string; onSearch?: (value: string) => void; backdrop?: (el: HTMLElement) => void; open: boolean }): HTMLElement {
  const root = make('section', undefined, 'de-trade-scene'); root.setAttribute('aria-label', 'Card Swap');
  options.backdrop?.(root);
  if (!options.open) return root;
  const card = (passcode: number) => options.card?.(passcode) ?? { id: String(passcode), passcode, name: `Card ${passcode}` };
  const editable = trade.phase === 'open' && !trade.view.ready && !trade.view.otherReady && !trade.pendingMove;
  const trunk = make('section', undefined, 'de-trade-trunk-panel'); trunk.setAttribute('aria-label', 'Trunk');
  const head = make('header'); head.append(make('h3', 'Trunk'), make('span', `${trade.ownOffer.length}/10`, 'de-trade-count'));
  const query = (options.search ?? '').toLowerCase(), search = make('input'); search.type = 'search'; search.placeholder = 'Search your cards'; search.value = options.search ?? '';
  search.dataset.key = 'trade-search'; search.setAttribute('aria-label', 'Search your cards'); search.oninput = () => options.onSearch?.(search.value);
  const list = make('div', undefined, 'de-trade-trunk'); list.setAttribute('role', 'list');
  const entries = trade.view.trunk.filter(entry => tradeableCopies(trade, entry.passcode) > 0 && (!query || card(entry.passcode).name.toLowerCase().includes(query))).slice(0, 60);
  for (const entry of entries) {
    const view = card(entry.passcode), left = tradeableCopies(trade, entry.passcode), row = make('div', undefined, 'de-trade-card'); row.title = view.name; row.setAttribute('role', 'listitem');
    row.dataset.key = `trade-trunk:${entry.passcode}`;
    if (options.drawCard) { const art = make('span', undefined, 'de-trade-thumb'); art.append(options.drawCard(view)); row.append(art); }
    const add = make('button', `Offer (×${left})`); add.type = 'button'; add.disabled = !editable || trade.ownOffer.length >= 10;
    add.setAttribute('aria-label', `Offer ${view.name}`); add.onclick = () => dispatch({ type: 'addTradeCard', passcode: entry.passcode });
    row.append(make('span', view.name, 'de-trade-name'), add); list.append(row);
  }
  if (!entries.length) list.append(make('p', query ? 'No matching cards.' : 'No tradeable cards.', 'de-note'));
  trunk.append(head, search, list);
  if (trade.pendingMove) trunk.append(make('p', 'Updating your offer…', 'de-note'));
  root.append(trunk);
  return root;
}
