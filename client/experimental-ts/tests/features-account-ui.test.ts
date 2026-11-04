import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountController } from '../src/features/account';
import type { AccountAction, AccountPanel, AccountState } from '../src/features/account';
import { HttpClient } from '../src/services/http';
import { renderAccountFeature } from '../src/ui/extra/account';
import { TestDocument, findButton } from './ui-dom-fixture';
import type { TestNode } from './ui-dom-fixture';
afterEach(() => vi.unstubAllGlobals());
function state(panel: AccountPanel = 'overview'): AccountState {
  return { panel, busy: false, status: 'Account status', error: null, errorCode: null, session: null, verification: null, inviteUrl: null, redirectUrl: null, claimedAccount: null };
}
function render(s: AccountState, dispatch: (a: AccountAction) => void | Promise<void> = vi.fn()): TestNode {
  vi.stubGlobal('document', new TestDocument()); return renderAccountFeature(s, dispatch) as unknown as TestNode;
}
describe('safe account DOM', () => {
  it.each(['register', 'verify', 'reset', 'password', 'claim'] as AccountPanel[])('clears secret inputs before dispatch for %s and never opts them into parent snapshots', panel => {
    let root: TestNode;
    const dispatch = vi.fn((action: AccountAction) => {
      expect(root.querySelectorAll('input').filter(n => n.type === 'password' || n.name === 'code').every(n => n.value === '')).toBe(true);
      expect(JSON.stringify(action)).toMatch(/secret-value/);
    });
    root = render(state(panel), dispatch);
    for (const field of root.querySelectorAll('input')) {
      field.value = field.name === 'username' ? 'Player' : 'secret-value';
      if (field.type === 'password' || field.name === 'code') expect(field.dataset.key).toBeUndefined();
    }
    root.querySelectorAll('form')[0].onsubmit!({ preventDefault() {} }); expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it('clears secrets even when dispatch throws', () => {
    const root = render(state('register'), () => { throw new Error('parent failure'); });
    const fields = root.querySelectorAll('input'); fields[0].value = 'Player'; fields[1].value = 'secret-password';
    expect(() => root.querySelectorAll('form')[0].onsubmit!({ preventDefault() {} })).toThrow('parent failure'); expect(fields[1].value).toBe('');
  });
  it('renders literal verification instructions, server errors and supported invite links', () => {
    const root = render({ ...state('verify'), error: '<img src=x onerror=alert(1)>', verification: { username: '<script>name</script>', code: 'ABC234', inviteUrl: 'https://discord.gg/de', expiresInMinutes: 60 } });
    expect(root.textContent).toContain('/verify ABC234'); expect(root.textContent).toContain('60 minutes'); expect(root.textContent).toContain('<img src=x');
    expect(root.querySelectorAll('img')).toHaveLength(0); expect(root.querySelectorAll('script')).toHaveLength(0);
    expect(root.querySelectorAll('a')).toHaveLength(1); expect(root.querySelectorAll('input')[0].value).toBe('<script>name</script>');
  });
  it('reset gives real Discord reset instructions, not an invented HTTP workflow', () => {
    const root = render(state('reset')); expect(root.textContent).toContain('Run /reset'); expect(root.textContent).toContain('six-character code'); expect(root.textContent).toContain('revokes other sessions');
  });
  it('blocks controls and submissions while pending', () => {
    const dispatch = vi.fn(), root = render({ ...state('register'), busy: true }, dispatch);
    expect(root.querySelectorAll('button').every(n => n.disabled)).toBe(true); expect(root.querySelectorAll('input').every(n => n.disabled)).toBe(true);
    root.querySelectorAll('form')[0].onsubmit!({ preventDefault() {} }); expect(dispatch).not.toHaveBeenCalled();
  });
  it('renders only safe Discord URLs even if passed untrusted view state', () => {
    const root = render({ ...state(), inviteUrl: 'javascript:alert(1)', redirectUrl: 'https://evil.test/oauth' }); expect(root.querySelectorAll('a')).toHaveLength(0);
  });
  it('shows explicit linking only for a signed-in unlinked Discord account and returns action', () => {
    const dispatch = vi.fn(); const root = render({ ...state(), session: { signedIn: true, userId: 'u', name: 'Player', roles: [], discord: false, password: true } }, dispatch);
    findButton(root, 'Link Discord').onclick!({}); expect(dispatch).toHaveBeenCalledWith({ type: 'linkDiscord' });
  });
  it('rerenders without recovering secrets or dispatching side effects', () => {
    const dispatch = vi.fn(), s = state('register'); let root = render(s, dispatch);
    root.querySelectorAll('input')[1].value = 'not-a-draft'; root.remove(); root = render(s, dispatch);
    expect(root.querySelectorAll('input')[1].value).toBe(''); expect(dispatch).not.toHaveBeenCalled();
  });
  it('works end-to-end with synchronous controller emits and discards auth response secrets', async () => {
    const states: AccountState[] = []; let root: TestNode;
    const http = new HttpClient({ origin: 'https://game.test', timeoutMs: 0, fetch: vi.fn(async () => new Response(JSON.stringify({ ok: true, code: 'ABC234', inviteUrl: null, expiresInMinutes: 60 }))) });
    const c = new AccountController({ http, onChange: s => { states.push(s); root = render(s, a => c.dispatch(a)); } });
    await c.dispatch({ type: 'show', panel: 'register' });
    const fields = root!.querySelectorAll('input'); fields[0].value = 'Player'; fields[1].value = 'password-12345';
    root!.querySelectorAll('form')[0].onsubmit!({ preventDefault() {} });
    expect(fields[1].value).toBe(''); expect(c.state.busy).toBe(true);
    await vi.waitFor(() => expect(c.state.busy).toBe(false));
    expect(root!.textContent).toContain('/verify ABC234'); expect(JSON.stringify(states)).not.toContain('password-12345');
  });
});
