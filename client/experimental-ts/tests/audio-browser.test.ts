import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import ts from '../../../server/node_modules/typescript/lib/typescript.js';
import { launch } from '../../web-shell/htmlui/tools/cdp.mjs';
import { it } from 'vitest';
import { resolve } from 'node:path';
const browserIt = process.env.AUDIO_BROWSER_SMOKE === '1' ? it : it.skip;
browserIt('round-trips local audio through real Chromium IndexedDB and gesture playback', async () => {
const root = resolve(import.meta.dirname, '../src');
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/') { res.end('<button id="enable">Enable audio</button>'); return; }
  if (!/^\/(features\/(audio|audio-storage)|assets\/(archive|async|lzss))$/.test(path)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('content-type', 'application/javascript'); res.end(ts.transpileModule(readFileSync(root + path + '.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
let browser;
try {
  browser = await launch({ port: 9700 + process.pid % 1000 });
  await browser.go(`http://127.0.0.1:${server.address().port}/`, 'document.querySelector("#enable")');
  const result = await browser.ev(`(async()=>{
    const {BrowserAudioManager}=await import('/features/audio');
    const {IndexedDBAudioStorage}=await import('/features/audio-storage');
    const adapter=new IndexedDBAudioStorage(indexedDB,'audio-cancellation-smoke');
    const cancellation=new AbortController();await adapter.read(cancellation.signal);
    const pendingWrite=adapter.write({version:1,music:1,sound:1,slots:[]},cancellation.signal);
    await Promise.resolve();cancellation.abort();let transactionCancelled=false;
    try{await pendingWrite;}catch{transactionCancelled=true;}adapter.close();
    const errors=[], revoked=[],created=[];
    const options={onError:e=>errors.push(String(e)),createObjectURL:b=>{const u=URL.createObjectURL(b);created.push(u);return u;},revokeObjectURL:u=>{revoked.push(u);URL.revokeObjectURL(u);}};
    // Generated PCM silence: no original/proprietary assets or external requests.
    const bytes=new Uint8Array(8044), view=new DataView(bytes.buffer); const text=(p,s)=>[...s].forEach((c,i)=>bytes[p+i]=c.charCodeAt(0));
    text(0,'RIFF');view.setUint32(4,8036,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,8000,true);
    const first=new BrowserAudioManager(options);await first.restore();
    first.setSlotFiles(0,[new File([bytes],'generated.wav',{type:'audio/wav'})]);first.setSlotMode(0,{shuffle:true,loop:true,volume:.5});first.setVolumes({music:.6,sound:.7});await first.flushPersistence();first.dispose();
    const second=new BrowserAudioManager(options);const restored=await second.restore();
    const names=second.getState().slots[0].files;const sameBytes=await second.getSlotFiles(0)[0].arrayBuffer();
    await second.playSlot(0);const inert=!second.isActivated&&created.length===0;
    window.audio=second;window.activationResult=null;document.querySelector('#enable').onclick=()=>{second.activate().then(ok=>window.activationResult=ok);};
    window.result={transactionCancelled,restored,names,inert,bytes: sameBytes.byteLength,mode:second.getState().slots[0],volumes:second.volumes,errors,created,revoked};
    return {restored,names,inert,bytes:sameBytes.byteLength};
  })()`);
  assert.equal(result.restored, true); assert.equal(result.inert, true); assert.equal(result.bytes, 8044);
  await browser.send('DOM.enable');
  const doc = await browser.send('DOM.getDocument');
  const found = await browser.send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#enable' });
  const box = await browser.send('DOM.getBoxModel', { nodeId: found.result.nodeId });
  const [x,y] = box.result.model.content;
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x:x+4, y:y+4, button:'left', clickCount:1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x:x+4, y:y+4, button:'left', clickCount:1 });
  // Resolve the actual media promise rather than assuming a short timer proves playback.
  const playback = await browser.ev(`(async()=>{for(let i=0;i<100&&window.activationResult===null;i++)await new Promise(r=>setTimeout(r,20));const r={...window.result,activated:window.activationResult};audio.setSlotFiles(0,[]);await audio.flushPersistence();audio.dispose();const next=new (await import('/features/audio')).BrowserAudioManager();await next.restore();r.deleted=next.getSlotFiles(0).length===0;next.dispose();return r;})()`);
  assert.equal(playback.activated,true);assert.equal(playback.deleted,true);assert.equal(playback.created.length,playback.revoked.length);assert.deepEqual(playback.errors,[]);
  assert.equal(playback.transactionCancelled, true);
  assert.deepEqual(playback.names, ['generated.wav']);
  assert.equal(playback.mode.shuffle, true); assert.equal(playback.mode.loop, true); assert.equal(playback.mode.volume, .5);
  assert.deepEqual(playback.volumes, {music:.6,sound:.7});
} finally {browser?.close();await new Promise(ok=>server.close(ok));}

}, 30_000);
