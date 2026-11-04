import { TAG_ROLES, reasonText, type TagLobbyAction, type TagLobbyState, type TagRole } from '../../features/tag';

/** The Tag Duel window, opened from the Duel menu beside Create Duel and Auto Duel (htmlui CONTRACT.md; layout of
 * client/web-shell/htmlui/tag-lobby.js): your team and the opponents, each captain's deck and partner, readiness. */
export function renderTagLobby(model: TagLobbyState, dispatch: (action: TagLobbyAction) => void, now = Date.now() / 1000): HTMLElement {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls = '') => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const button = (label: string, action: TagLobbyAction, key: string, options: { disabled?: boolean; gold?: boolean } = {}) => {
    const node = make('button', label, options.gold ? 'gold' : ''); node.type = 'button'; node.dataset.key = `tag-${key}`; node.disabled = model.busy || !!options.disabled;
    node.addEventListener('click', () => dispatch(action)); return node;
  };
  const state = model.state, invitations = (state?.invitations ?? []).filter(i => i.expires > now), invite = invitations.find(i => i.outbound) ?? invitations[0];
  const root = make('section', undefined, 'de-panel de-tag-lobby'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Tag Duel'); root.dataset.key = 'tag-lobby';
  root.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); dispatch({ type: 'close' }); } });
  const header = make('header', undefined, 'de-panel-title de-row de-spread');
  const close = button('×', { type: 'close' }, 'close', { disabled: false }); close.disabled = false; close.setAttribute('aria-label', 'Close tag lobby');
  header.append(make('h2', invite ? invite.outbound ? 'Your tag duel' : 'Tag duel invitation' : 'Tag Duel'), close); root.append(header);
  root.append(make('p', 'Team up for a 2 vs 2 relay duel. Each team shares its captain’s deck and field; partners take turns playing. All four players must accept. No MP, cards or ranked progress are awarded.', 'de-tag-intro'));
  if (!state) root.append(make('p', 'Loading players in this location…'));
  else {
    const self = state.self.pid, ownRole = invite?.seats.find(s => s.pid === self)?.role, ownTeam = !ownRole || ownRole === 'captain' || ownRole === 'teammate' ? 0 : 1;
    const teams = make('div', undefined, 'de-tag-teams');
    const seatSelect = (label: string, role: TagRole) => {
      const wrap = make('label', undefined, 'de-tag-seat'), select = make('select');
      select.dataset.key = `tag-seat:${role}`; select.setAttribute('aria-label', label); select.disabled = model.busy || !state.available || !!invite || state.active;
      const none = make('option', 'Choose a player'); none.value = ''; select.append(none);
      for (const player of state.players) {
        const option = make('option', player.name); option.value = String(player.pid);
        option.disabled = TAG_ROLES.some(r => r !== role && model.selected[r] === player.pid); select.append(option);
      }
      select.value = model.selected[role] ? String(model.selected[role]) : '';
      select.addEventListener('change', () => dispatch({ type: 'select', role, pid: Number(select.value) || 0 }));
      wrap.append(make('span', label), select); return wrap;
    };
    for (const team of [0, 1]) {
      const box = make('section', undefined, `de-tag-team${team ? ' rival' : ''}`); box.dataset.key = `tag-team:${team === ownTeam ? 'own' : 'rival'}`;
      box.append(make('h3', team === ownTeam ? 'Your team' : 'Opponents'));
      if (invite) for (const seat of invite.seats.filter(s => (team === 0) === (s.role === 'captain' || s.role === 'teammate'))) {
        const row = make('div', undefined, 'de-tag-seat'); row.dataset.key = `tag-seat:${seat.role}`; row.dataset.accepted = String(seat.accepted);
        row.append(make('span', seat.role === 'captain' || seat.role === 'opponent' ? 'Captain’s deck' : 'Partner'), make('strong', seat.name + (seat.pid === self ? ' (you)' : '')), make('small', seat.accepted ? '✓ Ready' : 'Awaiting acceptance', seat.accepted ? 'de-tag-ready' : 'de-tag-wait'));
        box.append(row);
      } else if (team === 0) {
        const own = make('div', undefined, 'de-tag-seat'); own.append(make('span', 'You · captain’s deck'), make('strong', state.self.name));
        box.append(own, seatSelect('Your teammate', 'teammatePid'));
      } else box.append(seatSelect('Opposing captain', 'opponentPid'), seatSelect('Their teammate', 'opponentTeammatePid'));
      teams.append(box);
    }
    root.append(teams);
    if (invite) { const expiry = make('p', `Invitation expires in ${Math.max(0, Math.ceil(invite.expires - now))} seconds.`, 'de-tag-expiry'); expiry.dataset.expires = String(invite.expires); root.append(expiry); }
    else if (!state.available && !state.active) root.append(make('p', reasonText(state.reason ?? 'unavailable'), 'de-tag-expiry'));
    else if (state.players.length < 3) root.append(make('p', 'You need three other available players here. Ask your friends to join this location.', 'de-tag-expiry'));
  }
  if (model.error) { const error = make('p', model.error, 'de-error'); error.setAttribute('role', 'alert'); root.append(error); }
  if (model.notice) { const notice = make('p', model.notice, 'de-tag-notice'); notice.setAttribute('role', 'status'); root.append(notice); }
  const actions = make('footer', undefined, 'de-row de-tag-actions');
  if (state && invite) {
    const own = invite.seats.find(s => s.pid === state.self.pid);
    if (invite.outbound) actions.append(button(model.busy ? 'Cancelling…' : 'Cancel invitation', { type: 'cancel', id: invite.id }, 'cancel'));
    else actions.append(button('Decline', { type: 'decline', id: invite.id }, 'decline'), button(own?.accepted ? 'Accepted · waiting for others' : model.busy ? 'Accepting…' : 'Accept & ready', { type: 'accept', id: invite.id }, 'accept', { disabled: !!own?.accepted, gold: true }));
  } else if (!state?.active) actions.append(button('Refresh players', { type: 'refresh' }, 'refresh'), button(model.busy ? 'Sending…' : 'Invite players', { type: 'invite' }, 'invite', { disabled: !state?.available || TAG_ROLES.some(r => !model.selected[r]), gold: true }));
  root.append(actions);
  // The expiry counts down between polls; a replaced or closed window stops its own clock.
  const clock = setInterval(() => {
    if (!root.isConnected) { clearInterval(clock); return; }
    for (const node of root.querySelectorAll<HTMLElement>('[data-expires]')) node.textContent = `Invitation expires in ${Math.max(0, Math.ceil(Number(node.dataset.expires) - Date.now() / 1000))} seconds.`;
  }, 1000);
  return root;
}

/** Scoped like the trade window: the original cyan window with blue and copper team plates. */
export const TAG_CSS = `
.de-tag-lobby { position:absolute; z-index:20; left:50%; top:50%; transform:translate(-50%,-50%); width:min(94%,600px); max-height:92%; overflow:auto; display:flex; flex-direction:column; gap:10px; }
.de-tag-lobby .de-panel-title button { min-height:23px; width:24px; padding:0; line-height:1; background:linear-gradient(#fffed8,#efc352); border-color:#ad8b38; color:#145397; }
.de-tag-intro { font-size:13px; color:#2b5a7d; }
.de-tag-teams { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.de-tag-team { min-width:0; border:1px solid #6c9fc1; border-radius:2px; padding:10px; background:#ddf6ff; box-shadow:inset 0 1px #fff; display:flex; flex-direction:column; gap:8px; }
.de-tag-team.rival { background:#f1e7dd; border-color:#ad7650; }
.de-tag-team h3 { margin:-10px -10px 2px!important; padding:6px 10px; border-bottom:1px solid #438dc3; background:linear-gradient(#a8e9fc,#63b9e5); color:#123f70; }
.de-tag-team.rival h3 { border-color:#ad7650; background:linear-gradient(#f6dcc4,#d9a77c); color:#5a3216; }
.de-tag-seat { display:flex!important; flex-direction:column; align-items:stretch!important; gap:3px!important; padding:7px; background:#edfcff; border:1px solid #a0c9de; border-radius:2px; }
.de-tag-seat span { font-size:12px; color:#2b5a7d; }
.de-tag-seat strong { overflow-wrap:anywhere; }
.de-tag-seat select { width:100%; }
.de-tag-ready { color:#1a774b; } .de-tag-wait { color:#6a6440; }
.de-tag-expiry { font-size:12px; color:#2e6285; }
.de-tag-notice { border:1px solid #bba25d; background:#fff7cf; color:#68501d; padding:7px; border-radius:2px; }
.de-tag-actions { justify-content:flex-end; }
`;
