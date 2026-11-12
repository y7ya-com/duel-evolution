import { describe, expect, it } from 'vitest';
import { RUN, CLIENT, enabled, openPage, closeAll, signIn, openClient, enterWorld, until, press, sleep, screenshot, record, byKey, type Page, lobbyShown,
  deckScreen, openDeckEditor, titleButton, deckSide, filesReady, type DeckScreen } from './harness';

/** Deck editor flows on main's HTML deck screen (src/ui/htmlui/deck.ts, deck-dom.ts, deck-scene.ts) against the real
 * server: the saved decks and active deck (user_decks / user_deck_current), the character's trunk, the deck check and
 * the rewrite's deck files (YDC / YDK / JSON in LOAD DECK's Import / Export) and structure decks (STRUCTURE DECK). */
const host = `document.getElementById('htmlui-host')`;
const hostText = (page:Page) => page.ev(`${host}?.innerText ?? ''`) as Promise<string>;
/** A card element of the screen: trunk / main / side / extra, by index or by name. */
const cardEl = (zone:string,which:number|string) => typeof which === 'number'
  ? `document.querySelector('[data-zone="${zone}"][data-index="${which}"]')`
  : `(()=>{const all=[...document.querySelectorAll('[data-zone="${zone}"]')].filter(e=>e.getAttribute('aria-label')===${JSON.stringify(which)}&&e.getClientRects().length);
    /* the one a pointer reaches (main's trunk rows stand over the card art drawn under them) */
    return all.find(e=>{const r=e.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return h&&(h===e||e.contains(h));})??all[0];})()`;
const trunkShown = (page:Page) => page.ev(`[...new Set([...document.querySelectorAll('[data-zone="trunk"][data-passcode]')].filter(e=>e.getClientRects().length).map(e=>e.getAttribute('aria-label')))]`) as Promise<string[]>;
const labelled = (label:string) => `[...${host}.querySelectorAll('[aria-label],button,input')].find(e=>(e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.trim()===${JSON.stringify(label)})&&e.getClientRects().length)`;
const view = async (page:Page) => (await deckScreen(page))!;
const settle = (page:Page,cond:string,ms = 10000) => until(page,cond,ms).then(() => sleep(300));
/** Drag: a real pointer press on one element, moves, the release over another (DeckEntryMain.cpp's drag). */
async function drag(page:Page,from:string,to:string) {
  const at = async (sel:string) => page.ev(`(()=>{const b=${sel};if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`) as Promise<{ x:number; y:number } | null>;
  const a = await at(from), b = await at(to); expect(a && b,`${from} → ${to}`).toBeTruthy();
  // the press lands on the card itself (nothing over it)
  const hit = await page.ev(`(()=>{const f=${from},h=document.elementFromPoint(${a!.x},${a!.y});return f&&h&&(f===h||f.contains(h))?'':(h?h.tagName+'.'+h.className+' < '+(h.parentElement?.className??''):'nothing');})()`) as string;
  expect(hit,`press on ${from}`).toBe('');
  await page.send('Input.dispatchMouseEvent',{ type:'mousePressed',...a!,button:'left',clickCount:1 });
  // a hand's drag spans frames: the screen draws the held card (and opens its drop zones) between the moves
  await page.ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  for (let i = 1; i <= 6; i++) { await page.send('Input.dispatchMouseEvent',{ type:'mouseMoved',x:a!.x + (b!.x - a!.x) * i / 6,y:a!.y + (b!.y - a!.y) * i / 6,button:'left' }); await sleep(30); }
  await page.ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  await page.send('Input.dispatchMouseEvent',{ type:'mouseReleased',...b!,button:'left',clickCount:1 });
  await sleep(500);
}
async function dblclick(page:Page,sel:string) {
  const p = await page.ev(`(()=>{const r=(${sel}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`) as { x:number; y:number };
  for (const clickCount of [1,2]) { await page.send('Input.dispatchMouseEvent',{ type:'mousePressed',...p,button:'left',clickCount }); await page.send('Input.dispatchMouseEvent',{ type:'mouseReleased',...p,button:'left',clickCount }); }
  await sleep(500);
}
async function rightClick(page:Page,sel:string) {
  const p = await page.ev(`(()=>{const r=(${sel}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`) as { x:number; y:number };
  await page.send('Input.dispatchMouseEvent',{ type:'mousePressed',...p,button:'right',clickCount:1 }); await page.send('Input.dispatchMouseEvent',{ type:'mouseReleased',...p,button:'right',clickCount:1 });
  await sleep(500);
}
/** main's OK / Yes-No dialog over the editor: its words, then OK (or Yes / No). */
async function answer(page:Page,key:'deck-dialog-ok'|'deck-dialog-yes'|'deck-dialog-no' = 'deck-dialog-ok'):Promise<string> {
  await until(page,byKey(key),10000); const words = await hostText(page); await press(page,byKey(key)); await sleep(400); return words;
}
const dialogUp = `Boolean(${byKey('deck-dialog-ok')}||${byKey('deck-dialog-yes')})`;
/** LOAD DECK / SAVE DECK / STRUCTURE DECK: pick the row named, then a button of the window. */
async function fileRow(page:Page,label:string) { await until(page,labelled(label),10000); await press(page,labelled(label)); await sleep(300); }
async function typeName(page:Page,name:string) {
  await until(page,byKey('deck-name'),10000);
  await page.ev(`(()=>{const i=${byKey('deck-name')};i.focus();i.value=${JSON.stringify(name)};i.dispatchEvent(new Event('input',{bubbles:true}));})()`); await sleep(300);
  await press(page,byKey('deck-name-ok')); await sleep(500);
}
/** The trunk's search (main's searchPanel "Search the trunk"). */
async function search(page:Page,text:string) {
  const input = `[...document.querySelectorAll('input')].find(i=>(i.getAttribute('aria-label')==='Search the trunk'||i.placeholder==='Search the trunk')&&i.getClientRects().length)`;
  await until(page,input,10000);
  await page.ev(`(()=>{const i=${input};i.focus();i.value=${JSON.stringify(text)};i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(700);
}
const anyButton = (label:string) => `[...document.querySelectorAll('button,[role="button"],label,[aria-label]')].find(e=>(e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.trim()===${JSON.stringify(label)})&&e.getClientRects().length)`;
async function tap(page:Page,label:string) { await until(page,anyButton(label),10000); await press(page,anyButton(label)); await sleep(500); }
const zones = (d:DeckScreen) => ({ main:d.main,side:d.side,extra:d.extra });
/** Reload the page and come back to the same character's deck screen: everything shown comes from the server again. */
async function reload(page:Page,character:string) {
  await page.go(`${CLIENT}/?portOffset=1000&assets=/game-assets/`,`document.querySelector('.de-client')`);
  const slot = `[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes(${JSON.stringify(character)})&&!b.disabled)`;
  for (let attempt = 0; attempt < 12 && !(await page.ev(`Boolean(${slot})`)); attempt++) {
    const go = `([...document.querySelectorAll('button')].find(b=>['Go Online','Continue'].includes(b.textContent.trim())&&!b.disabled)||${titleButton('online')})`;
    await until(page,`${go}||${slot}`,60000);
    if (await page.ev(`Boolean(${go})`)) await press(page,go);
    await until(page,`${slot}||/already logged in/.test(document.body.innerText)`,30000).catch(() => {});
    // the refusal shows in main's error dialog (its OK reads Close here): closed as a player would, then a later try
    if (!(await page.ev(`Boolean(${slot})`))) { await sleep(5000); if (await page.ev(`Boolean(${byKey('error-ok')})`)) await press(page,byKey('error-ok')); }
  }
  await until(page,slot,10000); await press(page,slot); await until(page,lobbyShown,60000);
  await openDeckEditor(page);
}

describe.skipIf(!enabled)('deck editor (main\'s HTML deck screen) against the real server',() => {
  it('loads, edits, saves, reloads, renames and deletes decks; checks legality; structure decks; searches, filters, sorts and inspects the trunk',async () => {
    try {
      const character = `Dk ${RUN}`, page = await openPage(1280,900);
      await openClient(page,await signIn(`TestDk${RUN}`));
      await enterWorld(page,character);
      const start = await openDeckEditor(page,40);
      await screenshot(page,'deck-editor');

      // deck.list: the claimed starter deck is the saved and active deck, in LOAD DECK's list; the trunk is its cards.
      const starterName = start.name, starter = zones(start);
      expect(start.decks).toContain(starterName); expect(starter.main.length).toBeGreaterThanOrEqual(40);
      const ownedByName = new Map<string,number>(); for (const c of start.collection) ownedByName.set(c.name,(ownedByName.get(c.name) ?? 0) + c.owned);
      const inDeck = new Map<string,number>(); for (const n of [...starter.main,...starter.extra,...starter.side]) inDeck.set(n,(inDeck.get(n) ?? 0) + 1);
      for (const [n,k] of inDeck) expect(ownedByName.get(n),n).toBe(k);
      expect(await page.ev(`document.querySelectorAll('[data-zone="main"][data-passcode]').length`)).toBeGreaterThanOrEqual(Math.min(40,starter.main.length));
      await deckSide(page,'load'); await until(page,filesReady('deck-files-cancel'),30000); await sleep(300);
      const loadList = await hostText(page); expect(loadList).toContain('LOAD DECK'); expect(loadList).toContain(starterName);
      await press(page,byKey('deck-files-cancel')); await sleep(400);
      record('deck.list',{ actions:'Fresh character claims a starter deck; Edit Deck; LOAD DECK', expected:'Saved decks, active deck and trunk counts from authoritative data',
        observed:`LOAD DECK lists [${start.decks.join(', ')}], active "${starterName}" (${starter.main.length} main/${starter.extra.length} fusion/${starter.side.length} side); trunk ${start.collection.length} cards, owned per card equal to the starter deck` });

      // deck.edit: Clear Deck; drag from the trunk; the owned-copies refusal; quick moves (double-click / right-click);
      // Main ↔ Side; reorder by a drop on another card; back to the trunk.
      await deckSide(page,'clear'); await answer(page,'deck-dialog-yes'); await settle(page,`window.__deApp?.getState()?.deckEditor?.current?.main.length===0`);
      expect((await view(page)).main).toEqual([]);
      const single = [...ownedByName].find(([,k]) => k === 1)?.[0], multi = [...ownedByName].find(([,k]) => k >= 2)?.[0];
      expect(single && multi).toBeTruthy();
      await search(page,single!);
      await drag(page,cardEl('trunk',single!),`document.querySelector('[data-drop-zone="main"]')`);
      expect((await view(page)).main).toEqual([single]);
      await drag(page,cardEl('trunk',single!),`document.querySelector('[data-drop-zone="main"]')`);
      const overOwned = await page.ev(dialogUp) ? await answer(page) : '';
      expect((await view(page)).main.filter(n => n === single)).toHaveLength(1);
      await search(page,multi!);
      await dblclick(page,cardEl('trunk',multi!));            // quick move: trunk → Main Deck
      await rightClick(page,cardEl('trunk',multi!));          // and again by the right button
      if (await page.ev(dialogUp)) await answer(page);
      const afterQuick = (await view(page)).main;
      expect(afterQuick.filter(n => n === multi).length).toBe(Math.min(2,ownedByName.get(multi!)!));
      // live's grids keep the game's order (DeckWindowDeck.cpp sortedSlot): a card dropped on another of its own grid
      // goes back where it was
      const before = afterQuick;
      await drag(page,cardEl('main',before.length - 1),cardEl('main',0));
      const reordered = (await view(page)).main;
      expect(reordered).toEqual(before);
      // Main → Side by a drag; Side → trunk by a quick move
      const sided = await page.ev(`(${cardEl('main',0)}).getAttribute('aria-label')`) as string;
      await drag(page,cardEl('main',0),`document.querySelector('[data-drop-zone="side"]')`);
      expect((await view(page)).side).toEqual([sided]);
      await dblclick(page,cardEl('side',0));
      const quickBack = await view(page);
      await screenshot(page,'deck-edit');
      // a Main card refused by the Fusion tab's grid
      await press(page,byKey('deck-fusion-deck')); await sleep(400);
      if (quickBack.main.length) {
        await press(page,byKey('deck-main-deck')); await sleep(300);
        await drag(page,cardEl('main',0),byKey('deck-fusion-deck'));
      }
      const wrongZone = await page.ev(dialogUp) ? await answer(page) : '';
      const edited = zones(await view(page));
      record('deck.edit',{ actions:`Clear Deck; drag ${single} (owned ×1) twice; double-click and right-click ${multi}; drop the last Main card on the first (no reorder, as live); drag it to the Side Deck; double-click it back; drag a Main card to the Fusion tab`,
        expected:'Add/remove/reorder Main, Side and Fusion cards by drag and quick moves; enforce ownership and zones',
        observed:`second ${single} refused ("${overOwned.replace(/\s+/g,' ').slice(0,120)}"); quick moves added ${afterQuick.filter(n => n === multi).length}× ${multi}; a drop on its own grid kept the order; Side move and quick move back applied (side now ${quickBack.side.length}); Fusion placement: "${wrongZone.replace(/\s+/g,' ').slice(0,120)}"; main now ${edited.main.length}` });

      // deck.persist + deck.validate: SAVE DECK → Save New (a short deck: the deck check says why it can't duel), reload
      // from the server, Save New under another name and delete the first (rename), delete, reload.
      const deckA = `Acc A${RUN}`.slice(0,40), deckB = `Acc B${RUN}`.slice(0,40);
      await deckSide(page,'save'); await until(page,filesReady('deck-files-new'),30000); await press(page,byKey('deck-files-new'));
      await typeName(page,deckA);
      const report = await page.ev(dialogUp) ? await answer(page) : '';
      expect(report).toMatch(/can't be used in a duel/i); expect(report).toMatch(/Main Deck/i);
      record('deck.validate',{ actions:'SAVE DECK → Save New with a short deck', expected:'Size violations reported before a duel', observed:`"${report.replace(/\s+/g,' ').slice(0,160)}"` });
      await settle(page,`(window.__deApp?.getState()?.deckEditor?.decks??[]).some(d=>d.name===${JSON.stringify(deckA)})`,15000);
      await reload(page,character);
      let v = await view(page);
      expect(v.name).toBe(deckA); expect(zones(v)).toEqual(edited); expect(v.decks).toEqual(expect.arrayContaining([starterName,deckA]));
      await deckSide(page,'save');
      await until(page,filesReady('deck-files-new'),30000); await sleep(300);
      await press(page,byKey('deck-files-new')); await typeName(page,deckB);
      if (await page.ev(dialogUp)) await answer(page);
      await deckSide(page,'save'); await until(page,filesReady('deck-files-new'),30000); await sleep(300); await fileRow(page,deckA); await press(page,byKey('deck-files-delete')); await answer(page,'deck-dialog-yes');
      await settle(page,`!(window.__deApp?.getState()?.deckEditor?.decks??[]).some(d=>d.name===${JSON.stringify(deckA)})`,15000);
      if (await page.ev(`Boolean(${byKey('deck-files-cancel')})`)) await press(page,byKey('deck-files-cancel'));
      await reload(page,character);
      v = await view(page);
      const renamed = v.decks;
      expect(v.name).toBe(deckB); expect(renamed).not.toContain(deckA); expect(zones(v)).toEqual(edited);
      // LOAD DECK the starter, then delete B
      await deckSide(page,'load'); await until(page,filesReady('deck-files-cancel'),30000); await sleep(300); await fileRow(page,starterName); await press(page,byKey('deck-files-ok'));
      if (await page.ev(`Boolean(${byKey('deck-dialog-yes')})`)) await answer(page,'deck-dialog-yes');
      await settle(page,`window.__deApp?.getState()?.deckEditor?.current?.name===${JSON.stringify(starterName)}`,15000);
      expect(zones(await view(page))).toEqual(starter);
      await deckSide(page,'save'); await until(page,filesReady('deck-files-new'),30000); await sleep(300); await fileRow(page,deckB); await press(page,byKey('deck-files-delete')); await answer(page,'deck-dialog-yes');
      await settle(page,`!(window.__deApp?.getState()?.deckEditor?.decks??[]).some(d=>d.name===${JSON.stringify(deckB)})`,15000);
      if (await page.ev(`Boolean(${byKey('deck-files-cancel')})`)) await press(page,byKey('deck-files-cancel'));
      await reload(page,character);
      v = await view(page);
      expect(v.decks).not.toContain(deckB); expect(v.name).toBe(starterName);
      record('deck.persist',{ actions:`SAVE DECK → Save New "${deckA}"; reload; Save New "${deckB}" and Delete "${deckA}" (rename); reload; LOAD DECK "${starterName}"; Delete "${deckB}"; reload`,
        expected:'Create, rename, save, reload and delete decks with correct active selection; the deck check on save',
        observed:`save of the short deck said "${report.replace(/\s+/g,' ').slice(0,160)}"; after reload "${deckA}" active with identical zones; after rename [${renamed.join(', ')}] with "${deckB}" active; after delete and reload [${v.decks.join(', ')}], "${v.name}" active` });

      // deck.recipes: STRUCTURE DECK loads a recipe; YDK, JSON and YDC exports (LOAD DECK → Export) re-import to the same cards.
      await deckSide(page,'structure'); await until(page,byKey('deck-files-ok'),30000);
      const recipeName = (await page.ev(`window.__deApp.getState().deckEditor.recipes?.[0]?.name ?? ''`)) as string;
      expect(recipeName).not.toBe('');
      await fileRow(page,recipeName); await press(page,byKey('deck-files-ok'));
      if (await page.ev(`Boolean(${byKey('deck-dialog-yes')})`)) await answer(page,'deck-dialog-yes');
      await sleep(800);
      const recipe = zones(await view(page));
      expect(recipe.main.length).toBeGreaterThanOrEqual(40);
      record('deck.recipes',{ actions:`STRUCTURE DECK "${recipeName}"`, expected:'Structure decks load',
        observed:`recipe loaded ${recipe.main.length} main/${recipe.extra.length} fusion` });
      await deckSide(page,'load'); await until(page,filesReady('deck-files-cancel'),30000); await sleep(300); await fileRow(page,starterName); await press(page,byKey('deck-files-ok'));
      if (await page.ev(`Boolean(${byKey('deck-dialog-yes')})`)) await answer(page,'deck-dialog-yes');
      await sleep(800);

      // cards.collection: search, Filters (Show All / Missing, types), Rearrange, the wheel scroll over the trunk.
      await search(page,'');
      const ownedShown = await trunkShown(page);
      expect(ownedShown.length).toBeGreaterThan(0);
      expect(ownedShown.filter(n => !ownedByName.has(n))).toEqual([]);
      await search(page,'Kuriboh');
      const kuriboh = await trunkShown(page);
      // the rewrite's search also finds a card by its text (after every name match): each shown card names Kuriboh or says it
      const said = await page.ev(`Object.fromEntries((window.__deApp.getState().deckEditor.collection??[]).map(c=>[c.name,c.description??'']))`) as Record<string,string>;
      expect(kuriboh.filter(n => !/kuriboh/i.test(n) && !/kuriboh/i.test(said[n] ?? ''))).toEqual([]);
      const firstText = kuriboh.findIndex(n => !/kuriboh/i.test(n));
      if (firstText >= 0) expect(kuriboh.slice(firstText).filter(n => /kuriboh/i.test(n))).toEqual([]);
      await search(page,'');
      // main's Filters popup: its Show row (a list: Owned cards / All cards / Missing / Craftable now), then its ×
      await tap(page,'Filters');
      const show = `[...document.querySelectorAll('select')].find(s=>s.getAttribute('aria-label')==='Show'&&s.getClientRects().length)`;
      await until(page,show,10000);
      await page.ev(`(()=>{const s=${show};s.focus();s.value='all';s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await sleep(400);
      if (await page.ev(`Boolean(${anyButton('Close')})`)) await tap(page,'Close');
      await sleep(600);
      const allShown = await trunkShown(page);
      expect(allShown.some(n => !ownedByName.has(n))).toBe(true);
      const top = await page.ev(`(()=>{const e=document.querySelector('[data-zone="trunk"][data-passcode]');return e?.dataset.index+':'+e?.getAttribute('aria-label');})()`) as string;
      const wheelAt = await page.ev(`(()=>{const r=document.querySelector('[data-zone="trunk"][data-passcode]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`) as { x:number; y:number };
      for (let i = 0; i < 4; i++) await page.send('Input.dispatchMouseEvent',{ type:'mouseWheel',...wheelAt,deltaX:0,deltaY:120 });
      await sleep(500);
      const scrolled = await page.ev(`(()=>{const e=document.querySelector('[data-zone="trunk"][data-passcode]');return e?.dataset.index+':'+e?.getAttribute('aria-label');})()`) as string;
      expect(scrolled).not.toBe(top);
      // the order: the Filters popup's Sort by (Name), sorted A to Z (Filters says how many are on: "Filters, 1 on")
      expect(await page.ev(`Boolean(${anyButton('Filters, 1 on')})`)).toBe(true);
      await tap(page,'Filters, 1 on');
      const sortBy = `[...document.querySelectorAll('select')].find(s=>s.getAttribute('aria-label')==='Sort by'&&s.getClientRects().length)`;
      await until(page,sortBy,10000);
      await page.ev(`(()=>{const s=${sortBy};s.focus();s.value='name';s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await sleep(400);
      if (await page.ev(`Boolean(${anyButton('Close')})`)) await tap(page,'Close');
      await sleep(600);
      const rearranged = await trunkShown(page);
      expect(rearranged).toEqual([...rearranged].sort((x,y) => x < y ? -1 : x > y ? 1 : 0));
      await screenshot(page,'deck-sorted');
      record('cards.collection',{ actions:'Search ""; search "Kuriboh"; Filters → Show: All cards; wheel over the trunk; Filters → Sort by: Name', expected:'Owned trunk, search, Show filter, scroll and order match the catalogue',
        observed:`owned trunk shows ${ownedShown.length} owned names; "Kuriboh" → [${kuriboh.slice(0,4).join(', ')}]; Show All adds unowned cards (${allShown.filter(n => !ownedByName.has(n)).length} visible); wheel moved the top from ${top} to ${scrolled}; Sort by Name shows [${rearranged.slice(0,3).join(', ')}]` });

      // cards.inspect: pressing a trunk card shows it in the detail (data-detail), passcode and name.
      await search(page,'Kuriboh');
      await press(page,cardEl('trunk','Kuriboh')); await sleep(300);
      await page.send('Input.dispatchMouseEvent',{ type:'mouseReleased',x:5,y:5,button:'left',clickCount:1 }); await sleep(400);
      const detail = await page.ev(`(()=>{const d=document.querySelector('[data-detail]');return d?{passcode:d.dataset.detail,name:d.getAttribute('aria-label')}:null})()`) as { passcode:string; name:string } | null;
      expect(detail?.name).toBe('Kuriboh'); expect(Number(detail?.passcode)).toBeGreaterThan(0);
      const detailText = await hostText(page);
      expect(detailText).toMatch(/ATK ?300/);
      await screenshot(page,'card-inspect');
      record('cards.inspect',{ actions:'Search Kuriboh and press its trunk card', expected:'The detail shows the card: art, passcode, stats',
        observed:`detail ${JSON.stringify(detail)}; text has ATK 300` });
    } finally { closeAll(); }
  },900000);
});
