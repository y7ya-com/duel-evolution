import { describe, expect, it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, screenshot, click, press, until, type, byKey, byText, claimStarter, sleep, pressAvatar, createCharacter, freeSlot, say } from './harness';

/** A screenshot tour of every out-of-duel screen with original art (SKIN_SHOT names the set, e.g. before/after), for
 * comparison with the htmlui replica and original captures. Asserts each screen's own controls stay reachable. */
const SET = process.env.SKIN_SHOT ?? 'skin';
describe.skipIf(!enabled)('UI skin tour',() => {
  it('title, characters, starter, lobby, menus, profile, deck, shop, social and options',async () => {
    try {
      const page = await openPage(1280,900); await openClient(page,await signIn(`TestSk${RUN}`));
      const shot = (name:string) => screenshot(page,`${SET}-${name}`);
      await until(page,byText('Go Online'),60000); await sleep(400); await shot('01-title');
      await click(page,'Go Online',60000); await until(page,freeSlot,60000);
      await createCharacter(page,`Skin ${RUN}`,{ wait:false });
      const slot = `[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes(${JSON.stringify(`Skin ${RUN}`)})&&!b.disabled)`;
      await until(page,slot,30000); await sleep(300); await shot('02-characters');
      await press(page,slot); await until(page,byKey('lobby-npcs'),60000);
      await until(page,`[...document.querySelectorAll('section')].some(s=>s.querySelector('h2')?.textContent==='Choose your Starter Deck')`,15000).catch(() => {});
      await sleep(1500); await shot('03-starter');
      await claimStarter(page); await sleep(2500); await shot('04-lobby');
      const self = `document.querySelector('.de-avatar.self')`;
      if (await page.ev(`Boolean(${self})`)) { await pressAvatar(page,self); await until(page,`document.querySelector('.de-context')`,5000).catch(() => {}); await sleep(300); await shot('05-player-menu'); await click(page,'Close'); }
      await press(page,`document.querySelector('[data-key="lobby-duel-rooms"] summary')`); await sleep(300); await shot('06-duel-rooms');
      await page.ev(`document.querySelector('[data-key="lobby-duel-rooms"]').open=false`); await sleep(200);
      await press(page,`document.querySelector('[data-key="lobby-npcs"] summary')`); await sleep(300); await shot('07-npcs');
      await page.ev(`document.querySelector('[data-key="lobby-npcs"]').open=false`);
      const menu = `document.querySelector('[data-key="main-menu"]')`;
      if (await page.ev(`Boolean(${menu})`)) { await press(page,menu); await sleep(300); await shot('08-main-menu'); await press(page,menu); }
      await click(page,'My Profile'); await until(page,byKey('profile-ok'),30000); await sleep(800); await shot('09-profile');
      await press(page,byKey('profile-ok')); await sleep(300);
      await click(page,'Edit Deck'); await until(page,`document.querySelector('.de-deck-columns')`,60000); await sleep(2500); await shot('10-deck');
      await click(page,'Shop'); await until(page,`document.querySelector('.de-shop-grid')`,60000); await sleep(2500); await shot('11-shop');
      await click(page,'Friend List'); await until(page,`document.querySelector('.social-feature')`,60000); await sleep(800); await shot('12-social');
      await click(page,'Options'); await until(page,`document.querySelector('[data-key="browser-fullscreen-toggle"]')`,30000); await sleep(300); await shot('13-options');
      await click(page,'Return to Lobby'); await until(page,byKey('lobby-npcs'),60000); await sleep(800);
      await say(page,'Skin check'); await sleep(1200); await shot('14-chat');
      expect(await page.ev(`document.body.innerText.includes('Skin check')`)).toBe(true);
    } finally { closeAll(); }
  },300000);
});
