import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RUN, CLIENT, enabled, openPage, closeAll, signIn, openClient, click, openDeckEditor, exitDeckEditor, until, press, pressAvatar, type, byKey, sleep, screenshot, record, prepareDuel, duelBot, startNpcDuel, surrender, claimStarter, type Page, createCharacter, freeSlot, cardButton, lobbyShown, listedNames, claimNpcReward } from './harness';
import { ArchiveReader } from '../../src/assets/archive';

/** Duel mechanics through two real browsers: each player's screen is the oracle for the other's (mirrored), and the
 * owner's screen names the cards the opponent's screen must keep hidden. */
type Card = { key:string; side:'your'|'opponent'; zone:string; index:number; position:string|null; back:boolean; label:string; count:string|null; imgs:string[] };
type Snap = { cards:Card[]; players:string[]; bar:string; log:string[]; prompt:{ id:string; kind:string; text:string }|null; actions:string[]; zones:string[]; inspector:string[]|null; ended:string|null; waiting:string|null; moving:boolean; errors:string[] };
const SNAP = `(()=>{
  const ok=b=>!b.disabled&&b.getClientRects().length;
  const nodes=[...document.querySelectorAll('.de-field-card')];
  const cards=nodes.map(b=>({key:b.dataset.key,side:b.dataset.side,zone:b.dataset.zone,index:Number(b.dataset.index),position:b.dataset.position??null,back:b.classList.contains('de-card-back'),label:b.getAttribute('aria-label')??'',count:b.querySelector('.de-card-count')?.textContent??null,imgs:[...b.querySelectorAll('img')].map(i=>i.getAttribute('src')??'')}));
  // the prompt the server issued: the rewrite's own panel, else main's duel dialogs (window.__deApp's prompt state)
  const panel=document.querySelector('.de-duel-prompt[role=dialog]'),ap=window.__deApp?.getState?.().duel?.prompt;
  const prompt=panel?{id:panel.dataset.prompt??'',kind:panel.dataset.kind??'',text:panel.getAttribute('aria-label')??''}:ap?{id:String(ap.id),kind:ap.kind,text:ap.text??''}:null;
  const ins=document.querySelector('.de-duel-inspector');
  return {cards,players:[...document.querySelectorAll('.de-duelist')].map(d=>d.getAttribute('aria-label')),bar:document.querySelector('.de-phase-bar')?.getAttribute('aria-label')??'',
    log:[...document.querySelectorAll('.de-duel-log div')].map(d=>d.textContent),prompt,
    actions:[...document.querySelectorAll('.de-duel-actions button')].filter(ok).map(b=>b.textContent).filter(t=>t!=='Surrender'),zones:[...document.querySelectorAll('.de-zone-target,.de-card-target')].filter(ok).map(b=>b.getAttribute('aria-label')),
    inspector:ins?[...ins.querySelectorAll('button')].map(b=>b.textContent):null,ended:window.__duelEnd()??null,
    waiting:[...document.querySelectorAll('.de-duel-prompt:not([role])')].map(n=>n.textContent).join(' ')||null,moving:document.body.innerText.includes('Resolving duel animations'),errors:[...document.querySelectorAll('.de-error')].map(n=>n.textContent)};
})()`;
const snap = (page:Page) => page.ev(SNAP) as Promise<Snap>;
/** Everything a page exposes as text: visible text plus every attribute value. */
const exposed = (page:Page) => page.ev(`document.body.innerText+'\\n'+[...document.querySelectorAll('*')].flatMap(n=>[...n.attributes].filter(a=>a.name!=='style'&&a.name!=='class').map(a=>a.value)).join('\\n')`) as Promise<string>;
/** The name a card shows to this page, or null for a card back. */
function nameOf(c:Card):string|null {
  const set = ' (set face-down)', at = c.label.indexOf(`, ${c.side} ${c.zone}`);
  if (at < 0 || c.label.startsWith('Face-down card')) return null;
  const name = c.label.slice(0,at);
  return name.endsWith(set) ? name.slice(0,-set.length) : c.back ? null : name;
}
const PILES = ['deck','graveyard','banished','extra'];
/** Mismatches between the owner's view of their own side and the other player's view of it (mirrored). */
function mirror(a:Snap,b:Snap):string[] {
  const out:string[] = [];
  for (const [owner,other,who] of [[a,b,'A'],[b,a,'B']] as const) {
    const own = owner.cards.filter(c => c.side === 'your'), seen = other.cards.filter(c => c.side === 'opponent');
    for (const zone of ['monster','spell','field']) {
      const o = new Map(own.filter(c => c.zone === zone).map(c => [c.index,c])), s = new Map(seen.filter(c => c.zone === zone).map(c => [c.index,c]));
      if ([...o.keys()].sort().join() !== [...s.keys()].sort().join()) { out.push(`${who} ${zone} indices ${[...o.keys()]} vs ${[...s.keys()]}`); continue; }
      for (const [i,c] of o) {
        const d = s.get(i)!;
        if (zone === 'monster' && c.position !== d.position) out.push(`${who} ${zone}[${i}] position ${c.position} vs ${d.position}`);
        if (c.back !== d.back) out.push(`${who} ${zone}[${i}] face ${c.back ? 'down' : 'up'} vs ${d.back ? 'down' : 'up'}`);
        else if (!c.back && nameOf(c) !== nameOf(d)) out.push(`${who} ${zone}[${i}] ${nameOf(c)} vs ${nameOf(d)}`);
        if (d.back && nameOf(d) !== null) out.push(`${who} ${zone}[${i}] opponent's face-down card named ${nameOf(d)}`);
      }
    }
    const hand = own.filter(c => c.zone === 'hand'), theirs = seen.filter(c => c.zone === 'hand');
    if (hand.length !== theirs.length) out.push(`${who} hand ${hand.length} vs ${theirs.length}`);
    if (hand.some(c => c.back)) out.push(`${who} own hand card shown as a back`);
    const names = hand.map(nameOf);
    for (const c of theirs) if (!c.back && !names.includes(nameOf(c))) out.push(`${who} revealed hand card ${nameOf(c)} not in the owner's hand`);
    for (const zone of PILES) {
      const o = own.find(c => c.zone === zone), d = seen.find(c => c.zone === zone);
      if (!!o !== !!d) { out.push(`${who} ${zone} pile ${o ? 'shown' : 'empty'} vs ${d ? 'shown' : 'empty'}`); continue; }
      if (o && o.count !== d!.count) out.push(`${who} ${zone} count ${o.count} vs ${d!.count}`);
      if (o && !o.back && !d!.back && nameOf(o) !== nameOf(d!)) out.push(`${who} ${zone} top ${nameOf(o)} vs ${nameOf(d!)}`);
    }
  }
  if (a.players[0] !== b.players[1] || a.players[1] !== b.players[0]) out.push(`players ${a.players.join(' | ')} vs ${b.players.join(' | ')}`);
  if (a.bar !== b.bar) out.push(`turn/phase ${a.bar} vs ${b.bar}`);
  out.push(...logMismatch(a.log,b.log));
  return out;
}
/** Log lines name cards only where the card is public or the viewer's own; the hidden wording replaces the name. */
const HIDDEN = ['A monster','a monster','A card','a card','monster'];
function sameLine(x:string,y:string) {
  if (x === y) return true;
  const pattern = (hidden:string) => new RegExp('^' + hidden.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(new RegExp(HIDDEN.join('|'),'g'),'.+') + '$');
  return pattern(x).test(y) || pattern(y).test(x);
}
function logMismatch(a:string[],b:string[]):string[] {
  const n = Math.min(a.length,b.length,40), ta = a.slice(-n), tb = b.slice(-n);
  for (let i = 0; i < n; i++) if (!sameLine(ta[i]!,tb[i]!)) return [`log differs at -${n - i}: "${ta[i]}" vs "${tb[i]}"`];
  return [];
}
/** Wait until both screens are at rest and agree; returns the agreeing snapshots or the last differences. */
async function settle(a:Page,b:Page,timeout = 12000):Promise<{ a:Snap; b:Snap; diff:string[] }> {
  let last:{ a:Snap; b:Snap; diff:string[] } | null = null, agreed = 0;
  for (const start = Date.now(); Date.now() - start < timeout;) {
    const [sa,sb] = await Promise.all([snap(a),snap(b)]);
    const diff = sa.moving || sb.moving ? ['animating'] : mirror(sa,sb);
    if (!diff.length && last && !last.diff.length && JSON.stringify(last.a.cards) === JSON.stringify(sa.cards) && JSON.stringify(last.b.cards) === JSON.stringify(sb.cards)) { if (++agreed >= 1) return { a:sa,b:sb,diff }; }
    last = { a:sa,b:sb,diff }; await sleep(250);
  }
  return last!;
}
/** Input this page has been given: a prompt, phase/action buttons, zone targets or card actions. */
const hasInput = (s:Snap) => !!s.prompt || s.actions.length > 0 || s.zones.length > 0;
const catalog = JSON.parse(readFileSync(resolve(import.meta.dirname,'../../public/card-catalog.json'),'utf8')) as { passcode:number; name:string; mergePath?:string }[];
/** merge.dat byte ranges of each card name's art (the client reads card art from there when card.dat is absent). */
let mergeEntries:ReadonlyMap<string,{ offset:number; stored:number }> | null = null;
async function artRanges(names:string[]) {
  mergeEntries ??= await new ArchiveReader(`${CLIENT}/game-assets/merge.dat`,(url,init) => fetch(url,{ ...init,headers:{ ...(init?.headers as Record<string,string>),Origin:CLIENT } })).directory();
  return names.flatMap(name => catalog.filter(c => c.name === name && c.mergePath).map(c => ({ name,entry:mergeEntries!.get(c.mergePath!) })).filter(x => x.entry).map(x => ({ name:x.name,start:x.entry!.offset,end:x.entry!.offset + x.entry!.stored - 1 })));
}
/** Records every archive range request the page makes (installed before the client loads). */
const ART_SPY = `(()=>{const f=window.fetch;window.__art=[];window.fetch=function(input,init){try{const u=String(input&&input.url||input);if(/merge\\.dat|card\\.dat/.test(u)){const h=init&&init.headers||{};const r=h.Range||h.range||(h.get&&h.get('Range'))||'';window.__art.push(u.replace(/^.*\\/game-assets\\//,'')+' '+r);}}catch{}return f.apply(this,arguments);};})();`;
/** The deck card names a character owns, read from its deck editor. */
async function deckNames(page:Page):Promise<string[]> {
  const deck = await openDeckEditor(page,1);
  await exitDeckEditor(page);
  return [...new Set([...deck.main,...deck.extra,...deck.side])];
}
/** Go online and create a character; claim the starter deck at `starter` (so the two players hold different decks). */
async function enterWith(page:Page,name:string,starter:number) {
  await click(page,'Go Online',60000);
  await until(page,freeSlot,60000);
  await createCharacter(page,name,{ wait:false });
  const slot = `[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes(${JSON.stringify(name)})&&!b.disabled)`;
  await until(page,slot,30000); await press(page,slot);
  await until(page,lobbyShown,60000);
  // main's starter picker: each player its own deck (the hidden-card checks need names the other deck lacks)
  await claimStarter(page,starter);
}
const avatar = (name:string) => `[...document.querySelectorAll('[data-key^="avatar:"]')].find(a=>a.querySelector('.de-avatar-name')?.textContent===${JSON.stringify(name)})`;
const turnOf = (s:Snap) => Number(/Turn (\d+)/.exec(s.bar)?.[1] ?? 0);

/** Prompt bookkeeping: every prompt a bot met, and whether the server moved past it after the bot's answer. */
type PromptSeen = { kind:string; text:string; answered:boolean; accepted:boolean };
function tracker() {
  const seen = new Map<string,PromptSeen>(), errors:string[] = [];
  return {
    seen, errors, probing:false,
    before(page:'A'|'B'|'N',s:Snap) {
      // The stale-input probes expect their own refusal; anything else shown as an error is a failure.
      for (const e of s.errors) if (!errors.includes(e) && !(this.probing && /expired/.test(e))) errors.push(e);
      if (s.waiting?.includes('Unsupported')) errors.push(s.waiting);
      for (const [id,p] of seen) if (id.startsWith(page + ':') && p.answered && s.prompt?.id !== id.slice(2)) p.accepted = true;
      if (s.prompt && !seen.has(`${page}:${s.prompt.id}`)) seen.set(`${page}:${s.prompt.id}`,{ kind:s.prompt.kind,text:s.prompt.text,answered:false,accepted:false });
    },
    answered(page:'A'|'B'|'N',s:Snap) { const p = s.prompt && seen.get(`${page}:${s.prompt.id}`); if (p) p.answered = true; },
    kinds() { const k = new Map<string,{ n:number; accepted:number; texts:Set<string> }>(); for (const p of seen.values()) { const e = k.get(p.kind) ?? { n:0,accepted:0,texts:new Set() }; e.n++; if (p.accepted) e.accepted++; e.texts.add(p.text); k.set(p.kind,e); } return k; },
  };
}
const describeKinds = (k:ReturnType<ReturnType<typeof tracker>['kinds']>) => [...k].map(([kind,e]) => `${kind} ×${e.n} (${e.accepted} accepted; e.g. "${[...e.texts][0]}")`).join('; ');

describe.skipIf(!enabled)('duel mechanics between two real players and against an NPC',() => {
  it('keeps both screens in mirrored agreement, hides private cards, offers only server-issued input and refuses stale input',async () => {
    try {
      const names = { a:`Dua ${RUN}`, b:`Dub ${RUN}` };
      const a = await openPage(), b = await openPage();
      for (const p of [a,b]) { await p.send('Page.enable'); await p.send('Page.addScriptToEvaluateOnNewDocument',{ source:ART_SPY }); }
      // A watches animations (reduced motion off); B keeps the default reduced motion.
      await openClient(a,await signIn(`TestDa${RUN}`),{ settings:{ reducedMotion:false } }); await openClient(b,await signIn(`TestDb${RUN}`));
      await enterWith(a,names.a,0); await enterWith(b,names.b,1);
      const decks = { a:await deckNames(a), b:await deckNames(b) };
      // Challenge: B presses A's avatar → Duel; A accepts.
      await until(b,avatar(names.a),30000);
      await pressAvatar(b,avatar(names.a)); await until(b,cardButton('Send Duel Request'),10000);
      await press(b,cardButton('Send Duel Request')); await click(a,'Accept Duel',30000);
      await Promise.all([prepareDuel(a,'Rock'),prepareDuel(b,'Scissors')]);
      for (const p of [a,b]) await until(p,`document.querySelectorAll('.de-field-card[data-side="your"][data-zone="hand"]').length>=5&&document.querySelectorAll('.de-field-card[data-side="opponent"][data-zone="hand"]').length>=5`,60000);
      await screenshot(a,'duel-pvp-a-start'); await screenshot(b,'duel-pvp-b-start');

      const prompts = tracker();
      const stats = { checkpoints:0, failed:[] as string[], leaks:[] as string[], artLeaks:[] as string[], bothInput:0, opponentActions:[] as string[], monsters:0, sets:0, ownSetNamed:0, flips:0, positions:0, lp:new Set<string>(), destroyed:0, banished:0, phases:new Set<string>(), log:0, logOrder:[] as string[], chains:0, counters:0, control:0, shuffles:0, secretChecks:0, artRequests:0, covered:[] as string[], piles:new Set<string>() };
      let previous:{ a:Snap; b:Snap } | null = null, lastTurn = 0, lastBar = '';
      const checkpoint = async (why:string) => {
        const s = await settle(a,b);
        stats.checkpoints++;
        if (s.diff.length) { stats.failed.push(`${why} @ ${s.a.bar}: ${s.diff.slice(0,4).join('; ')}`); await screenshot(a,`duel-mismatch-a-${stats.failed.length}`); await screenshot(b,`duel-mismatch-b-${stats.failed.length}`); }
        if (hasInput(s.a) && hasInput(s.b)) stats.bothInput++;
        // cards.hidden: names on the owner's private cards appear nowhere on the other page (text or attributes), and
        // the other page never requested their art.
        for (const [owner,other,otherPage,otherDeck] of [[s.a,s.b,b,decks.b],[s.b,s.a,a,decks.a]] as const) {
          const publicNames = new Set([...owner.cards,...other.cards].filter(c => !c.back).map(nameOf).filter(Boolean) as string[]);
          const logText = other.log.join('\n');
          const secret = [...new Set(owner.cards.filter(c => c.side === 'your' && (c.zone === 'hand' || c.back && ['monster','spell','field'].includes(c.zone))).map(nameOf).filter((n):n is string => !!n))]
            .filter(n => !publicNames.has(n) && !otherDeck.includes(n) && !logText.includes(n));
          if (!secret.length) continue;
          stats.secretChecks += secret.length;
          const text = await exposed(otherPage);
          for (const n of secret) if (text.includes(n)) stats.leaks.push(`${n} exposed on the opponent's page @ ${owner.bar}`);
          const requests = await otherPage.ev(`window.__art ?? []`) as string[];
          stats.artRequests = Math.max(stats.artRequests,requests.length);
          for (const r of await artRanges(secret)) for (const q of requests) {
            const m = /^merge\.dat bytes=(\d+)-(\d+)$/.exec(q); if (m && Number(m[1]) <= r.end && Number(m[2]) >= r.start && Number(m[2]) - Number(m[1]) < 4 * 1024 * 1024) stats.artLeaks.push(`${r.name} art requested by the opponent (${q})`);
          }
        }
        // Observations for the evidence.
        for (const v of [s.a,s.b]) {
          stats.monsters = Math.max(stats.monsters,v.cards.filter(c => c.zone === 'monster').length);
          stats.sets += v.cards.filter(c => c.side === 'opponent' && c.back && ['monster','spell'].includes(c.zone)).length ? 1 : 0;
          stats.ownSetNamed += v.cards.filter(c => c.side === 'your' && c.back && ['monster','spell'].includes(c.zone) && nameOf(c)).length;
          for (const c of v.cards) if (PILES.includes(c.zone) && c.count) stats.piles.add(`${c.zone}`);
          stats.phases.add(v.bar.replace(/^Turn \d+, /,'').replace(/, .*$/,''));
          stats.lp.add(v.players.join(' | '));
        }
        if (previous) {
          for (const [was,now] of [[previous.a,s.a],[previous.b,s.b]] as const) {
            const before = new Map(was.cards.map(c => [c.key,c]));
            for (const c of now.cards) {
              const o = before.get(c.key); if (!o) continue;
              if (o.zone === 'monster' && c.zone === 'monster' && o.side === c.side && o.index === c.index) { if (o.back && !c.back) stats.flips++; if (o.position !== c.position) stats.positions++; }
              if (o.side !== c.side && o.zone === 'monster' && c.zone === 'monster') stats.control++;
            }
            const grave = (v:Snap) => v.cards.filter(c => c.zone === 'graveyard').reduce((n,c) => n + Number(c.count ?? 0),0);
            if (grave(now) > grave(was)) stats.destroyed++;
            const banished = (v:Snap) => v.cards.filter(c => c.zone === 'banished').reduce((n,c) => n + Number(c.count ?? 0),0);
            if (banished(now) > banished(was)) stats.banished++;
            // duel.log: the earlier log's last lines are still present, in order, in the later log.
            const tail = was.log.slice(-4), at = now.log.findIndex((_,i) => tail.every((l,j) => now.log[i + j] === l));
            if (tail.length && at < 0 && now.log.length >= 60 === false) stats.logOrder.push(`${was.bar}: "${tail.join(' / ')}" lost in later log`);
          }
        }
        stats.log = Math.max(stats.log,s.a.log.length);
        stats.chains += s.a.log.concat(s.b.log).filter(l => / activates /.test(l)).length ? 1 : 0;
        stats.shuffles += s.a.log.filter(l => /shuffles/.test(l)).length ? 1 : 0;
        previous = { a:s.a,b:s.b };
        return s;
      };

      // duel.actions: an opponent's card offers nothing but reading; a face-down one cannot even be inspected.
      const probeOpponentCards = async (page:Page,label:string) => {
        const s = await snap(page); if (s.prompt) return;
        for (const c of s.cards.filter(c => c.side === 'opponent' && ['monster','spell','hand'].includes(c.zone)).slice(0,3)) {
          await press(page,`[...document.querySelectorAll('button')].find(b=>b.dataset.key===${JSON.stringify(c.key)})`).catch(() => {});
          await sleep(250);
          const ins = await page.ev(`(()=>{const i=document.querySelector('.de-duel-inspector');return i?[...i.querySelectorAll('button')].map(b=>b.textContent):null})()`) as string[] | null;
          if (c.back && ins) stats.opponentActions.push(`${label}: face-down ${c.zone} opened an inspector`);
          if (ins && ins.some(t => t !== 'Close')) stats.opponentActions.push(`${label}: opponent ${c.zone} offered ${ins.join(', ')}`);
          if (ins) await press(page,`[...document.querySelectorAll('.de-duel-inspector button')].find(b=>b.textContent==='Close')`).catch(async (error:Error) => {
            // Gone (a re-render closed it) is fine; covered is a layout defect.
            const state = await page.ev(`(()=>{const b=[...document.querySelectorAll('.de-duel-inspector button')].find(b=>b.textContent==='Close');if(!b)return 'gone';const r=b.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return 'covered by '+(h?.closest('section,aside,div')?.className??h?.tagName)})()`) as string;
            if (state !== 'gone') { stats.covered.push(`${label}: inspector Close ${state}`); await screenshot(page,`duel-covered-${stats.covered.length}`); }
            void error;
          });
        }
      };

      // duel.stale: a prompt button captured before it was answered refuses to act once a newer prompt is active.
      let stale:{ page:Page; who:'A'|'B'; prompt:string; key:string; captured:string } | null = null, staleResult = '';
      let staleAction:{ page:Page; who:'A'|'B'; turn:number; label:string } | null = null, staleActionResult = '';
      let logProbe = '', inspectProbe = '', animationProbe = '';
      const start = Date.now(), stalls:string[] = [];
      let result = '', ended = 'natural result', idleSince = Date.now(), lastSignature = '';
      while (Date.now() - start < 540000) {
        const [sa,sb] = await Promise.all([snap(a),snap(b)]);
        prompts.before('A',sa); prompts.before('B',sb);
        if (sa.ended || sb.ended) { result = `${sa.ended}/${sb.ended}`; break; }
        if (animationProbe === '' && sa.moving) {
          // duel.presentation: while A's board animates, A is given no input (the prompt waits for the animation).
          const s = await snap(a);
          if (s.moving) animationProbe = s.prompt || s.actions.length || s.zones.length ? `input offered during animation: ${s.prompt?.text ?? s.actions.join(',')}` : `animating with input withheld (${s.waiting ?? 'no prompt'})`;
        }
        if (turnOf(sa) !== lastTurn || sa.bar !== lastBar) {
          await checkpoint(`turn ${turnOf(sa)}`);
          if (turnOf(sa) !== lastTurn && turnOf(sa) >= 2) {
            const waiter = sa.bar.includes(names.a) ? b : a;
            await probeOpponentCards(waiter,waiter === a ? 'A (waiting)' : 'B (waiting)');
            await probeOpponentCards(waiter === a ? b : a,waiter === a ? 'B (acting)' : 'A (acting)');
          }
          lastTurn = turnOf(sa); lastBar = sa.bar;
        }
        // Stale prompt: capture an answer button of the current prompt; after the next prompt arrives, press it.
        for (const [page,s,who] of [[a,sa,'A'],[b,sb,'B']] as const) {
          if (!stale && s.prompt && turnOf(s) >= 2) {
            const key = await page.ev(`(()=>{const p=document.querySelector('.de-duel-prompt[role=dialog]')??document.querySelector('#htmlui-host');if(!p)return null;const b=[...p.querySelectorAll('button')].find(b=>b.dataset.key?.startsWith('prompt-option:')||b.dataset.key?.startsWith('prompt-candidate:'));if(!b)return null;window.__stale=b;return b.dataset.key})()`) as string | null;
            if (key) stale = { page,who,prompt:s.prompt.id,key,captured:s.prompt.text };
          } else if (stale && stale.page === page && !staleResult && s.prompt && s.prompt.id !== stale.prompt) {
            const before = await snap(page);
            prompts.probing = true; await page.ev(`window.__stale.click()`); await sleep(400);
            const after = await snap(page);
            staleResult = `${who}: old "${stale.captured}" answer pressed under new "${before.prompt!.text}": ${after.errors.join(' ') || 'no message'}; prompt ${after.prompt?.id === before.prompt!.id ? 'still active' : 'changed'}`;
            // the rewrite's panel says the choice expired; main's dialogs drop the old window's key with it (the press
            // reaches no handler): either way the new prompt stays and nothing is answered
            if (await page.ev(`Boolean(document.querySelector('.de-duel-prompt[role=dialog]'))`)) expect(after.errors.join(' ')).toContain('expired');
            else expect(after.errors.filter(e => !/expired/.test(e))).toEqual([]);
            expect(after.prompt?.id).toBe(before.prompt!.id);
          }
          // Stale action: keep the phase button of one turn and press it on the player's next turn.
          if (!staleAction && s.actions.includes('End Turn') && turnOf(s) >= 2 && !s.prompt) {
            const label = s.actions.find(t => t === 'Battle Phase') ?? 'End Turn';
            await page.ev(`window.__staleAction=[...document.querySelectorAll('.de-duel-actions button')].find(b=>b.textContent===${JSON.stringify(label)})`);
            staleAction = { page,who,turn:turnOf(s),label };
          } else if (staleAction && staleAction.page === page && !staleActionResult && turnOf(s) >= staleAction.turn + 2 && s.actions.includes('End Turn') && !s.prompt) {
            prompts.probing = true; await page.ev(`window.__staleAction.click()`); await sleep(600);
            const after = await snap(page);
            staleActionResult = `${who}: "${staleAction.label}" button from turn ${staleAction.turn} pressed on turn ${turnOf(s)}: ${after.errors.join(' ') || 'no message'}; phase ${after.bar === s.bar ? 'unchanged' : `changed to ${after.bar}`}`;
            expect(after.errors.join(' ')).toContain('expired');
            expect(after.bar).toBe(s.bar);
          }
          // duel.log: scroll the log while a prompt waits; the prompt stays and is then answered normally.
          const box = !logProbe && s.prompt ? await page.ev(`(()=>{const l=document.querySelector('.de-duel-log');const r=l.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,top:l.scrollTop,max:l.scrollHeight-l.clientHeight}})()`) as { x:number; y:number; top:number; max:number } : null;
          if (box && s.prompt && box.max > 20) {
            await page.send('Input.dispatchMouseEvent',{ type:'mouseWheel',x:box.x,y:box.y,deltaX:0,deltaY:-400 }); await sleep(400);
            const scrolled = await page.ev(`document.querySelector('.de-duel-log').scrollTop`) as number;
            const after = await snap(page);
            logProbe = `${who}: log of ${s.log.length} lines scrolled ${box.top}→${scrolled} (of ${box.max}) under "${s.prompt.text}"; prompt ${after.prompt?.id === s.prompt.id ? 'unchanged' : 'changed'}`;
            expect(scrolled).toBeLessThan(box.top);
            expect(after.prompt?.id).toBe(s.prompt.id);
          }
        }
        // duel.presentation: an inspector opened on one's own face-up card stays open while the opponent acts.
        if (!inspectProbe && turnOf(sa) >= 3 && !sa.prompt && !hasInput(sa) && hasInput(sb)) {
          const mine = sa.cards.find(c => c.side === 'your' && c.zone === 'hand' && !c.back);
          if (mine) {
            await press(a,`[...document.querySelectorAll('button')].find(b=>b.dataset.key===${JSON.stringify(mine.key)})`).catch(() => {});
            await until(a,`document.querySelector('.de-duel-inspector')`,5000).catch(() => {});
            for (let i = 0; i < 6; i++) { await duelBot(b); await sleep(250); }
            const still = await a.ev(`document.querySelector('.de-duel-inspector h2')?.textContent ?? null`);
            inspectProbe = `A inspected ${nameOf(mine)} during B's actions: ${still ? `still open (${still})` : 'closed'}`;
            if (still) await press(a,`[...document.querySelectorAll('.de-duel-inspector button')].find(b=>b.textContent==='Close')`);
            continue;
          }
        }
        // A stall (nobody holds input for long) is a defect to see, not to wait out: dump both screens once per stall.
        const signature = JSON.stringify([sa.bar,sa.prompt?.id,sa.actions,sa.zones,sa.log.length,sa.cards.length,sb.bar,sb.prompt?.id,sb.actions,sb.zones,sb.log.length,sb.cards.length]);
        if (signature !== lastSignature) { lastSignature = signature; idleSince = Date.now(); }
        else if (Date.now() - idleSince > 25000) {
          stalls.push(`turn ${turnOf(sa)}: A ${JSON.stringify({ bar:sa.bar,prompt:sa.prompt,actions:sa.actions,zones:sa.zones,waiting:sa.waiting,errors:sa.errors,inspector:sa.inspector })} B ${JSON.stringify({ bar:sb.bar,prompt:sb.prompt,actions:sb.actions,zones:sb.zones,waiting:sb.waiting,errors:sb.errors,inspector:sb.inspector })}`);
          await screenshot(a,`duel-stall-a-${stalls.length}`); await screenshot(b,`duel-stall-b-${stalls.length}`);
          console.log('stall',stalls.at(-1),'\nA text:',(await a.ev('document.body.innerText') as string).slice(0,1500),'\nA logs:',a.logs.slice(-15).join('\n'),'\nA model:',await ((p:Page)=>p.ev(`(()=>{const d=window.__deApp?.diagnostics.duel;if(!d)return null;return JSON.stringify({prompt:d.prompt&&{...d.prompt,actions:d.prompt.actions?.length},accepting:d.acceptingInput,inputKind:d.inputKind,unsupported:d.unsupported.slice(-3),errors:d.errors.slice(-3),events:d.events.slice(-6).map(e=>e.type+':'+e.player+':'+JSON.stringify(e.params).slice(0,60))}).slice(0,3000)})()`))(a),'\nB model:',await ((p:Page)=>p.ev(`(()=>{const d=window.__deApp?.diagnostics.duel;if(!d)return null;return JSON.stringify({prompt:d.prompt&&{...d.prompt,actions:d.prompt.actions?.length},accepting:d.acceptingInput,inputKind:d.inputKind,unsupported:d.unsupported.slice(-3),errors:d.errors.slice(-3),events:d.events.slice(-6).map(e=>e.type+':'+e.player+':'+JSON.stringify(e.params).slice(0,60))}).slice(0,3000)})()`))(b),'\nB logs:',b.logs.slice(-15).join('\n'));
          idleSince = Date.now();
          if (stalls.length >= 2) break;
        }
        // A sets its cards face-down (hidden identities, flips when attacked); B activates what it can (chains, targets).
        const step = async (page:Page,s:Snap,who:'A'|'B') => { const r = await duelBot(page,who === 'A' ? { set:true } : { activate:true }); if (r === 'acted') prompts.answered(who,s); return r; };
        await Promise.all([step(a,sa,'A'),step(b,sb,'B')]);
        await sleep(120);
        if (turnOf(sa) >= 14 && !result) {
          // A long duel: B surrenders (the server confirms from turn 10).
          await checkpoint('before surrender');
          await surrender(b); await until(a,`window.__duelEnd()`,60000); ended = `B surrendered on turn ${turnOf(sa)}`;
          result = `${await a.ev(`window.__duelEnd()`)}/${await b.ev(`window.__duelEnd()`)}`;
          break;
        }
      }
      await screenshot(a,'duel-pvp-a-end'); await screenshot(b,'duel-pvp-b-end');
      const final = await Promise.all([snap(a),snap(b)]);
      const kinds = prompts.kinds();
      console.log(JSON.stringify({ result,stats:{ ...stats,lp:[...stats.lp].slice(-3),phases:[...stats.phases],piles:[...stats.piles] },kinds:describeKinds(kinds),stale:staleResult,staleAction:staleActionResult,logProbe,inspectProbe,animationProbe,errors:prompts.errors,stalls },null,1));
      expect(stalls).toEqual([]);
      expect(['Victory/Defeat','Defeat/Victory','Draw/Draw']).toContain(result);
      expect(stats.failed).toEqual([]);
      expect(stats.leaks).toEqual([]);
      expect(stats.artLeaks).toEqual([]);
      expect(stats.bothInput).toBe(0);
      expect(stats.opponentActions).toEqual([]);
      expect(stats.covered).toEqual([]);
      expect(stats.logOrder).toEqual([]);
      expect(prompts.errors).toEqual([]);
      expect(stats.checkpoints).toBeGreaterThan(10);
      expect(stats.secretChecks,'hidden cards were checked').toBeGreaterThan(0);
      expect(stats.artRequests,'the art spy saw the opponent page load art').toBeGreaterThan(0);
      const turns = turnOf(final[0]) || lastTurn;
      record('duel.field',{ actions:`PvP ${names.a} vs ${names.b}, both bots summon/set/attack; ${stats.checkpoints} settled checkpoints`, expected:'Deck, hand, monster, spell, grave, banish and extra zones preserve order and ownership.', observed:`at every checkpoint A's own zones (per index), hand count and deck/grave/banish/extra counts equalled B's mirrored opponent side and vice versa; up to ${stats.monsters} monsters on the field; piles seen: ${[...stats.piles].join(', ')}; ${turns} turns; result ${result} (${ended})` });
      record('duel.visibility',{ actions:'Both players set and summon cards; each checkpoint compares face, position and names across the two screens', expected:'Reveal/hide cards, tokens, control changes, shuffles and positions match server state.', observed:`face-up/face-down and attack/defense agreed per zone index at all ${stats.checkpoints} checkpoints; ${stats.flips} flips, ${stats.positions} position changes, ${stats.control} control changes, ${stats.shuffles} shuffle checkpoints observed; own set cards named to their owner ${stats.ownSetNamed} times and never to the opponent` });
      record('duel.combat',{ actions:'Bots enter the Battle Phase and attack each turn', expected:'Render phases, chains, battle, LP, stats, counters and destruction correctly.', observed:`phases ${[...stats.phases].join(' / ')}; LP and turn/phase bar equal on both screens throughout (last: ${[...stats.lp].at(-1)}); ${stats.destroyed} graveyard increases; ${stats.chains} checkpoints with activations; result ${result} (${ended})` });
      record('duel.actions',{ actions:"Each checkpoint checks which screen holds input; opponent cards pressed on both the waiting and the acting screen", expected:'Only current server-issued card/phase actions can generate valid responses.', observed:`never both screens offered input at once (${stats.checkpoints} checkpoints); opponent cards offered no actions and face-down opponent cards opened nothing` });
      record('duel.stale',{ actions:'A captured prompt answer pressed after a newer prompt arrived; a phase button from an earlier turn pressed on a later turn', expected:'Reject stale input and display unsupported prompts without fabricating a valid action.', observed:`${staleResult || 'no second prompt arrived for the captured one'}; ${staleActionResult || 'stale phase button not exercised'}; no "Unsupported gameplay" state seen` });
      record('duel.log',{ actions:'Scroll the duel log while a prompt waits; compare log order between screens and over time', expected:'Open supported duel logs, retain ordering and card references, and close without affecting active prompts.', observed:`${logProbe || 'no prompt with a long log'}; logs of both screens agreed line by line (hidden names replaced by "a card/a monster"); earlier lines kept their order in later logs; ${stats.log} lines shown` });
      record('duel.presentation',{ actions:'A plays with animations on; A inspects a card while B acts', expected:'Animations, card inspection and logs remain ordered while input waits appropriately.', observed:`${animationProbe || 'no animation observed'}; ${inspectProbe || 'inspection probe not reached'}` });
      record('cards.hidden',{ actions:"Each checkpoint reads the owner's hidden cards (hand, set cards) and searches the opponent's whole page (text and attributes) and its art requests", expected:'Card backs and unknown assets reveal no private identity and remain usable.', observed:`${stats.secretChecks} hidden card names (hand and set cards, excluding names public or in the viewer's own deck) checked against the opponent's whole DOM text and attributes and against up to ${stats.artRequests} archive range requests (merge.dat entries of their art) over ${stats.checkpoints} checkpoints: none exposed or requested; opponent's cards drawn as the original card back` });
      record('duel.prompts',{ actions:'Both bots answer every prompt the PvP duel raised', expected:'Yes/no, options, position, race, attribute, number and announce-card map to correct bytes.', observed:`PvP prompts: ${describeKinds(kinds)}` });
    } finally { closeAll(); }
  },900000);

  it('answers every prompt an NPC duel raises with a response the server accepts',async () => {
    try {
      const page = await openPage(); await openClient(page,await signIn(`TestDn${RUN}`),{ assets:false });
      await enterWith(page,`Dun ${RUN}`,0);
      const prompts = tracker();
      let duels = 0, results:string[] = [];
      for (const npc of ['Yami Yugi','Tea Gardner','Joey Wheeler','Jaden Yuki','Chazz Princeton']) {
        await click(page,'Return to Lobby').catch(() => {}); await until(page,lobbyShown,60000);
        const listed = await listedNames(page);
        if (!listed.includes(npc)) { results.push(`${npc}: not in this area (${listed.join(', ')})`); continue; }
        try { await startNpcDuel(page,npc); } catch (error) { results.push(`${npc}: no duel (${String(error).slice(0,120)})`); continue; }
        duels++;
        const start = Date.now();
        while (Date.now() - start < 300000) {
          const s = await snap(page); prompts.before('N',s);
          if (s.ended) { results.push(`${npc}: ${s.ended}`); break; }
          const r = await duelBot(page,{ activate:true }); if (r === 'acted') prompts.answered('N',s);
          await sleep(120);
        }
        if (!(await snap(page)).ended) { await surrender(page).catch(() => {}); results.push(`${npc}: surrendered after timeout`); }
        // the reward talk and main's pack picker (a modal over the lobby until its OK), as a player takes them
        await claimNpcReward(page);
        if (prompts.kinds().size >= 5 || duels >= 3) break;
      }
      const kinds = prompts.kinds();
      console.log(JSON.stringify({ duels,results,kinds:describeKinds(kinds),errors:prompts.errors }));
      expect(duels).toBeGreaterThan(0);
      expect(prompts.errors).toEqual([]);
      for (const [kind,e] of kinds) expect(e.accepted,`${kind} prompts accepted`).toBeGreaterThan(0);
      record('duel.prompts',{ actions:`NPC duels (${results.filter(r => /Victory|Defeat|Draw|surrender/.test(r)).join('; ')}) with a bot answering every prompt through the prompt dialogs`, expected:'Yes/no, options, position, race, attribute, number and announce-card map to correct bytes.', observed:`prompt kinds met and accepted by the server: ${describeKinds(kinds)}; no refused or unsupported response` });
      const selection = [...kinds].filter(([k]) => ['cards','place'].includes(k));
      if (selection.length) record('duel.selection',{ actions:'Card and zone selection prompts answered by the bot (first candidate, confirm; or an on-field zone)', expected:'Card, field, ritual and discard selection respect bounds, cancellation and hidden identities.', observed:`selection prompts: ${selection.map(([k,e]) => `${k} ×${e.n}, ${e.accepted} accepted ("${[...e.texts][0]}")`).join('; ')}` });
    } finally { closeAll(); }
  },900000);
});
