import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, until, sleep, screenshot, record, startNpcDuel, duelBot, surrender, closeUnlocks } from './harness';

/** In the page, per animation frame (on change): the visual timeline's state (window.__deApp, dev builds), the LP the
 * plates show, and the end's pieces (the app's result, the YOU WIN / YOU LOSE banner or movie, the dim, the result board). */
const PROBE = `(()=>{window.__sync=[];let last='';const t0=performance.now();const loop=()=>{try{const a=window.__deApp,s=a?.timeline?.sample?.(),d=a?.getState?.().duel;
  const lp=[...document.querySelectorAll('.de-lp-value')].map(n=>n.textContent).join('/');
  const row={pending:!!s?.pending,q:s?.queuedBatches??0,slp:s?s.lp.join('/'):'',lp,ended:d?.ended??'',
    banner:!!document.querySelector('.de-duel-end:not(.de-sr),.de-duel-end-movie'),dim:!!document.querySelector('.de-result-dim'),
    board:!!document.querySelector('#htmlui-host .win[data-window-class="CWindowResult"],#htmlui-host .win[data-window-class="CWindowResultNpc"]'),
    next:!!document.querySelector('[data-key="duel-result-next"]'),notice:!!document.querySelector('#htmlui-host .win[data-window-class="CUOkDialog"]'),
    log:(d?.log??[]).length,lastLog:(d?.log??[]).at(-1)??'',fx:document.querySelector('.de-duel-fx')?.dataset.active??''};
  const k=JSON.stringify(row);if(k!==last){last=k;window.__sync.push({t:Math.round(performance.now()-t0),...row});if(window.__sync.length>4000)window.__sync.shift();}}catch(e){window.__syncErr=String(e);}requestAnimationFrame(loop);};requestAnimationFrame(loop);})()`;

const OUT = process.env.DUEL_SYNC_OUT;
type Row = { t:number; pending:boolean; q:number; lp:string; ended:string; banner:boolean; dim:boolean; board:boolean; next:boolean; notice:boolean };
/** The duel's end comes after the board has played everything before it (live's engine plays each command's effect
 * before it reads the next): the last attack, the LP counting to 0. With motion on: an NPC beats a player who never
 * plays (its last direct attack and the LP count), and a surrender (the LP drop to 0). */
describe.skipIf(!enabled)('the duel end waits for its animations',() => {
  for (const mode of (process.env.DUEL_SYNC_MODES ?? 'lose,surrender').split(',')) it(`shows the result only once the board has played everything (${mode})`,async () => {
    try {
      const page = await openPage(1024,768); await openClient(page,await signIn(`TestSy${mode.slice(0,2)}${RUN}`),{ settings:{ reducedMotion:false } });
      await enterWorld(page,`Sy${mode.slice(0,2)} ${RUN}`);
      await closeUnlocks(page);
      await startNpcDuel(page,'Yami Yugi');
      await until(page,`document.querySelectorAll('.de-field-card').length>5`,60000);
      await page.ev(PROBE);
      let shot = false;
      const start = Date.now();
      if (mode === 'surrender') {
        await sleep(3000); await surrender(page);
      }
      while (Date.now() - start < 600000) {
        if (await page.ev(`!!document.querySelector('[data-key="duel-result-next"]')`)) break;
        if (!shot && await page.ev(`!!window.__deApp.getState().duel?.ended`)) { shot = true; await screenshot(page,`sync-${mode}-ended`); }
        if (mode === 'lose') await duelBot(page,{ attack:false, summon:false }); else await duelBot(page);
        await sleep(150);
      }
      await sleep(1500);
      await screenshot(page,`sync-${mode}-board`);
      const rows = JSON.parse(await page.ev(`JSON.stringify(window.__sync)`) as string) as Row[];
      if (OUT) { mkdirSync(OUT,{ recursive:true }); writeFileSync(`${OUT}/${process.env.DUEL_SYNC_TAG ?? 'run'}-${mode}.json`,JSON.stringify(rows,null,0).replace(/\},\{/g,'},\n{')); }
      expect(await page.ev(`window.__syncErr??''`)).toBe('');
      const end = rows.find(r => r.ended || r.banner || r.dim || r.board), board = rows.find(r => r.board);
      const lastPending = rows.filter(r => r.pending).at(-1);
      expect(end,'the end was seen').toBeTruthy(); expect(board,'the result board was seen').toBeTruthy();
      // the end's first frame: the board idle, the loser's LP counted to 0 (the player's, both ways here)
      expect(end!.pending).toBe(false); expect(end!.q).toBe(0);
      expect(end!.lp.split('/')[0]).toBe('0');
      expect(end!.t).toBeGreaterThanOrEqual(lastPending?.t ?? 0);
      record('duel.end-sync',{ actions:`NPC duel with motion on, ${mode === 'lose' ? 'the player never plays until the NPC wins' : 'surrender on the first turn'}`,
        expected:'The result (banner, board) only after the last attack and the LP counting to 0 have played',
        observed:`timeline last busy at ${lastPending?.t ?? '-'} ms, end at ${end!.t} ms (LP ${end!.lp}), board at ${board!.t} ms` });
    } finally { closeAll(); }
  },900000);
});
