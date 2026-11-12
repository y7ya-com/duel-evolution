import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, until, sleep, screenshot, record, startNpcDuel, duelBot, surrender, claimNpcReward, byKey, lobbyShown } from './harness';
import { resultShown } from './harness';

/** In the page: while the effects layer reports an active effect, how many pixels of its PixiJS canvas are painted
 * (every 16th pixel's alpha, read through a 2D copy: the layer keeps its drawing buffer), per effect kind. Proves the
 * original-art effects are drawn, not only scheduled. */
const SAMPLER = `(()=>{window.__fx={};window.__fxSeen=[];window.__fxShots={};setInterval(()=>{const fx=document.querySelector('.de-duel-fx');if(!fx)return;
  const kinds=(fx.dataset.active||'').split(' ').filter(Boolean);if(!kinds.length)return;const c=fx.querySelector('canvas');if(!c)return;
  let d;try{const t=document.createElement('canvas');t.width=c.width;t.height=c.height;const g=t.getContext('2d');g.drawImage(c,0,0);d=g.getImageData(0,0,c.width,c.height).data;}catch(e){window.__fxError=String(e);return;}
  let n=0;for(let i=3;i<d.length;i+=64)if(d[i]>16)n++;
  for(const k of kinds){if(!(k in window.__fx))window.__fxSeen.push(k);if(n>(window.__fx[k]||0)){window.__fxShots[k]=c.toDataURL();}window.__fx[k]=Math.max(window.__fx[k]||0,n);}},30);})()`;
const painted = (page:Awaited<ReturnType<typeof openPage>>) => page.ev(`JSON.stringify(window.__fx||{})`).then(s => JSON.parse(s as string) as Record<string,number>);
/** A portrait's painted pixels: its shown eye frame (an <img> of the 768×768 composition) read through a 2D copy. */
const portrait = (side:0|1) => `(()=>{const p=document.querySelector('.de-duel-portrait.side-${side}');const c=p&&!p.hidden&&[...p.querySelectorAll('img')].find(i=>i.style.visibility!=='hidden'&&i.complete&&i.naturalWidth);if(!c)return 0;const t=document.createElement('canvas');t.width=t.height=768;const g=t.getContext('2d');g.drawImage(c,0,0);const d=g.getImageData(0,0,768,768).data;let n=0;for(let i=3;i<d.length;i+=256)if(d[i]>16)n++;return n;})()`;

describe.skipIf(!enabled)('duel presentation with original art',() => {
  it('draws portraits, the card box and the original effects during a live NPC duel',async () => {
    try {
      const page = await openPage(1024,768); await openClient(page,await signIn(`TestFx${RUN}`),{ settings:{ reducedMotion:false } });
      await enterWorld(page,`Fx ${RUN}`);
      await startNpcDuel(page,'Yami Yugi');
      await until(page,`document.querySelectorAll('.de-field-card').length>5`,60000);
      await page.ev(SAMPLER);
      // Both waist-up portraits are composed from the duelists' avatar bytes.
      await until(page,`${portrait(0)}>500&&${portrait(1)}>500`,60000);
      const portraits = [await page.ev(portrait(0)),await page.ev(portrait(1))] as number[];
      await screenshot(page,'duelfx-start');
      const want = ['phase','turn','attack','damage'], shots = new Set<string>();
      const start = Date.now(), done = (seen:Record<string,number>) => want.every(k => (seen[k] ?? 0) > 0) && !!(seen.summon || seen.set) && Object.keys(seen).length >= 6;
      let duels = 1, attackLines = 0;
      while (Date.now() - start < 480000) {
        const state = await duelBot(page);
        const seen = await painted(page);
        for (const k of Object.keys(seen)) if (!shots.has(k)) { shots.add(k); await screenshot(page,`duelfx-${k}`); }
        attackLines = Math.max(attackLines, await page.ev(`[...document.querySelectorAll('.de-duel-log div')].filter(d=>/ attacks/.test(d.textContent)).length`) as number);
        if (done(seen)) break;
        // A duel can end without an attack (effect damage, deck-out): play another, at most three.
        if (state === 'finished') { if (duels >= 3) break; duels++; await claimNpcReward(page); await until(page,lobbyShown,60000); await startNpcDuel(page,'Yami Yugi'); await until(page,`document.querySelectorAll('.de-field-card').length>5`,60000); }
        await sleep(120);
      }
      const seen = await painted(page), error = await page.ev(`window.__fxError ?? ''`);
      const cued = await page.ev(`document.querySelector('.de-duel-fx')?.dataset.played ?? ''`) as string;
      const log = (await page.ev(`[...document.querySelectorAll('.de-duel-log div')].map(d=>d.textContent).filter(l=>/attacks|damage/.test(l)).slice(-6).join(' | ')`)) as string;
      console.log('cued', cued, 'painted', JSON.stringify(seen), 'log', log);
      // The effects canvas at its fullest frame per effect (transparent where nothing is drawn).
      const frames = JSON.parse(await page.ev(`JSON.stringify(window.__fxShots)`) as string) as Record<string,string>;
      mkdirSync('/tmp/acceptance',{ recursive:true });
      for (const [k,url] of Object.entries(frames)) writeFileSync(`/tmp/acceptance/duelfx-layer-${k}.png`,Buffer.from(url.split(',')[1]!,'base64'));
      // The card box shows the last card a summon/activation/attack pointed at, or the hovered one.
      await page.ev(`(()=>{const b=[...document.querySelectorAll('.de-field-card')].find(b=>/, your (monster|hand)/.test(b.getAttribute('aria-label')??''));b?.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));})()`);
      await until(page,`document.querySelector('.de-duel-info:not([hidden]) .de-duel-info-name')?.textContent`,10000);
      const info = await page.ev(`document.querySelector('.de-duel-info').innerText.replace(/\\s+/g,' ').slice(0,160)`) as string;
      await screenshot(page,'duelfx-info');
      expect(error).toBe('');
      // Every attack the duel log reports has its cue (the log keeps the last lines only, so at least one).
      if (attackLines) expect(Number(/attack:(\d+)/.exec(cued)?.[1] ?? 0)).toBeGreaterThan(0);
      for (const k of want) expect(seen[k] ?? 0,`${k} painted (cued ${cued}; ${log})`).toBeGreaterThan(0);
      expect((seen.summon ?? 0) + (seen.set ?? 0)).toBeGreaterThan(0);
      expect(portraits.every(n => n > 500)).toBe(true);
      record('duel.presentation',{ actions:'NPC duel (Yami Yugi) with motion on; bot summons, sets, attacks and ends turns; canvas sampled while effects run',
        expected:'Original-art duel presentation: waist-up portraits both sides, card box, phase/turn banners, summon/set, attack, LP damage digits, other cue effects drawn',
        observed:`${duels} duel(s); cues played ${cued}; portrait pixels ${portraits.join('/')}; painted samples per effect ${JSON.stringify(seen)}; card box "${info}"` });
      if (!(await page.ev(resultShown))) await surrender(page);
    } finally { closeAll(); }
  },600000);
});
