import { describe, expect, it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, sleep, startNpcDuel, stageShot, byText, press, until, record, surrender, resultShown } from './harness';

/** The End Phase's hand-limit discard (the translator's CUDiscardDialog: DLG_DISCARD, VAR_DISCARD) in an NPC duel. The
 * player ends every turn without playing a card: its second turn (3, or 4 when the NPC goes first) ends with 7 in
 * hand, one too many. Live asks on a strip (CHelpDialog / CUDiscardDialog) and takes the card on the hand itself. Needs no seeding. */
const HELP = `[...document.querySelectorAll('#htmlui-host .win[data-window-class="CWindowModelHelp"]')].filter(w=>w.getClientRects().length).map(w=>w.innerText.trim())`;
const SNAP = `(()=>{const s=window.__deApp.getState().duel;return {prompt:s?.prompt?{kind:s.prompt.kind,text:s.prompt.text,cancelable:s.prompt.cancelable}:null,
  hand:[...document.querySelectorAll('.de-field-card[data-side=your][data-zone=hand]')].map(b=>({label:b.getAttribute('aria-label'),target:b.classList.contains('de-card-target')})),
  help:${HELP},bar:document.querySelector('.de-phase-bar')?.getAttribute('aria-label')??'',cancel:!!document.querySelector('.de-duel-board[data-right-cancel]')};})()`;
type Snap = { prompt:{ kind:string; text:string; cancelable:boolean }|null; hand:{ label:string; target:boolean }[]; help:string[]; bar:string; cancel:boolean };

describe.skipIf(!enabled)('hand-limit discard', () => {
  it('asks for the discard on the help strip, takes it on a hand card with the mouse, and the duel goes on', async () => {
    try {
      const page = await openPage(1280, 960);
      await openClient(page, await signIn(`TestDisc${RUN}`), { settings: { reducedMotion: true } });
      await enterWorld(page, `Disc ${RUN}`);
      await startNpcDuel(page, 'Yami Yugi');
      const no = `[...document.querySelectorAll('#htmlui-host [data-key^="prompt-option:"]')].find(b=>b.textContent.trim()==='No'&&b.getClientRects().length)`;
      let asked:Snap|null = null;
      for (const end = Date.now() + 300000; Date.now() < end && !asked;) {
        const s = await page.ev(SNAP) as Snap;
        if (s.prompt && /discard/i.test(s.prompt.text)) { asked = s; break; }
        if (await page.ev(`Boolean(${no})`)) await press(page, no).catch(() => {});
        else if (await page.ev(`Boolean(${byText('End Turn')})`)) { await press(page, byText('End Turn')).catch(() => {}); await sleep(800); }
        await sleep(300);
      }
      expect(asked).not.toBeNull();
      // the strip shows once the duel's frame draws it
      await until(page, `${HELP}.includes('Choose 1 card to discard.')`, 10000);
      const shown = await page.ev(SNAP) as Snap;
      await stageShot(page, 'discard-asked');
      expect(shown.help).toEqual(['Choose 1 card to discard.']);
      expect(shown.hand.length).toBe(7); expect(shown.hand.every(c => c.target)).toBe(true);
      // forced: no cancel on the right button
      expect(shown.prompt?.cancelable).toBe(false); expect(shown.cancel).toBe(false);
      const pick = shown.hand[0]!.label.split(',')[0]!;
      await press(page, `[...document.querySelectorAll('.de-field-card.de-card-target[data-side=your][data-zone=hand]')][0]`);
      await until(page, `!window.__deApp.getState().duel?.prompt||!/discard/i.test(window.__deApp.getState().duel.prompt.text)`, 15000);
      await until(page, `${HELP}.length===0`, 10000);
      // (the card's move to the Graveyard plays on the board's clock)
      await until(page, `document.querySelectorAll('.de-field-card[data-side=your][data-zone=hand]').length===6`, 15000);
      const after = await page.ev(SNAP) as Snap;
      await stageShot(page, 'discard-after');
      expect(after.hand.length).toBe(6);
      expect(await page.ev(`[...document.querySelectorAll('.de-field-card[data-side=your][data-zone=graveyard]')].map(b=>b.getAttribute('aria-label')).join(' ')`)).toContain(pick);
      // the duel goes on: the NPC's turn, then the player's again (the turn the discard came in is 3 or 4: who goes first is
      // the rock-paper-scissors'; the NPC's turn may ask whether to chain, answered No)
      const turn = (bar: string) => Number(/Turn (\d+)/.exec(bar)?.[1] ?? NaN), discardTurn = turn(shown.bar);
      expect(discardTurn).toBeGreaterThan(2);
      for (let i = 0; i < 400; i++) {
        const now = turn((await page.ev(SNAP) as Snap).bar);
        if (now >= discardTurn + 2 && await page.ev(`Boolean(${byText('End Turn')})`)) break;
        if (await page.ev(`Boolean(${no})`)) await press(page, no).catch(() => {});
        await sleep(300);
      }
      const back = await page.ev(SNAP) as Snap;
      expect(turn(back.bar)).toBe(discardTurn + 2);
      record('duel.selection', { actions:'NPC duel, End Turn without playing until turn 3 ends with 7 cards; the discard strip read, a hand card clicked',
        expected:'Card, field, ritual and discard selection respect bounds, cancellation and hidden identities.',
        observed:`hand-limit discard: the strip read "${shown.help[0]}", the 7 hand cards its targets, no cancel; ${pick} clicked went to the Graveyard (hand 6), the strip closed and the duel went on to ${back.bar}` });
      if (!(await page.ev(resultShown))) await surrender(page).catch(() => {});
    } finally { closeAll(); }
  }, 600000);
});
