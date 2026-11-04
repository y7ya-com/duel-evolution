import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launch } from './tools/cdp.mjs';
const port=9240+process.pid%20,server=spawn('node',[new URL('./serve.mjs',import.meta.url).pathname,String(port)],{stdio:['ignore','pipe','inherit']});
let browser;
try {
  await new Promise(r=>server.stdout.once('data',r)); browser=await launch();
  await browser.go(`http://127.0.0.1:${port}/htmlui/mock.html?s=chat`);
  await browser.ev(`(async()=>{
    document.body.replaceChildren();window.yo2Html={snapshot:()=>({scene:11})};
    window.__events=[];window.__native=[];addEventListener('yo2-tag-lobby-open',()=>__events.push('tag'));
    const m=(await import('./screens/lobby.js')).default;window.__menu=m;
    const root=document.createElement('div');root.id='main-test';document.body.append(root);
    const c=(id,cls,x,y,w,h,extra={})=>({id,cls,x,y,w,h,shown:true,state:'normal',...extra});
    const main={id:1,cls:'CMainMenu',y:400,w:220,h:120,controls:[c(2,'CWindowTaskButtonMain',12,40,196,24,{label:'Profile'}),c(3,'CWindowTaskButtonMain',12,68,196,24,{label:'Options'})]};
    m.update(main,null,root,{click:id=>__native.push(id)},m.mount());
    // the Duel menu is screens/duelsetup.js's (main's HTML Duel menu), the live menu's snapshot (mock/duelsetup-menu.json)
    const d=(await import('./screens/duelsetup.js')).default,win=(await (await fetch('./mock/duelsetup-menu.json')).json()).windows.find(w=>w.cls==='CWindowModelDuel');
    const duel=document.createElement('div');duel.id='duel-test';document.body.append(duel);
    const api={click:id=>__native.push(id),hover(){},setValue(){},renderControl(){}};
    d.update(win,null,duel,api,d.mount(win,duel,api));window.__duelBox=d.occlusionBox(win);window.__duelWin=win;
  })()`);
  assert.deepEqual(await browser.ev(`[...document.querySelectorAll('#main-test button')].map(x=>x.textContent)`),['Profile','Options','Modern UI']);
  assert.equal(await browser.ev(`document.querySelector('#main-test button').closest('.yo2-panel')!==null`),true);
  assert.equal(await browser.ev(`(()=>{const buttons=[...document.querySelectorAll('#main-test button')];return buttons.every((b,i)=>parseFloat(b.style.top)>=32 && (!i || b.getBoundingClientRect().top>=buttons[i-1].getBoundingClientRect().bottom))})()`),true,'menu rows clear the title and do not overlap');
  // the switches are labelled by name (their captions are separate texts); the page's Tag Duel row under them, Cancel below it
  const sw=await browser.ev(`[...document.querySelectorAll('#duel-test button')].map(x=>[x.getAttribute('aria-label')||x.textContent.trim(),parseFloat(x.style.left),parseFloat(x.style.top)])`);
  assert.deepEqual(sw.map(s=>s[0]),['申し込みを待つボタン','自動で待つボタン','Cancel','Tag Duel']);
  const [create,auto,cancel,tag]=sw;
  assert.ok(tag[2]>=auto[2]+32 && tag[2]>=create[2]+32 && cancel[2]>=tag[2]+32,'Tag Duel under Auto Duel / Create Duel, Cancel under it: '+JSON.stringify(sw));
  assert.ok(await browser.ev(`[...document.querySelectorAll('#duel-test .ds-txt')].some(t=>t.textContent==='Tag Duel')`),'the row has its caption');
  assert.deepEqual(await browser.ev(`[__duelBox.h,__duelWin.h]`),[256,216],'the frame (and the bridge\'s occlusion box) a row taller');
  await browser.ev(`(b=>{b.find(x=>x.getAttribute('aria-label')==='Tag Duel').click();b.find(x=>x.getAttribute('aria-label')==='申し込みを待つボタン').click()})([...document.querySelectorAll('#duel-test button')])`);
  assert.deepEqual(await browser.ev(`__events`),['tag']);assert.deepEqual(await browser.ev(`__native`),[482875400],'Create Duel clicks its own control; Tag Duel none');
  assert.equal(await browser.ev(`document.querySelectorAll('.yo2-tag-launch,.cs-menu-link').length`),0);
  console.log('menu integration: Main Menu rows; Tag inside Duel menu; native actions preserve IDs; no floating launchers');
} finally {browser?.close();server.kill();}
