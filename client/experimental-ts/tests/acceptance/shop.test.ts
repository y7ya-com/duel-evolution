import { describe, expect, it } from 'vitest';
import { RUN, CLIENT, enabled, openPage, closeAll, signIn, openClient, enterWorld, reenterWorld, click, until, press, pressAvatar, sleep, screenshot, record, byKey, byText, duelBot, type Page, cardButton, lobbyShown, openDeckEditor, exitDeckEditor, SHOP, openShop, leaveShop, shopWallet as wallet, shopPacks as packs, shopBuyKey as buyKey, shopReveal as reveal, takeReveal } from './harness';

/** main's card shop (htmlui/card-shop.ts mounting web-shell/htmlui/shop/index.js: GET /api/de/shop, POST
 * /api/de/shop/buy, its reveal) online, against the real server (harness: openShop, shopWallet, shopPacks, takeReveal). */
/** The retired rewrite shop's steps the cut cosmetics test (it.skip below) still names; ported with it. */
const retired = (step:string) => async (..._args:unknown[]):Promise<void> => { throw new Error(`retired shop step: ${step}`); };
const shop = retired('shop'), department = retired('department'), reload = retired('reload');
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
      expect(tabs).toEqual(expect.arrayContaining(['Recommended','Card Packs','Structure Decks','Cosmetic Boxes']));
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

  // CUT: drives the rewrite's retired shop markup (.de-cosmetics, cosmetic-box:*); main's card shop has its own
  // Cosmetic Boxes tab (shop/boxes.js) that this test is still to be ported to
  it.skip('earns MP in a PvP duel, buys a cosmetic box with earned MP only, previews and equips owned items, edits the appearance',async () => {
    try {
      const names = { a:`Csa ${RUN}`, b:`Csb ${RUN}` };
      const a = await openPage(1280,900), b = await openPage(1280,900);
      await openClient(a,await signIn(`TestCa${RUN}`)); await openClient(b,await signIn(`TestCb${RUN}`));
      await enterWorld(a,names.a); await enterWorld(b,names.b);

      // cosmetics.wallet: starter MP cannot open a box.
      await shop(a); await department(a,'cosmetic-boxes');
      await until(a,`document.querySelector('[data-key="cosmetic-wallet"]')`,30000);
      const startWallet = await a.ev(`document.querySelector('[data-key="cosmetic-wallet"]').textContent`) as string;
      const reason = await a.ev(`document.querySelector('[data-key="cosmetic-reason:hair"]')?.textContent ?? ''`) as string;
      expect(startWallet).toMatch(/^0 earned MP · 5,000 starter MP/);
      expect(reason).toBe('Needs 500 more earned MP. Starter MP cannot buy boxes.');
      expect(await a.ev(`[...document.querySelector('[data-key="cosmetic-box:hair"]').querySelectorAll('button')].find(b=>b.textContent==='Open box').disabled`)).toBe(true);
      // The server agrees: a hand-made open request is refused with no charge.
      const refused = await a.ev(`(async()=>{const s=await (await fetch('/api/de/cosmetics',{credentials:'include'})).json();const r=await fetch('/api/de/cosmetics/open',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({boxId:'head',requestId:s.nextRequestId})});return {status:r.status,body:await r.json()};})()`) as { status:number; body:{ error:string } };
      expect(refused.status).toBeGreaterThanOrEqual(400); expect(refused.body.error).toBe('insufficient-earned-mp');
      await screenshot(a,'cosmetics-boxes-starter');

      // cosmetics.catalog: the wardrobe lists owned and unowned items; an unowned one previews on the avatar but cannot be equipped.
      await department(a,'wardrobe');
      const catalog = await a.ev(`[...document.querySelectorAll('[data-key^="cosmetic:"]')].map(t=>({ id:t.dataset.key.slice(9), owned:t.dataset.owned==='true', name:t.querySelector('strong').textContent, equip:[...t.querySelectorAll('button')].pop().disabled, why:[...t.querySelectorAll('button')].pop().title }))`) as { id:string; owned:boolean; name:string; equip:boolean; why:string }[];
      expect(catalog.length).toBeGreaterThan(10);
      const unowned = catalog.find(c => !c.owned)!;
      expect(unowned.equip).toBe(true); expect(unowned.why).toBe('You do not own this item.');
      await press(a,`[...document.querySelector('[data-key="cosmetic:${unowned.id}"]').querySelectorAll('button')].find(b=>b.textContent==='Preview')`);
      await until(a,`document.querySelector('[data-key="cosmetic-preview"] h4')?.textContent===${JSON.stringify(`Preview: ${unowned.name}`)}`,5000);
      const previewNote = await a.ev(`document.querySelector('[data-key="cosmetic-preview"]').innerText`) as string;
      await until(a,`document.querySelector('[data-key="cosmetic-preview"] canvas')?.dataset.avatarPainted==='true'||/Not wearable/.test(document.querySelector('[data-key="cosmetic-preview"]').innerText)`,20000).catch(() => {});
      const painted = await a.ev(`document.querySelector('[data-key="cosmetic-preview"] canvas')?.dataset.avatarPainted ?? 'none'`);
      await screenshot(a,'cosmetics-wardrobe-preview');
      await department(a,'cosmetic-boxes');
      const pools = await a.ev(`[...document.querySelectorAll('[data-key^="cosmetic-box:"]')].map(b=>b.querySelector('h3').textContent+' '+b.querySelector('.de-cosmetic-price').textContent+' '+b.querySelector('summary').textContent)`) as string[];
      record('cosmetics.catalog',{ actions:`Shop → Wardrobe: list; Preview "${unowned.name}" (not owned); Shop → Cosmetic Boxes: rewards lists`, expected:'Browse categories and preview supported owned/unowned appearances',
        observed:`${catalog.length} cosmetics, ${catalog.filter(c => c.owned).length} owned; "${unowned.name}" previewed on the player's avatar (painted: ${painted}) with "${previewNote.split('\n').slice(1,3).join(' / ')}", its Equip disabled: "${unowned.why}"; boxes ${pools.join('; ')}` });

      // Earn MP: a PvP duel past turn 10 and two minutes (the server pays nothing for a shorter one), B surrenders;
      // A wins 250 + 300 first-win earned MP.
      await click(a,'Return to Lobby'); await click(b,'Return to Lobby');
      const alpha = `[...document.querySelectorAll('[data-key^="avatar:"]')].find(x=>x.textContent.includes(${JSON.stringify(names.a)}))`;
      await until(b,alpha,60000); await pressAvatar(b,alpha);
      await until(b,cardButton('Send Duel Request'),10000); await press(b,cardButton('Send Duel Request')); await click(a,'Accept Duel',60000);
      // Rock-paper-scissors until one side wins (A plays Rock, B cycles), then the winner goes first and both start.
      for (const p of [a,b]) await until(p,`[...document.querySelectorAll('button')].some(x=>['Rock','Go First','Go Second','Start Duel'].includes(x.textContent.trim())&&!x.disabled)`,60000);
      for (let round = 0; round < 12; round++) {
        if (await a.ev(`Boolean(${byText('Rock')})`)) await press(a,byText('Rock'));
        const hand = ['Scissors','Rock','Paper'][round % 3]!;
        if (await b.ev(`Boolean(${byText(hand)})`)) await press(b,byText(hand));
        await sleep(600);
        const decided = await Promise.all([a,b].map(x => x.ev(`[...document.querySelectorAll('button')].some(b=>['Go First','Start Duel'].includes(b.textContent.trim())&&!b.disabled)||!document.body.innerText.includes('Choose your hand')`)));
        if (decided.some(Boolean)) break;
      }
      const dealt = `document.querySelectorAll('.de-field-card').length>0&&!document.querySelector('.de-duel-prompt')`;
      for (let tries = 0; tries < 80 && !(await a.ev(`Boolean(${dealt})`) && await b.ev(`Boolean(${dealt})`)); tries++) {
        for (const p of [a,b]) for (const label of ['Go First','Start Duel']) if (await p.ev(`Boolean(${byText(label)})`)) await press(p,byText(label)).catch(() => {});
        await sleep(400);
      }
      const turn = async () => Number(/Turn (\d+)/.exec(await a.ev(`document.querySelector('.de-phase-bar')?.getAttribute('aria-label')`) as string ?? '')?.[1] ?? 0);
      const duelStart = Date.now();
      for (; Date.now() - duelStart < 400000 && (await turn() < 10 || Date.now() - duelStart < 125000);) { await Promise.all([duelBot(a,{ summon:false,attack:false }),duelBot(b,{ summon:false,attack:false })]); await sleep(1500); }
      expect(await turn()).toBeGreaterThanOrEqual(10);
      const duelSeconds = Math.round((Date.now() - duelStart) / 1000), duelTurns = await turn();
      await screenshot(a,'cosmetics-pvp');
      await click(b,'Surrender');
      const yes = `[...document.querySelectorAll('button')].find(x=>x.dataset.key?.startsWith('prompt-option:')&&x.textContent==='Yes'&&!x.disabled)`;
      await until(b,`${yes}||[...document.querySelectorAll('button')].some(x=>x.textContent==='Return to Lobby')`,60000);
      if (await b.ev(`Boolean(${yes})`)) await press(b,yes);
      for (const p of [a,b]) { await until(p,`[...document.querySelectorAll('button')].some(x=>x.textContent==='Return to Lobby')`,60000); await click(p,'Return to Lobby'); }
      b.close();

      // cosmetics.purchase: the Hair Box takes 500 earned MP and leaves starter MP alone; the reward is equipped and persists.
      await shop(a); await department(a,'cosmetic-boxes');
      await until(a,`/^[1-9][\\d,]* earned MP/.test(document.querySelector('[data-key="cosmetic-wallet"]')?.textContent ?? '')`,30000);
      const walletText = await a.ev(`document.querySelector('[data-key="cosmetic-wallet"]').textContent`) as string;
      const earned0 = Number(/^([\d,]+) earned/.exec(walletText)![1]!.replaceAll(',','')), bound0 = Number(/([\d,]+) starter/.exec(walletText)![1]!.replaceAll(',',''));
      expect(earned0).toBeGreaterThanOrEqual(500);
      const open = `[...document.querySelector('[data-key="cosmetic-box:hair"]').querySelectorAll('button')].find(b=>b.textContent==='Open box')`;
      await a.ev(`(()=>{const b=${open};b.click();b.click();})()`);
      await until(a,`document.querySelector('[data-key="cosmetic-reward"]')`,30000); await sleep(800);
      const reward = await a.ev(`document.querySelector('[data-key="cosmetic-reward"]').innerText`) as string;
      const after = await a.ev(`document.querySelector('[data-key="cosmetic-wallet"]').textContent`) as string;
      const earned1 = Number(/^([\d,]+) earned/.exec(after)![1]!.replaceAll(',','')), bound1 = Number(/([\d,]+) starter/.exec(after)![1]!.replaceAll(',',''));
      expect(earned1).toBe(earned0 - 500); expect(bound1).toBe(bound0);
      await screenshot(a,'cosmetics-reward');
      const rewardName = reward.split('\n')[1]!.trim();
      await department(a,'wardrobe');
      const owned = `document.querySelector('[data-key^="cosmetic:"][data-owned="true"]')`;
      await until(a,owned,10000);
      const ownedItem = await a.ev(`(()=>{const t=[...document.querySelectorAll('[data-key^="cosmetic:"][data-owned="true"]')].find(t=>t.querySelector('strong').textContent===${JSON.stringify(rewardName)})??${owned};return {id:t.dataset.key.slice(9),name:t.querySelector('strong').textContent,equipped:t.dataset.equipped,why:[...t.querySelectorAll('button')].pop().title}})()`) as { id:string; name:string; equipped:string; why:string };
      let equippedNote = 'already equipped';
      if (ownedItem.equipped !== 'true' && !ownedItem.why) {
        await press(a,`[...document.querySelector('[data-key="cosmetic:${ownedItem.id}"]').querySelectorAll('button')].pop()`);
        await until(a,`document.querySelector('[data-key="cosmetic:${ownedItem.id}"]')?.dataset.equipped==='true'`,30000); equippedNote = 'equipped';
      }
      const name = names.a;
      await reload(a,name); await shop(a); await department(a,'wardrobe');
      await until(a,`document.querySelector('[data-key="cosmetic:${ownedItem.id}"]')`,30000);
      const persisted = await a.ev(`(()=>{const d=document.querySelector('[data-key="cosmetic:${ownedItem.id}"]').dataset;return {owned:d.owned,equipped:d.equipped}})()`) as { owned:string; equipped:string };
      expect(persisted.owned).toBe('true');
      if (!ownedItem.why) expect(persisted.equipped).toBe('true');
      const walletReload = await a.ev(`document.querySelector('[data-key="cosmetic-wallet"]').textContent`) as string;
      expect(walletReload.startsWith(`${earned1.toLocaleString('en-US')} earned MP`)).toBe(true);
      record('cosmetics.purchase',{ actions:'Win a PvP duel (opponent surrenders at turn 10); Shop → Cosmetic Boxes → Hair Box: Open box (clicked twice); Wardrobe: Equip the reward; reload', expected:'Spend correct wallet funds, grant once, equip only owned items and persist selection',
        observed:`PvP win after ${duelTurns} turns/${duelSeconds} s; earned ${earned0}→${earned1} and starter ${bound0}→${bound1} after one opening despite a double click; reward "${reward.replace(/\n+/g,' / ')}"; "${ownedItem.name}" ${equippedNote}${ownedItem.why ? ` (equip refused: ${ownedItem.why})` : ''}; after reload owned=${persisted.owned} equipped=${persisted.equipped}, wallet "${walletReload}"` });
      record('cosmetics.wallet',{ actions:'Starter-only wallet: Hair Box button and a direct open request; after a PvP win: open with earned MP', expected:'Balances, eligibility and purchase restrictions match authoritative wallet semantics',
        observed:`new character "${startWallet}": button disabled with "${reason}", server refused ${refused.status} ${refused.body.error}; after the win ${earned0} earned/${bound0} starter → box cost 500 earned only (${earned1}/${bound1})` });

      // avatars.edit: My Profile's Appearance (main's Main Menu has none) previews a draft, applies it and keeps it after a reload.
      await click(a,'Return to Lobby');
      await click(a,'My Profile'); await until(a,byKey('profile-appearance'),30000); await press(a,byKey('profile-appearance')); await until(a,`document.querySelector('[data-key="appearance"] [data-key^="appearance-part:"]')`,30000);
      const choice = await a.ev(`(()=>{for(const s of document.querySelectorAll('[data-key="appearance"] select[data-key^="appearance-part:"]')){const o=[...s.options].find(o=>o.value!==s.value);if(o)return {key:s.dataset.key,label:s.getAttribute('aria-label'),from:s.value,to:o.value,text:o.textContent};}return null})()`) as { key:string; label:string; from:string; to:string; text:string };
      expect(choice).toBeTruthy();
      await a.ev(`(()=>{const s=document.querySelector('[data-key="${choice.key}"]');s.value=${JSON.stringify(choice.to)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await sleep(500);
      expect(await a.ev(`document.querySelector('[data-key="${choice.key}"]').value`)).toBe(choice.to);
      const previewPainted = await until(a,`document.querySelector('[data-key="appearance"] canvas')?.dataset.avatarPainted==='true'`,30000).then(() => true,() => false);
      await screenshot(a,'appearance-draft');
      await click(a,'Save appearance');
      await until(a,`/Appearance saved on the server/.test(document.querySelector('[data-key="appearance"]')?.innerText ?? '')`,30000);
      await reload(a,name);
      await click(a,'My Profile'); await until(a,byKey('profile-appearance'),30000); await press(a,byKey('profile-appearance')); await until(a,`document.querySelector('[data-key="${choice.key}"]')`,30000); await sleep(500);
      const kept = await a.ev(`document.querySelector('[data-key="${choice.key}"]').value`);
      expect(kept).toBe(choice.to);
      const others = await a.ev(`[...document.querySelectorAll('[data-key^="avatar:"]')].length`);
      await screenshot(a,'appearance-saved');
      record('avatars.edit',{ actions:`My Profile → Appearance: change ${choice.label} ${choice.from}→${choice.to} ("${choice.text}"), preview, Save appearance; reload; reopen`, expected:'Preview, apply and reload permitted appearance parts',
        observed:`only owned parts offered; the draft previewed on the avatar (painted: ${previewPainted}); server confirmed "Appearance saved on the server"; after reload ${choice.label} is ${kept}; lobby shows ${others} avatars` });
    } finally { closeAll(); }
  },1500000);
});
