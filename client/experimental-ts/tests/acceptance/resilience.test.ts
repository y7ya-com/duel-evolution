import { describe, expect, it } from 'vitest';
import { RUN, CLIENT, enabled, openPage, closeAll, signIn, openClient, enterWorld, reenterWorld, click, until, press, type, sleep, screenshot, record, byKey, byText, startNpcDuel, surrender, duelBot, type Page } from './harness';

/** Records the client's game WebSockets (one per tunnel; a resume opens another) without changing them. `rewrite`
 * redirects later connections (a refused port, a black hole, a forged resume id) as a broken network would. Binary
 * frames are kept per virtual channel so a test can append a frame of its own to a channel's stream. */
const NET_PROBE = `(()=>{const N=window.__net={sockets:[],urls:[],frames:new Map(),statuses:[],rewrite:null};const W=window.WebSocket;
window.WebSocket=class extends W{constructor(u,p){u=String(u);if(N.rewrite)u=N.rewrite(u);N.urls.push(u.replace(/sid=[0-9a-f]+/,'sid=…'));super(u,p);N.sockets.push(this);
const send=this.send.bind(this);this.send=d=>{if(typeof d==='string'&&d.includes('"close"')){try{sessionStorage.setItem('net-closed',(sessionStorage.getItem('net-closed')??'')+d);}catch{}}return send(d);};this.addEventListener('message',e=>{if(e.data instanceof ArrayBuffer){const b=new Uint8Array(e.data);if(b[0]===1){const id=new DataView(e.data).getUint32(1);let a=N.frames.get(id);if(!a)N.frames.set(id,a=[]);a.push(b.slice(5));}}});}};
new MutationObserver(()=>{const c=document.querySelector('.de-connection')?.className.replace('de-connection','').trim();if(c&&N.statuses.at(-1)!==c)N.statuses.push(c);}).observe(document,{subtree:true,childList:true,attributes:true});})()`;
const live = `window.__net.sockets.at(-1)`;
const connection = (page:Page) => page.ev(`document.querySelector('.de-connection')?.className.replace('de-connection','').trim()`) as Promise<string>;
/** The connection drops as a network failure would: the client's socket closes under it. */
async function drop(page:Page) { await page.ev(`${live}.close()`); }
async function resumed(page:Page,timeout = 30000) {
  await until(page,`window.__net.statuses.includes('reconnecting')`,timeout);
  await until(page,`document.querySelector('.de-connection.online')&&window.__net.urls.at(-1).includes('resume=1')&&${live}.readyState===1`,timeout);
}
/** Every owned copy in the deck editor's collection (owned-only view). */
async function collection(page:Page):Promise<number> {
  await click(page,'Edit Deck'); await until(page,`document.querySelectorAll('[data-key^="collection-card:"]').length>0`,60000); await sleep(600);
  return page.ev(`[...document.querySelectorAll('[data-key^="collection-card:"]')].reduce((n,b)=>n+Number(/×(\\d+)/.exec(b.querySelector('.de-card-count')?.textContent??'')?.[1]??0),0)`) as Promise<number>;
}
const chatLines = (page:Page) => page.ev(`[...document.querySelectorAll('.de-chat-line')].map(l=>l.textContent)`) as Promise<string[]>;
async function chat(page:Page,message:string) { await type(page,byKey('chat'),message); await click(page,'Send'); }
const mp = (page:Page) => page.ev(`Number((/([\\d,]+) MP/.exec(document.querySelector('.de-shop-grid')?.parentElement?.innerText ?? '')?.[1] ?? '-1').replaceAll(',',''))`) as Promise<number>;
const turn = (page:Page) => page.ev(`Number(/Turn (\\d+)/.exec(document.querySelector('.de-phase-bar')?.getAttribute('aria-label')??'')?.[1]??0)`) as Promise<number>;
const board = (page:Page) => page.ev(`JSON.stringify({lp:[...document.querySelectorAll('.de-lp-value')].map(n=>n.textContent),cards:[...document.querySelectorAll('.de-field-card')].map(b=>b.getAttribute('aria-label')).sort()})`) as Promise<string>;
/** Surrender and confirm, tolerating a prompt that re-renders under the press; returns how many Surrender presses the
 * server needed (more than one means an unanswered request). */
async function giveUp(page:Page):Promise<number> {
  const done = `[...document.querySelectorAll('button')].some(b=>b.textContent==='Return to Lobby')`;
  const yes = `[...document.querySelectorAll('button')].find(b=>b.dataset.key?.startsWith('prompt-option:')&&b.textContent==='Yes'&&!b.disabled)`;
  let presses = 0, last = 0;
  for (let i = 0; i < 600 && !(await page.ev(done)); i++) {
    if (await page.ev(`Boolean(${yes})`)) { await press(page,yes).catch(() => {}); }
    else if (Date.now() - last > 15000 && await page.ev(`Boolean(${byText('Surrender')})`)) { await press(page,byText('Surrender')).catch(() => {}); presses++; last = Date.now(); }
    await sleep(150);
  }
  await until(page,done,5000);
  return presses;
}
async function online(page:Page,name:string) {
  await page.send('Page.enable'); await page.send('Page.addScriptToEvaluateOnNewDocument',{ source:NET_PROBE });
  await openClient(page,await signIn(name));
}

describe.skipIf(!enabled)('reconnects, failures and stale replies on the real local stack',() => {
  it('resumes the tunnel in the lobby, shop, deck editor and duel without duplicate chat, purchases or duel input',async () => {
    try {
      const page = await openPage(); await online(page,`TestRr${RUN}`);
      const me = `Res ${RUN}`; await enterWorld(page,me);
      // Lobby: one message sent and the socket dropped before the server's echo; another after the resume.
      const first = `before-drop ${RUN}`, second = `after-resume ${RUN}`;
      await type(page,byKey('chat'),first);
      await page.ev(`(()=>{${byText('Send')}.click();${live}.close();})()`);
      await resumed(page);
      await chat(page,second);
      await until(page,`[...document.querySelectorAll('.de-chat-line')].some(l=>l.textContent.includes(${JSON.stringify(second)}))`,20000);
      await sleep(1500);
      const lines = await chatLines(page);
      const count = (m:string) => lines.filter(l => l.includes(m)).length;
      expect([count(first),count(second)]).toEqual([1,1]);
      const lobbyStatuses = await page.ev(`window.__net.statuses.join(' → ')`);
      // Shop: a purchase whose collection refresh rides a dropped tunnel is charged and granted once.
      const copies = await collection(page);
      await click(page,'Shop'); await until(page,`document.querySelectorAll('.de-shop-item h3').length>0`,60000); await sleep(800);
      const before = await mp(page);
      await press(page,`[...document.querySelectorAll('.de-shop-item button')].find(b=>b.textContent==='Purchase')`);
      await drop(page);
      await resumed(page);
      await until(page,`document.querySelector('[data-key="shop-receipt"]')&&!document.querySelector('[role=alert]')&&!document.querySelector('[aria-busy=true]')`,30000).catch(async e => { throw new Error(JSON.stringify(await page.ev(`({receipt:!!document.querySelector('[data-key="shop-receipt"]'),alerts:[...document.querySelectorAll('[role=alert]')].map(a=>a.textContent),busy:!!document.querySelector('[aria-busy=true]'),statuses:window.__net.statuses})`))); });
      const receipt = await page.ev(`document.querySelector('[data-key="shop-receipt"] summary').textContent`) as string;
      const after = await mp(page);
      expect(before - after).toBe(200);
      const granted = await collection(page);
      await click(page,'Shop'); await until(page,`document.querySelectorAll('.de-shop-item h3').length>0`,60000); await sleep(800);
      expect(await mp(page)).toBe(after);
      expect(granted).toBeGreaterThan(copies);
      // Deck editor: the collection reloads over a resumed tunnel.
      await click(page,'Edit Deck'); await until(page,`document.querySelectorAll('[data-key^="collection-card:"]').length>0`,60000);
      await drop(page); await resumed(page);
      await click(page,'Lobby'); await until(page,byKey('lobby-npcs'),60000);
      const again = await collection(page);
      expect(again).toBe(granted);
      // Duel: drop during the player's own main phase; one End Turn after the resume ends exactly one turn.
      await click(page,'Lobby'); await until(page,byKey('lobby-npcs'),60000);
      await startNpcDuel(page,'Yami Yugi');
      let mine = false;
      for (let i = 0; i < 400 && !mine; i++) {
        mine = await page.ev(`Boolean(${byText('End Turn')})&&!document.querySelector('.de-duel-prompt')`) as boolean;
        if (!mine && await duelBot(page,{ attack:false,summon:false }) === 'finished') break;
        if (!mine) await sleep(150);
      }
      expect(mine).toBe(true);
      const t0 = await turn(page), b0 = await board(page);
      await drop(page); await resumed(page);
      expect(await board(page)).toBe(b0);
      // End Turn pressed while the tunnel is down: the input waits for the resume and is sent once.
      await page.ev(`(()=>{${live}.close();${byText('End Turn')}.click();})()`);
      const heldWhile = await connection(page);
      await resumed(page);
      await until(page,`Number(/Turn (\\d+)/.exec(document.querySelector('.de-phase-bar')?.getAttribute('aria-label')??'')?.[1]??0)>${t0}`,60000);
      const t1 = await turn(page);
      expect(t1).toBe(t0 + 1);
      const log = await page.ev(`[...document.querySelectorAll('.de-duel-log div')].map(d=>d.textContent)`) as string[];
      const ends = log.filter(l => l === `${me} ends the turn.`).length;
      await screenshot(page,'resilience-duel-resumed');
      await surrender(page);
      const result = await page.ev(`document.querySelector('.de-duel-end')?.getAttribute('aria-label')`);
      expect(result).toBe('Defeat');
      const resumes = await page.ev(`window.__net.urls.filter(u=>u.includes('resume=1')).length`) as number;
      expect(resumes).toBeGreaterThanOrEqual(4);
      record('reconnect.resume',{ actions:'Drop the game WebSocket: with a chat message in flight (lobby), right after Purchase (shop), in the deck editor, and in the duel on my main phase; then chat, re-read MP/collection, End Turn once, surrender',
        expected:'Tunnel resume keeps channels and sequences; no duplicate chat, purchase or duel input',
        observed:`${resumes} resumed tunnels; lobby ${lobbyStatuses}; "${first}" ×${count(first)}, "${second}" ×${count(second)}; MP ${before} → ${after} (one 200 MP pack, "${receipt}"), collection ${copies} → ${granted} copies, unchanged after the deck-editor drop (${again}); duel turn ${t0} → ${t1} after one End Turn pressed while the tunnel was ${heldWhile} (board unchanged by an earlier drop, "${me} ends the turn." ×${ends} in the log), surrender → ${result}` });
    } finally { closeAll(); }
  },600000);
  it('offers a clean new connection after a rejected or expired resume',async () => {
    try {
      const page = await openPage(); await online(page,`TestRx${RUN}`);
      const me = `Rex ${RUN}`; await enterWorld(page,me);
      // Rejected: the resume arrives with a tunnel id the server does not hold.
      await page.ev(`window.__net.rewrite=u=>u.includes('resume=1')?u.replace(/sid=[0-9a-f]+/,'sid=${'0'.repeat(32)}'):u`);
      await drop(page);
      await until(page,`document.querySelector('.de-connection.error,.de-connection.offline')`,30000);
      await until(page,`${byText('Go Online')}`,30000);
      const rejected = await page.ev(`[...document.querySelectorAll('[role=alert]')].map(a=>a.textContent).join(' | ')`) as string;
      const rejectedScene = await page.ev(`document.querySelector('.de-client').dataset.scene`);
      await screenshot(page,'resilience-resume-rejected');
      await page.ev(`window.__net.rewrite=null`);
      const sockets0 = await page.ev(`window.__net.sockets.length`) as number;
      let t0 = Date.now(); await reenterWorld(page,me); const wait1 = Math.round((Date.now() - t0) / 1000);
      const fresh = await page.ev(`window.__net.urls.slice(${sockets0}).every(u=>!u.includes('resume=1'))`);
      expect(fresh).toBe(true);
      await chat(page,`fresh-after-reject ${RUN}`);
      await until(page,`[...document.querySelectorAll('.de-chat-line')].filter(l=>l.textContent.includes('fresh-after-reject ${RUN}')).length===1`,20000);
      // Expired: every retry is refused until the client's 40-second resume window ends.
      await page.ev(`window.__net.rewrite=u=>u.includes('resume=1')?u.replace(/\\/\\/[^/]+\\//,'//127.0.0.1:1/'):u`);
      const t = Date.now(); await drop(page);
      await until(page,`document.querySelector('.de-connection.error,.de-connection.offline')`,70000);
      const window_ = Math.round((Date.now() - t) / 1000);
      await until(page,`${byText('Go Online')}`,30000);
      const expired = await page.ev(`[...document.querySelectorAll('[role=alert]')].map(a=>a.textContent).join(' | ')`) as string;
      const retries = await page.ev(`window.__net.urls.filter(u=>u.includes('127.0.0.1:1/')).length`) as number;
      await page.ev(`window.__net.rewrite=null`);
      t0 = Date.now(); await reenterWorld(page,me); const wait2 = Math.round((Date.now() - t0) / 1000);
      await chat(page,`fresh-after-expiry ${RUN}`);
      await until(page,`[...document.querySelectorAll('.de-chat-line')].filter(l=>l.textContent.includes('fresh-after-expiry ${RUN}')).length===1`,20000);
      const stale = await page.ev(`[...document.querySelectorAll('.de-chat-line')].filter(l=>l.textContent.includes('fresh-after-reject ${RUN}')).length`) as number;
      record('reconnect.expired',{ actions:'Drop the tunnel and answer its resume with an unknown tunnel id; Go Online again and chat. Drop it again and refuse every resume connection; Go Online again and chat',
        expected:'A rejected or expired resume clears stale channels and offers a working new connection',
        observed:`rejected: "${rejected}" on the ${rejectedScene} screen with Go Online, a fresh (non-resume) connection re-entered as ${me} in ${wait1} s (the server's 45 s hold of the old tunnel waited out) and chatted once; expired after ${window_} s and ${retries} refused retries: "${expired}", Go Online re-entered in ${wait2} s and chatted once; old chat lines shown ${stale} times after the new session` });
    } finally { closeAll(); }
  },600000);

  it('reloads during the lobby, shop, deck editor and duel and re-enters without stale state',async () => {
    try {
      const page = await openPage(); await online(page,`TestRl${RUN}`);
      const me = `Rel ${RUN}`; await enterWorld(page,me);
      const reload = async () => { await page.go(`${CLIENT}/?portOffset=1000&assets=/game-assets/`,`document.querySelector('.de-client')`); await reenterWorld(page,me); };
      const seen:string[] = [];
      await reload(); seen.push(`lobby: ${await page.ev(`document.querySelector('.de-client').dataset.scene`)}`);
      await click(page,'Shop'); await until(page,`document.querySelectorAll('.de-shop-item h3').length>0`,60000);
      const mp0 = await mp(page);
      await reload(); await click(page,'Shop'); await until(page,`document.querySelectorAll('.de-shop-item h3').length>0`,60000); await sleep(600);
      expect(await mp(page)).toBe(mp0); seen.push(`shop: ${await mp(page)} MP`);
      const copies = await collection(page);
      await reload(); const copies2 = await collection(page);
      expect(copies2).toBe(copies); seen.push(`deck: ${copies2} copies`);
      await click(page,'Lobby'); await until(page,byKey('lobby-npcs'),60000);
      await startNpcDuel(page,'Yami Yugi');
      await until(page,`document.querySelectorAll('.de-field-card').length>=10`,60000);
      await page.ev(`sessionStorage.removeItem('net-closed')`);
      await reload();
      const goodbye = await page.ev(`sessionStorage.getItem('net-closed')`);
      // The abandoned duel's channel is gone: no duel screen or prompt, and a new duel starts normally.
      const after = { scene:await page.ev(`document.querySelector('.de-client').dataset.scene`), duelNav:await page.ev(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Duel')`), field:await page.ev(`document.querySelectorAll('.de-field-card').length`) };
      expect(after).toEqual({ scene:'lobby',duelNav:false,field:0 });
      if (process.env.WAIT_HOLD) await sleep(50000);
      await startNpcDuel(page,'Yami Yugi');
      await until(page,`document.querySelectorAll('.de-field-card').length>=10`,60000);
      const lp = await page.ev(`[...document.querySelectorAll('.de-lp-value')].map(n=>n.textContent).join('/')`);
      expect(lp).toBe('8,000/8,000');
      const presses = await giveUp(page);
      const result = await page.ev(`document.querySelector('.de-duel-end')?.getAttribute('aria-label')`);
      seen.push(`duel: reload (closing ${goodbye}) → ${after.scene} with ${after.field} field cards; new duel at ${lp} → ${result} (${presses} Surrender press${presses === 1 ? '' : 'es'})`);
      const errors = await page.ev(`[...document.querySelectorAll('[role=alert]')].map(a=>a.textContent).join(' | ')`);
      record('reconnect.scenes',{ actions:'Reload the page in the lobby, the shop, the deck editor and an NPC duel; Go Online and select the character each time; start a new duel',
        expected:'Re-entry after reload restores each scene without stale subscriptions',
        observed:`${seen.join('; ')}; alerts: "${errors}"` });
    } finally { closeAll(); }
  },600000);
});
