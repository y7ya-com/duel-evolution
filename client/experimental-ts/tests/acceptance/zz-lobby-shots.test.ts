// SCRATCH (not committed): the rewrite's lobby / select / avatar windows at 1024 x 768 game size for side-by-sides.
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { RUN, enabled, openPage, closeAll, signIn, openClient, click, until, press, type, byKey, sleep, createCharacter, characterSlot, claimStarter, lobbyShown } from './harness';
const OUT = process.env.SHOTS_OUT || `${process.env.HOME}/.cache/de-scratch/lobby/rw`;
const ONLY = (process.env.SHOTS_ONLY || 'select,lobby,delete').split(',');
type P = Awaited<ReturnType<typeof openPage>>;
async function shot(page: P, name: string) {
  mkdirSync(OUT, { recursive: true });
  const r = await page.ev(`(()=>{const s=document.querySelector('.de-stage').getBoundingClientRect();return {x:s.x,y:s.y,w:s.width,h:s.height};})()`) as { x: number; y: number; w: number; h: number };
  const res = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.w, height: r.w * 0.75, scale: 1024 / r.w } });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.result.data, 'base64'));
}
const move = async (page: P, gx: number, gy: number) => {
  const p = await page.ev(`(()=>{const s=document.querySelector('.de-stage').getBoundingClientRect();return {x:s.x+${gx}*s.width/1024,y:s.y+${gy}*s.width/1024};})()`) as { x: number; y: number };
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
};
const htmlText = (t: string) => `[...document.querySelectorAll('#htmlui-host *')].find(e=>e.children.length===0&&e.textContent.trim()===${JSON.stringify(t)})`;
describe.skipIf(!enabled)('scratch shots', () => {
  it('shots', async () => {
    const name = `TestLb${RUN.slice(-6)}`, cookies = await signIn(name), page = await openPage(1100, 900);
    try {
      await openClient(page, cookies); await click(page, 'Go Online', 60000);
      const me = `Lob ${RUN.slice(-5)}`;
      await createCharacter(page, me);
      if (ONLY.includes('select')) { await move(page, 300, 650); await sleep(2500); await shot(page, 'select-idle'); await move(page, 636, 344); await sleep(3500); await shot(page, 'select-hover'); }
      if (ONLY.includes('delete')) {
        const doomed = `Del ${RUN.slice(-5)}`; await createCharacter(page, doomed);
        const slot = await page.ev(`(${characterSlot(doomed)})?.dataset.key.split(':')[1]`) as string;
        await press(page, byKey(`character-delete:${slot}`)); await until(page, byKey('character-delete-password'), 10000); await sleep(800); await shot(page, 'del-prompt');
        await type(page, byKey('character-delete-password'), 'wrongpass'); await sleep(300); await shot(page, 'del-typed');
        await press(page, byKey('character-delete-password-ok')); await until(page, byKey('dialog-ok'), 30000); await sleep(800); await shot(page, 'del-wrong'); await press(page, byKey('dialog-ok'));
      }
      if (ONLY.includes('lobby')) {
        await press(page, characterSlot(me));
        if (process.env.AVATAR_EDITOR) { await until(page, byKey('avatar-confirm'), 60000); await sleep(3000); await shot(page, 'avatar'); }
        await until(page, lobbyShown, 60000); await claimStarter(page); await sleep(3000);
        await shot(page, 'lobby');
        await press(page, byKey('menubar-duel')); await until(page, byKey('duel-create'), 10000); await sleep(800); await shot(page, 'duel-menu');
        await press(page, byKey('duel-create')); await until(page, byKey('room-ok'), 10000); await sleep(800); await shot(page, 'duel-create');
        await press(page, byKey('room-match')); await sleep(500); await shot(page, 'duel-create-match');
        await press(page, byKey('room-cancel')); await until(page, byKey('duel-auto'), 10000);
        await press(page, byKey('duel-auto')); await until(page, byKey('find-ok'), 10000); await sleep(800); await shot(page, 'duel-find');
        await press(page, byKey('find-cancel')); await until(page, byKey('duel-cancel'), 10000); await press(page, byKey('duel-cancel'));
        await press(page, byKey('menubar-move')); await until(page, byKey('move-close'), 10000); await sleep(800); await shot(page, 'move');
        await press(page, byKey('move-close'));
        await press(page, byKey('plist-search')); await until(page, htmlText('Show all'), 10000); await sleep(800); await shot(page, 'findmenu');
        await page.ev(`(${htmlText('Show all')}).closest('button').click()`); await sleep(800); await shot(page, 'plist-all');
        const npc = await page.ev(`(window.__deApp?.getState().lobby?.avatars??[]).find(a=>a.npc)?.id`) as number | undefined;
        if (npc !== undefined) { await page.ev(`document.querySelector('[data-key="avatar:${npc}"]')?.click()`); await until(page, `document.querySelector('button[data-key="npc-talk:next"],[data-key="npc-start:yes"]')`, 10000); await sleep(800); await shot(page, 'npc-card'); }
      }
    } finally { closeAll(); }
  }, 600000);
});
