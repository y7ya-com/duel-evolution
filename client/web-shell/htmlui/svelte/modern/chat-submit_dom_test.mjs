// Real DOM Enter through Chat.svelte, with the native queue and enabled_ guard
// modeled from CWindowTaskFactory::dispatch. No game account/service is used.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../../tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), port = 9290 + process.pid % 10;
const server = spawn('node', [path.join(here, '../../serve.mjs'), String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
let browser;
try {
  await new Promise(resolve => server.stdout.once('data', resolve));
  browser = await launch({ port: 9750 + process.pid % 20 });
  await browser.go(`http://127.0.0.1:${port}/htmlui/mock.html?s=chat&modern=1`);
  await browser.ev(`(async () => {
    const { nativeHudInput, dispatchEnabledInput } = await import('/htmlui/modern-input.js');
    const input = 512, heap = new Uint8Array(4096), router = nativeHudInput();
    new Uint32Array(heap.buffer)[input >>> 2] = 0x1234; heap[input + 0x350] = 1;
    const ctl = (id, cls, fields) => ({ id, cls:'CWindowTask'+cls, parent:0, x:0, y:0, w:400, h:24, shown:true, enabled:true, ...fields });
    const state = { v:1, scene:12, focus:input, tasks:[], windows:[{ id:400, cls:'CChatWindow', x:248, y:632, w:776, h:128,
      z:1, wz:1, shown:true, alpha:1, online:true, world:false, mode:1, pairs:[{ tab:100, log:200, visible:true }], controls:[
        ctl(100,'Tab',{ label:'All Chat', active:true }), ctl(200,'Textlist',{ items:[], h:80 }),
        ctl(input,'Input',{ value:'', maxLen:128, focused:false }), ctl(301,'IconExpand',{}), ctl(302,'IconHide',{})
      ] }] };
    window.yo2Html = { snapshot:()=>state, modernScreens:new Map([['CChatWindow',1]]) };
    window.__delivered=[]; window.__submitAttempt=false;
    let jsQueue=[], nativeQueue=[], frames=[];
    const nextFrame = () => new Promise(resolve=>frames.push(resolve));
    Object.assign(window.__api, {
      async click(id) {
        const release=router.allow(id);
        try {
          // SDL focus can blur the DOM and publish a stale native value before send.
          if(window.__submitAttempt) { document.activeElement.blur?.(); state.windows[0].controls[2].value=''; window.__render(structuredClone(state)); }
          await nextFrame(); await nextFrame(); return true;
        } finally { release(); }
      },
      setText(id,text) { jsQueue.push({ kind:'text', id, text }); },
      char(code,id) {
        return dispatchEnabledInput(router,id,()=>new Promise(flushed=>jsQueue.push({ kind:'char',id,code,flushed })),nextFrame);
      }
    });
    window.__nativeClock=setInterval(()=>{
      const waiting=frames; frames=[];
      for(const command of nativeQueue) {
        const field=state.windows[0].controls[2];
        if(command.kind==='text') field.value=command.text;
        else if(command.code===13 && heap[input+0x350]) { window.__delivered.push(field.value); field.value=''; state.windows[0].controls[1].items.push('TestLocal:'+window.__delivered.at(-1)); }
      }
      nativeQueue=[];
      router.block(state,heap,true);
      window.__render(structuredClone(state));
      nativeQueue=jsQueue; jsQueue=[]; nativeQueue.forEach(command=>command.flushed?.());
      waiting.forEach(resolve=>resolve());
    },16);
    document.addEventListener('keydown',event=>{ if(event.key==='Enter' && event.target.matches('.composer input')) window.__submitAttempt=true; },true);
    window.__render(structuredClone(state));
  })()`);
  await browser.ev(`document.querySelector('.chat-handle').click()`);
  await new Promise(resolve => setTimeout(resolve, 80));
  const enter = async repeat => {
    await browser.send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13, autoRepeat:!!repeat });
    await browser.send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  };
  await browser.send('Input.insertText', { text:'Hello from Enter' }); await enter();
  await new Promise(resolve => setTimeout(resolve, 220));
  assert.deepEqual(await browser.ev('window.__delivered'), ['Hello from Enter'], 'Enter delivers the captured draft through native enabled dispatch');
  assert.equal(await browser.ev(`document.querySelector('.composer input').value`), '', 'draft clears after native submission');
  assert.equal(await browser.ev(`document.activeElement === document.querySelector('.composer input')`), true, 'focus returns for the next message');
  await browser.send('Input.insertText', { text:'Second message' }); await enter(); await enter(true);
  await new Promise(resolve => setTimeout(resolve, 220));
  assert.deepEqual(await browser.ev('window.__delivered'), ['Hello from Enter', 'Second message'], 'repeat Enter cannot send a duplicate');
  assert.equal(await browser.ev(`document.querySelectorAll('.log p').length`), 2, 'both messages appear in history');
  assert.deepEqual(browser.logs.filter(line=>line.startsWith('exception:')), []);
  await browser.ev('clearInterval(window.__nativeClock)');
  console.log('chat-submit_dom_test: Enter delivers once, preserves draft through focus lag, clears and restores composer');
} finally { browser?.close(); server.kill(); }
