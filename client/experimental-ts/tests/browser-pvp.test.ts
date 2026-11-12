import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { browserServerFixture } from './browser-server-fixture';
import { launch } from '../../web-shell/htmlui/tools/cdp.mjs';

/** Two real browsers, two fixture accounts, one real game authority: challenge, accept, play, surrender, return.
 * Opt-in (two Chromium processes): BROWSER_PVP=1. Run alone, after other browser checks have closed. */
type Browser = Awaited<ReturnType<typeof launch>>;
const sleep = (ms:number) => new Promise(r => setTimeout(r,ms));
async function until(browser:Browser,condition:string,timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await browser.ev(`Boolean(${condition})`)) return; await sleep(50); }
  throw new Error(`Browser condition timed out: ${condition}\n${await browser.ev('document.body.innerText')}\n${browser.logs.join('\n')}`);
}
async function activate(browser:Browser,selector:string) {
  const point = await browser.ev(`(async()=>{let b=${selector};if(!b||b.disabled)return null;b.scrollIntoView({block:'center',inline:'center',behavior:'instant'});for(let frame=0;frame<10;frame++){await new Promise(requestAnimationFrame);b=${selector};if(!b||b.disabled)return null;const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);if(hit&&(hit===b||b.contains(hit)))return{x,y};}return null})()`);
  if (!point) return false;
  const pressed = browser.send('Input.dispatchMouseEvent',{ type:'mousePressed',...point,button:'left',clickCount:1 });
  const released = browser.send('Input.dispatchMouseEvent',{ type:'mouseReleased',...point,button:'left',clickCount:1 });
  await pressed; await released; return true;
}
const buttonText = (text:string) => `[...document.querySelectorAll('button,summary')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled&&b.getClientRects().length)`;
async function click(browser:Browser,text:string) {
  // Main Menu entries (Lobby, Edit Deck, Options...) are reached through the menu bar's Menu key, as a player would.
  // main's Main Menu (src/ui/htmlui: CMainMenu) behind the menu bar's MAIN key
  const entry = `(['Edit Deck','My Profile','Appearance','Create Comment','DUEL OPTIONS','D-Mail','Audio','Ignore List','Friend List','Team List','Find Player','Shop','Return to Duel','Return to Lobby','Return to Title','Modern UI'].includes(${JSON.stringify(text)})&&!!document.querySelector('[data-key="main-menu"]'))`;
  await until(browser,`${buttonText(text)}||${entry}`);
  if (!await browser.ev(`Boolean(${buttonText(text)})`) && !await activate(browser,`document.querySelector('[data-key="main-menu"]')`)) throw new Error('Main Menu key is covered');
  await until(browser,buttonText(text));
  // An obstructed control is a UI defect, not something to skip.
  if (!await activate(browser,buttonText(text))) throw new Error(`Button is covered or vanished: ${text}`);
}
async function enter(browser:Browser,origin:string,account:string,name:string) {
  await browser.send('Page.enable');
  await browser.send('Page.addScriptToEvaluateOnNewDocument',{ source:`try{localStorage.setItem('de-client-settings-v1',JSON.stringify({reducedMotion:true,sound:0,music:0}));}catch{};window.confirm=()=>true;` });
  await browser.go(`${origin}/api/de/session?as=${account}`,'document.body');
  await browser.go(origin+'/?portOffset=0',`document.querySelector('.de-client')`);
  await click(browser,'Go Online');
  await until(browser,`document.querySelector('[data-key^="character-create:"]')`); await click(browser,'Create Player'); await until(browser,`document.querySelector('[data-key="character-name"]')`);
  await browser.ev(`(()=>{const input=document.querySelector('[data-key="character-name"]');input.value=${JSON.stringify(name)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click(browser,'OK');
  const slot = `[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes(${JSON.stringify(name)})&&!b.disabled)`;
  await until(browser,slot); await activate(browser,slot);
  await until(browser,`document.querySelector('[data-key="lobby-npcs"]')`);
  await until(browser,`![...document.querySelectorAll('button')].some(b=>b.textContent==='Create Duel'&&b.disabled)`);
  // main's starter deck picker (web-shell/starter.js): a deck, Choose this deck, Yes, take it, OK
  for (let i = 0; i < 30 && !(await browser.ev(`Boolean(${`document.querySelector('#starter .scroll .btn')`})`)); i++) await new Promise(r => setTimeout(r,100));
  if (await browser.ev(`Boolean(${`document.querySelector('#starter .scroll .btn')`})`)) {
    await activate(browser,`document.querySelector('#starter .scroll .btn')`);
    for (const label of ['Choose this deck','Yes, take it','OK']) { const sel = `document.querySelector('#starter .btn[aria-label="${label}"]')`; await until(browser,sel); await activate(browser,sel); }
    await until(browser,`!document.getElementById('starter')`);
  }
}
/** A second, cookie-isolated page in the same Chrome (its own browser context), with the launcher's page API. */
async function isolatedPage(port:number,width:number,height:number):Promise<Browser> {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json() as { webSocketDebuggerUrl:string };
  const rpc = (url:string) => {
    const sock = new WebSocket(url); let id = 0; const pending = new Map<number,(d:any)=>void>(), logs:string[] = [];
    sock.onmessage = m => { const d = JSON.parse(String(m.data)); if (d.id && pending.has(d.id)) { pending.get(d.id)!(d); pending.delete(d.id); }
      if (d.method === 'Runtime.exceptionThrown') logs.push('exception: ' + JSON.stringify(d.params.exceptionDetails).slice(0,400)); };
    const opened = new Promise(r => { sock.onopen = r; });
    const send = async (method:string,params = {}) => { await opened; return new Promise<any>(r => { const i = ++id; pending.set(i,r); sock.send(JSON.stringify({ id:i,method,params })); }); };
    return { sock,send,logs };
  };
  const root = rpc(version.webSocketDebuggerUrl);
  const context = (await root.send('Target.createBrowserContext',{ disposeOnDetach:false })).result.browserContextId;
  const targetId = (await root.send('Target.createTarget',{ url:'about:blank',browserContextId:context })).result.targetId;
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { id:string; webSocketDebuggerUrl:string }[];
  const page = rpc(list.find(t => t.id === targetId)!.webSocketDebuggerUrl);
  const ev = async (js:string) => { const r = await page.send('Runtime.evaluate',{ expression:js,awaitPromise:true,returnByValue:true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0,500)); return r.result?.result?.value; };
  await page.send('Runtime.enable');
  await page.send('Emulation.setDeviceMetricsOverride',{ width,height,deviceScaleFactor:1,mobile:false });
  const go = async (url:string,ready:string) => { await page.send('Page.navigate',{ url }); for (let i = 0; i < 100; i++) { await sleep(100); if (await ev(`!!(${ready})`).catch(() => false)) return; } throw new Error('not ready: ' + url); };
  const shot = async () => Buffer.from((await page.send('Page.captureScreenshot',{ format:'png' })).result.data,'base64');
  return { send:page.send,ev,go,shot,logs:page.logs,close:() => { page.sock.close(); void root.send('Target.disposeBrowserContext',{ browserContextId:context }).finally(() => root.sock.close()); } } as unknown as Browser;
}
/** What one player's duel screen shows, read from its accessible HUD. */
const readDuel = `(()=>{const p=[...document.querySelectorAll('.de-duelist')].map(d=>d.getAttribute('aria-label'));const bar=document.querySelector('.de-phase-bar')?.getAttribute('aria-label');return {players:p,bar};})()`;
async function step(browser:Browser):Promise<'finished'|'acted'|'idle'> {
  const next = await browser.ev(`(()=>{
    const buttons=[...document.querySelectorAll('button')].filter(b=>!b.disabled&&b.getClientRects().length);
    if(buttons.some(b=>b.textContent==='Return to Lobby'))return {kind:'finished'};
    const end=buttons.find(b=>b.textContent==='End Turn');if(end)return {key:end.dataset.key,text:end.textContent};
    const no=buttons.find(b=>b.dataset.key?.startsWith('prompt-option:')&&b.textContent==='No');if(no)return {key:no.dataset.key};
    const candidates=buttons.filter(b=>b.dataset.key?.startsWith('prompt-candidate:'));const selected=candidates.filter(b=>b.getAttribute('aria-pressed')==='true');
    const confirm=buttons.find(b=>b.textContent==='Confirm Selection');if(confirm&&selected.length)return {key:confirm.dataset.key};
    if(candidates.length&&!selected.length)return {key:candidates[0].dataset.key};
    const option=buttons.find(b=>b.dataset.key?.startsWith('prompt-option:'));if(option)return {key:option.dataset.key};
    return null;})()`);
  if (next?.kind === 'finished') return 'finished';
  if (!next) return 'idle';
  const selector = next.key ? `[...document.querySelectorAll('button')].find(b=>b.dataset.key===${JSON.stringify(next.key)})` : buttonText(next.text);
  return await activate(browser,selector) ? 'acted' : 'idle';
}

describe.skipIf(process.env.BROWSER_PVP !== '1')('two real browsers duel each other through the real game authority',() => {
  it('challenges, accepts, prepares, agrees on the board for several turns, surrenders and returns both players',async () => {
    const fixture = await browserServerFixture();
    let a:Browser|undefined, b:Browser|undefined;
    try {
      const port = 24000 + process.pid % 8000;
      a = await launch({ port,width:1280,height:900 });
      b = await isolatedPage(port,1280,900);
      await enter(a,fixture.origin,'1','Alpha Duelist');
      await enter(b,fixture.origin,'b','Beta Duelist');
      // Both new characters arrive in the same area; Beta picks Alpha's avatar and challenges.
      const alpha = `[...document.querySelectorAll('[data-key^="avatar:"]')].find(x=>x.textContent.includes('Alpha Duelist'))`;
      await until(b,alpha);
      // Spawn points are random and the avatar can sit under the chat panel; a player would walk closer instead.
      if (!await activate(b,alpha)) await b.ev(`${alpha}.click()`);
      await click(b,'Duel');
      await click(a,'Accept Duel');
      for (const browser of [a,b]) await until(browser,`[...document.querySelectorAll('button')].some(x=>['Rock','Go First','Go Second','Start Duel'].includes(x.textContent)&&!x.disabled)||document.querySelector('[aria-label="Duel field"]')&&!document.querySelector('.de-duel-prompt')`);
      // Rock-paper-scissors until one side wins, then the winner goes first and both start.
      for (let round = 0; round < 12; round++) {
        if (await a.ev(`Boolean(${buttonText('Rock')})`)) await click(a,'Rock');
        if (await b.ev(`Boolean(${buttonText('Scissors')})`)) await click(b,['Scissors','Rock','Paper'][round % 3]!);
        await sleep(400);
        const ready = await Promise.all([a,b].map(x => x.ev(`[...document.querySelectorAll('button')].some(b=>['Go First','Start Duel'].includes(b.textContent)&&!b.disabled)||!document.body.innerText.includes('Choose your hand')`)));
        if (ready.some(Boolean)) break;
      }
      const dealt = `document.querySelectorAll('.de-field-card').length>0&&!document.querySelector('.de-duel-prompt')`;
      for (let tries = 0; tries < 60 && !(await a.ev(`Boolean(${dealt})`) && await b.ev(`Boolean(${dealt})`)); tries++) {
        for (const browser of [a,b]) for (const label of ['Go First','Start Duel']) if (await browser.ev(`Boolean(${buttonText(label)})`)) await click(browser,label);
        await sleep(300);
      }
      for (const browser of [a,b]) await until(browser,`document.querySelectorAll('.de-field-card').length>0&&document.querySelector('.de-phase-bar')`);
      await writeFile('/tmp/duel-ts-pvp-alpha-start.png',await a.shot()); await writeFile('/tmp/duel-ts-pvp-beta-start.png',await b.shot());
      // Each player ends their own turns; the other side's screen must agree on turn, phase and life points.
      let agreed = 0;
      const start = Date.now();
      while (Date.now() - start < 120000 && agreed < 6) {
        const [sa,sb] = await Promise.all([step(a),step(b)]);
        if (sa === 'finished' || sb === 'finished') break;
        await sleep(250);
        const [va,vb] = await Promise.all([a.ev(readDuel),b.ev(readDuel)]) as { players:string[]; bar:string }[];
        const turnA = /Turn (\d+)/.exec(va!.bar)?.[1], turnB = /Turn (\d+)/.exec(vb!.bar)?.[1];
        if (turnA && turnA === turnB && va!.bar === vb!.bar) {
          // Each HUD lists itself first: Alpha's own panel is Beta's opponent panel and vice versa.
          expect(va!.players[0]!.replace(', their turn','')).toBe(vb!.players[1]!.replace(', their turn',''));
          expect(va!.players[1]!.replace(', their turn','')).toBe(vb!.players[0]!.replace(', their turn',''));
          if (Number(turnA) > agreed) agreed = Number(turnA);
        }
      }
      expect(agreed,'both screens must agree through several turns').toBeGreaterThanOrEqual(3);
      await writeFile('/tmp/duel-ts-pvp-alpha-mid.png',await a.shot()); await writeFile('/tmp/duel-ts-pvp-beta-mid.png',await b.shot());
      // Before turn 10 the server refuses a surrender with an information box; the client must show it.
      if (agreed < 10) {
        await click(b,'Surrender');
        await until(b,`document.querySelector('.de-duel-notice')?.textContent.includes('10th turn')`);
        await writeFile('/tmp/duel-ts-pvp-beta-refused.png',await b.shot());
        await click(b,'OK'); await until(b,`!document.querySelector('.de-duel-notice')`);
      }
      const turn = async () => Number(/Turn (\d+)/.exec(await a.ev(`document.querySelector('.de-phase-bar')?.getAttribute('aria-label')`) ?? '')?.[1] ?? 0);
      for (const started = Date.now(); Date.now() - started < 180000 && await turn() < 10;) { await Promise.all([step(a),step(b)]); await sleep(200); }
      expect(await turn()).toBeGreaterThanOrEqual(10);
      // From turn 10 the server asks for confirmation; Beta confirms; Alpha wins, Beta loses, both return to a usable lobby.
      await click(b,'Surrender');
      const yes = `[...document.querySelectorAll('button')].find(x=>x.dataset.key?.startsWith('prompt-option:')&&x.textContent==='Yes'&&!x.disabled)`;
      await until(b,yes); await activate(b,yes);
      for (const browser of [a,b]) await until(browser,buttonText('Return to Lobby'),60000);
      expect(await a.ev(`document.body.innerText`)).toContain('Victory');
      expect(await b.ev(`document.body.innerText`)).toContain('Defeat');
      await writeFile('/tmp/duel-ts-pvp-alpha-end.png',await a.shot()); await writeFile('/tmp/duel-ts-pvp-beta-end.png',await b.shot());
      for (const browser of [a,b]) { await click(browser,'Return to Lobby'); await until(browser,`document.querySelector('[data-key="lobby-npcs"]')`); }
      expect(await a.ev(`![...document.querySelectorAll('button')].some(b=>b.textContent==='Create Duel'&&b.disabled)`)).toBe(true);
    } finally {
      b?.close(); a?.close(); await fixture.close();
    }
  },300000);
});
