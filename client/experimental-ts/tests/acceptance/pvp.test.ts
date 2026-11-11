import { describe, expect, it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, sleep, screenshot, record, duelBot, type Page } from './harness';
import { avatar, invitation, requesting, inLobby, onDuel, finished, playerMenu, menuActions, pageText, startBoth, read, settled, mirrored, playBoth, stepBoth, backToLobby } from './pvp-helpers';

async function challenge(from:Page,to:Page,name:string) {
  await playerMenu(from,name,'Send Duel Request');
  await until(from,requesting,20000);
  await until(to,invitation,20000);
}
const reply = (page:Page,label:'Accept Duel'|'Decline') => press(page,`document.querySelector('[data-key="${label==='Accept Duel'?'duel-accept':'duel-decline'}"]')`);

describe.skipIf(!enabled)('player-versus-player duels and spectators on the real stack',() => {
  it('invitations: cancel, decline, expiry; accepted duel with hidden hands, both screens agreeing to a natural result, a spectator joining and leaving',async () => {
    try {
      const names = { a:`Pva ${RUN}`, b:`Pvb ${RUN}`, c:`Pvc ${RUN}` };
      const a = await openPage(), b = await openPage(), c = await openPage();
      await openClient(a,await signIn(`TestVa${RUN}`),{ assets:false }); await openClient(b,await signIn(`TestVb${RUN}`),{ assets:false }); await openClient(c,await signIn(`TestVc${RUN}`),{ assets:false });
      await enterWorld(a,names.a); await enterWorld(b,names.b); await enterWorld(c,names.c);
      await until(a,avatar(names.b),30000); await until(b,avatar(names.a),30000);

      // pvp.invite: A challenges B from B's player menu, then cancels while B is still asked.
      await challenge(a,b,names.b);
      const asked = (await b.ev(`${invitation}.innerText`) as string).replace(/\s+/g,' ');
      expect(asked).toContain(names.a);
      const waiting = (await a.ev(`${requesting}.innerText`) as string).replace(/\s+/g,' ');
      expect(waiting).toContain(names.b);
      await screenshot(a,'pvp-invite-waiting'); await screenshot(b,'pvp-invite-asked');
      await press(a,`document.querySelector('[data-key="duel-request-cancel"]')`);
      await until(a,`!${requesting}`,20000); await until(b,`!${invitation}`,20000);
      // Decline: the challenger reads the original "Refused." and neither side keeps a dialog.
      await challenge(a,b,names.b);
      await reply(b,'Decline');
      await until(b,`!${invitation}`,20000); await until(a,`!${requesting}`,20000);
      await until(a,`document.body.innerText.includes('Refused.')`,20000);
      // Right after a refusal the same challenge waits its cooldown; the server's message is shown.
      await playerMenu(a,names.b,'Send Duel Request');
      await until(a,`document.body.innerText.includes('Wait a moment before challenging that player again.')`,20000);
      expect(await a.ev(`Boolean(${requesting})`)).toBe(false);
      expect(await b.ev(`Boolean(${invitation})`)).toBe(false);
      // Expiry: B challenges A and nobody answers; after the server's 30 s both dialogs close and B is told.
      const sent = Date.now();
      await challenge(b,a,names.a);
      await until(a,`!${invitation}`,60000); await until(b,`!${requesting}`,60000);
      const expiredAfter = Math.round((Date.now() - sent) / 1000);
      await until(b,`document.body.innerText.includes('There is no response from your opponent.')`,20000);
      expect(expiredAfter).toBeGreaterThanOrEqual(25);
      record('pvp.invite',{ actions:'Challenge from the player menu (avatar → Duel): cancel while asked; decline; immediate re-challenge; unanswered challenge',
        expected:'Challenge, accept, decline, cancel and expire invitations without stale state',
        observed:`B was asked "${asked.slice(0,80)}", A saw "${waiting.slice(0,80)}"; Cancel closed both dialogs; Decline closed both and A read "Refused."; the re-challenge was refused with the cooldown message and opened no dialog; the unanswered challenge closed on both screens after ${expiredAfter} s with "There is no response from your opponent."` });

      // Accept (after the cooldown): A challenges B, B accepts, both prepare.
      for (let i = 0; i < 20; i++) {
        await playerMenu(a,names.b,'Send Duel Request');
        try { await until(b,invitation,8000); break; } catch { await sleep(5000); }
      }
      await reply(b,'Accept Duel');
      await startBoth(a,b);
      // pvp.start: each player sees their own hand by name and only backs of the opponent's.
      const [sa,sb] = await settled(a,b);
      await screenshot(a,'pvp-start-a'); await screenshot(b,'pvp-start-b');
      expect(sa.hand.length).toBeGreaterThanOrEqual(5); expect(sb.hand.length).toBeGreaterThanOrEqual(5);
      expect(sa.handBacks).toBe(0); expect(sb.handBacks).toBe(0);
      expect(sa.opponentHand.every(x => x === 'back')).toBe(true); expect(sb.opponentHand.every(x => x === 'back')).toBe(true);
      expect(sa.opponentHand.length).toBe(sb.hand.length); expect(sb.opponentHand.length).toBe(sa.hand.length);
      expect(mirrored(sa,sb)).toEqual([]);
      expect(sa.lp).toEqual(['8,000','8,000']);
      // No hand card name of one player appears anywhere on the other's page (the text of their screen).
      const bText = await pageText(b);
      const leaked = sa.hand.filter(n => !sb.hand.includes(n) && bText.includes(n));
      expect(leaked).toEqual([]);
      record('pvp.start',{ actions:'Accept the challenge; rock-paper-scissors; first player; deal',
        expected:'Select legal decks and establish both perspectives with correct hidden information',
        observed:`both dealt with their selected starter decks; A's hand ${sa.hand.length} named (${sa.hand.slice(0,3).join(', ')}…), B's hand ${sb.hand.length} named; each sees ${sa.opponentHand.length}/${sb.opponentHand.length} opponent card backs; none of A's hand names on B's page; LP ${sa.lp.join('/')}; field and turn mirrored` });

      // spectate.join / visibility / leave: C watches A's ongoing duel from A's player menu, sees live updates and leaves.
      let spectated = '';
      const watch = async (turn:number) => {
        if (spectated || turn < 3) return;
        await playerMenu(c,names.a,'Watch Duel');
        await until(c,onDuel,60000);
        // The stream replays the duel so far: wait until the current turn is reconstructed.
        await until(c,`/Turn [1-9]/.test(document.querySelector('.de-phase-bar')?.getAttribute('aria-label')??'')`,60000);
        const first = await read(c);
        await screenshot(c,'pvp-spectator');
        // Only public information: every hand card is a back, and there is nothing to answer or surrender.
        const cards = await c.ev(`[...document.querySelectorAll('.de-field-card')].map(b=>b.getAttribute('aria-label'))`) as string[];
        expect(cards.filter(l => /hand/.test(l) && !l.startsWith('Face-down'))).toEqual([]);
        expect(first.controls.filter(t => t !== 'Leave Duel')).toEqual([]);
        expect(await c.ev(`[...document.querySelectorAll('button')].some(b=>['Surrender','End Turn','Battle Phase'].includes(b.textContent))`)).toBe(false);
        expect(new Set(first.names)).toEqual(new Set([names.a,names.b]));
        spectated = `joined at turn ${first.turn} (${first.bar}); LP ${first.lp.join('/')}; ${cards.length} visible cards, hands all backs; controls: ${first.controls.join(', ')}`;
      };
      let live = '';
      const result = await playBoth(a,b,{ timeout:600000, each:async turn => {
        await watch(turn);
        if (spectated && !live) {
          // Live: the spectator's screen follows the players' turn and LP.
          const start = await read(c);
          const idle = [0,0];
          for (const t0 = Date.now(); Date.now() - t0 < 120000 && (await read(c)).turn === start.turn && !(await read(a)).ended;) { await stepBoth(a,b,idle); await sleep(150); }
          const [x,now] = [await read(a),await read(c)];
          expect(now.turn).toBeGreaterThan(start.turn);
          expect(new Set(now.lp)).toEqual(new Set(x.lp));
          live = `turn ${start.turn} → ${now.turn} followed live; LP ${now.lp.join('/')} matching the players`;
          await click(c,'Leave Duel');
          await until(c,inLobby,60000);
          await until(c,`!document.querySelector('.de-duel-board')`,10000);
          // After leaving, the lobby is usable and the duel no longer draws on C.
          await sleep(1500);
          expect(await c.ev(`Boolean(document.querySelector('.de-field-card'))`)).toBe(false);
          await until(c,`[...document.querySelectorAll('button')].some(b=>b.textContent==='Create Duel'&&!b.disabled)`,30000);
        }
      } });
      expect(spectated,'the spectator joined').not.toBe('');
      record('spectate.join',{ actions:`C opens A's player menu during the PvP duel and presses Watch`, expected:'Find/join a PvP duel and reconstruct the current visible state', observed:`C ${spectated}` });
      record('spectate.visibility',{ actions:'Spectator screen during the PvP duel', expected:'Hide private cards and prohibit player responses from observers', observed:`every hand card on C's screen was a back; no Surrender/End Turn/phase/prompt controls, only Leave Duel` });
      record('spectate.leave',{ actions:'Spectator watches turns pass, then Leave Duel', expected:'Live updates, late join, duel end and leave clean up the view/channel', observed:`late join at a running duel; ${live}; Leave Duel returned C to a usable lobby with no duel view left` });

      // pvp.play: natural result, complementary on both screens.
      for (const p of [a,b]) await until(p,finished,120000);
      const [ea,eb] = [await read(a),await read(b)];
      await screenshot(a,'pvp-end-a'); await screenshot(b,'pvp-end-b');
      const outcome = { Victory:'Defeat', Defeat:'Victory', Draw:'Draw' } as Record<string,string>;
      expect(['Victory','Defeat','Draw']).toContain(ea.ended);
      expect(eb.ended).toBe(outcome[ea.ended]);
      expect(ea.lp[0]).toBe(eb.lp[1]); expect(ea.lp[1]).toBe(eb.lp[0]);
      const log = await a.ev(`[...document.querySelectorAll('.de-duel-log div')].map(d=>d.textContent)`) as string[];
      expect(log.some(l => / attacks| summons /.test(l))).toBe(true);
      record('pvp.play',{ actions:'Both players play with active bots (summon, set, attack, answer prompts) to the end',
        expected:'Two clients agree on field, LP, phases, timers and final result',
        observed:`${result.agreements} turn starts checked with both settled screens mirrored (phase bar, LP, names, per-zone counts, turn clocks within 3 s); final ${ea.ended}/${eb.ended} at turn ${ea.turn}, LP ${ea.lp.join('/')} vs ${eb.lp.join('/')}; e.g. "${log.find(l => / attacks/.test(l)) ?? ''}"` });
      for (const p of [a,b]) await backToLobby(p);
      // Both can challenge again: the lobby is usable after the duel.
      expect(await menuActions(a,names.b)).toContain('Send Duel Request');
    } finally { closeAll(); }
  },1500000);
});
