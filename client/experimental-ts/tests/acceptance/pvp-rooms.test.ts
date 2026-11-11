import { describe, expect, it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, type, sleep, screenshot, record, stack, byKey, searchPlayers, listRow, cardButton, type Page } from './harness';
import { avatar, invitation, requesting, onDuel, finished, menuActions, playerMenu, startBoth, read, settled, mirrored, playBoth, backToLobby } from './pvp-helpers';

/** Main's Create Duel (CWindowModelDuelWait, src/ui/htmlui/lobby.ts): the bar's Duel key, Create Duel. */
async function openCreateDuel(page:Page) {
  await press(page,byKey('menubar-duel')); await until(page,byKey('duel-create'),10000);
  await press(page,byKey('duel-create')); await until(page,byKey('room-ok'),10000);
}
/** A choice switch of Create Duel, pressed until it shows chosen (its window redraws as lobby updates arrive). */
async function choose(page:Page,key:string) {
  const sw = `${byKey(key)}?.getAttribute('aria-pressed')==='true'`;
  for (let i = 0; i < 5 && !await page.ev(sw); i++) { await press(page,byKey(key)); await sleep(300); }
  expect(await page.ev(sw)).toBe(true);
}
/** The room owners the player list finds (its search's Search for Match Duels: main's CFindMenu). */
async function matchRooms(page:Page,owner:string) { await searchPlayers(page,'Search for Match Duels'); await until(page,listRow(owner),30000); }
const sideboard = `document.querySelector('[data-key^="sideboard:"]')`;
const resultOf = (page:Page) => page.ev(`document.querySelector('.de-duel-end')?.getAttribute('aria-label') ?? ''`) as Promise<string>;
async function surrenderAt10(a:Page,b:Page,loser:Page) {
  // Before turn 10 the server refuses with its information box; the duel goes on.
  // the client asks first (main's YesNo "Surrender this duel?", surrender-yes), then the server answers
  const ask = byKey('surrender-yes');
  await click(loser,'Surrender',60000); await until(loser,ask,20000); await press(loser,ask);
  await until(loser,`document.querySelector('.de-duel-notice')?.textContent.includes('10th turn')`,30000);
  const refusal = await loser.ev(`document.querySelector('.de-duel-notice p').textContent`) as string;
  await press(loser,`document.querySelector('.de-duel-notice button')`);
  const played = await playBoth(a,b,{ attack:false,stop:turn => turn >= 10,timeout:400000 });
  expect(played.turn).toBeGreaterThanOrEqual(10);
  await click(loser,'Surrender',60000); await until(loser,ask,20000); await press(loser,ask);
  const yes = `[...document.querySelectorAll('button')].find(b=>b.dataset.key?.startsWith('prompt-option:')&&b.textContent==='Yes'&&!b.disabled)`;
  await until(loser,yes,60000); await press(loser,yes);
  for (const p of [a,b]) await until(p,`document.querySelector('.de-duel-end')||${sideboard}`,90000);
  return { refusal:refusal.trim(),turn:played.turn,agreements:played.agreements };
}

describe.skipIf(!enabled)('hosted duel rooms and best-of-three matches on the real stack',() => {
  it('creates an open Match room with options, plays a match with sideboarding to an overall result',async () => {
    try {
      const names = { a:`Hra ${RUN}`, b:`Hrb ${RUN}`, c:`Hrc ${RUN}` };
      const a = await openPage(), b = await openPage(), c = await openPage();
      await openClient(a,await signIn(`TestHa${RUN}`),{ assets:false }); await openClient(b,await signIn(`TestHb${RUN}`),{ assets:false }); await openClient(c,await signIn(`TestHc${RUN}`),{ assets:false });
      await enterWorld(a,names.a); await enterWorld(b,names.b); await enterWorld(c,names.c);
      await until(b,avatar(names.a),30000);
      // pvp.host: the bar's Duel key → Create Duel: Match Mode, Surrender ON, Time Limit ON, Watch Off (open: no password, main b70a104).
      await openCreateDuel(a);
      for (const key of ['room-match','room-surrender-on','room-time-on','room-watch-off']) await choose(a,key);
      await press(a,byKey('room-ok'));
      await until(a,`!${byKey('room-ok')}`,20000);
      for (const p of [b,c]) await matchRooms(p,names.a);
      await screenshot(b,'pvp-room-listed');
      // main b70a104: rooms are open (no password field): A's card's Send Duel Request asks the host directly; A accepts.
      await playerMenu(b,names.a,'Send Duel Request');
      await until(b,requesting,20000); await until(a,invitation,20000);
      expect(await a.ev(`${invitation}.innerText`)).toContain(names.b);
      await press(a,`document.querySelector('[data-key="duel-accept"]')`);
      await startBoth(a,b);
      // Create Duel offers no password: none is asked of the host or the joiner.
      expect(await a.ev(`Boolean(document.querySelector('input[type="password"]'))`)).toBe(false);
      // Spectators off: no one is offered Watch Duel for this duel.
      const cActions = await menuActions(c,names.a);
      expect(cActions).not.toContain('Watch Duel');
      // Time limit on: both screens show the turn player's clock.
      const [ha,hb] = await settled(a,b);
      expect(mirrored(ha,hb)).toEqual([]);
      expect(ha.clock.some(Boolean)).toBe(true);
      expect(ha.clock.join('') + hb.clock.join('')).toMatch(/Time \d+:\d\d/);
      await screenshot(a,'pvp-room-duel');
      // Game 1 of the match: B tries to surrender early, then surrenders at turn 10.
      const g1 = await surrenderAt10(a,b,b);
      expect(g1.refusal).toBe('You may surrender starting from the 10th turn.');
      record('pvp.host',{ actions:'Duel key → Create Duel (Match Mode, Surrender ON, Time Limit ON, Watch Off; open: main b70a104 has no password) → OK; B: Search for Match Duels lists A; A\'s card → Send Duel Request; A accepts',
        expected:'Create/join a duel with time, spectator and surrender options (rooms open, as main)',
        observed:`room listed for B and C; the request asked A, who accepted; clock shown (${ha.clock.filter(Boolean).join(' ')}); C offered no Watch (menu: ${cActions.join(', ')}); surrender refused before turn 10 ("${g1.refusal}") and accepted at turn ${g1.turn}` });
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
      for (const p of [a,b]) await backToLobby(p);
      record('pvp.end',{ actions:'Surrender before and from turn 10 in a hosted room; return to lobby',
        expected:'Resolve each termination path and return both players to a usable lobby',
        observed:`surrender: refused before turn 10 with "${g1.refusal}", confirmed at turn ${g1.turn} and ${g2.turn}; both players returned to a lobby with Create Duel available` });
    } finally { closeAll(); }
  },1800000);
});
