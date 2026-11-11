import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { CLIENT, RUN, enabled, openPage, closeAll, openClient, enterWorld, until, press, text, byKey, click, byText, startNpcDuel, surrender, lobbyShown, stack, sleep } from './harness';

/** The v2 front (infra/v2) in front of a live-server stack: `wrangler dev -c infra/v2/wrangler.jsonc -c
 *  infra/v2/dev/live-stub.jsonc` (infra/v2/README.md "Local check"), its build from infra/ship-v2.sh (VITE_DE_ASSETS=/game/,
 *  VITE_DE_DISCORD_OAUTH=0). ACCEPTANCE_CLIENT is the front, ACCEPTANCE_STACK the stack behind it. Skipped without
 *  V2_FRONT=1. Sign-in goes through the front (its Origin rewrite and host-only cookie), the page opens with no ?assets=
 *  (the build's /game/ through the front), and the game channel (/net) is the front's WebSocket. */
const on = enabled && process.env.V2_FRONT === '1';
const SHOTS = process.env.V2_SHOTS ?? `${homedir()}/.cache/de-scratch/visual/v2`;
const shot = async (page: { shot(): Promise<Buffer> }, name: string) => { mkdirSync(SHOTS, { recursive: true }); writeFileSync(`${SHOTS}/${name}.png`, await page.shot()); };

describe.skipIf(!on)('v2 front over the live server', () => {
  it('signs in through the front, reaches the lobby, opens Edit Deck and plays an NPC duel', async () => {
    try {
      // a foreign Origin is refused by live as before; v2's own is live's to the server
      const foreign = await fetch(CLIENT + '/api/de/duel/challenge', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
      expect(foreign.status).toBe(403);
      const own = await fetch(CLIENT + '/api/de/duel/challenge', { method: 'POST', headers: { Origin: CLIENT, 'Content-Type': 'application/json' }, body: '{}' });
      expect(own.status).toBe(401);   // past the Origin check: signed out
      const r = await fetch(CLIENT + '/api/de/test-sign-in', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: CLIENT, 'x-test-signin': stack().secret }, body: JSON.stringify({ name: `TestVf${RUN}` }) });
      expect(r.status).toBe(200);
      const set = r.headers.getSetCookie();
      expect(set.length).toBeGreaterThan(0);
      expect(set.every(c => !/;\s*domain=/i.test(c))).toBe(true);
      expect(r.headers.get('x-robots-tag')).toContain('noindex');
      const cookies = set.map(c => { const pair = c.split(';')[0]!, at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1) }; });

      // signed out first: the sign-in window says Discord sign-in isn't here, no dead button
      const out = await openPage();
      await openClient(out, null, { assets: false });
      await until(out, byKey('login-submit'), 60000);
      expect(await text(out)).toContain('No Discord sign-in here yet');
      expect(await out.ev(`Boolean(${byKey('login-discord')})`)).toBe(false);
      await shot(out, 'v2-signin');

      const page = await openPage();
      await openClient(page, cookies, { assets: false });
      await enterWorld(page, `Vf ${RUN}`);
      await until(page, lobbyShown, 60000);
      const files = await page.ev(`performance.getEntriesByType('resource').map(e=>e.name).filter(n=>n.includes('/game/')).length`) as number;
      expect(files).toBeGreaterThan(0);   // the game files came from the build's /game/, through the front
      await sleep(1500); await shot(page, 'v2-lobby');
      // a production build has no window.__deApp (main.ts: development only): the deck screen by its own controls
      await click(page, 'Edit Deck');
      await until(page, `${byKey('deck-exit')}&&document.querySelectorAll('#htmlui-host [data-key^="deck-"]').length>5`, 60000);
      await sleep(2500); await shot(page, 'v2-deck');
      for (let i = 0; i < 5 && await page.ev(`Boolean(${byKey('deck-exit')})`); i++) {
        await press(page, byKey('deck-exit')).catch(() => {}); await sleep(800);
        for (const label of ['Yes', 'OK']) if (await page.ev(`Boolean(${byText(label)})`)) { await press(page, byText(label)).catch(() => {}); await sleep(500); }
      }
      // the player list shifts while other tests' players come and go: a press that lands on another NPC's row is closed
      // and tried again, as a player would
      for (let i = 0; ; i++) {
        try { await startNpcDuel(page, 'Yami Yugi'); break; } catch (e) {
          if (i >= 2) throw e;
          const close = `[...document.querySelectorAll('[aria-label="NPC interaction"] button')].find(b=>b.textContent==='Close NPC')`;
          if (await page.ev(`Boolean(${close})`)) await press(page, close).catch(() => {});
          await sleep(1000);
        }
      }
      await until(page, `[...document.querySelectorAll('.de-field-card')].filter(b=>(b.getAttribute('aria-label')??'').includes(', your hand')).length>=5`, 60000);
      await sleep(1000); await shot(page, 'v2-duel');
      await surrender(page);
      await until(page, `[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Return to Lobby')`, 60000);
      await shot(page, 'v2-duel-end');
      await press(page, `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Return to Lobby')`);
      await until(page, lobbyShown, 60000);
    } finally { closeAll(); }
  }, 600000);
});
