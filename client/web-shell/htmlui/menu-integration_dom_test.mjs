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
    window.__events=[];window.__native=[];addEventListener('yo2-cosmetics-open',e=>__events.push(e.detail.tab));addEventListener('yo2-tag-lobby-open',()=>__events.push('tag'));
    const m=(await import('./screens/lobby.js')).default;window.__menu=m;
    const root=document.createElement('div');root.id='main-test';document.body.append(root);
    const c=(id,cls,x,y,w,h,extra={})=>({id,cls,x,y,w,h,shown:true,state:'normal',...extra});
    const main={id:1,cls:'CMainMenu',y:400,w:220,h:120,controls:[c(2,'CWindowTaskButtonMain',12,40,196,24,{label:'Profile'}),c(3,'CWindowTaskButtonMain',12,68,196,24,{label:'Options'})]};
    m.update(main,null,root,{click:id=>__native.push(id)},m.mount());
    const duel=document.createElement('div');duel.id='duel-test';document.body.append(duel);
    m.update({id:4,cls:'CWindowModelDuel',w:340,h:300,controls:[c(5,'CWindowTaskShadowText',10,0,200,24,{text:'Duel'}),c(6,'CWindowTaskPictureSwitch',16,100,130,48,{name:'Auto'}),c(7,'CWindowTaskShadowText',20,108,120,24,{text:'Auto Duel'}),c(8,'CWindowTaskPictureSwitch',170,100,130,48,{name:'Create'}),c(9,'CWindowTaskShadowText',174,108,120,24,{text:'Create Duel'}),c(10,'CWindowTaskButtonDuel',100,260,130,24,{label:'Cancel'})]},null,duel,{click:id=>__native.push(id)},m.mount());
  })()`);
  assert.deepEqual(await browser.ev(`[...document.querySelectorAll('#main-test button')].map(x=>x.textContent)`),['Profile','Appearance','Options','Modern UI']);
  assert.equal(await browser.ev(`document.querySelector('#main-test button').closest('.yo2-panel')!==null`),true);
  await browser.ev(`[...document.querySelectorAll('#main-test button')].find(e=>e.textContent==='Appearance').click()`);
  assert.deepEqual(await browser.ev(`__events`),['wardrobe']);
  assert.equal(await browser.ev(`(()=>{const buttons=[...document.querySelectorAll('#main-test button')];return buttons.every((b,i)=>parseFloat(b.style.top)>=32 && (!i || b.getBoundingClientRect().top>=buttons[i-1].getBoundingClientRect().bottom))})()`),true,'menu rows clear the title and do not overlap');
  assert.deepEqual(await browser.ev(`[...document.querySelectorAll('#duel-test button')].map(x=>x.textContent)`),['','Auto Duel','Create Duel','Tag Duel','Cancel']);
  await browser.ev(`[...document.querySelectorAll('#duel-test button')].find(x=>x.textContent==='Tag Duel').click();[...document.querySelectorAll('#duel-test button')].find(x=>x.textContent==='Create Duel').click()`);
  assert.deepEqual(await browser.ev(`__events`),['wardrobe','tag']);assert.deepEqual(await browser.ev(`__native`),[8]);
  assert.equal(await browser.ev(`document.querySelectorAll('.yo2-tag-launch,.cs-menu-link').length`),0);
  console.log('menu integration: Appearance inside Main Menu; Tag inside Duel menu; native actions preserve IDs; no floating launchers');
} finally {browser?.close();server.kill();}
