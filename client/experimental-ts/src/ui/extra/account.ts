import type { AccountAction, AccountPanel, AccountState } from '../../features/account';

/** Inert, detached DOM. Credentials stay in inputs until submit, then are cleared before dispatch. */
export function renderAccountFeature(state: AccountState, dispatch: (action: AccountAction) => void | Promise<void>): HTMLElement {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node;
  };
  const root = el('section'); root.className = 'account-feature'; root.setAttribute('aria-label', 'Account');
  root.append(el('h2', 'Account'));
  const status = el('p', state.status); status.setAttribute('role', 'status'); root.append(status);
  if (state.error) { const error = el('p', state.error); error.setAttribute('role', 'alert'); root.append(error); }
  const send = (action: AccountAction): void => { void dispatch(action); };
  const button = (label: string, action: AccountAction): HTMLButtonElement => {
    const node = el('button', label); node.type = 'button'; node.disabled = state.busy; node.onclick = () => send(action); return node;
  };
  const link = (label: string, url: string): HTMLAnchorElement => {
    const node = el('a', label); node.href = url; node.rel = 'noopener noreferrer'; return node;
  };
  const tabs: [AccountPanel, string][] = [['overview', 'Account status'], ['register', 'Register / recover verification code'], ['reset', 'Forgot password'], ['password', 'Set account password'], ['claim', 'Link legacy game account']];
  const nav = el('nav'); nav.setAttribute('aria-label', 'Account options');
  for (const [panel, label] of tabs) nav.append(button(label, { type: 'show', panel })); root.append(nav);
  const field = (form: HTMLFormElement, name: string, kind: 'username' | 'password' | 'code', value = ''): HTMLInputElement => {
    const label = el('label', name), input = el('input'); input.type = kind === 'password' ? 'password' : 'text';
    input.name = kind === 'password' ? 'password' : kind;
    // Secret fields deliberately have no data-key: parent UI draft/focus snapshots must not retain them.
    if (kind === 'username') input.dataset.key = `account-${state.panel}-${name}`;
    input.required = true; input.disabled = state.busy; input.value = value; input.maxLength = kind === 'password' ? 128 : kind === 'username' ? 64 : 128;
    input.autocomplete = kind === 'password' ? (state.panel === 'verify' ? 'current-password' : 'new-password') : kind === 'username' ? 'username' : 'one-time-code';
    if (kind === 'password' && state.panel !== 'verify') input.minLength = 10;
    label.append(input); form.append(label); return input;
  };
  const form = (label: string, build: (node: HTMLFormElement) => () => AccountAction): void => {
    const node = el('form'); const read = build(node); const submit = el('button', label); submit.type = 'submit'; submit.disabled = state.busy; node.append(submit);
    node.onsubmit = event => {
      event.preventDefault(); if (state.busy) return;
      const action = read();
      // Clear synchronously, even if dispatch throws, emits a rerender or returns a pending promise.
      for (const input of node.querySelectorAll('input')) if (input.type === 'password' || input.name === 'code') input.value = '';
      send(action);
    }; root.append(node);
  };
  if (state.panel === 'overview') {
    const session = state.session;
    root.append(el('p', session?.signedIn ? `Signed in as ${session.name ?? 'Discord account'}. Discord: ${session.discord ? 'linked' : 'not linked'}. Password: ${session.password ? 'set' : 'not set'}.` : 'Sign in to manage linked accounts.'));
    root.append(button('Refresh account status', { type: 'refreshSession' }));
    if (session?.signedIn && !session.discord) root.append(button('Link Discord', { type: 'linkDiscord' }));
    if (state.claimedAccount) root.append(el('p', `Linked game account: ${state.claimedAccount}`));
  }
  if (state.panel === 'register') {
    root.append(el('p', 'Register with a name and password, then verify in Discord. To recover a lost verification code, use the same name and password.'));
    form('Register', node => { const name = field(node, 'Account name', 'username'), pw = field(node, 'Password', 'password'); return () => ({ type: 'register', username: name.value, password: pw.value }); });
  }
  if (state.panel === 'verify') {
    const verification = state.verification;
    root.append(el('p', verification ? `Run /verify ${verification.code} in the Duel Evolution Discord server. This code expires in ${verification.expiresInMinutes} minutes. Then re-enter your password and Continue.` : 'Verify your account in Discord. If you lost the code, register again using the same account name and password.'));
    form('Continue', node => { const name = field(node, 'Account name', 'username', verification?.username ?? ''), pw = field(node, 'Password', 'password'); return () => ({ type: 'continueVerification', username: name.value, password: pw.value }); });
  }
  if (state.panel === 'reset') {
    root.append(el('p', 'Run /reset in the Duel Evolution Discord server using your linked Discord account. Enter its six-character code here. Reset signs you in and revokes other sessions.'));
    form('Reset password', node => { const code = field(node, 'Discord reset code', 'code'), pw = field(node, 'New password', 'password'); return () => ({ type: 'resetPassword', code: code.value, newPassword: pw.value }); });
  }
  if (state.panel === 'password') {
    root.append(el('p', 'Sign in with Discord first, then set a password within ten minutes of signing in. Other sessions are revoked. Choose an account name if you do not already have one.'));
    form('Save password', node => {
      const name = state.session?.signedIn && state.session.name ? null : field(node, 'Account name', 'username');
      const pw = field(node, 'New password', 'password');
      return () => ({ type: 'setPassword', newPassword: pw.value, ...(name ? { username: name.value } : {}) });
    });
  }
  if (state.panel === 'claim') {
    root.append(el('p', 'Sign in, then enter the one-time claim code supplied by an admin for your imported game account. An existing account with characters cannot be replaced.'));
    form('Link game account', node => { const code = field(node, 'Legacy claim code', 'code'); return () => ({ type: 'claimLegacy', code: code.value }); });
  }
  // Defense in depth for callers supplying their own state; never render arbitrary protocol URLs.
  const invite = state.verification?.inviteUrl ?? state.inviteUrl;
  if (invite) { try { const url = new URL(invite); if (url.protocol === 'https:' && !url.username && !url.password && ['discord.gg', 'discord.com', 'www.discord.com'].includes(url.hostname)) root.append(link('Open Duel Evolution Discord', url.href)); } catch { /* no unsafe link */ } }
  if (state.redirectUrl) { try { const url = new URL(state.redirectUrl); if (url.protocol === 'https:' && url.hostname === 'discord.com' && url.pathname === '/api/oauth2/authorize' && !url.username && !url.password) root.append(link('Continue to Discord', url.href)); } catch { /* no unsafe link */ } }
  return root;
}
