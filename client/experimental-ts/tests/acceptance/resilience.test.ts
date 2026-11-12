import { describe, expect, it } from 'vitest';
import { createServer, type Socket } from 'node:net';
import { surrenderRow, RUN, CLIENT, enabled, openPage, closeAll, signIn, openClient, enterWorld, reenterWorld, click, until, press, type, sleep, screenshot, record, byKey, byText, goOnlineButton, startNpcDuel, duelBot, claimNpcReward, type Page, createCharacter, freeSlot, say, chatLines, lobbyShown, openDeckEditor, exitDeckEditor, deckShown, SHOP, openShop, leaveShop, shopWallet, shopPacks, shopBuyKey, takeReveal } from './harness';
import { resultShown } from './harness';
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
if(h.delay&&h.delay.test(url)){h.log.push('delay '+url);await new Promise(r=>{(h.held=h.held||[]).push(r);h.release=()=>h.held.splice(0).forEach(f=>f());});}return F(input,init);};
setInterval(()=>{const c=window.__deApp?.getState?.().connection??(document.querySelector('[data-key="net-reconnecting"]')?'reconnecting':null);if(c&&N.statuses.at(-1)!==c)N.statuses.push(c);},10);})()`;
/** The client's connection state (the app's, which its reconnect notice "Connection lost. Reconnecting…" shows). */
const CONN = `window.__deApp?.getState?.().connection`;
const live = `window.__net.sockets.at(-1)`;
const connection = (page:Page) => page.ev(`${CONN}`) as Promise<string>;
/** The connection drops as a network failure would: the client's socket closes under it. */
async function drop(page:Page) { await page.ev(`${live}.close()`); }
async function resumed(page:Page,timeout = 30000) {
  await until(page,`window.__net.statuses.includes('reconnecting')`,timeout);
  await until(page,`${CONN}==='online'&&!document.querySelector('[data-key="net-reconnecting"]')&&window.__net.urls.at(-1).includes('resume=1')&&${live}.readyState===1`,timeout);
}
/** Every owned copy in the deck screen's trunk (main's CWindowModelKaban: the character's cards and their counts). */
async function collection(page:Page):Promise<number> {
  const deck = await openDeckEditor(page); await sleep(600); await exitDeckEditor(page);
  return deck.collection.reduce((n,c) => n + c.owned,0);
}
const TRUNK = `document.querySelectorAll('[data-zone="trunk"][data-passcode]').length>0`;
/** Back to the lobby: main's deck screen leaves through its EXIT, other screens through Return to Lobby. */
async function backToLobby(page:Page) {
  if (await page.ev(lobbyShown)) return;
  if (await page.ev(deckShown)) await exitDeckEditor(page); else { await backToLobby(page); }
}
async function chat(page:Page,message:string) { await say(page,message); }
const turn = (page:Page) => page.ev(`Number(/Turn (\\d+)/.exec(document.querySelector('.de-phase-bar')?.getAttribute('aria-label')??'')?.[1]??0)`) as Promise<number>;
const board = (page:Page) => page.ev(`JSON.stringify({lp:[...document.querySelectorAll('.de-lp-value')].map(n=>n.textContent),cards:[...document.querySelectorAll('.de-field-card')].map(b=>b.getAttribute('aria-label')).sort()})`) as Promise<string>;
/** Surrender and confirm, tolerating a prompt that re-renders under the press; returns how many Surrender presses the
 * server needed (more than one means an unanswered request). */
async function giveUp(page:Page):Promise<number> {
  const done = resultShown;
  const yes = `[...document.querySelectorAll('button')].find(b=>b.dataset.key?.startsWith('prompt-option:')&&b.textContent==='Yes'&&!b.disabled)`;
  // main's own Surrender question first (the client's YesNo, surrender-yes), then the server's when it asks one
  const ask = `[...document.querySelectorAll('button')].find(b=>b.dataset.key==='surrender-yes'&&!b.disabled)`;
  let presses = 0, last = 0;
  for (let i = 0; i < 600 && !(await page.ev(done)); i++) {
    if (await page.ev(`Boolean(${ask})`)) { await press(page,ask).catch(() => {}); }
    else if (await page.ev(`Boolean(${yes})`)) { await press(page,yes).catch(() => {}); }
    else if (Date.now() - last > 15000) { const row = await surrenderRow(page).catch(() => null); if (row && await page.ev(`Boolean(${row})`)) { await press(page,row).catch(() => {}); presses++; } last = Date.now(); }
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
  await until(page,`document.querySelector('.de-client').dataset.scene==='title'&&${goOnlineButton}`,30000);
  return alerts(page);
}
/** main's error dialog (CWindowModelDialogError: a connection that failed, a refused request), as the original shows
 * it over the title or the game: a player reads it and presses OK before going on. */
async function dismissError(page:Page) { if (await page.ev(`Boolean(${byKey('error-ok')})`)) { await press(page,byKey('error-ok')); await sleep(300); } }
async function goOnline(page:Page) { await dismissError(page); await click(page,'Go Online',60000); }
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
      await openShop(page); await press(page,`${SHOP}.querySelector('[data-k=tab-packs]')`); await sleep(600);
      const before = (await shopWallet(page)).total, pack = (await shopPacks(page)).find(p => p.unit === 'pack' && !p.disabled)!;
      expect(pack).toBeTruthy();
      await press(page,shopBuyKey(pack.k));
      await drop(page);
      await resumed(page);
      const receipt = (await takeReveal(page)).summary;
      const after = (await shopWallet(page)).total;
      expect(before - after).toBe(pack.price);
      await leaveShop(page);
      const granted = await collection(page);
      await openShop(page);
      expect((await shopWallet(page)).total).toBe(after);
      await leaveShop(page);
      expect(granted).toBe(copies + 5);
      // Deck editor: the collection reloads over a resumed tunnel.
      await click(page,'Edit Deck'); await until(page,TRUNK,60000);
      await drop(page); await resumed(page);
      await backToLobby(page);
      const again = await collection(page);
      expect(again).toBe(granted);
      // Duel: drop during the player's own main phase; one End Turn after the resume ends exactly one turn.
      await backToLobby(page);
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
      const log = await page.ev(`[...document.querySelectorAll('.de-duel-log div')].map(d=>d.textContent)`) as string[];
      // the NPC's own turn can pass between two looks on a fast stack: then the turn shown is the player's next one (an
      // End Turn sent twice would have ended that one too)
      const newest = [...log].reverse().find(l => /^Turn \d+ - /.test(l));
      if (t1 === t0 + 2) expect(newest).toBe(`Turn ${t1} - ${me}'s turn`); else expect(t1).toBe(t0 + 1);
      const ends = log.filter(l => l === `${me} ends the turn.`).length;
      await screenshot(page,'resilience-duel-resumed');
      const presses = await giveUp(page);
      const result = await page.ev(`window.__duelEnd()`);
      expect(result).toBe('Defeat');
      const resumes = await page.ev(`window.__net.urls.filter(u=>u.includes('resume=1')).length`) as number;
      expect(resumes).toBeGreaterThanOrEqual(4);
      record('reconnect.resume',{ actions:'Drop the game WebSocket: with a chat message in flight (lobby), right after Purchase (shop), in the deck editor, and in the duel on my main phase; then chat, re-read MP/collection, End Turn once, surrender',
        expected:'Tunnel resume keeps channels and sequences; no duplicate chat, purchase or duel input',
        observed:`${resumes} resumed tunnels; lobby ${lobbyStatuses}; "${first}" ×${count(first)}, "${second}" ×${count(second)}; MP ${before} → ${after} (one 200 MP pack, "${receipt}"), collection ${copies} → ${granted} copies, unchanged after the deck-editor drop (${again}); duel turn ${t0} → ${t1} after one End Turn pressed while the tunnel was ${heldWhile} (${declined} chain question${declined === 1 ? '' : 's'} declined) (board unchanged by an earlier drop, "${me} ends the turn." ×${ends} in the log), surrender (${presses} press${presses === 1 ? '' : 'es'}) → ${result}` });
    } finally { closeAll(); }
  },600000);
  it('reconnects on a clean new connection after a rejected or expired resume',async () => {
    // Live (session.ts RECONNECT, the original's lobby retry): a resume the server refuses, or one that never comes back
    // within the 40 s window, is a lost transport: the client retries with a fresh (non-resume) connection on live's
    // 1/2/4/8/15 s backoff, signs in again, re-selects the character and returns to the lobby on its own. Go Online
    // follows only after 15 failed retries (tests/network-reconnect.test.ts drives that limit).
    try {
      const page = await openPage(); await online(page,`TestRx${RUN}`);
      const me = `Rex ${RUN}`; await enterWorld(page,me);
      const back = async (from:number) => {
        await until(page,`window.__net.statuses.slice(${from}).includes('reconnecting')`,70000);
        const t0 = Date.now();
        await until(page,`${CONN}==='online'&&${lobbyShown}&&!document.querySelector('[data-key="net-reconnecting"]')&&${live}.readyState===1&&!window.__net.urls.at(-1).includes('resume=1')`,180000);
        return Math.round((Date.now() - t0) / 1000);
      };
      // Rejected: the resume arrives with a tunnel id the server does not hold.
      await page.ev(`window.__net.rewrite=u=>u.includes('resume=1')?u.replace(/sid=[0-9a-f]+/,'sid=${'0'.repeat(32)}'):u`);
      let from = await page.ev(`window.__net.statuses.length`) as number;
      const sockets0 = await page.ev(`window.__net.sockets.length`) as number;
      await drop(page);
      await until(page,`window.__net.urls.slice(${sockets0}).some(u=>u.includes('resume=1'))`,30000);
      const wait1 = await back(from);
      await screenshot(page,'resilience-resume-rejected');
      const rejectedUrls = await page.ev(`window.__net.urls.slice(${sockets0}).map(u=>u.includes('resume=1')?'resume':'fresh').join(',')`) as string;
      await page.ev(`window.__net.rewrite=null`);
      await chat(page,`fresh-after-reject ${RUN}`);
      await until(page,`[...document.querySelectorAll('#htmlui-host [role="log"] > div')].filter(l=>l.textContent.includes('fresh-after-reject ${RUN}')).length===1`,20000);
      // Expired: every resume connection is refused until the client's 40-second resume window ends.
      await page.ev(`window.__net.rewrite=u=>u.includes('resume=1')?u.replace(/\\/\\/[^/]+\\//,'//127.0.0.1:1/'):u`);
      from = await page.ev(`window.__net.statuses.length`) as number;
      const t = Date.now(); await drop(page);
      const wait2 = await back(from);
      const window_ = Math.round((Date.now() - t) / 1000);
      const retries = await page.ev(`window.__net.urls.filter(u=>u.includes('127.0.0.1:1/')).length`) as number;
      expect(retries).toBeGreaterThan(0);
      await page.ev(`window.__net.rewrite=null`);
      await chat(page,`fresh-after-expiry ${RUN}`);
      await until(page,`[...document.querySelectorAll('#htmlui-host [role="log"] > div')].filter(l=>l.textContent.includes('fresh-after-expiry ${RUN}')).length===1`,20000);
      const stale = await page.ev(`[...document.querySelectorAll('#htmlui-host [role="log"] > div')].filter(l=>l.textContent.includes('fresh-after-reject ${RUN}')).length`) as number;
      expect(stale).toBeLessThanOrEqual(1);
      const scene = await page.ev(`document.querySelector('.de-client').dataset.scene`);
      expect(scene).toBe('lobby');
      record('reconnect.expired',{ actions:'Drop the tunnel and answer its resume with an unknown tunnel id; chat. Drop it again and refuse every resume connection; chat',
        expected:'A rejected or expired resume clears stale channels and reconnects on a working new connection (live: lobby retry, Go Online only after 15 failures)',
        observed:`rejected: connections ${rejectedUrls}, back in the lobby as ${me} on a fresh connection ${wait1} s after the retry began, chatted once; expired: ${retries} refused resume connections, back on a fresh connection after ${window_} s (${wait2} s of retry), chatted once; old chat lines shown ${stale} time(s)` });
    } finally { closeAll(); }
  },600000);
  it('reloads during the lobby, shop, deck editor and duel and re-enters without stale state',async () => {
    try {
      const page = await openPage(); await online(page,`TestRl${RUN}`);
      const me = `Rel ${RUN}`; await enterWorld(page,me);
      const reload = async () => { await page.go(`${CLIENT}/?portOffset=1000&assets=/game-assets/`,`document.querySelector('.de-client')`); await reenterWorld(page,me); };
      const seen:string[] = [];
      await reload(); seen.push(`lobby: ${await page.ev(`document.querySelector('.de-client').dataset.scene`)}`);
      await openShop(page);
      const mp0 = (await shopWallet(page)).total;
      await reload(); await openShop(page);
      expect((await shopWallet(page)).total).toBe(mp0); seen.push(`shop: ${mp0} MP`);
      await leaveShop(page);
      const copies = await collection(page);
      await reload(); const copies2 = await collection(page);
      expect(copies2).toBe(copies); seen.push(`deck: ${copies2} copies`);
      await backToLobby(page);
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
      const result = await page.ev(`window.__duelEnd()`);
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
      let t = Date.now(); await goOnline(page);
      await until(page,`[...document.querySelectorAll('[role=alert]')].some(a=>/timed out/i.test(a.textContent))&&${goOnlineButton}`,40000);
      const timeout = `${await alerts(page)} after ${Math.round((Date.now() - t) / 1000)} s`;
      // Refusal: nothing listens on the port.
      await page.ev(`window.__net.rewrite=u=>u.replace(/\\/\\/[^/]+\\//,'//127.0.0.1:1/')`);
      t = Date.now(); await goOnline(page);
      await until(page,`[...document.querySelectorAll('[role=alert]')].some(a=>/closed|refused|failed/i.test(a.textContent))&&${goOnlineButton}`,30000);
      const refused = `${await alerts(page)} after ${Math.round((Date.now() - t) / 1000)} s`;
      expect(await connection(page)).not.toBe('online');
      await page.ev(`window.__net.rewrite=null`);
      // main's error dialog over the title (the refusal): its OK first, as a player would
      await dismissError(page);
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
      await backToLobby(page);
      await tamper(page,`m=>m.id===0x3102`,`m=>({id:m.id,data:m.data.slice(0,m.data.length-2)})`);
      await click(page,'Edit Deck');
      const inventory = await lostToTitle(page);
      const tamperedTrunk = await page.ev(`JSON.stringify(window.__net.tampered)`);
      await reenterWorld(page,me);
      const copies2 = await collection(page);
      expect(copies2).toBe(copies);
      // Unsupported message: an unknown id on the lobby channel is ignored and the session carries on.
      await backToLobby(page);
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
      if (!(await page.ev(resultShown))) await giveUp(page);
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
      // Game data the client could not load at start: the app lists it and loads it again on reloadData (live's screens
      // have no such list: the dev app's state and command)
      await page.send('Network.setBlockedURLs',{ urls:['*/card-texts.json','*/npc-data.json'] });
      await online(page,`TestRa${RUN}`);
      await until(page,`window.__deApp.getState().dataStatus?.issues.length>0`,30000);
      const missing = (await page.ev(`window.__deApp.getState().dataStatus.issues`) as string[]).join(', ');
      expect(missing).toMatch(/Card rules/); expect(missing).toMatch(/NPC dialogue/);
      await page.send('Network.setBlockedURLs',{ urls:[] });
      await page.ev(`void window.__deApp.dispatch({ type:'reloadData' })`);
      await until(page,`window.__deApp.getState().dataStatus?.loading===false&&window.__deApp.getState().dataStatus.issues.length===0`,30000);
      const reloaded = 'Game data loaded.';
      const me = `Api ${RUN}`; await enterWorld(page,me);
      // An HTTP failure: the shop catalogue answers 500; the shop says so and Refresh recovers.
      await page.ev(`window.__net.http.fail=/\\/api\\/de\\/shop/`);
      // main's card shop says so in its page with Try again (the server's error text)
      await click(page,'Shop');
      const tryAgain = `[...(${SHOP}?.querySelectorAll('button') ?? [])].find(b=>b.textContent.trim()==='Try again'&&b.getClientRects().length)`;
      await until(page,tryAgain,30000);
      const shopError = await page.ev(`${SHOP}.innerText.replace(/\\s+/g,' ').trim().slice(0,160)`) as string;
      await page.ev(`window.__net.http.fail=null`);
      await dismissError(page);
      await press(page,tryAgain);
      await until(page,`${SHOP}.querySelector('[aria-label="Card Shop"] .banner')`,30000);
      const shopRecovered = await page.ev(`${SHOP}.querySelectorAll('.banner').length`) as number;
      await leaveShop(page);
      // Missing art: the asset bridge is unreachable; cards and packs draw their own fallbacks, never broken images.
      await page.send('Network.setBlockedURLs',{ urls:['*/game-assets/*'] });
      await page.go(`${CLIENT}/?portOffset=1000&assets=/game-assets/`,`document.querySelector('.de-client')`);
      await reenterWorld(page,me);
      await openShop(page); await sleep(3000);
      const broken = `[...document.querySelectorAll('.de-client img')].filter(i=>i.getAttribute('src')&&i.complete&&i.naturalWidth===0&&getComputedStyle(i).visibility!=='hidden'&&i.getClientRects().length).length`;
      const shopBroken = await page.ev(broken) as number;
      await screenshot(page,'resilience-no-art-shop');
      await leaveShop(page);
      await click(page,'Edit Deck'); await until(page,TRUNK,60000); await sleep(3000);
      const deckBroken = await page.ev(broken) as number;
      const deckNames = await page.ev(`[...document.querySelectorAll('[data-zone="trunk"][data-passcode]')].slice(0,3).map(b=>b.getAttribute('aria-label')).join(' / ')`);
      await screenshot(page,'resilience-no-art-deck');
      expect([shopBroken,deckBroken]).toEqual([0,0]);
      await page.send('Network.setBlockedURLs',{ urls:[] });
      // Signed out elsewhere: the session cookie is gone; the next account request asks to sign in again.
      await backToLobby(page);
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
      await until(page,goOnlineButton,60000);
      const sockets0 = await page.ev(`window.__net.sockets.length`) as number;
      await page.ev(`(()=>{const b=${goOnlineButton};b.click();b.click();})()`);
      await until(page,freeSlot,60000); await sleep(1000);
      const goOnline = (await page.ev(`window.__net.sockets.length`) as number) - sockets0;
      expect(goOnline).toBe(1);
      const me = `Con ${RUN}`;
      await createCharacter(page,me,{ wait:false });
      const slot = `[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes(${JSON.stringify(me)})&&!b.disabled)`;
      await until(page,slot,30000); await press(page,slot); await until(page,lobbyShown,60000);
      // main's starter picker (web-shell/starter.js): its "Yes, take it" pressed twice claims one deck, and the picker
      // stays shut once claimed
      const tile = `document.querySelector('#starter .scroll .btn')`, sbtn = (l:string) => `document.querySelector('#starter .btn[aria-label=${JSON.stringify(l)}]')`;
      for (let i = 0; i < 30 && !(await page.ev(`Boolean(${tile})`)); i++) await sleep(100);
      if (await page.ev(`Boolean(${tile})`)) {
        await press(page,tile); await until(page,sbtn('Choose this deck'),10000); await press(page,sbtn('Choose this deck'));
        await until(page,sbtn('Yes, take it'),10000);
        // a real double click (main's buttons act on pointerup, never a synthetic click): two presses at once
        const at = await page.ev(`(()=>{const r=${sbtn('Yes, take it')}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`) as { x:number; y:number };
        await page.send('Input.dispatchMouseEvent',{ type:'mouseMoved',...at });
        await Promise.all([1,2].flatMap(n => (['mousePressed','mouseReleased'] as const).map(t => page.send('Input.dispatchMouseEvent',{ type:t,...at,button:'left',clickCount:n }))));
        await until(page,sbtn('OK'),30000); await press(page,sbtn('OK')); await until(page,`!document.getElementById('starter')`,10000);
        await sleep(1500); expect(await page.ev(`Boolean(document.getElementById('starter'))`)).toBe(false);
      }
      // A double click on Buy (main's card shop) buys once; the busy shop says so.
      await openShop(page); await press(page,`${SHOP}.querySelector('[data-k=tab-packs]')`); await sleep(600);
      const before = (await shopWallet(page)).total, pack = (await shopPacks(page)).find(p => p.unit === 'pack' && !p.disabled)!;
      const purchase = shopBuyKey(pack.k);
      const busy = await page.ev(`(async()=>{const b=${purchase};b.click();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const busy=String((${purchase})?.disabled??'gone');(${purchase})?.click();return busy;})()`);
      await takeReveal(page); await sleep(1000);
      expect(await page.ev(`Boolean(${SHOP}.querySelector('.rv'))`)).toBe(false);
      const after = (await shopWallet(page)).total;
      const busyNote = await page.ev(`${SHOP}.querySelector('[role=status][aria-live]')?.textContent ?? ''`);
      expect(before - after).toBe(pack.price);
      await leaveShop(page);
      // Navigation while a reply is pending: the shop is requested with its catalogue reply held. Main's card shop opens
      // before its catalogue arrives and its bar has no Main Menu: the player leaves through the shop's own Leave the
      // shop, and the late reply does not take the screen back.
      await backToLobby(page);
      await page.ev(`window.__net.http.delay=/\\/api\\/de\\/shop/`);
      await click(page,'Shop');
      await until(page,`window.__net.http.release`,10000);
      const leave = `${SHOP}?.querySelector('[aria-label="Leave the shop"]')`;
      await until(page,leave,30000);
      const heldShop = await page.ev(`Boolean(${SHOP}.querySelector('[data-k^="buy-"]'))`) ? 'its packs already listed' : 'no packs listed yet';
      // Leave the shop while the app's shop request is still out: the rewrite leaves once that request settles
      // (index.ts leaveCardShop), so the press is kept and the release lets it through.
      await press(page,leave); await sleep(1000);
      const leftEarly = await page.ev(lobbyShown) as boolean;
      await page.ev(`window.__net.http.delay=null;window.__net.http.release();window.__net.http.release=null`);
      await until(page,lobbyShown,30000);
      await sleep(2500);
      const afterShop = { scene:await page.ev(`document.querySelector('.de-client').dataset.scene`), shop:await page.ev(`Boolean(${SHOP})`), lobby:await page.ev(lobbyShown) };
      expect(afterShop).toEqual({ scene:'lobby',shop:false,lobby:true });
      const navBusy = `the shop opened with ${heldShop}; Leave the shop returned to the lobby ${leftEarly ? 'at once' : 'as the held reply settled'} and the late reply left it there`;
      // Disconnect with a reply outstanding, go online again: the old session's late reply is dropped.
      await backToLobby(page);
      // a request that leaves the lobby on screen: the Friend List's presence (GET /api/de/friends) held
      await page.ev(`window.__net.http.delay=/\\/api\\/de\\/friends/`);
      await menuClick(page,'Friend List');
      await until(page,`window.__net.http.release`,10000);
      // Return to Title asks first (the Main Menu's 'Disconnect from the game?'): a player answers Yes
      await menuClick(page,'Return to Title'); await until(page,byKey('disconnect-yes'),30000); await page.ev(`${byKey('disconnect-yes')}.click()`);
      await until(page,goOnlineButton,30000);
      const pending = await page.ev(`window.__net.http.log.filter(l=>l.startsWith('delay')).length`) as number;
      await page.ev(`window.__net.http.delay=null`);
      await reenterWorld(page,me);
      await page.ev(`window.__net.http.release?.()`); await sleep(2500);
      const late = { scene:await page.ev(`document.querySelector('.de-client').dataset.scene`), alerts:await page.ev(`[...document.querySelectorAll('[role=alert]')].map(a=>a.textContent).join(' | ')`) };
      expect(late).toEqual({ scene:'lobby',alerts:'' });
      record('errors.concurrency',{ actions:'Double-click Go Online, the starter deck and Purchase; request the shop with its reply held and leave it through its Leave the shop; open the Friend List with its reply held, Return to Title, go online again, then let the old reply arrive',
        expected:'Busy state, duplicate clicks, navigation and late replies cannot apply to the wrong session',
        observed:`Go Online ×2 → ${goOnline} connection; Purchase ×2 → MP ${before} → ${after} (aria-busy/disabled ${busy} a frame after the first click${busyNote ? `, "${busyNote}"` : ''}); while the shop reply was held ${navBusy}; ${pending} held replies across a Disconnect/Go Online: after release the new session stayed on ${late.scene}${late.alerts ? ` ("${late.alerts}")` : ' with no alert'}` });
    } finally { closeAll(); }
  },600000);
});
