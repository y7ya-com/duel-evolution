// Actual DOM checks for both sides of a trade, legacy collection/details, and dynamic visibility.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from './tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const port = 9150 + process.pid % 50;
const server = spawn(process.execPath, [path.join(here, 'serve.mjs'), String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
let browser;
try {
  await new Promise(resolve => server.stdout.once('data', resolve)); browser = await launch();
  await browser.go(`http://127.0.0.1:${port}/htmlui/mock.html?s=chat`);
  await browser.ev(`(async()=>{
    window.__rarity=await import('/htmlui/card-rarity.js');
    __rarity.setRarityCatalog({byInternalId:{1:'UR',2:'N',3:'SR',4:'R'},byPasscode:{89631139:'UR'}});
    const host=document.createElement('div');host.id='rarity-test';document.body.append(host);
    for(const id of [20,21,22]){const r=document.createElement('div');r.className='win';r.dataset.windowId=String(id);r.style.cssText='position:absolute;left:0;top:0;width:488px;height:608px';host.append(r);}
    window.__snapshot={scene:38,windows:[
      {id:20,cls:'CWindowModelTrade',shown:true,x:248,y:0,w:488,h:608,controls:[
        {id:10,cls:'CWindowTaskTradeCard',shown:true,card:1,wx:300,wy:40},
        {id:11,cls:'CWindowTaskTradeCard',shown:true,card:3,wx:400,wy:340}]},
      {id:21,cls:'CWindowModelKaban',shown:true,x:736,y:0,w:256,h:608,controls:[{id:12,cls:'CWindowTaskKabanListBtn',shown:true,card:2,wx:750,wy:80}]},
      {id:22,cls:'CCardDetailViewDlg',shown:true,card:4,mode:0,x:0,y:0,w:248,h:608,controls:[]}]};
    __rarity.updateCardRarityOverlay(__snapshot);
  })()`);
  assert.deepEqual(await browser.ev(`Array.from(document.querySelectorAll('#rarity-test .de-card-rarity'),b=>b.textContent)`), ['UR', 'SR', 'N', 'R']);
  assert.equal(await browser.ev(`document.querySelector('[data-card-control="10"]').getAttribute('aria-label')`), 'Card rarity: Ultra Rare');
  assert.equal(await browser.ev(`getComputedStyle(document.querySelector('[data-card-control="10"]')).pointerEvents`), 'none');
  assert.notEqual(await browser.ev(`getComputedStyle(document.querySelector('[data-card-control="10"]')).color`),
    await browser.ev(`getComputedStyle(document.querySelector('[data-card-control="11"]')).color`), 'rarities differ by text and colour');
  await browser.ev(`__snapshot.windows[0].controls[0].wx=350;__rarity.updateCardRarityOverlay(__snapshot)`);
  assert.equal(await browser.ev(`document.querySelector('[data-card-control="10"]').style.left`), '105px', 'trade badge follows card movement');
  await browser.ev(`__snapshot.windows[0].controls[0].card=99999;__rarity.updateCardRarityOverlay(__snapshot)`);
  assert.equal(await browser.ev(`document.querySelector('[data-card-control="10"]')`), null, 'missing rarity does not inherit previous card');
  await browser.ev(`__snapshot.windows[0].shown=false;__rarity.updateCardRarityOverlay(__snapshot)`);
  assert.equal(await browser.ev(`document.querySelector('.win[data-window-id="20"] .de-card-rarity-layer')`), null);
  await browser.ev(`const ed=document.createElement('div');ed.className='mu ed';document.body.append(ed);__rarity.updateCardRarityOverlay(__snapshot)`);
  assert.equal(await browser.ev(`document.querySelector('.win[data-window-id="21"] .de-card-rarity-layer')`), null, 'custom modern editor does not get native-position badges');
  await browser.go(`http://127.0.0.1:${port}/htmlui/mock.html?s=chat&modern=1`);
  await browser.ev(`(async()=>{
    const rarity=await import('/htmlui/card-rarity.js');rarity.setRarityCatalog({byInternalId:{1:'UR',2:'N',3:'SR',4:'R'},byPasscode:{89631139:'UR'}});
    const cards=[{id:1,name:'Ultra card',atk:3000,def:2500,kind:1,attr:1,level:8,race:1,limit:3},{id:2,name:'Common card',atk:1000,def:1000,kind:1,attr:1,level:4,race:1,limit:3},{id:3,name:'Super card',atk:2000,def:1000,kind:1,attr:1,level:6,race:1,limit:3}];
    window.yo2Deck={v:1,card:id=>cards.find(c=>c.id===id)||null,cards:()=>cards,trunk:new Map([[1,3],[2,3],[3,1]]),desc:()=> 'Card description',dlg:()=>'',ready:()=>true};
    window.__modern={v:1,scene:36,tasks:[],windows:[{id:901,cls:'CWindowModelDeck',x:248,y:0,w:488,h:712,shown:true,alpha:1,z:1,wz:1,controls:[{id:902,cls:'CWindowTaskDeck',shown:true,grids:{main:[1],side:[],extra:[]},counts:{main:1,side:0,extra:0,missing:0}}]}]};
    window.yo2Html={snapshot:()=>window.__modern};window.__render(__modern);
    await new Promise(r=>setTimeout(r,80));
  })()`);
  assert.equal(await browser.ev(`document.querySelector('.mu.ed .tile[data-card="1"] .de-card-rarity')?.textContent`), 'UR', 'compiled Modern deck tile badge');
  assert.equal(await browser.ev(`document.querySelector('.mu.ed .card[data-card="3"] .de-card-rarity')?.textContent`), 'SR', 'compiled Modern collection badge');
  await browser.ev(`document.querySelector('.mu.ed .card[data-card="1"]').dispatchEvent(new MouseEvent('mouseenter'));`);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(await browser.ev(`document.querySelector('.mu.ed .preview-name .de-card-rarity')?.textContent`), 'UR', 'Modern selected card details badge');
  await browser.ev(`__modern={v:1,scene:28,tasks:[],windows:[{id:903,cls:'CCardDetailViewDlg',x:0,y:0,w:248,h:608,shown:true,alpha:1,z:1,wz:1,card:1,controls:[]}]};__render(__modern)`);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(await browser.ev(`document.querySelector('.mu.inspector .de-card-rarity')?.textContent`), 'UR', 'compiled Modern duel inspector badge');
  await browser.ev(`__modern={...__modern,windows:[{...__modern.windows[0],card:2}]};__render(__modern)`);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(await browser.ev(`document.querySelector('.mu.inspector .de-card-rarity')?.textContent`), 'N', 'selected-card rarity updates without retaining old UR');
  assert.deepEqual(browser.logs.filter(l => l.startsWith('exception:')), []);
  console.log('card-rarity_dom_test: trade offers, collection, details, readable tiers, card movement and visibility passed');
} finally { browser?.close(); server.kill(); }
