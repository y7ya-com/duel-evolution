import { describe, expect, it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, sleep, screenshot, record, startNpcDuel, playDuel, byKey, type Page, placeName, cardOpen, cardButton, closeCard, lobbyShown, searchPlayers, listRow } from './harness';
import { avatar, invitation, inLobby, onDuel, finished, playerMenu, startBoth, read, settled, mirrored, playBoth, backToLobby } from './pvp-helpers';

/** Main's Duel menu (the bar's Duel key, src/ui/htmlui/lobby.ts) open. */
async function duelMenu(page:Page) { if (!await page.ev(`Boolean(${byKey('duel-cancel')})`)) await press(page,byKey('menubar-duel')); await until(page,byKey('duel-cancel'),10000); }
/** The Duel menu's counts, top to bottom: Auto Duel (searching), Create Duel (waiting), Duel (n.) (duelling). */
const counts = (page:Page) => page.ev(`(()=>{const w=document.querySelector('[data-key="duel-cancel"]')?.closest('.win');if(!w)return '';return [...w.querySelectorAll('.ds-txt')].filter(e=>/^\\d+$/.test(e.textContent.trim())).sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top).map(e=>e.textContent.trim()).join(' / ');})()`) as Promise<string>;
/** Auto Duel from the Duel menu: its choices pressed, OK. */
async function autoDuel(page:Page,choices:string[] = []) {
  await duelMenu(page); await press(page,byKey('duel-auto')); await until(page,byKey('find-ok'),10000);
  for (const key of choices) { await press(page,byKey(key)); await until(page,`${byKey(key)}?.getAttribute('aria-pressed')==='true'`,5000); }
  await press(page,byKey('find-ok')); await until(page,`!${byKey('find-ok')}`,10000);
}
/** The selected character again after a lost connection: Go Online, pick the slot, lobby. */
async function reenter(page:Page,name:string) {
  await click(page,'Go Online',60000);
  const slot = `[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes(${JSON.stringify(name)})&&!b.disabled)`;
  await until(page,slot,60000); await press(page,slot);
  await until(page,lobbyShown,60000);
}
const yourTurn = `[...document.querySelectorAll('button')].some(b=>b.textContent==='End Turn'&&!b.disabled)`;

describe.skipIf(!enabled)('PvP matchmaking, disconnect and time-out endings, and spectating an NPC duel',() => {
  it('finds and cancels a search with live counts, pairs two players, resolves disconnect and time-out, and watches an NPC duel to its end',async () => {
    try {
      const names = { a:`Mma ${RUN}`, b:`Mmb ${RUN}` };
      const cookies = { a:await signIn(`TestMa${RUN}`), b:await signIn(`TestMb${RUN}`) };
      const a = await openPage(); let b = await openPage();
      await openClient(a,cookies.a,{ assets:false }); await openClient(b,cookies.b,{ assets:false });
      await enterWorld(a,names.a); await enterWorld(b,names.b);
      await until(a,avatar(names.b),30000);
      // pvp.matchmaking: A searches (Auto Duel, Single Mode); B's Duel menu counts it; A cancels; the count drops.
      await duelMenu(b);
      const before = await counts(b);
      await autoDuel(a);
      const message = await a.ev(`document.getElementById('htmlui-host').innerText`) as string;
      await until(b,`/^1 \\//.test(${counts.toString().includes('') ? '""' : '""'})||(()=>{const w=document.querySelector('[data-key="duel-cancel"]')?.closest('.win');return !!w&&[...w.querySelectorAll('.ds-txt')].filter(e=>/^\\d+$/.test(e.textContent.trim())).sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0]?.textContent.trim()==='1';})()`,30000);
      const searching = await counts(b);
      await screenshot(a,'pvp-matchmaking-searching');
      // the Duel key while searching: "Cancel the Duel you created?" (the original's), Yes
      await press(a,byKey('menubar-duel')); await until(a,byKey('room-close-yes'),10000);
      const cancelText = await a.ev(`document.querySelector('[data-key="room-close-yes"]').closest('.win').innerText`) as string;
      await press(a,byKey('room-close-yes'));
      await until(b,`(()=>{const w=document.querySelector('[data-key="duel-cancel"]')?.closest('.win');return !!w&&[...w.querySelectorAll('.ds-txt')].filter(e=>/^\\d+$/.test(e.textContent.trim())).sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0]?.textContent.trim()==='0';})()`,30000);
      const cancelled = await counts(b);
      await press(b,byKey('duel-cancel'));
      // Both search (A Single Mode, B Both and a similar level): the server pairs them and both prepare a duel.
      await autoDuel(a);
      await autoDuel(b,['find-both','find-similar-level']);
      await startBoth(a,b);
      const paired = await settled(a,b);
      expect(mirrored(...paired)).toEqual([]);
      expect(new Set(paired[0].names)).toEqual(new Set([names.a,names.b]));
      record('pvp.matchmaking',{ actions:'Duel key → Auto Duel: A Single Mode OK; the Duel key again, Yes to cancel; then A Single Mode and B Both with Level Limit OFF (a similar level)',
        expected:'Find/cancel single or match opponents with level filters and correct searching/waiting counts',
        observed:`B's Duel menu counts (Auto Duel / Create Duel / Duel (n.)) "${before}" → "${searching}" while A searched (A's bar: "${message.replace(/\s+/g,' ').trim().slice(0,60)}") → "${cancelled}" after "${cancelText.replace(/\s+/g,' ').trim()}" Yes; the second search paired A and B (similar level) into one duel, both screens mirrored (${paired[0].names.join(' vs ')})` });

      // pvp.end (disconnect): B's browser goes away mid-duel; A is told and wins after the server's grace period.
      await playBoth(a,b,{ stop:turn => turn >= 2,timeout:200000 });
      b.close();
      const gone = Date.now();
      await until(a,`document.querySelector('.de-duel-notice')?.textContent.includes('lost the connection')`,60000);
      const notice = await a.ev(`document.querySelector('.de-duel-notice p').textContent`) as string;
      await until(a,finished,120000);
      const disconnect = { result:await read(a), after:Math.round((Date.now() - gone) / 1000) };
      expect(disconnect.result.ended).toBe('Victory');
      await screenshot(a,'pvp-disconnect-a');
      await backToLobby(a);
      // B comes back with the same account and character to a usable lobby.
      b = await openPage(); await openClient(b,cookies.b,{ assets:false }); await reenter(b,names.b);
      await until(b,lobbyShown,30000);
      const bLobby = await b.ev(placeName) as string;

      // pvp.end (time-out): a Single room with Time limit; the player to move does nothing and loses on time.
      await duelMenu(b); await press(b,byKey('duel-create')); await until(b,byKey('room-ok'),10000); await press(b,byKey('room-ok'));
      await searchPlayers(a,'Search for Single Duels'); await until(a,listRow(names.b),30000);
      await playerMenu(a,names.b,'Send Duel Request');
      await until(b,invitation,20000);
      await press(b,`document.querySelector('[data-key="duel-accept"]')`);
      await startBoth(a,b);
      await until(a,`${yourTurn}`,60000).catch(() => {});
      const idle = await a.ev(`Boolean(${yourTurn})`) ? a : b, other = idle === a ? b : a;
      const clocks = await settled(a,b);
      const waited = Date.now();
      for (const p of [a,b]) await until(p,`document.querySelector('.de-duel-end')`,300000);
      const timeout = { idle:await read(idle), other:await read(other), after:Math.round((Date.now() - waited) / 1000), text:await idle.ev(`[...document.querySelectorAll('.de-duel-notice,.de-duel-log div')].map(n=>n.textContent).filter(t=>/time/i.test(t)).slice(-2).join(' | ')`) as string };
      expect(timeout.idle.ended).toBe('Defeat'); expect(timeout.other.ended).toBe('Victory');
      await screenshot(idle,'pvp-timeout-loser');
      for (const p of [a,b]) await backToLobby(p);
      record('pvp.end',{ actions:'Disconnect: B closes the browser at turn 2, then signs in again. Time-out: Single room with Time limit, the player to move does nothing',
        expected:'Resolve each termination path and return both players to a usable lobby',
        observed:`disconnect: A was told "${notice.trim()}" and won (${disconnect.result.ended}) ${disconnect.after} s later; B re-entered ${bLobby} with Create Duel available. Time-out: clock ${clocks[0].clock.filter(Boolean).join(' ')}; after ${timeout.after} s idle the idle player read ${timeout.idle.ended}, the other ${timeout.other.ended}${timeout.text ? ` ("${timeout.text.slice(0,120)}")` : ''}; both back in the lobby with Create Duel available` });

      // spectate (NPC): B watches A's NPC duel from A's player menu until it ends, then leaves.
      await startNpcDuel(a,'Yami Yugi');
      await until(b,`${avatar(names.a)}`,30000);
      let menu:string[] = [];
      for (let i = 0; i < 20; i++) {
        await press(b,`(${avatar(names.a)})`).catch(async () => b.ev(`(${avatar(names.a)}).click()`));
        await until(b,cardOpen,10000);
        menu = await b.ev(`[...document.querySelectorAll('#htmlui-host [data-key^="card-"]')].filter(x=>!x.disabled).map(x=>x.textContent.trim())`) as string[];
        if (menu.includes('Watch Duel')) break;
        await closeCard(b); await sleep(1500);
      }
      expect(menu).toContain('Watch Duel');
      await press(b,cardButton('Watch Duel'));
      await until(b,onDuel,60000);
      await until(b,`/Turn [1-9]/.test(document.querySelector('.de-phase-bar')?.getAttribute('aria-label')??'')`,60000);
      const join = await read(b);
      const cards = await b.ev(`[...document.querySelectorAll('.de-field-card')].map(x=>x.getAttribute('aria-label'))`) as string[];
      expect(cards.filter(l => /hand/.test(l) && !l.startsWith('Face-down'))).toEqual([]);
      expect(join.controls.filter(t => t !== 'Leave Duel')).toEqual([]);
      await screenshot(b,'npc-spectator');
      const played = playDuel(a,{ timeout:480000 });
      let lastTurn = join.turn, updates = 0;
      for (let i = 0; i < 4000 && !(await b.ev(`Boolean(document.querySelector('.de-duel-end'))||!document.querySelector('.de-duel-board')`)); i++) {
        const now = (await read(b)).turn; if (now > lastTurn) { updates++; lastTurn = now; } await sleep(150);
      }
      const result = await played, seen = await read(b);
      expect(updates).toBeGreaterThan(0);
      record('spectate.join',{ actions:"B opens A's player menu during A's NPC duel and presses Watch", expected:'Find/join an NPC, PvP or tag duel and reconstruct the current visible state', observed:`NPC duel joined at turn ${join.turn} (${join.bar}); LP ${join.lp.join('/')}; names ${join.names.join(' vs ')}` });
      record('spectate.visibility',{ actions:'Spectator screen during an NPC duel', expected:'Hide private cards and prohibit player responses from observers', observed:`${cards.length} cards visible, every hand card a back; controls: ${join.controls.join(', ') || 'none'}` });
      // The duel ends while B watches; Leave Duel returns B to a usable lobby.
      await sleep(2000);
      const endSeen = await b.ev(`document.querySelector('.de-duel-end')?.getAttribute('aria-label') ?? (document.querySelector('.de-duel-board') ? 'board still shown' : 'left the duel view')`) as string;
      if (await b.ev(`[...document.querySelectorAll('button')].some(x=>x.textContent==='Leave Duel')`)) await click(b,'Leave Duel');
      if (await b.ev(`[...document.querySelectorAll('button')].some(x=>x.textContent==='Return to Lobby')`)) await click(b,'Return to Lobby');
      await until(b,inLobby,60000);
      await until(b,lobbyShown,30000);
      await screenshot(b,'npc-spectator-left');
      record('spectate.leave',{ actions:"B watches A's NPC duel to its end, then leaves", expected:'Live updates, late join, duel end and leave clean up the view/channel', observed:`late join at turn ${join.turn}; ${updates} turn changes followed live up to turn ${lastTurn} (player's result ${result}); at the end the spectator saw: ${endSeen} (last LP ${seen.lp.join('/')}); left to a usable lobby` });
    } finally { closeAll(); }
  },2400000);
});
