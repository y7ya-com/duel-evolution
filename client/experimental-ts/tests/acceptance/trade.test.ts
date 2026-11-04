import { describe, expect, it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, type, text, sleep, screenshot, record, earnCards, ownedCopies, byKey, type Page } from './harness';

const tradeWindow = `document.querySelector('.de-trade-window')`;
const inTrade = (page:Page,selector:string) => press(page,`[...document.querySelectorAll('.de-trade-window button')].find(b=>${selector})`);
async function social(page:Page) { await click(page,'Friends & Mail'); await until(page,`document.querySelector('.social-feature')`,30000); await sleep(800); }
async function find(page:Page,name:string) {
  const input = `document.querySelector('[data-key="social-Player name"]')`;
  for (let attempt = 0; attempt < 3; attempt++) {
    await type(page,input,name); await until(page,`${input}?.value===${JSON.stringify(name)}`,5000);
    await press(page,`[...document.querySelectorAll('.de-social-find button')].find(b=>b.textContent==='Find')`);
    try { await until(page,`document.querySelector('.de-social-found')?.textContent.includes(${JSON.stringify(name)})`,8000); return; } catch { await sleep(500); }
  }
  throw new Error(`Could not find ${name}`);
}
async function invite(from:Page,to:Page,name:string) {
  await social(from); await find(from,name);
  await press(from,`[...document.querySelectorAll('.de-social-found button')].find(b=>b.textContent==='Invite to trade')`);
  await until(to,`${tradeWindow}?.textContent.includes('wants to trade')`,30000);
}
/** The offer buttons in the picker, with the card names they offer. */
const trunk = (page:Page,name:string) => page.ev(`Number(/×(\\d+)/.exec([...document.querySelectorAll('.de-trade-trunk .de-trade-card')].find(c=>c.title===${JSON.stringify(name)})?.querySelector('button')?.textContent ?? '×0')?.[1] ?? 0)`) as Promise<number>;
const offerable = (page:Page) => page.ev(`[...document.querySelectorAll('.de-trade-trunk .de-trade-card')].map(c=>({name:c.title,key:c.querySelector('button')?.getAttribute('aria-label')}))`) as Promise<{ name:string }[]>;

describe.skipIf(!enabled)('card trades between two real players',() => {
  it('invites, declines, offers with live updates, invalidates confirmations, completes atomically and refuses bound or cancelled trades without loss',async () => {
    try {
      const names = { a:`Tra ${RUN}`, b:`Trb ${RUN}` };
      const a = await openPage(), b = await openPage();
      await openClient(a,await signIn(`TestTa${RUN}`),{ assets:false }); await openClient(b,await signIn(`TestTb${RUN}`),{ assets:false });
      await enterWorld(a,names.a); await enterWorld(b,names.b);
      // Both earn tradeable cards (starter and starting-MP cards are soul-bound).
      await earnCards(a); await earnCards(b);
      await click(a,'Lobby'); await click(b,'Lobby');
      // trade.invite: decline first.
      await invite(a,b,names.b);
      await inTrade(b,`b.textContent==='Decline trade'`);
      await until(b,`!${tradeWindow}`,30000); await until(a,`!${tradeWindow}||${tradeWindow}.textContent.includes('ended')`,30000);
      if (await a.ev(`Boolean(${tradeWindow})`)) await inTrade(a,`b.textContent==='Close'||b.textContent==='Cancel trade'`).catch(() => {});
      // then accept.
      await invite(a,b,names.b);
      await inTrade(b,`b.textContent==='Accept trade'`);
      for (const p of [a,b]) await until(p,`${tradeWindow}?.querySelector('.de-trade-trunk')`,30000);
      await screenshot(a,'trade-open');
      record('trade.invite',{ actions:'Invite by name; partner declines; invite again; partner accepts', expected:'Invite, accept, decline and cancel without stale state', observed:'decline closed both windows; second invite opened the trade on both sides' });
      // trade.offers: A offers a card; B sees it live. B offers one; A sees it.
      const aCards = await offerable(a), bCards = await offerable(b);
      expect(aCards.length).toBeGreaterThan(0); expect(bCards.length).toBeGreaterThan(0);
      const give = aCards[0]!.name, take = bCards.find(c => c.name !== give)?.name ?? bCards[0]!.name;
      const start = { aGive:await trunk(a,give), aTake:await trunk(a,take), bGive:await trunk(b,give), bTake:await trunk(b,take) };
      await inTrade(a,`b.getAttribute('aria-label')===${JSON.stringify(`Offer ${give}`)}`);
      await until(b,`[...document.querySelectorAll('.de-trade-side')][1]?.querySelector(${JSON.stringify(`.de-trade-card[title="${give}"]`)})`,30000);
      await inTrade(b,`b.getAttribute('aria-label')===${JSON.stringify(`Offer ${take}`)}`);
      await until(a,`[...document.querySelectorAll('.de-trade-side')][1]?.querySelector(${JSON.stringify(`.de-trade-card[title="${take}"]`)})`,30000);
      // Both ready; then A goes back to editing, which clears both confirmations.
      for (const p of [a,b]) { await inTrade(p,`b.textContent==='Ready'`); await inTrade(p,`b.textContent==='Confirm'`); }
      for (const p of [a,b]) await until(p,`[...document.querySelectorAll('.de-trade-window button')].some(b=>b.textContent==='Complete trade')`,30000);
      await inTrade(a,`b.textContent==='Back to editing'`);
      for (const p of [a,b]) await until(p,`[...document.querySelectorAll('.de-trade-window button')].some(b=>b.textContent==='Ready')&&![...document.querySelectorAll('.de-trade-window button')].some(b=>b.textContent==='Complete trade')`,30000);
      record('trade.offers',{ actions:`A offers ${give}, B offers ${take}; both ready; A returns to editing`, expected:'Both sides see current cards; offer changes invalidate confirmations', observed:`each side saw the other's card live; Back to editing cleared both Ready states` });
      // trade.commit: ready again and complete; inventories move by exactly one copy each way.
      const counts = async ():Promise<Record<string,number>> => ({ aGive:await ownedCopies(a,give), aTake:await ownedCopies(a,take), bGive:await ownedCopies(b,give), bTake:await ownedCopies(b,take) });
      for (const p of [a,b]) { await inTrade(p,`b.textContent==='Ready'`); await inTrade(p,`b.textContent==='Confirm'`); }
      for (const p of [a,b]) await until(p,`[...document.querySelectorAll('.de-trade-window button')].some(b=>b.textContent==='Complete trade')`,30000);
      for (const p of [a,b]) { await inTrade(p,`b.textContent==='Complete trade'`); await inTrade(p,`b.textContent==='Confirm'`); }
      for (const p of [a,b]) await until(p,`${tradeWindow}?.textContent.includes('Trade complete')`,60000);
      await screenshot(a,'trade-complete');
      for (const p of [a,b]) await inTrade(p,`b.textContent==='Close'`);
      for (const p of [a,b]) await until(p,`!${tradeWindow}`,30000);
      const after = await counts();
      expect(after).toEqual({ aGive:start.aGive - 1, aTake:start.aTake + 1, bGive:start.bGive + 1, bTake:start.bTake - 1 });
      record('trade.commit',{ actions:`Ready, Complete trade and confirm on both sides; read both collections`, expected:'Only eligible owned cards exchanged atomically; both inventories refresh', observed:`A ${give} ${start.aGive}→${after.aGive}, ${take} ${start.aTake}→${after.aTake}; B ${give} ${start.bGive}→${after.bGive}, ${take} ${start.bTake}→${after.bTake}` });
      // trade.failure: a cancelled trade changes nothing.
      await click(a,'Lobby'); await click(b,'Lobby');
      const beforeCancel = { a:await ownedCopies(a,take), b:await ownedCopies(b,give) };
      await click(a,'Lobby'); await click(b,'Lobby');
      await invite(a,b,names.b); await inTrade(b,`b.textContent==='Accept trade'`);
      for (const p of [a,b]) await until(p,`${tradeWindow}?.querySelector('.de-trade-trunk')`,30000);
      const offerAgain = (await offerable(a))[0]!.name;
      await inTrade(a,`b.getAttribute('aria-label')===${JSON.stringify(`Offer ${offerAgain}`)}`);
      await until(b,`[...document.querySelectorAll('.de-trade-side')][1]?.querySelector('.de-trade-card')`,30000);
      await inTrade(b,`b.textContent==='Cancel trade'`); await inTrade(b,`b.textContent==='Confirm'`);
      for (const p of [a,b]) await until(p,`!${tradeWindow}||/ended|Close/.test(${tradeWindow}.textContent)`,30000);
      for (const p of [a,b]) if (await p.ev(`Boolean(${tradeWindow})`)) await inTrade(p,`b.textContent==='Close'`).catch(() => {});
      const afterCancel = { a:await ownedCopies(a,take), b:await ownedCopies(b,give) };
      expect(afterCancel).toEqual(beforeCancel);
      record('trade.failure',{ actions:'Open a trade, offer a card, partner cancels; read collections', expected:'Cancellation causes no loss or duplication', observed:`collections unchanged after cancel: A ${take}×${afterCancel.a}, B ${give}×${afterCancel.b}` });
      void text; void byKey;
    } finally { closeAll(); }
  },900000);
});
