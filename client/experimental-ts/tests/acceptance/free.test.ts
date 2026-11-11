import { describe, expect, it } from 'vitest';
import { RUN, CLIENT, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, pressAvatar, type, sleep, screenshot, record, byKey, byText, prepareDuel, duelBot, surrender, ownedCopies, type Page, cardButton, lobbyShown } from './harness';

/** deck.test: the original has no separate deck-test button (PRACTICE.md); deck testing is Free Duel: a free session
 * builds decks from the whole card pool and duels other free players with no MP, record, stats or card offer
 * (server/src/game/freemode.ts). Testing a deck there must leave the world deck, collection and wallet untouched. */
const worldSnapshot = async (page:Page, probe:string) => {
  await click(page,'Edit Deck'); await until(page,byKey('collection-search'),60000); await until(page,byKey('deck-select'),30000); await sleep(800);
  const deck = await page.ev(`({ name:document.querySelector('[data-key="deck-select"]').value, main:[...document.querySelectorAll('[data-key^="deck-card:main:"]')].map(b=>b.title.split(' · ')[0]) })`) as { name:string; main:string[] };
  const owned = await ownedCopies(page,probe);
  await click(page,'Shop'); await until(page,`/[0-9,]+ MP/.test(document.body.innerText)`,60000);
  const wallet = /([0-9,]+) MP/.exec(await page.ev('document.body.innerText') as string)?.[1];
  return { ...deck, owned, wallet };
};
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
      await click(a,'Edit Deck'); await until(a,byKey('collection-search'),60000); await sleep(800);
      await type(a,byKey('collection-search'),probe); await sleep(500);
      const pool = await a.ev(`[...document.querySelectorAll('[data-key^="collection-card:"]')].find(b=>b.title.startsWith(${JSON.stringify(probe + ' ·')}))?.querySelector('.de-card-count')?.textContent ?? ''`) as string;
      const tile = `[...document.querySelectorAll('[data-key^="collection-card:"]')].find(b=>b.title.startsWith(${JSON.stringify(probe + ' ·')}))`;
      await until(a,tile,10000); await press(a,tile); await click(a,`Add ${probe}`,10000); await sleep(500);
      const freeDeck = await a.ev(`[...document.querySelectorAll('[data-key^="deck-card:main:"]')].map(b=>b.title.split(' · ')[0])`) as string[];
      expect(freeDeck).toContain(probe);
      await click(a,'Save'); await sleep(1500);
      await screenshot(a,'free-deck');
      // Duel another free player with that deck, then leave.
      await click(a,'Return to Lobby'); await click(b,'Return to Lobby');
      const other = `[...document.querySelectorAll('[data-key^="avatar:"]')].find(x=>x.querySelector('.de-avatar-name')?.textContent===${JSON.stringify(names.b)})`;
      await until(a,other,60000); await pressAvatar(a,other);
      await until(a,cardButton('Send Duel Request'),10000); await press(a,cardButton('Send Duel Request'));
      await click(b,'Accept Duel',60000);
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
      record('deck.test',{ actions:`World snapshot; Free Duel & Deck Editor; add ${probe} (not owned; pool shows ${pool}) to a free deck and save; free PvP duel to turn 10 and surrender; back to World mode`, expected:'Start and leave supported deck testing without spending cards or altering the saved deck',
        observed:`free deck held ${probe}; ${deckInDuel} cards on the free duel field; result ${result}; world deck "${after.name}" unchanged (${after.main.length} main), ${probe} owned ×${after.owned} before and after, wallet ${after.wallet} MP unchanged` });
      void CLIENT;
    } finally { closeAll(); }
  },600000);
});
