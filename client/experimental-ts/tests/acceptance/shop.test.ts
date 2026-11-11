import { describe, expect, it } from 'vitest';
import { invitation, finished, playerMenu, startBoth } from './pvp-helpers';
import { RUN, CLIENT, enabled, openPage, closeAll, signIn, openClient, enterWorld, reenterWorld, click, until, press, pressAvatar, sleep, screenshot, record, byKey, byText, duelBot, type Page, cardButton, lobbyShown, openDeckEditor, exitDeckEditor, SHOP, openShop, leaveShop, shopWallet as wallet, shopPacks as packs, shopBuyKey as buyKey, shopReveal as reveal, takeReveal, surrender } from './harness';

/** main's card shop (htmlui/card-shop.ts mounting web-shell/htmlui/shop/index.js: GET /api/de/shop, POST
 * /api/de/shop/buy, its reveal) online, against the real server (harness: openShop, shopWallet, shopPacks, takeReveal). */
const owned = async (page:Page) => { const d = await openDeckEditor(page); await exitDeckEditor(page); return d.collection.reduce((n,c) => n + c.owned,0); };

describe.skipIf(!enabled)('shop, card-get and cosmetics against the real server',() => {
  it('shows the catalogue, opens purchases once, refuses bad purchases clearly',async () => {
    try {
      const character = `Sh ${RUN}`, page = await openPage(1280,900);
      await openClient(page,await signIn(`TestSh${RUN}`));
      await enterWorld(page,character);
      const before = await owned(page);
      await openShop(page);
      await screenshot(page,'shop-catalog');

      // shops.catalog: the tabs, the packs with names and prices, the wallet
      const w0 = await wallet(page), serverWallet = () => page.ev(`fetch('/api/de/shop',{credentials:'include'}).then(r=>r.json()).then(s=>s.wallet?.total??null)`) as Promise<number|null>;
      // a new character's starter MP (the server's: the wallet the shop's GET reports)
      expect(w0.total).toBeGreaterThan(0); expect(w0.total).toBe(await serverWallet());
      const tabs = await page.ev(`[...${SHOP}.querySelectorAll('.tabs [data-k^="tab-"]')].map(t=>t.textContent.trim())`) as string[];
      for (const t of ['Recommended','Card Packs','Structure Decks','Cosmetic Boxes']) expect(tabs.some(x => x.startsWith(t)),t).toBe(true);   // a tab may carry its "!" badge
      await press(page,`${SHOP}.querySelector('[data-k=tab-packs]')`); await sleep(600);
      const onSale = await packs(page);
      expect(onSale.length).toBeGreaterThan(0);
      for (const p of onSale) { expect(p.name).not.toMatch(/^Item \d+$/); expect(p.price).toBeGreaterThan(0); expect(p.disabled).toBe(p.price > w0.total); }
      record('shops.catalog',{ actions:'Open the Shop (Main Menu) on a new character; its Packs tab', expected:'Load packs with correct price and availability',
        observed:`wallet "${w0.text}"; tabs ${tabs.join(', ')}; ${onSale.length} packs on sale (e.g. ${onSale[0]!.name} ${onSale[0]!.price} MP), Buy enabled exactly where the wallet covers it` });

      // shops.purchase: one pack opens in main's reveal, charged and granted once
      const pack = onSale.find(p => p.unit === 'pack' && !p.disabled && p.price <= w0.total / 3)!;
      expect(pack).toBeTruthy();
      await press(page,buyKey(pack.k));
      const opened = await takeReveal(page);
      expect(opened.slots).toBe(5);
      const w1 = await wallet(page);
      expect(w1.total).toBe(w0.total - pack.price);
      expect(await serverWallet()).toBe(w1.total);

      // shops.constraints: a double click on Buy opens one pack and charges once
      await page.ev(`(()=>{const b=${buyKey(pack.k)};b.click();b.click();b.click();})()`);
      const doubled = await takeReveal(page);
      expect(doubled.slots).toBe(5);
      await sleep(1500);
      expect(await page.ev(`Boolean(${reveal})`)).toBe(false);
      const w2 = await wallet(page);
      expect(w2.total).toBe(w1.total - pack.price);
      expect(await serverWallet()).toBe(w2.total);
      await screenshot(page,'shop-after');
      await leaveShop(page);
      const after = await owned(page);
      expect(after).toBe(before + 10);

      // a reload shows the same wallet: charged once and persisted
      await page.go(`${CLIENT}/?portOffset=1000&assets=/game-assets/`,`document.querySelector('.de-client')`);
      await reenterWorld(page,character); await openShop(page);
      expect((await wallet(page)).total).toBe(w2.total);
      record('shops.purchase',{ actions:`Buy 1 × ${pack.name} (reveal to Done); Buy clicked three times at once; reload`, expected:'Purchase/open products, update inventory/wallet once and render acquired cards',
        observed:`"${opened.title}": ${opened.slots} cards ("${opened.summary}"); wallet ${w0.total}→${w1.total}; triple click opened one pack (${doubled.slots} cards) → ${w2.total}; collection ${before}→${after} copies; after reload the wallet is ${w2.total}` });
    } finally { closeAll(); }
  },900000);

  // main's card shop's Cosmetic Boxes tab (web-shell/htmlui/shop/boxes.js over /api/de/cosmetics): starter MP can't
  // open a box (the button, its note and the server agree); a PvP win pays earned MP; the Head & Hair box takes its
  // price from earned MP only, once for a double click, and its reward is owned after a reload. (CUT from the retired
  // rewrite test: the Wardrobe department and My Profile's Appearance editor; main's card shop has neither.)
  it('earns MP in a PvP duel, opens a cosmetic box with earned MP only, once, and keeps the reward',async () => {
    try {
      const names = { a:`Csa ${RUN}`, b:`Csb ${RUN}` };
      const a = await openPage(1280,900), b = await openPage(1280,900);
      await openClient(a,await signIn(`TestCa${RUN}`)); await openClient(b,await signIn(`TestCb${RUN}`));
      await enterWorld(a,names.a); await enterWorld(b,names.b);
      const cosmetics = (p:Page) => p.ev(`fetch('/api/de/cosmetics',{credentials:'include',cache:'no-store'}).then(r=>r.json())`) as Promise<{ wallet:{ total:number; bound:number; earned:number }; nextRequestId:string; inventory?:{ id:string; owned:boolean }[] }>;
      const BOX = `${SHOP}.querySelector('[data-k=open]')`, note = `${SHOP}.querySelector('#bx-note')?.textContent ?? ''`;
      const headBox = async (p:Page) => {
        await openShop(p); await press(p,`${SHOP}.querySelector('[data-k=tab-boxes]')`);
        await until(p,`${SHOP}.querySelector('[data-k=box-head]')`,30000); await press(p,`${SHOP}.querySelector('[data-k=box-head]')`);
        await until(p,BOX,30000);
      };

      // cosmetics.wallet: starter MP cannot open a box.
      const w0 = (await cosmetics(a)).wallet;
      expect(w0.earned).toBeLessThan(500); expect(w0.bound).toBeGreaterThanOrEqual(500);   // a new character: starter MP (and a few earned MP) only
      await headBox(a);
      const startDisabled = await a.ev(`${BOX}.disabled`), startNote = await a.ev(note) as string;
      expect(startDisabled).toBe(true);
      expect(startNote).toMatch(/starter MP/i);
      // The server agrees: a hand-made open request is refused with no charge.
      const refused = await a.ev(`(async()=>{const s=await (await fetch('/api/de/cosmetics',{credentials:'include'})).json();const r=await fetch('/api/de/cosmetics/open',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({boxId:'head',requestId:s.nextRequestId})});return {status:r.status,body:await r.json().catch(()=>({}))};})()`) as { status:number; body:{ error?:string } };
      expect(refused.status).toBeGreaterThanOrEqual(400); expect(refused.body.error).toBe('insufficient-earned-mp');
      expect((await cosmetics(a)).wallet).toEqual(w0);
      await screenshot(a,'cosmetics-boxes-starter');
      // the box's page: its Back to the shop's home, then Leave the shop
      const homeBack = byText('Back',SHOP);
      await press(a,homeBack); await until(a,`${SHOP}.querySelector('[aria-label="Leave the shop"]')`,10000);
      await leaveShop(a);

      // Earn MP: a PvP duel past turn 10 and two minutes (the server pays nothing for a shorter one), B surrenders.
      await playerMenu(b,names.a,'Send Duel Request');
      await until(a,invitation,30000); await press(a,byKey('duel-accept'));
      await startBoth(a,b);
      const turn = async () => Number(/Turn (\d+)/.exec(await a.ev(`document.querySelector('.de-phase-bar')?.getAttribute('aria-label')`) as string ?? '')?.[1] ?? 0);
      const duelStart = Date.now();
      // past the server's PvP minimum (persist.ts PVP_MIN_TURNS 3 or PVP_MIN_S 120: shorter pays nobody), then B surrenders
      for (; Date.now() - duelStart < 135000 && !(await a.ev(`Boolean(${finished})`));) { await Promise.all([duelBot(a,{ summon:false,attack:false }),duelBot(b,{ summon:false,attack:false })]); await sleep(1500); }
      expect(await a.ev(`Boolean(${finished})`)).toBe(false);   // still playing: B's surrender decides it
      expect(await turn()).toBeGreaterThanOrEqual(3);
      const duelSeconds = Math.round((Date.now() - duelStart) / 1000), duelTurns = await turn();
      await surrender(b);
      for (const p of [a,b]) { await until(p,finished,60000); await click(p,'Return to Lobby'); await until(p,lobbyShown,60000); }
      b.close();

      // cosmetics.purchase: the Head & Hair box takes its price in earned MP and leaves starter MP alone, once.
      const w1Items = new Set(((await cosmetics(a)).inventory ?? []).filter(i => i.owned).map(i => i.id));
      let w1 = (await cosmetics(a)).wallet;
      for (let i = 0; i < 30 && w1.earned === w0.earned; i++) { await sleep(1000); w1 = (await cosmetics(a)).wallet; }
      expect(w1.earned).toBeGreaterThanOrEqual(500);
      await headBox(a);
      await until(a,`!${BOX}.disabled`,30000);
      await a.ev(`(()=>{const b=${BOX};b.click();b.click();})()`);
      const rv = `${SHOP}.querySelector('.rv')`;
      await until(a,rv,30000);
      for (let i = 0; i < 80 && await a.ev(`${rv}?.dataset.phase!=='done'`); i++) { await a.ev(`${rv}?.click()`); await sleep(250); }
      const reward = await a.ev(`${rv}.getAttribute('aria-label')`) as string;
      await screenshot(a,'cosmetics-reward');
      await sleep(1000);
      const after = await cosmetics(a);
      expect(after.wallet.earned).toBe(w1.earned - 500); expect(after.wallet.bound).toBe(w1.bound);
      const ownedCount = (after.inventory ?? []).filter(i => i.owned).length;
      await press(a,`${rv}.querySelector('[data-k=done]')`); await until(a,`!${rv}`,10000);
      expect(await a.ev(`Boolean(${rv})`)).toBe(false);
      await press(a,homeBack); await until(a,`${SHOP}.querySelector('[aria-label="Leave the shop"]')`,10000);
      await leaveShop(a);
      // A reload: the wallet and the reward stay.
      await a.go(`${CLIENT}/?portOffset=1000&assets=/game-assets/`,`document.querySelector('.de-client')`);
      await reenterWorld(a,names.a);
      const reloaded = await cosmetics(a);
      expect(reloaded.wallet).toEqual(after.wallet);
      expect((reloaded.inventory ?? []).filter(i => i.owned).length).toBe(ownedCount);

      // cosmetics.catalog / the equip: main's Wardrobe (cosmetics/wardrobe.js) from its menu bar launcher (the hanger
      // after the bar's keys): the reward previews on the bust, Equip wears it, the server records it and the player's
      // own character redraws in the new look (live 2034ec6), not only the one the others see
      type Look = { appearance:{ world:number; parts:number[]; looks?:Record<string,number[]> }; inventory?:{ id:string; owned:boolean; free?:boolean; name?:string }[] };
      const lookNow = async (p:Page) => { const c = await cosmetics(p) as unknown as Look; const w = c.appearance.world === 0 ? 0 : 1; return c.appearance.looks?.[String(w)] ?? c.appearance.parts; };
      const selfDrawn = `(()=>{const s=window.__deApp.getState().lobby?.avatars.find(x=>x.self);const c=s&&document.querySelector('[data-key="avatar:'+s.id+'"] canvas');return c&&c.dataset.avatarPainted==='true'?(c.dataset.avatarDrawn??'').split('/').pop():'';})()`;
      const gained = ((reloaded as unknown as Look).inventory ?? []).find(i => i.owned && !i.free && !w1Items.has(i.id)) ?? ((reloaded as unknown as Look).inventory ?? []).find(i => i.owned && !i.free)!;
      expect(gained).toBeTruthy();
      const launcher = `document.querySelector('.de-wdl > button[aria-label="Wardrobe"]')`, WD = `document.querySelector('.de-wd[role=dialog]')`;
      await until(a,launcher,30000); await press(a,launcher); await until(a,`${WD}?.querySelector('.wd-tile[data-id]')`,30000);
      const tabCounts = await a.ev(`[...${WD}.querySelectorAll('.wd-tab')].map(t=>t.textContent.trim()).join(', ')`) as string;
      const tile = `${WD}.querySelector('.wd-tile[data-id=${JSON.stringify(gained.id)}]')`;
      // the reward's tab and category: each in turn until its tile shows
      for (const tab of await a.ev(`[...${WD}.querySelectorAll('.wd-tab')].map(t=>t.dataset.tab)`) as string[]) {
        if (await a.ev(`Boolean(${tile})`)) break;
        await press(a,`${WD}.querySelector('.wd-tab[data-tab=${JSON.stringify(tab)}]')`); await sleep(300);
        for (const sub of await a.ev(`[...${WD}.querySelectorAll('.wd-sub')].map(t=>t.dataset.sub)`) as string[]) {
          if (await a.ev(`Boolean(${tile})`)) break;
          await press(a,`${WD}.querySelector('.wd-sub[data-sub=${JSON.stringify(sub)}]')`); await sleep(300);
        }
      }
      await until(a,tile,10000);
      const look0 = await lookNow(a), drawn0 = await a.ev(selfDrawn) as string;
      await press(a,tile);
      await until(a,`${WD}.querySelector('.wd-wu')?.getAttribute('aria-label')?.startsWith('Your look wearing')`,10000);
      const preview = await a.ev(`${WD}.querySelector('.wd-wu').getAttribute('aria-label')`) as string;
      expect(await lookNow(a)).toEqual(look0);   // a preview is not saved
      await screenshot(a,'cosmetics-wardrobe-preview');
      await until(a,`!${WD}.querySelector('.wd-equip').disabled`,10000);
      await press(a,`${WD}.querySelector('.wd-equip')`);
      await until(a,`${tile}?.hasAttribute('data-equipped')`,30000);
      const equipNote = await a.ev(`${WD}.innerText.match(/Equipped\. [^\n]*/)?.[0] ?? ''`) as string;
      const look1 = await lookNow(a);
      expect(look1).not.toEqual(look0);
      await press(a,`${WD}.querySelector('.wd-close')`); await until(a,`!${WD}`,10000);
      // the player's own character, drawn: its parts are the server's new look
      await until(a,`${selfDrawn}===${JSON.stringify(look1.join(','))}`,30000);
      await screenshot(a,'cosmetics-wardrobe-equipped');
      record('cosmetics.catalog',{ actions:`Menu bar → Wardrobe (main's cosmetics/wardrobe.js): its tabs; select the box reward "${gained.name ?? gained.id}" (preview); Equip; close`, expected:'Browse categories and preview supported owned/unowned appearances',
        observed:`tabs ${tabCounts}; "${preview}" on the bust while the server look stayed ${look0.join(',')}; Equip → "${equipNote}", the server look ${look1.join(',')}; the player's own avatar redrawn from ${drawn0 || '(none)'} to ${look1.join(',')}` });

      // avatars.edit: Change Avatar from My Profile (main's screens/avatar.js): a Mouth choice is a draft until Confirm,
      // then saved, drawn on the player's own character, and kept after a reload
      await click(a,'My Profile'); await until(a,byKey('profile-appearance'),30000); await press(a,byKey('profile-appearance'));
      await until(a,byKey('avatar-confirm'),30000);
      await press(a,byKey('avatar-category:5')); await sleep(300);
      const mouth = await a.ev(`[...document.querySelectorAll('[data-key^="avatar-item:5:"]')].map(b=>({ v:Number(b.dataset.key.split(':')[2]), label:b.getAttribute('aria-label')??b.textContent }))`) as { v:number; label:string }[];
      const pick = mouth.find(m => m.v !== look1[5])!;
      expect(pick).toBeTruthy();
      await press(a,byKey(`avatar-item:5:${pick.v}`)); await sleep(500);
      expect(await lookNow(a)).toEqual(look1);   // the draft is not saved yet
      await screenshot(a,'appearance-draft');
      await press(a,byKey('avatar-confirm')); await until(a,`!${byKey('avatar-confirm')}`,10000);
      let look2 = await lookNow(a);
      for (let i = 0; i < 30 && look2[5] !== pick.v; i++) { await sleep(500); look2 = await lookNow(a); }
      expect(look2[5]).toBe(pick.v);
      await until(a,`${selfDrawn}===${JSON.stringify(look2.join(','))}`,30000);
      await a.go(`${CLIENT}/?portOffset=1000&assets=/game-assets/`,`document.querySelector('.de-client')`);
      await reenterWorld(a,names.a);
      const look3 = await lookNow(a);
      expect(look3).toEqual(look2);
      await until(a,`${selfDrawn}===${JSON.stringify(look3.join(','))}`,30000);
      await screenshot(a,'appearance-saved');
      record('avatars.edit',{ actions:`My Profile → Change Avatar: Mouth ${look1[5]}→${pick.v} ("${pick.label}"), Confirm; reload`, expected:'Preview, apply and reload permitted appearance parts',
        observed:`the draft left the server look unchanged until Confirm; then the server look's mouth is ${look2[5]} and the player's own avatar is drawn as ${look2.join(',')}; after a reload the look is ${look3.join(',')} and drawn so` });
      record('cosmetics.purchase',{ actions:'Win a PvP duel (the opponent surrenders past the server\'s two-minute minimum); Shop → Cosmetic Boxes → Head & Hair: Open Box (clicked twice); reveal to Done; reload', expected:'Spend correct wallet funds, grant once and persist',
        observed:`PvP win (B surrendered) after ${duelTurns} turns/${duelSeconds} s; earned ${w1.earned}→${after.wallet.earned}, starter ${w1.bound}→${after.wallet.bound} after one opening despite a double click; reward "${reward}"; after reload the wallet and ${ownedCount} owned items are unchanged` });
      record('cosmetics.wallet',{ actions:'Starter-only wallet: the Head & Hair Open Box button and a direct open request; after a PvP win: open with earned MP', expected:'Balances, eligibility and purchase restrictions match authoritative wallet semantics',
        observed:`new character ${w0.earned} earned/${w0.bound} starter: Open Box disabled with "${startNote}", server refused ${refused.status} ${refused.body.error}; after the win ${w1.earned} earned → the box cost 500 earned only` });
    } finally { closeAll(); }
  },1500000);
});
