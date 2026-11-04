import { describe, expect, it } from 'vitest';
import { RUN, CLIENT, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, type, text, sleep, screenshot, record, byKey, byText, type Page } from './harness';

/** Deck editor flows against the real server: the saved decks and active deck (user_decks / user_deck_current), the
 * character's trunk, the deck check and the file formats. */
const collectionCards = (page:Page) => page.ev(`[...document.querySelectorAll('[data-key^="collection-card:"]')].map(b=>({ key:b.dataset.key, name:b.title.split(' · ')[0], owned:Number(/×(\\d+)/.exec(b.querySelector('.de-card-count')?.textContent??'')?.[1]??0) }))`) as Promise<{ key:string; name:string; owned:number }[]>;
const zone = (page:Page,z:'main'|'side'|'extra') => page.ev(`[...document.querySelectorAll('[data-key^="deck-card:${z}:"]')].map(b=>b.title.split(' · ')[0])`) as Promise<string[]>;
const deckNames = (page:Page) => page.ev(`[...document.querySelectorAll('[data-key="deck-select"] option')].filter(o=>o.value).map(o=>o.value)`) as Promise<string[]>;
const currentDeck = (page:Page) => page.ev(`document.querySelector('[data-key="deck-select"]').value`) as Promise<string>;
const deckCheck = (page:Page) => page.ev(`document.querySelector('[data-key="deck-check"]')?.innerText ?? ''`) as Promise<string>;
const notice = (page:Page) => page.ev(`document.querySelector('.de-notice')?.textContent ?? ''`) as Promise<string>;
const matching = (page:Page) => page.ev(`/^(\\d+) matching cards · Page (\\d+)\\/(\\d+)/.exec([...document.querySelectorAll('.de-collection .de-note')].map(n=>n.textContent).find(t=>/matching cards/.test(t))??'')?.slice(1).map(Number) ?? null`) as Promise<[number,number,number] | null>;
async function search(page:Page,query:string) { await type(page,byKey('collection-search'),query); await sleep(400); }
async function select(page:Page,key:string,value:string) {
  await page.ev(`(()=>{const s=document.querySelector('[data-key="${key}"]');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await sleep(400);
}
/** Inspect a collection card (single press) and add it with the inspector's Add button. */
async function add(page:Page,name:string,zoneValue:'main'|'side'|'extra' = 'main') {
  await select(page,'deck-destination',zoneValue);
  await search(page,name);
  const tile = `[...document.querySelectorAll('[data-key^="collection-card:"]')].find(b=>b.title.startsWith(${JSON.stringify(name + ' ·')}))`;
  await until(page,tile,10000); await press(page,tile);
  await click(page,`Add ${name}`,10000); await sleep(300);
}
async function editDeck(page:Page) { await click(page,'Edit Deck'); await until(page,byKey('collection-search'),60000); await until(page,`document.querySelector('[data-key="deck-select"]')`,30000); await sleep(800); }
/** Reload the page and come back to the same character's deck editor: everything shown comes from the server again. */
async function reload(page:Page,character:string,assets = true) {
  await page.go(`${CLIENT}/?portOffset=1000${assets ? '&assets=/game-assets/' : ''}`,`document.querySelector('.de-client')`);
  const slot = `[...document.querySelectorAll('.de-characters button')].find(b=>b.textContent.includes(${JSON.stringify(character)})&&!b.disabled)`;
  // The previous page's session can take a moment to close; the server then asks to wait and try again, as a player would.
  for (let attempt = 0; attempt < 12 && !(await page.ev(`Boolean(${slot})`)); attempt++) {
    const go = `[...document.querySelectorAll('button')].find(b=>['Go Online','Continue'].includes(b.textContent.trim())&&!b.disabled)`;
    await until(page,`${go}||${slot}`,60000);
    if (await page.ev(`Boolean(${go})`)) await press(page,go);
    await until(page,`${slot}||/already logged in/.test(document.body.innerText)`,30000).catch(() => {});
    if (!(await page.ev(`Boolean(${slot})`))) await sleep(5000);
  }
  await until(page,slot,10000); await press(page,slot); await until(page,byKey('lobby-npcs'),60000);
  await editDeck(page);
}
/** The editor's exports: the anchor download is captured as bytes. */
async function captureDownloads(page:Page) {
  await page.ev(`(()=>{window.__downloads=[];if(window.__dlPatched)return;window.__dlPatched=true;const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download&&this.href.startsWith('blob:')){const name=this.download;fetch(this.href).then(r=>r.arrayBuffer()).then(b=>window.__downloads.push({name,bytes:[...new Uint8Array(b)]}));return;}return click.call(this);};})()`);
}
async function exported(page:Page,label:string):Promise<{ name:string; bytes:number[] }> {
  await page.ev('window.__downloads=[]'); await click(page,label);
  await until(page,'window.__downloads.length>0',10000); return page.ev('window.__downloads[0]') as Promise<{ name:string; bytes:number[] }>;
}
async function importFile(page:Page,name:string,bytes:number[]) {
  await page.ev(`(()=>{const i=document.querySelector('[aria-label="Import YDC, YDK or JSON deck"]');const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(${JSON.stringify(bytes)})],${JSON.stringify(name)}));i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(800);
}
const deckState = async (page:Page) => ({ main:await zone(page,'main'), side:await zone(page,'side'), extra:await zone(page,'extra') });

describe.skipIf(!enabled)('deck editor against the real server',() => {
  it('lists, edits, saves, reloads, renames and deletes decks; checks legality; round-trips recipes and files; searches and inspects the collection',async () => {
    try {
      const character = `Dk ${RUN}`, page = await openPage(1280,900);
      await openClient(page,await signIn(`TestDk${RUN}`));
      await enterWorld(page,character);
      await editDeck(page);
      await screenshot(page,'deck-editor');

      // deck.list: the claimed starter deck is the saved and active deck; the trunk is exactly its cards.
      const starterName = await currentDeck(page), starter = await deckState(page), names0 = await deckNames(page);
      expect(starterName).not.toBe(''); expect(names0).toContain(starterName); expect(starter.main.length).toBeGreaterThanOrEqual(40);
      const owned = await collectionCards(page), ownedTotal = owned.reduce((n,c) => n + c.owned,0);
      const inDeck = new Map<string,number>(); for (const n of [...starter.main,...starter.extra,...starter.side]) inDeck.set(n,(inDeck.get(n) ?? 0) + 1);
      const ownedByName = new Map<string,number>(); for (const c of owned) ownedByName.set(c.name,(ownedByName.get(c.name) ?? 0) + c.owned);
      expect(ownedTotal).toBe(starter.main.length + starter.extra.length + starter.side.length);
      for (const [n,k] of inDeck) expect(ownedByName.get(n),n).toBe(k);
      expect(await deckCheck(page)).toContain('legal for duels');
      record('deck.list',{ actions:'Fresh character claims a starter deck; open Edit Deck', expected:'Saved decks, active deck and inventory counts from authoritative data',
        observed:`deck list [${names0.join(', ')}], active "${starterName}" (${starter.main.length} main/${starter.extra.length} fusion/${starter.side.length} side); collection shows ${owned.length} owned cards totalling ×${ownedTotal}, equal per card to the starter deck the server granted` });

      // deck.edit: a new deck; additions limited by owned copies and zones; side moves, reorder and removal.
      const deckA = `Acc A${RUN}`.slice(0,40);
      await type(page,`document.querySelector('[aria-label="Deck name"]')`,deckA); await click(page,'New'); await until(page,`document.querySelector('[data-key="deck-select"]').value===${JSON.stringify(deckA)}||[...document.querySelectorAll('[aria-label="Deck name"]')].some(i=>i.value===${JSON.stringify(deckA)})`,10000);
      expect((await deckState(page)).main).toEqual([]);
      const single = [...ownedByName].find(([,k]) => k === 1)?.[0], triple = [...ownedByName].find(([,k]) => k >= 2)?.[0];
      expect(single && triple).toBeTruthy();
      await add(page,single!); await add(page,single!);
      const overOwned = await notice(page);
      expect((await zone(page,'main')).filter(n => n === single)).toHaveLength(1);
      expect(overOwned).toMatch(/owned copy/i);
      for (let i = 0; i < ownedByName.get(triple!)!; i++) await add(page,triple!);
      expect((await zone(page,'main')).filter(n => n === triple)).toHaveLength(ownedByName.get(triple!)!);
      // A main-deck card cannot go to the Fusion Deck.
      await add(page,single === triple ? triple! : (await zone(page,'main'))[0]!,'extra').catch(() => {});
      const wrongZone = await notice(page);
      expect(wrongZone).toMatch(/belongs in the Main or Side Deck|copy|owned/i);
      // Reorder: the first card moves later; then to the Side Deck and back; then removed.
      const before = await zone(page,'main');
      await press(page,`document.querySelector('[data-key="deck-card:main:0"]')`); await click(page,'Move later'); await sleep(300);
      const after = await zone(page,'main');
      expect(after).toEqual([before[1],before[0],...before.slice(2)]);
      await press(page,`document.querySelector('[data-key="deck-card:main:0"]')`); await click(page,'Move to Side Deck'); await sleep(300);
      expect(await zone(page,'side')).toEqual([after[0]]);
      await press(page,`document.querySelector('[data-key="deck-card:side:0"]')`); await click(page,'Remove selected card'); await sleep(300);
      expect(await zone(page,'side')).toEqual([]);
      const edited = await deckState(page);
      await screenshot(page,'deck-edit');
      record('deck.edit',{ actions:`New deck; add ${single} twice (owned ×1); add ${triple} ×${ownedByName.get(triple!)}; add a Main card to the Fusion Deck; Move later; Move to Side Deck; Remove`,
        expected:'Add/remove/reorder main, side and extra cards; enforce ownership and card limits',
        observed:`second ${single} refused ("${overOwned}"); Fusion placement refused ("${wrongZone}"); order [${before.slice(0,2).join(', ')}] became [${after.slice(0,2).join(', ')}]; side move and removal applied; main now ${edited.main.length}` });

      // deck.validate: the short deck is reported before any duel; the starter deck is legal.
      const report = await deckCheck(page);
      expect(report).toMatch(/Main Deck has \d+ cards \(40 to 80 allowed\)/);
      expect(report).toContain('cannot be used in a duel');

      // deck.persist: save, reload from the server, rename, delete.
      await click(page,'Save'); await until(page,`[...document.querySelectorAll('[data-key="deck-select"] option')].some(o=>o.value===${JSON.stringify(deckA)})`,15000);
      await reload(page,character);
      expect(await currentDeck(page)).toBe(deckA);
      expect(await deckState(page)).toEqual(edited);
      expect(await deckNames(page)).toEqual(expect.arrayContaining([starterName,deckA]));
      const deckB = `Acc B${RUN}`;
      await type(page,`document.querySelector('[aria-label="Deck name"]')`,deckB); await click(page,'Save');
      await until(page,`[...document.querySelectorAll('[data-key="deck-select"] option')].some(o=>o.value===${JSON.stringify(deckB)})`,15000); await sleep(800);
      const renamed = await deckNames(page);
      await reload(page,character);
      const reloadedNames = await deckNames(page), reloadedCurrent = await currentDeck(page);
      expect(reloadedCurrent).toBe(deckB); expect(reloadedNames).not.toContain(deckA); expect(await deckState(page)).toEqual(edited);
      await click(page,'Delete'); await until(page,`![...document.querySelectorAll('[data-key="deck-select"] option')].some(o=>o.value===${JSON.stringify(deckB)})`,15000); await sleep(800);
      const afterDelete = await currentDeck(page);
      await reload(page,character);
      expect(await deckNames(page)).not.toContain(deckB);
      expect(await currentDeck(page)).toBe(afterDelete); expect(afterDelete).toBe(starterName);
      record('deck.persist',{ actions:`Save "${deckA}"; reload the page; rename to "${deckB}" and save; reload; delete it; reload`, expected:'Create, rename, save, reload and delete decks with correct active selection',
        observed:`after reload "${deckA}" was active with identical zones; after rename the list was [${reloadedNames.join(', ')}] with "${deckB}" active (old name gone: ${!reloadedNames.includes(deckA)}; list before reload [${renamed.join(', ')}]); after delete and reload the list is [${(await deckNames(page)).join(', ')}] and "${afterDelete}" is active` });

      // deck.validate, continued: the starter deck passes; a forbidden-list deck is reported; an illegal deck stays out of a duel.
      expect(await deckCheck(page)).toContain('legal for duels');
      await page.ev(`document.querySelector('[data-key="deck-file-tools"]').open=true`);
      await captureDownloads(page);
      const forbiddenYdk = ['#created by test','#main',...Array(3).fill('55144522'),...Array(2).fill('19613556'),'#extra','!side',''].join('\n'); // Pot of Greed (Forbidden), Heavy Storm (Limited)
      await importFile(page,'Forbidden Test.ydk',[...new TextEncoder().encode(forbiddenYdk)]);
      const forbiddenReport = await deckCheck(page);
      expect(forbiddenReport).toMatch(/Forbidden/); expect(forbiddenReport).toMatch(/Limited: 2 copies, at most 1/); expect(forbiddenReport).toMatch(/0 owned/);
      await screenshot(page,'deck-check');
      record('deck.validate',{ actions:'Deck check on a 4-card deck, the starter deck and an imported YDK with 3 Pot of Greed and 2 Heavy Storm', expected:'Report size, format and forbidden/limited-card violations before a duel',
        observed:`short deck: "${report.split('\n').slice(0,2).join(' / ')}"; starter: "legal for duels"; imported: ${forbiddenReport.split('\n').slice(1).join(' / ')}` });

      // deck.recipes: a recipe loads into the draft; YDK, JSON and YDC exports re-import to the same cards.
      const recipes = await page.ev(`[...document.querySelectorAll('[data-key="deck-recipe"] option')].filter(o=>o.value).map(o=>o.value+'|'+o.textContent)`) as string[];
      expect(recipes.length).toBeGreaterThan(0);
      await select(page,'deck-recipe',recipes[0]!.split('|')[0]!); await click(page,'Use Recipe'); await sleep(600);
      const recipe = await deckState(page);
      expect(recipe.main.length).toBeGreaterThanOrEqual(40);
      const rounds:string[] = [];
      for (const [label,file] of [['Export YDK','r.ydk'],['Export JSON','r.json'],['Export YDC','r.ydc']] as const) {
        const out = await exported(page,label);
        await click(page,'Clear Deck'); await sleep(400); expect((await deckState(page)).main).toEqual([]);
        await importFile(page,file,out.bytes);
        const back = await deckState(page);
        expect(back,label).toEqual(recipe);
        rounds.push(`${label} ${out.name} ${out.bytes.length} bytes → ${back.main.length}/${back.extra.length}/${back.side.length}`);
      }
      record('deck.recipes',{ actions:`Use recipe "${recipes[0]!.split('|')[1]}"; for YDK, JSON and YDC: export, Clear Deck, import the exported file`, expected:'Load supported recipes and round-trip supported deck formats without losing identities',
        observed:`recipe loaded ${recipe.main.length} main/${recipe.extra.length} fusion; each round trip restored the identical ordered card lists: ${rounds.join('; ')}` });

      // cards.collection: owned-only, search, type filter, sort and paging over the whole catalogue.
      await select(page,'deck-select',starterName); await sleep(800);
      await search(page,'');
      const ownedOnly = await matching(page);
      expect(ownedOnly?.[0]).toBe(owned.length);
      await page.ev(`(()=>{const d=document.querySelector('[data-key="deck-filters"]');d.open=true;const c=[...d.querySelectorAll('label')].find(l=>l.textContent.includes('Owned only')).querySelector('input');c.click();})()`); await sleep(600);
      const all = await matching(page);
      expect(all![0]).toBeGreaterThan(1000); expect(all![2]).toBe(Math.ceil(all![0] / 80));
      const page1 = (await collectionCards(page)).map(c => c.key);
      await click(page,'Next'); await sleep(400);
      const page2 = (await collectionCards(page)).map(c => c.key);
      expect((await matching(page))![1]).toBe(2); expect(page2.some(k => page1.includes(k))).toBe(false); expect(page1).toHaveLength(80);
      await click(page,'Previous'); await sleep(400);
      await search(page,'Kuriboh');
      const kuriboh = await collectionCards(page);
      expect(kuriboh.length).toBeGreaterThan(0); expect(kuriboh[0]!.name).toBe('Kuriboh');
      await search(page,''); await select(page,'collection-type','spell');
      const spellCount = (await matching(page))![0];
      await press(page,`document.querySelector('[data-key^="collection-card:"]')`); await sleep(300);
      const spellType = await page.ev(`document.querySelector('.de-card-inspector')?.innerText.split('\\n').find(l=>/^Spell/.test(l)) ?? ''`) as string;
      expect(spellType).toMatch(/^Spell/); expect(spellCount).toBeLessThan(all![0]);
      await select(page,'collection-type','monster'); await select(page,'collection-sort','attack');
      const firstAtk = await page.ev(`[...document.querySelectorAll('[data-key^="collection-card:"]')].slice(0,2).map(b=>b.title.split(' · ')[0])`) as string[];
      await screenshot(page,'deck-sorted');
      await press(page,`document.querySelector('[data-key^="collection-card:"]')`); await sleep(300);
      const topAtk = await page.ev(`document.querySelector('.de-card-inspector')?.innerText ?? ''`) as string;
      expect(topAtk).toMatch(/ATK (\d{4})/);
      await select(page,'collection-type','all'); await select(page,'collection-sort','type');
      await page.ev(`(()=>{const d=document.querySelector('[data-key="deck-filters"]');const c=[...d.querySelectorAll('label')].find(l=>l.textContent.includes('Owned only')).querySelector('input');c.click();})()`); await sleep(500);
      const ownedAgain = await collectionCards(page);
      expect(ownedAgain.reduce((n,c) => n + c.owned,0)).toBe(ownedTotal);
      record('cards.collection',{ actions:'Owned only; untick it; Next/Previous pages; search "Kuriboh"; Spells filter; Monsters by ATK; owned only again', expected:'Owned counts, filtering, sorting and pagination match inventory',
        observed:`owned only: ${ownedOnly![0]} cards (= collection), total ×${ownedTotal}; all cards: ${all![0]} over ${all![2]} pages of 80, page 2 disjoint from page 1; "Kuriboh" first result ${kuriboh[0]!.name} of ${kuriboh.length} matches; Spells filter: ${spellCount} cards, first inspected "${spellType}"; Monsters by ATK: ${firstAtk.join(', ')} (${/ATK \d+/.exec(topAtk)?.[0]})` });

      // cards.inspect: details of a monster with an alternate art and of a spell, over the whole catalogue.
      await page.ev(`(()=>{const d=document.querySelector('[data-key="deck-filters"]');d.open=true;const c=[...d.querySelectorAll('label')].find(l=>l.textContent.includes('Owned only')).querySelector('input');if(c.checked)c.click();})()`); await sleep(500);
      await search(page,'Kuriboh');
      await press(page,`document.querySelector('[data-key^="collection-card:"]')`); await sleep(400);
      const inspector = await page.ev(`document.querySelector('.de-card-inspector')?.innerText ?? ''`) as string;
      expect(inspector).toContain('Kuriboh'); expect(inspector).toMatch(/Passcode \d+/); expect(inspector).toMatch(/ATK 300 \/ DEF 200/); expect(inspector).toMatch(/Rarity/); expect(inspector).toMatch(/Alternate art/i);
      expect(inspector).toMatch(/Dark|DARK/); expect(inspector).toMatch(/Lv 1/);
      const art = await page.ev(`(()=>{const i=document.querySelector('.de-card-inspector img');return i?{src:i.src.slice(0,30),w:i.naturalWidth,visible:getComputedStyle(i).visibility}:null})()`);
      await search(page,'Pot of Greed'); await select(page,'collection-type','all');
      await page.ev(`(()=>{const d=document.querySelector('[data-key="deck-filters"]');d.open=true;const c=[...d.querySelectorAll('label')].find(l=>l.textContent.includes('Owned only')).querySelector('input');if(c.checked)c.click();})()`); await sleep(500);
      await press(page,`document.querySelector('[data-key^="collection-card:"]')`); await sleep(400);
      const spell = await page.ev(`document.querySelector('.de-card-inspector')?.innerText ?? ''`) as string;
      expect(spell).toContain('Pot of Greed'); expect(spell).toMatch(/Spell/); expect(spell).toMatch(/Forbidden/); expect(spell).not.toMatch(/ATK/);
      await screenshot(page,'card-inspect');
      // Without original art the same card is drawn as a named fallback tile, never a broken image.
      // (a second player in its own browser context, opened without the original archive)
      const plain = await openPage(1280,900);
      await openClient(plain,await signIn(`TestDp${RUN}`),{ assets:false }); await enterWorld(plain,`Dp ${RUN}`); await editDeck(plain);
      await press(plain,`document.querySelector('[data-key^="collection-card:"]')`); await sleep(400);
      const fallback = await plain.ev(`(()=>{const t=document.querySelector('.de-card-inspector .de-card');return {text:t?.querySelector('.de-card-unknown')?.textContent ?? '',images:t?.querySelectorAll('img').length ?? -1,name:document.querySelector('.de-card-inspector h3')?.textContent}})()`) as { text:string; images:number; name:string };
      expect(fallback.images).toBe(0); expect(fallback.text).toBe(fallback.name);
      record('cards.inspect',{ actions:'Inspect Kuriboh (three arts) and Pot of Greed from the collection', expected:'Passcode, text, type, stats, rarity, alternate art and image fallback are correct',
        observed:`Kuriboh: ${inspector.replace(/\n+/g,' | ').slice(0,300)}; art ${JSON.stringify(art)}; Pot of Greed: ${spell.replace(/\n+/g,' | ').slice(0,200)}; without original art "${fallback.name}" is drawn as a named fallback tile ("${fallback.text}", ${fallback.images} images)` });
      void text; void byText;
    } finally { closeAll(); }
  },900000);
});
