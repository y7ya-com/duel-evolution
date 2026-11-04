import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, type, sleep, screenshot, record, stack, byKey, type Page } from './harness';
import { avatar, invitation, requesting, onDuel, finished, menuActions, startBoth, read, settled, mirrored, playBoth, backToLobby } from './pvp-helpers';

const rooms = `document.querySelector('[data-key="lobby-duel-rooms"]')`;
const roomRow = (owner:string) => `[...document.querySelectorAll('.de-room-row')].find(r=>r.querySelector('strong')?.textContent===${JSON.stringify(owner)})`;
const inRow = (owner:string,label:string) => `[...((${roomRow(owner)})?.querySelectorAll('button') ?? [])].find(b=>b.textContent===${JSON.stringify(label)}&&!b.disabled)`;
async function openRooms(page:Page) {
  await until(page,rooms,30000);
  if (!await page.ev(`${rooms}.open`)) await press(page,`${rooms}.querySelector('summary')`);
  await until(page,`${rooms}.open`,5000);
}
const option = (label:string) => `[...document.querySelectorAll('[data-key="lobby-room-options"] label')].find(l=>l.textContent.startsWith(${JSON.stringify(label)}))?.querySelector('input')`;
async function setOption(page:Page,label:string,on:boolean) { if (await page.ev(`${option(label)}.checked`) !== on) await press(page,option(label)); expect(await page.ev(`${option(label)}.checked`)).toBe(on); }
/** Everything a page keeps where a password could leak: markup, input values, storage, console. */
const exposed = (page:Page) => page.ev(`[document.documentElement.outerHTML,...[...document.querySelectorAll('input')].map(i=>i.value),JSON.stringify(localStorage),JSON.stringify(sessionStorage),document.cookie].join('\\n')`) as Promise<string>;
const sideboard = `document.querySelector('[data-key^="sideboard:"]')`;
const resultOf = (page:Page) => page.ev(`document.querySelector('.de-duel-end')?.getAttribute('aria-label') ?? ''`) as Promise<string>;
async function surrenderAt10(a:Page,b:Page,loser:Page) {
  // Before turn 10 the server refuses with its information box; the duel goes on.
  await click(loser,'Surrender',60000);
  await until(loser,`document.querySelector('.de-duel-notice')?.textContent.includes('10th turn')`,30000);
  const refusal = await loser.ev(`document.querySelector('.de-duel-notice').textContent`) as string;
  await press(loser,`document.querySelector('.de-duel-notice button')`);
  const played = await playBoth(a,b,{ attack:false,stop:turn => turn >= 10,timeout:400000 });
  expect(played.turn).toBeGreaterThanOrEqual(10);
  await click(loser,'Surrender',60000);
  const yes = `[...document.querySelectorAll('button')].find(b=>b.dataset.key?.startsWith('prompt-option:')&&b.textContent==='Yes'&&!b.disabled)`;
  await until(loser,yes,60000); await press(loser,yes);
  for (const p of [a,b]) await until(p,`document.querySelector('.de-duel-end')||${sideboard}`,90000);
  return { refusal:refusal.trim(),turn:played.turn,agreements:played.agreements };
}

describe.skipIf(!enabled)('hosted duel rooms and best-of-three matches on the real stack',() => {
  it('creates a password Match room with options, refuses a wrong password, never exposes it, plays a match with sideboarding to an overall result',async () => {
    try {
      const names = { a:`Hra ${RUN}`, b:`Hrb ${RUN}`, c:`Hrc ${RUN}` }, password = `Pw${RUN}x`;
      const a = await openPage(), b = await openPage(), c = await openPage();
      await openClient(a,await signIn(`TestHa${RUN}`),{ assets:false }); await openClient(b,await signIn(`TestHb${RUN}`),{ assets:false }); await openClient(c,await signIn(`TestHc${RUN}`),{ assets:false });
      await enterWorld(a,names.a); await enterWorld(b,names.b); await enterWorld(c,names.c);
      await until(b,avatar(names.a),30000);
      // pvp.host: Duel Rooms → Room Options: Match, surrender on, time limit on, spectators off, a password.
      await openRooms(a);
      await press(a,`document.querySelector('[data-key="lobby-room-options"] summary')`);
      await a.ev(`(()=>{const s=document.querySelector('[data-key="room-style"]');s.value='4';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await setOption(a,'Allow surrender',true); await setOption(a,'Time limit',true); await setOption(a,'Allow spectators',false);
      await type(a,byKey('room-password'),password);
      await click(a,'Create Duel');
      await until(a,roomRow(names.a),20000);
      for (const p of [b,c]) { await openRooms(p); await until(p,roomRow(names.a),30000); }
      await screenshot(b,'pvp-room-listed');
      // Wrong password: the server refuses (original wording) and the host is not asked.
      await press(b,inRow(names.a,'Challenge'));
      await until(b,`document.querySelector('[aria-label="Room password"]')`,10000);
      await type(b,byKey('room-join-password'),'wrong');
      await press(b,`[...document.querySelectorAll('[aria-label="Room password"] button')].find(b=>b.textContent==='OK')`);
      await until(b,`document.body.innerText.includes('That room no longer exists.')`,20000);
      const wrong = (await b.ev(`document.body.innerText`) as string).match(/That room no longer exists\.\(-?\d+\)/)?.[0] ?? '';
      await sleep(1500);
      expect(await a.ev(`Boolean(${invitation})`)).toBe(false);
      // Right password: the host is asked and accepts.
      await press(b,inRow(names.a,'Challenge'));
      await until(b,`document.querySelector('[aria-label="Room password"]')`,10000);
      await type(b,byKey('room-join-password'),password);
      await press(b,`[...document.querySelectorAll('[aria-label="Room password"] button')].find(b=>b.textContent==='OK')`);
      await until(b,requesting,20000); await until(a,invitation,20000);
      expect(await a.ev(`${invitation}.innerText`)).toContain(names.b);
      await press(a,`[...document.querySelectorAll('[aria-label="Duel Invitation"] button')].find(b=>b.textContent==='Accept Duel')`);
      await startBoth(a,b);
      // The password is in no page, storage, console or server log.
      const leaks:string[] = [];
      for (const [who,p] of [['A',a],['B',b],['C',c]] as const) { if ((await exposed(p)).includes(password)) leaks.push(`${who} page/storage`); if (p.logs.some(l => l.includes(password))) leaks.push(`${who} console`); }
      if (readFileSync(stack().log,'utf8').includes(password)) leaks.push('server log');
      expect(leaks).toEqual([]);
      // Spectators off: no one is offered Watch for this duel.
      await openRooms(c);
      expect(await c.ev(`Boolean(${inRow(names.a,'Watch')})`)).toBe(false);
      const cActions = await menuActions(c,names.a);
      expect(cActions).not.toContain('Watch');
      // Time limit on: both screens show the turn player's clock.
      const [ha,hb] = await settled(a,b);
      expect(mirrored(ha,hb)).toEqual([]);
      expect(ha.clock.some(Boolean)).toBe(true);
      expect(ha.clock.join('') + hb.clock.join('')).toMatch(/Time \d+:\d\d/);
      await screenshot(a,'pvp-room-duel');
      // Game 1 of the match: B tries to surrender early, then surrenders at turn 10.
      const g1 = await surrenderAt10(a,b,b);
      expect(g1.refusal).toBe('You may surrender starting from the 10th turn.');
      record('pvp.host',{ actions:'Duel Rooms → Room Options (Match, Allow surrender, Time limit, no spectators, password) → Create Duel; B: Challenge with a wrong password, then the right one; A accepts',
        expected:'Create/join a duel with time, spectator, surrender and password options; never record the password',
        observed:`room listed for B and C; wrong password refused with "${wrong}" and A not asked; right password asked A, who accepted; clock shown (${ha.clock.filter(Boolean).join(' ')}); C offered no Watch (menu: ${cActions.join(', ')}); surrender refused before turn 10 ("${g1.refusal}") and accepted at turn ${g1.turn}; password absent from all three pages, storage, consoles and the server log` });
      // pvp.match: the round result, score and sideboarding.
      for (const p of [a,b]) await until(p,sideboard,90000);
      const score = { a:await a.ev(`document.body.innerText.match(/Match score: [^\\n]+/)?.[0]`) as string, b:await b.ev(`document.body.innerText.match(/Match score: [^\\n]+/)?.[0]`) as string };
      expect(score.a).toBe('Match score: 1 wins · 0 losses · 0 draws'); expect(score.b).toBe('Match score: 0 wins · 1 losses · 0 draws');
      await screenshot(a,'pvp-match-sideboard');
      // An illegal sideboard (Main short of its size) cannot be submitted; restoring it can.
      const submit = `[...document.querySelectorAll('button')].find(b=>b.textContent==='Submit Sideboard')`;
      await press(b,`document.querySelector('[data-key^="sideboard:"][data-key$=":main:0"]')`);
      await press(b,`[...document.querySelectorAll('button')].find(b=>b.textContent==='Main → Side')`);
      await until(b,`${submit}?.disabled===true`,10000);
      const illegal = await b.ev(`[...document.querySelectorAll('.de-error')].map(e=>e.textContent).join(' ')`) as string;
      const sideCard = `[...document.querySelectorAll('[data-key^="sideboard:"][data-key*=":side:"]')].at(-1)`;
      await press(b,sideCard);
      await press(b,`[...document.querySelectorAll('button')].find(b=>b.textContent==='Side → Main')`);
      await until(b,`${submit}&&!${submit}.disabled`,10000);
      for (const p of [a,b]) await press(p,submit);
      await startBoth(a,b);
      const hud = await a.ev(`[...document.querySelectorAll('.de-duel-clock')].map(n=>n.textContent).find(t=>t.startsWith('Match'))`) as string;
      expect(hud).toMatch(/^Match 2 · 1–0/);
      // Game 2: B surrenders at turn 10 again; A wins the match 2–0 and both can leave.
      const g2 = await surrenderAt10(a,b,b);
      for (const p of [a,b]) await until(p,finished,90000);
      const overall = { a:await resultOf(a), b:await resultOf(b), hudA:await a.ev(`[...document.querySelectorAll('.de-duel-clock')].map(n=>n.textContent).find(t=>t.startsWith('Match'))`) as string };
      expect(overall.a).toBe('Victory'); expect(overall.b).toBe('Defeat');
      await screenshot(a,'pvp-match-end-a'); await screenshot(b,'pvp-match-end-b');
      record('pvp.match',{ actions:'Match room: game 1 (B surrenders at turn 10), sideboarding (illegal Main → Side refused, restored, submitted), game 2 (B surrenders), result',
        expected:'Preserve match score, permit legal sideboarding, continue rounds and resolve the overall result',
        observed:`after game 1: A "${score.a}", B "${score.b}"; B's short Main disabled Submit ("${illegal.trim().slice(0,100)}") until restored; game 2 HUD "${hud}"; game 2 surrendered at turn ${g2.turn}; overall A ${overall.a} / B ${overall.b} (${overall.hudA ?? ''})` });
      record('pvp.end',{ actions:'Surrender before and from turn 10 in a hosted room; return to lobby',
        expected:'Resolve each termination path and return both players to a usable lobby',
        observed:`surrender: refused before turn 10 with "${g1.refusal}", confirmed at turn ${g1.turn} and ${g2.turn}; both players returned to a lobby with Create Duel available` });
      for (const p of [a,b]) await backToLobby(p);
    } finally { closeAll(); }
  },1800000);
});
