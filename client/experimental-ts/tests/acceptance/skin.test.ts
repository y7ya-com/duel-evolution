import { describe, expect, it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, screenshot, click, press, until, type, byKey, byText, goOnlineButton, claimStarter, sleep, pressAvatar, createCharacter, freeSlot, say, lobbyShown, searchPlayers, openDeckEditor, exitDeckEditor } from './harness';

/** A screenshot tour of every out-of-duel screen with original art (SKIN_SHOT names the set, e.g. before/after), for
 * comparison with the htmlui replica and original captures. Asserts each screen's own controls stay reachable. */
const SET = process.env.SKIN_SHOT ?? 'skin';
describe.skipIf(!enabled)('UI skin tour',() => {
  it('title, characters, starter, lobby, menus, profile, deck, shop, social and options',async () => {
    try {
      const page = await openPage(1280,900); await openClient(page,await signIn(`TestSk${RUN}`));
      const shot = (name:string) => screenshot(page,`${SET}-${name}`);
      await until(page,goOnlineButton,60000); await sleep(400); await shot('01-title');
      await click(page,'Go Online',60000); await until(page,freeSlot,60000);
      await createCharacter(page,`Skin ${RUN}`,{ wait:false });
      const slot = `[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes(${JSON.stringify(`Skin ${RUN}`)})&&!b.disabled)`;
      await until(page,slot,30000); await sleep(300); await shot('02-characters');
      await press(page,slot); await until(page,lobbyShown,60000);
      await until(page,`[...document.querySelectorAll('section')].some(s=>s.querySelector(':scope>h2')?.textContent==='Choose your Starter Deck')`,15000).catch(() => {});
      await sleep(1500); await shot('03-starter');
      await claimStarter(page); await sleep(2500); await shot('04-lobby');
      const self = `document.querySelector('.de-avatar.self')`;
      if (await page.ev(`Boolean(${self})`)) { await pressAvatar(page,self); await until(page,byKey('profile-ok'),5000).catch(() => {}); await sleep(300); await shot('05-player-menu'); if (await page.ev(`Boolean(${byKey('profile-ok')})`)) await press(page,byKey('profile-ok')); }
      // the bar's Duel key: main's Duel menu; the player list's Show all: the NPCs here (main's CFindMenu)
      await press(page,byKey('menubar-duel')); await until(page,byKey('duel-cancel'),10000); await sleep(500); await shot('06-duel-rooms');
      await press(page,byKey('duel-cancel')); await sleep(200);
      await searchPlayers(page,'Show all'); await sleep(500); await shot('07-npcs');
      const menu = `document.querySelector('[data-key="main-menu"]')`;
      if (await page.ev(`Boolean(${menu})`)) { await press(page,menu); await sleep(300); await shot('08-main-menu'); await press(page,menu); }
      await click(page,'My Profile'); await until(page,byKey('profile-ok'),30000); await sleep(800); await shot('09-profile');
      await press(page,byKey('profile-ok')); await sleep(300);
      // main's deck screen (deck-dom.ts), left through its EXIT; main's card shop (shop/index.js), left through its Back
      await openDeckEditor(page); await sleep(2500); await shot('10-deck'); await exitDeckEditor(page);
      await click(page,'Shop'); await until(page,`document.querySelector('[data-key="card-shop"] [aria-label="Card Shop"] .banner')`,60000); await sleep(2500); await shot('11-shop');
      await press(page,`document.querySelector('[data-key="card-shop"] [aria-label="Leave the shop"]')`); await until(page,lobbyShown,30000);
      await click(page,'Find Player'); await until(page,`document.querySelector('[data-key="find-name"]')`,60000); await sleep(800); await shot('12-social'); await press(page,byKey('find-close')); await sleep(300);
      // main's DUEL OPTIONS window (htmlui/options.ts), closed by its Close
      await click(page,'DUEL OPTIONS'); await until(page,byKey('duel-config-ok'),30000); await sleep(300); await shot('13-options');
      await press(page,byKey('duel-config-cancel')); await until(page,lobbyShown,60000); await sleep(800);
      await say(page,'Skin check'); await sleep(1200); await shot('14-chat');
      expect(await page.ev(`document.body.innerText.includes('Skin check')`)).toBe(true);
    } finally { closeAll(); }
  },300000);
});
