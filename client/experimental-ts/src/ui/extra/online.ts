import type { OnlineAction, OnlineState, Player } from '../../features/online';

/** Drafts belong to the controller and survive replacement of every DOM node. */
export function renderOnlineFeature(state: OnlineState, dispatch: (action: OnlineAction) => void | Promise<void>, section: 'cosmetics' | 'tag'): HTMLElement {
  const root = document.createElement('section'); root.className = `online-feature online-${section}`;
  root.setAttribute('aria-label', section === 'cosmetics' ? 'Cosmetics' : 'Tag Duel');
  const busy = state.loading || state.pending !== null;
  const text = (parent: HTMLElement, tag: string, value: string): HTMLElement => { const node = document.createElement(tag); node.textContent = value; parent.append(node); return node; };
  const button = (parent: HTMLElement, label: string, action: OnlineAction, disabled = false) => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.disabled = busy || disabled;
    node.addEventListener('click', () => { void dispatch(action); }); parent.append(node);
  };
  const select = (parent: HTMLElement, key: string, label: string, choices: { value: string; label: string }[], fallback = '') => {
    const field = text(parent, 'label', `${label} `), node = document.createElement('select'); node.dataset.key = `online-${key}`; node.setAttribute('aria-label', label); node.disabled = busy;
    for (const choice of choices) { const option = document.createElement('option'); option.value = choice.value; option.textContent = choice.label; node.append(option); }
    node.value = state.drafts[key] ?? fallback;
    node.addEventListener('change', () => { state.drafts[key] = node.value; }); field.append(node); return node;
  };
  const playerSelect = (parent: HTMLElement, key: string, label: string, players: Player[]) => select(parent, key, label, [{ value: '', label: 'Choose player' }, ...players.map(x => ({ value: String(x.pid), label: x.name }))]);
  text(root, 'h3', section === 'cosmetics' ? 'Cosmetics' : 'Tag Duel');
  button(root, state.loading ? 'Refreshing…' : 'Refresh', { type: 'refresh' });
  if (state.pending) text(root, 'p', 'Waiting for server confirmation…').setAttribute('role', 'status');
  if (state.error) text(root, 'p', state.error).setAttribute('role', 'alert');
  if (section === 'cosmetics') {
    const data = state.cosmetics;
    if (!data) { text(root, 'p', 'Refresh to load your wardrobe and boxes.'); return root; }
    text(root, 'p', `MP: ${data.wallet.total} total · ${data.wallet.earned} earned · ${data.wallet.bound} bound`);
    if (state.retryAction) { text(root, 'p', 'Previous request is unconfirmed. Retry preserves its token.'); button(root, 'Retry same request', state.retryAction); }
    const receipt = state.receipt?.cosmetics;
    if (receipt?.reward) text(root, 'p', `Server confirmed: ${receipt.reward.name}${receipt.reward.duplicate ? ' (extra copy)' : ' (new cosmetic)'}`).setAttribute('role', 'status');
    if (receipt?.equipped) text(root, 'p', 'Server confirmed equipment update.').setAttribute('role', 'status');
    if (receipt?.appearanceUpdated) text(root, 'p', 'Server confirmed appearance update.').setAttribute('role', 'status');
    if (receipt?.offer) text(root, 'p', `Server confirmed trade: ${receipt.offer.status}`).setAttribute('role', 'status');
    for (const box of data.boxes) {
      const row = text(root, 'article', ''); text(row, 'h4', box.name);
      text(row, 'p', `${box.price} earned MP · ${box.available ? 'Available' : 'Unavailable'}`);
      text(row, 'p', `Next odds: ${Object.entries(box.nextOdds).map(([rarity, chance]) => `${rarity} ${chance.toFixed(2)}%`).join(' · ')}`);
      text(row, 'p', `Super pity: ${box.pity.superMisses}/${box.pity.superAt}${box.pity.ultraAt === null ? '' : ` · Ultra pity: ${box.pity.ultraMisses}/${box.pity.ultraAt}`}`);
      button(row, 'Open box', { type: 'open-box', boxId: box.id }, !box.available || !!state.retryAction);
      const pool = document.createElement('details'); text(pool, 'summary', 'View pool and chances');
      for (const item of box.pool) text(pool, 'p', `${item.name} · ${item.rarity} · base ${item.baseChance.toFixed(2)}% · next ${item.nextChance.toFixed(2)}%`); row.append(pool);
    }
    text(root, 'h4', 'Wardrobe and catalogue');
    const filter = document.createElement('input'); filter.type = 'search'; filter.placeholder = 'Filter cosmetics'; filter.setAttribute('aria-label', 'Filter cosmetics'); filter.dataset.key = 'online-catalog-filter'; filter.value = state.drafts['catalog-filter'] ?? ''; root.append(filter);
    const catalogue = document.createElement('div'); root.append(catalogue);
    const draw = () => { catalogue.replaceChildren(); const query = filter.value.toLocaleLowerCase().slice(0, 256);
      for (const item of data.catalog.filter(x => `${x.name} ${x.kind} ${x.rarity}`.toLocaleLowerCase().includes(query))) {
        const row = text(catalogue, 'div', ''); text(row, 'span', `${item.name} · ${item.rarity} · ${item.owned ? 'Owned' : 'Unowned'} · ${item.tradable} extra copies `);
        button(row, 'Equip', { type: 'equip', id: item.id, world: data.appearance.world }, !item.owned || !item.variants.some(v => v.gender === data.appearance.gender && v.worlds.includes(data.appearance.world)));
      }
    }; filter.addEventListener('input', () => { state.drafts['catalog-filter'] = filter.value; draw(); }); draw();
    text(root, 'h4', 'Appearance');
    const appearance = document.createElement('form');
    const controls = data.appearanceOptions.map(option => ({ index: option.index, node: select(appearance, `appearance-${data.appearance.world}-${option.index}`, option.label, option.choices.map(x => ({ value: String(x.value), label: x.label })), String(data.appearance.parts[option.index])) }));
    const save = text(appearance, 'button', 'Save appearance') as HTMLButtonElement; save.type = 'submit'; save.disabled = busy;
    appearance.addEventListener('submit', e => { e.preventDefault(); const parts = [...data.appearance.parts]; for (const c of controls) parts[c.index] = Number(c.node.value); void dispatch({ type: 'appearance', world: data.appearance.world, parts }); }); root.append(appearance);
    button(root, 'Use male appearance', { type: 'appearance', gender: 'male' }); button(root, 'Use female appearance', { type: 'appearance', gender: 'female' });
    text(root, 'h4', 'Duplicate trades');
    for (const offer of data.trades) { const row = text(root, 'article', ''); text(row, 'p', `${offer.fromName} → ${offer.toName} · Gives ${offer.give.map(x => `${x.count} × ${x.id}`).join(', ')} · Wants ${offer.want.map(x => `${x.count} × ${x.id}`).join(', ')}`);
      if (offer.outbound) button(row, 'Cancel offer', { type: 'trade-cancel', offerId: offer.id });
      else { button(row, 'Accept offer', { type: 'trade-accept', offerId: offer.id }); button(row, 'Decline offer', { type: 'trade-decline', offerId: offer.id }); }
    }
    const form = document.createElement('form'), target = playerSelect(form, 'trade-target', 'Trade with', data.players);
    const give = select(form, 'trade-give', 'Give one extra copy', data.catalog.filter(x => x.tradable > 0).map(x => ({ value: x.id, label: x.name })));
    const want = select(form, 'trade-want', 'Request one copy', data.catalog.map(x => ({ value: x.id, label: x.name })));
    const offer = text(form, 'button', 'Offer trade') as HTMLButtonElement; offer.type = 'submit'; offer.disabled = busy || !!state.retryAction;
    form.addEventListener('submit', e => { e.preventDefault(); if (target.value && give.value && want.value) void dispatch({ type: 'trade', targetPid: Number(target.value), give: [{ id: give.value, count: 1 }], want: [{ id: want.value, count: 1 }], requestId: crypto.randomUUID() }); }); root.append(form);
  } else {
    const data = state.tag;
    if (!data) { text(root, 'p', 'Refresh to load Tag Duel invitations.'); return root; }
    text(root, 'p', data.active ? 'Server reports an active Tag Duel.' : data.available ? 'Available for Tag Duel' : `Unavailable: ${data.reason ?? 'server rules'}`);
    text(root, 'p', 'Four players, shared captain decks and LP. No ranked rewards.');
    if (data.event) text(root, 'p', `${data.event.kind}${data.event.name ? `: ${data.event.name}` : ''}`).setAttribute('role', 'status');
    for (const invitation of data.invitations) {
      const row = text(root, 'article', ''); text(row, 'h4', 'Tag invitation'); text(row, 'p', `Expires ${new Date(invitation.expires * 1000).toLocaleTimeString()}`);
      for (const seat of invitation.seats) text(row, 'p', `${seat.role}: ${seat.name} · ${seat.accepted ? 'Accepted' : 'Waiting'}`);
      if (invitation.outbound) button(row, 'Cancel invitation', { type: 'tag-cancel', id: invitation.id });
      else { button(row, 'Accept invitation', { type: 'tag-accept', id: invitation.id }, !!invitation.seats.find(s => s.pid === data.self.pid)?.accepted); button(row, 'Decline invitation', { type: 'tag-decline', id: invitation.id }); }
    }
    const form = document.createElement('form'), teammate = playerSelect(form, 'tag-teammate', 'Teammate', data.players), opponent = playerSelect(form, 'tag-opponent', 'Opponent captain', data.players), other = playerSelect(form, 'tag-other', 'Opponent teammate', data.players);
    const submit = text(form, 'button', 'Invite to Tag Duel') as HTMLButtonElement; submit.type = 'submit'; submit.disabled = busy || !data.available || data.players.length < 3;
    const validation = text(form, 'p', ''); validation.setAttribute('role', 'alert');
    form.addEventListener('submit', e => { e.preventDefault(); const ids = [teammate.value, opponent.value, other.value].map(Number); if (ids.some(x => !x) || new Set(ids).size !== 3) { validation.textContent = 'Choose three different players.'; return; } void dispatch({ type: 'tag-invite', teammatePid: ids[0], opponentPid: ids[1], opponentTeammatePid: ids[2] }); }); root.append(form);
  }
  return root;
}
