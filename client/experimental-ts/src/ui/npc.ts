import type { NpcState } from '../features/npc';
import type { CardView, ClientCommand } from './contracts';

export type NpcCommand = Extract<ClientCommand, { type: 'npcAnswer' | 'npcAdvance' | 'npcClose' | 'npcRefreshInventory' | 'npcSelectPack' }>;
export interface NpcPanelOptions {
  /** Receipt wire IDs need an explicit catalog mapping; do not guess passcodes. */
  resolveCard?(id: number): CardView | undefined;
  renderCard?(card: CardView): HTMLElement;
  packName?(id: number): string | undefined;
  busy?: boolean;
  /** main's pack picker (htmlui/npc-pack.ts, CWindowPackSelect) takes the pack pick: the panel leaves its buttons out. */
  htmlPackSelect?: boolean;
}
/** State comes from acknowledged native dialogue/grant orchestration, never local outcomes. */
export function renderNpcFeature(state: Readonly<NpcState>, dispatch: (command: NpcCommand) => void, options: NpcPanelOptions = {}): HTMLElement {
  const root = document.createElement('section'); root.className = 'de-panel de-npc-panel de-stack'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'NPC interaction');
  const text = (tag: 'h2' | 'h3' | 'p', value: string, cls = '') => { const node = document.createElement(tag); node.className = cls; node.textContent = value; root.append(node); return node; };
  const button = (label: string, command: NpcCommand, disabled = false) => { const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.disabled = !!options.busy || disabled; node.dataset.key = `npc:${state.npc?.id}:${command.type}:${'pack' in command ? command.pack : label}`; node.onclick = () => { if (!node.disabled) dispatch(command); }; root.append(node); return node; };
  text('h2', state.npc?.name ?? 'NPC', 'de-panel-title');
  if (state.error) text('p', state.error, 'de-error').setAttribute('role', 'alert');
  const contactBlocked = state.firstContactStatus === 'pending' || state.firstContactStatus === 'uncertain';
  const eligibilityBlocked = state.eligibility?.refreshing || state.eligibility?.status === 'pending' || state.eligibility?.status === 'uncertain';
  if (state.eligibility?.refreshing || state.eligibility?.status === 'pending') text('p', 'Updating NPC eligibility…', 'de-note').setAttribute('role', 'status');
  if (state.eligibility?.status === 'uncertain') text('p', 'NPC eligibility could not be confirmed. Disconnect and reconnect to refresh progress.', 'de-note');
  if (state.firstContactStatus && !['idle', 'confirmed'].includes(state.firstContactStatus)) text('p', `First meeting: ${state.firstContactStatus === 'pending' ? 'waiting for server confirmation' : state.firstContactStatus === 'confirmed' ? 'confirmed by server' : state.firstContactStatus === 'uncertain' ? 'delivery uncertain; refresh NPC progress before continuing' : 'server refused the claim'}`, 'de-note').setAttribute('role', 'status');
  if (state.stage === 'ask') { text('p', 'Would you like to duel?'); button('Duel NPC', { type: 'npcAnswer', accept: true }, contactBlocked); button('Just Talk', { type: 'npcAnswer', accept: false }, contactBlocked); return root; }
  if (state.result) text('h3', state.result === 1 ? 'Duel Won' : state.result === 2 ? 'Duel Lost' : 'Duel Drawn');
  // Lines whose original text is unknown (unmapped result lines) are left out rather than shown as placeholders.
  if (state.dialogue?.known) text('p', state.dialogue.text, 'de-npc-dialogue');
  if (state.stage === 'after-duel' && !state.settlementReceived) text('p', 'Waiting for the server result and available rewards…').setAttribute('role', 'status');
  if (['opening', 'greeting', 'after-duel', 'won', 'lost', 'item'].includes(state.stage)) button(['won', 'lost', 'item'].includes(state.stage) ? 'Receive Gift' : 'Continue', { type: 'npcAdvance' }, state.stage === 'after-duel' && !state.settlementReceived);
  if (state.settlementReceived && state.result && state.packs.length && !(options.htmlPackSelect && state.packStatus === 'idle')) {
    text('h3', 'Choose a Reward Pack');
    for (const pack of state.packs) button(options.packName?.(pack) ?? `Reward Pack ${pack}`, { type: 'npcSelectPack', pack }, state.packStatus !== 'idle');
  }
  for (const [name, status] of [['Reward pack', state.packStatus], ['Gift', state.giftStatus]] as const) if (status !== 'idle') text('p', `${name}: ${status === 'pending' ? 'waiting for server confirmation' : status === 'confirmed' ? 'confirmed by server' : status === 'uncertain' ? 'delivery uncertain; refresh inventory before taking further action' : 'server refused the claim'}`, 'de-note').setAttribute('role', 'status');
  const receipts = [...state.cards.map(card => ({ id: card.id, isNew: card.isNew, source: 'pack' })), ...state.giftCards.map(id => ({ id, isNew: false, source: 'gift' }))];
  if (receipts.length) {
    text('h3', `Received Cards (${receipts.length})`); const grid = document.createElement('div'); grid.className = 'de-receipt-cards';
    for (const receipt of receipts.slice(0, 80)) { const row = document.createElement('article'), card = options.resolveCard?.(receipt.id), label = document.createElement('p'); if (card && options.renderCard) row.append(options.renderCard(card)); label.textContent = `${card?.name ?? `Card ID ${receipt.id}`}${receipt.isNew ? ' · New' : ''}`; row.append(label); grid.append(row); }
    root.append(grid); if (receipts.length > 80) text('p', `Showing 80 of ${receipts.length} cards.`, 'de-note');
  }
  if (state.giftBits.length) text('p', `${state.giftBits.length} item rewards confirmed. Item names are unavailable.`, 'de-note');
  if (state.refreshPending) text('p', 'Refreshing inventory…', 'de-note');
  if (state.packStatus === 'uncertain' || state.giftStatus === 'uncertain' || state.packStatus === 'confirmed' || state.giftStatus === 'confirmed') button('Refresh Inventory', { type: 'npcRefreshInventory' }, state.refreshPending);
  if (state.stage === 'done' || state.stage === 'claiming' && state.giftStatus === 'uncertain') button('Close NPC', { type: 'npcClose' }, !!eligibilityBlocked || state.packStatus === 'pending' || state.giftStatus === 'pending' || state.packs.length > 0 && state.packStatus === 'idle');
  return root;
}
