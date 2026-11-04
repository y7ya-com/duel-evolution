import { ApiError, HttpClient } from '../services/http';
import { decodeOnlineTag, type TagInvitation, type TagState } from './online';

/** The Duel menu's Tag Duel lobby (client/web-shell/htmlui/tag-lobby.js): the server's tag state, polled while in a
 * lobby, the three chosen seats and the dialog's notices. Stable player ids go to the server; names are display only.
 * Provenance: server/src/duel/tagRelay.ts tagApi (GET /api/de/tag, POST invite/accept/decline/cancel). */
export interface TagSeats { teammatePid: number; opponentPid: number; opponentTeammatePid: number }
export type TagRole = keyof TagSeats;
export const TAG_ROLES: readonly TagRole[] = ['teammatePid', 'opponentPid', 'opponentTeammatePid'];
export interface TagLobbyState { open: boolean; state: TagState | null; selected: TagSeats; busy: boolean; error: string; notice: string }
export type TagLobbyAction =
  | { type: 'open' } | { type: 'close' } | { type: 'refresh' } | { type: 'invite' }
  | { type: 'select'; role: TagRole; pid: number }
  | { type: 'accept' | 'decline' | 'cancel'; id: string };

const NOTICES: Record<string, string> = {
  cancelled: 'The captain cancelled the invitation.', expired: 'The tag invitation expired. Invite your group again.',
  unavailable: 'A player became unavailable. Invite your group again.', started: 'Everyone is ready. Starting your tag duel…',
};
const empty = (): TagSeats => ({ teammatePid: 0, opponentPid: 0, opponentTeammatePid: 0 });
const initial = (): TagLobbyState => ({ open: false, state: null, selected: empty(), busy: false, error: '', notice: '' });

export class TagLobbyController {
  private current = initial();
  private revision = 0;
  private enabled = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private poll = 0;
  private abort = new AbortController();
  private seen = new Set<string>();
  private readError = false;
  private disposed = false;
  constructor(private readonly config: { http: HttpClient; onChange: (state: TagLobbyState) => void; now?: () => number; interval?: (active: boolean) => number }) {}
  get state(): TagLobbyState { return this.current; }
  private now(): number { return (this.config.now ?? (() => Date.now() / 1000))(); }
  private publish(update: Partial<TagLobbyState>): void {
    const next = { ...this.current, ...update };
    if (JSON.stringify(next) === JSON.stringify(this.current)) return;
    this.current = next; this.config.onChange(next);
  }
  /** Invitations the server still offers, newest outbound first (a player has at most one). */
  invitations(state = this.current.state): TagInvitation[] { return (state?.invitations ?? []).filter(i => i.expires > this.now()); }
  /** Poll while the player stands in a lobby: every 2 s while the dialog or an invitation is open, else every 5 s. */
  start(): void {
    if (this.disposed || this.enabled) return;
    this.enabled = true; const token = ++this.poll;
    const tick = async () => {
      if (!this.enabled || token !== this.poll) return;
      await this.refresh();
      if (this.enabled && token === this.poll) this.timer = setTimeout(tick, (this.config.interval ?? (active => active ? 2000 : 5000))(this.current.open || this.invitations().length > 0));
    };
    void tick();
  }
  /** Leaving the lobby (a duel, a disconnect): stop polling and close the dialog; a running duel owns the seats now. */
  stop(): void {
    if (!this.enabled) return;
    this.enabled = false; this.poll++; if (this.timer) clearTimeout(this.timer); this.timer = null;
    this.revision++; this.abort.abort(); this.abort = new AbortController();
    this.publish({ open: false, busy: false, notice: '', error: '' });
  }
  reset(): void { this.stop(); this.seen.clear(); this.readError = false; this.current = initial(); if (!this.disposed) this.config.onChange(this.current); }
  dispose(): void { this.stop(); this.disposed = true; }
  async dispatch(action: TagLobbyAction): Promise<void> {
    if (this.disposed) return;
    switch (action.type) {
      case 'open': this.publish({ open: true }); return this.refresh();
      case 'close': this.publish({ open: false, notice: '', error: this.readError ? this.current.error : '' }); return;
      case 'refresh': return this.refresh();
      case 'select': return this.select(action.role, action.pid);
      default: await this.act(action.type, 'id' in action ? action.id : undefined);
    }
  }
  async refresh(): Promise<void> {
    if (this.disposed || this.current.busy) return;
    const token = ++this.revision, previous = this.invitations()[0] ?? this.current.state?.invitations[0];
    try {
      const state = await this.config.http.request('GET', '/api/de/tag', decodeOnlineTag, undefined, { signal: this.abort.signal });
      if (token !== this.revision || this.disposed) return;
      const selected = { ...this.current.selected };
      for (const role of TAG_ROLES) if (!state.players.some(p => p.pid === selected[role])) selected[role] = 0;
      const error = this.readError ? '' : this.current.error; this.readError = false;
      const incoming = this.invitations(state).find(i => !i.outbound && !this.seen.has(i.id));
      if (incoming) this.seen.add(incoming.id);
      this.publish({ state, selected, error, notice: this.notice(state, previous), ...(incoming && this.enabled ? { open: true } : {}) });
    } catch (e) {
      if (token !== this.revision || this.disposed || (e instanceof DOMException && e.name === 'AbortError')) return;
      this.readError = true; this.publish({ error: e instanceof Error && e.message !== 'not-in-game' ? e.message.slice(0, 256) : 'Tag duels could not be loaded. Try again.' });
    }
  }
  private notice(state: TagState, previous: TagInvitation | undefined): string {
    const event = state.event;
    if (state.started || state.active) return NOTICES.started!;
    if (event && this.now() - event.at < 120) return event.kind === 'declined' ? `${event.name || 'A player'} declined the invitation.` : event.kind === 'started' ? '' : NOTICES[event.kind] ?? '';
    if (previous && !this.invitations(state).some(i => i.id === previous.id)) return previous.expires <= this.now() ? NOTICES.expired! : 'The tag invitation ended or a player declined. You can invite a new group.';
    return this.current.notice;
  }
  private select(role: TagRole, pid: number): void {
    if (!TAG_ROLES.includes(role) || this.current.busy || !Number.isSafeInteger(pid) || pid < 0) return;
    if (pid && (!this.current.state?.players.some(p => p.pid === pid) || TAG_ROLES.some(r => r !== role && this.current.selected[r] === pid))) return;
    this.publish({ selected: { ...this.current.selected, [role]: pid }, error: '', notice: '' });
  }
  private async act(action: 'invite' | 'accept' | 'decline' | 'cancel', id?: string): Promise<void> {
    if (this.current.busy) return;
    const state = this.current.state, picks = TAG_ROLES.map(r => this.current.selected[r]);
    if (action === 'invite') {
      if (!state?.available || picks.some(p => !p || !state.players.some(q => q.pid === p)) || new Set(picks).size !== 3) {
        this.publish({ error: state && !state.available && state.reason ? reasonText(state.reason) : 'Choose a teammate and two different opponents from this location.' }); return;
      }
    } else if (!id || !this.invitations().some(i => i.id === id)) { this.publish({ error: 'This invitation has expired. Refresh to invite your group again.' }); return; }
    const token = ++this.revision; this.abort.abort(); this.abort = new AbortController();
    this.publish({ busy: true, error: '', notice: '' });
    try {
      const body = action === 'invite' ? { ...this.current.selected } : { id };
      const next = await this.config.http.request('POST', `/api/de/tag/${action}`, decodeOnlineTag, body, { signal: this.abort.signal });
      if (token !== this.revision || this.disposed) return;
      const notice = next.started || next.active ? NOTICES.started! : action === 'cancel' ? 'Your tag invitation was cancelled.' : action === 'decline' ? 'Tag invitation declined.' : action === 'invite' ? 'Invitation sent. Waiting for all four players to accept.' : 'Accepted. Waiting for the other players.';
      this.publish({ state: next, busy: false, notice });
    } catch (e) {
      if (token !== this.revision || this.disposed) return;
      let state = this.current.state;
      if (e instanceof ApiError && e.payload && typeof e.payload === 'object' && 'self' in e.payload) try { state = decodeOnlineTag(e.payload); } catch { /* keep the previous state */ }
      this.publish({ state, busy: false, error: e instanceof Error ? e.message.slice(0, 256) : 'The request failed. Try again.' });
    }
  }
}
/** The server's unavailability codes, in the dialog's words. */
export function reasonText(reason: string): string {
  return ({ 'in-duel': 'You are already in a tag duel.', 'not-in-location': 'Enter a location to invite players.', 'invitation-pending': 'You already have a pending tag invitation.', unavailable: 'Return to the lobby and finish your current activity to invite players.' } as Record<string, string>)[reason] ?? reason;
}
