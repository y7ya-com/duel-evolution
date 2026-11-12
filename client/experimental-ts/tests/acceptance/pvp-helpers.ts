/** Two- and three-player helpers for the PvP and spectator acceptance tests (see ACCEPTANCE.md). */
import { expect } from 'vitest';
import { until, press, pressAvatar, click, byText, byKey, sleep, duelBot, pointerAway, type Page, cardOpen, cardButton, closeCard, lobbyShown, resultShown, leaveResult } from './harness';

export const avatar = (name:string) => `[...document.querySelectorAll('[data-key^="avatar:"]')].find(a=>a.querySelector('.de-avatar-name')?.textContent===${JSON.stringify(name)})`;
/** The duel invitation and the request's waiting dialog: main's stock dialogs (dialog.js YesNo / Ok), their windows. */
export const invitation = `document.querySelector('[data-key="duel-accept"]')?.closest('.win')`;
export const requesting = `document.querySelector('[data-key="duel-request-cancel"]')?.closest('.win')`;
export const inLobby = `${lobbyShown}&&!document.querySelector('.de-duel-board')`;
export const onDuel = `document.querySelectorAll('.de-field-card').length>0&&document.querySelector('.de-phase-bar')`;
export const finished = resultShown;
/** Opens a player's card from their avatar (main's CPlayerListMenu) and presses one of its actions. */
export async function playerMenu(page:Page,name:string,action:string) {
  await until(page,avatar(name),30000);
  await pressAvatar(page,avatar(name));
  await until(page,cardButton(action),10000);
  await press(page,cardButton(action));
}
/** The actions a player's card offers (its enabled buttons' labels), the card closed again. */
export const menuActions = async (page:Page,name:string) => {
  await until(page,avatar(name),30000); await pressAvatar(page,avatar(name));
  await until(page,cardOpen,10000);
  const actions = await page.ev(`[...document.querySelectorAll('#htmlui-host [data-key^="card-"]')].filter(b=>!b.disabled).map(b=>b.textContent.trim())`) as string[];
  await closeCard(page);
  return actions;
};
/** The visible message (a status line or error) a player reads, flattened. */
export const pageText = async (page:Page) => (await page.ev('document.body.innerText') as string).replace(/\s+/g,' ');
/** Both players through rock-paper-scissors and first-player choice until both duel screens are dealt. */
export async function startBoth(a:Page,b:Page) {
  const ready = `[...document.querySelectorAll('button')].some(x=>['Rock','Go First','Go Second','Start Duel'].includes(x.textContent.trim())&&!x.disabled)||(${onDuel})`;
  // Either side may be the one to act first (in a match the previous game's loser chooses who goes first).
  await until(a,`(${ready})||document.querySelector('.de-duel-board')`,90000); await until(b,`(${ready})||document.querySelector('.de-duel-board')`,90000);
  const hands = ['Rock','Scissors','Paper'];
  for (let round = 0; round < 160; round++) {
    const dealt = await Promise.all([a,b].map(p => p.ev(`Boolean((${onDuel})&&!document.querySelector('.de-duel-prompt'))`)));
    if (dealt.every(Boolean)) return;
    for (const [i,p] of [a,b].entries()) {
      for (const label of ['Go First','Start Duel']) if (await p.ev(`Boolean(${byText(label)})`)) await press(p,byText(label)).catch(() => {});
      const hand = i ? hands[round % 3]! : 'Rock';
      if (await p.ev(`Boolean(${byText(hand)})`)) await press(p,byText(hand)).catch(() => {});
    }
    await sleep(500);
  }
  throw new Error(`Both players did not reach the dealt duel screen\n--- A ---\n${String(await a.ev('document.body.innerText')).slice(0,1200)}\n--- B ---\n${String(await b.ev('document.body.innerText')).slice(0,1200)}`);
}
export interface DuelReading { bar:string; turn:number; lp:string[]; names:string[]; counts:Record<string,number>; hand:string[]; handBacks:number; opponentHand:string[]; clock:string[]; ended:string; prompt:boolean; controls:string[] }
/** What one screen shows: the phase bar, both LP, per side/zone card counts, the hand as seen, clocks, result. */
export const read = (page:Page) => page.ev(`(()=>{
  const cards=[...document.querySelectorAll('.de-field-card')].map(b=>b.getAttribute('aria-label')??'');
  const counts={};for(const l of cards){const m=/, (your|opponent) (\\w+)/.exec(l);if(m){const k=m[1]+' '+m[2];const n=Number([...document.querySelectorAll('.de-field-card')].find(b=>b.getAttribute('aria-label')===l)?.querySelector('.de-card-count')?.textContent??1);counts[k]=['deck','graveyard','banished','extra'].includes(m[2])?n:(counts[k]??0)+1;}}
  const bar=document.querySelector('.de-phase-bar')?.getAttribute('aria-label')??'';
  return {bar,turn:Number(/Turn (\\d+)/.exec(bar)?.[1]??0),lp:[...document.querySelectorAll('.de-lp-value')].map(n=>n.textContent),names:[...document.querySelectorAll('.de-duelist-name')].map(n=>n.textContent),counts,
    hand:cards.filter(l=>/, your hand/.test(l)&&!l.startsWith('Face-down')).map(l=>l.split(', your hand')[0]),handBacks:cards.filter(l=>l==='Face-down card, your hand').length,
    opponentHand:cards.filter(l=>/opponent hand/.test(l)).map(l=>l.startsWith('Face-down')?'back':l.split(',')[0]),
    clock:[...document.querySelectorAll('.de-duelist')].map(d=>[...d.querySelectorAll('.de-duel-clock')].map(n=>n.textContent).find(t=>t.startsWith('Time'))??''),
    ended:window.__duelEnd()??'',prompt:!!document.querySelector('#htmlui-host [data-key^="prompt-"]'),
    controls:[...document.querySelectorAll('.de-phase-bar button,#htmlui-host [data-key^="prompt-"]')].filter(b=>!b.disabled&&b.getClientRects().length).map(b=>b.textContent.trim()||b.getAttribute('aria-label'))};})()`) as Promise<DuelReading>;
/** A's own side is B's opponent side and vice versa. */
export function mirrored(x:DuelReading,y:DuelReading):string[] {
  const issues:string[] = [];
  if (x.bar !== y.bar) issues.push(`phase bar "${x.bar}" vs "${y.bar}"`);
  if (x.lp[0] !== y.lp[1] || x.lp[1] !== y.lp[0]) issues.push(`LP ${x.lp} vs ${y.lp}`);
  if (x.names[0] !== y.names[1] || x.names[1] !== y.names[0]) issues.push(`names ${x.names} vs ${y.names}`);
  for (const zone of ['monster','spell','graveyard','banished','hand','deck']) {
    const mine = (r:DuelReading,s:'your'|'opponent') => r.counts[`${s} ${zone}`] ?? 0;
    if (mine(x,'your') !== mine(y,'opponent') || mine(x,'opponent') !== mine(y,'your')) issues.push(`${zone} ${mine(x,'your')}/${mine(x,'opponent')} vs ${mine(y,'your')}/${mine(y,'opponent')}`);
  }
  // Clocks: the same player's clock on both screens, within a few seconds of each other.
  const seconds = (t:string) => { const m = /(\d+):(\d+)/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  for (const [i,j] of [[0,1],[1,0]] as const) {
    const p = seconds(x.clock[i] ?? ''), q = seconds(y.clock[j] ?? '');
    if ((p === null) !== (q === null) || p !== null && q !== null && Math.abs(p - q) > 3) issues.push(`clock ${x.clock} vs ${y.clock}`);
  }
  return issues;
}
/** Reads both screens until they are settled (two identical readings each) and returns the settled pair. */
export async function settled(a:Page,b:Page):Promise<[DuelReading,DuelReading]> {
  let last:[DuelReading,DuelReading] = [await read(a),await read(b)];
  for (let i = 0; i < 20; i++) {
    await sleep(350);
    const next:[DuelReading,DuelReading] = [await read(a),await read(b)];
    const still = (p:DuelReading,q:DuelReading) => JSON.stringify({ ...p,clock:[] }) === JSON.stringify({ ...q,clock:[] });
    if (still(next[0],last[0]) && still(next[1],last[1]) && !mirrored(...next).length) return next;
    last = next;
  }
  return last;
}
/** A field selection (a tribute or a target: the cards themselves are the choices, as in the original) is answered by
 * opening each field card's details and pressing its Select action. True if one was chosen. */
export async function selectOnField(page:Page):Promise<boolean> {
  const keys = await page.ev(`[...document.querySelectorAll('.de-field-card')].filter(b=>/, (your|opponent) (monster|spell)/.test(b.getAttribute('aria-label')??'')||(b.getAttribute('aria-label')??'').startsWith('Face-down card, opponent monster')||(b.getAttribute('aria-label')??'').startsWith('Face-down card, opponent spell')).map(b=>b.dataset.key)`) as string[];
  for (const key of keys) {
    await page.ev(`[...document.querySelectorAll('.de-field-card')].find(b=>b.dataset.key===${JSON.stringify(key)})?.click()`);
    await sleep(150);
    // the card's command menu (live's CUSummonDialogSp): its Select / Inspect row
    const action = await page.ev(`[...document.querySelectorAll('[data-key^="duel-cmd:"]')].find(b=>/^(Select|Inspect)/.test(b.getAttribute('aria-label')??'')&&b.getAttribute('aria-disabled')!=='true')?.dataset.key ?? null`) as string | null;
    if (action) { await press(page,byKey(action)); return true; }
    await pointerAway(page);
  }
  return false;
}
/** One move of each bot; a player left with only field choices (no End Turn, no prompt) picks one on the field. */
export async function stepBoth(a:Page,b:Page,idle:number[],options:{ attack?:boolean; summon?:boolean } = {}) {
  const [x,y] = await Promise.all([duelBot(a,options),duelBot(b,options)]);
  for (const [i,p] of [a,b].entries()) {
    const stuck = [x,y][i] === 'idle' && await p.ev(`!document.querySelector('#htmlui-host [data-key^="prompt-"]')&&![...document.querySelectorAll('button')].some(b=>b.textContent==='End Turn')&&[...document.querySelectorAll('[data-key^="duel-cmd:"]')].some(b=>/^Inspect:/.test(b.getAttribute('aria-label')??''))`);
    idle[i] = stuck ? idle[i]! + 1 : 0;
    if (idle[i]! > 8) { idle[i] = 0; await selectOnField(p); }
  }
  return [x,y] as const;
}
/** Both bots play until `stop` (or the duel ends); at each newly reached turn both settled screens must agree. */
export async function playBoth(a:Page,b:Page,options:{ stop?:(turn:number) => boolean; attack?:boolean; summon?:boolean; timeout?:number; each?:(turn:number) => Promise<void> } = {}) {
  const start = Date.now(); let checked = 0, agreements = 0, moved = Date.now(), lastBar = '';
  const idle = [0,0];
  while (Date.now() - start < (options.timeout ?? 420000)) {
    const [x,y] = await stepBoth(a,b,idle,options);
    if (x === 'finished' && y === 'finished') break;
    const turn = Number(/Turn (\d+)/.exec(await a.ev(`document.querySelector('.de-phase-bar')?.getAttribute('aria-label')??''`) as string)?.[1] ?? 0);
    const bar = `${await a.ev(`document.querySelector('.de-phase-bar')?.getAttribute('aria-label')??''`)}|${await a.ev(`document.querySelectorAll('.de-duel-log div').length`)}`;
    if (bar !== lastBar) { lastBar = bar; moved = Date.now(); }
    else if (Date.now() - moved > 90000) throw new Error(`The duel made no progress for 90 s at ${bar}\n--- A ---\n${String(await a.ev('document.body.innerText')).slice(-1500)}\n--- B ---\n${String(await b.ev('document.body.innerText')).slice(-1500)}`);
    if (turn > checked && x !== 'finished' && y !== 'finished') {
      checked = turn;
      const pair = await settled(a,b);
      expect(mirrored(...pair),`turn ${turn}: both screens agree`).toEqual([]);
      agreements++;
      if (options.each) await options.each(turn);
      if (options.stop?.(turn)) return { turn, agreements };
    }
    await sleep(120);
  }
  return { turn:checked, agreements };
}
/** Back to the lobby after a finished duel; the lobby must be usable (rooms can be created, NPCs listed). */
export async function backToLobby(page:Page) {
  await leaveResult(page);
  await until(page,inLobby,60000);
  await createDuelOffered(page);
}
/** The lobby is usable: the bar's Duel key opens main's Duel menu with Create Duel enabled (then its Cancel). */
export async function createDuelOffered(page:Page) {
  await until(page,byKey('menubar-duel'),30000); await press(page,byKey('menubar-duel'));
  await until(page,`${byKey('duel-create')}&&!${byKey('duel-create')}.disabled`,30000);
  await press(page,byKey('duel-cancel')); await until(page,`!${byKey('duel-create')}`,10000);
}
export { byKey };
