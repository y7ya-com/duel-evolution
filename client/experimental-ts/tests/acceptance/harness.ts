/** Browser acceptance harness against the real local stack: tools/local-stack.py (wrangler dev of server/, real
 * better-auth/D1/WorldDO/duel engine, staging test sign-in) behind the client's Vite dev server (`npm run dev`
 * with DE_SERVER/DE_PUBLIC_ORIGIN = the stack origin and YO2_GAME for original assets). See ACCEPTANCE.md. */
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { launch } from '../../../web-shell/htmlui/tools/cdp.mjs';

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
  execSync(`npx wrangler d1 execute duel-evolution --local --persist-to ../wr --command "DELETE FROM rate_limit; DELETE FROM signin_failure"`,{ cwd:resolve(dir,'snap'),stdio:'ignore',timeout:60000 });
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
  throw new Error(`Timed out: ${condition}\n--- page ---\n${String(await page.ev('document.body.innerText').catch(() => '')).slice(0,2500)}\n--- logs ---\n${page.logs.slice(-20).join('\n')}`);
}
/** A real pointer press at the control's centre; an obstructed or vanished control fails rather than being skipped. */
export async function press(page:Page,selector:string):Promise<void> {
  const point = await page.ev(`(async()=>{let b=${selector};if(!b||b.disabled)return null;b.scrollIntoView({block:'center',inline:'center',behavior:'instant'});for(let f=0;f<10;f++){await new Promise(requestAnimationFrame);b=${selector};if(!b||b.disabled)return null;const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);if(hit&&(hit===b||b.contains(hit)))return{x,y};}return null})()`);
  if (!point) throw new Error(`Control is covered, disabled or gone: ${selector}\n${String(await page.ev('document.body.innerText').catch(() => '')).slice(0,1500)}`);
  const down = page.send('Input.dispatchMouseEvent',{ type:'mousePressed',...point,button:'left',clickCount:1 });
  const up = page.send('Input.dispatchMouseEvent',{ type:'mouseReleased',...point,button:'left',clickCount:1 });
  await down; await up;
}
/** Avatars spawn at random points and can sit under the chat or area panel, where a player would walk closer first. */
export async function pressAvatar(page:Page,selector:string) { try { await press(page,selector); } catch { await page.ev(`(${selector}).click()`); } }
export const byText = (text:string,scope = 'document') => `[...${scope}.querySelectorAll('button,summary,a')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled&&b.getClientRects().length)`;
export const byKey = (key:string) => `document.querySelector(${JSON.stringify(`[data-key="${key}"]`)})`;
export async function click(page:Page,text:string,timeout = 30000) { await until(page,byText(text),timeout); await press(page,byText(text)); }
export async function type(page:Page,selector:string,value:string) {
  await until(page,selector);
  await page.ev(`(()=>{const i=${selector};i.focus();i.value=${JSON.stringify(value)};i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}
export const text = (page:Page) => page.ev('document.body.innerText') as Promise<string>;

/** Signs a fresh test user in, gives this page its cookies and opens the client. */
export async function openClient(page:Page,cookies:{ name:string; value:string }[] | null,options:{ assets?:boolean; settings?:Record<string,unknown> } = {}) {
  await page.send('Page.enable'); await page.send('Network.enable');
  for (const c of cookies ?? []) {
    const r = await page.send('Network.setCookie',{ name:c.name,value:c.value,url:CLIENT,path:'/',httpOnly:true,secure:c.name.startsWith('__Secure-'),sameSite:'Lax' });
    if (!r.result?.success) throw new Error('cookie refused: ' + c.name);
  }
  await page.send('Page.addScriptToEvaluateOnNewDocument',{ source:`try{if(!sessionStorage.getItem('acc-init')){sessionStorage.setItem('acc-init','1');localStorage.setItem('de-client-settings-v1',JSON.stringify(${JSON.stringify({ reducedMotion:true,sound:0,music:0,...options.settings })}));}}catch{};window.confirm=()=>true;` });
  await page.go(`${CLIENT}/?portOffset=1000${options.assets === false ? '' : '&assets=/game-assets/'}`,`document.querySelector('.de-client')`);
}
/** Go Online, create a character named `name` in the first free slot, select it, claim a starter if offered. */
export async function enterWorld(page:Page,name:string) {
  await click(page,'Go Online',60000);
  await until(page,byKey('character-name'),60000);
  await type(page,byKey('character-name'),name);
  await click(page,'Create');
  const slot = `[...document.querySelectorAll('.de-characters button')].find(b=>b.textContent.includes(${JSON.stringify(name)})&&!b.disabled)`;
  await until(page,slot,30000); await press(page,slot);
  await until(page,byKey('lobby-npcs'),60000);
  await claimStarter(page);
}
export async function claimStarter(page:Page) {
  const starter = `[...document.querySelectorAll('section')].find(s=>s.querySelector('h2')?.textContent==='Choose your Starter Deck')?.querySelector('button')`;
  for (let i = 0; i < 30 && !(await page.ev(`Boolean(${starter})`)); i++) await sleep(100);
  if (await page.ev(`Boolean(${starter})`)) { await until(page,`!(${starter})?.disabled`,30000); await press(page,starter); await until(page,`!document.body.innerText.includes('Choose your Starter Deck')`,30000); }
}

/** Evidence: one JSON line per asserted flow, with the client commit and run time. */
const EVIDENCE_DIR = resolve(import.meta.dirname,'../../acceptance-evidence');
export function commit():string { try { return execSync('git rev-parse --short HEAD',{ cwd:import.meta.dirname }).toString().trim(); } catch { return 'unknown'; } }
export function record(flow:string,observation:{ actions:string; expected:string; observed:string; accounts?:string }) {
  mkdirSync(EVIDENCE_DIR,{ recursive:true });
  appendFileSync(resolve(EVIDENCE_DIR,'runs.jsonl'),JSON.stringify({ flow,at:new Date().toISOString(),commit:commit(),dirty:dirtyTree(),...observation }) + '\n');
}
function dirtyTree():boolean { try { return execSync('git status --porcelain -- .',{ cwd:resolve(import.meta.dirname,'../..') }).toString().trim().length > 0; } catch { return true; } }
export async function screenshot(page:Page,name:string) { mkdirSync('/tmp/acceptance',{ recursive:true }); writeFileSync(`/tmp/acceptance/${name}.png`,await page.shot()); }
