import { describe, expect, it } from 'vitest';
import { discordWire, inWorld, DUELS_FAST, DUELS_SLOW, DISCORD_POLL } from '../src/ui/htmlui/discord-wire';
import { htmlUiLocal } from '../src/ui/htmlui/windows';
import type { ClientCommand, ClientView } from '../src/ui/contracts';

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
const world = (over: Partial<ClientView> = {}) => ({ scene: 'lobby', connection: 'online', lobby: { connected: true, avatars: [{ id: 42, name: 'Kaiba' }] } , ...over } as unknown as ClientView);

function rig(view: ClientView, opts: { search?: string; join?: unknown } = {}) {
  let state = view; const calls: string[] = [], sent: ClientCommand[] = [], timers: { f: () => void; ms: number }[] = [];
  const ui = htmlUiLocal(); let renders = 0;
  const fetch = async (url: string) => {
    calls.push(url);
    const body = url.endsWith('/api/de/duels') ? { you: 1, duels: [{ id: 7, pid: 42, name: 'Kaiba', lv: 9, match: true }] }
      : url.endsWith('/api/de/discord-online') ? { players: [{ pid: 99, name: 'Yugi', lv: 12, rank: { label: 'Gold II' }, parts: [] }] }
      : opts.join ?? { ok: true, name: 'Kaiba' };
    return { status: 200, json: async () => body };
  };
  const wire = discordWire({ ui, state: () => state, send: c => void sent.push(c), rerender: () => { renders++; }, fetch, base: '', search: opts.search ?? '', store: mem(), now: () => 1000,
    setTimer: (f, ms) => { timers.push({ f, ms }); return timers.length as unknown as ReturnType<typeof setTimeout>; }, clearTimer: () => {} });
  return { wire, ui, calls, sent, timers, set: (v: ClientView) => { state = v; }, renders: () => renders };
}

describe('discord wire (chat Duels tab, Discord rows, ?duel= link)', () => {
  it('is in the world only in a connected online lobby', () => {
    expect(inWorld(world())).toBe(true);
    expect(inWorld(world({ scene: 'characters' } as Partial<ClientView>))).toBe(false);
    expect(inWorld(world({ connection: 'reconnecting' } as Partial<ClientView>))).toBe(false);
    expect(inWorld(world({ mode: 'free' } as Partial<ClientView>))).toBe(false);
  });

  it('polls open duels and Discord duelists in the world, sets ui.duels / ui.discord, and rerenders', async () => {
    const r = rig(world({ scene: 'title' } as Partial<ClientView>));
    r.wire.tick(); await flush(); expect(r.calls).toEqual([]);
    r.set(world()); r.wire.tick(); await flush();
    expect(r.calls.sort()).toEqual(['/api/de/discord-online', '/api/de/duels']);
    expect(r.ui.duels?.[0]).toMatchObject({ id: 7, name: 'Kaiba', lv: 9 });
    expect(r.ui.discord?.[0]).toMatchObject({ pid: 99, name: 'Yugi' });
    expect(r.renders()).toBe(2);
    expect(r.timers.map(t => t.ms).sort((a, b) => a - b)).toEqual([DUELS_SLOW, DISCORD_POLL]);
    r.wire.tick(); await flush(); expect(r.calls).toHaveLength(2); // one loop, not one per render
  });

  it('polls every 5 s while the Duels tab is shown, and stops on leaving the world', async () => {
    const r = rig(world()); r.ui.chatTab = 3; r.wire.tick(); await flush();
    expect(r.timers.map(t => t.ms)).toContain(DUELS_FAST);
    r.set(world({ scene: 'deck' } as Partial<ClientView>)); r.wire.tick(); expect(r.wire.polling).toBe(false);
    for (const t of r.timers) t.f(); await flush(); expect(r.calls).toHaveLength(2);
  });

  it('Join checks with the server, then challenges the creator; a refusal is said', async () => {
    const r = rig(world()); r.ui.onJoinDuel!(7); await flush();
    expect(r.calls).toContain('/api/de/duels/join');
    expect(r.sent).toEqual([{ type: 'duelChallenge', playerId: 42 }]);
    const n = rig(world(), { join: { ok: false, error: 'gone', message: 'That duel is gone.' } }); n.ui.onJoinDuel!(7); await flush();
    expect(n.sent).toEqual([]); expect(n.ui.dialog).toEqual({ kind: 'ok', text: 'That duel is gone.' });
  });

  it('a Discord row opens the duelist\'s card (live: a card, not a message box)', () => {
    const r = rig(world());
    const p = { pid: 99, name: 'Yugi', lv: 12, rank: { label: 'Gold II' }, parts: [] };
    r.ui.onDiscordCard!(p);
    expect(r.ui.dialog).toBeNull(); expect(r.ui.discordCard).toEqual(p); expect(r.sent).toEqual([]);
    // another player's card open: closed first, one card at a time
    const q = rig(world({ profileDetail: { selectedPid: 42, selfPid: 1 } } as Partial<ClientView>));
    q.ui.onDiscordCard!(p);
    expect(q.sent).toEqual([{ type: 'profileAction', action: { type: 'close' } }]); expect(q.ui.discordCard).toEqual(p);
  });

  it('a ?duel= link is captured on load and joined once in the world', async () => {
    const r = rig(world({ scene: 'title' } as Partial<ClientView>), { search: '?duel=7' });
    r.wire.tick(); await flush(); expect(r.sent).toEqual([]);
    r.set(world()); r.wire.tick(); await flush();
    expect(r.sent).toEqual([{ type: 'duelChallenge', playerId: 42 }]);
    r.wire.tick(); await flush(); expect(r.sent).toHaveLength(1);
  });
});
