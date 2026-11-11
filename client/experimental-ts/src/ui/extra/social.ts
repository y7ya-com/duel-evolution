import type { SocialAction, SocialState, SocialTrade } from '../../features/social';
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
