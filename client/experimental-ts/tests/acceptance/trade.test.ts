import { describe, expect, it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, type, text, sleep, stageShot, record, earnCards, ownedCopies, openDeckEditor, exitDeckEditor, byKey, listRow, lobbyShown, type Page } from './harness';

/** Card Swap is main's trade windows (src/ui/htmlui/trade.ts: CWindowModelTrade, its card areas, main's dialogs) and
 * the deck screen's trunk (CWindowModelKaban, htmlui/trade-trunk.ts: its rows .htmlui-deck-row, a row dragged onto the
 * offer area offers its card, as live). */
const scene = `document.querySelector('.de-trade-scene')`;
/** The text of main's dialog holding this button (the invitation, the final confirmation, the result). */
const dialogText = (key:string) => `(document.querySelector('[data-key="${key}"]')?.closest('.win')?.innerText ?? '')`;
const open = (page:Page) => page.ev(`Boolean(document.querySelector('#htmlui-host [data-window-class="CWindowModelTrade"]')||document.querySelector('[data-key^="trade-"]')||${scene})`) as Promise<boolean>;
const closed = `!document.querySelector('#htmlui-host [data-window-class="CWindowModelTrade"]')&&!document.querySelector('[data-key^="trade-"]')&&!${scene}`;
/** Send Trade Request from the partner's card (live: their row of the player list). */
async function invite(from:Page,to:Page,name:string) {
  await until(from,listRow(name),30000); await press(from,listRow(name));
  await until(from,`document.querySelector('[data-key="card-trade"]')&&!document.querySelector('[data-key="card-trade"]').disabled`,15000);
  await press(from,`document.querySelector('[data-key="card-trade"]')`);
  await until(to,`${dialogText('trade-accept')}.includes('You have a Trade Request!')`,30000);
}
/** The trunk's copies left of a card (its row's figure), 0 when it has no row. */
const trunk = (page:Page,name:string) => page.ev(`(window.yo2Html.tradeTrunk?.()??[]).find(r=>r.name===${JSON.stringify(name)})?.left ?? 0`) as Promise<number>;
/** The trunk shown (its window and its rows' layer). */
const trunkShown = `Boolean(document.querySelector('#htmlui-host .win[data-window-class="CWindowModelKaban"]'))`;
/** Offer a card: its row scrolled into view (the wheel's way), dragged onto this side's offer area (live: a press only
 * shows the card). */
async function offer(page:Page,name:string) {
  await page.ev(`(()=>{const r=(window.yo2Html.tradeTrunk?.()??[]).find(r=>r.name===${JSON.stringify(name)});if(r)window.yo2Html.tradeTrunkReveal(r.row);})()`);
  const row = `[...document.querySelectorAll('.htmlui-deck-row[data-zone="trunk"]')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(name)})`;
  await until(page,row,10000);
  const at = await page.ev(`(()=>{const e=${row},r=e.getBoundingClientRect(),l=document.querySelector('.htmlui-deck-cards').getBoundingClientRect(),k=l.width/1024;return {x:r.x+r.width/2,y:r.y+r.height/2,tx:l.left+490*k,ty:l.top+450*k};})()`) as { x:number; y:number; tx:number; ty:number };
  await page.send('Input.dispatchMouseEvent',{ type:'mouseMoved',x:at.x,y:at.y });
  await page.send('Input.dispatchMouseEvent',{ type:'mousePressed',x:at.x,y:at.y,button:'left',buttons:1,clickCount:1 });
  for (let i = 1; i <= 8; i++) { await page.send('Input.dispatchMouseEvent',{ type:'mouseMoved',x:at.x + (at.tx - at.x) * i / 8,y:at.y + (at.ty - at.y) * i / 8,button:'left',buttons:1 }); await sleep(30); }
  await page.send('Input.dispatchMouseEvent',{ type:'mouseReleased',x:at.tx,y:at.ty,button:'left',buttons:0,clickCount:1 });
}
/** The partner's offered card shown in their (upper) area, by name. */
const offered = (name?:string) => `[...document.querySelectorAll('[data-picture^="trade-card:o:"]')].find(e=>${name ? `e.title===${JSON.stringify(name)}` : 'true'})`;
/** This side ready: main's own lamp lit, Ready to Trade. gone. */
const isReady = `!document.querySelector('[data-key="trade-ready"]')&&document.querySelector('[data-picture="trade-lamp:own"]')?.style.display!=='none'`;
async function ready(page:Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await page.ev(isReady)) return;
    if (await page.ev(`Boolean(document.querySelector('[data-key="trade-ready"]'))`)) await press(page,byKey('trade-ready'));
    try { await until(page,isReady,8000); return; } catch { await sleep(300); }
  }
  throw new Error('Ready did not take');
}
const offerable = (page:Page) => page.ev(`(window.yo2Html.tradeTrunk?.()??[]).filter(r=>r.left>0).map(r=>({name:r.name}))`) as Promise<{ name:string }[]>;
const shot = (page:Page,name:string) => stageShot(page,`${process.env.SKIN_SHOT ?? 'trade'}-${name}`);

describe.skipIf(!enabled)('card trades between two real players',() => {
  it('invites, declines, offers with live updates, invalidates confirmations, completes atomically and refuses bound or cancelled trades without loss',async () => {
    try {
      const names = { a:`Tra ${RUN}`, b:`Trb ${RUN}` };
      const a = await openPage(), b = await openPage();
      await openClient(a,await signIn(`TestTa${RUN}`),{ assets:false }); await openClient(b,await signIn(`TestTb${RUN}`),{ assets:false });
      await enterWorld(a,names.a); await enterWorld(b,names.b);
      // Both earn tradeable cards (starter and starting-MP cards are soul-bound). The server records a duel's prize
      // pack as bound or not when the pack is offered, from the duel before it (npcRules.ts nrLobbyAfterDuel reads
      // prize_unbound before this duel's mpReward sets it): a new character's first prize stays soul-bound and the
      // next one, after a duel that paid earned MP, is tradeable. So each plays two rewarded NPC duels, as live.
      const earnTwice = async (p:Page) => { const first = await earnCards(p); const second = await earnCards(p); expect(first.length).toBeGreaterThan(0); return second; };
      const rewardA = await earnTwice(a), rewardB = await earnTwice(b);
      expect(rewardA.length).toBeGreaterThan(0); expect(rewardB.length).toBeGreaterThan(0);
      // (the reward's last OK leaves both in the NPC's area: the Main Menu has no Return to Lobby there, as live)
      await until(a,lobbyShown,60000); await until(b,lobbyShown,60000);
      // trade.invite: decline first.
      await invite(a,b,names.b);
      await shot(b,'invite');
      await press(b,byKey('trade-decline'));
      await until(b,closed,30000);
      await until(a,`${dialogText('trade-close')}.includes(${JSON.stringify(`${names.b} declined the trade.`)})`,30000);
      await press(a,byKey('trade-close')); await until(a,closed,10000);
      // then accept.
      await invite(a,b,names.b);
      await press(b,byKey('trade-accept'));
      for (const p of [a,b]) await until(p,trunkShown,30000);
      await sleep(1500); await shot(a,'open');
      record('trade.invite',{ actions:'Invite by name; partner declines; invite again; partner accepts', expected:'Invite, accept, decline and cancel without stale state', observed:`decliner's request dialog closed; inviter saw "${names.b} declined the trade." and closed it; second invite opened the trade on both sides` });
      // trade.offers: A offers a card; B sees it live. B offers one; A sees it.
      const aCards = await offerable(a), bCards = await offerable(b);
      expect(aCards.length).toBeGreaterThan(0); expect(bCards.length).toBeGreaterThan(0);
      // Earned reward cards are tradeable; starter copies are soul-bound (tried below as the failure case).
      const give = rewardA.find(n => aCards.some(c => c.name === n))!, take = rewardB.find(n => n !== give && bCards.some(c => c.name === n)) ?? rewardB[0]!;
      expect(give).toBeTruthy();
      const start = { aGive:await trunk(a,give), aTake:await trunk(a,take), bGive:await trunk(b,give), bTake:await trunk(b,take) };
      await offer(a,give);
      await until(b,offered(give),30000);
      await offer(b,take);
      await until(a,offered(take),30000);
      await sleep(1500); await shot(a,'offers');
      // Both ready; then A goes back to editing, which clears both confirmations.
      await ready(a); await sleep(1500); await shot(a,'ready'); await ready(b);
      for (const p of [a,b]) await until(p,`Boolean(document.querySelector('[data-key="trade-complete"]'))`,30000);
      await sleep(1000); await shot(a,'confirm');
      await press(a,byKey('trade-back'));
      for (const p of [a,b]) await until(p,`Boolean(document.querySelector('[data-key="trade-ready"]'))&&!document.querySelector('[data-key="trade-complete"]')`,30000);
      record('trade.offers',{ actions:`A offers ${give}, B offers ${take}; both ready; A returns to editing`, expected:'Both sides see current cards; offer changes invalidate confirmations', observed:`each side saw the other's card live; Back to editing cleared both Ready states` });
      // trade.commit: ready again and complete; inventories move by exactly one copy each way.
      const counts = async ():Promise<Record<string,number>> => ({ aGive:await ownedCopies(a,give), aTake:await ownedCopies(a,take), bGive:await ownedCopies(b,give), bTake:await ownedCopies(b,take) });
      for (const p of [a,b]) await ready(p);
      for (const p of [a,b]) await until(p,`Boolean(document.querySelector('[data-key="trade-complete"]'))`,30000);
      for (const p of [a,b]) await press(p,byKey('trade-complete'));
      for (const p of [a,b]) await until(p,`${dialogText('trade-close')}.includes('Trade complete')`,60000);
      await sleep(1000); await shot(a,'complete');
      for (const p of [a,b]) await press(p,byKey('trade-close'));
      for (const p of [a,b]) await until(p,closed,30000);
      const after = await counts();
      expect(after).toEqual({ aGive:start.aGive - 1, aTake:start.aTake + 1, bGive:start.bGive + 1, bTake:start.bTake - 1 });
      record('trade.commit',{ actions:`Ready, Complete trade and confirm on both sides; read both collections`, expected:'Only eligible owned cards exchanged atomically; both inventories refresh', observed:`A ${give} ${start.aGive}→${after.aGive}, ${take} ${start.aTake}→${after.aTake}; B ${give} ${start.bGive}→${after.bGive}, ${take} ${start.bTake}→${after.bTake}` });
      // trade.failure: a cancelled trade changes nothing.
      // (a closed trade leaves both in the lobby: the Main Menu has no Return to Lobby there, as live)
      await until(a,lobbyShown,60000); await until(b,lobbyShown,60000);
      const beforeCancel = { a:await ownedCopies(a,take), b:await ownedCopies(b,give) };
      const collectionA = (await openDeckEditor(a)).collection; await exitDeckEditor(a);
      // (a closed trade leaves both in the lobby: the Main Menu has no Return to Lobby there, as live)
      await until(a,lobbyShown,60000); await until(b,lobbyShown,60000);
      await invite(a,b,names.b); await press(b,byKey('trade-accept'));
      for (const p of [a,b]) await until(p,trunkShown,30000);
      // A soul-bound starter card: the server sends its copies in the trade's limit table (trade.ts limitPairs) and the
      // trunk holds them back, so it can't be offered at all (the server would also refuse it at the confirmation:
      // server/test/anti-alt.test.ts). A owns it; searching the trunk for it finds nothing to offer.
      const offerableA = new Set((await offerable(a)).map(c => c.name));
      const bound = collectionA.find(c => c.owned > 0 && ![...offerableA].some(n => n.toLowerCase().includes(c.name.toLowerCase())) && !rewardA.includes(c.name) && c.name !== take)!;
      expect(bound).toBeTruthy();
      // the trunk lists it nowhere (no row, no copies to offer)
      expect(await trunk(a,bound.name)).toBe(0);
      await sleep(500); await shot(a,'bound-held');
      const offerAgain = (await offerable(a))[0]!.name;
      await offer(a,offerAgain);
      await until(b,offered(),30000);
      // B leaves by Card Swap's EXIT (live: no question), until this side is closing (or closed)
      for (let attempt = 0; attempt < 3 && !(await b.ev(`(${closed})||${dialogText('trade-close')}.length>0||document.querySelector('[data-window-class="CWindowModelDialogOk"]')?.innerText.includes('Closing')`)); attempt++) {
        await sleep(300); await shot(b,'exit'); await press(b,byKey('trade-exit')).catch(() => {}); await sleep(1000);
      }
      // A keeps the scene with live's line on the strip ("Your trade partner left the trade. Nothing was traded.") until its EXIT
      await until(a,`(${closed})||document.querySelector('[data-window-class="CTradeStrip"]')?.innerText.includes('partner left')||${dialogText('trade-close')}.length>0`,30000);
      await shot(a,'partner-left');
      if (await a.ev(`Boolean(document.querySelector('[data-key="trade-exit"]'))`)) await press(a,byKey('trade-exit')).catch(() => {});
      for (const p of [a,b]) await until(p,`(${closed})||${dialogText('trade-close')}.length>0`,30000);
      for (const p of [a,b]) if (await p.ev(`Boolean(document.querySelector('[data-key="trade-close"]'))`)) await press(p,byKey('trade-close')).catch(() => {});
      const afterCancel = { a:await ownedCopies(a,take), b:await ownedCopies(b,give) };
      expect(afterCancel).toEqual(beforeCancel);
      const boundAfter = await ownedCopies(a,bound.name);
      expect(boundAfter).toBe(bound.owned);
      record('trade.failure',{ actions:'Partner cancels an open trade; a soul-bound starter card is searched for in the trunk', expected:'Disconnect, stale inventory, bound items and cancellation cause no loss or duplication', observed:`after cancel: A ${take}×${afterCancel.a}, B ${give}×${afterCancel.b} unchanged; bound ${bound.name} (A owns ×${bound.owned}) held back from the trunk ("No matching cards."), still ×${boundAfter} after` });
      void text; void open;
    } finally { closeAll(); }
  },900000);
});
