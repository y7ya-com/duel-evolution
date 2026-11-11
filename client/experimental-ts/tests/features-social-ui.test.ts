import { afterEach, expect, it, vi } from 'vitest';
import { SocialController } from '../src/features/social';
import { renderTradeTrunk } from '../src/ui/extra/social';
import { TestDocument, findButton } from './ui-dom-fixture';
import type { TestNode } from './ui-dom-fixture';
import { payload } from '../src/gameplay/binary';
afterEach(() => vi.unstubAllGlobals());
it('shows the trade trunk as cards picked from the server trunk (main\'s HTML trade windows own Ready/Confirm)', () => {
  vi.stubGlobal('document', new TestDocument());
  const send = vi.fn(), c = new SocialController({ send, onChange: vi.fn() });
  c.dispatch({ type: 'inviteTrade', pid: 1004 }); c.receive({ id: 0x7105, data: new Uint8Array(4) }); send.mockClear();
  const card = (passcode: number) => ({ id: String(passcode), passcode, name: `Named ${passcode}` });
  const trunk = renderTradeTrunk(c.state.trade, a => c.dispatch(a), { card, open: true }) as unknown as TestNode;
  expect(trunk.getAttribute('aria-label')).toBe('Card Swap'); expect(send).not.toHaveBeenCalled();
});
