// Headless DOM regression: Modern shop chrome must leave every native input
// region on the canvas. This deliberately uses unlabeled, zero-size native controls
// with their real drawn sprite positions instead of the old guessed action fixtures.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../../../tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 9040 + process.pid % 40;
const server = spawn('node', [path.join(here, '../../../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
let browser;
try {
  await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('exit', code => reject(new Error('Mock server exited: ' + code))); });
  browser = await launch({});
  await browser.go(`http://127.0.0.1:${PORT}/htmlui/mock.html?s=modern-room&modern=1`);
  await browser.ev(`(() => {
    const canvas=document.createElement('canvas'); canvas.id='canvas'; canvas.width=1024; canvas.height=768;
    Object.assign(canvas.style,{position:'fixed',inset:'0',width:'1024px',height:'768px',zIndex:'0'});
    document.body.prepend(canvas); window.__nativeClicks=[];
    canvas.addEventListener('mousedown',e=>window.__nativeClicks.push([Math.round(e.clientX),Math.round(e.clientY)]));
    window.yo2Html={snapshot:()=>({scene:14,windows:[]})};
  })()`);
  const sprite = (id, tex, x, y, w, h, z=51001) => ({ id, tex:'data/shop/'+tex, src:[0,0,w,h], wx:x, wy:y, wz:z, sx:1, sy:1, shown:true });
  const control = (id, x, y, tex='shop_btn1_01_c01.png') => ({ id,cls:'CWindowTaskPictureSwitch',name:'',label:'',x:0,y:0,w:0,h:0,wx:x,wy:y,wz:51002,shown:true,enabled:true,parts:{sprites:[sprite(id+100,tex,x,y,256,64)]} });
  const store = { id:1,cls:'CShopPackWindow',x:264,y:0,w:760,h:600,shown:true,alpha:1,
    parts:{sprites:[sprite(20,'shop_win_01_c01.png',280,84,512,512)]},
    controls:[control(2,795,305),control(3,795,360),control(4,795,540)],extras:[],
    items:[{itemId:46,type:1,param:46,name:'Light of Destruction',price:1000,slot:0}] };
  const price={id:30,cls:'CShopPricePlate',x:301,y:120,w:99,h:234,shown:true,alpha:1,extras:[],
    controls:[{...control(31,301,120,'shop_pricetag_01_c01.png'),parts:{sprites:[sprite(131,'shop_pricetag_01_c01.png',301,120,99,256)]}}]};
  const checkout={id:40,cls:'CShopConfirmWindow',x:300,y:330,w:512,h:256,shown:true,alpha:1,extras:[],
    parts:{sprites:[sprite(41,'shop_win_01_c00.png',300,330,512,256,51003)]},
    controls:[control(42,339,547,'shop_btn2_01_c01.png'),control(43,638,547,'shop_btn2_01_c01.png')],cart:[]};
  const render = tasks => browser.ev(`window.__render(${JSON.stringify({v:1,scene:14,windows:[],tasks})})`);
  const categories={id:50,cls:'CShopCategoryWindow',x:270,y:70,w:754,h:530,shown:true,alpha:1,controls:[],extras:[],
    parts:{sprites:[sprite(51,'shop_win_01_c01.png',280,84,512,512),sprite(52,'shop_card_01_c01.png',320,109,512,256)]}};
  await render([categories]);
  assert.equal(await browser.ev(`document.querySelector('.modern-shop-label.category')?.textContent`),'Single Cards');
  assert.equal(await browser.ev(`document.elementFromPoint(450,225)?.id`),'canvas','category caption cannot block its native button');
  await render([store,price]);
  assert.equal(await browser.ev(`!!document.querySelector('.yo2-modern-shop .yo2-shop-legacy .shop-frame')`),true);
  assert.equal(await browser.ev(`document.body.textContent.includes('DUELIST SUPPLY')`),false,'website hero is removed');
  const checks=[['purchase',850,330],['back',850,385],['leave',850,565],['item selection',350,353]];
  async function clickThrough(label,x,y) {
    assert.equal(await browser.ev(`document.elementFromPoint(${x},${y})?.id`),'canvas',label+' stays native canvas input');
    await browser.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
    await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
    await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
  }
  for(const check of checks) await clickThrough(...check);
  await render([store,price,checkout]);
  await clickThrough('confirm purchase',394,559); await clickThrough('cancel purchase',693,559);
  assert.deepEqual(await browser.ev('window.__nativeClicks'),checks.map(([,x,y])=>[x,y]).concat([[394,559],[693,559]]));
  assert(!browser.logs.some(log=>/^log: api\.click/.test(log)), 'painting the shop never calls an inferred command');
  console.log('modern/shop/input_dom_test: Back, Purchase, Leave, item, Confirm and Cancel reach native canvas');
} finally {
  browser?.close(); server.kill();
}
