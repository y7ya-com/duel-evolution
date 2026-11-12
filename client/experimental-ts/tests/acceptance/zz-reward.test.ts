import { it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, press, sleep, startNpcDuel, playDuel, stageShot, resultShown, resultLeave } from './harness';
it.runIf(enabled)('reward screens', async () => {
  try {
    const page = await openPage(1280, 960); await openClient(page, await signIn(`TestRw${RUN}`));
    await enterWorld(page, `Rw ${RUN}`);
    for (let attempt = 0; attempt < 3; attempt++) {
      await startNpcDuel(page, 'Yami Yugi');
      const result = await playDuel(page, { timeout: 420000 });
      console.log('RESULT', attempt, result);
      let n = 0; const shot = async (tag: string) => stageShot(page, `rw${attempt}-${String(n++).padStart(2, '0')}-${tag}`);
      for (let i = 0; i < 6; i++) { await shot('end'); await sleep(700); }
      const panel = `document.querySelector('[aria-label="NPC interaction"]')`;
      for (let i = 0; i < 40; i++) {
        await shot('step');
        if (await page.ev(resultShown)) { await press(page, resultLeave); await sleep(900); continue; }
        const balloon = `[...document.querySelectorAll('button[data-key="npc-talk:next"]')].find(b=>!b.disabled&&b.getClientRects().length)`;
        if (await page.ev(`Boolean(${balloon})`)) { await press(page, balloon); await sleep(900); continue; }
        const last = `[...document.querySelectorAll('#htmlui-host button[data-key^="prompt-"]')].find(b=>!b.disabled&&b.getClientRects().length)`;
        if (await page.ev(`Boolean(${last})`)) { await press(page, last); await sleep(900); continue; }
        const htmlRow = `document.querySelector('.yo2ps-list .yo2ps-row')`, htmlOk = `document.querySelector('.yo2ps-ok:not([hidden])')`;
        if (await page.ev(`Boolean(${htmlRow})&&Boolean(${htmlOk})`)) { await press(page, htmlRow); await sleep(300); await shot('picked'); await press(page, htmlOk); await sleep(1500); continue; }
        const other = `[...(${panel}?.querySelectorAll('button') ?? [])].find(b=>['Continue','Receive Gift','Close NPC'].includes(b.textContent)&&!b.disabled)`;
        if (await page.ev(`Boolean(${other})`)) { await sleep(1500); await shot('panel'); await press(page, other); await sleep(900); continue; }
        if (i > 8) break; await sleep(900);
      }
      if (result === 'Victory') break;
    }
  } finally { closeAll(); }
}, 1500000);
