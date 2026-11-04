import { ApiError, HttpClient, ResponseError } from '../services/http';
import { GameApi } from '../services/api';
import type { Session } from '../services/api';

export type AccountPanel = 'overview' | 'register' | 'verify' | 'reset' | 'password' | 'claim';
export type AccountAction =
  | { type: 'show'; panel: AccountPanel }
  | { type: 'refreshSession' | 'linkDiscord' }
  | { type: 'register' | 'continueVerification'; username: string; password: string }
  | { type: 'resetPassword'; code: string; newPassword: string }
  | { type: 'setPassword'; newPassword: string; username?: string }
  | { type: 'claimLegacy'; code: string }
  | { type: 'recoverDiscordResult'; online: '1' | '0' };
export interface Verification { username: string; code: string; inviteUrl: string | null; expiresInMinutes: number }
export interface AccountState {
  panel: AccountPanel; busy: boolean; status: string; error: string | null; errorCode: string | null;
  session: Session | null; verification: Verification | null; inviteUrl: string | null;
  redirectUrl: string | null; claimedAccount: string | null;
}
const initial = (): AccountState => ({ panel: 'overview', busy: false, status: 'Account', error: null, errorCode: null, session: null, verification: null, inviteUrl: null, redirectUrl: null, claimedAccount: null });
const bad = (): never => { throw new ResponseError('Unexpected account response'); };
const object = (x: unknown): Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : bad();
const string = (x: unknown): string => typeof x === 'string' && x.length <= 1024 ? x : bad();
function invite(x: unknown): string | null {
  if (x === null) return null;
  const value = string(x); let url: URL; try { url = new URL(value); } catch { return bad(); }
  if (url.protocol !== 'https:' || url.username || url.password || !['discord.gg', 'discord.com', 'www.discord.com'].includes(url.hostname)) return bad();
  return url.href;
}
function registration(x: unknown): Omit<Verification, 'username'> {
  const o = object(x); if (o.ok !== true || typeof o.code !== 'string' || !/^[A-Z0-9]{6}$/.test(o.code) || typeof o.expiresInMinutes !== 'number' || !Number.isFinite(o.expiresInMinutes) || o.expiresInMinutes <= 0) return bad();
  return { code: o.code, inviteUrl: invite(o.inviteUrl), expiresInMinutes: o.expiresInMinutes };
}
function signedIn(x: unknown): void { const o = object(x); if (typeof o.token !== 'string' || !o.token.length) bad(); object(o.user); }
function password(value: string): void { if (value.length < 10 || value.length > 128) throw new Error('Passwords are 10 to 128 characters.'); }
function username(value: string): void { if (!value.trim() || value.length > 64) throw new Error('Choose a valid account name.'); }
const knownCodes = new Set(['EMAIL_NOT_VERIFIED', 'BAD_NAME', 'BAD_PASSWORD', 'NAME_TAKEN', 'NAME_PENDING', 'BAD_CODE', 'RATE_LIMITED', 'STALE']);

/** Cookie authentication only: response tokens and submitted credentials never enter observable state. */
export class AccountController {
  private current = initial();
  private generation = 0;
  private pending: AbortController | null = null;
  private disposed = false;
  private readonly api: GameApi;
  constructor(private readonly options: { http: HttpClient; onChange: (state: AccountState) => void }) { this.api = new GameApi(options.http); }
  get state(): AccountState { return this.current; }
  private update(patch: Partial<AccountState>): void { this.current = { ...this.current, ...patch }; this.options.onChange(this.current); }
  private cancel(): void { this.generation++; this.pending?.abort(); this.pending = null; }
  reset(): void { if (this.disposed) return; this.cancel(); this.current = initial(); this.options.onChange(this.current); }
  dispose(): void { this.cancel(); this.disposed = true; this.current = initial(); }
  async dispatch(action: AccountAction): Promise<void> {
    if (this.disposed) return;
    if (action.type === 'show') {
      this.cancel(); this.update({ panel: action.panel, busy: false, error: null, errorCode: null, redirectUrl: null, verification: action.panel === 'verify' ? this.current.verification : null });
      if (action.panel === 'reset') await this.loadInvite();
      return;
    }
    if (this.current.busy) return;
    if (action.type === 'recoverDiscordResult' && action.online === '0') {
      this.cancel();
      this.update({ busy: false, redirectUrl: null, status: 'Discord sign-in or linking did not finish.', error: 'Try Discord again, or use your account name and password.', errorCode: null }); return;
    }
    this.cancel();
    const generation = this.generation, request = new AbortController(); this.pending = request;
    const alive = (): boolean => !this.disposed && this.generation === generation && !request.signal.aborted;
    const requestOptions = { signal: request.signal };
    let mutationSucceeded = false;
    let secrets: string[] = [];
    this.update({ busy: true, error: null, errorCode: null, redirectUrl: null });
    try {
      if (!alive()) return;
      switch (action.type) {
        case 'register': {
          secrets = [action.password]; username(action.username); password(action.password);
          const result = await this.options.http.request('POST', '/api/de/register', registration, { username: action.username, password: action.password }, requestOptions);
          if (alive()) this.update({ panel: 'verify', verification: { username: action.username, ...result }, inviteUrl: result.inviteUrl, status: 'Run /verify with this code in Discord, then re-enter your password and Continue.' });
          return;
        }
        case 'continueVerification':
          secrets = [action.password]; username(action.username);
          if (!action.password) throw new Error('Re-enter your password to continue.');
          await this.api.signIn(action.username, action.password, requestOptions); mutationSucceeded = true; break;
        case 'resetPassword':
          secrets = [action.code, action.newPassword]; password(action.newPassword);
          if (!/^[A-Za-z0-9]{6}$/.test(action.code.trim())) throw new Error('Enter the six-character code from /reset in Discord.');
          await this.options.http.request('POST', '/api/de/reset', signedIn, { code: action.code, newPassword: action.newPassword }, requestOptions); mutationSucceeded = true; break;
        case 'setPassword':
          secrets = [action.newPassword]; password(action.newPassword);
          if (action.username !== undefined) username(action.username);
          await this.options.http.request('POST', '/api/de/password', x => { if (object(x).ok !== true) bad(); }, { newPassword: action.newPassword, ...(action.username === undefined ? {} : { username: action.username }) }, requestOptions); mutationSucceeded = true; break;
        case 'claimLegacy': {
          secrets = [action.code]; if (!action.code.trim() || action.code.length > 128) throw new Error('Enter the claim code supplied by an admin.');
          const account = await this.options.http.request('POST', '/api/de/claim', x => string(object(x).accountKey), { code: action.code }, requestOptions);
          if (alive()) this.update({ claimedAccount: account, status: 'Legacy game account linked. Reconnect to load its characters.' }); return;
        }
        case 'linkDiscord': {
          if (!this.current.session?.signedIn) throw new Error('Sign in before linking Discord.');
          const url = await this.options.http.request('POST', '/api/auth/link-social', x => {
            const o = object(x); if (typeof o.redirect !== 'boolean') return bad(); const value = string(o.url); let u: URL; try { u = new URL(value); } catch { return bad(); }
            if (u.protocol !== 'https:' || u.hostname !== 'discord.com' || u.pathname !== '/api/oauth2/authorize' || u.username || u.password) return bad();
            return u.href;
          }, { provider: 'discord', callbackURL: '/?online=1', errorCallbackURL: '/?online=0', disableRedirect: true }, requestOptions);
          if (alive()) this.update({ redirectUrl: url, status: 'Continue to Discord to confirm linking.' }); return;
        }
        case 'refreshSession': case 'recoverDiscordResult': break;
      }
      // Read-only reconciliation is never a second mutation attempt.
      if (!alive()) return;
      const session = await this.api.session(requestOptions);
      if (alive()) this.update({ session, verification: session.signedIn ? null : this.current.verification,
        panel: session.signedIn ? 'overview' : this.current.panel,
        status: session.signedIn ? (action.type === 'setPassword' ? 'Password saved. Other sessions were revoked.' : 'Signed in. Account session refreshed.') : 'No signed-in account. Sign in again to continue.' });
    } catch (error) {
      if (!alive()) return;
      const code = error instanceof ApiError && error.code && knownCodes.has(error.code) ? error.code : null;
      let message = error instanceof ApiError || error instanceof ResponseError || error instanceof Error ? error.message : 'Account request failed.';
      for (const secret of secrets) if (secret) message = message.split(secret).join('[redacted]');
      // Do not expose payloads, stack traces, callback query errors or arbitrary response fields.
      this.update({ error: message.slice(0, 512), errorCode: code,
        status: mutationSucceeded ? 'The account change succeeded, but session refresh failed. Refresh account status; do not repeat the change.' : 'Account request did not complete.',
        ...(code === 'EMAIL_NOT_VERIFIED' ? { panel: 'verify' as const, status: 'Verify in Discord first. To recover a lost code, register again with the same name and password.' } : {}) });
    } finally {
      secrets = [];
      if (alive()) { this.pending = null; this.update({ busy: false }); }
    }
  }
  private async loadInvite(): Promise<void> {
    const generation = ++this.generation, request = new AbortController(); this.pending = request;
    try {
      const url = await this.options.http.request('GET', '/api/de/discord-invite', x => invite(object(x).inviteUrl), undefined, { signal: request.signal });
      if (!this.disposed && generation === this.generation) this.update({ inviteUrl: url });
    } catch {
      if (!this.disposed && generation === this.generation) this.update({ error: 'Discord invite unavailable. Open the Duel Evolution Discord server and run /reset.' });
    } finally { if (generation === this.generation) this.pending = null; }
  }
}
