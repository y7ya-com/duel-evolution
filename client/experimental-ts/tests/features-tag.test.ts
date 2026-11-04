import { afterEach, describe, expect, it, vi } from 'vitest';
import { TagLobbyController, type TagLobbyState } from '../src/features/tag';
import type { TagState } from '../src/features/online';
import { HttpClient } from '../src/services/http';
import { renderTagLobby } from '../src/ui/extra/tag';
import { TestDocument, TestNode } from './ui-dom-fixture';

const NOW = 1_800_000_000;
const players = [2, 3, 4].map(pid => ({ pid, name: `P${pid}` }));
const base = (over: Partial<TagState> = {}): TagState => ({ self: { pid: 1, name: 'P1' }, active: false, available: true, players, invitations: [], ...over });
const invitation = (outbound: boolean, accepted: number[] = [1]) => ({ id: 'inv-1', hostPid: outbound ? 1 : 2, expires: NOW + 100, outbound,
  seats: (outbound ? [1, 3, 2, 4] : [2, 1, 4, 3]).map((pid, i) => ({ pid, name: `P${pid}`, role: (['captain', 'opponent', 'teammate', 'opponent-teammate'] as const)[i], accepted: accepted.includes(pid) })) });
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
function setup(respond: (method: string, path: string, body: unknown) => Response) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname, body = init?.body ? JSON.parse(String(init.body)) : undefined, method = init?.method ?? 'GET';
    calls.push({ method, path, body }); return respond(method, path, body);
  });
  const http = new HttpClient({ origin: 'https://game.test', fetch: fetch as unknown as typeof globalThis.fetch, timeoutMs: 0 });
  const changes: TagLobbyState[] = [];
  const controller = new TagLobbyController({ http, onChange: s => changes.push(s), now: () => NOW, interval: active => active ? 2000 : 5000 });
  return { controller, calls, changes, http };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Tag Duel lobby controller', () => {
  it('polls only while started, faster while an invitation is open, and opens itself once for an incoming invitation', async () => {
    vi.useFakeTimers();
    let state = base();
    const { controller, calls } = setup(() => json(state));
    controller.start(); await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1); expect(controller.state.open).toBe(false);
    await vi.advanceTimersByTimeAsync(4999); expect(calls).toHaveLength(1);
    state = base({ invitations: [invitation(false)] });
    await vi.advanceTimersByTimeAsync(1); expect(calls).toHaveLength(2);
    expect(controller.state.open).toBe(true);
    await controller.dispatch({ type: 'close' });
    await vi.advanceTimersByTimeAsync(2000); expect(calls).toHaveLength(3);
    expect(controller.state.open).toBe(false); // the same invitation does not reopen a closed window
    controller.stop(); await vi.advanceTimersByTimeAsync(20000); expect(calls).toHaveLength(3);
    controller.dispose();
  });
  it('validates seats locally and sends only stable player ids', async () => {
    const { controller, calls } = setup((method, path, body) => method === 'POST' ? json(base({ invitations: [invitation(true)] })) : json(base()));
    await controller.dispatch({ type: 'open' });
    await controller.dispatch({ type: 'select', role: 'teammatePid', pid: 3 });
    await controller.dispatch({ type: 'select', role: 'opponentPid', pid: 3 });
    expect(controller.state.selected).toEqual({ teammatePid: 3, opponentPid: 0, opponentTeammatePid: 0 });
    await controller.dispatch({ type: 'select', role: 'opponentPid', pid: 99 });
    expect(controller.state.selected.opponentPid).toBe(0);
    await controller.dispatch({ type: 'invite' });
    expect(controller.state.error).toMatch(/two different opponents/); expect(calls.filter(c => c.method === 'POST')).toHaveLength(0);
    await controller.dispatch({ type: 'select', role: 'opponentPid', pid: 2 }); await controller.dispatch({ type: 'select', role: 'opponentTeammatePid', pid: 4 });
    await controller.dispatch({ type: 'invite' });
    expect(calls.at(-1)).toEqual({ method: 'POST', path: '/api/de/tag/invite', body: { teammatePid: 3, opponentPid: 2, opponentTeammatePid: 4 } });
    expect(controller.state.notice).toMatch(/Invitation sent/); expect(controller.invitations()).toHaveLength(1);
    controller.dispose();
  });
  it('reports declines and keeps the server state that comes with a refusal', async () => {
    let state = base({ invitations: [invitation(false)] });
    const { controller } = setup((method) => method === 'POST' ? json({ error: 'This invitation is no longer available.', ...base() }, 409) : json(state));
    await controller.dispatch({ type: 'open' });
    await controller.dispatch({ type: 'accept', id: 'inv-1' });
    expect(controller.state.error).toBe('This invitation is no longer available.'); expect(controller.state.state?.invitations).toEqual([]);
    state = base({ event: { id: 'inv-1', kind: 'declined', at: NOW - 3, name: 'P3' } });
    await controller.dispatch({ type: 'refresh' });
    expect(controller.state.notice).toBe('P3 declined the invitation.');
    controller.dispose();
  });
});

class LocalNode extends TestNode { addEventListener(type: string, listener: (event: any) => void) { (this as any)[`on${type}`] = listener; } }
class LocalDocument extends TestDocument { createElement(tag: string) { return new LocalNode(tag, this); } }
describe('Tag Duel window', () => {
  it('shows the invitee its own team first, readiness per seat and literal names', () => {
    vi.useFakeTimers(); vi.stubGlobal('document', new LocalDocument());
    const dispatch = vi.fn(), model: TagLobbyState = { open: true, busy: false, error: '', notice: '', selected: { teammatePid: 0, opponentPid: 0, opponentTeammatePid: 0 },
      state: base({ self: { pid: 3, name: '<b>P3</b>' }, invitations: [invitation(false, [2, 3])] }) };
    const root = renderTagLobby(model, dispatch, NOW) as unknown as TestNode;
    const team = (key: string) => root.querySelectorAll('section').find(n => n.dataset.key === key)!.querySelectorAll('strong').map(n => n.textContent);
    // P3 is seated as the opponent-teammate of P2's invitation (P2 + P4 vs P1 + P3).
    expect(team('tag-team:own')).toEqual(['P1', 'P3 (you)']); expect(team('tag-team:rival')).toEqual(['P2', 'P4']);
    const accept = root.querySelectorAll('button').find(b => b.dataset.key === 'tag-accept')!;
    expect(accept.disabled).toBe(true); expect(accept.textContent).toContain('waiting for others');
    expect(root.querySelectorAll('b')).toHaveLength(0);
    root.querySelectorAll('button').find(b => b.dataset.key === 'tag-decline')!.onclick!({});
    expect(dispatch).toHaveBeenCalledWith({ type: 'decline', id: 'inv-1' });
  });
  it('disables a chosen player in the other seats and Invite until all three are chosen', () => {
    vi.useFakeTimers(); vi.stubGlobal('document', new LocalDocument());
    const dispatch = vi.fn(), model: TagLobbyState = { open: true, busy: false, error: '', notice: '', selected: { teammatePid: 3, opponentPid: 0, opponentTeammatePid: 0 }, state: base() };
    const root = renderTagLobby(model, dispatch, NOW) as unknown as TestNode, selects = root.querySelectorAll('select');
    expect(selects.map(s => s.dataset.key)).toEqual(['tag-seat:teammatePid', 'tag-seat:opponentPid', 'tag-seat:opponentTeammatePid']);
    expect(selects[1]!.querySelectorAll('option').find(o => o.value === '3')!.disabled).toBe(true);
    expect(root.querySelectorAll('button').find(b => b.dataset.key === 'tag-invite')!.disabled).toBe(true);
    selects[1]!.value = '2'; selects[1]!.onchange!({});
    expect(dispatch).toHaveBeenCalledWith({ type: 'select', role: 'opponentPid', pid: 2 });
  });
});
