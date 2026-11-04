import { describe, expect, it } from 'vitest';
import { createServer, type Socket } from 'node:net';
import { RUN, CLIENT, enabled, openPage, closeAll, signIn, openClient, enterWorld, reenterWorld, click, until, press, type, sleep, screenshot, record, byKey, byText, startNpcDuel, duelBot, claimNpcReward, type Page, createCharacter, freeSlot, say, chatLines } from './harness';
/** Main Menu entries (Lobby, Edit Deck, Shop, Disconnect, ...) live behind the menu bar's Menu key; a click without
 * the pointer, for steps where a reply is being held and the pointer guard must not delay the click. */
async function openMenu(page:Page) { if (!(await page.ev(`Boolean(${byText('Return to Lobby')}||${byText('Edit Deck')})`))) await press(page,`document.querySelector('[data-key="main-menu"]')`); }
async function menuClick(page:Page,label:string) { await openMenu(page); await until(page,byText(label),30000); await page.ev(`${byText(label)}.click()`); }

/** Records the client's game WebSockets (one per tunnel; a resume opens another) without changing them. `rewrite`
 * redirects later connections (a refused port, a black hole, a forged resume id) as a broken network would. Binary
 * frames are kept per virtual channel so a test can append a frame of its own to a channel's stream. */
const NET_PROBE = `(()=>{const N=window.__net={sockets:[],urls:[],frames:new Map(),statuses:[],rewrite:null};const W=window.WebSocket;
window.WebSocket=class extends W{constructor(u,p){u=String(u);if(N.rewrite)u=N.rewrite(u);N.urls.push(u.replace(/sid=[0-9a-f]+/,'sid=…'));super(u,p);N.sockets.push(this);
const send=this.send.bind(this);this.send=d=>{if(typeof d==='string'&&d.includes('"close"')){try{sessionStorage.setItem('net-closed',(sessionStorage.getItem('net-closed')??'')+d);}catch{}}return send(d);};this.addEventListener('message',e=>{if(e.data instanceof ArrayBuffer){const b=new Uint8Array(e.data);if(b[0]===1){const id=new DataView(e.data).getUint32(1);let a=N.frames.get(id);if(!a)N.frames.set(id,a=[]);a.push(b.slice(5));}}});}};
const F=window.fetch;N.http={fail:null,delay:null,log:[]};window.fetch=async(input,init)=>{const url=String(input?.url??input);const h=N.http;
if(h.fail&&h.fail.test(url)){h.log.push('fail '+url);return new Response(JSON.stringify({error:'Internal error'}),{status:500,headers:{'content-type':'application/json'}});}
if(h.delay&&h.delay.test(url)){h.log.push('delay '+url);await new Promise(r=>h.release=r);}return F(input,init);};
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
async function chat(page:Page,message:string) { await say(page,message); }
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
/** Rewrites the next server frames on the live socket the way a faulty server or proxy would: every frame is parsed with
 * the client's own codec and packed again; the first message matching `match` is replaced by `change` (same sequence
 * number, fresh valid digest), so the client sees a well-formed packet with a malformed or unknown payload. */
async function tamper(page:Page,match:string,change:string) {
  await page.ev(`(async()=>{const c=await import('/src/network/codec.ts');const ws=${live},h=ws.onmessage,readers=new Map();let done=false;window.__net.tampered=null;
    const match=${match},change=${change};
    ws.onmessage=e=>{if(!(e.data instanceof ArrayBuffer))return h(e);const b=new Uint8Array(e.data);if(b[0]!==1)return h(e);const id=new DataView(e.data).getUint32(1);
      let r=readers.get(id);if(!r)readers.set(id,r=new c.PacketReader());const msgs=r.feed(b.slice(5));if(!msgs.length)return;
      const out=msgs.map(m=>{if(!done&&match(m)){const n=change(m);done=true;window.__net.tampered={id:m.id.toString(16),param:m.param,from:m.data.length,to:n.data.length,as:n.id.toString(16)};return c.pack(n.id,n.data,m.param);}return c.pack(m.id,m.data,m.param);});
      const payload=c.concat(...out),f=new Uint8Array(payload.length+5);f[0]=1;new DataView(f.buffer).setUint32(1,id);f.set(payload,5);h(new MessageEvent('message',{data:f.buffer}));};})()`);
}
/** One raw frame on the channel that last carried server data. */
async function inject(page:Page,build:string) {
  await page.ev(`(async()=>{const c=await import('/src/network/codec.ts');const ids=[...window.__net.frames.keys()];const id=ids.at(-1);const bytes=(${build})(c);
    const f=new Uint8Array(bytes.length+5);f[0]=1;new DataView(f.buffer).setUint32(1,id);f.set(bytes,5);${live}.onmessage(new MessageEvent('message',{data:f.buffer}));})()`);
}
const alerts = (page:Page) => page.ev(`[...document.querySelectorAll('[role=alert]')].map(a=>a.textContent).join(' | ')`) as Promise<string>;
async function lostToTitle(page:Page) {
  await until(page,`document.querySelector('.de-client').dataset.scene==='title'&&${byText('Go Online')}`,30000);
  return alerts(page);
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
      await page.ev(`(()=>{${byKey('chat')}.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));${live}.close();})()`);   // Enter, then the drop in the same task
      await resumed(page);
      await chat(page,second);
      await until(page,`[...document.querySelectorAll('#htmlui-host [role="log"] > div')].some(l=>l.textContent.includes(${JSON.stringify(second)}))`,20000);
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
      await click(page,'Return to Lobby'); await until(page,byKey('lobby-npcs'),60000);
      const again = await collection(page);
      expect(again).toBe(granted);
      // Duel: drop during the player's own main phase; one End Turn after the resume ends exactly one turn.
      await click(page,'Return to Lobby'); await until(page,byKey('lobby-npcs'),60000);
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
      // The server may ask chain questions on the way to the end of the turn: decline them; End Turn is never pressed again.
      const no = `[...document.querySelectorAll('.de-duel-prompt button')].find(b=>b.dataset.key?.startsWith('prompt-option:')&&b.textContent==='No'&&!b.disabled)`;
      let declined = 0;
      for (let i = 0; i < 400 && await turn(page) <= t0; i++) { if (await page.ev(`Boolean(${no})`)) { await press(page,no).catch(() => {}); declined++; } await sleep(150); }
      const t1 = await turn(page);
      expect(t1).toBe(t0 + 1);
      const log = await page.ev(`[...document.querySelectorAll('.de-duel-log div')].map(d=>d.textContent)`) as string[];
      const ends = log.filter(l => l === `${me} ends the turn.`).length;
      await screenshot(page,'resilience-duel-resumed');
      const presses = await giveUp(page);
      const result = await page.ev(`document.querySelector('.de-duel-end')?.getAttribute('aria-label')`);
      expect(result).toBe('Defeat');
      const resumes = await page.ev(`window.__net.urls.filter(u=>u.includes('resume=1')).length`) as number;
      expect(resumes).toBeGreaterThanOrEqual(4);
      record('reconnect.resume',{ actions:'Drop the game WebSocket: with a chat message in flight (lobby), right after Purchase (shop), in the deck editor, and in the duel on my main phase; then chat, re-read MP/collection, End Turn once, surrender',
        expected:'Tunnel resume keeps channels and sequences; no duplicate chat, purchase or duel input',
        observed:`${resumes} resumed tunnels; lobby ${lobbyStatuses}; "${first}" ×${count(first)}, "${second}" ×${count(second)}; MP ${before} → ${after} (one 200 MP pack, "${receipt}"), collection ${copies} → ${granted} copies, unchanged after the deck-editor drop (${again}); duel turn ${t0} → ${t1} after one End Turn pressed while the tunnel was ${heldWhile} (${declined} chain question${declined === 1 ? '' : 's'} declined) (board unchanged by an earlier drop, "${me} ends the turn." ×${ends} in the log), surrender (${presses} press${presses === 1 ? '' : 'es'}) → ${result}` });
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
      await until(page,`[...document.querySelectorAll('#htmlui-host [role="log"] > div')].filter(l=>l.textContent.includes('fresh-after-reject ${RUN}')).length===1`,20000);
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
      await until(page,`[...document.querySelectorAll('#htmlui-host [role="log"] > div')].filter(l=>l.textContent.includes('fresh-after-expiry ${RUN}')).length===1`,20000);
      const stale = await page.ev(`[...document.querySelectorAll('#htmlui-host [role="log"] > div')].filter(l=>l.textContent.includes('fresh-after-reject ${RUN}')).length`) as number;
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
      await click(page,'Return to Lobby'); await until(page,byKey('lobby-npcs'),60000);
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
  it('turns timeouts, refusals, corrupt or truncated streams and malformed payloads into a clean, retryable state',async () => {
    const silent = createServer(socket => { held.push(socket); }), held:Socket[] = [];
    await new Promise<void>(r => silent.listen(0,'127.0.0.1',() => r()));
    const silentPort = (silent.address() as { port:number }).port;
    try {
      const page = await openPage(); await online(page,`TestRe${RUN}`);
      const me = `Err ${RUN}`;
      // Timeout: the server accepts the connection and never answers.
      await page.ev(`window.__net.rewrite=u=>u.replace(/\\/\\/[^/]+\\//,'//127.0.0.1:${silentPort}/')`);
      let t = Date.now(); await click(page,'Go Online');
      await until(page,`[...document.querySelectorAll('[role=alert]')].some(a=>/timed out/i.test(a.textContent))&&${byText('Go Online')}`,40000);
      const timeout = `${await alerts(page)} after ${Math.round((Date.now() - t) / 1000)} s`;
      // Refusal: nothing listens on the port.
      await page.ev(`window.__net.rewrite=u=>u.replace(/\\/\\/[^/]+\\//,'//127.0.0.1:1/')`);
      t = Date.now(); await click(page,'Go Online');
      await until(page,`[...document.querySelectorAll('[role=alert]')].some(a=>/closed|refused|failed/i.test(a.textContent))&&${byText('Go Online')}`,30000);
      const refused = `${await alerts(page)} after ${Math.round((Date.now() - t) / 1000)} s`;
      expect(await connection(page)).not.toBe('online');
      await page.ev(`window.__net.rewrite=null`);
      await enterWorld(page,me);
      // A packet whose digest does not match its bytes.
      await inject(page,`c=>{const p=c.pack(0x5300,new Uint8Array(10),1);p[9]^=0xff;return p;}`);
      const digest = await lostToTitle(page);
      expect(digest).toMatch(/integrity/i);
      await reenterWorld(page,me);
      // A packet from the future: its sequence number skips ahead.
      await inject(page,`c=>c.pack(0x5300,new Uint8Array(10),0x7fff0000)`);
      const gap = await lostToTitle(page);
      expect(gap).toMatch(/sequence gap/i);
      await reenterWorld(page,me);
      // A truncated packet: the rest of the stream no longer lines up with its framing.
      await inject(page,`c=>c.pack(0x5300,new Uint8Array(10),1).slice(0,11)`);
      // The next server packet (or this chat's echo) is read against the broken framing.
      if (await page.ev(`Boolean(${byKey('chat')})`)) await chat(page,`after-truncation ${RUN}`).catch(() => {});
      const truncated = await lostToTitle(page);
      await reenterWorld(page,me);
      // Malformed inventory: a collection row block of the wrong width mid-transaction; the collection is unchanged.
      const copies = await collection(page);
      await click(page,'Return to Lobby'); await until(page,byKey('lobby-npcs'),60000);
      await tamper(page,`m=>m.id===0x3102`,`m=>({id:m.id,data:m.data.slice(0,m.data.length-2)})`);
      await click(page,'Edit Deck');
      const inventory = await lostToTitle(page);
      const tamperedTrunk = await page.ev(`JSON.stringify(window.__net.tampered)`);
      await reenterWorld(page,me);
      const copies2 = await collection(page);
      expect(copies2).toBe(copies);
      // Unsupported message: an unknown id on the lobby channel is ignored and the session carries on.
      await click(page,'Return to Lobby'); await until(page,byKey('lobby-npcs'),60000);
      await tamper(page,`m=>m.id!==0xca01`,`m=>({id:0x7ff0,data:m.data})`);
      await chat(page,`after-unknown ${RUN}`);
      await until(page,`window.__net.tampered`,20000);
      const unknown = await page.ev(`JSON.stringify(window.__net.tampered)`);
      await sleep(1500);
      const stillOnline = await connection(page);
      // Malformed duel message: the reducer rejects it whole (the board keeps its last good state), says so, and later
      // packets still apply.
      await startNpcDuel(page,'Yami Yugi');
      await until(page,`document.querySelectorAll('.de-field-card').length>=10`,60000); await sleep(1500);
      await tamper(page,`m=>[0x6461,0x6611,0x6612,0x6613,0x6610].includes(m.id)`,`m=>({id:m.id,data:m.data.slice(0,1)})`);
      let shown = '', boardBefore = '', boardAfter = '';
      for (let i = 0; i < 400 && !shown; i++) {
        if (!(await page.ev(`window.__net.tampered`))) boardBefore = await board(page);
        else if (!boardAfter) boardAfter = await board(page);
        shown = await page.ev(`[...document.querySelectorAll('.de-duel-issue, .de-duel-prompt p')].map(n=>n.textContent).find(t=>/could not be used|Unsupported gameplay/.test(t))??''`) as string;
        if (!shown) { await duelBot(page,{ attack:false,summon:false }); await sleep(120); }
      }
      const tamperedDuel = await page.ev(`JSON.stringify(window.__net.tampered)`);
      const turnAtIssue = await turn(page);
      for (let i = 0; i < 400 && await turn(page) <= turnAtIssue; i++) { if (await duelBot(page,{ attack:false,summon:false }) === 'finished') break; await sleep(150); }
      const turnAfter = await turn(page), duelConnection = await connection(page);
      if (!(await page.ev(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Return to Lobby')`))) await giveUp(page);
      await claimNpcReward(page);
      const reentered = await page.ev(`document.querySelector('.de-client').dataset.scene`);
      await screenshot(page,'resilience-protocol');
      record('errors.network',{ actions:'Go Online to a server that never answers, to a refused port; then in the lobby a packet with a bad digest, one with a skipped sequence number, and a truncated packet followed by chat',
        expected:'Timeout, refusal, truncated packets, invalid digest and sequence gaps surface actionable errors',
        observed:`timeout: "${timeout}"; refused: "${refused}"; digest: "${digest}"; gap: "${gap}"; truncated: "${truncated}"; each left a title screen with Go Online, and Go Online re-entered as ${me}` });
      record('errors.protocol',{ actions:'Server frames rewritten in flight with valid framing: a collection row block of the wrong width, an unknown message id, a truncated duel message',
        expected:'Malformed/unsupported payloads fail transactionally without partial board or inventory mutation',
        observed:`collection ${tamperedTrunk}: "${inventory}", collection ${copies} before and ${copies2} after re-entry; unknown ${unknown}: ignored, connection ${stillOnline}; duel ${tamperedDuel}: rejected whole and shown as "${shown}" (board ${boardBefore === boardAfter ? 'unchanged by it' : 'as left by the previous packet'}), the duel went on from turn ${turnAtIssue} to ${turnAfter} with the connection ${duelConnection}, then back to the ${reentered}` });
      expect(stillOnline).toBe('online');
      expect(shown).toMatch(/0x66|0x64/);
      expect(turnAfter).toBeGreaterThan(turnAtIssue);
    } finally { closeAll(); for (const s of held) s.destroy(); silent.close(); }
  },600000);
  it('shows retry or fallback states for unavailable data, HTTP and sign-in failures and missing art',async () => {
    try {
      const page = await openPage(); await page.send('Network.enable');
      // Game data the client could not load at start: listed in Options with a retry.
      await page.send('Network.setBlockedURLs',{ urls:['*/card-texts.json','*/npc-data.json'] });
      await online(page,`TestRa${RUN}`);
      await click(page,'Options'); await until(page,byKey('options-data'),30000);
      const missing = await page.ev(`document.querySelector('[data-key="options-data"]').innerText.replace(/\\s+/g,' ')`) as string;
      expect(missing).toMatch(/Card rules/); expect(missing).toMatch(/NPC dialogue/);
      await page.send('Network.setBlockedURLs',{ urls:[] });
      await click(page,'Retry loading game data');
      await until(page,`document.querySelector('[data-key="options-data"]')?.innerText.includes('Game data loaded.')`,30000);
      const reloaded = await page.ev(`document.querySelector('[data-key="options-data"]').innerText.replace(/\\s+/g,' ')`) as string;
      await click(page,'Back');
      const me = `Api ${RUN}`; await enterWorld(page,me);
      // An HTTP failure: the shop catalogue answers 500; the shop says so and Refresh recovers.
      await page.ev(`window.__net.http.fail=/\\/api\\/de\\/shop/`);
      await click(page,'Shop');
      await until(page,`[...document.querySelectorAll('[role=alert]')].length>0&&${byText('Refresh')}`,30000);
      const shopError = `${await page.ev(`[...document.querySelectorAll('[role=alert]')].map(a=>a.textContent).join(' | ')`)} / ${await page.ev(`document.querySelector('.de-panel p')?.textContent`)}`;
      await page.ev(`window.__net.http.fail=null`);
      await click(page,'Refresh');
      await until(page,`document.querySelectorAll('.de-shop-item h3').length>0`,30000);
      const shopRecovered = await page.ev(`document.querySelectorAll('.de-shop-item').length`) as number;
      // Missing art: the asset bridge is unreachable; cards and packs draw their own fallbacks, never broken images.
      await page.send('Network.setBlockedURLs',{ urls:['*/game-assets/*'] });
      await page.go(`${CLIENT}/?portOffset=1000&assets=/game-assets/`,`document.querySelector('.de-client')`);
      await reenterWorld(page,me);
      await click(page,'Shop'); await until(page,`document.querySelectorAll('.de-shop-item h3').length>0`,60000); await sleep(3000);
      const broken = `[...document.querySelectorAll('.de-client img')].filter(i=>i.getAttribute('src')&&i.complete&&i.naturalWidth===0&&getComputedStyle(i).visibility!=='hidden'&&i.getClientRects().length).length`;
      const shopBroken = await page.ev(broken) as number;
      await screenshot(page,'resilience-no-art-shop');
      await click(page,'Edit Deck'); await until(page,`document.querySelectorAll('[data-key^="collection-card:"]').length>0`,60000); await sleep(3000);
      const deckBroken = await page.ev(broken) as number;
      const deckNames = await page.ev(`[...document.querySelectorAll('[data-key^="collection-card:"]')].slice(0,3).map(b=>b.innerText.replace(/\\s+/g,' ').trim()).join(' / ')`);
      await screenshot(page,'resilience-no-art-deck');
      expect([shopBroken,deckBroken]).toEqual([0,0]);
      await page.send('Network.setBlockedURLs',{ urls:[] });
      // Signed out elsewhere: the session cookie is gone; the next account request asks to sign in again.
      await click(page,'Return to Lobby'); await until(page,byKey('lobby-npcs'),60000);
      await page.send('Network.clearBrowserCookies');
      await click(page,'Edit Deck');
      await until(page,`[...document.querySelectorAll('[role=alert]')].length>0`,30000);
      const authError = await page.ev(`[...document.querySelectorAll('[role=alert]')].map(a=>a.textContent).join(' | ')`) as string;
      await page.go(`${CLIENT}/?portOffset=1000&assets=/game-assets/`,`document.querySelector('.de-client')`);
      await until(page,`[...document.querySelectorAll('[role=status]')].some(s=>/Sign in/.test(s.textContent))`,30000);
      const signedOut = await page.ev(`[...document.querySelectorAll('[role=status]')].map(s=>s.textContent).find(t=>/Sign in/.test(t))`) as string;
      record('errors.api',{ actions:'Start with card rules and NPC dialogue blocked, then Retry in Options; shop catalogue answering 500, then Refresh; reload with the asset bridge blocked (shop, deck editor); clear the session cookie mid-session',
        expected:'HTTP/auth failures, unavailable data and missing assets show usable retry/fallback states',
        observed:`data: "${missing.slice(0,160)}" → retry: "${reloaded.slice(0,80)}"; shop 500: "${shopError}" → Refresh showed ${shopRecovered} items; no art: ${shopBroken} broken images in the shop, ${deckBroken} in the deck editor (cards drawn as "${deckNames}"); cookie cleared: "${authError}", after reload "${signedOut}"` });
    } finally { closeAll(); }
  },600000);

  it('keeps busy state, double clicks, navigation and late replies from acting twice or on the wrong session',async () => {
    try {
      const page = await openPage(); await online(page,`TestRc${RUN}`);
      // A double click on Go Online opens one connection.
      await until(page,byText('Go Online'),60000);
      const sockets0 = await page.ev(`window.__net.sockets.length`) as number;
      await page.ev(`(()=>{const b=${byText('Go Online')};b.click();b.click();})()`);
      await until(page,freeSlot,60000); await sleep(1000);
      const goOnline = (await page.ev(`window.__net.sockets.length`) as number) - sockets0;
      expect(goOnline).toBe(1);
      const me = `Con ${RUN}`;
      await createCharacter(page,me,{ wait:false });
      const slot = `[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes(${JSON.stringify(me)})&&!b.disabled)`;
      await until(page,slot,30000); await press(page,slot); await until(page,byKey('lobby-npcs'),60000);
      const starter = `[...document.querySelectorAll('section')].find(s=>s.querySelector('h2')?.textContent==='Choose your Starter Deck')?.querySelector('button')`;
      for (let i = 0; i < 30 && !(await page.ev(`Boolean(${starter})`)); i++) await sleep(100);
      if (await page.ev(`Boolean(${starter})`)) { await until(page,`!(${starter})?.disabled`,30000); await page.ev(`(()=>{const b=${starter};b.click();b.click();})()`); await until(page,`!document.body.innerText.includes('Choose your Starter Deck')`,30000); }
      // A double click on Purchase buys once; the busy shop says so.
      await click(page,'Shop'); await until(page,`document.querySelectorAll('.de-shop-item h3').length>0`,60000); await sleep(800);
      const before = await mp(page);
      const purchase = `[...document.querySelectorAll('.de-shop-item button')].find(b=>b.textContent==='Purchase')`;
      await until(page,purchase,30000);
      const busy = await page.ev(`(async()=>{const b=${purchase};b.click();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const busy=document.querySelector('[aria-busy]')?.getAttribute('aria-busy')+'/'+(${purchase})?.disabled;b.click();return busy;})()`);
      await until(page,`document.querySelector('[data-key="shop-receipt"]')&&document.querySelector('[aria-busy]')?.getAttribute('aria-busy')==='false'`,30000); await sleep(1000);
      const after = await mp(page);
      const busyNote = await page.ev(`[...document.querySelectorAll('[role=alert]')].map(a=>a.textContent).join(' | ')`);
      expect(before - after).toBe(200);
      // Navigation while a reply is pending: the shop is requested, the player opens the deck editor, the late
      // shop reply does not take the screen back.
      await click(page,'Return to Lobby'); await until(page,byKey('lobby-npcs'),60000);
      await page.ev(`window.__net.http.delay=/\\/api\\/de\\/shop/`);
      // Shop is a Main Menu entry: open the menu, then click without the pointer (the reply is being held).
      await menuClick(page,'Shop');
      await until(page,`window.__net.http.release`,10000);
      await openMenu(page);
      const navBusy = await page.ev(`[...document.querySelectorAll('button')].filter(b=>['Edit Deck','Return to Lobby'].includes(b.textContent)).map(b=>b.disabled).join()`);
      await page.ev(`window.__net.http.delay=null;window.__net.http.release();window.__net.http.release=null`);
      await until(page,`document.querySelectorAll('.de-shop-item h3').length>0`,30000);
      // Disconnect with a reply outstanding, go online again: the old session's late reply is dropped.
      await click(page,'Return to Lobby'); await until(page,byKey('lobby-npcs'),60000);
      await page.ev(`window.__net.http.delay=/\\/api\\/de\\/(shop|decks)/`);
      await menuClick(page,'Edit Deck');
      await until(page,`window.__net.http.release`,10000);
      await menuClick(page,'Return to Title');
      await until(page,byText('Go Online'),30000);
      const pending = await page.ev(`window.__net.http.log.filter(l=>l.startsWith('delay')).length`) as number;
      await page.ev(`window.__net.http.delay=null`);
      await reenterWorld(page,me);
      await page.ev(`window.__net.http.release?.()`); await sleep(2500);
      const late = { scene:await page.ev(`document.querySelector('.de-client').dataset.scene`), alerts:await page.ev(`[...document.querySelectorAll('[role=alert]')].map(a=>a.textContent).join(' | ')`) };
      expect(late).toEqual({ scene:'lobby',alerts:'' });
      record('errors.concurrency',{ actions:'Double-click Go Online, the starter deck and Purchase; request the shop with its reply held and try to navigate; open the deck editor with its reply held, Disconnect, go online again, then let the old reply arrive',
        expected:'Busy state, duplicate clicks, navigation and late replies cannot apply to the wrong session',
        observed:`Go Online ×2 → ${goOnline} connection; Purchase ×2 → MP ${before} → ${after} (aria-busy/disabled ${busy} a frame after the first click${busyNote ? `, "${busyNote}"` : ''}); while the shop reply was held Edit Deck/Lobby disabled = ${navBusy}; ${pending} held replies across a Disconnect/Go Online: after release the new session stayed on ${late.scene}${late.alerts ? ` ("${late.alerts}")` : ' with no alert'}` });
    } finally { closeAll(); }
  },600000);
});
