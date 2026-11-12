/** Browser acceptance harness against the real local stack: tools/local-stack.py (wrangler dev of server/, real
 * better-auth/D1/WorldDO/duel engine, staging test sign-in) behind the client's Vite dev server (`npm run dev`
 * with DE_SERVER/DE_PUBLIC_ORIGIN = the stack origin and YO2_GAME for original assets). See ACCEPTANCE.md. */
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { launch } from '../../../web-shell/htmlui/tools/cdp.mjs';
import { expect } from 'vitest';

export type Page = Awaited<ReturnType<typeof launch>>;
/** Test user and character names must be fresh per run: accounts stay online briefly and names are server-wide. */
export const RUN = Date.now().toString(36).slice(-5);
export const sleep = (ms:number) => new Promise(r => setTimeout(r,ms));
export const enabled = process.env.ACCEPTANCE === '1';
export const CLIENT = process.env.ACCEPTANCE_CLIENT ?? 'http://localhost:5174';
export function stack(): { origin:string; secret:string; forward:string; log:string } {
  return JSON.parse(readFileSync(process.env.ACCEPTANCE_STACK ?? '/tmp/local-stack.json','utf8'));
}
/** Staging test sign-in: one fresh better-auth user per name. Returns its cookie pairs. */
export async function signIn(name:string):Promise<{ name:string; value:string }[]> {
  const s = stack();
  const response = await fetch(s.origin + '/api/de/test-sign-in',{ method:'POST',headers:{ 'Content-Type':'application/json',Origin:s.origin,'x-test-signin':s.secret },body:JSON.stringify({ name }) });
  if (!response.ok) throw new Error(`test sign-in ${response.status}`);
  return response.headers.getSetCookie().map(c => { const pair = c.split(';')[0]!, at = pair.indexOf('='); return { name:pair.slice(0,at),value:pair.slice(at + 1) }; });
}

/** Production rate limits (better-auth rate_limit, signin_failure counters) are kept; repeated local runs from one
 * IP clear the local stack's own rows first so one run's attempts do not refuse the next run's. */
export function resetRateLimits() {
  const dir = dirname(stack().log);
  // Parallel runs share the stack's local D1: a run's wrangler meets another's write lock (SQLITE_BUSY, "database is
  // locked"). That contention is retried with a growing pause; any other failure is the run's failure.
  for (let attempt = 1; ; attempt++) {
    try {
      execSync(`npx wrangler d1 execute duel-evolution --local --persist-to ../wr --command "DELETE FROM rate_limit; DELETE FROM signin_failure"`,{ cwd:resolve(dir,'snap'),stdio:['ignore','pipe','pipe'],timeout:60000 });
      return;
    } catch (e) {
      const out = e as { stdout?:Buffer; stderr?:Buffer; message?:string };
      const said = `${out.message ?? ''}\n${out.stdout?.toString() ?? ''}\n${out.stderr?.toString() ?? ''}`;
      if (attempt >= 6 || !/SQLITE_BUSY|database is locked|\bbusy\b/i.test(said)) throw new Error(`resetRateLimits: ${said.trim().slice(-600)}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500 * attempt + Math.floor(Math.random() * 500));
    }
  }
}
const hex = (bytes:ArrayBuffer) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2,'0')).join('');
/** The password test sign-in gives a user (server/src/auth/routes.ts), so the real login form can be used. */
export async function testPassword(name:string) { return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${stack().secret}:${name}`))); }
/** What the shared Discord bot forwards for /verify and /reset, signed with the stack's DE_FORWARD_SECRET. */
export async function discordForward(action:'verify'|'reset',code:string|undefined,discordId:string) {
  const s = stack(), body = JSON.stringify({ ts:Date.now(),action,...(code ? { code } : {}),discord:{ id:discordId,username:'acceptance' } });
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(s.forward),{ name:'HMAC',hash:'SHA-256' },false,['sign']);
  const response = await fetch(s.origin + '/api/de/discord-forward',{ method:'POST',headers:{ 'content-type':'application/json','x-de-signature':hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))) },body });
  return response.json() as Promise<{ ok:boolean; message:string; grantVerified?:boolean; code?:string }>;
}
/** The first page owns Chrome; later pages are isolated browser contexts (own cookie jar) in the same Chrome. */
let root:{ page:Page; port:number } | null = null;
export async function openPage(width = 1280,height = 900):Promise<Page> {
  if (!root) {
    const port = 26000 + process.pid % 6000;
    root = { page:await launch({ port,width,height }),port };
    return root.page;
  }
  return isolatedPage(root.port,width,height);
}
export function closeAll() { root?.page.close(); root = null; }
async function isolatedPage(port:number,width:number,height:number):Promise<Page> {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json() as { webSocketDebuggerUrl:string };
  const rpc = (url:string) => {
    const sock = new WebSocket(url); let id = 0; const pending = new Map<number,(d:any)=>void>(), logs:string[] = [];
    sock.onmessage = m => { const d = JSON.parse(String(m.data)); if (d.id && pending.has(d.id)) { pending.get(d.id)!(d); pending.delete(d.id); }
      if (d.method === 'Runtime.exceptionThrown') logs.push('exception: ' + JSON.stringify(d.params.exceptionDetails).slice(0,400));
      if (d.method === 'Runtime.consoleAPICalled') logs.push(d.params.type + ': ' + d.params.args.map((a:any) => a.value ?? a.description).join(' ')); };
    const opened = new Promise(r => { sock.onopen = r; });
    const send = async (method:string,params = {}) => { await opened; return new Promise<any>(r => { const i = ++id; pending.set(i,r); sock.send(JSON.stringify({ id:i,method,params })); }); };
    return { sock,send,logs };
  };
  const browser = rpc(version.webSocketDebuggerUrl);
  const context = (await browser.send('Target.createBrowserContext',{ disposeOnDetach:false })).result.browserContextId;
  const targetId = (await browser.send('Target.createTarget',{ url:'about:blank',browserContextId:context })).result.targetId;
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { id:string; webSocketDebuggerUrl:string }[];
  const page = rpc(list.find(t => t.id === targetId)!.webSocketDebuggerUrl);
  const ev = async (js:string) => { const r = await page.send('Runtime.evaluate',{ expression:js,awaitPromise:true,returnByValue:true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0,500)); return r.result?.result?.value; };
  await page.send('Runtime.enable');
  await page.send('Emulation.setDeviceMetricsOverride',{ width,height,deviceScaleFactor:1,mobile:false });
  const go = async (url:string,ready:string) => { await page.send('Page.navigate',{ url }); for (let i = 0; i < 150; i++) { await sleep(100); if (await ev(`!!(${ready})`).catch(() => false)) return; } throw new Error('not ready: ' + url); };
  const shot = async () => Buffer.from((await page.send('Page.captureScreenshot',{ format:'png' })).result.data,'base64');
  return { send:page.send,ev,go,shot,logs:page.logs,close:() => { page.sock.close(); void browser.send('Target.disposeBrowserContext',{ browserContextId:context }).finally(() => browser.sock.close()); } } as unknown as Page;
}

export async function until(page:Page,condition:string,timeout = 30000):Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await page.ev(`Boolean(${condition})`).catch(() => false)) return; await sleep(60); }
  const body = String(await page.ev('document.body.innerText').catch(() => ''));
  throw new Error(`Timed out: ${condition}\n--- page ---\n${body.slice(0,2000)}\n--- page end ---\n${body.slice(-1200)}\n--- logs ---\n${page.logs.slice(-20).join('\n')}`);
}
/** A real pointer press at the control's centre; an obstructed or vanished control fails rather than being skipped (the
 * element on top may be the same control's, a window main's screen is redrawing: it has the same data-key). */
export async function press(page:Page,selector:string):Promise<void> {
  const point = await page.ev(`(async()=>{let b=${selector};if(!b||b.disabled)return null;b.scrollIntoView({block:'center',inline:'center',behavior:'instant'});for(let f=0;f<10;f++){await new Promise(requestAnimationFrame);b=${selector};if(!b)continue;if(b.disabled)return null;const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);if(hit&&(hit===b||b.contains(hit)||(b.dataset?.key&&hit.closest?.('[data-key]')?.dataset.key===b.dataset.key)))return{x,y};}return null})()`);
  if (!point) {
    const cover = await page.ev(`(()=>{const b=${selector};if(!b)return 'gone';if(b.disabled)return 'disabled';const r=b.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);const d=e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.trim().replaceAll(' ','.'):'')+(e.dataset&&e.dataset.key?'[data-key='+e.dataset.key+']':'');const path=[];for(let e=h;e&&path.length<4;e=e.parentElement)path.push(d(e));return 'covered by '+(h?path.join(' < ')+' '+JSON.stringify(h.textContent.slice(0,40)):'nothing (off screen)')+(b.dataset?.key?' ['+document.querySelectorAll('[data-key="'+b.dataset.key+'"]').length+' with its key; it at '+[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]+(h===b?' (itself)':'')+']':'');})()`).catch(() => '?');
    throw new Error(`Control is ${cover}: ${selector}\n${String(await page.ev('document.body.innerText').catch(() => '')).slice(0,1500)}`);
  }
  // the pointer arrives before it presses, as a mouse does (the hover look main's pass screens redraw lands first)
  await page.send('Input.dispatchMouseEvent',{ type:'mouseMoved',...point });
  await page.ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const down = page.send('Input.dispatchMouseEvent',{ type:'mousePressed',...point,button:'left',clickCount:1 });
  const up = page.send('Input.dispatchMouseEvent',{ type:'mouseReleased',...point,button:'left',clickCount:1 });
  await down; await up;
}
/** Avatars spawn at random points and can sit under the chat or area panel, where a player would walk closer first. */
export async function pressAvatar(page:Page,selector:string) { try { await press(page,selector); } catch { await page.ev(`(${selector}).click()`); } }
/** The duel's end as the player reads it: main's result.js boards (CWindowResult, the player's on the left: its title
 * WIN / LOSE / DRAW) as 'Victory' / 'Defeat' / 'Draw'; the rewrite's own banner (.de-duel-end) without the HTML UI.
 * Installed in every client page as window.__duelEnd(): null while the duel goes on. */
const DUEL_END = `window.__duelEnd=()=>{const b=document.querySelector('.de-duel-end');if(b)return b.getAttribute('aria-label');
  const r=[...document.querySelectorAll('#htmlui-host .win[data-window-class="CWindowResult"]')].filter(e=>e.getClientRects().length).sort((x,y)=>x.getBoundingClientRect().left-y.getBoundingClientRect().left)[0];
  if(!r)return null;const t=r.innerText.split(/\\n/).map(l=>l.trim());return t.includes('WIN')?'Victory':t.includes('LOSE')?'Defeat':t.includes('DRAW')?'Draw':(t.find(l=>/ wins$|^(Victory|Defeat|Draw)$/.test(l))??'ended');};`;
export const byText = (text:string,scope = 'document') => `[...${scope}.querySelectorAll('button,summary,a')].find(b=>(b.textContent.trim()===${JSON.stringify(text)}||b.getAttribute('aria-label')===${JSON.stringify(text)})&&!b.disabled&&b.getClientRects().length)`;
export const byKey = (key:string) => `document.querySelector(${JSON.stringify(`[data-key="${key}"]`)})`;
/** The result screen's plate (CWindowResultNext): Next after every duel, NPC or PvP, as live. */
export const resultNext = `[...document.querySelectorAll('[data-key="duel-result-next"]')].find(b=>!b.disabled&&b.getClientRects().length)`;
export const resultShown = `(Boolean(${resultNext})||[...document.querySelectorAll('button')].some(b=>b.textContent==='Return to Lobby'&&!b.disabled&&b.getClientRects().length))`;
/** The result's way out: its Next plate (the screen without the HTML layer keeps a Return to Lobby button). */
export const resultLeave = `(${resultNext}??[...document.querySelectorAll('button')].find(b=>b.textContent==='Return to Lobby'&&!b.disabled&&b.getClientRects().length))`;
/** Waits for the result screen and presses its Next. */
export async function leaveResult(page:Page,timeout = 60000):Promise<void> { await until(page,resultShown,timeout); await press(page,resultLeave); }
/** In the lobby: main's menu bar with its Duel key, the map drawn (or none to draw: no original art; or its art
 * unreachable, the map's own failure with Retry Map). */
export const lobbyShown = `(!!document.querySelector('[data-key="menubar-duel"]')&&(document.querySelector('.de-world-view')?.dataset.mapReady!=='false'||document.querySelector('.de-world-view')?.dataset.mapFailed==='true'))`;
/** A row of the lobby's player list (main's CPlayerListDlg) by its name. */
/** A row's name: its label past the level live's rows lead with ("Lv 1 Name"; an NPC's row has none). */
const rowName = `(b=>(b.getAttribute('aria-label')??'').replace(/^Lv \\d+ /,''))`;
export const listRow = (name:string) => `[...document.querySelectorAll('#htmlui-host .pl-row')].find(b=>${rowName}(b)===${JSON.stringify(name)}&&b.getClientRects().length)`;
/** The player list's search (its magnifier) and one of its rows (main's CFindMenu): Show all lists the NPCs here too. */
export async function searchPlayers(page:Page,row = 'Show all') {
  await press(page,byKey('plist-search'));
  const r = `[...document.querySelectorAll('#htmlui-host .ds-row')].find(b=>b.textContent.trim()===${JSON.stringify(row)})`;
  await until(page,r,10000); await press(page,r);
  await until(page,`!document.querySelector('#htmlui-host .ds-row')`,10000);
}
/** Every name the player list shows after Show all (the players here, then the NPCs). */
export async function listedNames(page:Page):Promise<string[]> {
  await searchPlayers(page,'Show all');
  return page.ev(`[...document.querySelectorAll('#htmlui-host .pl-row')].map(${rowName})`) as Promise<string[]>;
}
/** An NPC's card (main's CNpcListMenu) from the player list's Show all; resolves when its Send Duel Request is there. */
export async function openNpcCard(page:Page,npc:string) {
  if (!await page.ev(`Boolean(${listRow(npc)})`)) await searchPlayers(page,'Show all');
  await until(page,listRow(npc),20000); await press(page,listRow(npc));
  await until(page,`document.querySelector('[data-key^="npc-duel:"]')`,20000);
}
/** The Main Menu's entries (main's CMainMenu, src/ui/htmlui) while it is closed: reached through the menu bar's MAIN key. */
const MAIN_MENU = ['Edit Deck','My Profile','Create Comment','DUEL OPTIONS','D-Mail','Audio','Duel Log','Ignore List','Friend List','Team List','Return to your Room','Return to Duel','Return to Lobby','Return to Title'];
const inMainMenu = (text:string) => `(${JSON.stringify(MAIN_MENU)}.includes(${JSON.stringify(text)})&&!!document.querySelector('[data-key="main-menu"]'))`;
/** Presses the visible control with this text; a Main Menu entry is reached through the MAIN key, as a player would. */
/** The title's sign-in window, as live: ONLINE (the title movie's button, htmlui/title-scene.ts) opens it signed out.
 * Polled by until(): presses ONLINE once it can be pressed, true once the window's Sign in and Password show. */
export const signInWindow = `(()=>{if(document.querySelector('[data-key="login-submit"]'))return !!document.querySelector('input[name="password"],[data-key="password"]');const o=document.querySelector('[data-key="title-online"]');if(o&&!o.disabled&&o.style.pointerEvents==='auto')o.click();return false;})()`;
/** Signed in (the title shows no account line: live's title is the movie and its buttons). */
export const signedIn = (name?:string) => `(window.__deApp?.getState().auth?.signedIn===true${name ? `&&window.__deApp.getState().auth.name===${JSON.stringify(name)}` : ''})`;
/** A title movie button (htmlui/title-scene.ts: online, options, deck, free) once it can be pressed: shown, enabled
 * and taking the pointer (the movie has played). */
export const titleButton = (name:'online'|'options'|'deck'|'free') => `[...document.querySelectorAll('[data-key="title-${name}"]')].find(b=>!b.disabled&&b.style.pointerEvents==='auto'&&b.style.visibility==='visible'&&b.getClientRects().length)`;
/** The title's way online: the movie's ONLINE (or the plain title's Go Online, without the game's art). */
export const goOnlineButton = `(${byText('Go Online')}||${titleButton('online')})`;
// the title movie's buttons for the rewrite's former title keys
const TITLE_KEYS:Record<string,'online'|'free'> = { 'Go Online':'online','Free Duel & Deck Editor':'free' };
export async function click(page:Page,text:string,timeout = 30000) {
  const alias = TITLE_KEYS[text];
  if (alias) {
    await until(page,`${byText(text)}||${titleButton(alias)}`,timeout);
    if (!await page.ev(`Boolean(${byText(text)})`)) { await press(page,titleButton(alias)); return; }
  }
  // the Shop is no Main Menu entry (as live: the store's door on the map, which the rewrite's world does not have yet;
  // free mode's own Shop button stays): tests open the shop scene through the dev app
  if (text === 'Shop' && !await page.ev(`Boolean(${byText('Shop')})`)) {
    // a refused catalogue (the server's error) is the shop's to show, not the test's: the dispatch's rejection is dropped.
    // Just after the lobby shows, the character select is still finishing (the app busy: its controls wait, and a door
    // walked into answers "Wait for the current action to finish."): as a player, wait for it, and walk in again if refused
    for (let i = 0; i < 10; i++) {
      await until(page,`!window.__deApp.getState().busy`,timeout);
      // (not awaited past its first moments: a test may hold the catalogue's reply)
      const refused = await page.ev(`Promise.race([Promise.resolve(window.__deApp.dispatch({ type:'openScene', scene:'shop' })).then(()=>'',e=>String(e?.message??e)),new Promise(r=>setTimeout(()=>r(''),300))])`) as string;
      if (!/Wait for the current action/.test(refused)) return;
      await sleep(500);
    }
    return;
  }
  // Find Player is no Main Menu entry (as live): the Friend List's Find a Player opens it
  if (text === 'Find Player') { await click(page,'Friend List',timeout); await until(page,byKey('list-find'),timeout); await press(page,byKey('list-find')); return; }
  await until(page,`${byText(text)}||${inMainMenu(text)}`,timeout);
  // the menu already open (its entries waiting on a busy app): wait for the entry; closed: open it with MAIN
  if (!await page.ev(`Boolean(${byText(text)})`)) {
    if (!await page.ev(`Boolean(document.querySelector('#htmlui-host [data-key^="menu:"]'))`)) await press(page,`document.querySelector('[data-key="main-menu"]')`);
    await until(page,byText(text),timeout);
  }
  await press(page,byText(text));
  // Return to Title asks first (the Main Menu's 'Disconnect from the game?' Yes / No): a player answers Yes
  if (text === 'Return to Title') { await until(page,byKey('disconnect-yes'),timeout); await press(page,byKey('disconnect-yes')); }
}
export async function type(page:Page,selector:string,value:string) {
  await until(page,selector);
  await page.ev(`(()=>{const i=${selector};i.focus();i.value=${JSON.stringify(value)};i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}
export const text = (page:Page) => page.ev('document.body.innerText') as Promise<string>;

/** Signs a fresh test user in, gives this page its cookies and opens the client. */
let networks = process.pid % 250;
export async function openClient(page:Page,cookies:{ name:string; value:string }[] | null,options:{ assets?:boolean; settings?:Record<string,unknown>; network?:string } = {}) {
  await page.send('Page.enable'); await page.send('Network.enable');
  // Each page is a player on its own network (the edge's CF-Connecting-IP; wrangler dev keeps one the request carries):
  // the server never pairs one network with itself in the Auto Duel queue (ranking.ts sameNetwork), as for real players.
  await page.send('Network.setExtraHTTPHeaders',{ headers:{ 'CF-Connecting-IP':options.network ?? `198.51.100.${++networks % 250 + 1}` } });
  for (const c of cookies ?? []) {
    const r = await page.send('Network.setCookie',{ name:c.name,value:c.value,url:CLIENT,path:'/',httpOnly:true,secure:c.name.startsWith('__Secure-'),sameSite:'Lax' });
    if (!r.result?.success) throw new Error('cookie refused: ' + c.name);
  }
  await page.send('Page.addScriptToEvaluateOnNewDocument',{ source:`try{if(!sessionStorage.getItem('acc-init')){sessionStorage.setItem('acc-init','1');localStorage.setItem('de-client-settings-v1',JSON.stringify(${JSON.stringify({ reducedMotion:true,sound:0,music:0,...options.settings })}));}}catch{};window.confirm=()=>true;${DUEL_END}` });
  await page.go(`${CLIENT}/?portOffset=1000${options.assets === false ? '' : '&assets=/game-assets/'}`,`document.querySelector('.de-client')`);
}
/** A character's row in Select Player (main's screen: src/ui/htmlui), by name. */
export const characterSlot = (name:string) => `[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes(${JSON.stringify(name)})&&!b.disabled)`;
/** The character names Select Player lists. */
export const characterNames = (page:Page) => page.ev(`[...document.querySelectorAll('[data-key^="character-slot:"]')].map(b=>b.textContent.trim())`) as Promise<string[]>;
/** Select Player's first free row (Create Player). */
export const freeSlot = `document.querySelector('[data-key^="character-create:"]')`;
/** Create Player on the first free row, the name typed into the game's name dialog, OK; then (wait) its row. */
export async function createCharacter(page:Page,name:string,{ wait = true,timeout = 60000 }:{ wait?:boolean; timeout?:number } = {}) {
  // a refusal of the last try (its error box) is closed first, with its OK, as a player would
  for (const ok of ['error-ok','dialog-ok']) if (await page.ev(`Boolean(${byKey(ok)})`)) { await press(page,byKey(ok)); await until(page,`!${byKey(ok)}`,10000); }
  await until(page,freeSlot,timeout); await press(page,freeSlot);
  await until(page,byKey('character-name'),10000); await type(page,byKey('character-name'),name);
  await until(page,`!${byKey('character-create-ok')}?.disabled`,5000); await press(page,byKey('character-create-ok'));
  // the original's first dressing (Change Avatar): the starter look as it comes, Confirm
  await until(page,byKey('avatar-confirm'),10000); await press(page,byKey('avatar-confirm'));
  if (wait) await until(page,characterSlot(name),30000);
}
/** Delete on a character's row: the account's password (the original asks for it first), Yes in the game's warning, OK on
 * its "deleted" box. Returns the warning and the box's words as shown. */
export async function deleteCharacter(page:Page,name:string,password:string) {
  const slot = await page.ev(`(${characterSlot(name)})?.dataset.key.split(':')[1]`) as string;
  const shown = () => page.ev(`document.getElementById('htmlui-host')?.innerText ?? ''`) as Promise<string>;
  await press(page,byKey(`character-delete:${slot}`)); await until(page,byKey('character-delete-password'),10000);
  await type(page,byKey('character-delete-password'),password); await press(page,byKey('character-delete-password-ok'));
  await until(page,byKey('character-delete-yes'),30000); const warning = await shown(); await press(page,byKey('character-delete-yes'));
  await until(page,byKey('dialog-ok'),30000); const done = await shown(); await press(page,byKey('dialog-ok'));
  return { warning, done };
}
/** Go Online, create a character named `name` in the first free slot, select it, claim a starter if offered. */
export async function enterWorld(page:Page,name:string) {
  await click(page,'Go Online',60000);
  await createCharacter(page,name);
  await press(page,characterSlot(name));
  await until(page,lobbyShown,60000);
  await claimStarter(page);
}
/** Go Online again with an existing character (after a reload or a dropped connection). */
export async function reenterWorld(page:Page,name:string) {
  // after a reload the server may still hold the last session ('already logged in', main's error dialog): its OK
  // (Close), then Go Online again, as a player would
  // (the server holds the old session up to its 45 s timeout plus a sweep: retry for two minutes)
  for (const until_ = Date.now() + 120000; Date.now() < until_ && !(await page.ev(`Boolean(${characterSlot(name)})`));) {
    if (await page.ev(`Boolean(${byKey('error-ok')})`)) { await press(page,byKey('error-ok')); await sleep(5000); }
    await click(page,'Go Online',60000);
    await until(page,`${characterSlot(name)}||${byKey('error-ok')}`,60000);
  }
  await until(page,characterSlot(name),10000); await press(page,characterSlot(name));
  await until(page,lobbyShown,60000);
}
/** The place banner's names (main's CWindowModelPlace: the world, then the area), as 'World · Area'. */
export const placeName = `[...document.querySelectorAll('#htmlui-host .lb-shadow')].filter(t=>t.style.left==='20px').map(t=>t.textContent).join(' · ')`;
/** Another player's card (main's CPlayerListMenu, src/ui/htmlui): open, its text, its action buttons' labels, closed
 * with Escape (as the game's). The old context menu's actions: Duel is Send Duel Request, Watch is Watch Duel. */
export const cardOpen = `document.querySelector('#htmlui-host [data-key^="card-"]')`;
export const cardText = `(document.querySelector('#htmlui-host [data-key^="card-"]')?.closest('.win')?.innerText ?? '')`;
export const cardButton = (label:string) => `[...document.querySelectorAll('#htmlui-host [data-key^="card-"]')].find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`;
export async function closeCard(page:Page) {
  await page.ev(`document.activeElement?.blur()`);
  for (const t of ['keyDown','keyUp']) await page.send('Input.dispatchKeyEvent',{ type:t,key:'Escape',code:'Escape',windowsVirtualKeyCode:27 });
  await until(page,`!${cardOpen}`,10000);
}
/** The open profile's text (main's CWindowModelProfile window). */
export const profileText = `document.querySelector('[data-key="profile-ok"]')?.closest('.win')?.innerText`;
/** The lines main's chat window shows on its current tab (CChatWindow's log). */
export const chatLines = (page:Page) => page.ev(`[...document.querySelectorAll('#htmlui-host [role="log"]')].filter(l=>l.style.display!=='none').flatMap(l=>[...l.children].map(r=>r.textContent))`) as Promise<string[]>;
/** A line typed into the chat and sent with Enter, on a tab (all, trade, team) or as a whisper ('/w name text'). */
export async function say(page:Page,message:string,{ tab, to }:{ tab?:'all'|'proximity'|'trade'|'team'; to?:string } = {}) {
  if (tab) await press(page,byKey(`chat-tab:${tab}`));
  await until(page,`document.querySelector('.de-stage')?.getAttribute('aria-busy')==='false'`,30000);   // Enter does nothing while busy
  await type(page,byKey('chat'),to ? `/w ${to} ${message}` : message);
  for (const t of ['keyDown','keyUp']) await page.send('Input.dispatchKeyEvent',{ type:t,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,...(t === 'keyDown' ? { text:'\r' } : {}) });
}

export async function claimStarter(page:Page,index = 0) {
  // main's starter deck picker (web-shell/starter.js, #starter): a deck tile (the index-th), "Choose this deck", "Yes, take it", OK
  const tile = `document.querySelectorAll('#starter .scroll .btn')[${index}]`, btn = (label:string) => `document.querySelector('#starter .btn[aria-label=${JSON.stringify(label)}]')`;
  for (let i = 0; i < 30 && !(await page.ev(`Boolean(${tile})`)); i++) await sleep(100);
  if (await page.ev(`Boolean(${tile})`)) {
    await press(page,tile); await until(page,btn('Choose this deck'),10000); await press(page,btn('Choose this deck'));
    await until(page,btn('Yes, take it'),10000); await press(page,btn('Yes, take it'));
    await until(page,btn('OK'),30000);
    const said = await page.ev(`document.getElementById('starter')?.innerText ?? ''`) as string;
    await press(page,btn('OK')); await until(page,`!document.getElementById('starter')`,10000).catch(e => { throw new Error(`starter claim: ${said}\n${String(e)}`); });
  }
}

/** Evidence: one JSON line per asserted flow, with the client commit and run time. */
const EVIDENCE_DIR = resolve(import.meta.dirname,'../../acceptance-evidence');
export function commit():string { try { return execSync('git rev-parse --short HEAD',{ cwd:import.meta.dirname }).toString().trim(); } catch { return 'unknown'; } }
export function record(flow:string,observation:{ actions:string; expected:string; observed:string; accounts?:string }) {
  mkdirSync(EVIDENCE_DIR,{ recursive:true });
  const state = expect.getState(), test = `${(state.testPath ?? '').replace(/^.*?(tests\/acceptance\/)/,'$1')} > ${state.currentTestName ?? ''}`;
  appendFileSync(resolve(EVIDENCE_DIR,'runs.jsonl'),JSON.stringify({ flow,at:new Date().toISOString(),commit:commit(),dirty:dirtyTree(),test,...observation }) + '\n');
}
function dirtyTree():boolean { try { return execSync(`git status --porcelain -- . ':(exclude)public'`,{ cwd:resolve(import.meta.dirname,'../..') }).toString().trim().length > 0; } catch { return true; } }
/** Screenshots go to ACCEPTANCE_SHOTS (default /tmp/acceptance). */
const SHOTS = process.env.ACCEPTANCE_SHOTS ?? '/tmp/acceptance';
export async function screenshot(page:Page,name:string) { mkdirSync(SHOTS,{ recursive:true }); writeFileSync(`${SHOTS}/${name}.png`,await page.shot()); }
/** The game screen alone at 1024 x 768 (the stage, scaled to the original's size), for side-by-side with the original. */
export async function stageShot(page:Page,name:string) {
  const r = await page.ev(`(()=>{const b=document.querySelector('.de-stage').getBoundingClientRect();return {x:b.left,y:b.top,w:b.width}})()`) as { x:number; y:number; w:number };
  const shot = await page.send('Page.captureScreenshot',{ format:'png',clip:{ x:r.x,y:r.y,width:r.w,height:r.w * 0.75,scale:1024 / r.w } });
  mkdirSync(SHOTS,{ recursive:true }); writeFileSync(`${SHOTS}/${name}.png`,Buffer.from(shot.result.data,'base64'));
}

/** One move of a playing bot on the duel screen, through the same controls a player uses. On its own turn it inspects
 * each hand card once for a summon or set, enters the Battle Phase and attacks with each monster once, then ends the
 * turn. Prompts: never chains (No), first candidates, first options. `set` prefers setting cards face-down, `activate`
 * also activates cards from the hand and field. */
export async function duelBot(page:Page,options:{ attack?:boolean; summon?:boolean; set?:boolean; activate?:boolean } = {}):Promise<'finished'|'acted'|'idle'> {
  const next = await page.ev(`(()=>{
    const ok=b=>b&&!b.disabled&&b.getClientRects().length, all=[...document.querySelectorAll('button')].filter(ok);
    const find=(t,scope=document)=>[...scope.querySelectorAll('button')].filter(ok).find(b=>b.textContent===t);
    if(find('Return to Lobby')||ok(document.querySelector('[data-key="duel-result-next"]')))return {kind:'finished'};
    const turn=/Turn (\\d+)/.exec(document.querySelector('.de-phase-bar')?.getAttribute('aria-label')??'')?.[1]??'0';
    if(window.__botTurn!==turn){window.__botTurn=turn;window.__tried=new Set();window.__battled=false;}
    const notice=document.querySelector('.de-duel-notice button');if(ok(notice))return {kind:'press',sel:'.de-duel-notice button'};
    const prompt=document.querySelector('.de-duel-prompt[role=dialog]');
    if(prompt){
      const opts=[...prompt.querySelectorAll('button')].filter(ok);
      const no=opts.find(b=>b.dataset.key?.startsWith('prompt-option:')&&b.textContent==='No');if(no)return {kind:'key',key:no.dataset.key};
      const cands=opts.filter(b=>b.dataset.key?.startsWith('prompt-candidate:')),sel=cands.filter(b=>b.getAttribute('aria-pressed')==='true');
      const close=opts.find(b=>b.textContent==='Close Card List');if(close)return {kind:'key',key:close.dataset.key};
      const conf=opts.find(b=>b.textContent==='Confirm Selection');if(conf&&sel.length)return {kind:'key',key:conf.dataset.key};
      if(cands.length&&!sel.length)return {kind:'key',key:cands[0].dataset.key};
      const opt=opts.find(b=>b.dataset.key?.startsWith('prompt-option:'));if(opt)return {kind:'key',key:opt.dataset.key};
      const target=all.find(b=>b.dataset.key?.startsWith('prompt-option:'));if(target)return {kind:'key',key:target.dataset.key};
      const confirm=opts.find(b=>b.dataset.key?.startsWith('prompt-confirm:'));if(confirm)return {kind:'key',key:confirm.dataset.key};
    }
    // main's duel dialogs (htmlui/duel-dialogs.ts over duel.js: yes / no, options, card lists, numbers, announcements)
    const hp=[...document.querySelectorAll('#htmlui-host button[data-key^="prompt-"]')].filter(b=>ok(b)&&b.dataset.state!=='disabled'&&b.getAttribute('aria-disabled')!=='true');
    if(hp.length){
      const k=p=>hp.filter(b=>b.dataset.key.startsWith(p)),lab=b=>b.getAttribute('aria-label')??b.textContent??'';
      const no=k('prompt-option:').find(b=>b.textContent.trim()==='No');if(no)return {kind:'key',key:no.dataset.key};
      const cands=k('prompt-candidate:'),picked=cands.filter(b=>/, picked \\d/.test(lab(b)));
      const conf=k('prompt-confirm:')[0]??k('prompt-ok:')[0],cancel=k('prompt-cancel:')[0];
      if(cands.length&&!picked.length)return {kind:'key',key:cands[0].dataset.key};
      const num=document.querySelector('#htmlui-host input[data-key^="prompt-number:"]');
      if(num&&!num.value){const lo=/\\((\\d+) to/.exec(num.getAttribute('aria-label')??'')?.[1]??'1';num.value=lo;num.dispatchEvent(new Event('input',{bubbles:true}));return {kind:'wait'};}
      const opts=k('prompt-option:'),marked=opts.filter(b=>/\\(marked\\)$/.test(lab(b)));
      if(opts.length&&!marked.length&&!conf)return {kind:'key',key:opts[0].dataset.key};
      if(opts.length&&!marked.length&&!picked.length&&!num)return {kind:'key',key:opts[0].dataset.key};
      if(conf)return {kind:'key',key:conf.dataset.key};
      const dec=k('prompt-declare:')[0];if(dec)return {kind:'key',key:dec.dataset.key};
      if(cancel)return {kind:'key',key:cancel.dataset.key};
    }
    const zone=[...document.querySelectorAll('.de-zone-target,.de-card-target')].find(ok);if(zone)return {kind:'key',key:zone.dataset.key};
    // a card's command list (live's CWindowModelListDuelCmd: the rows' labels 'Summon: <card>'), or Close
    const cmd=document.querySelector('.de-duel-cmd');
    if(cmd){
      const rows=[...cmd.querySelectorAll('[data-key^="duel-cmd:"]')].filter(ok).filter(b=>b.dataset.key!=='duel-cmd:details');
      const want=${JSON.stringify([...(options.set ? ['Set monster','Set spell/trap'] : []),...(options.activate ? ['Activate'] : []),...(options.summon === false ? [] : ['Summon','Set monster']),...(options.attack === false ? [] : ['Attack'])])};
      const pick=want.map(w=>rows.find(b=>(b.getAttribute('aria-label')??'').startsWith(w+':'))).find(Boolean);
      return {kind:'key',key:pick?pick.dataset.key:'duel-cmd-close'};
    }
    const ins=document.querySelector('.de-duel-inspector');
    if(ins){
      const acts=[...ins.querySelectorAll('button')].filter(ok).filter(b=>b.textContent!=='Close');
      const want=${JSON.stringify([...(options.set ? ['Set monster','Set spell/trap'] : []),...(options.activate ? ['Activate'] : []),...(options.summon === false ? [] : ['Summon','Set monster']),...(options.attack === false ? [] : ['Attack'])])};
      const pick=want.map(w=>acts.find(b=>b.textContent.startsWith(w+':'))).find(Boolean);
      if(pick)return {kind:'text',text:pick.textContent,scope:'.de-duel-inspector'};
      return {kind:'text',text:'Close',scope:'.de-duel-inspector'};
    }
    // The server can withhold End Turn (only Battle Phase offered, e.g. after Dark Magic Curtain): advance through the phase it offers.
    const end=find('End Turn'),advance=end??find('Main Phase 2')??find('Battle Phase');
    const phase=document.querySelector('.de-phase.current')?.title??'';
    const mine=[...document.querySelectorAll('.de-field-card')].filter(b=>ok(b)&&!window.__tried.has(b.dataset.key)&&/, your (hand|monster)/.test(b.getAttribute('aria-label')??''));
    const hand=mine.filter(b=>/your hand/.test(b.getAttribute('aria-label')));
    const field=mine.filter(b=>/your monster/.test(b.getAttribute('aria-label')));
    if(advance){
      if(!phase.includes('Battle')&&hand.length&&${options.summon !== false}){window.__tried.add(hand[0].dataset.key);return {kind:'key',key:hand[0].dataset.key};}
      if(${options.attack !== false}&&!window.__battled&&find('Battle Phase')&&field.length){window.__battled=true;return {kind:'text',text:'Battle Phase'};}
      if(phase.includes('Battle')&&field.length&&${options.attack !== false}){window.__tried.add(field[0].dataset.key);return {kind:'key',key:field[0].dataset.key};}
      return {kind:'text',text:advance.textContent};
    }
    // The server can also withhold every phase change in the Battle Phase (a monster that must attack: SELECT_BATTLECMD
    // with neither to_m2 nor to_ep): only the attacks remain, through the cards' command lists.
    const menus=[...document.querySelectorAll('.de-field-card[data-side="your"][aria-haspopup="menu"]')].filter(b=>ok(b)&&b.dataset.zone!=='deck');
    if(phase.includes('Battle')&&menus.length){
      const untried=menus.filter(b=>!window.__tried.has(b.dataset.key));
      // every one tried once and still no phase change: again (a real stall still shows as one)
      if(!untried.length){window.__tried=new Set();return {kind:'wait'};}
      window.__tried.add(untried[0].dataset.key);return {kind:'key',key:untried[0].dataset.key};
    }
    return null;})()`) as { kind:string; key?:string; text?:string; scope?:string; sel?:string } | null;
  if (!next) return 'idle';
  if (next.kind === 'finished') return 'finished';
  if (next.kind === 'wait') return 'acted';
  const selector = next.kind === 'key' ? `[...document.querySelectorAll('button')].find(b=>b.dataset.key===${JSON.stringify(next.key)})`
    : next.kind === 'press' ? `document.querySelector(${JSON.stringify(next.sel)})`
    : `[...document.querySelectorAll('${next.scope ?? ''} button')].find(b=>b.textContent===${JSON.stringify(next.text)}&&!b.disabled)`;
  try { await press(page,selector); return 'acted'; } catch { await page.ev(`(${selector})?.click()`).catch(() => {}); return 'acted'; }
}
/** Play until the duel ends (or the time runs out); returns the result banner text. */
export async function playDuel(page:Page,options:{ attack?:boolean; summon?:boolean; timeout?:number } = {}):Promise<string> {
  const start = Date.now();
  while (Date.now() - start < (options.timeout ?? 240000)) {
    if (await duelBot(page,options) === 'finished') break;
    await sleep(150);
  }
  return page.ev(`window.__duelEnd() ?? ''`) as Promise<string>;
}
/** The NPC's card → its talk (the balloon's lines, clicked on) → Start Duel? Yes → rock-paper-scissors → first/second → start. */
export async function startNpcDuel(page:Page,npc:string) {
  // the player list's Show all, the NPC's row (several NPCs share a name, levels 4/6/8: the first), its card's
  // Send Duel Request once eligibility allows it
  await openNpcCard(page,npc);
  const entry = `[...document.querySelectorAll('[data-key^="npc-duel:"]')].find(b=>!b.disabled)`;
  await until(page,entry,30000);
  await press(page,entry);
  const confirm = `[...document.querySelectorAll('[data-key="npc-start:yes"]')].find(b=>!b.disabled&&b.getClientRects().length)`;
  const next = `[...document.querySelectorAll('button[data-key="npc-talk:next"]')].find(b=>!b.disabled&&b.getClientRects().length)`;
  for (let i = 0; i < 6 && !(await page.ev(`Boolean(${confirm})`)); i++) { await until(page,`${confirm}||${next}`,20000); if (await page.ev(`Boolean(${next})`) && !(await page.ev(`Boolean(${confirm})`))) await press(page,next); await sleep(300); }
  await press(page,confirm);
  await prepareDuel(page);
}
/** Rock-paper-scissors until decided, then go first if offered, and start. */
export async function prepareDuel(page:Page,hand:'Rock'|'Scissors'|'Paper' = 'Rock') {
  await until(page,`[...document.querySelectorAll('button')].some(b=>['Rock','Go First','Go Second','Start Duel'].includes(b.textContent.trim())&&!b.disabled)||document.querySelectorAll('.de-field-card').length>0`,60000);
  for (let round = 0; round < 20; round++) {
    if (await page.ev(`document.querySelectorAll('.de-field-card').length>0&&!document.querySelector('.de-duel-prompt')`)) return;
    for (const label of ['Go First','Start Duel']) if (await page.ev(`Boolean(${byText(label)})`)) { await press(page,byText(label)); await sleep(300); }
    if (await page.ev(`Boolean(${byText(hand)})`)) { await press(page,byText(hand)); hand = hand === 'Rock' ? 'Scissors' : hand === 'Scissors' ? 'Paper' : 'Rock'; }
    await sleep(500);
  }
  await until(page,`document.querySelectorAll('.de-field-card').length>0`,60000);
}
/** main's HTML deck screen (src/ui/htmlui/deck.ts, deck-dom.ts: its cards are elements with data-zone / data-index /
 * data-passcode); the harness reads the deck's contents from the app's view (window.__deApp, dev builds). */
const DECK_VIEW = `(()=>{const v=window.__deApp?.getState();const e=v?.deckEditor;if(v?.scene!=='deck'||!e?.current)return null;
  const by=new Map();for(const c of [...(e.allCards??[]),...(e.collection??[])])if(c.passcode!=null)by.set(c.passcode,c);
  const nm=p=>by.get(p)?.name??String(p);
  return {name:e.current.name,main:e.current.main.map(nm),side:e.current.side.map(nm),extra:e.current.extra.map(nm),
    collection:(e.collection??[]).map(c=>({name:c.name,owned:c.owned??0})),dirty:!!e.dirty,decks:e.decks.map(d=>d.name)};})()`;
export interface DeckScreen { name:string; main:string[]; side:string[]; extra:string[]; collection:{ name:string; owned:number }[]; dirty:boolean; decks:string[]; }
export const deckScreen = (page:Page) => page.ev(DECK_VIEW) as Promise<DeckScreen|null>;
/** The deck screen is up (scene 'deck', a deck loaded) and main's EDIT DECK window is in the HTML layer. */
export const deckShown = `Boolean(${DECK_VIEW})`;
/** Main menu → Edit Deck, until main's deck screen has a deck loaded. */
export async function openDeckEditor(page:Page,minMain = 0):Promise<DeckScreen> {
  await click(page,'Edit Deck');
  await until(page,`(()=>{const d=${DECK_VIEW};return !!d&&d.main.length>=${minMain};})()`,60000);
  await sleep(500);
  return (await deckScreen(page))!;
}
/** The deck screen's side menu (DeckEntry.cpp: five buttons at 0, 40 + 27 i), deck-dom.ts's labelled buttons. */
export const DECK_SIDE = { load:'deck-load-deck',save:'deck-save-deck',structure:'deck-structure-deck',clear:'deck-clear-deck',exit:'deck-exit' } as const;
export const deckSide = (page:Page,button:keyof typeof DECK_SIDE) => press(page,byKey(DECK_SIDE[button]));
/** A deck file list's button ready to press: the list opens when asked and greys its buttons while the deck screen's
 * own request is out (its refresh as it opens), as a player waits for them to light. */
export const filesReady = (key:string) => `(()=>{const b=${byKey(key)};return !!b&&!b.disabled})()`;
/** EXIT the deck screen back to the lobby (answering a keep/discard question with Yes when there are edits). */
export async function exitDeckEditor(page:Page) {
  for (let i = 0; i < 5 && await page.ev(`Boolean(${DECK_VIEW})`); i++) {
    await deckSide(page,'exit').catch(() => {}); await sleep(800);   // a press as the screen closes finds EXIT gone
    for (const label of ['Yes','OK']) if (await page.ev(`Boolean(${byText(label)})`)) { await press(page,byText(label)).catch(() => {}); await sleep(500); }
    // a file list left open over EXIT (SAVE / LOAD DECK): its Cancel, as a player closes it
    if (await page.ev(`Boolean(${byKey('deck-files-cancel')})`)) { await press(page,byKey('deck-files-cancel')).catch(() => {}); await sleep(400); }
  }
  await until(page,lobbyShown,60000);
}
/** The owned copies of a card (all cards with no name), as the deck screen's trunk counts them. */
export async function ownedCopies(page:Page,name:string):Promise<number> {
  const deck = await openDeckEditor(page);
  await exitDeckEditor(page);
  return deck.collection.filter(c => !name || c.name === name).reduce((n,c) => n + c.owned,0);
}
/** live's Surrender: a row of the player's own deck's command list (a click on the deck opens it); the duel bar's
 * button when no deck is left. Opens the list and returns the row's selector (to read or press). */
export async function surrenderRow(page:Page):Promise<string> {
  const deck = `document.querySelector('.de-field-card[data-side="your"][data-zone="deck"]')`;
  if (!(await page.ev(`Boolean(${deck})`))) return byText('Surrender');
  if (!(await page.ev(`Boolean(${byKey('duel-surrender')})`))) await press(page,deck);
  await until(page,byKey('duel-surrender'),20000);
  return byKey('duel-surrender');
}
export async function pressSurrender(page:Page) { const row = await surrenderRow(page); await until(page,`(${row})&&!(${row}).disabled`,60000); await press(page,row); }
/** Surrender the current duel (confirming the server's question) and wait for the result. */
export async function surrender(page:Page) {
  // The server answers a surrender with its Yes/No question when this side may act: wait for our own turn.
  for (const start = Date.now(); Date.now() - start < 180000;) {
    if (await page.ev(`Boolean(${byText('End Turn')})||${resultShown}`)) break;
    // Answer whatever the server asks meanwhile (chains, targets), without playing anything.
    if (await page.ev(`Boolean(document.querySelector('.de-duel-prompt[role=dialog],.de-zone-target,.de-duel-notice'))`)) await duelBot(page,{ summon:false,attack:false });
    await sleep(200);
  }
  if (await page.ev(resultShown)) return;
  await pressSurrender(page);
  // the client's own question first (main's YesNo, surrender-yes), then the server's when it asks one
  const ask = `[...document.querySelectorAll('button')].find(b=>b.dataset.key==='surrender-yes'&&!b.disabled)`;
  const yes = `[...document.querySelectorAll('button')].find(b=>b.dataset.key?.startsWith('prompt-option:')&&b.textContent==='Yes'&&!b.disabled)`;
  const ended = resultShown;
  await until(page,`${ask}||${yes}||${ended}`,60000);
  if (await page.ev(`Boolean(${ask})`)) { await press(page,ask); await until(page,`${yes}||${ended}`,60000); }
  if (await page.ev(`Boolean(${yes})`)) await press(page,yes);
  await until(page,resultShown,60000);
}
/** After an NPC duel: the result's Next back to the lobby, the NPC's lines (its balloon), the offered reward pack
 * (main's picker), then what the duel gave, as live: "You got <X>!" Ok dialogs (htmlui/npc-itemget.ts), each OK'd, the
 * last ending the talk. Returns the pack label, the received names (the cards first) and the dialog text seen. */
export async function claimNpcReward(page:Page):Promise<{ pack:string|null; received:string[]; dialog:string }> {
  if (await page.ev(resultShown)) await press(page,resultLeave);
  const balloon = `[...document.querySelectorAll('button[data-key="npc-talk:next"]')].find(b=>!b.disabled&&b.getClientRects().length)`;
  const itemOk = `[...document.querySelectorAll('[data-key="npc-itemget-ok"]')].find(b=>!b.disabled&&b.getClientRects().length)`;
  const htmlRow = `document.querySelector('.yo2ps-list .yo2ps-row')`, htmlOk = `document.querySelector('.yo2ps-ok:not([hidden])')`;
  const npcUp = `(Boolean(document.querySelector('button[data-key="npc-talk:next"]'))||Boolean(${htmlRow})||Boolean(document.querySelector('[data-key="npc-itemget-ok"]'))||!['idle','done'].includes(window.__deApp?.getState().npc?.stage ?? 'idle')||window.__deApp?.getState().npc?.stage==='done'&&window.__deApp?.getState().npc?.result!=null)`;
  let pack:string|null = null, dialog = '';
  const received:string[] = [];
  for (let i = 0; i < 60 && (await page.ev(npcUp) || i < 6); i++) {
    // the NPC's lines after the duel (its balloon): clicked on, the gift's line too (Receive Gift)
    if (await page.ev(`Boolean(${balloon})`)) { dialog ||= (await page.ev(`${balloon}.getAttribute('aria-label') ?? ''`) as string).slice(0,240); await press(page,balloon); await sleep(500); continue; }
    // the duel's last word (its result line as a duel.js dialog over the picker): acknowledged first, as a player would
    const last = `[...document.querySelectorAll('#htmlui-host button[data-key^="prompt-"]')].find(b=>!b.disabled&&b.getClientRects().length)`;
    if (await page.ev(`Boolean(${last})`)) { await press(page,last); await sleep(500); continue; }
    // main's pack picker (htmlui/npc-pack.ts: CWindowPackSelect): its first row, then OK
    if (!pack && await page.ev(`Boolean(${htmlRow})&&Boolean(${htmlOk})`)) {
      pack = (await page.ev(`[...${htmlRow}.querySelectorAll('span')].map(s=>s.textContent)[0] ?? ${htmlRow}.textContent`) as string).trim();
      await press(page,htmlRow); await sleep(200); await press(page,htmlOk); await sleep(800); continue;
    }
    // "You got <X>!": the item-get dialog's text, then its OK
    if (await page.ev(`Boolean(${itemOk})`)) {
      const said = (await page.ev(`${itemOk}.closest('.win')?.innerText ?? ''`) as string).replace(/\s+/g,' ').trim();
      const got = /You got (.+?)!/.exec(said)?.[1]; if (got) received.push(got);
      await press(page,itemOk); await sleep(500); continue;
    }
    await sleep(800);
  }
  // the result boards (their Next plate) if still up
  if (await page.ev(resultShown)) { await press(page,resultLeave); await until(page,lobbyShown,60000); }
  return { pack, received, dialog };
}
/** Earn tradeable (not soul-bound) cards: lose an NPC duel by passing every turn (a surrender earns no reward pack)
 * and take its reward pack. */
export async function earnCards(page:Page,npc = 'Yami Yugi') {
  await startNpcDuel(page,npc);
  await playDuel(page,{ summon:false,attack:false,timeout:420000 });
  return (await claimNpcReward(page)).received;
}

// main's card shop (htmlui/card-shop.ts: web-shell/htmlui/shop/index.js) online: its wallet, its packs' Buy, its reveal
export const SHOP = `document.querySelector('[data-key="card-shop"]')`;
export const shopWallet = async (page:Page) => {
  const t = await page.ev(`${SHOP}?.querySelector('.wallet .v')?.textContent ?? ''`) as string;
  return { total:Number((/([\d,]+)\s*MP/.exec(t)?.[1] ?? 'NaN').replaceAll(',','')), text:t };
};
export async function openShop(page:Page) {
  await click(page,'Shop'); await until(page,`${SHOP}?.querySelector('[aria-label="Card Shop"] .banner')&&/\\d/.test(${SHOP}.querySelector('.wallet .v')?.textContent??'')`,60000); await sleep(800);
}
export async function leaveShop(page:Page) { await press(page,`${SHOP}.querySelector('[aria-label="Leave the shop"]')`); await until(page,lobbyShown,30000); }
/** The packs on sale with their Buy 1 key (main's banner pills: "Buy 1 pack of <name> for <price> MP"). */
export const shopPacks = (page:Page) => page.ev(`[...${SHOP}.querySelectorAll('[data-k^="buy-"]:not([data-bought])')].map(b=>{const m=/^Buy 1 (\\w+) of (.+) for ([\\d,]+) MP$/.exec(b.getAttribute('aria-label')??'');return m&&{unit:m[1],name:m[2],price:Number(m[3].replaceAll(',','')),k:b.dataset.k,disabled:b.disabled};}).filter(Boolean)`) as Promise<{ unit:string; name:string; price:number; k:string; disabled:boolean }[]>;
export const shopBuyKey = (k:string) => `${SHOP}.querySelector('[data-k="${k}"]')`;
export const shopReveal = `${SHOP}?.querySelector('.rv')`;
/** The reveal to its end (a click turns every card), its summary, its cards; Done closes it. */
export async function takeReveal(page:Page):Promise<{ title:string; summary:string; slots:number }> {
  await until(page,shopReveal,30000);
  for (let i = 0; i < 60 && await page.ev(`${shopReveal}?.dataset.phase!=='done'`); i++) { if (await page.ev(`${shopReveal}?.dataset.phase==='flip'`)) await page.ev(`${shopReveal}.click()`); await sleep(250); }
  const out = await page.ev(`({title:${shopReveal}.getAttribute('aria-label'),summary:${shopReveal}.querySelector('[role=status]')?.textContent??'',slots:${shopReveal}.querySelectorAll('.slot').length})`) as { title:string; summary:string; slots:number };
  await press(page,`${shopReveal}.querySelector('[data-k=done]')`); await until(page,`!${shopReveal}`,10000);
  return out;
}
