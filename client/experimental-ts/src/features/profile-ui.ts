import type { ProfileAction, ProfileState } from './profile';

/** Interaction routing belongs to app/social/online; this view emits no duplicate protocol actions. */
export interface ProfileUIOptions {
  onInteraction?: (action: 'friend' | 'mail' | 'trade' | 'team' | 'ignore', pid: number) => void;
  onCosmetics?: () => void;
  /** Ownership bit, not displayed title id; use only trusted catalogue metadata. Server verifies ownership. */
  titleChoices?: readonly { bit: number; label: string }[];
}
export function renderProfileFeature(state: ProfileState, dispatch: (action: ProfileAction) => void, options: ProfileUIOptions = {}): HTMLElement {
  const root = document.createElement('section'); root.className = 'profile-feature'; root.setAttribute('aria-label', 'Player profile');
  const text = (parent: HTMLElement, tag: string, value: string, className = '') => { const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; parent.append(node); return node; };
  const button = (parent: HTMLElement, label: string, run: () => void, disabled = false) => { const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.disabled = disabled; node.onclick = run; parent.append(node); return node; };
  const row = (parent: HTMLElement, className: string) => { const node = document.createElement('div'); node.className = className; parent.append(node); return node; };
  if (state.selectedPid === null) { text(root, 'p', state.status, 'de-note').setAttribute('role', 'status'); return root; }
  const head = row(root, 'de-profile-head');
  text(head, 'h3', state.summary?.name ?? state.details?.name ?? `Player ${state.selectedPid}`);
  const tools = row(head, 'de-row');
  button(tools, 'Refresh', () => dispatch({ type: 'refresh' }), state.loading);
  button(tools, 'Close', () => dispatch({ type: 'close' }));
  const s = state.summary, stats = document.createElement('dl'); stats.className = 'de-profile-stats';
  const stat = (name: string, value: string) => { const pair = row(stats, 'de-profile-stat'); text(pair, 'dt', name); text(pair, 'dd', value); };
  if (s) {
    const played = s.wins + s.losses;
    stat('Level', String(s.level)); stat('Wins', String(s.wins)); stat('Losses', String(s.losses));
    stat('Win rate', played ? `${Math.round(s.wins * 100 / played)}%` : '—');
    stat('Country', s.country || 'Unknown');
    stat('Status', s.state >= 0x67 && s.state <= 0x6a ? 'Duelling' : s.state === 1 ? 'In lobby' : 'Online');
  } else stat('Status', state.loading ? 'Loading…' : 'Not in this area');
  root.append(stats);
  text(root, 'p', `Player id: ${state.selectedPid}`, 'de-note');
  const quote = row(root, 'de-profile-comments');
  text(quote, 'p', state.comments[1] || (state.comments[1] === null ? '…' : 'No personal title'), 'de-profile-title');
  text(quote, 'p', state.comments[0] || (state.comments[0] === null ? '…' : 'No comment'));
  if (state.selfPid === state.selectedPid) {
    for (const [field, line, name] of [['comment', 0, 'Comment'], ['title', 1, 'Personal title']] as const) {
      const edit = document.createElement('form'); edit.className = 'de-profile-edit';
      const holder = text(edit, 'label', name), node = document.createElement('input');
      node.name = name; node.setAttribute('aria-label', name); node.dataset.key = `profile-${field}`; node.maxLength = 31; node.value = state.drafts[field]; node.placeholder = `Up to 31 characters`;
      node.oninput = () => dispatch({ type: 'editDraft', field, value: node.value }); holder.append(node);
      const save = text(edit, 'button', 'Save') as HTMLButtonElement; save.type = 'submit'; save.disabled = state.pending !== null; save.setAttribute('aria-label', `Save ${name.toLowerCase()}`);
      edit.onsubmit = event => { event.preventDefault(); dispatch({ type: 'saveComment', line }); }; root.append(edit);
    }
    const actions = row(root, 'de-row');
    for (const choice of options.titleChoices ?? []) button(actions, `Use title: ${choice.label}`, () => dispatch({ type: 'setTitle', bit: choice.bit }), state.pending !== null);
    button(actions, 'Clear achievement title', () => dispatch({ type: 'setTitle', bit: 224 }), state.pending !== null);
    if (options.onCosmetics) button(actions, 'Appearance and cosmetics', options.onCosmetics);
  } else if (options.onInteraction) {
    const callback = options.onInteraction, pid = state.selectedPid, actions = row(root, 'de-row');
    for (const [action, label] of [['friend', 'Add friend'], ['mail', 'Write mail'], ['trade', 'Invite to trade'], ['team', 'Invite to team'], ['ignore', 'Ignore player']] as const) button(actions, label, () => callback(action, pid));
  }
  if (state.loading || state.pending || /accepted|rejected|left/i.test(state.status)) text(root, 'p', state.loading ? 'Loading profile…' : state.status, 'de-note').setAttribute('role', 'status');
  if (state.error) text(root, 'p', state.error, 'de-error').setAttribute('role', 'alert');
  return root;
}
