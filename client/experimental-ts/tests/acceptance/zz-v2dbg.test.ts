import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { CLIENT, RUN, enabled, openPage, signIn, enterWorld, sleep, closeAll } from './harness';
const OUT = process.env.HOME + '/.cache/de-scratch/v2dbg';
it.runIf(enabled)('v2 world debug', async () => {
  const name = 'Testv' + RUN, page = await openPage(1280, 900);
  try {
    const cookies = await signIn(name);
    await page.send('Page.enable'); await page.send('Network.enable');
    for (const c of cookies) await page.send('Network.setCookie', { name: c.name, value: c.value, url: CLIENT, path: '/', httpOnly: true, secure: c.name.startsWith('__Secure-'), sameSite: 'Lax' });
    await page.go(`${CLIENT}/?portOffset=1000`, `document.querySelector('.de-client')`);
    try { await enterWorld(page, 'V' + RUN); } catch (e) { writeFileSync(OUT + '/fail.png', await page.shot()); writeFileSync(OUT + '/logs.txt', page.logs.join('\n')); throw e; }
    await sleep(5000);
    const selfAt = async () => JSON.parse(await page.ev(`JSON.stringify(window.__deWorld().avatars.find(a=>a.name==='V${RUN}'))`) as string);
    const track: unknown[] = [await selfAt(), await page.ev(`(()=>{const e=document.elementFromPoint(900,300);return e.tagName+'.'+e.className+' '+(e.getAttribute('data-key')||'')})()`)];
    const mouse = (type: string, x: number, y: number, buttons = 1) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
    const me = JSON.parse(await page.ev(`(()=>{const w=window.__deWorld(),a=w.avatars.find(a=>a.name==='V${RUN}'),r=document.querySelector('canvas[data-key="lobby-map"]').getBoundingClientRect(),k=r.width/1024;return JSON.stringify({x:r.left+(a.x-w.viewport.x)*k,y:r.top+(a.y-w.viewport.y)*k})})()`) as string); track.push(me);
    await mouse('mouseMoved', me.x + 300, me.y - 40, 0); await mouse('mousePressed', me.x + 300, me.y - 40);
    for (let i = 0; i < 10; i++) { await sleep(150); track.push(await selfAt()); }
    await mouse('mouseMoved', me.x + 100, me.y + 200); writeFileSync(OUT + '/walking.png', await page.shot());
    for (let i = 0; i < 10; i++) { await sleep(150); track.push(await selfAt()); }
    await mouse('mouseReleased', me.x + 100, me.y + 200, 0);
    for (let i = 0; i < 6; i++) { await sleep(150); track.push(await selfAt()); }
    writeFileSync(OUT + '/track.json', JSON.stringify(track));
    writeFileSync(OUT + '/world.png', await page.shot());
    const info = await page.ev(`JSON.stringify({world: (window.__deWorld && window.__deWorld()) || null, bad: performance.getEntriesByType('resource').filter(e=>e.responseStatus>=400||e.responseStatus===0).map(e=>[e.name,e.responseStatus]), imgs: [...document.images].filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.src).slice(0,40)})`);
    writeFileSync(OUT + '/world.json', info);
    writeFileSync(OUT + '/logs.txt', page.logs.join('\n'));
  } finally { closeAll(); }
}, 300000);
