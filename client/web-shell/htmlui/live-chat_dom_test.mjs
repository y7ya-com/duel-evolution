// Actual DOM Enter, channel isolation, safe text and character-following bubbles without a game binary.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from './tools/cdp.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)), port=9340+process.pid%10;
const server=spawn('node',[path.join(here,'serve.mjs'),String(port)],{stdio:['ignore','pipe','inherit']});let browser;
try {
  await new Promise(r=>server.stdout.once('data',r)); browser=await launch({port:9840+process.pid%20});
  await browser.go(`http://127.0.0.1:${port}/htmlui/mock.html?s=chat`);
  await browser.ev(`(async()=>{
    const {makeLiveChat}=await import('/htmlui/live-chat.js');
    if(!document.querySelector('canvas')){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=768;canvas.style.cssText='position:fixed;left:0;top:0;width:1024px;height:768px;pointer-events:none';document.body.prepend(canvas);}
    window.__clock=Date.now(); window.__messages=[];window.__sent=[];
    window.__chat=makeLiveChat({clock:()=>window.__clock,fetcher:async(url,options={})=>{
      if(options.method==='POST') {const body=JSON.parse(options.body);window.__sent.push(body);window.__messages.push({id:window.__messages.length+1,at:window.__clock,pid:1001,name:'Alice',channel:body.channel,text:body.text});return {ok:true,json:async()=>window.__messages.at(-1)}}
      const after=Number(new URL(url,location.href).searchParams.get('after'))||0;
      return {ok:true,json:async()=>({cursor:window.__messages.length,pid:1001,name:'Alice',players:[{pid:1002,name:'Bob'}],messages:window.__messages.filter(m=>m.id>after)})};
    }});
    window.__snapshot={chatOnline:true,scene:10,windows:[],chatAvatars:[{pid:1001,x:250,y:200},{pid:1002,x:400,y:200}]};
    window.__chat.update(window.__snapshot);await new Promise(r=>setTimeout(r,20));window.__chat.update(window.__snapshot);
  })()`);
  assert.equal(await browser.ev(`document.getElementById('de-live-chat').hidden`),false,'chat enabled in room scene10');
  assert.deepEqual(await browser.ev(`Array.from(document.querySelector('#de-live-chat select').options,o=>o.value)`),['global','trade','whisper','team']);
  await browser.ev(`document.querySelector('#de-live-chat .chat-handle').click()`);
  await browser.send('Input.insertText',{text:'Hello from room'});
  const enter=async()=>{await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});};
  await enter(); await new Promise(r=>setTimeout(r,60));
  assert.deepEqual(await browser.ev(`window.__sent.map(m=>[m.channel,m.text])`),[['global','Hello from room']]);
  assert.equal(await browser.ev(`document.querySelector('#de-live-chat .chat-composer input').value`),'');
  await browser.ev(`window.__clock+=1100;window.__chat.update(window.__snapshot)`);await new Promise(r=>setTimeout(r,30));
  await browser.ev(`window.__chat.update(window.__snapshot)`);
  assert.equal(await browser.ev(`document.querySelectorAll('#de-chat-bubbles .speech').length`),1);
  const first=await browser.ev(`document.querySelector('#de-chat-bubbles .speech').style.left`);
  await browser.ev(`window.__snapshot.chatAvatars[0].x=350;window.__chat.update(window.__snapshot)`);
  assert.notEqual(await browser.ev(`document.querySelector('#de-chat-bubbles .speech').style.left`),first,'bubble follows avatar anchor');
  await browser.ev(`window.__messages.push({id:2,at:window.__clock,pid:1002,name:'Bob',channel:'whisper',text:'private <img src=x onerror=alert(1)>'});window.__clock+=1100;window.__chat.update(window.__snapshot)`);await new Promise(r=>setTimeout(r,30));
  await browser.ev(`window.__chat.update(window.__snapshot)`);
  assert.equal(await browser.ev(`document.querySelectorAll('#de-chat-bubbles .speech').length`),1,'whispers never create a bubble');
  assert.equal(await browser.ev(`document.querySelector('#de-live-chat .chat-log').textContent.includes('private')`),false,'private line excluded from global channel');
  await browser.ev(`const s=document.querySelector('#de-live-chat select');s.value='whisper';s.dispatchEvent(new Event('change'));`);
  assert.equal(await browser.ev(`document.querySelector('#de-live-chat .chat-log').textContent.includes('private <img')`),true);
  assert.equal(await browser.ev(`document.querySelector('#de-live-chat .chat-log img')`),null,'untrusted messages stay text');
  await browser.ev(`window.__clock+=7000;window.__chat.update(window.__snapshot)`);
  assert.equal(await browser.ev(`document.querySelectorAll('#de-chat-bubbles .speech').length`),0,'bubbles expire');
  await browser.ev(`document.querySelector('#de-live-chat input[type="text"]')?.blur();document.activeElement?.blur();document.documentElement.classList.add('yo2-cosmetics-open');window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));`);
  assert.equal(await browser.ev(`document.getElementById('de-live-chat').contains(document.activeElement)`),false,'shop modals retain Enter rather than opening chat');
  await browser.ev(`document.documentElement.classList.remove('yo2-cosmetics-open');window.__chat.update({...window.__snapshot,chatOnline:false})`);
  assert.equal(await browser.ev(`document.getElementById('de-live-chat').hidden`),true,'chat hidden outside online mode');
  assert.deepEqual(browser.logs.filter(l=>l.startsWith('exception:')),[]);
  await browser.ev(`window.__chat.destroy()`);
  console.log('live-chat_dom_test: room Enter, channels, privacy, safe text, movement and expiry passed');
} finally {browser?.close();server.kill();}
