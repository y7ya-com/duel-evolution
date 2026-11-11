import { describe, expect, it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, text, sleep, screenshot, record, startNpcDuel, playDuel, ownedCopies, surrender, byKey, byText, resultShown, resultNext, claimNpcReward, lobbyShown, listedNames, openNpcCard } from './harness';

const npcPanel = `document.querySelector('[aria-label="NPC interaction"]')`;
const fieldCount = (side:'your'|'opponent',zone:string) => `[...document.querySelectorAll('.de-field-card')].filter(b=>(b.getAttribute('aria-label')??'').includes(', ${side} ${zone}')).length`;
const pileCount = (side:0|1,zone:string) => `Number([...document.querySelectorAll('.de-field-card')].find(b=>(b.getAttribute('aria-label')??'').includes(${JSON.stringify(side ? `opponent ${zone}` : `your ${zone}`)}))?.querySelector('.de-card-count')?.textContent ?? -1)`;

describe.skipIf(!enabled)('NPC duels in the real world with the real duel engine',() => {
  it('checks eligibility, starts with the correct field, plays to a natural result, grants rewards once and allows a rematch',async () => {
    try {
      const page = await openPage(); await openClient(page,await signIn(`TestNp${RUN}`));
      await enterWorld(page,`Npc ${RUN}`);
      // npc.start (eligibility): a special NPC refuses a character without its duel right.
      // the NPCs here: the player list's search, Show all (main's CFindMenu), its rows
      const npcs = await listedNames(page);
      expect(npcs.length).toBeGreaterThan(0);
      let refusal = 'no special NPC listed in this area';
      if (npcs.includes('Seto Kaiba')) {
        await openNpcCard(page,'Seto Kaiba'); await until(page,`[...document.querySelectorAll('[data-key^="npc-duel:"]')].some(b=>!b.disabled)`,30000);
        await press(page,`[...document.querySelectorAll('[data-key^="npc-duel:"]')].find(b=>!b.disabled)`);
        await until(page,npcPanel,20000);
        refusal = (await page.ev(`${npcPanel}.innerText`) as string).replace(/\s+/g,' ').slice(0,160);
        expect(await page.ev(`[...${npcPanel}.querySelectorAll('button')].some(b=>b.textContent==='Duel NPC')`)).toBe(false);
        for (const label of ['Continue','Close NPC']) { await until(page,`[...(${npcPanel}?.querySelectorAll('button') ?? [])].some(b=>b.textContent===${JSON.stringify(label)}&&!b.disabled)`,20000); await press(page,`[...${npcPanel}.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)})`); }
        await until(page,`!${npcPanel}`,20000);
      }
      // A first duel: dialogue, rock-paper-scissors, first player, initial field.
      await startNpcDuel(page,'Yami Yugi');
      // The NPC may already be playing its first turn: judge the opening by our own hand and both decks.
      await until(page,`${fieldCount('your','hand')}>=5&&${pileCount(1,'deck')}>0`,60000);
      await screenshot(page,'npc-start');
      const start = { hand:await page.ev(fieldCount('your','hand')), opponentHand:await page.ev(fieldCount('opponent','hand')), deck:await page.ev(pileCount(0,'deck')), opponentDeck:await page.ev(pileCount(1,'deck')), lp:await page.ev(`[...document.querySelectorAll('.de-lp-value')].map(n=>n.textContent).join('/')`) };
      expect(start.lp).toBe('8,000/8,000');
      expect(Number(start.hand) + Number(start.deck)).toBeGreaterThanOrEqual(40);
      record('npc.start',{ actions:'Special NPC without its right; then Yami Yugi: dialogue, Duel NPC, RPS, first player, start', expected:'Eligibility validated; correct first turn and initial field', observed:`special NPC: ${refusal}; start: hands ${start.hand}/${start.opponentHand}, decks ${start.deck}/${start.opponentDeck}, LP ${start.lp}` });
      // npc.play: an active bot summons, sets and attacks until the duel ends naturally.
      const result = await playDuel(page,{ timeout:420000 });
      await screenshot(page,'npc-end');
      expect(['Victory','Defeat','Draw']).toContain(result);
      const log = await page.ev(`[...document.querySelectorAll('.de-duel-log div')].map(d=>d.textContent)`) as string[];
      expect(log.some(l => / summons | sets a | attacks/.test(l))).toBe(true);
      record('npc.play',{ actions:'Bot plays the full duel through the duel screen (summons, sets, attacks, prompts)', expected:'Full duel with server-issued actions and a win/lose/draw result', observed:`natural result: ${result}; ${log.length} log lines incl. "${log.find(l => / attacks/.test(l)) ?? log.find(l => / summons /.test(l))}"` });
      // npc.rewards: the reward pack is chosen once and its cards reach the collection.
      const reward = await claimNpcReward(page), pack = reward.pack ?? 'no pack offered', received = reward.received, receipt = reward.dialog;
      await screenshot(page,'npc-rewards');
      expect(received.length).toBeGreaterThan(0);
      const card = received[0]!, after = await ownedCopies(page,card);
      expect(after).toBeGreaterThan(0);
      // Granted once: reconnecting and reading the collection again gives the same count.
      await click(page,'Return to Title'); await click(page,'Go Online',60000);
      const slot = `[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes(${JSON.stringify(`Npc ${RUN}`)})&&!b.disabled)`;
      await until(page,slot,60000); await press(page,slot);
      await until(page,lobbyShown,60000);
      const again = await ownedCopies(page,card);
      expect(again).toBe(after);
      record('npc.rewards',{ actions:`Return to lobby after the duel; choose ${pack}; close; read the collection, reconnect, read it again`, expected:'Rewards and unlocks applied exactly once', observed:`received ${received.join(', ')}; ${card} owned ×${after}, still ×${again} after reconnecting; dialog: ${receipt}` });
      // Rematch lifecycle: the same NPC accepts another duel.
      if (await page.ev(resultShown)) await press(page,`${resultNext}??${byText('Return to Lobby')}`);   // the result's Next (in the lobby the Main Menu has no Return to Lobby, as live)
      await until(page,lobbyShown,60000);
      await startNpcDuel(page,'Yami Yugi');
      await until(page,`${fieldCount('your','hand')}>=5`,60000);
      // Surrender: the client's own Yes / No (main's YesNo, surrender-yes), then the server's question when it asks one
      await surrender(page);
      await until(page,resultShown,60000);
      const rematch = await page.ev(`window.__duelEnd()`);
      expect(rematch).toBe('Defeat');
      record('npc.rewards',{ actions:'Rematch the same NPC and surrender', expected:'Rematch lifecycle works', observed:`second duel started and ended by surrender: ${rematch}` });
      void text;
    } finally { closeAll(); }
  },900000);
});
