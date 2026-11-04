import type { SocialAction, SocialState } from '../../features/social';

/** Detached DOM subtree: all listeners belong to returned elements. Server text is always literal. */
export function renderSocialFeature(state: SocialState, dispatch: (action: SocialAction) => void): HTMLElement {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, value?: string): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag); if (value !== undefined) node.textContent = value; return node;
  };
  const root = el('section'); root.className = 'social-feature'; root.setAttribute('aria-label', 'Social');
  const button = (label: string, run: () => void, disabled = false): HTMLButtonElement => {
    const node = el('button', label); node.type = 'button'; node.disabled = disabled; node.onclick = run; return node;
  };
  const confirm = (label: string, explanation: string, run: () => void, disabled = false): HTMLElement => {
    const wrap = el('span');
    const show = (): void => { wrap.replaceChildren(button(label, () => {
      wrap.replaceChildren(el('span', explanation), button('Confirm', run), button('Keep editing', show));
    }, disabled)); };
    show(); return wrap;
  };
  const section = (name: string): HTMLElement => { const node = el('section'); node.append(el('h3', name)); root.append(node); return node; };
  const field = (form: HTMLElement, name: string, kind: 'text' | 'number' | 'textarea' = 'text', max = 0): HTMLInputElement | HTMLTextAreaElement => {
    const label = el('label', name); const input = kind === 'textarea' ? el('textarea') : el('input');
    if (input.tagName === 'INPUT') (input as HTMLInputElement).type = kind;
    if (kind === 'number') { (input as HTMLInputElement).min = '1'; (input as HTMLInputElement).max = '4294967295'; (input as HTMLInputElement).step = '1'; }
    input.dataset.key = `social-${name}`; input.value = state.drafts[name] ?? '';
    input.oninput = () => dispatch({ type: 'editDraft', key: name, value: input.value });
    input.required = true; if (max) input.maxLength = max; input.name = name;
    label.append(input); form.append(label); return input;
  };
  const form = (parent: HTMLElement, submitLabel: string, build: (node: HTMLFormElement) => () => SocialAction, confirmation?: string, disabled = false): void => {
    const node = el('form'); const action = build(node); const controls = el('span');
    const submit = el('button', submitLabel); submit.type = 'submit'; submit.disabled = disabled; controls.append(submit); node.append(controls);
    node.onsubmit = event => { event.preventDefault(); if (disabled) return;
      const value = action();
      if (confirmation) controls.replaceChildren(el('span', confirmation), button('Confirm', () => dispatch(value)), button('Keep editing', () => controls.replaceChildren(submit)));
      else dispatch(value);
    }; parent.append(node);
  };
  const status = el('p', state.status); status.setAttribute('role', 'status'); root.append(status);
  if (state.error) { const error = el('p', state.error); error.setAttribute('role', 'alert'); root.append(error); }

  const mail = section('Mail'); mail.append(button(state.mailLoading ? 'Loading mailbox…' : 'Refresh mailbox', () => dispatch({ type: 'refreshMail' }), state.mailLoading));
  for (const entry of state.mail) {
    const item = el('details'); item.append(el('summary', `${entry.fromName} (#${entry.fromPid}): ${entry.subject}`), el('p', entry.body)); mail.append(item);
  }
  if (!state.mail.length) mail.append(el('p', 'No mail loaded.'));
  form(mail, 'Send mail', node => {
    const to = field(node, 'Recipient player id', 'number'), subject = field(node, 'Subject', 'text', 31), body = field(node, 'Message', 'textarea', 511);
    return () => ({ type: 'sendMail', toPid: Number(to.value), subject: subject.value, body: body.value });
  }, 'Send this mail? It cannot be recalled.');

  const friends = section('Friends and ignore');
  form(friends, 'Find player', node => { const name = field(node, 'Player name', 'text', 15); return () => ({ type: 'findPlayer', name: name.value }); });
  if (state.lookup) friends.append(el('p', `Lookup result ${state.lookup.result}; player id ${state.lookup.pid}`));
  form(friends, 'Invite friend', node => { const id = field(node, 'Friend player id', 'number'); return () => ({ type: 'inviteFriend', pid: Number(id.value) }); });
  for (const offer of state.friendOffers) {
    const row = el('p', `${offer.name} (#${offer.pid}) invites you to be friends. `);
    row.append(button('Accept friend', () => dispatch({ type: 'replyFriend', pid: offer.pid, accept: true })), button('Decline friend', () => dispatch({ type: 'replyFriend', pid: offer.pid, accept: false }))); friends.append(row);
  }
  for (const friend of state.friends) friends.append(el('p', `Friend confirmed: ${friend.name} (#${friend.pid})`));
  form(friends, 'Ignore player', node => { const id = field(node, 'Ignore player id', 'number'); return () => ({ type: 'ignore', pid: Number(id.value) }); });
  form(friends, 'Unignore player', node => { const id = field(node, 'Unignore player id', 'number'); return () => ({ type: 'unignore', pid: Number(id.value) }); });
  friends.append(el('p', `Ignore changes confirmed this session: ${state.ignored.join(', ') || 'none'}`));

  const teams = section('Team'); teams.append(button('Refresh team', () => dispatch({ type: 'refreshTeam' }), state.teamLoading));
  teams.append(el('p', state.team ? `${state.team.name} (#${state.team.id})` : 'No team loaded.'));
  for (const member of state.teamMembers) teams.append(el('p', `${member.name} (#${member.pid})${member.authority & 2 ? ' — leader' : ''}`));
  form(teams, 'Create team', node => { const name = field(node, 'Team name', 'text', 15); return () => ({ type: 'createTeam', name: name.value }); });
  form(teams, 'Invite to team', node => { const id = field(node, 'Team invite player id', 'number'); return () => ({ type: 'inviteTeam', pid: Number(id.value) }); });
  for (const invite of state.teamInvites) {
    const row = el('p', `${invite.inviterName} invites you to ${invite.teamName}. `);
    row.append(button('Join team', () => dispatch({ type: 'replyTeam', teamId: invite.teamId, inviterPid: invite.inviterPid, accept: true })), button('Decline team', () => dispatch({ type: 'replyTeam', teamId: invite.teamId, inviterPid: invite.inviterPid, accept: false }))); teams.append(row);
  }
  teams.append(confirm('Leave team', 'Leave your current team? Leaders must disband instead.', () => dispatch({ type: 'leaveTeam' }), !state.team), confirm('Disband team', 'Permanently disband this team for every member?', () => dispatch({ type: 'disbandTeam' }), !state.team));

  const trade = section('Card trade'), t = state.trade;
  trade.append(el('p', `Trade: ${t.phase}${t.partner ? ` with ${t.partner.name || 'player'} (#${t.partner.pid})` : ''}`));
  form(trade, 'Invite trade', node => { const id = field(node, 'Trade player id', 'number'); return () => ({ type: 'inviteTrade', pid: Number(id.value) }); }, undefined, !['idle', 'finished', 'closing'].includes(t.phase));
  if (t.phase === 'offered') trade.append(button('Accept trade', () => dispatch({ type: 'replyTrade', accept: true })), button('Decline trade', () => dispatch({ type: 'replyTrade', accept: false })));
  if (t.phase === 'open' || t.phase === 'finished') {
    trade.append(el('h4', 'Your confirmed offer'));
    t.ownOffer.forEach((card, index) => { const row = el('p', `Card ${card} `); row.append(button('Remove card', () => dispatch({ type: 'removeTradeCard', index }), t.phase !== 'open' || t.view.ready || t.view.otherReady || !!t.pendingMove)); trade.append(row); });
    if (t.pendingMove) trade.append(el('p', 'Offer change awaiting peer acknowledgement.'));
    trade.append(el('h4', 'Other player’s offer'), el('p', t.view.otherOffer.join(', ') || 'No cards offered.'));
    if (t.phase === 'open') {
      form(trade, 'Add card', node => { const id = field(node, 'Card passcode', 'number'); return () => ({ type: 'addTradeCard', passcode: Number(id.value) }); }, undefined, t.view.ready || t.view.otherReady || !!t.pendingMove || t.ownOffer.length >= 10);
      const cards = el('details'); cards.append(el('summary', 'Collection (server supplied)'));
      for (const card of t.view.trunk.slice(0, 200)) cards.append(el('p', `${card.passcode}: ${card.count}`)); if (t.view.trunk.length > 200) cards.append(el('p', 'Showing the first 200 card types. Enter any owned card passcode above.')); trade.append(cards);
      trade.append(el('p', `You: ${t.view.ready ? 'ready' : 'editing'}; peer: ${t.view.otherReady ? 'ready' : 'editing'}`));
      trade.append(confirm('Ready trade', 'Lock both offers? Changes require both players to return to editing.', () => dispatch({ type: 'readyTrade' }), t.view.ready || !!t.pendingMove));
      if (t.view.allReady) trade.append(confirm('Complete trade', `Permanently exchange your cards (${t.ownOffer.join(', ') || 'none'}) for (${t.view.otherOffer.join(', ') || 'none'})? The server validates ownership.`, () => dispatch({ type: 'confirmTrade', accept: true })), button('Return to editing', () => dispatch({ type: 'confirmTrade', accept: false })));
    }
    if (t.view.finished) trade.append(el('p', t.view.success ? 'Server confirmed exchange completed.' : 'Trade ended without an exchange.'));
  }
  if (t.phase !== 'idle') trade.append(confirm('Cancel trade', 'Close this trade? Pending offers will be abandoned.', () => dispatch({ type: 'cancelTrade' })));
  return root;
}
