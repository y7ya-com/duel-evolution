import type { GameplayCommand } from '../gameplay/binary';
import { socialCommands } from '../gameplay/social';
import type { Mail, TeamHeader, TeamMember } from '../gameplay/social';
import { decodeGameplayMessage } from '../gameplay/messages';
import { initialTradeView, reduceTradeView, tradeCommands } from '../gameplay/trade';
import type { TradeEvent, TradeView } from '../gameplay/trade';

export type SocialAction =
  | { type: 'editDraft'; key: string; value: string }
  | { type: 'refreshMail' | 'refreshTeam' | 'leaveTeam' | 'disbandTeam' | 'readyTrade' | 'cancelTrade' }
  | { type: 'sendMail'; toPid: number; subject: string; body: string }
  | { type: 'findPlayer' | 'createTeam'; name: string }
  | { type: 'inviteFriend' | 'ignore' | 'unignore' | 'inviteTeam'; pid: number }
  | { type: 'inviteTrade'; pid: number; name?: string }
  | { type: 'replyFriend'; pid: number; accept: boolean }
  | { type: 'replyTeam'; teamId: number; inviterPid: number; accept: boolean }
  | { type: 'replyTrade' | 'confirmTrade'; accept: boolean }
  | { type: 'addTradeCard'; passcode: number }
  | { type: 'removeTradeCard'; index: number };
export interface FriendOffer { pid: number; name: string; level: number }
export interface TeamInvite { teamId: number; teamName: string; inviterPid: number; inviterName: string }
export interface SocialTrade {
  phase: 'idle' | 'requesting' | 'offered' | 'waiting' | 'open' | 'closing' | 'finished';
  partner: { pid: number; name: string } | null;
  ownOffer: readonly number[];
  pendingMove: { type: 'add'; passcode: number } | { type: 'remove'; index: number } | null;
  view: TradeView;
  /** The server's explanation when it refused the exchange (sent as a system chat line). */
  reason?: string;
}
export interface SocialState {
  status: string; error: string | null; drafts: Readonly<Record<string, string>>;
  mail: readonly Mail[]; mailLoading: boolean;
  lookup: { result: number; pid: number; name?: string } | null;
  friendOffers: readonly FriendOffer[]; friends: readonly { pid: number; name: string }[];
  ignored: readonly number[];
  teamInvites: readonly TeamInvite[]; team: TeamHeader | null; teamMembers: readonly TeamMember[]; teamLoading: boolean;
  trade: SocialTrade;
}
const freshTrade = (): SocialTrade => ({ phase: 'idle', partner: null, ownOffer: [], pendingMove: null, view: initialTradeView() });
const initial = (): SocialState => ({ status: 'Ready', error: null, drafts: {}, mail: [], mailLoading: false, lookup: null, friendOffers: [], friends: [], ignored: [], teamInvites: [], team: null, teamMembers: [], teamLoading: false, trade: freshTrade() });
const bounded = <T>(items: readonly T[], limit = 100): T[] => items.slice(-limit);
/** Copies of a card that may still be offered: the trade's trunk count, less the soul-bound copies in its limit table
 * (0x7129..0x7131, the original TradeEntry card box's "not tradeable" counts) and the copies already offered. */
export function tradeableCopies(trade: Pick<SocialTrade, 'view' | 'ownOffer'>, passcode: number): number {
  const count = (rows: readonly { passcode: number; count: number }[]) => rows.filter(r => r.passcode === passcode).reduce((n, r) => n + r.count, 0);
  return Math.max(0, count(trade.view.trunk) - count(trade.view.limit) - trade.ownOffer.filter(p => p === passcode).length);
}
function pid(value: number): number { if (!Number.isInteger(value) || value <= 0 || value > 0xffffffff) throw new Error('Enter a valid positive player/card id.'); return value; }
function text(value: string, max: number): string {
  if (!value.trim() || value.length > max || /[^\x20-\xff\n\r]/.test(value)) throw new Error(`Enter 1–${max} Latin-1 characters.`);
  return value;
}

export class SocialController {
  private current = initial();
  private lookupName: string | null = null;
  private disposed = false;
  private ignorePending = new Map<number, number>();
  private decliningTrade = false;
  /** A server trade session exists (opened, not yet exited): closing it needs USEREXIT even after it finished. */
  private tradeSession = false;
  private closingTimer: ReturnType<typeof setTimeout> | null = null;
  private mailSending = false;
  constructor(private readonly options: { send: (command: GameplayCommand) => void; onChange: (state: SocialState) => void }) {}
  get state(): SocialState { return this.current; }
  private update(patch: Partial<SocialState>): void { this.current = { ...this.current, ...patch }; this.options.onChange(this.current); }
  private trade(patch: Partial<SocialTrade>): void { this.update({ trade: { ...this.current.trade, ...patch } }); }
  private send(command: GameplayCommand): void { this.options.send(command); }
  reset(): void {
    if (this.disposed) return;
    this.ignorePending.clear(); this.decliningTrade = false; this.mailSending = false; this.tradeSession = false; if (this.closingTimer) { clearTimeout(this.closingTimer); this.closingTimer = null; }
    this.current = initial(); this.options.onChange(this.current);
  }
  dispose(): void { this.disposed = true; this.ignorePending.clear(); if (this.closingTimer) { clearTimeout(this.closingTimer); this.closingTimer = null; } }
  dispatch(action: SocialAction): void {
    if (this.disposed) return;
    const before = {state:this.current,ignorePending:new Map(this.ignorePending),decliningTrade:this.decliningTrade,mailSending:this.mailSending};
    try {
      if (action.type === 'editDraft') {
        if (action.key.length > 64 || action.value.length > 512 || (!Object.hasOwn(this.current.drafts, action.key) && Object.keys(this.current.drafts).length >= 32)) throw new Error('Draft limit exceeded.');
        this.update({ drafts: { ...this.current.drafts, [action.key]: action.value } }); return;
      }
      const s = this.current, t = s.trade;
      const open = () => { if (t.phase !== 'open') throw new Error('No open trade.'); };
      const editable = () => { open(); if (t.view.ready || t.view.otherReady || t.pendingMove) throw new Error('Offers are locked or a move is awaiting the peer.'); };
      let command: GameplayCommand;
      switch (action.type) {
        case 'refreshMail': if (s.mailLoading) return; this.update({ mailLoading: true }); command = socialCommands.receiveMail(); break;
        case 'sendMail':
          if (this.mailSending) throw new Error('A mail request is pending.');
          command = socialCommands.sendMail(pid(action.toPid), text(action.subject, 31), text(action.body, 511)); this.mailSending = true; break;
        case 'findPlayer': command = socialCommands.findPlayer(text(action.name, 15)); this.lookupName = action.name; break;
        case 'inviteFriend': command = socialCommands.requestFriend(pid(action.pid)); break;
        case 'replyFriend':
          if (!s.friendOffers.some(o => o.pid === action.pid)) throw new Error('Friend invitation is no longer available.');
          command = socialCommands.replyFriend(pid(action.pid), action.accept);
          this.update({ friendOffers: s.friendOffers.filter(o => o.pid !== action.pid) }); break;
        case 'ignore': case 'unignore': {
          const id = action.type === 'ignore' ? 0x4531 : 0x4541;
          if (this.ignorePending.has(id)) throw new Error('An ignore request is pending.');
          const target = pid(action.pid); command = action.type === 'ignore' ? socialCommands.ignore(target) : socialCommands.unignore(target);
          this.ignorePending.set(id, target); break;
        }
        case 'refreshTeam': if (s.teamLoading) return; this.update({ teamLoading: true }); command = socialCommands.team(); break;
        case 'createTeam': command = socialCommands.createTeam(text(action.name, 15)); break;
        case 'inviteTeam': command = socialCommands.inviteToTeam(pid(action.pid)); break;
        case 'replyTeam':
          if (!s.teamInvites.some(i => i.teamId === action.teamId && i.inviterPid === action.inviterPid)) throw new Error('Team invitation is no longer available.');
          command = socialCommands.replyTeamInvite(pid(action.teamId), pid(action.inviterPid), action.accept);
          this.update({ teamInvites: s.teamInvites.filter(i => i.teamId !== action.teamId || i.inviterPid !== action.inviterPid) }); break;
        case 'leaveTeam': command = socialCommands.leaveTeam(); break;
        case 'disbandTeam': command = socialCommands.disbandTeam(); break;
        case 'inviteTrade':
          if (!['idle', 'closing', 'finished'].includes(t.phase)) throw new Error('Close the current trade before inviting another player.');
          command = tradeCommands.request(pid(action.pid));
          if (t.phase === 'finished') this.send(tradeCommands.exit());
          this.trade({ ...freshTrade(), phase: 'requesting', partner: { pid: action.pid, name: action.name ?? '' } }); break;
        case 'replyTrade':
          if (t.phase !== 'offered') throw new Error('No trade invitation to answer.');
          this.decliningTrade = !action.accept; command = action.accept ? tradeCommands.accept() : tradeCommands.reject(); this.trade({ phase: 'waiting' }); break;
        case 'addTradeCard': editable(); if (t.ownOffer.length >= 10) throw new Error('At most ten cards may be offered.');
          if (tradeableCopies(t, action.passcode) < 1) throw new Error(t.view.limit.some(r => r.passcode === action.passcode && r.count > 0) ? 'Soul-bound copies cannot be traded.' : 'No copy of that card is left to offer.');
          command = tradeCommands.addCard(pid(action.passcode)); this.trade({ pendingMove: { type: 'add', passcode: action.passcode } }); break;
        case 'removeTradeCard': editable();
          if (!Number.isInteger(action.index) || action.index < 0 || action.index >= t.ownOffer.length) throw new Error('Invalid offer index.');
          command = tradeCommands.removeCard(action.index); this.trade({ pendingMove: { type: 'remove', index: action.index } }); break;
        case 'readyTrade': open(); if (t.pendingMove) throw new Error('Wait for the peer to acknowledge your move.'); if (t.view.ready) return; command = tradeCommands.ready(); break;
        case 'confirmTrade': open(); if (!t.view.allReady) throw new Error('Both players must be ready before confirmation.'); command = tradeCommands.confirm(action.accept); break;
        case 'cancelTrade':
          if (t.phase === 'idle') return;
          // A declined invitation never opened a session: close locally. A finished trade still has its session
          // (the original leaves the trade room with USEREXIT), so it is exited like an open one.
          if (t.phase === 'finished' && !this.tradeSession) { this.trade(freshTrade()); this.update({ status: 'Trade closed.', error: null }); return; }
          if (this.closingTimer) clearTimeout(this.closingTimer);
          this.closingTimer = setTimeout(() => { this.closingTimer = null; if (!this.disposed && this.current.trade.phase === 'closing') { this.tradeSession = false; this.trade(freshTrade()); } }, 3000);
          // USEREXIT also handles a request accepted while its reply was still in flight.
          command = tradeCommands.exit();
          this.trade({ phase: 'closing' }); break;
      }
      this.update({ status: `Request sent: ${action.type}; awaiting server.`, error: null });
      try { this.send(command); }
      catch (error) {
        // A synchronous transport rejection did not queue this intent. Retain
        // confirmed state and allow an explicit retry after backpressure clears.
        this.current = before.state; this.ignorePending = before.ignorePending;
        this.decliningTrade = before.decliningTrade; this.mailSending = before.mailSending;
        throw error;
      }
    } catch (error) { this.update({ error: error instanceof Error ? error.message : String(error) }); }
  }
  receive(message: { id: number; data: Uint8Array }): void {
    if (this.disposed) return;
    // server/src/game/trade.ts: a refused exchange is explained by a server line (pid 0) starting "Trade cancelled:".
    if (message.id === 0x4402 && message.data.length > 26 && this.current.trade.phase !== 'idle') {
      const text = String.fromCharCode(...message.data.subarray(26)).replace(/\0[\s\S]*$/, '');
      if (/^Trade cancelled:/.test(text)) this.trade({ reason: text });
    }
    try {
      const event = decodeGameplayMessage(message.id, message.data);
      if (!event) return;
      if (event.type === 'trade') { this.receiveTrade(event.event); return; }
      if (event.type === 'data') {
        switch (event.id) {
          case 0x4501: this.update({ lookup: { ...event.value, ...(this.lookupName ? { name: this.lookupName } : {}) }, status: event.value.result === 0 ? `Player id: ${event.value.pid}` : `Player lookup failed (${event.value.result}).` }); break;
          case 0x4512: this.update({ friendOffers: bounded([...this.current.friendOffers.filter(o => o.pid !== event.value.pid), event.value]) }); break;
          case 0x4515: this.update({ friends: event.value.accepted ? bounded([...this.current.friends.filter(f => f.pid !== event.value.pid), { pid: event.value.pid, name: event.value.name }]) : this.current.friends, status: `Friend invitation ${event.value.accepted ? 'accepted' : 'declined'} by ${event.value.name}.` }); break;
          case 0x4612: this.update({ mail: bounded([...this.current.mail, event.value], 50) }); break;
          case 0x4567: this.update({ teamInvites: bounded([...this.current.teamInvites.filter(i => i.teamId !== event.value.teamId || i.inviterPid !== event.value.inviterPid), event.value]) }); break;
          case 0x4564: this.update({ team: event.value.id ? event.value : null, teamMembers: [], teamLoading: true }); break;
          case 0x4559: this.update({ teamMembers: bounded([...this.current.teamMembers, ...event.value]) }); break;
          case 0x4560: case 0x4561: case 0x4562: case 0x4570: this.dispatch({ type: 'refreshTeam' }); break;
        }
      } else if (event.type === 'boundary') {
        if (event.id === 0x4611) this.update({ mail: [], mailLoading: true });
        if (event.id === 0x4613) this.update({ mailLoading: false, status: 'Mailbox received.' });
        if (event.id === 0x4565) this.update({ teamLoading: false });
      } else if (event.type === 'notice' && event.id === 0x4603) {
        this.update({ status: 'New mail available.' });
      } else if (event.type === 'result') {
        if (![0x4511, 0x4531, 0x4541, 0x4551, 0x4553, 0x4566, 0x4601, 0x4621].includes(event.id)) return;
        if (event.id === 0x4601) this.mailSending = false;
        const target = this.ignorePending.get(event.id);
        if (target !== undefined) {
          this.ignorePending.delete(event.id);
          if (event.code === 0) this.update({ ignored: event.id === 0x4531 ? bounded([...this.current.ignored.filter(p => p !== target), target]) : this.current.ignored.filter(p => p !== target) });
        }
        this.update({ status: `Server result 0x${event.id.toString(16)}: ${event.code}${event.id === 0x4601 && event.code === 0 ? ' (mail accepted; delivery not guaranteed)' : ''}`, error: event.code < 0 || event.code > 0 && event.id !== 0x4621 ? `Server rejected request (${event.code}).` : null });
        if ((event.id === 0x4551 || event.id === 0x4553) && event.code === 0) this.dispatch({ type: 'refreshTeam' });
      }
    } catch (error) { this.update({ error: `Social message: ${error instanceof Error ? error.message : String(error)}` }); }
  }
  private receiveTrade(event: TradeEvent): void {
    const t = this.current.trade;
    if (event.type === 'offer') { this.decliningTrade = false; this.trade({ ...freshTrade(), phase: 'offered', partner: { pid: event.pid, name: event.name } }); return; }
    if (event.type === 'result') {
      // Code 1 answers an invitation the other player declined: an outcome, not an error.
      const who = t.partner?.name || 'The other player';
      if (event.code === 1 && !this.decliningTrade) {
        this.trade({ phase: 'finished', view: { ...t.view, finished: true, success: false } }); this.update({ status: `${who} declined the trade.`, error: null }); return;
      }
      this.update({ status: `Trade ${event.operation}: ${event.code}`, error: event.code !== 0 ? `Trade request failed (${event.code}).` : null });
      if (event.operation === 'request') this.trade({ phase: event.code === 0 ? 'waiting' : 'idle' });
      // A refused add/remove gets no 0x7122 arrival: the offer is unchanged and editable again.
      if ((event.operation === 'addCard' || event.operation === 'removeCard') && event.code !== 0) this.trade({ pendingMove: null });
      if (event.operation === 'offerReply') {
        // The decliner has nothing left to show; the inviter sees the ended trade until it closes it.
        if (this.decliningTrade) { this.decliningTrade = false; this.trade(freshTrade()); this.update({ status: 'Trade invitation declined.' }); return; }
        if (event.code !== 0) { this.trade({ phase: 'finished' }); this.update({ status: event.code === 1 ? 'Trade invitation declined.' : `Trade reply failed (${event.code}).` }); return; }
        this.trade({ phase: 'open' }); this.tradeSession = true;
        this.send(tradeCommands.loadCollection()); this.send(tradeCommands.start());
      }
      return;
    }
    if (event.type === 'arrived' && t.pendingMove) {
      const move = t.pendingMove;
      this.trade({ ownOffer: move.type === 'add' ? bounded([...t.ownOffer, move.passcode], 10) : t.ownOffer.filter((_, i) => i !== move.index), pendingMove: null });
      return;
    }
    if ((event.type === 'exit' || event.type === 'cancelled') && t.phase === 'closing') {
      this.tradeSession = false; if (this.closingTimer) { clearTimeout(this.closingTimer); this.closingTimer = null; }
      this.trade(freshTrade()); return;
    }
    if (event.type === 'exit' || event.type === 'cancelled') this.tradeSession = false;
    const view = reduceTradeView(t.view, event);
    this.trade({ view: { ...view, otherOffer: bounded(view.otherOffer, 10), trunk: bounded(view.trunk, 20000), limit: bounded(view.limit, 20000) },
      ...(event.type === 'end' || event.type === 'exit' || event.type === 'cancelled' ? { phase: event.type === 'cancelled' ? 'idle' as const : 'finished' as const, pendingMove: null } : {}) });
    if (event.type === 'move') this.send(tradeCommands.acknowledgeMove());
    if (event.type === 'end') this.update({ status: event.success ? 'Server confirmed trade completed.' : 'Server cancelled trade; cards were not exchanged.' });
  }
}
