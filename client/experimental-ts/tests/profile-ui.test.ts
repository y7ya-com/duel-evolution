import { afterEach, expect, it, vi } from 'vitest';
import { ProfileController } from '../src/features/profile';
import { renderProfileFeature } from '../src/features/profile-ui';
import { TestDocument, findButton } from './ui-dom-fixture';
import type { TestNode } from './ui-dom-fixture';
import { payload } from '../src/gameplay/binary';
afterEach(() => vi.unstubAllGlobals());
it('keeps bounded drafts across live renders and renders server content as literal text', () => {
  vi.stubGlobal('document', new TestDocument());
  const c = new ProfileController({ send: vi.fn(), onChange: vi.fn() }); c.dispatch({ type: 'setSelf', pid: 10 }); c.dispatch({ type: 'open', pid: 10 });
  let root = renderProfileFeature(c.state, a => c.dispatch(a)) as unknown as TestNode;
  for (const [name, value] of [['Comment', '<img src=x>'], ['Personal title', 'Draft title']]) {
    const node = root.querySelectorAll('input').find(x => x.name === name)!; node.value = value; node.oninput!({});
  }
  c.receive({ id: 0x4180, data: payload().u32(10).u8(0).text('<script>literal</script>', 32).build() });
  root = renderProfileFeature(c.state, a => c.dispatch(a)) as unknown as TestNode;
  expect(root.querySelectorAll('input').find(x => x.name === 'Comment')?.value).toBe('<img src=x>');
  expect(root.querySelectorAll('input').find(x => x.name === 'Personal title')?.value).toBe('Draft title');
  expect(root.textContent).toContain('<script>literal</script>'); expect(root.querySelectorAll('script')).toEqual([]);
  expect(new Set(root.querySelectorAll('input').map(x => x.dataset.key)).size).toBe(2);
});
it('routes interactions to host callbacks and shows edit controls only for self', () => {
  vi.stubGlobal('document', new TestDocument());
  const send = vi.fn(), interaction = vi.fn(), c = new ProfileController({ send, onChange: vi.fn() });
  c.dispatch({ type: 'setSelf', pid: 10 }); c.dispatch({ type: 'open', pid: 20 }); send.mockClear();
  const root = renderProfileFeature(c.state, a => c.dispatch(a), { onInteraction: interaction }) as unknown as TestNode;
  findButton(root, 'Write mail').onclick!({}); expect(interaction).toHaveBeenCalledWith('mail', 20); expect(send).not.toHaveBeenCalled();
  expect(root.querySelectorAll('input').map(x => x.name)).toEqual([]);
  findButton(root, 'Close').onclick!({}); expect(c.state.selectedPid).toBeNull(); expect(send).not.toHaveBeenCalled();
  c.dispatch({ type: 'open', pid: 10 });
  const own = renderProfileFeature(c.state, a => c.dispatch(a)) as unknown as TestNode;
  findButton(own, 'Clear achievement title').onclick!({}); expect(send.mock.calls.at(-1)?.[0].id).toBe(0x4174);
});
