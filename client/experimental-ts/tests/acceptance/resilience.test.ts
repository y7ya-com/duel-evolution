import { describe, expect, it } from 'vitest';
import { RUN, CLIENT, enabled, openPage, closeAll, signIn, openClient, enterWorld, reenterWorld, click, until, press, type, sleep, screenshot, record, byKey, byText, startNpcDuel, surrender, duelBot, type Page } from './harness';

/** Records the client's game WebSockets (one per tunnel; a resume opens another) without changing them. `rewrite`
 * redirects later connections (a refused port, a black hole, a forged resume id) as a broken network would. Binary
 * frames are kept per virtual channel so a test can append a frame of its own to a channel's stream. */
const NET_PROBE = `(()=>{const N=window.__net={sockets:[],urls:[],frames:new Map(),statuses:[],rewrite:null};const W=window.WebSocket;
window.WebSocket=class extends W{constructor(u,p){u=String(u);if(N.rewrite)u=N.rewrite(u);N.urls.push(u.replace(/sid=[0-9a-f]+/,'sid=…'));super(u,p);N.sockets.push(this);
this.addEventListener('message',e=>{if(e.data instanceof ArrayBuffer){const b=new Uint8Array(e.data);if(b[0]===1){const id=new DataView(e.data).getUint32(1);let a=N.frames.get(id);if(!a)N.frames.set(id,a=[]);a.push(b.slice(5));}}});}};
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
});
