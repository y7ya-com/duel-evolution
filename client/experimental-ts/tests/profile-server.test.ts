import { afterEach, expect, it, vi } from 'vitest';
import { harness } from '../../../server/test/notes-harness';
import type { Link } from '../../../server/test/notes-harness';
import { ProfileController } from '../src/features/profile';

afterEach(() => vi.useRealTimers());
async function setup() {
  const h = harness(), a = h.client('A', 'A', 'pw', 'profile-a'), b = h.client('B', 'B', 'pw', 'profile-b');
  await a.account(0, 'Alice'); await b.account(0, 'Bob'); await a.enterRoom(); await b.enterRoom();
  const link = (l: Link, pid: number) => {
    let cursor = l.mark(); const c = new ProfileController({ send: cmd => l.send(cmd.id, cmd.data), onChange() {} });
    c.dispatch({ type: 'setSelf', pid });
    return { c, flush() { for (const m of l.msgs.slice(cursor)) { cursor++; c.receive(m); } } };
  };
  const ca = link(a.room!, a.pid!), cb = link(b.room!, b.pid!);
  const pump = async () => { for (let i = 0; i < 12; i++) { await h.tick(100); ca.flush(); cb.flush(); } };
  return { h, a, b, ca: ca.c, cb: cb.c, pump };
}
it('reads actual server identity, placeholder profile, block progression and avatar response', async () => {
  const { a, b, ca, pump } = await setup();
  ca.dispatch({ type: 'open', pid: b.pid! }); await pump();
  expect(ca.state.details).toMatchObject({ pid: b.pid, name: `Jugador ${b.pid}`, level: 0, score: 0, mp: 0 });
  expect(ca.state.summary).toMatchObject({ pid: b.pid, name: 'Bob' });
  expect(ca.state.location).toMatchObject({ pid: b.pid, name: 'Bob' });
  expect(ca.state.loading).toBe(false); expect(ca.state.error).toBeNull();
  expect(a.errors()).toEqual([]);
});
it('updates comments through the real server and relays them to the other selected profile', async () => {
  const { a, ca, cb, pump } = await setup();
  ca.dispatch({ type: 'open', pid: a.pid! }); cb.dispatch({ type: 'open', pid: a.pid! }); await pump();
  ca.dispatch({ type: 'editDraft', field: 'comment', value: '<b>Literal</b>' });
  ca.dispatch({ type: 'saveComment', line: 0 }); expect(ca.state.pending).toBe('comment');
  await pump(); expect(ca.state.comments[0]).toBe('<b>Literal</b>'); expect(cb.state.comments[0]).toBe('<b>Literal</b>');
  cb.dispatch({ type: 'refresh' }); await pump(); expect(cb.state.comments[0]).toBe('<b>Literal</b>');
  ca.dispatch({ type: 'editDraft', field: 'title', value: 'Personal title' }); ca.dispatch({ type: 'saveComment', line: 1 }); await pump();
  expect(cb.state.comments[1]).toBe('Personal title');
  ca.dispatch({ type: 'editDraft', field: 'comment', value: '' }); ca.dispatch({ type: 'saveComment', line: 0 }); await pump(); expect(cb.state.comments[0]).toBe('');
});
it('confirms supported title clearing and reports actual server rejection of unowned titles', async () => {
  const { a, ca, pump } = await setup(); ca.dispatch({ type: 'open', pid: a.pid! }); await pump();
  ca.dispatch({ type: 'setTitle', bit: 224 }); await pump(); expect(ca.state.status).toBe('Server accepted title update.'); expect(ca.state.error).toBeNull();
  ca.dispatch({ type: 'setTitle', bit: 65535 }); await pump(); expect(ca.state.error).toBe('Server rejected profile update (1).');
});
