import { describe, expect, it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, sleep, record, startNpcDuel, duelBot, surrender, resultShown } from './harness';

/** In the page, on one clock (performance.now): each sound effect's start (AudioBufferSourceNode.start, with its buffer's
 * length: card_move.wav is 0.32 s), each field card's flight (its box moving, then still: start and landing), and each
 * effect kind's start on the effects layer (data-active). */
const PROBE = `(()=>{const L=window.__av={sounds:[],flights:[],fx:[]};
  const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...a){L.sounds.push({t:performance.now(),d:Math.round((this.buffer?.duration||0)*1000)});return start.apply(this,a);};
  const last=new Map(),moving=new Map();let active=new Set();
  let prev=0;L.gaps=[];
  const tick=()=>{const now=performance.now();if(prev&&now-prev>50)L.gaps.push({t:prev,d:Math.round(now-prev)});prev=now;
    // (by the card's id: a full render replaces the elements)
    for(const el of document.querySelectorAll('.de-field-card')){const id=el.dataset.key;
      const k=el.style.left+','+el.style.top,was=last.get(id);last.set(id,k);
      // in flight: its box (left / top: the board's motion; a hand card's hover lift is its margin) moving; landed: still
      if(was!==undefined&&was!==k&&!moving.has(id))moving.set(id,{start:now,zone:el.dataset.zone});
      else if(moving.has(id)&&was===k){const m=moving.get(id);moving.delete(id);L.flights.push({start:m.start,end:now,zone:el.dataset.zone,from:m.zone});}}
    const fx=document.querySelector('.de-duel-fx'),kinds=new Set((fx?.dataset.active||'').split(' ').filter(Boolean));
    for(const k of kinds)if(!active.has(k))L.fx.push({t:now,kind:k});active=kinds;requestAnimationFrame(tick);};
  requestAnimationFrame(tick);})()`;

interface Av { gaps?: { t: number; d: number }[]; sounds: { t: number; d: number }[]; flights: { start: number; end: number; zone?: string; from?: string }[]; fx: { t: number; kind: string }[] }
const near = (xs: number[], t: number) => xs.reduce((b, x) => Math.abs(x - t) < Math.abs(b - t) ? x : b, Infinity);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : NaN; };

describe.skipIf(!enabled)('duel sound and picture in step', () => {
  for (const speed of [1, 2]) it(`plays each card's sound with its flight and its summon/set effect once it is down (${speed}x)`, async () => {
    try {
      const page = await openPage(1024, 768);
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('yo2-duel-speed','${speed}')}catch{}` });
      await openClient(page, await signIn(`TestAv${speed}${RUN}`), { settings: { reducedMotion: false, sound: 0.8, music: 0 } });
      await enterWorld(page, `Av ${speed} ${RUN}`);
      await page.ev(PROBE);
      await startNpcDuel(page, 'Yami Yugi');
      const t0 = Date.now();
      while (Date.now() - t0 < 150000) {
        const state = await duelBot(page);
        const av = JSON.parse(await page.ev(`JSON.stringify(window.__av)`) as string) as Av;
        if (state === 'finished' || av.fx.filter(f => f.kind === 'summon' || f.kind === 'set').length >= 6 && av.sounds.length >= 30) break;
        await sleep(150);
      }
      const av = JSON.parse(await page.ev(`JSON.stringify(window.__av)`) as string) as Av;
      const moves = av.sounds.filter(s => s.d > 250 && s.d < 400);   // card_move.wav (0.32 s)
      const starts = av.flights.map(f => f.start), ends = av.flights.filter(f => f.zone === 'monster' || f.zone === 'spell').map(f => f.end);
      const soundToFlight = moves.map(s => s.t - near(starts, s.t)).filter(Number.isFinite);
      const landed = av.fx.filter(f => f.kind === 'summon' || f.kind === 'set').map(f => f.t - near(ends, f.t)).filter(Number.isFinite);
      const flight = median(av.flights.map(f => f.end - f.start));
      const summary = { speed, sounds: av.sounds.length, cardMoves: moves.length, flights: av.flights.length, flightMs: Math.round(flight),
        soundMinusFlightStart: soundToFlight.map(Math.round), fxMinusLanding: landed.map(Math.round) };
      console.log('AVSYNC', JSON.stringify(summary));
      // the whole run on one line (ms from the first sound or flight), for a look when it fails
      const z = Math.min(...av.sounds.map(x => x.t), ...starts);
      console.log('AVLINE', [...av.sounds.map(x => [x.t, `sound ${x.d}`] as const), ...av.flights.map(f => [f.start, `fly ${f.from}->${f.zone} ${Math.round(f.end - f.start)}ms`] as const),
        ...av.fx.map(f => [f.t, `fx ${f.kind}`] as const), ...(av.gaps ?? []).map(g => [g.t, `STALL ${g.d}ms`] as const)].sort((a, b) => a[0] - b[0]).map(([t, w]) => `${Math.round(t - z)} ${w}`).join(' | '));
      record(`duel.av-sync.${speed}x`, { actions: `NPC duel at ${speed}x with motion and sound on; sound starts, card flights and effect starts timed in the page`,
        expected: 'card_move starts with a card flight; a summon/set effect starts as its card lands, not before', observed: JSON.stringify(summary) });
      expect(moves.length).toBeGreaterThan(5);
      // each card_move sound starts with a card's flight (the probe sees it move a frame later): nine in ten within two
      // frames, none past eight (a loaded machine's slow frames)
      const off = soundToFlight.map(Math.abs).sort((a, b) => a - b);
      expect(off[Math.floor(off.length * 0.9)]!).toBeLessThan(70); expect(off[off.length - 1]!).toBeLessThan(270);
      // a summon or set effect never starts while its card is still well short of its zone
      expect(landed.length).toBeGreaterThan(0);
      expect(Math.min(...landed)).toBeGreaterThan(-140);
      if (!(await page.ev(resultShown))) await surrender(page);
    } finally { closeAll(); }
  }, 300000);
});
