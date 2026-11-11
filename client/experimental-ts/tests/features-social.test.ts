import { describe, expect, it, vi } from 'vitest';
import { SocialController } from '../src/features/social';
import type { SocialAction } from '../src/features/social';
import type { GameplayCommand } from '../src/gameplay/binary';
import { W } from '../../../server/src/net/proto';

function setup() { const sent: GameplayCommand[] = [], changed = vi.fn(); const controller = new SocialController({ send: c => sent.push(c), onChange: changed }); return { controller, sent, changed }; }
const result = (code = 0) => new W().u32(code).bytes();
const receive = (c: SocialController, id: number, data = new Uint8Array()) => c.receive({ id, data });
describe('social controller authority and lifecycle', () => {
  it.each<SocialAction>([{type:'refreshMail'},{type:'refreshTeam'},{type:'ignore',pid:1004},{type:'inviteTrade',pid:1004},{type:'sendMail',toPid:1004,subject:'Hello',body:'Body'}])('allows explicit retry after an unsent $type request', action => {
    let blocked=true; const sent:GameplayCommand[]=[];
    const c=new SocialController({send:command=>{if(blocked)throw new Error('Backpressure');sent.push(command);},onChange:()=>{}});
    c.dispatch(action); expect(c.state.error).toBe('Backpressure'); expect(c.state.mailLoading).toBe(false); expect(c.state.teamLoading).toBe(false); expect(c.state.trade.phase).toBe('idle');
    blocked=false; c.dispatch(action); expect(sent).toHaveLength(1); expect(c.state.error).toBeNull();
  });
  it('asks who on the Friend List is online as the original does (0x3603 with the pids) and keeps the 0x3604 answer', () => {
    const { controller: c, sent } = setup();
    c.dispatch({ type: 'refreshOnline' }); expect(sent).toHaveLength(0); expect(c.state.online).toEqual({});
    receive(c, 0x4515, new W().u32(1).u32(1004).s('Bob', 16).bytes()); receive(c, 0x4515, new W().u32(1).u32(1008).s('Cy', 16).bytes());
    expect(c.state.friends.map(f => f.pid)).toEqual([1004, 1008]);
    c.dispatch({ type: 'refreshOnline' }); expect(sent.at(-1)).toMatchObject({ id: 0x3603, data: new W().u32(2).u32(1004).u32(1008).bytes() });
    receive(c, 0x3604, new W().u32(0).u32(1).u32(1004).u8(0).u8(12).u8(0).u8(0).u8(0).bytes());
    expect(c.state.online).toEqual({ 1004: { kind: 12, area: 0 } });
  });
  it('retains an invitation when its reply could not be sent',()=>{
    let blocked=true; const send=vi.fn(()=>{if(blocked)throw new Error('Backpressure');});
    const c=new SocialController({send,onChange:()=>{}}); receive(c,0x4512,new W().u32(1004).s('Bob',16).u8(4).bytes());
    c.dispatch({type:'replyFriend',pid:1004,accept:true}); expect(c.state.friendOffers).toHaveLength(1);
    blocked=false; c.dispatch({type:'replyFriend',pid:1004,accept:true}); expect(c.state.friendOffers).toHaveLength(0); expect(send).toHaveBeenCalledTimes(2);
  });
  it('sends only real social commands, waits for ignore replies and bounds drafts', () => {
    const { controller: c, sent } = setup();
    c.dispatch({ type: 'ignore', pid: 1004 }); expect(sent[0]).toMatchObject({ id: 0x4530, data: result(1004) }); expect(c.state.ignored).toEqual([]);
    receive(c, 0x4531, result()); expect(c.state.ignored).toEqual([1004]);
    c.dispatch({ type: 'unignore', pid: 1004 }); expect(c.state.ignored).toEqual([1004]); receive(c, 0x4541, result()); expect(c.state.ignored).toEqual([]);
    c.dispatch({ type: 'editDraft', key: 'Subject', value: 'Hello' }); receive(c, 0x4603); expect(c.state.drafts.Subject).toBe('Hello');
    for (let i = 0; i < 50; i++) c.dispatch({ type: 'editDraft', key: String(i), value: 'draft' }); expect(Object.keys(c.state.drafts)).toHaveLength(32);
  });
  it('does not invent friend acceptor acknowledgement or team membership', () => {
    const { controller: c, sent } = setup();
    receive(c, 0x4512, new W().u32(1004).s('<Bob>', 16).u8(4).bytes());
    c.dispatch({ type: 'replyFriend', pid: 1004, accept: true }); expect(c.state.friends).toEqual([]); expect(sent[0].id).toBe(0x4513);
    receive(c, 0x4515, new W().u32(1).u32(1008).s('Alice', 16).bytes()); expect(c.state.friends).toEqual([{ pid: 1008, name: 'Alice' }]);
    c.dispatch({ type: 'createTeam', name: 'Team' }); expect(c.state.team).toBeNull(); receive(c, 0x4551, result()); expect(sent.at(-1)?.id).toBe(0x4558);
    receive(c, 0x4564, new W().u32(1).u32(8).s('Team', 16).raw(new Uint8Array(16)).bytes());
    receive(c, 0x4559, new W().u32(1000).s('Me', 16).u8(14).bytes()); receive(c, 0x4565, result());
    expect(c.state.team?.id).toBe(8); expect(c.state.teamMembers).toHaveLength(1); expect(c.state.teamLoading).toBe(false);
  });
  it('bounds mail and incoming offers; does not claim delivery from send result', () => {
    const { controller: c } = setup(); c.dispatch({ type: 'refreshMail' }); receive(c, 0x4611, result());
    const mail = new W().u32(1004).s('Bob', 16).u32(1000).s('Me', 16).u32(100).s('Subject', 32).s('Body', 512).s('', 64).u8(0).bytes();
    for (let i = 0; i < 70; i++) receive(c, 0x4612, mail); receive(c, 0x4613); expect(c.state.mail).toHaveLength(50); expect(c.state.mailLoading).toBe(false);
    c.dispatch({ type: 'sendMail', toPid: 1004, subject: 'Hi', body: 'Body' }); receive(c, 0x4601, result()); expect(c.state.status).toContain('delivery not guaranteed');
    for (let i = 1; i < 120; i++) receive(c, 0x4512, new W().u32(i).s('Bob', 16).u8(4).bytes()); expect(c.state.friendOffers).toHaveLength(100);
  });
  it('only confirms own trade movements on ARRIVE and requires explicit final confirmation', () => {
    const { controller: c, sent } = setup(); c.dispatch({ type: 'inviteTrade', pid: 1004 }); receive(c, 0x7103, result()); expect(c.state.trade.phase).toBe('waiting');
    receive(c, 0x7105, result()); expect(c.state.trade.phase).toBe('open'); expect(sent.slice(-2).map(x => [...x.data])).toEqual([[0x71, 0x32], [0x71, 1]]);
    receive(c, 0x7125); receive(c, 0x7126, new W().u32(89631139).u8(1).bytes()); receive(c, 0x7127);
    c.dispatch({ type: 'addTradeCard', passcode: 89631139 }); receive(c, 0x7113, result()); expect(c.state.trade.ownOffer).toEqual([]);
    c.dispatch({ type: 'readyTrade' }); expect(c.state.error).toContain('acknowledge'); receive(c, 0x7122); expect(c.state.trade.ownOffer).toEqual([89631139]);
    receive(c, 0x7116, new W().u32(123).u8(0).bytes()); expect(c.state.trade.view.otherOffer).toEqual([123]); expect([...sent.at(-1)!.data]).toEqual([0x71, 0x22]);
    c.dispatch({ type: 'readyTrade' }); expect(c.state.trade.view.ready).toBe(false); receive(c, 0x7117, Uint8Array.of(1)); receive(c, 0x7134, Uint8Array.of(1));
    const mark = sent.length; receive(c, 0x7118); expect(sent).toHaveLength(mark); c.dispatch({ type: 'confirmTrade', accept: true }); expect([...sent.at(-1)!.data]).toEqual([0x71, 0x19, 1]);
    receive(c, 0x7120, Uint8Array.of(3)); expect(c.state.trade.view.success).toBeNull(); receive(c, 0x7121, Uint8Array.of(1)); expect(c.state.trade.view.success).toBe(true);
  });
  it('offers only tradeable copies: soul-bound ones stay home, and a refused add unlocks the offer', () => {
    const { controller: c, sent } = setup(); c.dispatch({ type: 'inviteTrade', pid: 1004 }); receive(c, 0x7103, result()); receive(c, 0x7105, result());
    receive(c, 0x7125); receive(c, 0x7126, new W().u32(100).u8(3).u32(200).u8(1).bytes()); receive(c, 0x7127);
    receive(c, 0x7129); receive(c, 0x7130, new W().u32(100).u8(2).u32(200).u8(1).bytes()); receive(c, 0x7131);
    const mark = sent.length;
    c.dispatch({ type: 'addTradeCard', passcode: 200 }); expect(c.state.error).toBe('Soul-bound copies cannot be traded.'); expect(sent).toHaveLength(mark);
    c.dispatch({ type: 'addTradeCard', passcode: 100 }); expect(sent).toHaveLength(mark + 1); receive(c, 0x7122); expect(c.state.trade.ownOffer).toEqual([100]);
    c.dispatch({ type: 'addTradeCard', passcode: 100 }); expect(c.state.error).toBe('Soul-bound copies cannot be traded.'); expect(sent).toHaveLength(mark + 1);
    c.dispatch({ type: 'removeTradeCard', index: 0 }); receive(c, 0x7114, result(-1)); expect(c.state.trade.pendingMove).toBeNull(); expect(c.state.trade.ownOffer).toEqual([100]);
    c.dispatch({ type: 'readyTrade' }); expect(c.state.error ?? '').not.toContain('acknowledge');
  });
  it('handles declined trade ack zero without opening, return-to-editing, malformed messages and disposal', () => {
    const { controller: c, sent, changed } = setup(); receive(c, 0x7104, new W().u32(1004).s('Bob', 16).bytes());
    c.dispatch({ type: 'replyTrade', accept: false }); receive(c, 0x7105, result()); expect(c.state.trade.phase).toBe('idle'); expect(c.state.status).toBe('Trade invitation declined.'); expect(sent).toHaveLength(1);
    receive(c, 0x4612, Uint8Array.of(1)); expect(c.state.error).toContain('Truncated'); receive(c, 0xffff); c.reset(); expect(c.state.error).toBeNull();
    const before = changed.mock.calls.length; c.dispose(); c.reset(); c.dispatch({ type: 'refreshMail' }); receive(c, 0x4603); expect(changed).toHaveBeenCalledTimes(before); expect(sent).toHaveLength(1);
  });
});
