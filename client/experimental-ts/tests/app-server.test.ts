import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientApp } from '../src/app';
import { GameApi, HttpClient, type DeckList } from '../src/services';
import type { ClientCommand, DuelResponse } from '../src/ui/contracts';
import { createNodeDuelCore } from '../../../server/src/duel/engine/node';
import { NPC_DECKS, setDuelCore } from '../../../server/src/duel/data';
import { starterInfo, starterClaim } from '../../../server/src/game/starter';
import { setup, drive, sessionFactory } from './network-server-fixture';
const apps: ClientApp[] = [];
afterEach(() => { apps.splice(0).forEach(app => app.dispose()); setDuelCore(null); vi.clearAllTimers(); vi.useRealTimers(); });
function harness(server = setup().server, user = 'app-test', deckId = '51') {
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
  const app = new ClientApp({ gatewayUrl: 'ws://localhost/net', api: new GameApi(new HttpClient({ origin: 'http://localhost', fetch: fetcher })), sessionFactory: transport.factory });
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
  for (let round = 0; round < 20; round++) {
    await f.send({ type: 'chooseHand', hand: (round % 3) as 0 | 1 | 2 });
    if (f.app.getState().preparation?.phase !== 'rock-paper-scissors') break;
  }
  if (f.app.getState().preparation?.phase === 'choose-first') await f.send({ type: 'chooseFirst', first: true });
  await vi.advanceTimersByTimeAsync(100); await f.send({ type: 'beginDuel' });
}
describe('ClientApp with actual server and GameSession', () => {
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
