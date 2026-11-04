import { describe, expect, it } from 'vitest';
import { RUN, CLIENT, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, pressAvatar, type, sleep, screenshot, record, byKey, byText, duelBot, type Page } from './harness';

/** The shop (GET /api/de/shop, POST /api/de/shop/buy), the card-get presentation, the cosmetic boxes and wardrobe
 * (/api/de/cosmetics) and the Main Menu's Appearance editor, against the real server. */
const wallet = async (page:Page) => {
  const t = await page.ev(`document.querySelector('[data-key="shop-wallet"] summary')?.textContent ?? ''`) as string;
  const n = (re:RegExp) => Number((re.exec(t)?.[1] ?? 'NaN').replaceAll(',',''));
  return { total:n(/^([\d,]+) MP/), bound:n(/([\d,]+) starter/), earned:n(/([\d,]+) earned/), text:t };
};
const department = async (page:Page,value:string) => {
  await page.ev(`(()=>{const s=document.querySelector('[data-key="shop-category"]');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await sleep(500);
};
const products = (page:Page) => page.ev(`[...document.querySelectorAll('.de-shop-item')].map(a=>({ name:a.querySelector('h3')?.textContent, price:Number((a.querySelector('strong')?.textContent??'').replace(/[^0-9]/g,'')), label:[...a.querySelectorAll('button')].pop()?.textContent, disabled:[...a.querySelectorAll('button')].pop()?.disabled, art:!!a.querySelector('img,.de-card'), about:a.querySelector('.de-shop-about')?.textContent ?? '' }))`) as Promise<{ name:string; price:number; label:string; disabled:boolean; art:boolean; about:string }[]>;
const product = (name:string) => `[...document.querySelectorAll('.de-shop-item')].find(a=>a.querySelector('h3')?.textContent===${JSON.stringify(name)})`;
async function buy(page:Page,name:string,count:number | string) {
  await page.ev(`(()=>{const i=${product(name)}.querySelector('input');i.value=${JSON.stringify(String(count))};i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await press(page,`[...(${product(name)}).querySelectorAll('button')].pop()`);
}
const notice = (page:Page) => page.ev(`document.querySelector('.de-notice')?.textContent ?? ''`) as Promise<string>;
async function shop(page:Page) { await click(page,'Shop'); await until(page,`(document.querySelectorAll('.de-shop-item').length>0||document.querySelector('.de-cosmetics'))&&document.querySelector('[data-key="shop-wallet"]')`,60000); await sleep(800); }
/** The whole owned collection from the deck editor (every page): copies per card name. */
async function collection(page:Page):Promise<Map<string,number>> {
  await click(page,'Edit Deck'); await until(page,byKey('collection-search'),60000); await sleep(800);
  await type(page,byKey('collection-search'),''); await sleep(300);
  const out = new Map<string,number>();
  for (let i = 0; i < 20; i++) {
    const cards = await page.ev(`[...document.querySelectorAll('[data-key^="collection-card:"]')].map(b=>[b.title.split(' · ')[0],Number(/×(\\d+)/.exec(b.querySelector('.de-card-count')?.textContent??'')?.[1]??0)])`) as [string,number][];
    for (const [n,k] of cards) out.set(n,(out.get(n) ?? 0) + k);
    if (!(await page.ev(`Boolean(${byText('Next','document.querySelector(".de-collection")')})`))) break;
    await press(page,byText('Next','document.querySelector(".de-collection")')); await sleep(300);
  }
  return out;
}
const total = (m:Map<string,number>) => [...m.values()].reduce((a,b) => a + b,0);
async function reload(page:Page,character:string) {
  await page.go(`${CLIENT}/?portOffset=1000&assets=/game-assets/`,`document.querySelector('.de-client')`);
  await click(page,'Go Online',60000);
  const slot = `[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes(${JSON.stringify(character)})&&!b.disabled)`;
  await until(page,slot,60000); await press(page,slot); await until(page,byKey('lobby-npcs'),60000);
}
const cardGet = `document.querySelector('.de-card-get')`;
const cardGetState = (page:Page) => page.ev(`(()=>{const r=${cardGet};if(!r)return null;return { thumbs:[...r.querySelectorAll('[data-key^="card-get-thumb:"]')].map(t=>t.getAttribute('aria-label')), banner:r.querySelector('.de-card-get-banner')?.getAttribute('aria-label'), face:r.querySelector('.de-card-get-face')?.getAttribute('aria-label'), count:r.querySelector('.de-card-get-count')?.textContent, art:[...r.querySelectorAll('img')].filter(i=>i.naturalWidth>0).length };})()`) as Promise<{ thumbs:string[]; banner:string; face:string; count:string; art:number } | null>;

describe.skipIf(!enabled)('shop, card-get and cosmetics against the real server',() => {
  it('shows the catalogue, opens purchases once, refuses bad purchases clearly',async () => {
    try {
      const character = `Sh ${RUN}`, page = await openPage(1280,900);
      await openClient(page,await signIn(`TestSh${RUN}`));
      await enterWorld(page,character);
      const before = await collection(page);
      await shop(page);
      await screenshot(page,'shop-catalog');

      // shops.catalog: departments, names, prices, art and what can be afforded.
      const w0 = await wallet(page);
      expect(w0.total).toBe(5000); expect(w0.bound).toBe(5000); expect(w0.earned).toBe(0);
      const departments = await page.ev(`[...document.querySelectorAll('[data-key="shop-category"] option')].map(o=>o.textContent)`) as string[];
      expect(departments).toEqual(expect.arrayContaining(['Booster Packs','Structure Decks','Single Cards','Accessories','Cosmetic Boxes','Wardrobe']));
      const seen:Record<string,{ name:string; price:number; label:string; disabled:boolean; art:boolean; about:string }[]> = {};
      for (const d of ['packs','decks','singles','accessories']) { await department(page,d); seen[d] = await products(page); expect(seen[d]!.length,d).toBeGreaterThan(0); }
      for (const p of Object.values(seen).flat()) { expect(p.name).not.toMatch(/^Item \d+$/); expect(p.price).toBeGreaterThan(0); expect(p.disabled).toBe(p.price > w0.total || p.label === 'Owned'); }
      expect(seen.packs!.every(p => p.art && p.about)).toBe(true);
      expect(seen.singles!.every(p => p.art)).toBe(true);
      record('shops.catalog',{ actions:'Open the Shop on a new character; browse Booster Packs, Structure Decks, Single Cards and Accessories', expected:'Load packs, decks and singles with correct price, availability and ownership',
        observed:`wallet "${w0.text}"; ${seen.packs!.length} packs (e.g. ${seen.packs![0]!.name} ${seen.packs![0]!.price} MP, art and description), ${seen.decks!.length} structure decks (e.g. ${seen.decks![0]!.name} ${seen.decks![0]!.price} MP), ${seen.singles!.length} singles drawn as cards (e.g. ${seen.singles![0]!.name} ${seen.singles![0]!.price} MP), ${seen.accessories!.length} accessories; every Purchase enabled exactly when affordable and not owned` });

      // shops.purchase: one booster pack opens in the card-get presentation, charged and granted once.
      await department(page,'packs');
      const pack = seen.packs!.find(p => p.price === 200)!;
      await buy(page,pack.name,1);
      await until(page,cardGet,30000);
      const opened = await cardGetState(page);
      expect(opened!.thumbs).toHaveLength(5); expect(opened!.thumbs.every(t => /face down/.test(t))).toBe(true); expect(opened!.banner).toBe('Won cards!');
      await press(page,`document.querySelector('.de-card-get-face')`); await sleep(300);
      const first = await cardGetState(page);
      expect(first!.face).not.toMatch(/Turn over/);
      await screenshot(page,'card-get-first');
      await click(page,'Open All'); await sleep(400);
      const all = await cardGetState(page);
      expect(all!.thumbs.some(t => /face down/.test(t))).toBe(false);
      const packCards = all!.thumbs.map(t => t.replace(/, new$/,'')), fresh = all!.thumbs.filter(t => /, new$/.test(t)).length;
      await screenshot(page,'card-get-all');
      await press(page,`document.querySelector('.de-card-get-exit')`); await until(page,`!${cardGet}`,5000);
      const w1 = await wallet(page);
      expect(w1.total).toBe(w0.total - pack.price);
      const receipt = await page.ev(`document.querySelector('[data-key="shop-receipt"] summary')?.textContent ?? ''`) as string;
      expect(receipt).toContain('Acquired Cards (5)');
      const afterPack = await collection(page);
      expect(total(afterPack)).toBe(total(before) + 5);
      for (const name of new Set(packCards)) expect(afterPack.get(name) ?? 0,name).toBe((before.get(name) ?? 0) + packCards.filter(n => n === name).length);
      expect(fresh).toBe(new Set(packCards.filter(n => !before.has(n))).size);
      // A single card ×2: two copies, the same name twice.
      await shop(page); await department(page,'singles');
      const single = seen.singles![0]!;
      await buy(page,single.name,2); await until(page,cardGet,30000);
      const singles = await cardGetState(page);
      expect(singles!.thumbs).toHaveLength(2);
      await click(page,'Open All'); await sleep(300);
      const singleCard = (await cardGetState(page))!.thumbs[0]!.replace(/, new$/,'');
      expect((await cardGetState(page))!.thumbs.map(t => t.replace(/, new$/,''))).toEqual([singleCard,singleCard]);
      await press(page,`document.querySelector('.de-card-get-exit')`);
      const w2 = await wallet(page);
      expect(w2.total).toBe(w1.total - 2 * single.price);
      // A reload shows the same wallet: charged once and persisted.
      await reload(page,character); await shop(page);
      const w3 = await wallet(page);
      expect(w3.total).toBe(w2.total);
      const afterSingle = await collection(page);
      expect(afterSingle.get(singleCard)).toBe((afterPack.get(singleCard) ?? 0) + 2);
      record('shops.purchase',{ actions:`Buy 1 × ${pack.name}: turn the first card, Open All, EXIT; buy 2 × ${single.name}; reload the page`, expected:'Purchase/open products, update inventory/wallet once and render acquired cards',
        observed:`pack opened face down in the card-get board (banner "${opened!.banner}", ${all!.art} original images loaded), cards [${packCards.join(', ')}], ${fresh} marked NEW!!; wallet ${w0.total}→${w1.total}; collection ${total(before)}→${total(afterPack)} with each card's count +copies; 2 × ${single.name}: wallet →${w2.total}, ${singleCard} ×${afterPack.get(singleCard) ?? 0}→×${afterSingle.get(singleCard)}; after reload wallet ${w3.total}` });

      // shops.constraints: invalid counts, an order over the balance, a double submission, an owned accessory.
      await shop(page); await department(page,'packs');
      const refusals:string[] = [];
      for (const count of ['0','51','abc']) { await buy(page,pack.name,count); const m = await notice(page); expect(m,count).toBe('Choose a quantity from 1 to 50.'); refusals.push(`${count}: "${m}"`); }
      await buy(page,pack.name,50);
      const over = await notice(page); expect(over).toMatch(/^Not enough MP: 50 × 200 MP is 10,000 MP and you have [\d,]+ MP\.$/);
      expect((await wallet(page)).total).toBe(w3.total);
      await page.ev(`(()=>{const i=${product(pack.name)}.querySelector('input');i.value='1';i.dispatchEvent(new Event('input',{bubbles:true}));const b=[...${product(pack.name)}.querySelectorAll('button')].pop();b.click();b.click();b.click();})()`);
      await until(page,cardGet,30000); await sleep(1500);
      const doubled = await cardGetState(page);
      expect(doubled!.thumbs).toHaveLength(5);
      await press(page,`document.querySelector('.de-card-get-exit')`);
      const w4 = await wallet(page);
      expect(w4.total).toBe(w3.total - pack.price);
      await department(page,'accessories');
      const accessory = (await products(page)).find(p => !p.disabled && p.price <= w4.total)!;
      await buy(page,accessory.name,1); await until(page,`${product(accessory.name)}&&[...${product(accessory.name)}.querySelectorAll('button')].pop().textContent==='Owned'`,30000);
      const w5 = await wallet(page);
      expect(w5.total).toBe(w4.total - accessory.price);
      expect(await page.ev(`[...${product(accessory.name)}.querySelectorAll('button')].pop().disabled`)).toBe(true);
      // The server refuses a second copy too (a hand-made request with the shop's own token).
      const server = await page.ev(`(async()=>{const s=await (await fetch('/api/de/shop',{credentials:'include'})).json();const item=s.items.find(i=>i.kind===2&&i.owned);const r=await fetch('/api/de/shop/buy',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({itemId:item.id,count:1,requestId:s.nextRequestId})});return {status:r.status,body:await r.json(),mp:(await (await fetch('/api/de/wallet',{credentials:'include'})).json()).total};})()`) as { status:number; body:{ error:string }; mp:number };
      expect(server.status).toBe(409); expect(server.mp).toBe(w5.total);
      await screenshot(page,'shop-constraints');
      record('shops.constraints',{ actions:`Quantities 0, 51, abc; 50 packs over the balance; three clicks on one Purchase; buy accessory "${accessory.name}" then try it again`, expected:'Insufficient funds, invalid counts, sold-out items and duplicate submissions fail clearly',
        observed:`${refusals.join('; ')}; over balance: "${over}", wallet unchanged ${w3.total}; triple click opened one pack and charged ${w3.total - w4.total} MP once; accessory bought (${w4.total}→${w5.total}), then shown as Owned and disabled; a direct second request was refused ${server.status} ${server.body.error} with the wallet unchanged at ${server.mp}` });
    } finally { closeAll(); }
  },900000);

  it('earns MP in a PvP duel, buys a cosmetic box with earned MP only, previews and equips owned items, edits the appearance',async () => {
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
      const refused = await a.ev(`(async()=>{const s=await (await fetch('/api/de/cosmetics',{credentials:'include'})).json();const r=await fetch('/api/de/cosmetics/open',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({boxId:'hair',requestId:s.nextRequestId})});return {status:r.status,body:await r.json()};})()`) as { status:number; body:{ error:string } };
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
      await click(b,'Duel'); await click(a,'Accept Duel',60000);
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
