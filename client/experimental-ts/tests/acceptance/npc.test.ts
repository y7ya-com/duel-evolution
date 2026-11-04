import { describe, expect, it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, text, sleep, screenshot, record, startNpcDuel, playDuel, ownedCopies, byKey } from './harness';

const npcPanel = `document.querySelector('[aria-label="NPC interaction"]')`;
const fieldCount = (side:'your'|'opponent',zone:string) => `[...document.querySelectorAll('.de-field-card')].filter(b=>(b.getAttribute('aria-label')??'').includes(', ${side} ${zone}')).length`;
const pileCount = (side:0|1,zone:string) => `Number([...document.querySelectorAll('.de-field-card')].find(b=>(b.getAttribute('aria-label')??'').includes(${JSON.stringify(side ? `opponent ${zone}` : `your ${zone}`)}))?.querySelector('.de-card-count')?.textContent ?? -1)`;

describe.skipIf(!enabled)('NPC duels in the real world with the real duel engine',() => {
  it('checks eligibility, starts with the correct field, plays to a natural result, grants rewards once and allows a rematch',async () => {
    try {
      const page = await openPage(); await openClient(page,await signIn(`TestNp${RUN}`));
      await enterWorld(page,`Npc ${RUN}`);
      // npc.start (eligibility): a special NPC refuses a character without its duel right.
      await press(page,`document.querySelector('[data-key="lobby-npcs"] summary')`);
      const npcs = await page.ev(`[...document.querySelectorAll('[data-key="lobby-npcs"] button')].map(b=>b.textContent)`) as string[];
      expect(npcs.length).toBeGreaterThan(0);
      let refusal = 'no special NPC listed in this area';
      if (npcs.includes('Seto Kaiba')) {
        await press(page,`[...document.querySelectorAll('[data-key="lobby-npcs"] button')].find(b=>b.textContent==='Seto Kaiba')`);
        await until(page,npcPanel,20000);
        refusal = (await page.ev(`${npcPanel}.innerText`) as string).replace(/\s+/g,' ').slice(0,160);
        expect(await page.ev(`[...${npcPanel}.querySelectorAll('button')].some(b=>b.textContent==='Duel NPC')`)).toBe(false);
        for (const label of ['Continue','Close NPC']) { await until(page,`[...(${npcPanel}?.querySelectorAll('button') ?? [])].some(b=>b.textContent===${JSON.stringify(label)}&&!b.disabled)`,20000); await press(page,`[...${npcPanel}.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)})`); }
        await until(page,`!${npcPanel}`,20000);
      }
      // A first duel: dialogue, rock-paper-scissors, first player, initial field.
      const before = await ownedCopies(page,'');
      await click(page,'Lobby'); await until(page,byKey('lobby-npcs'),60000);
      await startNpcDuel(page,'Yami Yugi');
      await until(page,`${fieldCount('your','hand')}>=5&&${fieldCount('opponent','hand')}>=5`,60000);
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
      await click(page,'Return to Lobby');
      await until(page,`${npcPanel}?.innerText.includes('Choose a Reward Pack')||${npcPanel}?.querySelector('button')`,60000);
      const packButton = `[...(${npcPanel}?.querySelectorAll('button') ?? [])].find(b=>b.dataset.key?.includes('npcSelectPack')||/^(Pack|Reward)/.test(b.textContent))`;
      let pack = 'no pack offered';
      for (let i = 0; i < 8 && !(await page.ev(`Boolean(${packButton})`)); i++) {
        const cont = `[...(${npcPanel}?.querySelectorAll('button') ?? [])].find(b=>['Continue','Receive Gift'].includes(b.textContent)&&!b.disabled)`;
        if (await page.ev(`Boolean(${cont})`)) await press(page,cont); await sleep(700);
      }
      if (await page.ev(`Boolean(${packButton})`)) {
        pack = await page.ev(`${packButton}.textContent`) as string;
        await press(page,packButton);
        await until(page,`${npcPanel}?.innerText.match(/confirmed|New|card/i)`,60000);
      }
      const receipt = (await page.ev(`${npcPanel}?.innerText ?? ''`) as string).replace(/\s+/g,' ').slice(0,220);
      await screenshot(page,'npc-rewards');
      for (let i = 0; i < 10 && await page.ev(`Boolean(${npcPanel})`); i++) {
        const close = `[...(${npcPanel}?.querySelectorAll('button') ?? [])].find(b=>['Close NPC','Continue','Receive Gift','Refresh Inventory'].includes(b.textContent)&&!b.disabled)`;
        if (await page.ev(`Boolean(${close})`)) await press(page,close); await sleep(700);
      }
      const after = await ownedCopies(page,'');
      expect(after).toBeGreaterThan(before);
      // Granted once: reopening the collection does not change the count again.
      await click(page,'Lobby'); await until(page,byKey('lobby-npcs'),60000);
      const again = await ownedCopies(page,'');
      expect(again).toBe(after);
      record('npc.rewards',{ actions:`Return to lobby after the duel; choose ${pack}; close; reopen the collection twice`, expected:'Rewards and unlocks applied exactly once', observed:`collection ${before} → ${after} copies, unchanged on reload (${again}); dialog: ${receipt}` });
      // Rematch lifecycle: the same NPC accepts another duel.
      await click(page,'Lobby'); await until(page,byKey('lobby-npcs'),60000);
      await startNpcDuel(page,'Yami Yugi');
      await until(page,`${fieldCount('your','hand')}>=5`,60000);
      await click(page,'Surrender');
      const yes = `[...document.querySelectorAll('button')].find(b=>b.dataset.key?.startsWith('prompt-option:')&&b.textContent==='Yes'&&!b.disabled)`;
      await until(page,`${yes}||[...document.querySelectorAll('button')].some(b=>b.textContent==='Return to Lobby')`,30000);
      if (await page.ev(`Boolean(${yes})`)) await press(page,yes);
      await until(page,`[...document.querySelectorAll('button')].some(b=>b.textContent==='Return to Lobby')`,60000);
      const rematch = await page.ev(`document.querySelector('.de-duel-end')?.getAttribute('aria-label')`);
      expect(rematch).toBe('Defeat');
      record('npc.rewards',{ actions:'Rematch the same NPC and surrender', expected:'Rematch lifecycle works', observed:`second duel started and ended by surrender: ${rematch}` });
      void text;
    } finally { closeAll(); }
  },900000);
});
