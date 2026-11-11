import { describe, expect, it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, until, press, sleep, screenshot, record, prepareDuel, duelBot, click, type Page, lobbyShown } from './harness';

const dialog = `document.querySelector('[data-key="tag-lobby"]')`;
const tagKey = (key:string) => `document.querySelector('[data-key="tag-${key}"]')`;
const dialogText = (p:Page) => p.ev(`(${dialog})?.innerText.replace(/\\s+/g,' ') ?? ''`) as Promise<string>;
/** The seat rows of an open invitation: role → "name|accepted". */
const seats = (p:Page) => p.ev(`Object.fromEntries([...(${dialog})?.querySelectorAll('[data-key^="tag-seat:"]') ?? []].filter(r=>r.tagName==='DIV').map(r=>[r.dataset.key.slice(9),r.querySelector('strong').textContent+'|'+r.dataset.accepted]))`) as Promise<Record<string,string>>;
const team = (p:Page,which:'own'|'rival') => p.ev(`[...(document.querySelector('[data-key="tag-team:${which}"]')?.querySelectorAll('strong') ?? [])].map(s=>s.textContent.replace(' (you)',''))`) as Promise<string[]>;
async function openTag(p:Page) {
  if (await p.ev(`Boolean(${dialog})`)) return;
  if (!(await p.ev(`document.querySelector('[data-key="lobby-duel-rooms"]')?.open`))) await press(p,`document.querySelector('[data-key="lobby-duel-rooms"] summary')`);
  await until(p,`${tagKey('')}||document.querySelector('[data-key="lobby-tag"]')`,30000);
  await press(p,`document.querySelector('[data-key="lobby-tag"]')`);
  // A full lobby re-render between pointer down and up (other players arriving) loses the click; press again.
  try { await until(p,dialog,5000); } catch { console.log('Tag Duel press lost; pressing again'); await press(p,`document.querySelector('[data-key="lobby-tag"]')`); await until(p,dialog,10000); }
}
async function choose(p:Page,role:string,name:string) {
  const select = `document.querySelector('[data-key="tag-seat:${role}"]')`;
  await until(p,`[...(${select})?.options ?? []].some(o=>o.textContent===${JSON.stringify(name)}&&!o.disabled)`,30000);
  await p.ev(`(()=>{const s=${select};s.value=[...s.options].find(o=>o.textContent===${JSON.stringify(name)}).value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(p,`${select}?.selectedOptions[0]?.textContent===${JSON.stringify(name)}`,5000);
}
async function invite(p:Page,teammate:string,opponent:string,other:string) {
  await openTag(p);
  await choose(p,'teammatePid',teammate); await choose(p,'opponentPid',opponent); await choose(p,'opponentTeammatePid',other);
  await press(p,tagKey('invite'));
  await until(p,`${tagKey('cancel')}`,30000);
}

/** MP from the shop header, then back to the lobby. */
async function mp(p:Page):Promise<number> {
  await click(p,'Shop'); await until(p,`[...document.querySelectorAll('strong')].some(s=>/^[\\d,]+ MP/.test(s.textContent))`,60000);
  const value = Number(String(await p.ev(`[...document.querySelectorAll('strong')].find(s=>/^[\\d,]+ MP/.test(s.textContent)).textContent`)).split(' ')[0]!.replace(/,/g,''));
  await click(p,'Return to Lobby'); await until(p,lobbyShown,60000);
  return value;
}
const relayNotices = (p:Page) => p.ev(`(document.body.innerText.match(/\\[Tag\\] Relay finished/g) ?? []).length`) as Promise<number>;
/** The captain invites; the three others accept in their own windows; captains play RPS; everyone reaches the field. */
async function startTag(pages:Page[],a:Page,teammate:string,opponent:string,other:string) {
  for (let i = 0; i < 8; i++) { try { await invite(a,teammate,opponent,other); break; } catch (e) { if (i === 7) throw e; await press(a,tagKey('close')).catch(() => {}); await sleep(4000); } }
  for (const p of pages.slice(1)) { await until(p,`${dialog}?.innerText.includes('Tag duel invitation')&&${tagKey('accept')}&&!${tagKey('accept')}.disabled`,30000); await press(p,tagKey('accept')); }
  for (const p of pages) await until(p,`document.querySelector('.de-client')?.dataset.scene==='duel'`,60000);
  await Promise.all([prepareDuel(pages[0]!,'Rock'),prepareDuel(pages[1]!,'Scissors')]);
  for (const p of pages) await until(p,`document.querySelectorAll('.de-relay-member').length===4&&document.querySelectorAll('.de-field-card').length>=10`,60000);
}
/** Seats from each page's relay roster: who is on which team and who partners whom. */
async function relayRoles(pages:Page[],names:string[]) {
  const rosters = await Promise.all(pages.map(p => p.ev(`[...document.querySelectorAll('.de-relay-member strong')].map(s=>s.textContent)`) as Promise<string[]>));
  const index = (name:string) => names.indexOf(name);
  const team = pages.map((_,i) => index(rosters[i]![0]!) === 0 || index(rosters[i]![1]!) === 0 ? 0 : 1);
  const partnerOf = pages.map((_,i) => index([rosters[i]![0]!,rosters[i]![1]!].find(n => index(n) !== i)!));
  const captains = [index(rosters[0]![0]!), index(rosters[0]![2]!)];
  return { rosters, team, partnerOf, captains, names };
}
const turnOf = (p:Page) => p.ev(`Number(/Turn (\\d+)/.exec(document.querySelector('.de-phase-bar')?.getAttribute('aria-label')??'')?.[1]??0)`) as Promise<number>;
const canEnd = (p:Page) => p.ev(`[...document.querySelectorAll('button')].some(b=>b.textContent==='End Turn'&&!b.disabled&&b.getClientRects().length)`) as Promise<boolean>;
const promptOpen = (p:Page) => p.ev(`Boolean(document.querySelector('.de-duel-prompt[role=dialog]'))`) as Promise<boolean>;
const fieldLabels = (p:Page) => p.ev(`[...document.querySelectorAll('.de-field-card')].map(b=>b.getAttribute('aria-label')).sort().join('\\n')`) as Promise<string>;
const handNames = (p:Page,side:'your'|'opponent') => p.ev(`[...document.querySelectorAll('.de-field-card')].map(b=>b.getAttribute('aria-label')??'').filter(l=>l.includes(', ${side} hand')).map(l=>l.split(',')[0])`) as Promise<string[]>;
const roster = (p:Page) => p.ev(`[...document.querySelectorAll('.de-relay-member')].map(m=>m.querySelector('strong').textContent+':'+m.querySelector('.de-note,small,span:last-child')?.textContent)`) as Promise<string[]>;
/** Relay turns until `last`: the pilot plays through its duel screen; the others must stay prompt-free. Each turn's
 * pilot must follow captain, rival captain, partner, rival partner; captains and partners see one shared field. */
async function relayTurns(pages:Page[],roles:Awaited<ReturnType<typeof relayRoles>>,last:number,shots = '') {
  const log:string[] = []; let pilot:number | null = null, turn = 0, firstTeam:number | null = null, prompts = 0;
  const sequence:number[] = [];
  while (turn < last || pilot === null) {
    // The pilot: exactly one page offers End Turn (outside prompts); wait for the new turn to settle.
    let found:number | null = null;
    for (let i = 0; i < 400 && found === null; i++) {
      for (const [k,p] of pages.entries()) {
        if (await promptOpen(p)) { if (!(await canActOn(p))) throw new Error(`prompt shown to a non-pilot: page ${k}`); prompts++; await duelBot(p,{ attack:false }); }
      }
      const ends = await Promise.all(pages.map(canEnd)), turns = await Promise.all(pages.map(turnOf));
      const t = Math.max(...turns);
      if (t > turn && ends.filter(Boolean).length === 1 && turns.every(x => x === t)) { found = ends.indexOf(true); turn = t; }
      else await sleep(150);
    }
    if (found === null) throw new Error(`no pilot after turn ${turn}`);
    pilot = found; sequence.push(pilot); firstTeam ??= roles.team[pilot]!;
    const k = sequence.length - 1, team = k % 2 === 0 ? firstTeam : 1 - firstTeam, captain = roles.captains[team]!, expected = Math.floor(k / 2) % 2 === 0 ? captain : roles.partnerOf[captain]!;
    expect(pilot).toBe(expected);
    if (k < 4) {
      const partner = roles.partnerOf[pilot]!, rivals = pages.map((_,i) => i).filter(i => roles.team[i] !== roles.team[pilot!]);
      await sleep(400);
      const [own,shared] = [await fieldLabels(pages[pilot]!),await fieldLabels(pages[partner]!)];
      expect(shared).toBe(own);
      const hand = await handNames(pages[pilot]!,'your'), rivalView = await handNames(pages[rivals[0]!]!,'opponent');
      expect(await handNames(pages[partner]!,'your')).toEqual(hand);
      expect(rivalView.length).toBe(hand.length);
      // Teammates see the captain's hand; the rivals see only face-down cards.
      for (const r of rivals) expect(new Set(await handNames(pages[r]!,'opponent'))).toEqual(new Set(['Face-down card']));
      const waiting = await pages[partner]!.ev(`document.body.innerText.includes('Waiting for')`);
      expect(waiting).toBe(true);
      expect(await pages[partner]!.ev(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Surrender')?.disabled`)).toBe(true);
      for (const r of rivals) expect(await canEnd(pages[r]!)).toBe(false);
      const ros = await roster(pages[pilot]!), partnerRos = await roster(pages[partner]!);
      log.push(`turn ${turn}: pilot ${pageName(roles,pilot)} (End Turn only there); partner's field identical (${own.split('\n').length} cards, hand ${hand.length} visible to partner: ${hand.slice(0,2).join(', ')}…); rival sees ${rivalView.length} hidden hand cards; partner waits, Surrender disabled; roster pilot [${ros.join(' ')}] partner [${partnerRos.join(' ')}]`);
      if (shots && k === 0) for (const [i,p] of pages.entries()) await screenshot(p,`${shots}-turn1-${'abcd'[i]}`);
      if (shots && k === 2) await screenshot(pages[pilot]!,`${shots}-turn3-partner-pilot`);
      // Server prompts reach only the pilot: surrender before turn 10 is refused with an information box.
      if (shots && k === 1) {
        await click(pages[pilot]!,'Surrender');
        const box = `document.querySelector('.de-duel-notice')`;
        await until(pages[pilot]!,`${box}?.querySelector('button')`,30000);
        const said = (await pages[pilot]!.ev(`${box}.innerText.replace(/\\s+/g,' ')`) as string).slice(0,140);
        for (const [i,p] of pages.entries()) if (i !== pilot) expect(await p.ev(`Boolean(${box}||document.querySelector('.de-duel-prompt[role=dialog]'))`)).toBe(false);
        await press(pages[pilot]!,`${box}.querySelector('button')`); await until(pages[pilot]!,`!${box}`,10000);
        log.push(`turn ${turn}: early Surrender by the pilot → information box "${said}" on the pilot's screen only`);
      }
    }
    if (turn >= last) break;
    // The pilot plays: the bot summons/sets once, then ends the turn.
    const start = turn;
    for (let i = 0; i < 300; i++) {
      if (Math.max(...await Promise.all(pages.map(turnOf))) > start) break;
      for (const [k2,p] of pages.entries()) if (k2 !== pilot && await promptOpen(p)) { if (!(await canActOn(p))) throw new Error(`prompt shown to a non-pilot: page ${k2}`); prompts++; await duelBot(p,{ attack:false }); }
      await duelBot(pages[pilot]!,{ attack:false, summon:k === 2 });
      await sleep(200);
    }
  }
  // The first partner pilot (turn 3) played a card through its own duel screen; everyone's log names that pilot.
  const partnerPilot = sequence[2];
  if (partnerPilot !== undefined) {
    const who = roles.names[partnerPilot]!, lines = await Promise.all(pages.map(p => p.ev(`[...document.querySelectorAll('.de-duel-log div')].map(d=>d.textContent).filter(l=>l.startsWith(${JSON.stringify(who + ' ')})&&/ (summons|sets) /.test(l))`) as Promise<string[]>));
    for (const l of lines) expect(l.length).toBeGreaterThan(0);
    log.push(`turn-3 partner pilot's own play, in all four logs: "${lines[0]![0]}"`);
  }
  log.push(`${prompts} prompts answered, each on the page whose roster said "You are playing"`);
  log.push(`pilot order ${sequence.map(i => pageName(roles,i)).join(' → ')}`);
  return { log, pilot, turn };
}
/** A page may answer a prompt only while its relay roster says it is playing. */
const canActOn = (p:Page) => p.ev(`[...document.querySelectorAll('.de-relay-member')].some(m=>m.dataset.active==='true'&&/You are playing/.test(m.textContent))`) as Promise<boolean>;
const pageName = (roles:Awaited<ReturnType<typeof relayRoles>>,i:number) => ['A','B','C','D'][i]! + (roles.captains.includes(i) ? '(captain)' : '(partner)');
/** After a relay every player can open Tag Duel and choose each of the other three again. */
async function releasedSeats(pages:Page[],names:string[]) {
  const seen:string[] = [];
  for (const [i,p] of pages.entries()) {
    await openTag(p);
    for (const [j,n] of names.entries()) if (j !== i) await until(p,`[...(document.querySelector('[data-key="tag-seat:teammatePid"]')?.options ?? [])].some(o=>o.textContent===${JSON.stringify(n)})`,30000);
    expect(await p.ev(`document.querySelector('[data-key="tag-seat:teammatePid"]').disabled`)).toBe(false);
    seen.push(['A','B','C','D'][i]!); await press(p,tagKey('close')); await until(p,`!${dialog}`,5000);
  }
  return `${seen.join(',')} each listed the other three`;
}

describe.skipIf(!enabled)('tag duels between four real players',() => {
  it('forms a four-player team from the Duel menu, relays turns between partners and releases every seat at the end',async () => {
    const pages:Page[] = [];
    try {
      const names = ['A','B','C','D'].map(x => `Tg${x} ${RUN}`), [nA,nB,nC,nD] = names as [string,string,string,string];
      for (const [i,n] of names.entries()) { const p = await openPage(1280,900); pages.push(p); await openClient(p,await signIn(`TestTg${'abcd'[i]}${RUN}`),{ assets:false }); await enterWorld(p,n); }
      const [a,b,c,d] = pages as [Page,Page,Page,Page];
      // tag.party: the Tag Duel window sits in the Duel menu beside Create Duel and Auto Duel.
      await openTag(a);
      const menu = await a.ev(`[...document.querySelectorAll('[data-key="lobby-duel-rooms"] button')].map(b=>b.textContent)`) as string[];
      expect(menu).toEqual(expect.arrayContaining(['Create Duel','Find Opponent','Tag Duel']));
      await choose(a,'teammatePid',nC);
      // Client seat validation: a chosen player cannot fill a second seat; the invitation needs all three.
      await until(a,`[...document.querySelector('[data-key="tag-seat:opponentPid"]').options].find(o=>o.textContent===${JSON.stringify(nC)}).disabled`,5000);
      expect(await a.ev(`${tagKey('invite')}.disabled`)).toBe(true);
      // Server seat validation: duplicate seats and unknown players are refused.
      const post = (p:Page,body:unknown) => p.ev(`fetch('/api/de/tag/invite',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:${JSON.stringify(JSON.stringify(body))}}).then(async r=>r.status+' '+(await r.json()).error)`) as Promise<string>;
      const selfPid = (p:Page) => p.ev(`fetch('/api/de/tag',{credentials:'include'}).then(r=>r.json()).then(s=>s.self.pid)`) as Promise<number>;
      const [pA,pB,pC,pD] = [await selfPid(a),await selfPid(b),await selfPid(c),await selfPid(d)];
      const duplicate = await post(a,{ teammatePid:pC,opponentPid:pC,opponentTeammatePid:pD }), unknown = await post(a,{ teammatePid:pC,opponentPid:pB,opponentTeammatePid:999999999 });
      expect(duplicate).toMatch(/^400 /); expect(unknown).toMatch(/^409 /);
      await choose(a,'opponentPid',nB); await choose(a,'opponentTeammatePid',nD);
      await press(a,tagKey('invite')); await until(a,tagKey('cancel'),30000);
      expect(await seats(a)).toEqual({ captain:`${nA} (you)|true`, teammate:`${nC}|false`, opponent:`${nB}|false`, 'opponent-teammate':`${nD}|false` });
      // Each invitee's window opens by itself and shows its own team first.
      for (const p of [b,c,d]) await until(p,`${dialog}?.innerText.includes('Tag duel invitation')`,30000);
      expect(await team(c,'own')).toEqual([nA,nC]); expect(await team(c,'rival')).toEqual([nB,nD]);
      expect(await team(b,'own')).toEqual([nB,nD]); expect(await team(b,'rival')).toEqual([nA,nC]);
      // While pending, an invited player cannot be invited again.
      const pending = await post(b,{ teammatePid:pD,opponentPid:pA,opponentTeammatePid:pC });
      expect(pending).toMatch(/^409 /);
      await screenshot(c,'tag-invited');
      // Leave: the teammate declines; everyone sees it and the captain can choose again.
      await press(c,tagKey('decline'));
      for (const p of [a,b,d]) await until(p,`${dialog}?.innerText.includes(${JSON.stringify(`${nC} declined the invitation.`)})`,30000);
      await until(a,tagKey('invite'),10000);
      // Leave: the other captain invites, one player accepts, then the captain cancels.
      await invite(b,nD,nA,nC);
      await until(a,`${dialog}?.innerText.includes('Tag duel invitation')&&${tagKey('accept')}`,30000);
      expect(await team(a,'own')).toEqual([nA,nC]); expect(await team(a,'rival')).toEqual([nB,nD]);
      await press(a,tagKey('accept'));
      await until(b,`document.querySelector('[data-key="tag-seat:opponent"]')?.dataset.accepted==='true'`,30000);
      await press(b,tagKey('cancel'));
      for (const p of [a,c,d]) await until(p,`${dialog}?.innerText.includes('The captain cancelled the invitation.')`,30000);
      record('tag.party',{ actions:'Four players. A opens Duel menu → Tag Duel; picks seats; duplicate/unknown seats posted; invites C (partner) vs B+D; C declines; B invites D vs A+C, A accepts, B cancels', expected:'Invite, join, leave and validate a four-player team with correct seats', observed:`Tag Duel beside ${menu.filter(m => m !== 'Tag Duel').join('/')}; chosen player disabled for other seats, Invite disabled until 3 seats; server: duplicate "${duplicate}", unknown "${unknown}", already-invited "${pending}"; seats on A: captain A ✓, partner C, opponent B, opp. partner D; invitee windows opened by themselves with own team first; decline and cancel notices reached all others` });
      // tag.relay: A invites again (after the invite cooldown); all four accept and the duel starts for everyone.
      const mpBefore = await Promise.all(pages.map(mp));
      await startTag(pages,a,nC,nB,nD);
      const roles = await relayRoles(pages,names);
      const turns = await relayTurns(pages,roles,10,'tag');
      // tag.end (surrender): the turn-10 pilot surrenders; both teams see the result; every seat is released.
      const loser = turns.pilot!, loserTeam = roles.team[loser]!;
      await click(pages[loser]!,'Surrender');
      const yes = `[...document.querySelectorAll('button')].find(b=>b.dataset.key?.startsWith('prompt-option:')&&b.textContent==='Yes'&&!b.disabled)`;
      await until(pages[loser]!,yes,60000);
      const confirmOnly = await Promise.all(pages.map(p => p.ev(`Boolean(document.querySelector('.de-duel-prompt[role=dialog]'))`) as Promise<boolean>));
      expect(confirmOnly).toEqual(pages.map((_,i) => i === loser));
      await press(pages[loser]!,yes);
      turns.log.push(`turn ${turns.turn}: surrender confirmation (Yes/No) shown only to the pilot (${confirmOnly.map(String).join('/')})`);
      record('tag.relay',{ actions:`A+C vs B+D: RPS by the captains; ${turns.log.length} turns played through each pilot's duel screen (End Turn, summons by the bot); every page sampled at each turn`, expected:'Turn relay, shared field, perspective, prompts and teammate visibility remain correct', observed:turns.log.join('; ') });
      const results = await Promise.all(pages.map(p => until(p,`document.querySelector('.de-duel-end')`,60000).then(() => p.ev(`document.querySelector('.de-duel-end').getAttribute('aria-label')`) as Promise<string>)));
      for (const [i,r] of results.entries()) expect(r).toBe(roles.team[i] === loserTeam ? 'Defeat' : 'Victory');
      await screenshot(pages[roles.partnerOf[loser]!]!,'tag-end-partner');
      for (const p of pages) await click(p,'Return to Lobby',60000);
      for (const p of pages) await until(p,`document.querySelector('.de-client')?.dataset.scene==='lobby'`,60000);
      const released = await releasedSeats(pages,names);
      const notices = await Promise.all(pages.map(p => relayNotices(p)));
      const mpAfter = await Promise.all(pages.map(mp));
      expect(notices).toEqual([1,1,1,1]); expect(mpAfter).toEqual(mpBefore);
      record('tag.end',{ actions:`Surrender by the turn-${turns.turn} pilot ${names[loser]} (confirmed); all four Return to Lobby; each opens Tag Duel; MP read in the shop before/after`, expected:'Surrender releases all seats and updates rewards once', observed:`results ${results.map((r,i) => `${names[i]} ${r}`).join(', ')}; each lobby shows exactly one "[Tag] Relay finished … awards no MP" notice (${notices.join('/')}); MP unchanged ${mpBefore.join('/')}→${mpAfter.join('/')}; after the duel every player saw the other three available in Tag Duel (${released})` });
      // tag.end (disconnect): a second relay; a partner disconnects mid-duel.
      await startTag(pages,a,nC,nB,nD);
      const roles2 = await relayRoles(pages,names);
      await relayTurns(pages,roles2,2);
      const gone = roles2.partnerOf[roles2.captains[1]!]!, goneTeam = roles2.team[gone]!;
      await click(pages[gone]!,'Return to Title');
      const stay = pages.filter((_,i) => i !== gone);
      const results2 = await Promise.all(stay.map(p => until(p,`document.querySelector('.de-duel-end')`,60000).then(() => p.ev(`document.querySelector('.de-duel-end').getAttribute('aria-label')`) as Promise<string>)));
      const stayIdx = pages.map((_,i) => i).filter(i => i !== gone);
      for (const [k,r] of results2.entries()) expect(r).toBe(roles2.team[stayIdx[k]!] === goneTeam ? 'Defeat' : 'Victory');
      for (const p of stay) await click(p,'Return to Lobby',60000);
      for (const p of stay) await until(p,`document.querySelector('.de-client')?.dataset.scene==='lobby'`,60000);
      // The disconnected player goes online again with the same character.
      const back = pages[gone]!;
      await click(back,'Go Online',60000);
      const slot = `[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes(${JSON.stringify(names[gone])})&&!b.disabled)`;
      await until(back,slot,60000); await press(back,slot); await until(back,lobbyShown,60000);
      const released2 = await releasedSeats(pages,names);
      const notices2 = await Promise.all(stay.map(p => relayNotices(p)));
      const mpAfter2 = await Promise.all(pages.map(mp));
      expect(notices2).toEqual([2,2,2]); expect(mpAfter2).toEqual(mpBefore);
      record('tag.end',{ actions:`Second relay A+C vs B+D; after 2 turns partner ${names[gone]} presses Disconnect; the others Return to Lobby; ${names[gone]} goes online again`, expected:'Disconnect releases all seats and updates rewards once', observed:`remaining results ${results2.map((r,k) => `${names[stayIdx[k]!]} ${r}`).join(', ')} (disconnected team loses); one more Relay finished notice each (${notices2.join('/')}); MP unchanged ${mpAfter2.join('/')}; all four, incl. the reconnected player, saw the other three available in Tag Duel (${released2})` });
    } finally { for (const p of pages.slice(1)) p.close(); closeAll(); }
  },900000);
});
