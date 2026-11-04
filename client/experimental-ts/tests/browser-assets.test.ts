import { describe, expect, it } from 'vitest';
import { writeFile, readFile } from 'node:fs/promises';
import { browserServerFixture } from './browser-server-fixture';
import { launch } from '../../web-shell/htmlui/tools/cdp.mjs';
import { parseWorldMaps } from '../src/world/maps';
import { findPath } from '../src/world/pathfinding';
import { Hub } from '../../../server/src/game/hub';

type Browser = Awaited<ReturnType<typeof launch>>;
/** Release CDP evaluation handles so instrumentation cannot retain detached button/scene closures. */
async function evaluate(browser:Browser,expression:string) {
  const result = await browser.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,objectGroup:'asset-smoke'});
  try {
    if (result.result?.exceptionDetails) throw new Error(JSON.stringify(result.result.exceptionDetails));
    return result.result?.result?.value;
  } finally { await browser.send('Runtime.releaseObjectGroup',{objectGroup:'asset-smoke'}); }
}
async function until(browser:Browser,condition:string,timeout=60000) {
  const started = Date.now();
  while (Date.now()-started < timeout) {
    if (await evaluate(browser,`Boolean(${condition})`)) return;
    await new Promise(resolve => setTimeout(resolve,50));
  }
  throw new Error(`Asset browser condition timed out: ${condition}\n${await evaluate(browser,'document.body.innerText')}\n${await evaluate(browser,`JSON.stringify([...document.querySelectorAll('canvas')].map(canvas=>({...canvas.dataset})))`)}\n${browser.logs.join('\n')}`);
}
async function click(browser:Browser,text:string) {
  const selector = `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled&&b.getClientRects().length)`;
  // Main Menu entries (Lobby, Disconnect...) are reached through the menu bar's Menu key, as a player would.
  const entry = `(document.querySelector('.de-main-menu')?.hidden&&[...document.querySelectorAll('.de-main-menu button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled))`;
  await until(browser,`${selector}||${entry}`);
  if (!await evaluate(browser,`Boolean(${selector})`)) { await evaluate(browser,`document.querySelector('[data-key="main-menu"]').click()`); await until(browser,selector); }
  const point = await evaluate(browser,`(async()=>{let b=${selector};b.scrollIntoView({block:'center',behavior:'instant'});await new Promise(requestAnimationFrame);b=${selector};if(!b)return null;const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return hit&&(hit===b||b.contains(hit))?{x,y}:null})()`);
  if (!point) throw new Error(`Asset browser button is obstructed: ${text}`);
  const down = browser.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
  const up = browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  await down; await up;
}
const readyMap = `document.querySelector('.de-world-view[data-map-ready="true"]')&&[...document.querySelectorAll('.de-world-image')].some(image=>image.complete&&image.naturalWidth>0)`;
async function sample(browser:Browser) {
  await browser.send('HeapProfiler.collectGarbage');
  // Allow Blink's native DOM sweep to follow V8 collection before taking a second sample.
  await evaluate(browser,`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))`);
  await browser.send('HeapProfiler.collectGarbage');
  const metrics = await browser.send('Performance.getMetrics');
  const dom = await browser.send('Memory.getDOMCounters');
  const audit = await evaluate(browser,`({created:window.__assetAudit.created,revoked:window.__assetAudit.revoked,live:window.__assetAudit.live.size,peak:window.__assetAudit.peak,revokedWhileAttached:window.__assetAudit.revokedWhileAttached,liveBitmaps:window.__assetAudit.liveBitmaps,peakBitmaps:window.__assetAudit.peakBitmaps,images:document.images.length,worldImages:document.querySelectorAll('.de-world-image').length,broken:[...document.images].filter(i=>i.src.startsWith('blob:')&&i.complete&&!i.naturalWidth).length})`);
  return { ...audit,heap:metrics.result.metrics.find((m:{name:string})=>m.name==='JSHeapUsedSize').value,...dom.result };
}

// Explicit opt-in: the ordinary gameplay suite never downloads original media.
describe.skipIf(!process.env.YO2_ASSET_URL)('optional real original-asset browser evidence',() => {
  it('decodes original world/card media, moves through the real server and releases resources over 30 scene cycles',async () => {
    const fixture = await browserServerFixture({assetBaseUrl:process.env.YO2_ASSET_URL,initialDeck:{main:[89631139],extra:[]}});
    let browser:Browser|undefined;
    try {
      // Negative control is refused locally, before any upstream archive body can be read.
      expect((await fetch(fixture.origin+'/game-assets/merge.dat')).status).toBe(400);
      browser = await launch({port:22000+process.pid%15000,width:1280,height:900});
      await browser.send('Performance.enable');
      await browser.send('Page.enable');
      await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{try{localStorage.setItem('de-client-settings-v1',JSON.stringify({reducedMotion:true,sound:0,music:0}));}catch{};window.confirm=()=>true;const audit=window.__assetAudit={created:0,revoked:0,live:new Set(),peak:0,revokedWhileAttached:0,liveBitmaps:0,peakBitmaps:0};const nativeDecode=window.createImageBitmap.bind(window);window.createImageBitmap=(...args)=>nativeDecode(...args).then(bitmap=>{audit.liveBitmaps++;audit.peakBitmaps=Math.max(audit.peakBitmaps,audit.liveBitmaps);const close=bitmap.close.bind(bitmap);let closed=false;bitmap.close=()=>{if(!closed){closed=true;audit.liveBitmaps--;}return close();};return bitmap;});const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=value=>{const url=create(value);audit.created++;audit.live.add(url);audit.peak=Math.max(audit.peak,audit.live.size);return url;};URL.revokeObjectURL=url=>{if([...document.images].some(image=>image.getAttribute('src')===url))audit.revokedWhileAttached++;audit.revoked++;audit.live.delete(url);return revoke(url);};})()`});
      await browser.go(fixture.origin+'/?portOffset=0&assets=/game-assets/',`document.querySelector('.de-client')`);
      await click(browser,'Go Online'); await until(browser,`document.querySelector('[data-key^="character-create:"]')`); await click(browser,'Create Player'); await until(browser,`document.querySelector('[data-key="character-name"]')`);
      await evaluate(browser,`(()=>{const input=document.querySelector('[data-key="character-name"]');input.value='Asset Duelist';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await click(browser,'OK');
      await until(browser,`[...document.querySelectorAll('[data-key^="character-slot:"]')].some(b=>b.textContent.includes('Asset Duelist')&&!b.disabled)`);
      // A real mouse selects the newly persisted character; no controller dispatch is injected.
      const character = await evaluate(browser,`(()=>{const b=[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes('Asset Duelist'));const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      const down = browser.send('Input.dispatchMouseEvent',{type:'mousePressed',...character,button:'left',clickCount:1});
      const up = browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',...character,button:'left',clickCount:1}); await down; await up;
      await until(browser,readyMap);
      const mapId = await evaluate(browser,`Number(document.querySelector('.de-world-view').dataset.mapId)`);
      const initialImages = await evaluate(browser,`document.querySelectorAll('.de-world-image').length`);
      expect(initialImages).toBeGreaterThan(0);
      expect(await evaluate(browser,`[...document.querySelectorAll('.de-world-image')].every(i=>i.complete&&i.naturalWidth>0&&i.naturalHeight>0)`)).toBe(true);
      await writeFile('/tmp/duel-ts-original-assets-world.png',await browser.shot());

      // Select a nearby reachable direction from the original generated collision grid.
      const maps = parseWorldMaps(JSON.parse(await readFile(new URL('../public/world-maps.json',import.meta.url),'utf8')));
      const map = maps.maps.find(map=>map.id===mapId)!;
      const serverPlayer = [...fixture.gameServer.game.hub.sessions.values()][0];
      const position = () => { const pos=serverPlayer.pos; if(!pos)return{x:0,y:0}; const data=new DataView(pos.buffer,pos.byteOffset,pos.byteLength); return{x:data.getUint16(4),y:data.getUint16(6)}; };
      const before = position();
      const verifyMovement = async () => {
      const directions = [{key:'ArrowRight',code:39,x:32,y:0},{key:'ArrowLeft',code:37,x:-32,y:0},{key:'ArrowDown',code:40,x:0,y:32},{key:'ArrowUp',code:38,x:0,y:-32}];
      const direction = directions.find(d=>map.grid&&findPath(map.grid,before,{x:before.x+d.x,y:before.y+d.y}));
      expect(direction,'Original spawn must have a reachable nearby destination').toBeDefined();
      await evaluate(browser,`document.querySelector('canvas[aria-label="Lobby map"]').focus()`);
      await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:direction!.key,code:direction!.key,windowsVirtualKeyCode:direction!.code});
      await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:direction!.key,code:direction!.key,windowsVirtualKeyCode:direction!.code});
      for (let attempt=0;attempt<100&&position().x===before.x&&position().y===before.y;attempt++) await new Promise(r=>setTimeout(r,50));
      expect(position()).not.toEqual(before);

      };

      // This is an editor/resource test with one known original preview card, not a duel legality test.
      const cycle = async () => {
        await click(browser!,'Edit Deck'); await until(browser!,`document.querySelector('[data-key="collection-search"]')`);
        await evaluate(browser!,`(()=>{const input=document.querySelector('[data-key="collection-search"]');input.value='89631139';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        await until(browser!,`[...document.querySelectorAll('.de-card img')].some(i=>i.complete&&i.naturalWidth>0&&i.src.startsWith('blob:'))`);
        await click(browser!,'Lobby'); await until(browser!,readyMap);
      };
      const settleAssets = async () => {
        const started = Date.now();
        while (fixture.activeAssetRequests || Date.now()-fixture.lastAssetActivity < 300) {
          if (Date.now()-started > 20000) throw new Error('Original asset requests did not quiesce before the memory baseline');
          await new Promise(resolve=>setTimeout(resolve,50));
        }
      };
      for (let warm=0;warm<3;warm++) { await cycle(); await settleAssets(); }
      const baseline = await sample(browser);
      const checkpoints = [];
      for (let cycleIndex=0;cycleIndex<30;cycleIndex++) { await cycle(); if ((cycleIndex+1)%10===0) checkpoints.push({cycle:cycleIndex+1,...await sample(browser)}); }
      const final = checkpoints.at(-1)!;
      const browserVersion = (await browser.send('Browser.getVersion')).result.product;
      const detached = await browser.send('DOM.getDetachedDomNodes');
      await writeFile('/tmp/duel-ts-original-assets-detached.json',JSON.stringify(detached.result ?? detached,null,2));
      const reads = fixture.assetRequests.filter(request=>request.status===206);
      const evidence = {browserVersion,cycles:30,mapId,initialImages,avatarDecoded:false,movement:{before,after:position()},baseline,checkpoints,rangeRequests:reads.length,rangeBytes:reads.reduce((sum,r)=>sum+r.bytes,0),disposal:null as {live:number;liveBitmaps:number;revokedWhileAttached:number;persisted:boolean}|null,limitations:'Fixture auth/deck HTTP; JS heap and DOM/object URL measurements only. GPU memory and production authentication are not measured.'};
      await writeFile('/tmp/duel-ts-original-assets-evidence.json',JSON.stringify(evidence,null,2));
      expect(final.revokedWhileAttached,'No object URL may be revoked while an attached image still references it').toBe(0);
      expect(final.broken).toBe(0);
      expect(final.worldImages).toBeLessThanOrEqual(768);
      expect(final.live).toBeLessThanOrEqual(baseline.live+8);
      expect(final.liveBitmaps).toBeLessThanOrEqual(baseline.liveBitmaps+4);
      expect(final.nodes).toBeLessThan(baseline.nodes+1500);
      expect(final.heap).toBeLessThan(baseline.heap+32*1024*1024);
      expect(final.documents).toBeLessThanOrEqual(baseline.documents+1);
      expect(final.jsEventListeners).toBeLessThanOrEqual(baseline.jsEventListeners+32);
      expect(reads.length).toBeGreaterThan(0);
      for (const read of reads) {
        expect(read.range).toMatch(/^bytes=\d+-\d+$/); expect(read.bytes).toBeGreaterThan(0); expect(read.bytes).toBeLessThanOrEqual(32*1024*1024);
      }
      expect(fixture.assetRequests.filter(request=>request.status===200)).toEqual([]);
      expect(browser.logs.filter((line:string)=>line.startsWith('exception:'))).toEqual([]);

      await verifyMovement(); evidence.movement.after = position();
      await writeFile('/tmp/duel-ts-original-assets-evidence.json',JSON.stringify(evidence,null,2));
      await until(browser,`document.querySelector('canvas[data-avatar-ready="true"][data-avatar-painted="true"]')`,30000); evidence.avatarDecoded = true;
      await click(browser,'Disconnect'); await until(browser,`[...document.querySelectorAll('button')].some(b=>b.textContent==='Go Online')`);
      // A synchronous same-origin storage witness survives destruction of the old CDP context.
      // Register after the app's listener, then reload to require a real non-BFCache pagehide.
      await evaluate(browser,`sessionStorage.removeItem('de-asset-disposal');window.addEventListener('pagehide',event=>sessionStorage.setItem('de-asset-disposal',JSON.stringify({live:window.__assetAudit.live.size,liveBitmaps:window.__assetAudit.liveBitmaps,revokedWhileAttached:window.__assetAudit.revokedWhileAttached,persisted:event.persisted})));true`);
      const reload = await browser.send('Page.reload',{ignoreCache:true}); expect(reload.error).toBeUndefined();
      await until(browser,`sessionStorage.getItem('de-asset-disposal')!==null`,10000);
      evidence.disposal = await evaluate(browser,`JSON.parse(sessionStorage.getItem('de-asset-disposal'))`);
      expect(evidence.disposal).toEqual({live:0,liveBitmaps:0,revokedWhileAttached:0,persisted:false});
      await writeFile('/tmp/duel-ts-original-assets-evidence.json',JSON.stringify(evidence,null,2));
      // The server deliberately retains closed account identities for SESSION_RELEASE_S; only live channels matter.
      for (let attempt=0;attempt<100&&[...fixture.gameServer.game.hub.sessions.values()].some(session=>Hub.live(session));attempt++) await new Promise(resolve=>setTimeout(resolve,20));
      expect([...fixture.gameServer.game.hub.sessions.values()].some(session=>Hub.live(session))).toBe(false);
      expect(serverPlayer.block).toBeNull();
    } finally {
      if (browser) { await writeFile('/tmp/duel-ts-original-assets-last.png',await browser.shot().catch(()=>Buffer.alloc(0))); browser.close(); }
      await fixture.close();
    }
  },240000);
});
