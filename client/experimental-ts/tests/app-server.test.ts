import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientApp } from '../src/app';
import type { AppOptions } from '../src/app';
import { decodePosition } from '../src/gameplay/world';
import {RecipeCatalog} from '../src/recipes';
import * as PP from '../../../server/src/game/persist';
import { GameApi, HttpClient, type DeckList } from '../src/services';
import type { ClientCommand, DuelResponse } from '../src/ui/contracts';
import { createNodeDuelCore } from '../../../server/src/duel/engine/node';
import { NPC_DECKS, setDuelCore } from '../../../server/src/duel/data';
import { starterInfo, starterClaim } from '../../../server/src/game/starter';
import { setup, drive, sessionFactory } from './network-server-fixture';
const apps: ClientApp[] = [];
afterEach(() => { apps.splice(0).forEach(app => app.dispose()); setDuelCore(null); vi.clearAllTimers(); vi.useRealTimers(); });
function harness(server = setup().server, user = 'app-test', deckId = '51', options:Partial<AppOptions> = {}) {
  const transport = sessionFactory(server, user);
  let decks: DeckList = { decks: [{ name: 'Fixture', ...structuredClone(NPC_DECKS[deckId]), side: [], updated: 1 }], current: { world: 'Fixture', free: null }, deleted: [] };
  const requests: { path: string; method: string; body: any }[] = [];
  // Auth and account deck storage are fixtures; gameplay routes call actual server functions.
  const fetcher: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname, method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ path, method, body });
    if (path === '/api/de/session') return Response.json({ signedIn: true, userId: user, name: user, roles: [], discord: false, password: true });
    if (path === '/api/de/decks' && method === 'GET') return Response.json(decks);
    if (path === '/api/de/decks' && method === 'PUT') {
      decks = { ...decks, decks: [{ name: body.name, main: body.main, side: body.side, extra: body.extra, updated: 2 }], current: { ...decks.current, world: body.name } };
      return Response.json({ updated: 2 });
    }
    if (path === '/api/de/starter') return Response.json(starterInfo(server.game, user));
    if (path === '/api/de/starter/claim') { const [status, out] = starterClaim(server.game, user, body.id); return Response.json(out, { status }); }
    if (path === '/api/de/friends') { const [status, out] = server.game.lp.friendsInfo(user); return Response.json(out, { status }); }
    throw new Error(`Unimplemented test HTTP boundary: ${method} ${path}`);
  };
  const app = new ClientApp({ gatewayUrl: 'ws://localhost/net', api: new GameApi(new HttpClient({ origin: 'http://localhost', fetch: fetcher })), sessionFactory: transport.factory,...options });
  apps.push(app);
  const send = (command: ClientCommand) => drive(app.dispatch(command));
  const enter = async (name = 'App Duelist') => { await drive(app.initialize()); await send({ type: 'connect' }); await send({ type: 'createCharacter', slot: 0, name }); await send({ type: 'selectCharacter', slot: 0 }); };
  return { app, server, requests, sockets: transport.sockets, send, enter };
}
function promptCommand(app: ClientApp): ClientCommand {
  const duel = app.getState().duel!;
  const endTurn = duel.actions?.find(a => a.id === 'phase:5');
  if (endTurn && !duel.prompt) return { type: 'duelAction', actionId: endTurn.id };
  const p = duel.prompt;
  if (!p) throw new Error('No actionable projected prompt');
  let response: DuelResponse;
  if (p.kind === 'yes-no') response = { optionId: p.options.find(o => o.id === 'answer:0')!.id };
  else if (p.kind === 'cards') response = { cardIds: p.candidates!.slice(0, Math.max(1, p.min ?? 0)).map(c => c.id) };
  else if (p.kind === 'attributes') response = { optionIds: p.options.slice(0, p.min).map(o => o.id) };
  else if (p.options.length) response = { optionId: p.options[0].id };
  else if (p.cancelable) response = { cancel: true };
  else throw new Error(`No deterministic UI response for ${p.kind}`);
  return { type: 'duelRespond', promptId: p.id, response };
}
async function beginNpc(f: ReturnType<typeof harness>) {
  await f.send({ type: 'interact', playerId: -51 });
  for(let i=0;i<10 && f.app.getState().npc?.stage==='opening';i++){await vi.advanceTimersByTimeAsync(20);await f.send({type:'npcAdvance'});}
  expect(f.app.getState().npc?.stage).toBe('ask');await f.send({type:'npcAnswer',accept:true});
  for (let round = 0; round < 20; round++) {
    await f.send({ type: 'chooseHand', hand: (round % 3) as 0 | 1 | 2 });
    if (f.app.getState().preparation?.phase !== 'rock-paper-scissors') break;
  }
  if (f.app.getState().preparation?.phase === 'choose-first') await f.send({ type: 'chooseFirst', first: true });
  await vi.advanceTimersByTimeAsync(100); await f.send({ type: 'beginDuel' });
}
describe('ClientApp with actual server and GameSession', () => {
  it('announces a source arrival before trying to walk from an uninitialized server position', async () => {
    const map = {id:0,name:'Map_d01_01',width:100,height:100,grid:{width:5,height:5,rows:['00000','01110','01110','01110','00000']},entries:[{from:8,x:50,y:50,direction:2}],exits:[],npcSpots:[]};
    const f = harness(undefined,'arrival-app','51',{worldMaps:{version:1,maps:Array.from({length:10},(_,id)=>({...map,id}))},random:()=>0.5}); await f.enter();
    const self = f.app.getState().lobby!.avatars.find(a=>a.self)!;
    expect(self).toMatchObject({x:50,y:50,direction:2});
    const account = f.server.game.store.accountOfUser('arrival-app')!;
    expect(decodePosition(f.server.game.hub.sessions.get(account)!.pos!)).toMatchObject({x:50,y:50,direction:2});
  });
  it('installs recovered maps without replacing the connected session',async()=>{
    const map={id:0,name:'Map_d01_01',width:100,height:100,grid:{width:5,height:5,rows:['00000','01110','01110','01110','00000']},entries:[{from:8,x:50,y:50,direction:0}],exits:[],npcSpots:[]};
    const reload=vi.fn(async()=>({worldMaps:{version:1 as const,maps:Array.from({length:10},(_,id)=>({...map,id}))},issues:[]}));
    const f=harness(undefined,'data-recovery-app','51',{dataIssues:['Maps'],reloadData:reload,random:()=>0.5});await f.enter();const sockets=f.sockets.length;
    expect(f.app.getState().dataStatus?.issues).toEqual(['Maps']);await f.send({type:'reloadData'});
    expect(f.app.getState().dataStatus).toEqual({loading:false,issues:[]});expect(f.sockets).toHaveLength(sockets);expect(f.app.getState().lobby?.width).toBe(100);expect(f.app.getState().lobby?.avatars.find(a=>a.self)?.x).toBe(50);
  });
  it('enters Free Duel without requesting world progression and saves the free active-deck pointer', async () => {
    const f = harness(undefined,'free-app','51',{freeMode:true}); await f.enter();
    expect(f.app.getState()).toMatchObject({mode:'free',scene:'lobby',starter:undefined});
    expect(f.app.getState().lobby!.npcs).toEqual([]); expect(f.requests.some(r=>r.path==='/api/de/starter')).toBe(false);
    await expect(f.app.dispatch({type:'openScene',scene:'shop'})).rejects.toThrow(/World mode/);
    await f.send({type:'openScene',scene:'deck'}); await f.send({type:'saveDeck'});
    expect(f.requests.find(r=>r.method==='PUT')?.body).toMatchObject({mode:'free'});
    await expect(f.app.dispatch({type:'connect',freeMode:false})).rejects.toThrow(/Disconnect/);
  });
  it('exposes only authoritative owned recipes and applies their original order as an unsaved draft',async()=>{
    const recipe={id:'9001',name:'Owned Recipe',main:[89631139,46986414,89631139],side:[],extra:[]};
    const recipes=RecipeCatalog.fromJSON({version:1,deckSource:'original-ydc',recipes:[{...recipe,recipeBit:769}]});
    const f=harness(undefined,'recipe-app','51',{recipes});await f.enter();expect(f.app.getState().deckEditor?.recipes).toEqual([]);
    const account=f.server.game.store.accountOfUser('recipe-app')!,session=f.server.game.hub.sessions.get(account)!;
    f.server.game.withCtx(session,()=>{const state=f.server.game.loadState();PP.pbinSet(PP.profile(state,0,false)!,769);f.server.game.saveState(state);});
    await f.send({type:'openScene',scene:'deck'});expect(f.app.getState().deckEditor?.recipes).toEqual([recipe]);
    await f.send({type:'replaceDeck',deck:recipe,source:'recipe'});
    expect(f.app.getState().deckEditor?.current).toEqual({name:recipe.name,main:recipe.main,side:[],extra:[]});expect(f.app.getState().deckEditor?.dirty).toBe(true);
    expect(f.app.services.decks.state.data?.current.world).toBe('Fixture');expect(f.requests.some(r=>r.method==='PUT')).toBe(false);
  });
  it('projects character, lobby, collection, deck persistence and actual friends response', async () => {
    const f = harness(); await f.enter();
    expect(f.app.getState()).toMatchObject({ scene: 'lobby', connection: 'online', player: { name: 'App Duelist' } });
    expect(f.app.getState().lobby?.npcs?.length).toBeGreaterThan(20);
    await f.send({ type: 'openScene', scene: 'deck' }); expect(f.app.getState().deckEditor?.collection.length).toBeGreaterThan(3000);
    await f.send({ type: 'renameDeck', name: 'Saved by App' }); await f.send({ type: 'saveDeck' });
    expect(f.requests.find(r => r.method === 'PUT')?.body).toMatchObject({ name: 'Saved by App', main: NPC_DECKS['51'].main, current: true, mode: 'world' });
    expect(f.app.getState().deckEditor?.dirty).toBe(false);
    await f.send({ type: 'openScene', scene: 'social' }); expect(f.app.getState().social?.friends).toEqual([]);
    expect(f.server.game.hub.sessions.size).toBe(1);
  });
  it('automatically attaches both real PvP offers and completes preparation', async () => {
    setDuelCore(await createNodeDuelCore());
    const server = setup(undefined, 'unused', { PVP_TEST: '1' }).server;
    const a = harness(server, 'app-alpha'), b = harness(server, 'app-beta', '54'); await a.enter('Alpha'); await b.enter('Beta');
    await a.send({ type: 'createDuelRoom' });
    const room = a.app.getState().lobby!.rooms!.find(r => r.owner === a.app.getState().player!.id)!;
    await b.send({ type: 'challengeRoom', roomId: room.id }); await vi.advanceTimersByTimeAsync(200);
    expect(a.app.getState().lobby?.invitation).toMatchObject({ name: 'Beta' });
    await a.send({ type: 'replyChallenge', accept: true }); await vi.advanceTimersByTimeAsync(1000);
    expect(a.app.getState().preparation?.phase).toBe('rock-paper-scissors'); expect(b.app.getState().preparation?.phase).toBe('rock-paper-scissors');
    await drive(Promise.all([a.app.dispatch({ type: 'chooseHand', hand: 0 }), b.app.dispatch({ type: 'chooseHand', hand: 1 })]));
    await a.send({ type: 'chooseFirst', first: true }); await vi.advanceTimersByTimeAsync(100);
    await a.send({ type: 'beginDuel' }); await b.send({ type: 'beginDuel' }); await vi.advanceTimersByTimeAsync(4000);
    expect(a.app.diagnostics.duel.sequence).toBeGreaterThan(0); expect(b.app.diagnostics.duel.sequence).toBeGreaterThan(0);
    expect(a.app.getState().error).toBeUndefined(); expect(b.app.getState().error).toBeUndefined();
  });
  it('retains an unfinished match through settings and clears the old result before the next game', async () => {
    setDuelCore(await createNodeDuelCore());
    const server = setup(undefined,'unused',{PVP_TEST:'1'}).server;
    const a = harness(server,'match-app-alpha'), b = harness(server,'match-app-beta','54'); await a.enter('MatchAlpha'); await b.enter('MatchBeta');
    await a.send({type:'createDuelRoom',options:{style:4,allowSurrender:true}});
    const room = a.app.getState().lobby!.rooms!.find(r=>r.owner===a.app.getState().player!.id)!;
    await b.send({type:'challengeRoom',roomId:room.id}); await vi.advanceTimersByTimeAsync(200);
    await a.send({type:'replyChallenge',accept:true}); await vi.advanceTimersByTimeAsync(1000);
    await drive(Promise.all([a.app.dispatch({type:'chooseHand',hand:0}),b.app.dispatch({type:'chooseHand',hand:1})]));
    await a.send({type:'chooseFirst',first:true}); await vi.advanceTimersByTimeAsync(100);
    await a.send({type:'beginDuel'}); await b.send({type:'beginDuel'}); await vi.advanceTimersByTimeAsync(4000);
    await a.send({type:'surrender'}); await vi.advanceTimersByTimeAsync(100);
    const surrender = a.app.getState().duel!.prompt!;
    await a.send({type:'duelRespond',promptId:surrender.id,response:{optionId:surrender.options.find(o=>o.label==='Yes')!.id}});
    await vi.advanceTimersByTimeAsync(3000);
    expect(a.app.getState().sideboarding).toMatchObject({round:1,ready:false,scores:[0,1,0]});
    expect(b.app.getState().sideboarding).toMatchObject({round:1,ready:false,scores:[1,0,0]});
    const original = a.app.getState().sideboarding!.deck;
    await a.send({type:'sideboardMove',passcode:original.main[0],from:'main',to:'side',index:0});
    expect(a.app.getState().sideboarding!.ready).toBe(false);
    await expect(a.app.dispatch({type:'submitSideboard'})).rejects.toThrow(/original Main and Side counts/);
    await a.send({type:'sideboardMove',passcode:original.main[0],from:'side',to:'main',index:0});
    await a.send({type:'openScene',scene:'settings'});
    await expect(a.app.dispatch({type:'openScene',scene:'lobby'})).rejects.toThrow(/Finish or surrender/);
    await a.send({type:'openScene',scene:'duel'});
    await drive(Promise.all([a.app.dispatch({type:'submitSideboard'}),b.app.dispatch({type:'submitSideboard'})]));
    expect(a.app.getState().duel?.ended).toBeUndefined(); expect(Object.keys(a.app.diagnostics.duel.cards)).toHaveLength(0); expect(a.app.getState().sideboarding).toBeUndefined();
    expect(a.app.getState().preparation?.phase).toBe('choose-first'); expect(a.app.getState().match?.round).toBe(2);
    await a.send({type:'chooseFirst',first:false}); await vi.advanceTimersByTimeAsync(100);
    await a.send({type:'beginDuel'}); await b.send({type:'beginDuel'}); await vi.advanceTimersByTimeAsync(3000);
    expect(a.app.getState().duel?.ended).toBeUndefined(); expect(a.app.diagnostics.duel.sequence).toBeGreaterThan(0);
    expect(a.app.diagnostics.duel.errors).toEqual([]); expect(a.app.diagnostics.duel.unsupported).toEqual([]);
  });
  it('cannot leave an unfinished duel through the settings scene', async () => {
    setDuelCore(await createNodeDuelCore()); const f = harness(); await f.enter(); await beginNpc(f);
    expect(f.app.diagnostics.duel.status).not.toBe('finished');
    await f.send({ type: 'openScene', scene: 'settings' });
    await expect(f.app.dispatch({ type: 'openScene', scene: 'lobby' })).rejects.toThrow(/Finish or surrender/);
  });
  it('plays projected NPC prompts to a natural result and rejects stale/double responses', async () => {
    setDuelCore(await createNodeDuelCore()); const f = harness(); await f.enter(); await beginNpc(f);
    let answered = 0, choices = 0, checkedDuplicate = false, checkedDialog = false, oldPrompt: ClientCommand | null = null;
    for (let step = 0; step < 4000 && !f.app.getState().duel?.ended; step++) {
      await vi.advanceTimersByTimeAsync(100); const state = f.app.diagnostics.duel;
      expect(state.errors).toEqual([]); expect(state.unsupported).toEqual([]);
      if (!state.acceptingInput || !state.prompt || state.prompt.id === answered) continue;
      answered = state.prompt.id;
      if (!checkedDialog && state.prompt.kind !== 'actions' && f.app.getState().duel?.actions?.some(a => a.id.startsWith('phase:'))) {
        expect.soft(f.app.getState().duel?.actions?.filter(a => a.id.startsWith('phase:')), 'Dialog must not offer phase controls rejected by encodeDuelResponse').toEqual([]);
        checkedDialog = true;
      }
      const command = promptCommand(f.app);
      if (oldPrompt) { await expect(f.app.dispatch(oldPrompt)).rejects.toThrow(/no longer active/); oldPrompt = null; }
      if (command.type === 'duelRespond' && !checkedDuplicate) {
        const pending = f.app.dispatch(command); await expect(f.app.dispatch(command)).rejects.toThrow(/Wait|already been sent/); await pending;
        await expect(f.app.dispatch(command)).rejects.toThrow(/already been sent/); oldPrompt = command; checkedDuplicate = true;
      } else { try { await f.app.dispatch(command); } catch (error) { throw new Error(JSON.stringify({ error: String(error), command, promptKind: state.prompt?.kind, buttons: state.buttons, turn: state.turn, phase: state.phase, sequence: state.sequence })); } }
      choices++;
    }
    expect(f.app.getState().duel?.ended).toBe('Defeat'); expect(choices).toBeGreaterThan(0); expect(checkedDuplicate).toBe(true);
    expect(f.app.getState().duel!.turn).toBeGreaterThan(1);
    await f.send({ type: 'leaveDuel' }); expect(f.app.getState()).toMatchObject({ scene: 'lobby', duel: null });
  }, 20000);
});
