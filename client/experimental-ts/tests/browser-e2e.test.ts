import { describe, expect, it } from 'vitest';
import { writeFile, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTrace, compareReplay } from '../src/parity/replay';
import { duelReplayAdapter } from '../src/parity/duel-adapter';
import { browserServerFixture } from './browser-server-fixture';
import { launch } from '../../web-shell/htmlui/tools/cdp.mjs';

type Browser = Awaited<ReturnType<typeof launch>>;
/** In the lobby: main's menu bar with its Duel key (the lobby is main's Legacy HTML UI, src/ui/htmlui/lobby.ts). */
const LOBBY = `!!document.querySelector('[data-key="menubar-duel"]')`;
async function until(browser:Browser,condition:string,timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await browser.ev(`Boolean(${condition})`)) return;
    await new Promise(r => setTimeout(r,50));
  }
  throw new Error(`Browser condition timed out: ${condition}\n${await browser.ev('document.body.innerText')}\n${browser.logs.join('\n')}`);
}
async function activate(browser:Browser,selector:string,touch = false) {
  const point = await browser.ev(`(async()=>{let b=${selector};if(!b||b.disabled)return null;b.scrollIntoView({block:'center',inline:'center',behavior:'instant'});for(let frame=0;frame<10;frame++){await new Promise(requestAnimationFrame);b=${selector};if(!b||b.disabled)return null;const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);if(hit&&(hit===b||b.contains(hit)))return{x,y};}return null})()`);
  if (!point) return false;
  if (touch) {
    await browser.send('Input.dispatchTouchEvent',{ type:'touchStart',touchPoints:[{ x:point.x,y:point.y }] });
    await browser.send('Input.dispatchTouchEvent',{ type:'touchEnd',touchPoints:[] });
  } else {
    // Queue both ordered input events before awaiting CDP acknowledgements. A repaint between
    // separate round trips can replace this renderer's button after mouse-down.
    const pressed = browser.send('Input.dispatchMouseEvent',{ type:'mousePressed',...point,button:'left',clickCount:1 });
    const released = browser.send('Input.dispatchMouseEvent',{ type:'mouseReleased',...point,button:'left',clickCount:1 });
    await pressed; await released;
  }
  return true;
}
async function click(browser:Browser,text:string,touch = false) {
  const literal = JSON.stringify(text), selector = `[...document.querySelectorAll('button,summary')].find(b=>b.textContent.trim()===${literal}&&!b.disabled&&b.getClientRects().length)`;
  // Main Menu entries (Lobby, Edit Deck, Options...) are reached through the menu bar's Menu key, as a player would.
  // main's Main Menu (src/ui/htmlui: CMainMenu) behind the menu bar's MAIN key
  const entry = `(['Edit Deck','My Profile','Appearance','Create Comment','DUEL OPTIONS','D-Mail','Audio','Ignore List','Friend List','Team List','Find Player','Shop','Return to Duel','Return to Lobby','Return to Title','Modern UI'].includes(${literal})&&!!document.querySelector('[data-key="main-menu"]'))`;
  await until(browser,`${selector}||${entry}`);
  if (!await browser.ev(`Boolean(${selector})`)) { await activate(browser,`document.querySelector('[data-key="main-menu"]')`,touch); await until(browser,selector); }
  return activate(browser,selector,touch);
}

describe('actual headless browser against real game authority',() => {
  it.each([{ name:'desktop',width:1280,height:900,mobile:false },{ name:'mobile',width:390,height:844,mobile:true }])('$name: creates a character, enters the lobby, prepares NPC51, plays exposed UI choices to a natural result, and returns',async viewport => {
    const fixture = await browserServerFixture();
    let browser:Browser | undefined;
    try {
      browser = await launch({ port:20000 + process.pid % 20000,width:viewport.width,height:viewport.height,mobile:viewport.mobile });
      await browser.send('Page.enable');
      await browser.send('Page.addScriptToEvaluateOnNewDocument',{ source:`try{localStorage.setItem('de-client-settings-v1',JSON.stringify({reducedMotion:true,sound:0,music:0}));}catch{};window.confirm=()=>true;` });
      await browser.go(fixture.origin+'/?portOffset=0',`document.querySelector('.de-client')`);
      await click(browser,'Go Online',viewport.mobile);
      await until(browser,`document.querySelector('[data-key^="character-create:"]')`); await click(browser,'Create Player',viewport.mobile); await until(browser,`document.querySelector('[data-key="character-name"]')`);
      await browser.ev(`(()=>{const input=document.querySelector('[data-key="character-name"]');input.value='Browser Duelist';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await click(browser,'OK',viewport.mobile);
      await until(browser,`[...document.querySelectorAll('[data-key^="character-slot:"]')].some(b=>b.textContent.includes('Browser Duelist')&&!b.disabled)`);
      await activate(browser,`[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes('Browser Duelist'))`,viewport.mobile);
      await until(browser,LOBBY,30000);
      // Claim through the actual server handler if this character is offered a starter deck.
      await until(browser,`![...document.querySelectorAll('button')].some(b=>b.textContent==='Create Duel'&&b.disabled)`);
      const starter = await browser.ev(`document.body.innerText.includes('Choose your Starter Deck')`);
      if (starter) {
        await activate(browser,`[...document.querySelectorAll('section')].find(s=>s.querySelector('h2')?.textContent==='Choose your Starter Deck')?.querySelector('button')`,viewport.mobile);
        await until(browser,`!document.body.innerText.includes('Choose your Starter Deck')`);
      }
      await writeFile(`/tmp/duel-evolution-ts-${viewport.name}-lobby.png`,await browser.shot());
      await click(browser,'DUEL OPTIONS',viewport.mobile); await click(browser,'Gameplay recording',viewport.mobile);
      await click(browser,'Start Recording',viewport.mobile);
      await until(browser,`document.querySelector('[data-key="options-capture"]')?.textContent.includes('recording ·')`);
      await click(browser,'Back',viewport.mobile);
      // main's player list: its search's Show all lists the NPCs too; the NPC's row opens its card, whose Send Duel Request starts the talk
      const row = `[...document.querySelectorAll('#htmlui-host .pl-row')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(fixture.npcName)}&&b.getClientRects().length)`;
      await until(browser,`document.querySelector('[data-key="plist-search"]')`); await activate(browser,`document.querySelector('[data-key="plist-search"]')`,viewport.mobile);
      const showAll = `[...document.querySelectorAll('#htmlui-host .ds-row')].find(b=>b.textContent.trim()==='Show all')`;
      await until(browser,showAll); await activate(browser,showAll,viewport.mobile);
      await until(browser,row); await activate(browser,row,viewport.mobile);
      const npcDuel = `[...document.querySelectorAll('[data-key^="npc-duel:"]')].find(b=>!b.disabled)`;
      await until(browser,npcDuel,30000); await activate(browser,npcDuel,viewport.mobile);
      const npcConfirm = `[...document.querySelectorAll('[aria-label="NPC interaction"] button')].find(b=>b.textContent==='Duel NPC'&&!b.disabled)`;
      const npcContinue = `[...document.querySelectorAll('[aria-label="NPC interaction"] button')].find(b=>b.textContent==='Continue'&&!b.disabled)`;
      // Known NPCBIN context can introduce source opening dialogue before the actual duel confirmation.
      for (let opening=0;opening<4;opening++) {
        await until(browser,`${npcConfirm}||${npcContinue}`);
        if (await browser.ev(`Boolean(${npcConfirm})`)) break;
        await activate(browser,npcContinue,viewport.mobile);
      }
      await until(browser,npcConfirm); await activate(browser,npcConfirm,viewport.mobile);
      await until(browser,`[...document.querySelectorAll('button')].some(b=>b.textContent==='Rock'&&!b.disabled)`);
      for (let round = 0; round < 20; round++) {
        await click(browser,['Rock','Scissors','Paper'][round % 3],viewport.mobile);
        await until(browser,`[...document.querySelectorAll('button')].some(b=>['Rock','Go First','Start Duel'].includes(b.textContent)&&!b.disabled)`);
        const ready = await browser.ev(`[...document.querySelectorAll('button')].some(b=>['Go First','Start Duel'].includes(b.textContent)&&!b.disabled)`);
        if (ready) break;
      }
      const first = await browser.ev(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Go First'&&!b.disabled)`);
      if (first) await click(browser,'Go First',viewport.mobile);
      await click(browser,'Start Duel',viewport.mobile);
      await until(browser,`document.querySelector('canvas[aria-label="Duel field"]')`);
      await until(browser,`document.querySelectorAll('.de-field-card .de-card-name').length>0`);
      expect(await browser.ev(`[...document.querySelectorAll('.de-field-card .de-card-name')].some(n=>!/^Card [0-9]+$/.test(n.textContent))`),'Generated catalog must not silently fail as a whole').toBe(true);
      await writeFile(`/tmp/duel-evolution-ts-${viewport.name}-duel.png`,await browser.shot());
      let end = false, actions = 0;
      const start = Date.now();
      while (Date.now() - start < 100000) {
        const step = await browser.ev(`(()=>{
          const buttons=[...document.querySelectorAll('button')].filter(b=>!b.disabled&&b.getClientRects().length);
          if(buttons.some(b=>b.textContent==='Return to Lobby'))return {kind:'finished'};
          const end=buttons.find(b=>b.textContent==='End Turn');if(end)return {kind:'end',key:end.dataset.key,text:end.textContent};
          const no=buttons.find(b=>b.dataset.key?.startsWith('prompt-option:')&&b.textContent==='No');if(no)return {kind:'no',key:no.dataset.key,text:no.textContent};
          const target=buttons.find(b=>b.dataset.key?.startsWith('prompt-option:')&&b.textContent==='Select');if(target)return {kind:'target',key:target.dataset.key,text:target.textContent};
          const candidates=buttons.filter(b=>b.dataset.key?.startsWith('prompt-candidate:'));
          const selected=candidates.filter(b=>b.getAttribute('aria-pressed')==='true');
          const confirm=buttons.find(b=>b.textContent==='Confirm Selection');if(confirm&&selected.length)return {kind:'cards',key:confirm.dataset.key,text:confirm.textContent};
          if(candidates.length&&!selected.length)return {kind:'pick',key:candidates[0].dataset.key,text:candidates[0].textContent};
          const option=buttons.find(b=>b.dataset.key?.startsWith('prompt-option:'));if(option)return {kind:'option',key:option.dataset.key,text:option.textContent};
          return null;
        })()`);
        if (step?.kind === 'finished') { end = true; break; }
        if (step) {
          const selector = step.key ? `[...document.querySelectorAll('button')].find(b=>b.dataset.key===${JSON.stringify(step.key)})`
            : `[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(step.text)}&&!b.disabled)`;
          if (await activate(browser,selector,viewport.mobile)) actions++;
        }
        await new Promise(r => setTimeout(r,100));
      }
      expect(end,await browser.ev('document.body.innerText')).toBe(true);
      expect(actions).toBeGreaterThan(0);
      expect(await browser.ev('document.body.innerText')).toContain('Defeat');
      const account = fixture.gameServer.game.store.accountOfUser('browser-fixture-user')!;
      const profile = fixture.gameServer.game.store.peek().accounts![account].profiles!['0'];
      expect(profile.last_npc_end).toMatchObject({ npc:51,result:'lose' });
      await click(browser,'Return to Lobby',viewport.mobile); await until(browser,LOBBY,30000);
      expect(await browser.ev('document.body.innerText')).toContain('Browser Duelist');
      await click(browser,'DUEL OPTIONS',viewport.mobile); await click(browser,'Gameplay recording',viewport.mobile);
      await click(browser,'Stop Recording',viewport.mobile);
      await until(browser,`/stopped *· *[1-9][0-9]* records/.test(document.querySelector('[data-key="options-capture"]')?.textContent ?? '')`);
      const downloadDir = await mkdtemp(join(tmpdir(),`duel-ts-capture-${viewport.name}-`));
      const behavior = await browser.send('Browser.setDownloadBehavior',{ behavior:'allow',downloadPath:downloadDir });
      expect(behavior.error).toBeUndefined(); await click(browser,'Download Recording',viewport.mobile);
      let filename:string|undefined;
      for (let attempt = 0; attempt < 100 && !filename; attempt++) {
        filename = (await readdir(downloadDir)).find(name => name.endsWith('.json'));
        if (!filename) await new Promise(r => setTimeout(r,50));
      }
      expect(filename,'Explicit browser recording download').toBeDefined();
      const trace = parseTrace(await readFile(join(downloadDir,filename!),'utf8'));
      expect(trace.records.filter(r=>r.stream==='duel'&&!r.redacted).length).toBeGreaterThan(100);
      expect(trace.records.filter(r=>r.direction==='out'||r.stream!=='duel').every(r=>r.hex==='')).toBe(true);
      const comparison = compareReplay(trace,duelReplayAdapter);
      expect(comparison.deterministic).toBe(true); expect(comparison.first.unsupported).toBe(0);
      expect(Object.values(comparison.first.states).some(state=>state.status==='finished'&&state.result?.result===2)).toBe(true);

      expect(browser.logs.filter((line:string) => line.startsWith('exception:'))).toEqual([]);
      expect(fixture.logs.some(line => /bad MD5|no card-wire hello|Wire sequence/.test(line))).toBe(false);
    } finally {
      if (browser) { await writeFile(`/tmp/duel-evolution-ts-${viewport.name}-last.png`,await browser.shot().catch(() => Buffer.alloc(0))); browser.close(); }
      await fixture.close();
    }
  },150000);
});
