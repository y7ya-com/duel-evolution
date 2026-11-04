import type { SocialAction, SocialState, SocialTrade } from '../../features/social';
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
const make2 = (dispatch: (action: SocialAction) => void, state: SocialState) => {
  const button = (label: string, run: () => void, disabled = false, gold = false): HTMLButtonElement => {
    const node = make('button', label, gold ? 'gold' : ''); node.type = 'button'; node.disabled = disabled; node.onclick = run; return node;
  };
  /** Irreversible actions need a second, explicit click. */
  const confirm = (label: string, explanation: string, run: () => void, disabled = false): HTMLElement => {
    const wrap = make('span', undefined, 'de-confirm');
    const show = (): void => { wrap.replaceChildren(button(label, () => {
      wrap.replaceChildren(make('span', explanation), button('Confirm', run, false, true), button('Keep editing', show));
    }, disabled)); };
    show(); return wrap;
  };
  /** Drafts live in the controller so live rerenders keep them. */
  const field = (form: HTMLElement, name: string, kind: 'text' | 'textarea' = 'text', max = 0, placeholder = ''): HTMLInputElement | HTMLTextAreaElement => {
    const label = make('label', name); const input = kind === 'textarea' ? make('textarea') : make('input');
    if (input.tagName === 'INPUT') (input as HTMLInputElement).type = 'text';
    input.dataset.key = `social-${name}`; input.value = state.drafts[name] ?? ''; input.placeholder = placeholder;
    input.oninput = () => dispatch({ type: 'editDraft', key: name, value: input.value });
    input.required = true; if (max) input.maxLength = max; input.name = name;
    label.append(input); form.append(label); return input;
  };
  return { button, confirm, field };
};

/** Friends & Mail: find players by name, friends, requests, ignores, mail and team. Server text is always literal. */
export function renderSocialFeature(state: SocialState, dispatch: (action: SocialAction) => void, options: SocialUIOptions = {}): HTMLElement {
  const { button, confirm, field } = make2(dispatch, state);
  const root = make('section', undefined, 'social-feature'); root.setAttribute('aria-label', 'Social');
  const section = (name: string, className: string): HTMLElement => { const node = make('section', undefined, `de-social-card ${className}`); node.append(make('h3', name)); root.append(node); return node; };
  if (state.error) { const error = make('p', state.error, 'de-error'); error.setAttribute('role', 'alert'); root.append(error); }

  // Find a player by name, then act on them.
  const find = section('Find a Player', 'de-social-find'), findForm = make('form', undefined, 'de-row');
  const nameInput = field(findForm, 'Player name', 'text', 15, 'Exact player name') as HTMLInputElement;
  const go = make('button', 'Find', 'gold'); go.type = 'submit'; findForm.append(go);
  findForm.onsubmit = event => { event.preventDefault(); if (nameInput.value.trim()) dispatch({ type: 'findPlayer', name: nameInput.value.trim() }); };
  find.append(findForm);
  const searched = state.lookup?.name ?? (state.drafts['Player name'] ?? '').trim();
  if (state.lookup) {
    if (state.lookup.result === 0 && state.lookup.pid) {
      const pid = state.lookup.pid, row = make('div', undefined, 'de-social-found');
      row.append(make('strong', searched || `Player ${pid}`), make('span', `ID ${pid}`, 'de-note'));
      const actions = make('div', undefined, 'de-row');
      actions.append(
        button('Add friend', () => dispatch({ type: 'inviteFriend', pid })),
        button('Write mail', () => { dispatch({ type: 'editDraft', key: 'Recipient', value: `${searched}#${pid}` }); }),
        button('Invite to team', () => dispatch({ type: 'inviteTeam', pid }), !state.team),
        button('Invite to trade', () => dispatch({ type: 'inviteTrade', pid, ...(searched ? { name: searched } : {}) }), !['idle', 'finished', 'closing'].includes(state.trade.phase)),
        button('Ignore', () => dispatch({ type: 'ignore', pid })),
      );
      if (options.onWhisper && searched) actions.append(button('Whisper', () => options.onWhisper!(searched)));
      row.append(actions); find.append(row);
    } else find.append(make('p', `No player called “${searched}” was found.`, 'de-note'));
  }

  // Friends: the account's list with online state, then requests waiting for an answer.
  const friends = section('Friends', 'de-social-friends');
  const list = options.friendList ?? [];
  for (const friend of list) {
    const row = make('div', undefined, 'de-social-row'), pid = typeof friend.id === 'number' ? friend.id : Number(friend.id);
    row.append(make('span', '', `de-presence ${friend.online ? 'online' : 'offline'}`), make('strong', friend.name, 'de-fill'), make('span', friend.status ?? (friend.online ? 'Online' : 'Offline'), 'de-note'));
    if (friend.online && options.onWhisper) row.append(button('Whisper', () => options.onWhisper!(friend.name)));
    if (Number.isSafeInteger(pid) && pid > 0) {
      row.append(button('Mail', () => dispatch({ type: 'editDraft', key: 'Recipient', value: `${friend.name}#${pid}` })));
      if (friend.online && options.onDuel) row.append(button('Duel', () => options.onDuel!(pid)));
      if (friend.online) row.append(button('Trade', () => dispatch({ type: 'inviteTrade', pid, name: friend.name }), !['idle', 'finished', 'closing'].includes(state.trade.phase)));
    }
    friends.append(row);
  }
  for (const friend of state.friends) if (!list.some(f => f.name === friend.name)) friends.append(make('div', `${friend.name} is now your friend.`, 'de-social-row de-note'));
  if (!list.length && !state.friends.length) friends.append(make('p', 'No friends yet. Find a player by name to add one.', 'de-note'));
  for (const offer of state.friendOffers) {
    const row = make('div', undefined, 'de-social-row de-social-request');
    row.append(make('span', `${offer.name} (Lv ${offer.level}) wants to be friends.`, 'de-fill'), button('Accept', () => dispatch({ type: 'replyFriend', pid: offer.pid, accept: true }), false, true), button('Decline', () => dispatch({ type: 'replyFriend', pid: offer.pid, accept: false })));
    friends.append(row);
  }
  if (state.ignored.length) {
    const ignored = make('div', undefined, 'de-social-ignored'); ignored.append(make('h4', 'Ignored players'));
    for (const pid of state.ignored) { const row = make('div', undefined, 'de-social-row'); row.append(make('span', `ID ${pid}`, 'de-fill'), button('Stop ignoring', () => dispatch({ type: 'unignore', pid }))); ignored.append(row); }
    friends.append(ignored);
  }

  // Mail: inbox, then compose to a found player or friend.
  const mail = section('Mail', 'de-social-mail');
  mail.append(button(state.mailLoading ? 'Loading mailbox…' : 'Refresh mailbox', () => dispatch({ type: 'refreshMail' }), state.mailLoading));
  for (const entry of state.mail) {
    const item = make('details', undefined, 'de-mail-item'); item.append(make('summary', `${entry.subject} — ${entry.fromName}`), make('p', entry.body, 'de-mail-body')); mail.append(item);
  }
  if (!state.mail.length) mail.append(make('p', 'Your mailbox is empty.', 'de-note'));
  const recipient = state.drafts.Recipient ?? '', target = /^(.*)#(\d+)$/.exec(recipient);
  const compose = make('form', undefined, 'de-mail-compose');
  compose.append(make('h4', target ? `New mail to ${target[1] || `ID ${target[2]}`}` : 'New mail'));
  if (!target) compose.append(make('p', 'Choose Mail next to a friend, or find a player and choose Write mail.', 'de-note'));
  const subject = field(compose, 'Subject', 'text', 31), body = field(compose, 'Message', 'textarea', 511);
  const controls = make('span', undefined, 'de-row'), submit = make('button', 'Send mail', 'gold'); submit.type = 'submit'; submit.disabled = !target; controls.append(submit); compose.append(controls);
  compose.onsubmit = event => {
    event.preventDefault(); if (!target) return;
    const value: SocialAction = { type: 'sendMail', toPid: Number(target[2]), subject: subject.value, body: body.value };
    controls.replaceChildren(make('span', 'Send this mail? It cannot be recalled.'), button('Confirm', () => dispatch(value), false, true), button('Keep editing', () => controls.replaceChildren(submit)));
  };
  mail.append(compose);

  // Team.
  const team = section('Team', 'de-social-team');
  team.append(button('Refresh team', () => dispatch({ type: 'refreshTeam' }), state.teamLoading));
  if (state.team) {
    team.append(make('p', state.team.name, 'de-team-name'));
    for (const member of state.teamMembers) team.append(make('div', `${member.name}${member.authority & 2 ? ' — leader' : ''}`, 'de-social-row'));
    team.append(make('p', 'Find a player by name above and choose Invite to team.', 'de-note'));
    team.append(confirm('Leave team', 'Leave your current team? Leaders must disband instead.', () => dispatch({ type: 'leaveTeam' })), confirm('Disband team', 'Permanently disband this team for every member?', () => dispatch({ type: 'disbandTeam' })));
  } else {
    team.append(make('p', 'You are not in a team.', 'de-note'));
    const create = make('form', undefined, 'de-row'), teamName = field(create, 'Team name', 'text', 15) as HTMLInputElement, makeTeam = make('button', 'Create team', 'gold'); makeTeam.type = 'submit'; create.append(makeTeam);
    create.onsubmit = event => { event.preventDefault(); if (teamName.value.trim()) dispatch({ type: 'createTeam', name: teamName.value.trim() }); };
    team.append(create);
  }
  for (const invite of state.teamInvites) {
    const row = make('div', undefined, 'de-social-row de-social-request');
    row.append(make('span', `${invite.inviterName} invites you to ${invite.teamName}.`, 'de-fill'), button('Join team', () => dispatch({ type: 'replyTeam', teamId: invite.teamId, inviterPid: invite.inviterPid, accept: true }), false, true), button('Decline team', () => dispatch({ type: 'replyTeam', teamId: invite.teamId, inviterPid: invite.inviterPid, accept: false })));
    team.append(row);
  }
  if (state.status && /fail|refus|reject|error|sent|invit|accept|declin|joined|left|created|ignor/i.test(state.status)) { const note = make('p', state.status, 'de-note'); note.setAttribute('role', 'status'); root.append(note); }
  return root;
}

/** The trade window: shown over any scene while a trade is in progress. Cards are shown, never typed. */
export function renderTradeWindow(trade: SocialTrade, dispatch: (action: SocialAction) => void, state: SocialState, options: SocialUIOptions & { search?: string; onSearch?: (value: string) => void; reason?: string } = {}): HTMLElement | null {
  if (trade.phase === 'idle') return null;
  const { button, confirm } = make2(dispatch, state);
  const root = make('section', undefined, 'de-panel de-trade-window'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Card trade');
  const partner = trade.partner?.name || (trade.partner ? `Player ${trade.partner.pid}` : 'another player');
  root.append(make('h2', `Trade with ${partner}`, 'de-panel-title'));
  const card = (passcode: number) => options.card?.(passcode) ?? { id: String(passcode), passcode, name: `Card ${passcode}` };
  const tile = (passcode: number, extra?: HTMLElement): HTMLElement => {
    const view = card(passcode), wrap = make('div', undefined, 'de-trade-card');
    wrap.append(options.drawCard ? options.drawCard(view) : make('span', view.name)); wrap.title = view.name;
    if (extra) wrap.append(extra); return wrap;
  };
  if (trade.phase === 'requesting' || trade.phase === 'waiting') root.append(make('p', `Waiting for ${partner} to answer…`));
  if (trade.phase === 'offered') root.append(make('p', `${partner} wants to trade cards with you.`), make('div', undefined, 'de-row'), button('Accept trade', () => dispatch({ type: 'replyTrade', accept: true }), false, true), button('Decline trade', () => dispatch({ type: 'replyTrade', accept: false })));
  const exchanged = trade.ownOffer.length > 0 || trade.view.otherOffer.length > 0;
  if (trade.phase === 'finished' && !exchanged) root.append(make('p', state.status && /declined/.test(state.status) ? state.status : 'The trade ended without an exchange.', 'de-note'));
  if (trade.phase === 'open' || trade.phase === 'finished' && exchanged) {
    const editable = trade.phase === 'open' && !trade.view.ready && !trade.view.otherReady && !trade.pendingMove;
    const columns = make('div', undefined, 'de-trade-columns');
    const own = make('section', undefined, 'de-trade-side'); own.append(make('h3', `You give (${trade.ownOffer.length}/10)${trade.view.ready ? ' · Ready' : ''}`));
    const ownCards = make('div', undefined, 'de-trade-cards');
    trade.ownOffer.forEach((passcode, index) => ownCards.append(tile(passcode, button('Remove', () => dispatch({ type: 'removeTradeCard', index }), !editable))));
    if (!trade.ownOffer.length) ownCards.append(make('p', 'Pick cards from your collection below.', 'de-note'));
    own.append(ownCards);
    const theirs = make('section', undefined, 'de-trade-side'); theirs.append(make('h3', `${partner} gives (${trade.view.otherOffer.length})${trade.view.otherReady ? ' · Ready' : ''}`));
    const theirCards = make('div', undefined, 'de-trade-cards');
    for (const passcode of trade.view.otherOffer) theirCards.append(tile(passcode));
    if (!trade.view.otherOffer.length) theirCards.append(make('p', 'Nothing offered yet.', 'de-note'));
    theirs.append(theirCards);
    columns.append(own, theirs); root.append(columns);
    if (trade.pendingMove) root.append(make('p', 'Updating your offer…', 'de-note'));
    if (trade.phase === 'open') {
      // The server's trunk for this trade: only cards it lets you offer, with the copies you still have.
      const picker = make('section', undefined, 'de-trade-picker'), query = (options.search ?? '').toLowerCase();
      const search = make('input'); search.type = 'search'; search.placeholder = 'Search your cards'; search.value = options.search ?? ''; search.dataset.key = 'trade-search'; search.setAttribute('aria-label', 'Search your cards');
      search.oninput = () => options.onSearch?.(search.value);
      picker.append(make('h3', 'Your collection'), search);
      const grid = make('div', undefined, 'de-trade-cards de-trade-trunk');
      const offered = (passcode: number) => trade.ownOffer.filter(p => p === passcode).length;
      const entries = trade.view.trunk.filter(entry => entry.count - offered(entry.passcode) > 0 && (!query || card(entry.passcode).name.toLowerCase().includes(query))).slice(0, 60);
      for (const entry of entries) {
        const left = entry.count - offered(entry.passcode), add = button(`Offer (×${left})`, () => dispatch({ type: 'addTradeCard', passcode: entry.passcode }), !editable || trade.ownOffer.length >= 10);
        add.setAttribute('aria-label', `Offer ${card(entry.passcode).name}`); grid.append(tile(entry.passcode, add));
      }
      if (!entries.length) grid.append(make('p', query ? 'No matching cards.' : 'No tradeable cards.', 'de-note'));
      picker.append(grid); root.append(picker);
      const actions = make('div', undefined, 'de-row de-trade-actions');
      if (!trade.view.ready) actions.append(confirm('Ready', 'Lock both offers? Changing them afterwards needs both players to go back to editing.', () => dispatch({ type: 'readyTrade' }), !!trade.pendingMove));
      if (trade.view.allReady) actions.append(confirm('Complete trade', `Exchange your ${trade.ownOffer.length} card(s) for ${partner}'s ${trade.view.otherOffer.length}? This cannot be undone.`, () => dispatch({ type: 'confirmTrade', accept: true })), button('Back to editing', () => dispatch({ type: 'confirmTrade', accept: false })));
      else if (trade.view.ready) actions.append(make('span', `Waiting for ${partner} to be ready…`, 'de-note'));
      root.append(actions);
    }
    // The server explains a refused exchange in a system message (e.g. soul-bound cards); show it here.
    if (trade.view.finished) root.append(make('p', trade.view.success ? 'Trade complete. Your collection has been updated.' : options.reason ?? 'The trade ended without an exchange.', trade.view.success ? 'de-trade-result' : 'de-note'));
  }
  if (trade.phase === 'finished' || trade.phase === 'closing') root.append(button('Close', () => dispatch({ type: 'cancelTrade' })));
  else root.append(confirm('Cancel trade', 'Close this trade? Offers on both sides are abandoned.', () => dispatch({ type: 'cancelTrade' })));
  return root;
}
