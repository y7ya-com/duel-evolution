import { describe, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { RUN, enabled, openPage, closeAll, signIn, openClient, click, until, press, sleep, createCharacter, characterSlot, freeSlot, lobbyShown, claimStarter,
  reenterWorld, openDeckEditor, exitDeckEditor, startNpcDuel, surrender, claimNpcReward, CLIENT, type Page } from './harness';

/** Live's 2008 printed faces and wording of the legacy-effect cards (src/cards/era.ts), on screen: the deck screen's card
 * detail and the duel's card information box, with the configuration (after) and without it (?era= naming a page without
 * one: the modern card.dat art, as before). Shots at 1024x768 in ERA_SHOTS; the accounts in accounts.json (live's pair).
 *   ACCEPTANCE_STACK=... ACCEPTANCE_CLIENT=... ERA_SHOTS=<dir> tools/acceptance.sh tests/acceptance/zz-era-shots.test.ts */
const OUT = process.env.ERA_SHOTS ?? '/home/y7ya/.cache/de-scratch/v2r3/era/shots';
async function shot(page:Page,name:string) { mkdirSync(OUT,{ recursive:true }); writeFileSync(`${OUT}/${name}.png`,await page.shot()); }
async function hover(page:Page,selector:string) {
  const p = await page.ev(`(()=>{const e=${selector};if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`) as { x:number; y:number } | null;
  if (!p) throw new Error('not on screen: ' + selector);
  await page.send('Input.dispatchMouseEvent',{ type:'mouseMoved',...p });
  return p;
}
async function pick(page:Page,selector:string) {
  const p = await hover(page,selector); await sleep(150);
  await page.send('Input.dispatchMouseEvent',{ type:'mousePressed',...p,button:'left',buttons:1,clickCount:1 }); await sleep(100);
  await page.send('Input.dispatchMouseEvent',{ type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1 });
}
const deckCard = (pc:number) => `document.querySelector('[data-zone="main"][data-passcode="${pc}"]')`;
/** The deck screen with the card picked: its detail (face and wording). */
async function deckShot(page:Page,pc:number,name:string) {
  await openDeckEditor(page,40); await until(page,deckCard(pc),20000);
  await pick(page,deckCard(pc)); await sleep(2500);
  await page.send('Input.dispatchMouseEvent',{ type:'mouseMoved',x:1010,y:760 }); await sleep(800);
  await shot(page,name);
  const shown = await page.ev(`document.getElementById('htmlui-host')?.innerText.match(/\\[[^\\]]+\\][\\s\\S]{0,400}/)?.[0] ?? ''`);
  writeFileSync(`${OUT}/${name}.txt`,String(shown));
  await exitDeckEditor(page);
}
async function newCharacter(page:Page,name:string,starter:number) {
  await click(page,'Go Online',60000); await until(page,freeSlot,60000);
  await createCharacter(page,name); await press(page,characterSlot(name)); await until(page,lobbyShown,60000);
  await claimStarter(page,starter);
}
async function reload(page:Page,name:string,era:boolean) {
  await page.go(`${CLIENT}/?portOffset=1000&assets=/game-assets/${era ? '' : '&era=/no-era-here'}`,`document.querySelector('.de-client')`);
  await reenterWorld(page,name);
}
describe.skipIf(!enabled)('2008 card faces and wording',() => {
  it.skipIf(!!process.env.ERA_USER)('deck screen card detail, with and without live\'s configuration',async () => {
    const accounts:Record<string,unknown> = {};
    try {
      const page = await openPage(1024,768);
      // Resident of Darkness (8003, the picker's sixth): Sangan and Gateway to Dark World x2, both legacy-effect cards
      const b = `TestEraB${RUN}`, cb = await signIn(b); accounts.sangan = { user:b, character:`EraB ${RUN}`, cookies:cb };
      writeFileSync(`${OUT}/accounts.json`,JSON.stringify(accounts,null,1));
      await openClient(page,cb,{ settings:{ reducedMotion:false } }); await newCharacter(page,`EraB ${RUN}`,5);
      await deckShot(page,26202165,'deck-sangan-v2-after'); await deckShot(page,93431518,'deck-gateway-v2-after');
      await reload(page,`EraB ${RUN}`,false);
      await deckShot(page,26202165,'deck-sangan-v2-before'); await deckShot(page,93431518,'deck-gateway-v2-before');
    } finally { closeAll(); }
  },900000);
  // the duel's hand and information box: ERA_USER / ERA_CHARACTER the first test's character (accounts.json), surrendered
  // and duelled again until a legacy card is in the opening hand; ERA_OFF=1 without the configuration
  it.skipIf(!process.env.ERA_USER)('duel information box, a legacy card in the opening hand',async () => {
    try {
      const page = await openPage(1024,768), name = process.env.ERA_CHARACTER!, off = process.env.ERA_OFF === '1';
      await openClient(page,await signIn(process.env.ERA_USER!),{ settings:{ reducedMotion:false } });
      await reload(page,name,!off);
      // ERA_CARD: the card wanted (a name; default either)
      const want = new RegExp(`^(${process.env.ERA_CARD ?? 'Sangan|Gateway to Dark World'}),`), tag = (process.env.ERA_CARD ?? 'era').split(/\W/)[0]!.toLowerCase();
      const inHand = `[...document.querySelectorAll('.de-field-card[data-zone="hand"][data-side="your"]')].find(e=>${want}.test(e.getAttribute('aria-label')??''))`;
      for (let duel = 0; ; duel++) {
        await startNpcDuel(page,'Yami Yugi'); await sleep(4000);
        if (await page.ev(`Boolean(${inHand})`)) break;
        if (duel >= 9) throw new Error('no legacy card in 10 opening hands');
        await surrender(page); await claimNpcReward(page).catch(() => {});
      }
      await hover(page,inHand); await sleep(3000); const out = `duel-${tag}-v2-${off ? 'before' : 'after'}`; await shot(page,out);
      writeFileSync(`${OUT}/${out}.txt`,String(await page.ev(`document.querySelector('.de-duel-info')?.innerText ?? ''`)));
      await surrender(page); await claimNpcReward(page).catch(() => {});
    } finally { closeAll(); }
  },900000);
});
