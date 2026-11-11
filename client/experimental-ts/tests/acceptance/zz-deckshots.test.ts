import { describe, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, sleep, type Page } from './harness';
const OUT = process.env.DECK_SHOTS ?? '/home/y7ya/.cache/de-scratch/deck/rewrite';
async function stage(page:Page) { return page.ev(`(()=>{const r=document.querySelector('.de-stage').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}})()`) as Promise<{x:number;y:number;w:number;h:number}>; }
async function shot(page:Page,name:string) {
  const r = await stage(page); await mouse(page,'mouseMoved',2,2); await sleep(1500);
  const out = await page.send('Page.captureScreenshot',{ format:'png',clip:{ x:r.x,y:r.y,width:r.w,height:r.w*0.75,scale:1024/r.w } }) as { result:{ data:string } };
  mkdirSync(OUT,{ recursive:true }); writeFileSync(`${OUT}/${name}.png`,Buffer.from(out.result.data,'base64'));
  writeFileSync(`${OUT}/${name}.json`,JSON.stringify(await page.ev('window.yo2Html.deckState()'),null,1));
}
async function mouse(page:Page,type:string,x:number,y:number) { const r = await stage(page), k = r.w/1024; await page.send('Input.dispatchMouseEvent',{ type,x:r.x+x*k,y:r.y+y*k,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1 }); }
async function gclick(page:Page,x:number,y:number) { await mouse(page,'mouseMoved',x,y); await sleep(150); await mouse(page,'mousePressed',x,y); await sleep(120); await mouse(page,'mouseReleased',x,y); await sleep(500); }
async function drag(page:Page,[x0,y0]:[number,number],[x1,y1]:[number,number]) { await mouse(page,'mouseMoved',x0,y0); await sleep(150); await mouse(page,'mousePressed',x0,y0); for (let i=1;i<=8;i++) { await mouse(page,'mouseMoved',x0+(x1-x0)*i/8,y0+(y1-y0)*i/8); await sleep(60); } await mouse(page,'mouseReleased',x1,y1); await sleep(800); }
describe.skipIf(!enabled)('deck shots',() => {
  it('captures the deck editor states',async () => {
    try {
      const page = await openPage(1100,1000);
      await openClient(page,await signIn(`TestDs${RUN}`)); await enterWorld(page,`Ds ${RUN}`);
      await click(page,'Edit Deck'); await until(page,`window.yo2Html?.deckState?.()?.main?.length>0 && document.querySelector('[data-window-class="CWindowModelKaban"]')`,60000); await sleep(3000);
      console.log('stage',JSON.stringify(await stage(page)));
      await shot(page,'01-full');
      await gclick(page,780,340); await shot(page,'02-detail-monster');
      await gclick(page,780,452); await shot(page,'03-detail-spell');
      await page.ev(`(()=>{const i=document.querySelector('.dk-field');i.focus();i.value='Mask';i.dispatchEvent(new Event('input',{bubbles:true}));})()`); await sleep(1500); await shot(page,'04-search');
      await page.ev(`(()=>{const i=document.querySelector('.dk-field');i.value='';i.dispatchEvent(new Event('input',{bubbles:true}));i.blur();})()`); await sleep(800);
      await page.ev(`document.querySelector('.dk-btn').click()`); await sleep(800); await shot(page,'05-filters'); await page.ev(`document.querySelector('.dk-btn').click()`); await sleep(500);
      await drag(page,[270,130],[490,650]); await shot(page,'06-side');
      await gclick(page,540,70); await shot(page,'07-fusion'); await gclick(page,340,70);
      await gclick(page,60,80); await sleep(800); await shot(page,'08-files');
      await page.ev(`document.querySelector('[data-key="deck-files-cancel"]')?.click()`); await sleep(500);
      await gclick(page,60,134); await sleep(500); await page.ev(`document.querySelector('[data-key="deck-dialog-yes"]')?.click()`); await sleep(1200); await shot(page,'09-empty');
      writeFileSync(`${OUT}/console.txt`, (page as unknown as { logs:string[] }).logs.join('\n'));
    } finally { closeAll(); }
  },400000);
});
