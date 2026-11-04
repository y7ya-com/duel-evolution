import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { launch } from '../../web-shell/htmlui/tools/cdp.mjs';
import { createRemoteAssetMiddleware } from '../tools/remote-assets.mjs';

type Browser = Awaited<ReturnType<typeof launch>>;
async function evaluate(browser: Browser, expression: string): Promise<any> {
  const response = await browser.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, objectGroup: 'world-physics' });
  try {
    if (response.result?.exceptionDetails) throw new Error(JSON.stringify(response.result.exceptionDetails));
    return response.result?.result?.value;
  } finally { await browser.send('Runtime.releaseObjectGroup', { objectGroup: 'world-physics' }); }
}
async function viteModule(): Promise<any> {
  for (const packagePath of ['../package.json', '../../web-shell/htmlui/package.json', '../../../server/package.json']) {
    try {
      const require = createRequire(new URL(packagePath, import.meta.url));
      const entry = resolve(dirname(require.resolve('vite/package.json')), 'dist/node/index.js');
      return await import(pathToFileURL(entry).href);
    } catch { /* Try the next existing development dependency installation. */ }
  }
  throw new Error('Install the existing Vite development dependency before running this opt-in test.');
}

// Explicit opt-in: ordinary test runs neither launch Chromium nor access original archives.
describe.skipIf(!process.env.YO2_ASSET_URL)('optional real-mask Chromium world physics', () => {
  it('decodes actual masks, verifies source foot safety/exits and releases bounded streamed resources', async () => {
    const root = resolve(import.meta.dirname, '..'), maps = await readFile(resolve(root, 'public/world-maps.json'));
    const ranges: { range: string; status: number; bytes: number }[] = [], localPaths: string[] = [];
    let activeRequests = 0;
    const remote = createRemoteAssetMiddleware({ baseUrl: process.env.YO2_ASSET_URL, forwardValidators: true, maxRangeBytes: 8 * 1024 * 1024 });
    const { createServer } = await viteModule();
    const server = await createServer({ configFile: false, root, publicDir: false, appType: 'custom',
      optimizeDeps: { noDiscovery: true, include: [] }, server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { strict: true, allow: [root] } },
      plugins: [{ name: 'world-physics-harness', configureServer(vite: any) {
        vite.middlewares.use((req: any, res: any, next: () => void) => {
          if (localPaths.length < 1000) localPaths.push(req.url ?? '');
          if ((req.url ?? '').startsWith('/game-assets/')) {
            activeRequests++; let done = false;
            const finish = () => { if (!done) { done = true; activeRequests--; } };
            res.once('close', finish); res.once('finish', finish);
            res.once('finish', () => {
              const match = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '');
              ranges.push({ range: req.headers.range ?? '', status: res.statusCode, bytes: res.statusCode === 206 && match ? Number(match[2]) - Number(match[1]) + 1 : 0 });
            });
            remote(req, res, next); return;
          }
          if (req.url === '/__world_harness__') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><title>World physics check</title><main id="world-harness">Original mask physics check</main>'); return; }
          if (req.url === '/__world_maps__.json') { res.setHeader('Content-Type', 'application/json'); res.setHeader('Content-Length', maps.length); res.end(maps); return; }
          next();
        });
      } }],
    });
    let browser: Browser | undefined;
    try {
      await server.listen(); const address = server.httpServer.address();
      const origin = `http://127.0.0.1:${address.port}`;
      expect((await fetch(origin + '/game-assets/merge.dat')).status).toBe(400);
      // Existing launcher performs the shared memory guard; never bypass it.
      browser = await launch({ port: 39000 + process.pid % 10000, width: 1024, height: 768 });
      await browser.send('Performance.enable');
      await browser.go(origin + '/__world_harness__', 'document.querySelector("#world-harness")');
      await browser.send('HeapProfiler.collectGarbage');
      const before = (await browser.send('Runtime.getHeapUsage')).result.usedSize;
      const result = await evaluate(browser, String.raw`(async()=>{
        const need=(ok,message)=>{if(!ok)throw new Error(message);};
        const {AssetManager}=await import('/src/assets/index.ts');
        const {WorldRuntime}=await import('/src/world/runtime.ts');
        const {WorldNavigator,WORLD_TICK_MS}=await import('/src/world/navigator.ts');
        const {parseWorldMaps}=await import('/src/world/maps.ts');
        const {parseSceneTable,sceneTilePath,SCENE_TABLE_PATH}=await import('/src/world/scene-format.ts');
        const {decodeCollisionMask}=await import('/src/world/collision.ts');
        const maps=parseWorldMaps(await(await fetch('/__world_maps__.json')).json());
        const audit={created:0,revoked:0,liveUrls:new Set(),liveBitmaps:0,peakBitmaps:0,liveLeases:0,peakLeases:0};
        const createUrl=URL.createObjectURL.bind(URL),revokeUrl=URL.revokeObjectURL.bind(URL),nativeBitmap=createImageBitmap.bind(window);
        URL.createObjectURL=blob=>{const url=createUrl(blob);audit.created++;audit.liveUrls.add(url);return url;};
        URL.revokeObjectURL=url=>{if(audit.liveUrls.delete(url))audit.revoked++;return revokeUrl(url);};
        window.createImageBitmap=(...args)=>nativeBitmap(...args).then(bitmap=>{audit.liveBitmaps++;audit.peakBitmaps=Math.max(audit.peakBitmaps,audit.liveBitmaps);const close=bitmap.close.bind(bitmap);let active=true;bitmap.close=()=>{if(active){active=false;audit.liveBitmaps--;}return close();};return bitmap;});
        const assets=new AssetManager({baseUrl:'/game-assets/',cacheBytes:16*1024*1024,limits:{concurrency:2}});
        const leased={readScene:async(path,signal)=>{const lease=await assets.readScene(path,signal);audit.liveLeases++;audit.peakLeases=Math.max(audit.peakLeases,audit.liveLeases);let active=true;return{value:lease.value,release(){if(active){active=false;audit.liveLeases--;lease.release();}}};}};
        const runtime=new WorldRuntime({assets:leased,maxRetainedPixels:4*1024*1024,maxTiles:8,concurrency:2});
        let navigator=null,oracleLease=null,independentBitmap=null,oracleCanvas=null;
        try{
          const table=await leased.readScene(SCENE_TABLE_PATH);let definitions;try{definitions=parseSceneTable(table.value.bytes);}finally{table.release();}
          const room=maps.maps.find(m=>m.name==='Map_r01');need(room,'Original room map absent');
          const roomDefinition=definitions.get(room.name);need(roomDefinition.columns===1&&roomDefinition.rows===1,'Expected original single-tile room mask');
          oracleLease=await leased.readScene(sceneTilePath(roomDefinition,0,0,true));
          independentBitmap=await createImageBitmap(new Blob([oracleLease.value.bytes],{type:'image/png'}),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
          oracleCanvas=document.createElement('canvas');oracleCanvas.width=independentBitmap.width;oracleCanvas.height=independentBitmap.height;
          const context=oracleCanvas.getContext('2d',{willReadFrequently:true});need(context,'Independent readable canvas missing');context.drawImage(independentBitmap,0,0);
          const rgba=context.getImageData(0,0,oracleCanvas.width,oracleCanvas.height).data,width=oracleCanvas.width,height=oracleCanvas.height;
          independentBitmap.close();independentBitmap=null;oracleCanvas.width=oracleCanvas.height=0;oracleCanvas=null;
          need(width===roomDefinition.width&&height===roomDefinition.height,'Collision logical/natural geometry mismatch');
          const pixel=(x,y)=>{x=Math.trunc(x);y=Math.trunc(y);if(x<0||y<0||x>=width||y>=height)return 0xff000000;const i=(y*width+x)*4;return((rgba[i+3]<<24)|(rgba[i]<<16)|(rgba[i+1]<<8)|rgba[i+2])>>>0;};
          const exits=[0xff0000ff,0xff00ffff,0xff6400ff,0xff0064ff],wall=c=>c===0xff000000||exits.includes(c);
          // Independent source root/probe arithmetic, with no runtime.canPublish/footGeometry call.
          const safe=(p,d)=>{const sign=d>=5?-1:1;for(let n=0;n<16;n++){const a=n*Math.fround(.39269909),x=Math.fround(sign*(Math.fround(Math.cos(a)*20+40)-46)+p.x),y=Math.fround(Math.fround(Math.sin(a)*20+116)-116+p.y);if(wall(pixel(x,y)))return false;}return true;};
          const decoded=await decodeCollisionMask(oracleLease.value.bytes);let compared=0;const histogram=new Map();
          for(let y=0;y<height;y++)for(let x=0;x<width;x++){const color=pixel(x,y);histogram.set(color,(histogram.get(color)||0)+1);if((y*width+x)%509===0||exits.includes(color)){need(decoded.pixel(x,y)===color,'RGBA/ARGB decoding disagreement');compared++;}}
          oracleLease.release();oracleLease=null;
          let walk=null,mirror=null,wallPosition=null;
          const vectors=[{x:1,y:0,d:6},{x:-1,y:0,d:2},{x:0,y:1,d:0},{x:0,y:-1,d:4}];
          for(let y=32;y<height-32&&(!walk||!mirror||!wallPosition);y+=4)for(let x=32;x<width-32;x+=4){
            const p={x,y};const normal=safe(p,0),flipped=safe(p,6);
            if(!mirror&&normal!==flipped)mirror={p,normal,flipped};
            if(!wallPosition&&!normal&&!flipped)wallPosition=p;
            if(!walk&&normal&&flipped)for(const v of vectors){let clear=true;for(let n=1;n<=48;n++){if(!safe({x:x+v.x*n,y:y+v.y*n},v.d)){clear=false;break;}}if(clear){walk={start:{x,y,direction:v.d},target:{x:x+v.x*48,y:y+v.y*48},v};break;}}
            if(walk&&mirror&&wallPosition)break;
          }
          need(walk&&mirror&&wallPosition,'Real room mask did not provide required free corridor/mirror boundary/wall samples');
          await runtime.load({...room,grid:null},walk.start);
          need(runtime.canPublish({...mirror.p,direction:0})===mirror.normal,'Normal foot boundary mismatch');
          need(runtime.canPublish({...mirror.p,direction:6})===mirror.flipped,'Mirrored foot boundary mismatch');
          need(!runtime.canPublish({...wallPosition,direction:0}),'Real wall accepted as publishable');
          const sent=[];navigator=new WorldNavigator({physics:runtime,send:p=>sent.push(p)});navigator.reset({...room,grid:null},walk.start);
          need(navigator.moveTo(walk.target),'Real clear corridor was rejected');let ticks=0;
          while(navigator.moving&&ticks++<180){navigator.update(WORLD_TICK_MS);await Promise.resolve();}
          need(!navigator.moving&&Math.hypot(navigator.position.x-walk.target.x,navigator.position.y-walk.target.y)<1e-6,'Clear corridor did not complete');
          need(sent.length>5,'No meaningful physical movement emitted');let previous=walk.start,maxSegment=0;
          for(const p of sent){need(safe(p,p.direction),'Published foot probes overlap a real wall/exit');const length=Math.hypot(p.x-previous.x,p.y-previous.y);need(length<8,'Movement teleported');maxSegment=Math.max(maxSegment,length);previous=p;}
          navigator.dispose();navigator=null;
          // Discover valid pre-step positions adjacent to actual colored exits; no stored rectangles or authored coordinates.
          const observedExits=new Map();
          for(let y=0;y<height;y++)for(let x=0;x<width;x++){
            const color=pixel(x,y),index=exits.indexOf(color);if(index<0||observedExits.has(index))continue;
            for(const v of vectors){const offset=v.d>=5?6:-6,p={x:x-v.x*26-offset,y:y-v.y*26,direction:v.d};if(!safe(p,v.d))continue;
              const r=runtime.step(p,v,{x:v.x*6,y:v.y*6});
              if(r.exit){need(r.wallHit,'Exit without physical wall hit');need(r.exit.color===exits[r.exit.index],'Unexpected reported exit color');need(r.exit.destination===room.entries[r.exit.index]?.from,'Exit mapped to an arrival coordinate instead of entry destination');observedExits.set(r.exit.index,r.exit.destination);break;}
            }
          }
          need(observedExits.size>=1,'No actual source exit could be reached from independently clear foot probes');
          const world=maps.maps.find(m=>m.id===0);need(world,'Original world map0 absent');
          const entry=world.entries.find(e=>e.from===8)||world.entries[0];need(entry,'Original source arrival absent');
          await runtime.load(world,entry);const definition=runtime.definition;
          const far={x:definition.width-64,y:definition.height-64,direction:0};
          const waiting=runtime.step(far,{x:1,y:0},{x:4,y:0});need(waiting.waiting&&!waiting.moved&&waiting.position.x===far.x&&waiting.step.x===4,'Unloaded real tiles did not pause transaction');
          await runtime.prepare(far);need(!runtime.step(far,{x:1,y:0},{x:4,y:0}).waiting,'Prepared real tile stayed unavailable');
          let maxPixels=runtime.status.retainedPixels,maxTiles=runtime.status.loadedTiles;
          for(let cycle=0;cycle<10;cycle++){await runtime.load(cycle%2?world:{...room,grid:null},cycle%2?entry:walk.start);maxPixels=Math.max(maxPixels,runtime.status.retainedPixels);maxTiles=Math.max(maxTiles,runtime.status.loadedTiles);need(runtime.status.retainedPixels<=4*1024*1024&&runtime.status.loadedTiles<=8,'Runtime retention exceeded configured budget');need(audit.liveLeases===0,'Completed load retained encoded leases');}
          need(runtime.status.pendingTiles===0,'Completed loads retained pending tile jobs');
          need(audit.liveBitmaps===0,'Native decoder bitmap remained live');
          const evidence={dimensions:{width,height},comparedPixels:compared,colors:[...histogram].map(([argb,count])=>({argb,count})),heightRegions:{red:histogram.get(0xffff0000)||0,other:width*height-(histogram.get(0xffff0000)||0)},movement:{ticks,packets:sent.length,maxSegment,allPublishedFootProbesClear:true},mirrorBoundaryVerified:true,observedExitDestinations:[...observedExits].map(([index,destination])=>({index,destination})),streaming:{waited:true,resumed:true},cycles:10,maxPixels,maxTiles,peakBitmaps:audit.peakBitmaps,peakLeases:audit.peakLeases,cacheBytes:assets.cacheBytes};
          runtime.dispose();assets.dispose();
          need(runtime.status.retainedPixels===0&&runtime.status.loadedTiles===0,'Runtime masks retained after disposal');
          need(audit.liveLeases===0&&audit.liveBitmaps===0&&audit.liveUrls.size===0&&audit.created===audit.revoked,'Asset/native resource accounting did not close');
          need(audit.peakBitmaps<=2&&audit.peakLeases<=4,'Read/decode concurrency exceeded expected bounded pipeline');
          evidence.disposal={liveLeases:audit.liveLeases,liveBitmaps:audit.liveBitmaps,liveUrls:audit.liveUrls.size,created:audit.created,revoked:audit.revoked};
          return evidence;
        }finally{navigator?.dispose();oracleLease?.release();independentBitmap?.close();if(oracleCanvas)oracleCanvas.width=oracleCanvas.height=0;runtime.dispose();assets.dispose();URL.createObjectURL=createUrl;URL.revokeObjectURL=revokeUrl;window.createImageBitmap=nativeBitmap;}
      })()`);
      await browser.send('HeapProfiler.collectGarbage');
      await evaluate(browser, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
      await browser.send('HeapProfiler.collectGarbage');
      const after = (await browser.send('Runtime.getHeapUsage')).result.usedSize;
      expect(after - before).toBeLessThan(16 * 1024 * 1024);
      expect(browser.logs.filter(line => line.startsWith('exception:'))).toEqual([]);
      const completed = ranges.filter(r => r.status === 206), rangeBytes = completed.reduce((n, r) => n + r.bytes, 0);
      expect(activeRequests).toBe(0); expect(completed.length).toBeGreaterThan(4); expect(rangeBytes).toBeLessThan(32 * 1024 * 1024);
      expect(completed.every(r => /^bytes=\d+-\d+$/.test(r.range) && r.bytes <= 8 * 1024 * 1024)).toBe(true);
      expect(localPaths.some(path => /\/api\/|\/net\/|\.wasm/.test(path))).toBe(false);
      const evidence = { browserVersion: (await browser.send('Browser.getVersion')).result.product, ...result,
        rangeRequests: completed.length, rangeBytes, heapGrowthBytes: after - before,
        scope: 'Real original PNG collision decode, source-derived foot geometry and bounded browser runtime only; no game authority, outcome, full-world reachability, exact native trajectory or GPU-memory parity claim.' };
      await writeFile('/tmp/duel-ts-world-browser-evidence.json', JSON.stringify(evidence, null, 2));
      console.log('Original mask browser evidence:', JSON.stringify(evidence));
    } finally { browser?.close(); await server.close(); }
  }, 120_000);
});
