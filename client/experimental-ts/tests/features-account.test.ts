import { describe, expect, it, vi } from 'vitest';
import { AccountController } from '../src/features/account';
import type { AccountState } from '../src/features/account';
import { HttpClient } from '../src/services/http';
const session = { signedIn: true, userId: 'user-1', name: 'Player', roles: [], discord: true, password: true };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function setup(replies: Response[] = []) {
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => replies.shift() ?? response({ signedIn: false }));
  const states: AccountState[] = [];
  const http = new HttpClient({ origin: 'https://game.test', fetch: fetcher as unknown as typeof fetch, timeoutMs: 0 });
  const controller = new AccountController({ http, onChange: s => states.push(s) });
  return { controller, fetcher, states, http };
}
const registration = { ok: true, code: 'ABC234', inviteUrl: 'https://discord.gg/de', expiresInMinutes: 60 };
const credentials = { username: 'Player', password: 'test-password-123' };
const auth = { token: 'NEVER-RETAIN-TOKEN', user: { id: 'user-1' } };
const calls = (fetcher: ReturnType<typeof setup>['fetcher']) => fetcher.mock.calls.map(([url, init]) => ({ path: new URL(url).pathname, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined, credentials: init.credentials }));

describe('account routes and lifecycle', () => {
  it('registers on the actual route and keeps verification instructions, never credentials', async () => {
    const { controller: c, fetcher, states } = setup([response(registration)]);
    await c.dispatch({ type: 'register', ...credentials });
    expect(calls(fetcher)).toEqual([{ path: '/api/de/register', method: 'POST', credentials: 'same-origin', body: credentials }]);
    expect(c.state).toMatchObject({ panel: 'verify', busy: false, verification: { username: 'Player', code: registration.code, inviteUrl: registration.inviteUrl, expiresInMinutes: 60 } });
    expect(JSON.stringify(states)).not.toContain(credentials.password);
    expect(c.state.status).toContain('/verify');
  });
  it('Continue uses re-entered credentials, discards the bearer token, then reads the cookie session', async () => {
    const { controller: c, fetcher, states } = setup([response(auth), response(session)]);
    await c.dispatch({ type: 'continueVerification', ...credentials });
    expect(calls(fetcher).map(c => c.path)).toEqual(['/api/auth/sign-in/username', '/api/de/session']);
    expect(c.state.session).toEqual(session); expect(c.state.panel).toBe('overview');
    expect(JSON.stringify(states)).not.toMatch(/NEVER-RETAIN-TOKEN|test-password-123/);
  });
  it('reset submits to /api/de/reset, not invented start/finish endpoints', async () => {
    const { controller: c, fetcher, states } = setup([response(auth), response(session)]);
    await c.dispatch({ type: 'resetPassword', code: 'DEF567', newPassword: credentials.password });
    expect(calls(fetcher)[0]).toMatchObject({ path: '/api/de/reset', body: { code: 'DEF567', newPassword: credentials.password } });
    expect(c.state.session).toEqual(session); expect(JSON.stringify(states)).not.toMatch(/DEF567|NEVER-RETAIN-TOKEN|test-password-123/);
  });
  it('starts reset with a GET invite and Discord instructions, never an HTTP reset-start mutation', async () => {
    const { controller: c, fetcher } = setup([response({ inviteUrl: 'https://discord.gg/de' })]);
    await c.dispatch({ type: 'show', panel: 'reset' });
    expect(calls(fetcher)).toEqual([{ path: '/api/de/discord-invite', method: 'GET', credentials: 'same-origin', body: undefined }]);
    expect(c.state.inviteUrl).toBe('https://discord.gg/de');
  });
  it('supports recent-session password setup and admin-issued legacy claim codes', async () => {
    const { controller: c, fetcher, states } = setup([response({ ok: true }), response(session), response({ accountKey: 'imported:42' })]);
    await c.dispatch({ type: 'setPassword', username: 'Player', newPassword: credentials.password });
    await c.dispatch({ type: 'claimLegacy', code: 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF' });
    expect(calls(fetcher).map(c => c.path)).toEqual(['/api/de/password', '/api/de/session', '/api/de/claim']);
    expect(c.state.claimedAccount).toBe('imported:42'); expect(JSON.stringify(states)).not.toMatch(/AAAA-BBBB|test-password-123/);
  });
  it.each([
    [400, 'BAD_CODE'], [403, 'STALE'], [409, 'NAME_PENDING'], [429, 'RATE_LIMITED'], [500, 'INTERNAL'],
  ])('surfaces %s errors without silently retrying mutations', async (status, code) => {
    const { controller: c, fetcher } = setup([response({ code, message: `Server instructions ${credentials.password}` }, status)]);
    await c.dispatch({ type: 'register', ...credentials });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(c.state.error).toBe('Server instructions [redacted]'); expect(c.state.busy).toBe(false);
  });
  it('keeps unverified users on verification and offers explicit code recovery', async () => {
    const { controller: c } = setup([response({ code: 'EMAIL_NOT_VERIFIED', message: 'Verify first.' }, 403)]);
    await c.dispatch({ type: 'continueVerification', ...credentials });
    expect(c.state).toMatchObject({ panel: 'verify', errorCode: 'EMAIL_NOT_VERIFIED', session: null });
    expect(c.state.status).toContain('register again');
  });
  it('separates mutation success from reconciliation failure and never replays the mutation', async () => {
    const { controller: c, fetcher } = setup([response({ ok: true }), response({ message: 'offline' }, 503)]);
    await c.dispatch({ type: 'setPassword', newPassword: credentials.password });
    expect(c.state.status).toContain('change succeeded'); expect(fetcher).toHaveBeenCalledTimes(2);
    await c.dispatch({ type: 'refreshSession' }); expect(calls(fetcher).filter(c => c.method === 'POST')).toHaveLength(1);
  });
  it('rejects malformed successful envelopes and unsafe invite URLs', async () => {
    for (const value of [{ ...registration, code: 12 }, { ...registration, inviteUrl: 'javascript:alert(1)' }, { ...registration, expiresInMinutes: -1 }]) {
      const { controller: c } = setup([response(value)]); await c.dispatch({ type: 'register', ...credentials });
      expect(c.state.verification).toBeNull(); expect(c.state.error).toContain('Unexpected');
    }
  });
  it('recovers Discord result by session GET; failure never echoes query details', async () => {
    const { controller: c, fetcher } = setup([response(session)]);
    await c.dispatch({ type: 'recoverDiscordResult', online: '1' }); expect(c.state.session).toEqual(session);
    await c.dispatch({ type: 'recoverDiscordResult', online: '0' }); expect(c.state.error).toContain('Try Discord again'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('links Discord only for a signed-in account, validates redirect and uses explicit linking', async () => {
    const { controller: c, fetcher } = setup([response({ ...session, discord: false }), response({ redirect: false, url: 'https://discord.com/api/oauth2/authorize?client_id=123&state=opaque' })]);
    await c.dispatch({ type: 'linkDiscord' }); expect(fetcher).not.toHaveBeenCalled();
    await c.dispatch({ type: 'refreshSession' }); await c.dispatch({ type: 'linkDiscord' });
    expect(calls(fetcher)[1]).toMatchObject({ path: '/api/auth/link-social', body: { provider: 'discord', callbackURL: '/?online=1', errorCallbackURL: '/?online=0', disableRedirect: true } });
    expect(c.state.redirectUrl).toContain('https://discord.com/');
  });
  it('rejects provider redirects to arbitrary hosts', async () => {
    const { controller: c } = setup([response(session), response({ redirect: false, url: 'https://evil.test/api/oauth2/authorize' })]);
    await c.dispatch({ type: 'refreshSession' }); await c.dispatch({ type: 'linkDiscord' }); expect(c.state.redirectUrl).toBeNull(); expect(c.state.error).toContain('Unexpected');
  });
  it('blocks duplicates and guards stale responses even when fetch ignores abort', async () => {
    const { controller: c, fetcher, states } = setup(); let resolve!: (r: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const pending = c.dispatch({ type: 'register', ...credentials });
    await c.dispatch({ type: 'register', ...credentials }); expect(fetcher).toHaveBeenCalledTimes(1);
    const signal = fetcher.mock.calls[0][1].signal!; c.reset(); expect(signal.aborted).toBe(true);
    const count = states.length; resolve(response(registration)); await pending;
    expect(states).toHaveLength(count); expect(c.state.verification).toBeNull(); expect(c.state.busy).toBe(false);
  });
  it('dispose aborts and clears state without disposing the shared HTTP client', async () => {
    const { controller: c, fetcher, http, states } = setup([response(registration)]);
    await c.dispatch({ type: 'register', ...credentials }); c.dispose(); const count = states.length;
    c.reset(); await c.dispatch({ type: 'refreshSession' }); expect(states).toHaveLength(count); expect(c.state.verification).toBeNull();
    await http.request('GET', '/api/de/session', x => x); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('invalid local credentials do not send mutations', async () => {
    const { controller: c, fetcher } = setup();
    await c.dispatch({ type: 'register', username: '', password: 'short' });
    await c.dispatch({ type: 'resetPassword', code: 'bad', newPassword: credentials.password });
    expect(fetcher).not.toHaveBeenCalled(); expect(c.state.error).toContain('six-character');
  });
});
