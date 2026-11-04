/** Full real-server harness: controllers send actual opcodes and consume gateway-decoded responses. */
import { afterEach, expect, it, vi } from 'vitest';
import { harness } from '../../../server/test/notes-harness';
import type { Link } from '../../../server/test/notes-harness';
import { SocialController } from '../src/features/social';

afterEach(() => vi.useRealTimers());
async function setup() {
  const h = harness(), a = h.client('A', 'A', 'pw', 'user-a'), b = h.client('B', 'B', 'pw', 'user-b');
  await a.account(0, 'Alice'); await b.account(0, 'Bob'); await a.enterRoom(); await b.enterRoom();
  const link = (l: Link) => {
    let cursor = l.mark();
    const controller = new SocialController({ send: command => l.send(command.id, command.data), onChange() {} });
    return { controller, flush() { for (const m of l.msgs.slice(cursor)) { cursor++; controller.receive(m); } } };
  };
  const ca = link(a.room!), cb = link(b.room!);
  const pump = async () => { for (let i = 0; i < 12; i++) { await h.tick(100); ca.flush(); cb.flush(); } };
  return { h, a, b, ca: ca.controller, cb: cb.controller, pump };
}
it('controllers handle real friend, mail, ignore and authoritative team membership flows', async () => {
  const { a, b, ca, cb, pump } = await setup();
  ca.dispatch({ type: 'inviteFriend', pid: b.pid! }); await pump(); expect(cb.state.friendOffers).toMatchObject([{ pid: a.pid, name: 'Alice' }]);
  cb.dispatch({ type: 'replyFriend', pid: a.pid!, accept: true }); await pump(); expect(ca.state.friends).toMatchObject([{ pid: b.pid, name: 'Bob' }]); expect(cb.state.friends).toEqual([]);
  ca.dispatch({ type: 'sendMail', toPid: b.pid!, subject: 'Hi', body: '<literal text>' }); await pump(); cb.dispatch({ type: 'refreshMail' }); await pump(); expect(cb.state.mail).toMatchObject([{ fromPid: a.pid, body: '<literal text>' }]);
  ca.dispatch({ type: 'ignore', pid: b.pid! }); await pump(); expect(ca.state.ignored).toEqual([b.pid]); ca.dispatch({ type: 'unignore', pid: b.pid! }); await pump(); expect(ca.state.ignored).toEqual([]);
  ca.dispatch({ type: 'createTeam', name: 'Test team' }); await pump(); expect(ca.state.team?.name).toBe('Test team');
  ca.dispatch({ type: 'inviteTeam', pid: b.pid! }); await pump(); const invite = cb.state.teamInvites[0]; expect(invite.inviterPid).toBe(a.pid);
  cb.dispatch({ type: 'replyTeam', teamId: invite.teamId, inviterPid: invite.inviterPid, accept: true }); await pump(); expect(cb.state.teamMembers).toHaveLength(2);
  cb.dispatch({ type: 'leaveTeam' }); await pump(); expect(cb.state.team).toBeNull(); expect(ca.state.teamMembers).toHaveLength(1);
});
it('real trade flows acknowledge peer moves, unlock on negative confirmation and never assert failed exchange succeeded', async () => {
  const { a, b, ca, cb, pump } = await setup();
  ca.dispatch({ type: 'inviteTrade', pid: b.pid! }); await pump(); expect(cb.state.trade.partner?.pid).toBe(a.pid);
  cb.dispatch({ type: 'replyTrade', accept: true }); await pump(); expect(ca.state.trade.phase).toBe('open'); expect(cb.state.trade.phase).toBe('open');
  ca.dispatch({ type: 'addTradeCard', passcode: 89631139 }); expect(ca.state.trade.ownOffer).toEqual([]); await pump(); expect(cb.state.trade.view.otherOffer).toEqual([89631139]); expect(ca.state.trade.ownOffer).toEqual([89631139]);
  ca.dispatch({ type: 'removeTradeCard', index: 0 }); await pump(); expect(ca.state.trade.ownOffer).toEqual([]); expect(cb.state.trade.view.otherOffer).toEqual([]);
  ca.dispatch({ type: 'readyTrade' }); cb.dispatch({ type: 'readyTrade' }); await pump(); expect(ca.state.trade.view.allReady).toBe(true);
  ca.dispatch({ type: 'confirmTrade', accept: false }); await pump(); expect(cb.state.trade.view.allReady).toBe(false); expect(ca.state.trade.view.ready).toBe(false);
  // An unknown card is accepted provisionally by ADDCARD but refused at the final server execution.
  ca.dispatch({ type: 'addTradeCard', passcode: 4294967295 }); await pump(); ca.dispatch({ type: 'readyTrade' }); cb.dispatch({ type: 'readyTrade' }); await pump();
  ca.dispatch({ type: 'confirmTrade', accept: true }); cb.dispatch({ type: 'confirmTrade', accept: true }); await pump();
  expect(ca.state.trade.view.success).toBe(false); expect(cb.state.trade.view.success).toBe(false); expect(ca.state.status).toContain('not exchanged');
});
it('real trade cancellation releases the server session and completed sessions can be replaced', async () => {
  const { b, ca, cb, pump } = await setup();
  ca.dispatch({ type: 'inviteTrade', pid: b.pid! }); await pump(); cb.dispatch({ type: 'replyTrade', accept: true }); await pump();
  ca.dispatch({ type: 'cancelTrade' }); expect(ca.state.trade.phase).toBe('closing'); await pump(); expect(cb.state.trade.phase).toBe('finished');
  ca.dispatch({ type: 'inviteTrade', pid: b.pid! }); await pump(); cb.dispatch({ type: 'replyTrade', accept: true }); await pump(); expect(ca.state.trade.phase).toBe('open');
  ca.dispatch({ type: 'readyTrade' }); cb.dispatch({ type: 'readyTrade' }); await pump();
  ca.dispatch({ type: 'confirmTrade', accept: true }); cb.dispatch({ type: 'confirmTrade', accept: true }); await pump();
  expect(ca.state.trade.view.success).toBe(true); expect(cb.state.trade.view.success).toBe(true);
  ca.dispatch({ type: 'inviteTrade', pid: b.pid! }); await pump(); expect(ca.state.trade.phase).toBe('waiting'); expect(cb.state.trade.phase).toBe('offered');
});
