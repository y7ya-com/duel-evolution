import { afterEach, expect, it, vi } from 'vitest';
import { OnlineController } from '../src/features/online';
import { HttpClient } from '../src/services/http';
import { renderOnlineFeature } from '../src/ui/extra/online';
import { TestDocument, TestNode, findButton } from './ui-dom-fixture';
class LocalNode extends TestNode {
  addEventListener(type: string, listener: (event: any) => void) { (this as any)[`on${type}`] = listener; }
}
class LocalDocument extends TestDocument {
  createElement(tag: string) { return new LocalNode(tag, this); }
}
afterEach(() => vi.unstubAllGlobals());
it('preserves every nonfocused tag draft across packet-style renders and uses literal server names', async () => {
  const doc = new LocalDocument(); vi.stubGlobal('document', doc);
  const http = new HttpClient({ origin: 'https://game.test', fetch: vi.fn() });
  const c = new OnlineController({ http, onChange: vi.fn() });
  c.state.tag = { self: { pid: 1, name: 'a' }, available: true, active: false, players: [2, 3, 4].map(pid => ({ pid, name: `<img onerror=alert(1)>${pid}` })), invitations: [] };
  const dispatch = vi.fn();
  let root = renderOnlineFeature(c.state, dispatch, 'tag') as unknown as TestNode;
  const fields = root.querySelectorAll('select');
  fields.forEach((field, i) => { field.value = String(i + 2); field.onchange!({}); });
  doc.activeElement = null;
  root = renderOnlineFeature({ ...c.state }, dispatch, 'tag') as unknown as TestNode;
  expect(root.querySelectorAll('select').map(n => n.value)).toEqual(['2', '3', '4']);
  expect(new Set(root.querySelectorAll('select').map(n => n.dataset.key)).size).toBe(3);
  expect(root.querySelectorAll('img')).toHaveLength(0); expect(root.textContent).toContain('<img onerror=alert(1)>');
  root.querySelectorAll('form')[0].onsubmit!({ preventDefault() {} });
  expect(dispatch).toHaveBeenCalledWith({ type: 'tag-invite', teammatePid: 2, opponentPid: 3, opponentTeammatePid: 4 });
  c.reset(); expect(c.state.drafts).toEqual({}); c.dispose(); http.dispose();
});
it('submits opaque server invitation IDs unchanged and disables pending controls', () => {
  vi.stubGlobal('document', new LocalDocument());
  const http = new HttpClient({ origin: 'https://game.test', fetch: vi.fn() }); const c = new OnlineController({ http, onChange: vi.fn() });
  c.state.tag = { self: { pid: 2, name: 'b' }, available: false, active: false, invitations: [{ id: 'server-invitation', hostPid: 1, expires: 1700000120, outbound: false, seats: ['captain', 'opponent', 'teammate', 'opponent-teammate'].map((role, i) => ({ pid: i + 1, name: String(i), accepted: false, role })) as any }], players: [] };
  const dispatch = vi.fn(), root = renderOnlineFeature(c.state, dispatch, 'tag') as unknown as TestNode;
  findButton(root, 'Accept invitation').onclick!({}); expect(dispatch).toHaveBeenCalledWith({ type: 'tag-accept', id: 'server-invitation' });
  const pending = renderOnlineFeature({ ...c.state, pending: 'tag-accept' }, dispatch, 'tag') as unknown as TestNode;
  expect(pending.querySelectorAll('button').every(b => b.disabled)).toBe(true); c.dispose(); http.dispose();
});
