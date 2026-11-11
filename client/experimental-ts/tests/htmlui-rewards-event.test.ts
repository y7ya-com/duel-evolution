// main's limited-time event mission (9fdd9ac) in the rewrite: the rewrite mounts main's Missions launcher (page-modules.ts
// imports @htmlui/rewards/launcher.js), whose rewards client reads /api/de/rewards same-origin with the session cookie;
// the server's view of an event shows its Event tab (first, while unclaimed), its shards and the NPCs still to beat.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '@htmlui/rewards/api.js';
import { TABS, openEvent, rowsOf, tabsOf } from '@htmlui/rewards/model.js';

afterEach(() => { vi.unstubAllGlobals(); api._reset(); });
const event = { id: 'event:npc-sweep-2026-11', label: 'Beat all 36 NPCs on the map', event: 'npc', kind: 'event', target: 36, progress: 5, mp: 0, shards: 24000,
  ends: '2026-11-25T00:00:00.000Z', claimed: false, claimable: false, left: ['Yami Yugi', 'Seto Kaiba'] };
const view = { wallet: { total: 6040, bound: 5000, earned: 1040 }, shards: 500, day: '2026-11-11', week: '2026-11-09', stockpileCap: 9, nextRequestId: 'r1',
  login: { day: '2026-11-11', count: 2, streak: 2, cycleDay: 2, calendar: [] },
  missions: [event, { id: 'daily:a', label: 'Play a rewarded duel', event: 'play', target: 1, progress: 0, mp: 80, kind: 'daily', claimed: false, claimable: false }] };

describe('the Missions window\'s Event tab in the rewrite', () => {
  it('the rewrite mounts main\'s Missions launcher', () => {
    expect(readFileSync(new URL('../src/ui/htmlui/page-modules.ts', import.meta.url), 'utf8')).toContain("import('@htmlui/rewards/launcher.js')");
  });
  it('reads /api/de/rewards same-origin with the cookie; the event view gives the Event tab, its shards and who is left', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => { calls.push([String(url), init]); return new Response(JSON.stringify(view), { status: 200 }); });
    api._reset();
    const got = await api.getView({ force: true });
    expect(calls[0]![0]).toBe('/api/de/rewards'); expect(calls[0]![1]).toMatchObject({ credentials: 'same-origin' });
    expect(TABS[0]!.key).toBe('event');
    expect(tabsOf(got).map((t: { key: string }) => t.key)).toContain('event');
    expect(openEvent(got)).toMatchObject({ shards: 24000, left: ['Yami Yugi', 'Seto Kaiba'] });
    expect(rowsOf(got, 'event').map((m: { id: string }) => m.id)).toEqual([event.id]);
    expect(tabsOf({ ...view, missions: view.missions.slice(1) }).map((t: { key: string }) => t.key)).not.toContain('event');
  });
});
