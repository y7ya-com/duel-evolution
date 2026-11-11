import { describe, expect, it } from 'vitest';
import { RUN, CLIENT, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, pressAvatar, type, sleep, screenshot, record, byKey, byText, prepareDuel, duelBot, surrender, type Page, cardButton, lobbyShown, openDeckEditor, exitDeckEditor, deckScreen, deckSide, filesReady, openShop, leaveShop, shopWallet } from './harness';
import { playerMenu } from './pvp-helpers';

/** deck.test: the original has no separate deck-test button (PRACTICE.md); deck testing is Free Duel: a free session
 * builds decks from the whole card pool and duels other free players with no MP, record, stats or card offer
 * (server/src/game/freemode.ts). Testing a deck there must leave the world deck, collection and wallet untouched. */
const worldSnapshot = async (page:Page, probe:string) => {
  // main's deck screen: the active deck and the trunk's owned copies (the app's view of what it shows)
  const screen = await openDeckEditor(page);
  const deck = { name:screen.name,main:screen.main }, owned = screen.collection.filter(c => c.name === probe).reduce((n,c) => n + c.owned,0);
  await exitDeckEditor(page);
  // main's card shop: its wallet box (the figure and "MP" are separate elements: no "N MP" in the page's text), its Back
  await openShop(page);
  const wallet = (await shopWallet(page)).text;
  await leaveShop(page);
  return { ...deck, owned, wallet };
};
/** The trunk's search (main's searchPanel "Search the trunk"). */
async function searchTrunk(page:Page,text:string) {
  const input = `[...document.querySelectorAll('input')].find(i=>(i.getAttribute('aria-label')==='Search the trunk'||i.placeholder==='Search the trunk')&&i.getClientRects().length)`;
  await until(page,input,10000);
  await page.ev(`(()=>{const i=${input};i.focus();i.value=${JSON.stringify(text)};i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(700);
}
/** A trunk card by name, the one a pointer reaches; a double click moves it to the Main Deck (DeckEntryMain.cpp). */
const trunkCard = (name:string) => `(()=>{const all=[...document.querySelectorAll('[data-zone="trunk"][data-passcode]')].filter(e=>e.getAttribute('aria-label')===${JSON.stringify(name)}&&e.getClientRects().length);
  return all.find(e=>{const r=e.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return h&&(h===e||e.contains(h));})??all[0];})()`;
async function dblclick(page:Page,sel:string) {
  const p = await page.ev(`(()=>{const r=(${sel}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`) as { x:number; y:number };
  for (const clickCount of [1,2]) { await page.send('Input.dispatchMouseEvent',{ type:'mousePressed',...p,button:'left',clickCount }); await page.send('Input.dispatchMouseEvent',{ type:'mouseReleased',...p,button:'left',clickCount }); }
  await sleep(500);
}
async function enterFree(page:Page,character:string) {
  await click(page,'Return to Title');
  await click(page,'Free Duel & Deck Editor',60000);
  const slot = `[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes(${JSON.stringify(character)})&&!b.disabled)`;
  await until(page,`${slot}||${lobbyShown}||document.querySelector('[data-key="lobby-map"]')`,60000);
  if (await page.ev(`Boolean(${slot})`)) await press(page,slot);
  await until(page,`document.querySelector('[data-key="lobby-map"]')`,60000);
}
async function backToWorld(page:Page,character:string) {
  await click(page,'Return to Title'); await click(page,'Go Online',60000);
  const slot = `[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes(${JSON.stringify(character)})&&!b.disabled)`;
  await until(page,slot,60000); await press(page,slot); await until(page,lobbyShown,60000);
}

describe.skipIf(!enabled)('deck testing in Free Duel',() => {
  it('builds a test deck from the whole pool, duels in free mode and leaves the world deck, collection and wallet untouched',async () => {
    try {
      const names = { a:`Fra ${RUN}`, b:`Frb ${RUN}` }, probe = 'Blue-Eyes White Dragon';
      const a = await openPage(), b = await openPage();
      await openClient(a,await signIn(`TestFa${RUN}`),{ assets:false }); await openClient(b,await signIn(`TestFb${RUN}`),{ assets:false });
      await enterWorld(a,names.a); await enterWorld(b,names.b);
      const before = await worldSnapshot(a,probe);
      expect(before.owned).toBe(0);
      // Free mode: the whole pool is available; build a deck around a card this character does not own.
      for (const [p,n] of [[a,names.a],[b,names.b]] as const) await enterFree(p,n);
      await openDeckEditor(a); await sleep(800);
      // Free mode's Filters → Show: the whole pool (main's Show row: Owned cards / All cards / ...)
      await press(a,`[...document.querySelectorAll('button,[aria-label]')].find(e=>(e.getAttribute('aria-label')==='Filters'||e.textContent.trim()==='Filters')&&e.getClientRects().length)`);
      const show = `[...document.querySelectorAll('select')].find(s=>s.getAttribute('aria-label')==='Show'&&s.getClientRects().length)`;
      await until(a,show,10000);
      const showModes = await a.ev(`[...${show}.options].map(o=>o.value+':'+o.textContent).join('/')`) as string;
      await a.ev(`(()=>{const s=${show};s.focus();s.value='all';s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await sleep(400);
      const close = `[...document.querySelectorAll('button,[aria-label]')].find(e=>(e.getAttribute('aria-label')==='Close'||e.textContent.trim()==='Close')&&e.getClientRects().length)`;
      if (await a.ev(`Boolean(${close})`)) await press(a,close);
      await searchTrunk(a,probe);
      await until(a,trunkCard(probe),10000);
      const pool = await a.ev(`(${trunkCard(probe)}).closest('[data-passcode]')?.dataset.passcode ?? ''`) as string;
      const mainBefore = (await deckScreen(a))!.main.length;
      await dblclick(a,trunkCard(probe));
      await until(a,`(window.__deApp?.getState()?.deckEditor?.current?.main?.length??0)>${mainBefore}`,10000);
      const freeDeck = (await deckScreen(a))!.main;
      expect(freeDeck).toContain(probe);
      // SAVE DECK over the deck in use (its row, OK), answering main's report
      await deckSide(a,'save'); await until(a,filesReady('deck-files-new'),30000); await sleep(300);
      // the deck in use is the list's "<name> (not saved)" row (a free deck the server has not stored): pick it first
      const inUse = `[...document.querySelectorAll('#htmlui-host [aria-label],#htmlui-host button')].find(e=>/\\(not saved\\)$/.test((e.getAttribute('aria-label')??e.textContent).trim())&&e.getClientRects().length)`;
      if (await a.ev(`Boolean(${inUse})`)) { await press(a,inUse); await sleep(300); }
      if (await a.ev(`Boolean(${byKey('deck-files-ok')})&&!${byKey('deck-files-ok')}.disabled`)) await press(a,byKey('deck-files-ok'));
      // OK refused (nothing to save over): the dialog closes with Cancel, the deck stays unsaved (recorded)
      if (await a.ev(`Boolean(${byKey('deck-files-cancel')})`)) await press(a,byKey('deck-files-cancel')).catch(() => {});
      for (const k of ['deck-dialog-yes','deck-dialog-ok']) { await sleep(500); if (await a.ev(`Boolean(${byKey(k)})`)) await press(a,byKey(k)); }
      await until(a,`!(window.__deApp?.getState()?.deckEditor?.dirty)`,15000).catch(() => {});
      const saved = !(await deckScreen(a))!.dirty;
      await screenshot(a,'free-deck');
      // Duel another free player with that deck, then leave.
      await exitDeckEditor(a);
      await until(a,lobbyShown,60000);
      await playerMenu(a,names.b,'Send Duel Request');
      await until(b,byKey('duel-accept'),60000); await press(b,byKey('duel-accept'));
      await Promise.all([prepareDuel(a),prepareDuel(b,'Scissors')]);
      const deckInDuel = await a.ev(`document.querySelectorAll('.de-field-card').length`) as number;
      // A few turns, then A surrenders (from turn 10, as everywhere).
      const turn = async () => Number(/Turn (\d+)/.exec(await a.ev(`document.querySelector('.de-phase-bar')?.getAttribute('aria-label') ?? ''`) as string)?.[1] ?? 0);
      for (const started = Date.now(); Date.now() - started < 240000 && await turn() < 10;) { await Promise.all([duelBot(a,{ summon:false,attack:false }),duelBot(b,{ summon:false,attack:false })]); await sleep(150); }
      await surrender(a);
      for (const p of [a,b]) await until(p,byText('Return to Lobby'),60000);
      const result = await a.ev(`window.__duelEnd()`);
      for (const p of [a,b]) await click(p,'Return to Lobby');
      // Back in World mode nothing changed.
      await backToWorld(a,names.a);
      const after = await worldSnapshot(a,probe);
      expect(after).toEqual(before);
      record('deck.test',{ actions:`World snapshot; Free Duel & Deck Editor; add ${probe} (not owned; Show modes ${showModes}; passcode ${pool} in the free trunk) to a free deck and save; free PvP duel to turn 10 and surrender; back to World mode`, expected:'Start and leave supported deck testing without spending cards or altering the saved deck',
        observed:`free deck held ${probe} (saved ${saved}); ${deckInDuel} cards on the free duel field; result ${result}; world deck "${after.name}" unchanged (${after.main.length} main), ${probe} owned ×${after.owned} before and after, wallet ${after.wallet} MP unchanged` });
      void CLIENT;
    } finally { closeAll(); }
  },600000);
});
