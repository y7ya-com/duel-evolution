import { afterEach, expect, it, vi } from 'vitest';
import { SocialController } from '../src/features/social';
import { renderSocialFeature, renderTradeWindow } from '../src/ui/extra/social';
import { TestDocument, findButton } from './ui-dom-fixture';
import type { TestNode } from './ui-dom-fixture';
import { payload } from '../src/gameplay/binary';
afterEach(() => vi.unstubAllGlobals());
it('keeps drafts across live rerenders, renders server text literally and addresses mail by a found player', () => {
  vi.stubGlobal('document', new TestDocument());
  const send = vi.fn(), c = new SocialController({ send, onChange: vi.fn() });
  let root = renderSocialFeature(c.state, a => c.dispatch(a)) as unknown as TestNode;
  const set = (name: string, value: string) => { const node = root.querySelectorAll('*').find(n => n.name === name)!; node.value = value; node.oninput!({}); };
  set('Player name', 'Rival'); set('Subject', '<img src=x>'); set('Message', 'Multi-field draft');
  root.querySelectorAll('form')[0].onsubmit!({ preventDefault() {} }); expect(send.mock.calls.at(-1)?.[0].id).toBe(0x4500);
  c.receive({ id: 0x4501, data: payload().u32(0).u32(1004).build() });
  root = renderSocialFeature(c.state, a => c.dispatch(a)) as unknown as TestNode;
  expect(root.textContent).toContain('Rival'); expect(root.querySelectorAll('input').find(n => n.name === 'Subject')?.value).toBe('<img src=x>');
  expect(root.querySelectorAll('img')).toEqual([]);
  findButton(root, 'Write mail').onclick!({}); root = renderSocialFeature(c.state, a => c.dispatch(a)) as unknown as TestNode;
  expect(root.textContent).toContain('New mail to Rival');
  const fields = root.querySelectorAll('*').filter(n => n.name); expect(new Set(fields.map(n => n.dataset.key)).size).toBe(fields.length);
  // Sending mail needs a second explicit click.
  send.mockClear(); const mail = root.querySelectorAll('form').find(f => f.className.includes('de-mail-compose'))!;
  mail.onsubmit!({ preventDefault() {} }); expect(send).not.toHaveBeenCalled();
  findButton(mail, 'Keep editing').onclick!({}); expect(send).not.toHaveBeenCalled();
  mail.onsubmit!({ preventDefault() {} }); findButton(mail, 'Confirm').onclick!({}); expect(send.mock.calls[0][0].id).toBe(0x4600);
});
it('shows the trade as cards picked from the server trunk and needs a second click to ready', () => {
  vi.stubGlobal('document', new TestDocument());
  const send = vi.fn(), c = new SocialController({ send, onChange: vi.fn() });
  c.dispatch({ type: 'inviteTrade', pid: 1004 }); c.receive({ id: 0x7105, data: new Uint8Array(4) }); send.mockClear();
  const card = (passcode: number) => ({ id: String(passcode), passcode, name: `Named ${passcode}` });
  const trade = renderTradeWindow(c.state.trade, a => c.dispatch(a), c.state, { card }) as unknown as TestNode;
  expect(trade.textContent).toContain('Trade with');
  findButton(trade, 'Ready').onclick!({}); expect(send).not.toHaveBeenCalled(); findButton(trade, 'Confirm').onclick!({}); expect([...send.mock.calls[0][0].data]).toEqual([0x71, 0x17, 1]);
  expect(renderTradeWindow({ ...c.state.trade, phase: 'idle' }, () => {}, c.state)).toBeNull();
});
