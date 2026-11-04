import assert from 'node:assert/strict';
import { tagLobbyController, tagRequest } from './tag-lobby.js';

const players = [{ pid: 2, name: 'Partner' }, { pid: 3, name: 'Rival' }, { pid: 4, name: 'Rival partner' }];
const initial = () => ({ self: { pid: 1, name: 'Captain' }, available: true, players, invitations: [], active: false });
const invite = (outbound = true) => ({ id: 'inv-1', hostPid: 1, expires: 200, outbound, seats: [
  { pid: 1, name: 'Captain', role: 'captain', accepted: true }, { pid: 3, name: 'Rival', role: 'opponent', accepted: false },
  { pid: 2, name: 'Partner', role: 'teammate', accepted: false }, { pid: 4, name: 'Rival partner', role: 'opponent-teammate', accepted: false },
] });
let now = 100, response = initial(), calls = [], notifications = 0;
const c = tagLobbyController({ now: () => now, changed: () => notifications++, request: async (action, body) => {
  calls.push([action, body]); if (response instanceof Error) throw response; return structuredClone(response);
} });
await c.refresh();
assert.equal(c.model.state.self.name, 'Captain');
assert.equal(await c.act('invite'), false, 'incomplete selection cannot send');
assert.equal(calls.length, 1);
c.select('teammatePid', 2); c.select('opponentPid', 2);
assert.equal(c.model.selected.opponentPid, 0, 'one player cannot fill two seats');
c.select('opponentPid', 999);
assert.equal(c.model.selected.opponentPid, 0, 'only nearby available ids can be selected');
c.select('opponentPid', 3); c.select('opponentTeammatePid', 4);
response.invitations = [invite()];
assert.equal(await c.act('invite'), true);
assert.deepEqual(calls.at(-1), ['invite', { teammatePid: 2, opponentPid: 3, opponentTeammatePid: 4 }]);
assert.equal(c.invitations()[0].seats.filter(s => s.accepted).length, 1);
response = initial(); await c.act('cancel', 'inv-1');
assert.deepEqual(calls.at(-1), ['cancel', { id: 'inv-1' }]);
assert.match(c.model.notice, /cancelled/);
response = { ...initial(), invitations: [invite(false)] };
await c.refresh();
response = { ...initial(), active: true, started: true };
assert.equal(await c.act('accept', 'inv-1'), true);
assert.match(c.model.notice, /Starting/);
response = { ...initial(), invitations: [invite(false)] };
await c.refresh();
response = initial();
assert.equal(await c.act('decline', 'inv-1'), true);
assert.deepEqual(calls.at(-1), ['decline', { id: 'inv-1' }]);
response = { ...initial(), invitations: [invite(false)] };
await c.refresh(); now = 201;
assert.equal(c.invitations().length, 0);
const requestsBeforeExpiry = calls.length;
assert.equal(await c.act('accept', 'inv-1'), false);
assert.equal(calls.length, requestsBeforeExpiry, 'expired invite cannot be accepted');
assert.match(c.model.error, /expired/);
response = initial(); await c.refresh();
assert.match(c.model.notice, /expired/);
response = { ...initial(), players: players.slice(1) }; await c.refresh();
assert.equal(c.model.selected.teammatePid, 0, 'departed player selection is cleared');
response = new Error('Player is busy.');
await c.refresh(); assert.equal(c.model.error, 'Player is busy.');
assert.equal(c.model.state.self.name, 'Captain', 'a temporary failure keeps the current state');

// Stale reads cannot overwrite an invitation sent while the read was in flight.
let release;
const race = tagLobbyController({ now: () => 100, request: async action => action === 'invite' ? { ...initial(), invitations: [invite()] } : new Promise(r => release = r) });
race.model.state = initial(); race.select('teammatePid', 2); race.select('opponentPid', 3); race.select('opponentTeammatePid', 4);
const pending = race.refresh(); await race.act('invite'); release(initial()); await pending;
assert.equal(race.invitations()[0].id, 'inv-1');
const staleRead = race.refresh(); race.reset(); release({ ...initial(), invitations: [invite()] }); await staleRead;
assert.equal(race.model.state, null, 'leaving a lobby invalidates its in-flight response');

let acceptRequests = 0, acceptResult;
const accepting = tagLobbyController({ now: () => 100, request: async () => {
  acceptRequests++; return new Promise(r => acceptResult = r);
} });
accepting.model.state = { ...initial(), invitations: [invite(false)] };
const firstAccept = accepting.act('accept', 'inv-1');
assert.equal(await accepting.act('accept', 'inv-1'), false, 'a double click cannot send duplicate acceptance');
assert.equal(acceptRequests, 1);
acceptResult({ ...initial(), active: true }); await firstAccept;

response = { ...initial(), event: { id: 'event-1', kind: 'declined', name: 'Rival', at: now } };
await c.refresh(); assert.equal(c.model.notice, 'Rival declined the invitation.');
response = Object.assign(new Error('The invitation ended.'), { state: initial() });
c.model.state = { ...initial(), invitations: [{ ...invite(false), expires: now + 100 }] };
assert.equal(await c.act('accept', 'inv-1'), false);
assert.equal(c.model.state.invitations.length, 0, 'server conflict clears obsolete Accept controls');

// The request wrapper uses stable ids and displays server errors, including refreshed
// state on conflict so a cancelled invitation does not leave a stale Accept button.
let fetched;
globalThis.fetch = async (url, options) => { fetched = [url, options]; return { ok: false, json: async () => ({ error: 'A player left.', ...initial() }) }; };
await assert.rejects(tagRequest('accept', { id: 'abc' }), e => e.message === 'A player left.' && e.state.self.pid === 1);
assert.equal(fetched[0], '/api/de/tag/accept');
assert.equal(fetched[1].method, 'POST');
assert.deepEqual(JSON.parse(fetched[1].body), { id: 'abc' });
assert.ok(notifications > 10);
console.log('tag-lobby_test: ok');
