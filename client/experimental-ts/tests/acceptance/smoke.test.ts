import { describe, expect, it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, screenshot, text } from './harness';
describe.skipIf(!enabled)('local stack smoke',() => {
  it('signs a test user in and reaches the lobby',async () => {
    try {
      const page = await openPage(); await openClient(page,await signIn(`TestSm${RUN}`));
      await screenshot(page,'smoke-title');
      await enterWorld(page,`Smoke ${RUN}`); await screenshot(page,'smoke-lobby');
      expect(await text(page)).toContain(`Smoke ${RUN}`);
    } finally { closeAll(); }
  },180000);
});
