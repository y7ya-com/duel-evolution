import { describe, expect, it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, pressAvatar, byKey, byText, sleep, screenshot, record, prepareDuel, stack, type Page, cardButton, closeCard, lobbyShown } from './harness';

/** Duel cases ordinary play rarely reaches (control changes, tokens, counters, shuffles, declarations, ritual and
 * discard selections, cancellation), forced with tiny decks: a deck of 6 is the whole opening hand plus the first draw,
 * so each player holds known cards. Two real browsers play them; each screen checks the other.
 *
 * Needs its own local stack (ACCEPTANCE.md, "Scenario duels"): DEV:1 for /__dev/state, which gives the characters the
 * cards, and DECK_CHECK:avisar so a PvP duel accepts a deck under 40 cards. Seeding replaces the server state. */
const scenario = enabled && process.env.ACCEPTANCE_SCENARIO === '1';
const CARDS = { breaker:71413901, scapegoat:73915051, prohibition:43711255, mst:5318639, celtic:91152257, coh:4031928, skull:70781053,
  snatch:45986603, moon:14087893, trooper:85087012, earthshaker:60866277, tiv:33184167, designator:89801755, blr:55761792, bls:5405694,
  reborn:83764718, pog:55144522, gold:75500286, poison:8842266 };
const C = CARDS, rep = (pc:number,n:number) => Array<number>(n).fill(pc);
/** First player draws on turn 1 (MR1): 6 cards are the whole hand on that turn. Duplicates guarantee a card in a hand of 6. */
const DECKS = {
  a: { 'Scenario 1':[C.breaker,C.scapegoat,C.prohibition,C.mst,C.celtic,C.celtic],
    'Scenario 2':[...rep(C.trooper,4),...rep(C.earthshaker,4),C.celtic],
    'Scenario 3':[...rep(C.pog,3),...rep(C.celtic,5)] },
  b: { 'Scenario 1':[C.coh,C.skull,C.snatch,C.mst,C.moon,C.celtic],
    'Scenario 2':[C.tiv,C.designator,C.reborn,C.blr,C.bls,C.celtic],
    'Scenario 3':[...rep(C.gold,4),...rep(C.poison,4),C.celtic] },
};

type View = { bar:string; players:string[]; cards:string[]; prompt:{ kind:string; id:string; text:string; buttons:string[] }|null; actions:string[]; zones:string[]; waiting:string|null; errors:string[]; log:string[]; ended:string|null; instruction:string|null; badges:string[] };
const VIEW = `(()=>{const ok=b=>!b.disabled&&b.getClientRects().length;const p=document.querySelector('.de-duel-prompt[role=dialog]');
  return {bar:document.querySelector('.de-phase-bar')?.getAttribute('aria-label')??'',players:[...document.querySelectorAll('.de-duelist')].map(d=>d.getAttribute('aria-label')),
  cards:[...document.querySelectorAll('.de-field-card')].map(b=>b.getAttribute('aria-label')+(b.querySelector('.de-card-count')?' ×'+b.querySelector('.de-card-count').textContent:'')),
  prompt:p?{kind:p.dataset.kind,id:p.dataset.prompt,text:p.innerText,buttons:[...p.querySelectorAll('button,input')].map(x=>(x.dataset.key||x.tagName)+'|'+(x.textContent||x.value)+(x.disabled?'|disabled':''))}:null,
  actions:[...document.querySelectorAll('.de-duel-actions button')].filter(ok).map(b=>b.textContent),zones:[...document.querySelectorAll('.de-zone-target,.de-card-target')].filter(ok).map(b=>b.getAttribute('aria-label')),
  waiting:[...document.querySelectorAll('.de-duel-prompt:not([role])')].map(n=>n.textContent).join(' ')||null,errors:[...document.querySelectorAll('.de-error')].map(n=>n.textContent),
  log:[...document.querySelectorAll('.de-duel-log div')].map(d=>d.textContent),ended:document.querySelector('.de-duel-end')?.getAttribute('aria-label')??null,
  instruction:document.querySelector('.de-duel-instruction')?.textContent??null,
  badges:[...document.querySelectorAll('.de-field-card .de-badge')].map(b=>{const img=b.querySelector('.de-badge-icon img');return (b.closest('.de-field-card').getAttribute('aria-label')??'').split(',')[0]+' '+b.dataset.kind+'='+b.dataset.count+(img&&img.complete&&img.naturalWidth?' drawn':' not drawn');})}})()`;
const view = (page:Page) => page.ev(VIEW) as Promise<View>;
const promptButton = (label:string) => `[...document.querySelectorAll('.de-duel-prompt[role=dialog] button')].find(b=>b.textContent===${JSON.stringify(label)}&&!b.disabled)`;
async function opt(page:Page,label:string) { await until(page,promptButton(label),20000); await press(page,promptButton(label)); }
const cardSel = (name:string,where:string) => `[...document.querySelectorAll('.de-field-card')].find(b=>{const l=b.getAttribute('aria-label')??'';return l.startsWith(${JSON.stringify(`${name}, ${where}`)})||l.startsWith(${JSON.stringify(`${name} (set face-down), ${where}`)})})`;
const inspectorButton = (prefix:string) => `[...document.querySelectorAll('.de-duel-inspector button')].find(b=>b.textContent.startsWith(${JSON.stringify(prefix)})&&!b.disabled)`;
const closeInspector = `[...document.querySelectorAll('.de-duel-inspector button')].find(b=>b.textContent==='Close')`;
const fieldCount = (page:Page,side:'your'|'opponent',zone:string) => page.ev(`Number([...document.querySelectorAll('.de-field-card[data-side=${side}][data-zone=${zone}]')].map(b=>b.querySelector('.de-card-count')?.textContent)[0]??0)`) as Promise<number>;
const monsters = (page:Page) => page.ev(`[...document.querySelectorAll('.de-field-card[data-zone=monster]')].map(b=>({label:b.getAttribute('aria-label'),side:b.dataset.side,position:b.dataset.position,back:b.classList.contains('de-card-back')}))`) as Promise<{ label:string; side:string; position:string; back:boolean }[]>;

/** Wait for `page` to hold its idle Main Phase (End Turn offered), declining chain questions on both pages meanwhile. */
async function idle(page:Page,other:Page,timeout = 40000):Promise<View> {
  for (const end = Date.now() + timeout; Date.now() < end;) {
    const v = await view(page), o = await view(other);
    // A refused or unsupported answer shows as an error or an "Unsupported gameplay" state: never expected here.
    const bad = [...v.errors,...o.errors,...[v.waiting,o.waiting].filter(w => w?.includes('Unsupported'))];
    if (bad.length) throw new Error('duel error: ' + bad.join(' | '));
    if (o.prompt?.kind === 'yes-no') { await opt(other,'No'); await sleep(400); continue; }
    if (v.prompt?.kind === 'yes-no') { await opt(page,'No'); await sleep(400); continue; }
    if (!v.prompt && v.actions.includes('End Turn')) return v;
    if (v.prompt || o.prompt) throw new Error('unexpected prompt ' + JSON.stringify({ page:v.prompt,other:o.prompt }));
    await sleep(200);
  }
  throw new Error('not idle: ' + JSON.stringify(await view(page)).slice(0,1500));
}
/** Wait for a prompt of `kind` on `page`, declining every other chain question on both pages. */
async function awaitPrompt(page:Page,other:Page,kind:string,timeout = 40000) {
  for (const end = Date.now() + timeout; Date.now() < end;) {
    const v = await view(page); if (v.prompt?.kind === kind) return v.prompt;
    if (v.prompt?.kind === 'yes-no') { await opt(page,'No'); await sleep(400); continue; }
    const o = await view(other); if (o.prompt?.kind === 'yes-no') { await opt(other,'No'); await sleep(400); continue; }
    await sleep(200);
  }
  throw new Error(`no ${kind} prompt: ` + JSON.stringify({ page:await view(page),other:await view(other) }).slice(0,2000));
}
/** Press the board target (a card or an empty zone) whose label matches, declining chain questions meanwhile. */
async function target(page:Page,other:Page,re:RegExp,timeout = 40000) {
  for (const end = Date.now() + timeout; Date.now() < end;) {
    const v = await view(page), z = v.zones.find(z => re.test(z));
    if (z) { await press(page,`[...document.querySelectorAll('.de-zone-target,.de-card-target')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(z)}&&!b.disabled)`); await sleep(500); return z; }
    if (v.prompt?.kind === 'yes-no') { await opt(page,'No'); await sleep(400); continue; }
    const o = await view(other); if (o.prompt?.kind === 'yes-no') { await opt(other,'No'); await sleep(400); continue; }
    await sleep(200);
  }
  throw new Error(`no target ${re}: ` + JSON.stringify(await view(page)).slice(0,1500));
}
/** Wait (declining chain questions on both pages, as target() does) until `page` offers a board target matching `re`. */
async function awaitTarget(page:Page,other:Page,re:RegExp,timeout = 40000):Promise<View> {
  for (const end = Date.now() + timeout; Date.now() < end;) {
    const v = await view(page); if (v.zones.some(z => re.test(z))) return v;
    if (v.prompt?.kind === 'yes-no') { await opt(page,'No'); await sleep(400); continue; }
    const o = await view(other); if (o.prompt?.kind === 'yes-no') { await opt(other,'No'); await sleep(400); continue; }
    await sleep(200);
  }
  throw new Error(`no target ${re}: ` + JSON.stringify(await view(page)).slice(0,1500));
}
/** Open a card's inspector and press one of its actions ("Summon", "Activate", "Set spell/trap"). */
async function play(page:Page,name:string,where:string,action:string) {
  await until(page,cardSel(name,where),20000); await press(page,cardSel(name,where));
  await until(page,inspectorButton(action + ':'),10000); await press(page,inspectorButton(action + ':'));
}
/** Each zone choice's instruction line, as act() met it. */
const zoneInstructions = new Set<string>();
/** From the idle Main Phase: play a card; then place it in the first free zone if a bare zone choice follows. */
async function act(page:Page,other:Page,name:string,where:string,action:string) {
  await idle(page,other); await play(page,name,where,action);
  for (let i = 0; i < 8; i++) {
    await sleep(250);
    const v = await view(page), zone = /^Select: your (spell\/trap|monster) zone/;
    if (v.zones.length && v.zones.every(z => zone.test(z))) { zoneInstructions.add(`${v.zones[0]!.includes('monster') ? 'monster' : 'spell/trap'} zone: "${v.instruction}"`); await target(page,other,zone); return; }
    if (v.prompt || v.zones.length) return;
  }
}
async function inspectActions(page:Page,name:string,where:string):Promise<string[]> {
  await press(page,cardSel(name,where)); await until(page,`document.querySelector('.de-duel-inspector')`,10000); await sleep(300);
  const actions = await page.ev(`[...document.querySelectorAll('.de-duel-inspector button')].map(b=>b.textContent).filter(t=>t!=='Close')`) as string[];
  await press(page,closeInspector);
  return actions;
}
async function inspectStats(page:Page,name:string,where:string):Promise<string> {
  await press(page,cardSel(name,where)); await until(page,`document.querySelector('.de-duel-inspector')`,10000);
  const stats = await page.ev(`document.querySelector('.de-duel-inspector').innerText.match(/ATK.*$/m)?.[0]??''`) as string;
  await press(page,closeInspector);
  return stats;
}
/** Decline chain questions on both pages until the duel ends; returns both result banners. */
async function finish(a:Page,b:Page) {
  for (let i = 0; i < 200 && !(await a.ev(`Boolean(document.querySelector('.de-duel-end'))`)); i++) {
    for (const p of [a,b]) { const v = await view(p); if (v.prompt?.kind === 'yes-no') await opt(p,'No'); else if (!v.prompt && v.actions.includes('End Turn')) await click(p,'End Turn'); }
    await sleep(400);
  }
  const result = [await a.ev(`document.querySelector('.de-duel-end')?.getAttribute('aria-label')`),await b.ev(`document.querySelector('.de-duel-end')?.getAttribute('aria-label')`)] as string[];
  for (const p of [a,b]) if (await p.ev(`Boolean(${byText('Return to Lobby')})`)) await click(p,'Return to Lobby');
  for (const p of [a,b]) await until(p,lobbyShown,60000);
  return result;
}

/** Edit Deck → the deck select (retried while the editor still loads) → back to the lobby. */
async function chooseDeck(page:Page,name:string,size:number) {
  await click(page,'Edit Deck');
  const sel = `document.querySelector('[data-key="deck-select"]')`;
  await until(page,`${sel}&&[...${sel}.options].some(o=>o.value===${JSON.stringify(name)})`,60000);
  let current:string|null = null;
  for (let i = 0; i < 10 && current !== name; i++) {
    await page.ev(`(()=>{const s=${sel};s.value=${JSON.stringify(name)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await sleep(1500);
    current = await page.ev(`fetch('/api/de/decks',{credentials:'same-origin'}).then(r=>r.json()).then(d=>d.current.world)`) as string;
  }
  expect(current).toBe(name);
  await until(page,`[...document.querySelectorAll('[data-key^="deck-card:main:"]')].length===${size}`,20000);
  await click(page,'Return to Lobby'); await until(page,lobbyShown,60000);
}
const avatar = (name:string) => `[...document.querySelectorAll('[data-key^="avatar:"]')].find(a=>a.querySelector('.de-avatar-name')?.textContent===${JSON.stringify(name)})`;
/** B challenges A; A wins rock-paper-scissors and goes first. Retries while the previous duel is still closing. */
async function startDuel(a:Page,b:Page,nameA:string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await until(b,avatar(nameA),30000); await pressAvatar(b,avatar(nameA)); await until(b,cardButton('Send Duel Request'),10000);
      await press(b,cardButton('Send Duel Request')); await click(a,'Accept Duel',15000);
      break;
    } catch (error) { if (attempt >= 12) throw error; await closeCard(b).catch(() => {}); await sleep(5000); }
  }
  await Promise.all([prepareDuel(a,'Rock'),prepareDuel(b,'Scissors')]);
  const refused = await a.ev(`document.body.innerText.includes('The server rejected this deck')`);
  expect(refused,'the stack refuses a deck under 40 cards: run it with STACK_VARS=...,DECK_CHECK:avisar').toBe(false);
}
/** Give both characters the scenario cards (the profile trunk in /__dev/state), then reload and go online again. */
async function seed(pages:[Page,string][]) {
  const origin = stack().origin, state = await (await fetch(origin + '/__dev/state')).json() as { accounts:Record<string,{ profiles:Record<string,{ name:string; trunk:Record<string,number> }> }> };
  let seeded = 0;
  for (const account of Object.values(state.accounts ?? {})) for (const profile of Object.values(account.profiles ?? {})) if (pages.some(([,name]) => name === profile.name)) {
    for (const passcode of Object.values(CARDS)) profile.trunk[String(passcode)] = Math.max(profile.trunk[String(passcode)] ?? 0,9);
    seeded++;
  }
  expect(seeded).toBe(pages.length);
  const response = await fetch(origin + '/__dev/state',{ method:'POST',headers:{ 'content-type':'application/json' },body:JSON.stringify(state) });
  expect(response.status,'POST /__dev/state needs a stack with DEV:1').toBe(200);
  for (const [page,name] of pages) {
    await page.send('Page.reload',{}); await sleep(1500); await until(page,`document.querySelector('.de-client')`,30000);
    await click(page,'Go Online',60000);
    const slot = `[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes(${JSON.stringify(name)})&&!b.disabled)`;
    await until(page,slot,60000); await press(page,slot); await until(page,lobbyShown,60000);
  }
}
const putDeck = (page:Page,name:string,main:number[]) => page.ev(`fetch('/api/de/decks',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(${JSON.stringify({ name,main,side:[],extra:[] })})}).then(r=>r.status)`) as Promise<number>;
const piles = (page:Page) => page.ev(`Object.fromEntries([...document.querySelectorAll('.de-field-card')].filter(b=>['deck','graveyard','banished'].includes(b.dataset.zone)).map(b=>[b.dataset.side+' '+b.dataset.zone,Number(b.querySelector('.de-card-count')?.textContent??0)]))`) as Promise<Record<string,number>>;
const attribute = (value:number) => `document.querySelector('[data-key^="prompt-attribute:"][data-key$=":answer:${value}"]')`;
const candidate = (index:number) => `document.querySelector('[data-key^="prompt-candidate:"][data-key$=":${index}"]')`;
const confirmSel = `document.querySelector('.de-duel-prompt[role=dialog] [data-key^="prompt-confirm:"]')`;
const pressed = (page:Page) => page.ev(`[...document.querySelectorAll('.de-duel-prompt[role=dialog] [data-key^="prompt-candidate:"]')].filter(x=>x.getAttribute('aria-pressed')==='true').map(x=>x.querySelector('span')?.textContent)`) as Promise<string[]>;
const confirmDisabled = (page:Page) => page.ev(`${confirmSel}.disabled`) as Promise<boolean>;
const promptId = (page:Page) => page.ev(`document.querySelector('.de-duel-prompt[role=dialog]')?.dataset.prompt??null`) as Promise<string|null>;
const first = (text:string) => text.split('\n')[0]!;

describe.skipIf(!scenario)('scenario duels: declarations, selections and visibility cases',() => {
  it('plays three scripted PvP duels whose prompts and board changes both screens agree on',async () => {
    try {
      const names = { a:`Sca ${RUN}`, b:`Scb ${RUN}` };
      const a = await openPage(), b = await openPage();
      await openClient(a,await signIn(`TestSa${RUN}`)); await openClient(b,await signIn(`TestSb${RUN}`));
      await enterWorld(a,names.a); await enterWorld(b,names.b);
      await seed([[a,names.a],[b,names.b]]);
      for (const [who,page] of [['a',a],['b',b]] as const) for (const [name,main] of Object.entries(DECKS[who])) expect(await putDeck(page,name,main)).toBe(200);
      const seen = { visibility:[] as string[], prompts:[] as string[], selection:[] as string[] };

      // ---- Duel 1: counters, tokens, card declaration, a hidden target, control change, tribute cancel, Book of Moon.
      await chooseDeck(a,'Scenario 1',6); await chooseDeck(b,'Scenario 1',6);
      await startDuel(a,b,names.a);
      await act(a,b,'Breaker the Magical Warrior','your hand','Summon');
      await idle(a,b);
      const counterA = (await view(a)).cards.find(c => c.startsWith('Breaker the Magical Warrior, your monster'));
      const counterB = (await view(b)).cards.find(c => c.startsWith('Breaker the Magical Warrior, opponent monster'));
      expect(counterA).toContain('Spell counters: 1'); expect(counterB).toContain('Spell counters: 1');
      // The counter is the original's coin badge (magic_counter.png row 1) with its digit, on both screens.
      const drawn = (v:View) => v.badges.some(x => x.endsWith(' drawn') && !x.endsWith('not drawn'));
      for (let i = 0; i < 100 && !(drawn(await view(a)) && drawn(await view(b))); i++) await sleep(200);
      const badges = { a:(await view(a)).badges, b:(await view(b)).badges };
      expect(badges).toEqual({ a:['Breaker the Magical Warrior 0=1 drawn'],b:['Breaker the Magical Warrior 0=1 drawn'] });
      await screenshot(a,'scenario-1-a-counter');
      const breakerStats = await inspectStats(a,'Breaker the Magical Warrior','your monster');
      expect(breakerStats).toContain('ATK 1900');
      seen.visibility.push(`Breaker the Magical Warrior summoned: "Spell counters: 1" on both screens, drawn as the original's counter badge (${badges.a[0]} / ${badges.b[0]}), ${breakerStats} (1600 + 300 per counter)`);
      await act(a,b,'Scapegoat','your hand','Set spell/trap');
      await act(a,b,'Mystical Space Typhoon','your hand','Set spell/trap');
      await act(a,b,'Prohibition','your hand','Activate');
      const announce = await awaitPrompt(a,b,'announce');
      expect(first(announce.text)).toBe('Declare 1 card name.');
      // The original's candidate list: every declarable card, narrowed while typing; the pick declares it.
      const declare = `[...document.querySelectorAll('[data-key^="prompt-declare:"]')]`;
      const listed = await a.ev(`({shown:${declare}.length,count:document.querySelector('.de-announce-count')?.textContent})`) as { shown:number; count:string };
      expect(listed.shown).toBeGreaterThan(10); expect(listed.count).toMatch(/^\d{4} cards: showing the first \d+/);
      await press(a,`document.querySelector('[data-key^="prompt-announcement:"]')`); await a.send('Input.insertText',{ text:'snatch st' });
      await until(a,`${declare}.length===1`,10000);
      const narrowed = await a.ev(`${declare}.map(b=>b.textContent)`) as string[];
      expect(narrowed).toEqual(['Snatch Steal']);
      await screenshot(a,'scenario-1-a-declare');
      await press(a,`${declare}[0]`);
      await idle(a,b);
      await screenshot(a,'scenario-1-a-turn1'); await click(a,'End Turn');
      // B's Draw Phase: A activates the set Scapegoat and places the tokens.
      const ask = await awaitPrompt(a,b,'yes-no');
      await opt(a,'Yes'); await play(a,'Scapegoat','your spell','Activate');
      for (let placed = 0; placed < 3;) { const z = await target(a,b,/^Select: your monster zone/).catch(() => null); if (!z) break; placed++; }
      await idle(b,a);
      const tokens = { a:(await view(a)).cards.filter(c => c === 'Sheep Token, your monster, defense').length, b:(await view(b)).cards.filter(c => c === 'Sheep Token, opponent monster, defense').length };
      expect(tokens).toEqual({ a:4,b:4 });
      seen.visibility.push(`Scapegoat activated in B's Draw Phase: 4 Sheep Tokens in defense on A's side of both screens`);
      seen.prompts.push(`yes/no: "${first(ask.text)}" answered Yes on A's screen, after which the server let A activate the set Scapegoat (No was answered to every other chain question, each followed by the next step)`);
      // Prohibition: B's Snatch Steal (declared by typing its name) can be neither activated nor set; Change of Heart can.
      const snatch = await inspectActions(b,'Snatch Steal','your hand'), heart = await inspectActions(b,'Change of Heart','your hand');
      expect(snatch).toEqual([]); expect(heart.some(t => t.startsWith('Activate:'))).toBe(true);
      seen.prompts.push(`announce-card: Prohibition asked "${first(announce.text)}" with the original's candidate list (${listed.count}); typing "snatch st" left ${JSON.stringify(narrowed)}, A picked it and the server accepted it: B's Snatch Steal then offered no action (Change of Heart offered ${heart.join(', ')})`);
      // MST on A's set card: the face-down target is offered without its name.
      await act(b,a,'Mystical Space Typhoon','your hand','Activate');
      for (let i = 0; i < 100 && !(await view(b)).zones.some(z => z.startsWith('Face-down card')); i++) await sleep(200);
      const mstTargets = (await view(b)).zones, mstInstruction = (await view(b)).instruction;
      expect(mstInstruction).toBe('Select a target card from the Field.');
      expect(mstTargets).toContain('Face-down card, opponent spell, Select: opponent’s spell/trap zone 2');
      expect(mstTargets.some(z => z.startsWith('Prohibition, opponent spell'))).toBe(true);
      await target(b,a,/^Face-down card, opponent spell/);
      await idle(b,a);
      expect(await fieldCount(a,'your','graveyard')).toBe(2); expect(await fieldCount(b,'opponent','graveyard')).toBe(2);
      seen.selection.push(`Mystical Space Typhoon target choice on B's screen, instruction "${mstInstruction}": ${mstTargets.map(z => `"${z}"`).join(', ')} (the set card unnamed); the set card went to A's Graveyard (2 cards on both screens)`);
      // Change of Heart: Breaker moves to B, counter and all, on both screens.
      await act(b,a,'Change of Heart','your hand','Activate');
      const heartInstruction = (await awaitTarget(b,a,/^Breaker the Magical Warrior, opponent monster/)).instruction;
      expect(heartInstruction).toBe('Select a target card from the Field.');
      await target(b,a,/^Breaker the Magical Warrior, opponent monster/);
      const heartZone = (await awaitTarget(b,a,/^Select: your monster zone/)).instruction;
      expect(heartZone).toBe('Select a Monster Card Zone.');
      await screenshot(b,'scenario-1-b-zone-instruction');
      await target(b,a,/^Select: your monster zone/);
      seen.selection.push(`Change of Heart: target instruction "${heartInstruction}", then the zone instruction "${heartZone}"`);
      await idle(b,a);
      const control = { a:(await view(a)).cards.filter(c => c.startsWith('Breaker')), b:(await view(b)).cards.filter(c => c.startsWith('Breaker')) };
      expect(control.a).toEqual(['Breaker the Magical Warrior, opponent monster, attack, Spell counters: 1']);
      expect(control.b).toEqual(['Breaker the Magical Warrior, your monster, attack, Spell counters: 1']);
      seen.visibility.push(`Change of Heart: A's screen "${control.a[0]}", B's screen "${control.b[0]}"`);
      // Tribute Summon: cancel the tribute choice first (back to the Main Phase, Skull still in hand), then tribute Breaker.
      await act(b,a,'Summoned Skull','your hand','Summon');
      for (let i = 0; i < 100 && !(await view(b)).actions.includes('Cancel'); i++) await sleep(200);
      const tributeTargets = (await view(b)).zones, tributeInstruction = (await view(b)).instruction;
      expect(tributeInstruction).toBe('Please select a monster as Tribute.');
      expect(tributeTargets).toEqual(['Breaker the Magical Warrior, your monster, attack, Spell counters: 1, Select: Breaker the Magical Warrior']);
      await click(b,'Cancel');
      const cancelled = await idle(b,a);
      expect(cancelled.cards).toContain('Summoned Skull, your hand, attack');
      expect(cancelled.cards.some(c => c.startsWith('Breaker the Magical Warrior, your monster'))).toBe(true);
      seen.selection.push(`tribute choice for Summoned Skull (one candidate, Breaker; instruction "${tributeInstruction}") cancelled with Cancel: the server returned B to the Main Phase with Skull still in hand and Breaker on the field`);
      await act(b,a,'Summoned Skull','your hand','Summon');
      await target(b,a,/^Breaker the Magical Warrior, your monster/);
      await target(b,a,/^Select: your monster zone/);
      await idle(b,a);
      expect((await view(b)).cards).toContain('Summoned Skull, your monster, attack');
      expect(await fieldCount(a,'your','graveyard')).toBe(3);
      seen.selection.push("then Breaker chosen as the Tribute: Summoned Skull summoned, Breaker in its owner A's Graveyard (3 cards on both screens)");
      // Book of Moon on Skull: face-down defense on both screens, named only to its owner.
      await act(b,a,'Book of Moon','your hand','Activate');
      await target(b,a,/^Summoned Skull, your monster/);
      await idle(b,a);
      const moonA = (await monsters(a)).find(m => m.side === 'opponent')!, moonB = (await monsters(b)).find(m => m.side === 'your')!;
      expect(moonA).toEqual({ label:'Face-down card, opponent monster',side:'opponent',position:'defense',back:true });
      expect(moonB).toEqual({ label:'Summoned Skull (set face-down), your monster, defense',side:'your',position:'defense',back:true });
      seen.visibility.push(`Book of Moon: A sees "${moonA.label}" (card back, defense), B sees "${moonB.label}"`);
      await screenshot(b,'scenario-1-b-turn2');
      await click(b,'End Turn');
      const result1 = await finish(a,b);
      expect(result1).toEqual(['Defeat','Victory']);

      // ---- Duel 2: number, two- and one-attribute declarations, type declaration, Graveyard list, position, ritual.
      await chooseDeck(a,'Scenario 2',9); await chooseDeck(b,'Scenario 2',6);
      await startDuel(a,b,names.a);
      await act(a,b,'Card Trooper','your hand','Summon');
      await act(a,b,'Card Trooper','your monster','Activate');
      const number = await awaitPrompt(a,b,'number');
      expect(number.buttons.filter(x => x.startsWith('prompt-option:')).map(x => x.split('|')[1])).toEqual(['1','2','3']);
      expect(number.buttons.some(x => x.startsWith('prompt-number:'))).toBe(false);
      const deckBefore = await piles(a);
      await opt(a,'2');
      await idle(a,b);
      const pilesAfter = { a:await piles(a), b:await piles(b) };
      expect(pilesAfter.a['your deck']).toBe(deckBefore['your deck']! - 2); expect(pilesAfter.a['your graveyard']).toBe(2); expect(pilesAfter.b['opponent graveyard']).toBe(2);
      const trooper = await inspectStats(a,'Card Trooper','your monster');
      expect(trooper).toContain('ATK 1400');
      seen.prompts.push(`number: "${first(number.text)}" offered 1/2/3; answering 2 sent 2 cards from deck to Graveyard (deck ${deckBefore['your deck']}→${pilesAfter.a['your deck']}, Graveyard 2 on both screens) and Card Trooper showed ${trooper}`);
      await act(a,b,'Earthshaker','your hand','Set spell/trap');
      await idle(a,b); await click(a,'End Turn');
      await act(b,a,'Tribe-Infecting Virus','your hand','Summon');
      await awaitPrompt(a,b,'yes-no'); await opt(a,'Yes'); await play(a,'Earthshaker','your spell','Activate');
      const two = await awaitPrompt(a,b,'attributes');
      const bounds = [await confirmDisabled(a)];
      await press(a,attribute(32)); await sleep(300); bounds.push(await confirmDisabled(a));
      await press(a,attribute(8)); await sleep(300); bounds.push(await confirmDisabled(a));
      expect(bounds).toEqual([true,true,false]);
      await press(a,confirmSel);
      const one = await awaitPrompt(b,a,'attributes');
      expect(one.buttons.filter(x => x.startsWith('prompt-attribute:')).map(x => x.split('|')[0]!.split(':').pop())).toEqual(['8','32']);
      await press(b,attribute(8)); await press(b,confirmSel);
      await idle(b,a);
      const shaken = { a:await monsters(a), b:await monsters(b) };
      expect(shaken.a.map(m => m.label)).toEqual(['Card Trooper, your monster, attack']); expect(shaken.b.map(m => m.label)).toEqual(['Card Trooper, opponent monster, attack']);
      seen.prompts.push(`attribute ×2: Earthshaker's "${first(two.text)}" listed WATER and EARTH with "Choose 2 attributes."; B's answer offered only those two, and B's WATER destroyed its own Tribe-Infecting Virus while Card Trooper (EARTH) stayed on both screens`);
      seen.selection.push('attribute bounds: Confirm Attributes stayed disabled with 0 and 1 of the 2 required attributes and enabled at 2');
      // Abyssal Designator: B declares EARTH and Machine; A must send an EARTH Machine (only its Card Troopers qualify).
      const lp = (await view(b)).players[0];
      await act(b,a,'Abyssal Designator','your hand','Activate');
      const adAttr = await awaitPrompt(b,a,'attributes');
      expect(adAttr.buttons.filter(x => x.startsWith('prompt-attribute:')).length).toBe(6);
      await press(b,attribute(32)); await press(b,confirmSel);
      const adRace = await awaitPrompt(b,a,'choice');
      expect(adRace.buttons.filter(x => x.startsWith('prompt-option:')).length).toBe(20);
      await opt(b,'Machine');
      // Abyssal Designator sends from the hand or the Deck: with a Card Trooper still in A's Deck (the shuffle decides) the
      // server opens a card list of the qualifying cards instead of the hand targets.
      for (let i = 0; i < 100 && !(await view(a)).zones.length && (await view(a)).prompt?.kind !== 'cards'; i++) { const o = await view(b); if (o.prompt?.kind === 'yes-no') await opt(b,'No'); await sleep(200); }
      const aView = await view(a), hidden = (await view(b)).cards.filter(c => c.includes('opponent hand'));
      const fromList = aView.prompt?.kind === 'cards', send = fromList ? aView.prompt!.buttons.filter(x => x.startsWith('prompt-candidate:')).map(x => x.split('|')[1]!) : aView.zones;
      expect(send.length).toBeGreaterThan(0);
      expect(send.every(z => fromList ? z.startsWith('Card Trooper') : z.startsWith('Card Trooper, your hand'))).toBe(true);
      expect(hidden.every(c => c === 'Face-down card, opponent hand')).toBe(true);
      const graveBefore = await fieldCount(a,'your','graveyard');
      if (fromList) { await press(a,candidate(0)); await sleep(300); await press(a,confirmSel); }
      else await target(a,b,/^Card Trooper, your hand/);
      await idle(b,a);
      expect(await fieldCount(a,'your','graveyard')).toBe(graveBefore + 1); expect(await fieldCount(b,'opponent','graveyard')).toBe(graveBefore + 1);
      const lpAfter = (await view(b)).players[0];
      // Abyssal Designator's cost is an LP payment: logged as the original Duel Log words it, on both screens.
      const paid = { a:(await view(a)).log.filter(l => l.startsWith(`${names.b} paid`)), b:(await view(b)).log.filter(l => l.startsWith(`${names.b} paid`)) };
      expect(paid.a).toEqual(paid.b); expect(paid.a).toHaveLength(1); expect(paid.a[0]).toMatch(/^.* paid 1000 LP \(LP (\d+) -> (\d+)\)$/);
      const [, before, after] = /\(LP (\d+) -> (\d+)\)/.exec(paid.a[0]!)!; expect(Number(before) - Number(after)).toBe(1000);
      expect((await view(b)).log.some(l => l.startsWith(`${names.b} took 1000 damage`))).toBe(false);
      seen.prompts.push(`LP payment: Abyssal Designator's 1000 LP cost logged "${paid.a[0]}" on both screens (no damage line)`);
      seen.prompts.push(`attribute + type: Abyssal Designator (${lp} → ${lpAfter}) offered all 6 attributes, then "${first(adRace.text)}" with 20 types; EARTH + Machine made A choose among ${send.length} Card Trooper(s) ${fromList ? 'in a list of its hand and Deck' : 'in hand'} only (not Celtic Guardian, EARTH Warrior): A's Graveyard ${graveBefore}→${graveBefore + 1} on both screens`);
      seen.selection.push(`A's forced choice from its own ${fromList ? 'hand and Deck (a list)' : 'hand'}: its candidates were named on A's screen while B's screen showed A's hand as ${hidden.length} card backs`);
      // Monster Reborn: a Graveyard list with max 1, a refused cancel, then the summon position.
      await act(b,a,'Monster Reborn','your hand','Activate');
      const list = await awaitPrompt(b,a,'cards');
      expect(first(list.text)).toBe('Choose cards');
      const listBounds = [{ pressed:await pressed(b),disabled:await confirmDisabled(b) }];
      const listId = await promptId(b);
      await press(b,promptButton('Finish / cancel')); await sleep(1500);
      const reopened = { id:await promptId(b),kind:(await view(b)).prompt?.kind };
      expect(reopened.kind).toBe('cards'); expect(reopened.id).not.toBe(listId);
      await press(b,candidate(0)); await sleep(300); listBounds.push({ pressed:await pressed(b),disabled:await confirmDisabled(b) });
      await press(b,candidate(1)); await sleep(300); listBounds.push({ pressed:await pressed(b),disabled:await confirmDisabled(b) });
      expect(listBounds).toEqual([{ pressed:[],disabled:true },{ pressed:['Tribe-Infecting Virus'],disabled:false },{ pressed:['Tribe-Infecting Virus'],disabled:false }]);
      await press(b,confirmSel);
      await target(b,a,/^Select: your monster zone/);
      const position = await awaitPrompt(b,a,'position');
      expect(position.buttons.some(x => x.startsWith('prompt-reference:'))).toBe(false);
      await opt(b,'Defense position');
      await idle(b,a);
      const reborn = { a:(await monsters(a)).find(m => m.label.startsWith('Tribe-Infecting Virus')), b:(await monsters(b)).find(m => m.label.startsWith('Tribe-Infecting Virus')) };
      expect(reborn.a).toMatchObject({ side:'opponent',position:'defense',back:false }); expect(reborn.b).toMatchObject({ side:'your',position:'defense',back:false });
      seen.selection.push(`Monster Reborn's Graveyard list (${list.buttons.filter(x => x.startsWith('prompt-candidate:')).length} cards, "Choose 1–1"): Confirm disabled with none selected; "Finish / cancel" was refused (the server re-opened the list); a second pick did not add to the one selected`);
      seen.prompts.push(`position: "${first(position.text)}" (Attack/Defense, no stale card pictures); Defense brought Tribe-Infecting Virus back in defense on both screens`);
      // Ritual: Black Luster Soldier from the hand, materials Tribe-Infecting Virus (field) + Celtic Guardian (hand).
      await act(b,a,'Black Luster Ritual','your hand','Activate');
      const ritualMonster = await awaitPrompt(b,a,'place');
      await opt(b,'Select: Black Luster Soldier');
      for (let i = 0; i < 100 && !(await view(b)).prompt?.text.includes('stars remaining'); i++) await sleep(200);
      const materials = await awaitPrompt(b,a,'place');
      expect(first(materials.text)).toContain('(8 stars remaining)');
      await opt(b,'Select: Tribe-Infecting Virus');
      for (let i = 0; i < 50 && !(await view(b)).prompt?.text.includes('(4 stars remaining)'); i++) await sleep(200);
      const half = await view(b);
      expect(first(half.prompt!.text)).toContain('(4 stars remaining)');
      const handDuringRitual = (await view(a)).cards.filter(c => c.includes('opponent hand'));
      await opt(b,'Select: Celtic Guardian');
      await target(b,a,/^Select: your monster zone/);
      for (let i = 0; i < 20; i++) { const v = await view(b); if (v.prompt?.kind === 'position') { await opt(b,'Attack position'); break; } if (v.actions.includes('End Turn')) break; await sleep(300); }
      await idle(b,a);
      expect((await view(a)).cards).toContain('Black Luster Soldier, opponent monster, attack'); expect((await view(b)).cards).toContain('Black Luster Soldier, your monster, attack');
      seen.selection.push(`ritual: "${first(ritualMonster.text)}" then "${first(materials.text)}"; after Tribe-Infecting Virus it read "${first(half.prompt!.text)}"; Celtic Guardian completed it and Black Luster Soldier appeared on both screens; B's hand stayed ${handDuringRitual.length} card backs on A's screen meanwhile`);
      await screenshot(b,'scenario-2-b-ritual');
      await click(b,'End Turn');
      const result2 = await finish(a,b);
      expect(result2.sort()).toEqual(['Defeat','Victory']);

      // ---- Duel 3: hand-limit discard, effect option, a list from the Deck, a deck shuffle.
      await chooseDeck(a,'Scenario 3',8); await chooseDeck(b,'Scenario 3',9);
      await startDuel(a,b,names.a);
      await act(a,b,'Pot of Greed','your hand','Activate');
      await idle(a,b);
      expect((await view(a)).cards.filter(c => c.includes('your hand')).length).toBe(7);
      await click(a,'End Turn');
      const discard = await awaitPrompt(a,b,'place');
      expect(first(discard.text)).toBe('Choose 1 card to discard.');
      expect(discard.buttons.some(x => x.includes('Finish / cancel'))).toBe(false);
      await opt(a,'Select: Pot of Greed');
      await idle(b,a);
      expect((await view(a)).cards.filter(c => c.includes('your hand')).length).toBe(6);
      expect(await fieldCount(b,'opponent','graveyard')).toBe(2);
      seen.selection.push(`hand-limit discard: "${first(discard.text)}" with 7 hand cards and no cancel offered (it is forced); one Pot of Greed discarded: hand 6, Graveyard 2 on both screens`);
      await act(b,a,'Poison of the Old Man','your hand','Activate');
      const option = await awaitPrompt(b,a,'choice');
      const labels = option.buttons.filter(x => x.startsWith('prompt-option:')).map(x => x.split('|')[1]);
      expect(labels).toEqual(['Recover your Life Points.','Inflict 800 damage to your opponent.']);
      expect(option.buttons.some(x => x.startsWith('prompt-reference:'))).toBe(false);
      await opt(b,'Inflict 800 damage to your opponent.');
      await idle(b,a);
      expect((await view(a)).players[0]).toContain('7200 life points'); expect((await view(b)).players[1]).toContain('7200 life points');
      seen.prompts.push(`option: Poison of the Old Man asked "${first(option.text)}" with ${labels.map(l => `"${l}"`).join(' / ')}; the second option inflicted 800: A at 7200 LP on both screens`);
      await act(b,a,'Gold Sarcophagus','your hand','Activate');
      const deckList = await awaitPrompt(b,a,'cards');
      const deckCards = deckList.buttons.filter(x => x.startsWith('prompt-candidate:')).map(x => x.split('|')[1]);
      const aDuring = await view(a);
      expect(aDuring.prompt).toBe(null); expect(aDuring.cards.filter(c => c.startsWith('Face-down card, opponent deck')).length).toBe(1);
      expect(await confirmDisabled(b)).toBe(true);
      // Three of B's nine cards are left in the Deck; usually a Poison of the Old Man, but the shuffle can leave none.
      const pick = ['Poison of the Old Man','Gold Sarcophagus','Celtic Guardian'].find(n => deckCards.some(c => c!.startsWith(n)))!;
      const chosen = deckCards.findIndex(c => c!.startsWith(pick)), other = deckCards.findIndex(c => !c!.startsWith(pick));
      expect(chosen).toBeGreaterThanOrEqual(0);
      await press(b,candidate(chosen)); if (other >= 0) await press(b,candidate(other)); await sleep(300);
      expect(await pressed(b)).toEqual([pick]);
      await press(b,confirmSel);
      await idle(b,a,60000);
      const banished = { a:(await view(a)).cards.filter(c => c.includes('banished')), b:(await view(b)).cards.filter(c => c.includes('banished')) };
      expect(banished.a).toEqual([`${pick}, opponent banished, attack ×1`]); expect(banished.b).toEqual([`${pick}, your banished, attack ×1`]);
      const shuffled = [(await view(a)).log.includes(`${names.b} shuffles their deck.`),(await view(b)).log.includes(`${names.b} shuffles their deck.`)];
      expect(shuffled).toEqual([true,true]);
      seen.selection.push(`Gold Sarcophagus list of B's ${deckCards.length} Deck cards shown to B only (A had no prompt and one card back for B's Deck); Confirm disabled with none, a second pick refused at max 1`);
      seen.visibility.push(`Gold Sarcophagus: "${names.b} shuffles their deck." logged on both screens; the chosen ${pick} face-up in B's banished pile on both screens; B's Deck then counted ${await fieldCount(a,'opponent','deck')} on A's screen, still a card back`);
      await click(b,'End Turn');
      const result3 = await finish(a,b);
      expect(result3).toEqual(['Defeat','Victory']);

      const results = `results ${result1.join('/')}, ${result2.join('/')}, ${result3.join('/')}`;
      record('duel.visibility',{ actions:`PvP ${names.a} vs ${names.b}, three scripted duels with 6-9 card decks (known hands): Breaker, Scapegoat, Change of Heart, Mystical Space Typhoon, Book of Moon, Gold Sarcophagus`, expected:'Reveal/hide cards, tokens, control changes, shuffles and positions match server state.', observed:`${seen.visibility.join('; ')}; ${results}` });
      record('duel.prompts',{ actions:'Prohibition (card name typed), Card Trooper (number), Earthshaker (2 then 1 attributes), Abyssal Designator (attribute + type), Monster Reborn (position), Poison of the Old Man (option), chain questions answered Yes/No', expected:'Yes/no, options, position, race, attribute, number and announce-card map to correct bytes.', observed:`${seen.prompts.join('; ')}; every answer was accepted (the duel moved on with the declared outcome), no error or unsupported state` });
      expect([...zoneInstructions].every(z => /zone: "Select a (Monster|Spell & Trap) Card Zone\."$/.test(z))).toBe(true);
      seen.selection.push(`zone choices said ${[...zoneInstructions].join(', ')}`);
      record('duel.selection',{ actions:'Tribute, targets, ritual monster and materials, a hand-limit discard, Graveyard and Deck lists, cancels on a tribute, a forced list and a forced discard', expected:'Card, field, ritual and discard selection respect bounds, cancellation and hidden identities.', observed:seen.selection.join('; ') });
    } finally { closeAll(); }
  },1200000);
});
