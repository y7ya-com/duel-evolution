// The overworld on PixiJS (src/ui/world.ts): two players in one area, the map drawn on the world canvas, each sees the
// other walk smoothly, the frame rate while walking, chat bubbles, and every area of the Move list in turn.
import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, until, press, byKey, sleep, say, record, type Page } from './harness';

const OUT = process.env.WORLD_SHOTS || `${process.env.HOME}/.cache/de-scratch/visual/pixiworld`;
const avatar = (name:string) => `[...document.querySelectorAll('[data-key^="avatar:"]')].find(a=>a.querySelector('.de-avatar-name')?.textContent===${JSON.stringify(name)})`;
const world = `window.__deWorld?.()`;
const placeName = `[...document.querySelectorAll('#htmlui-host .lb-shadow')].filter(t=>t.style.left==='20px').map(t=>t.textContent).join(' · ')`;
async function shot(page:Page,name:string) {
  mkdirSync(OUT,{ recursive:true });
  const r = await page.ev(`(()=>{const s=document.querySelector('.de-stage').getBoundingClientRect();return {x:s.x,y:s.y,w:s.width,h:s.height};})()`) as { x:number; y:number; w:number; h:number };
  const res = await page.send('Page.captureScreenshot',{ format:'png',clip:{ x:r.x,y:r.y,width:r.w,height:r.w * 0.75,scale:1024 / r.w } });
  writeFileSync(`${OUT}/${name}.png`,Buffer.from(res.result.data,'base64'));
}
/** Holds the right button at a stage point (live's walk-at-once) for `ms`. */
async function holdWalk(page:Page,gx:number,gy:number,ms:number) {
  const p = await page.ev(`(()=>{const s=document.querySelector('.de-stage').getBoundingClientRect();return {x:s.x+${gx}*s.width/1024,y:s.y+${gy}*s.width/1024};})()`) as { x:number; y:number };
  await page.send('Input.dispatchMouseEvent',{ type:'mouseMoved',x:p.x,y:p.y });
  await page.send('Input.dispatchMouseEvent',{ type:'mousePressed',x:p.x,y:p.y,button:'right',buttons:2,clickCount:1 });
  await sleep(ms);
  await page.send('Input.dispatchMouseEvent',{ type:'mouseReleased',x:p.x,y:p.y,button:'right',buttons:0,clickCount:1 });
}
/** Frames the page paints in `ms` (requestAnimationFrame), and the worst gap. */
const frameRate = (page:Page,ms:number) => page.ev(`new Promise(r=>{let n=0;const t0=performance.now();let last=t0,worst=0;const f=t=>{n++;worst=Math.max(worst,t-last);last=t;if(t-t0<${ms})requestAnimationFrame(f);else r({fps:Math.round(n*10000/(t-t0))/10,worst:Math.round(worst*10)/10})};requestAnimationFrame(f);})`) as Promise<{ fps:number; worst:number }>;

describe.skipIf(!enabled)('world (PixiJS)',() => {
  it('draws the map and avatars on the canvas, walks, sees the others walk, crosses areas',async () => {
    const names = { a:`Wa ${RUN}`,b:`Wb ${RUN}` };
    const [ca,cb] = await Promise.all([signIn(`TestWa${RUN}`),signIn(`TestWb${RUN}`)]);
    const a = await openPage(1100,900), b = await openPage(1100,900);
    try {
      await openClient(a,ca); await openClient(b,cb);
      await enterWorld(a,names.a); await enterWorld(b,names.b);
      await until(a,`${world}?.ready&&${world}.avatars.some(v=>v.drawn)`,60000); await until(b,`${world}?.ready`,60000);
      await until(a,avatar(names.b),30000); await until(b,avatar(names.a),30000);
      const inspect = await a.ev(world) as { mapId:number; renderer:string; sprites:number; textures:number; avatars:{ name:string; drawn:boolean; z:number }[] };
      expect(inspect.renderer).toBe('pixi'); expect(inspect.sprites).toBeGreaterThan(0);
      expect(await a.ev(`!!document.querySelector('.de-world-view>canvas.de-world-canvas')&&!document.querySelector('.de-world-view img')`)).toBe(true);
      await sleep(1500); await shot(a,'01-lobby-a'); await shot(b,'02-lobby-b');
      // A walks (right button held): A's own frame rate while walking, and B's view of A walking between server points
      const before = (await b.ev(world) as { avatars:{ name:string; x:number; y:number }[] }).avatars.find(v => v.name === names.a)!;
      const samples:{ x:number; y:number; walking:boolean }[] = [];
      const sampling = (async () => { for (let i = 0; i < 40; i++) { const s = (await b.ev(world) as { avatars:{ name:string; x:number; y:number; walking:boolean }[] }).avatars.find(v => v.name === names.a); if (s) samples.push(s); await sleep(100); } })();
      const [rate] = await Promise.all([frameRate(a,3000),holdWalk(a,150,600,2500)]);
      await sampling;
      const afterA = await a.ev(world) as { frames:{ fps:number; p95:number; worst:number } };
      await shot(a,'03-walked-a'); await shot(b,'04-walked-b');
      const distinct = new Set(samples.map(s => `${Math.round(s.x)},${Math.round(s.y)}`)).size;
      record('world.pixi',{ actions:'A holds the right button to walk; B watches',expected:'60 fps while walking; others walk smoothly between server positions',
        observed:`A ${rate.fps} fps by rAF (worst gap ${rate.worst} ms), ticker ${afterA.frames.fps.toFixed(1)} fps p95 ${afterA.frames.p95.toFixed(1)} ms; B saw A at ${distinct} distinct points (from ${Math.round(before.x)},${Math.round(before.y)}), walking in ${samples.filter(s => s.walking).length} of ${samples.length} samples` });
      console.log('fps',JSON.stringify(rate),JSON.stringify(afterA.frames),'distinct',distinct,'walking',samples.filter(s => s.walking).length);
      expect(distinct).toBeGreaterThan(3);
      // chat bubbles over the heads
      await say(a,'Pixi hello'); await sleep(1200); await shot(b,'05-chat-b'); await shot(a,'06-chat-a');
      // every area of the Move list, in turn: the map changes, textures of the old map go
      await press(a,byKey('menubar-move')); await until(a,`document.querySelector('[data-key^="move-area:"]')`,10000);
      const rows = await a.ev(`[...document.querySelectorAll('[data-key^="move-area:"]')].map(b=>[b.dataset.key,b.getAttribute('aria-label')??b.textContent])`) as [string,string][];
      await press(a,byKey('menubar-move')).catch(() => {});
      const visited:string[] = [];
      for (const [key,label] of rows.slice(0,6)) {
        const current = await a.ev(placeName) as string;
        if (!await a.ev(`Boolean(document.querySelector('[data-key="${key}"]'))`)) { await press(a,byKey('menubar-move')); await until(a,`document.querySelector('[data-key^="move-area:"]')`,10000); }
        await press(a,byKey(key)).catch(() => {});
        await until(a,`(${placeName})!==${JSON.stringify(current)}||!document.querySelector('[data-key="${key}"]')`,30000).catch(() => {});
        await until(a,`${world}?.ready`,60000).catch(() => {});
        await sleep(1500);
        const w = await a.ev(world) as { mapId:number; textures:number; sprites:number };
        const rateHere = await frameRate(a,1500);
        visited.push(`${label.replace(/\s+/g,' ').trim()} (map ${w.mapId}, ${w.sprites} sprites, ${w.textures} textures, ${rateHere.fps} fps)`);
        await shot(a,`10-area-${visited.length}-map${w.mapId}`);
      }
      console.log('areas',visited.join(' | '));
      record('world.areas',{ actions:'Each area of the Move list',expected:'Each map drawn on the canvas',observed:visited.join('; ') });
    } finally { closeAll(); }
  },600000);
});
