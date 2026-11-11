import { describe, expect, it } from 'vitest';
import type { ClientView } from '../src/ui/contracts';
import { duelCounts, duelKey, listRows, lobbyLocal, moveKey, ownRoom, waiting, waitingMessage } from '../src/ui/htmlui/lobby';

// The HTML lobby's state helpers (src/ui/htmlui/lobby.ts), standing in for the old DOM lobby panel's
// Duel Rooms / matchmaking / NPC button tests (app-ui + ui-lifecycle skips).
const view = (extra: Record<string, unknown> = {}) => ({
  scene: 'lobby', mode: 'online', player: { id: 1 },
  lobby: {
    avatars: [{ id: 1, name: 'Me', self: true, x: 0, y: 0 }, { id: 2, name: 'Zed', x: 50, y: 0 }, { id: 3, name: 'Amy', x: 5, y: 0 }],
    rooms: [{ owner: 2, style: 3 }, { owner: 3, style: 4, opponent: 9 }],
    npcs: [{ id: 5, name: 'A-lien' }],
  },
  ...extra,
}) as unknown as ClientView;

describe('HTML lobby state', () => {
  it('counts the duel menu from the authoritative rooms and queue', () => {
    expect(duelCounts(view({ matchmaking: { status: 'idle', counts: { single: 1, match: 2, either: 3 } } }))).toEqual({ auto: 6, waiting: 1, duelling: 1 });
  });
  it('waits only in an own room or a searching queue, and says so on the bar', () => {
    expect(ownRoom(view())).toBeUndefined(); expect(waiting(view())).toBe(false);
    const queued = view({ matchmaking: { status: 'searching' } });
    expect(waiting(queued)).toBe(true); expect(waitingMessage({ state: queued, text: n => `t${n}` })).toBe('t4031');
    const hosting = view({ player: { id: 2 } });
    expect(ownRoom(hosting)?.owner).toBe(2); expect(waitingMessage({ state: hosting, text: n => `t${n}` })).toBe('t5067');
    expect(waitingMessage({ state: view() })).toBeNull();
  });
  it('the Duel key opens the menu, or cancels while waiting', () => {
    const ui = lobbyLocal(); duelKey(view(), ui); expect(ui.open).toBe('duel'); duelKey(view(), ui); expect(ui.open).toBeNull();
    duelKey(view({ matchmaking: { status: 'searching' } }), ui); expect(ui.cancel).toBe(true);
    moveKey(ui); expect(ui.open).toBe('move'); moveKey(ui); expect(ui.open).toBeNull();
  });
  it('lists players and the explicit server NPC list by search', () => {
    expect(listRows(view(), 'single', []).map(r => r.name)).toEqual(['Zed']);
    expect(listRows(view(), 'name', []).map(r => r.name)).toEqual(['Amy', 'Zed']);
    expect(listRows(view(), 'near', []).map(r => r.id)).toEqual([3, 2]);
    expect(listRows(view(), 'friends', [2]).map(r => r.id)).toEqual([2]);
    expect(listRows(view(), 'all', [])).toContainEqual({ kind: 'npc', id: 5, name: 'A-lien' });
    expect(listRows(view({ mode: 'free' }), 'all', []).some(r => r.kind === 'npc')).toBe(false);
  });
});
