// node client/web-shell/htmlui/rewards/model_test.mjs: rewards/model.js: the tabs' counts, the rows' order and states,
// each tab's strip (the UTC resets, the first steps' total), the login calendar. Synthetic data only.
import assert from 'node:assert/strict';
import { TABS, duration, nextDay, nextWeek, missionState, rowsOf, claimableIds, tabsOf, stripOf, calendarOf, openEvent } from './model.js';

const m = (id, kind, progress, target, extra = {}) => ({ id, label: id, event: 'play', target, progress, mp: 80, kind, claimed: false,
  claimable: progress >= target, ...extra });
const cal = Array.from({ length: 30 }, (_, i) => ({ day: i + 1, mp: [10, 20].includes(i + 1) ? 100 : 40 }));
const V = {
  wallet: { total: 7000, bound: 5000, earned: 2000 }, day: '2026-11-05', week: '2026-11-02', stockpileCap: 9,
  missions: [
    m('d0', 'daily', 0, 1), m('d1', 'daily', 2, 2), m('d2', 'daily', 1, 1, { claimed: true, claimable: false }),
    m('w0', 'weekly', 1, 4, { mp: 600 }),
    m('f0', 'first', 1, 1, { mp: 1000, claimed: true }), m('f1', 'first', 1, 1, { mp: 2000 }), m('f2', 'first', 2, 5, { mp: 2000 }),
    m('l0', 'lifetime', 3, 50, { mp: 500 }),
  ],
  login: { day: '2026-11-05', count: 12, streak: 3, cycleDay: 12, calendar: cal },
};

assert.deepEqual(TABS.map(t => t.label), ['Event', 'Daily', 'Weekly', 'First Steps', 'Achievements']);
assert.equal(duration(5 * 3600e3 + 12 * 60e3 + 30e3), '5h 12m');
assert.equal(duration(2 * 86400e3 + 5 * 3600e3), '2d 5h');
assert.equal(duration(12 * 60e3), '12m');
assert.equal(duration(20e3), '<1m');
// UTC boundaries: Thursday 2026-11-05 18:47 UTC -> midnight, Monday 2026-11-09
const now = Date.UTC(2026, 10, 5, 18, 47);
assert.equal(new Date(nextDay(now)).toISOString(), '2026-11-06T00:00:00.000Z');
assert.equal(new Date(nextWeek(now)).toISOString(), '2026-11-09T00:00:00.000Z');
assert.equal(new Date(nextWeek(Date.UTC(2026, 10, 9, 0, 0, 1))).toISOString(), '2026-11-16T00:00:00.000Z', 'Monday itself: the next Monday');
assert.equal(new Date(nextWeek(Date.UTC(2026, 10, 8, 23, 59))).toISOString(), '2026-11-09T00:00:00.000Z', 'Sunday night');

assert.equal(missionState(V.missions[0]), 'open');
assert.equal(missionState(V.missions[1]), 'claimable');
assert.equal(missionState(V.missions[2]), 'done');
// rows: claimable, open, claimed; progress clamped
assert.deepEqual(rowsOf(V, 'daily').map(r => [r.id, r.state]), [['d1', 'claimable'], ['d0', 'open'], ['d2', 'done']]);
assert.deepEqual(rowsOf(V, 'first').map(r => r.id), ['f1', 'f2', 'f0']);
assert.equal(rowsOf(V, 'first')[1].pct, 0.4);
assert.equal(rowsOf({ missions: [m('x', 'daily', 9, 2)] }, 'daily')[0].progress, 2);
assert.deepEqual(rowsOf(null, 'daily'), []);
assert.deepEqual(claimableIds(V), ['d1', 'f1']);
assert.deepEqual(claimableIds(V, 'first'), ['f1']);
assert.deepEqual(tabsOf(V).map(t => t.count), [1, 0, 1, 0]);

// strips
let s = stripOf(V, 'daily', now);
assert.equal(s.text, '2 of 9 held');
assert.equal(s.sub, 'New missions in 5h 13m');
assert.equal(s.note, '');
assert.match(stripOf({ ...V, missions: Array.from({ length: 9 }, (_, i) => m('d' + i, 'daily', 0, 1)) }, 'daily', now).note, /full/);
assert.equal(stripOf(V, 'weekly', now).sub, 'Resets in 3d 5h');
s = stripOf(V, 'first', now);
assert.equal(s.text, '1 of 3 complete');
assert.equal(s.sub, '1,000 / 5,000 MP earned');
assert.equal(s.bar.pct, 0.2);
assert.equal(stripOf(V, 'lifetime', now).text, '0 of 1 complete');

// the calendar: 30 days, 1-12 received, 12 today, the 20th the next milestone
let c = calendarOf(V);
assert.equal(c.days.length, 30);
assert.deepEqual(c.days.filter(d => d.milestone).map(d => d.day), [10, 20]);
assert.equal(c.days.filter(d => d.received).length, 12);
assert.deepEqual(c.days.filter(d => d.today).map(d => d.day), [12]);
assert.deepEqual(c.today, { day: 12, mp: 40, milestone: false, received: true, today: true });
assert.equal(c.tomorrow.day, 13);
assert.deepEqual(c.nextMilestone, { day: 20, mp: 100, in: 8 });
// today's bonus not on this character (another got it, or the wallet was full): no today, still the cycle so far
c = calendarOf({ ...V, login: { ...V.login, day: '2026-11-04' } });
assert.equal(c.today, null);
assert.equal(c.days.filter(d => d.received).length, 12);
// the cycle's end wraps tomorrow to day 1; no next milestone
c = calendarOf({ ...V, login: { ...V.login, cycleDay: 30 } });
assert.equal(c.tomorrow.day, 1);
assert.equal(c.nextMilestone, null);
// a new account: nothing received yet
c = calendarOf({ ...V, login: { day: '', count: 0, streak: 0, cycleDay: 0, calendar: cal } });
assert.equal(c.days.filter(d => d.received).length, 0);
assert.equal(c.tomorrow.day, 1);
assert.deepEqual(c.nextMilestone, { day: 10, mp: 100, in: 10 });
console.log('rewards model_test: ok');

// a limited-time event: its tab only while the view has one; shards, not MP; the NPCs still to beat; the time left
{
  const EV = { id: 'event:npc-sweep-2026-11', label: 'Beat all 36 NPCs on the map', event: 'npc', kind: 'event', target: 36, progress: 5, mp: 0,
    shards: 24000, ends: '2026-11-25T00:00:00.000Z', claimed: false, claimable: false, left: ['Yami Yugi', 'Seto Kaiba'] };
  const now = Date.parse('2026-11-11T12:00:00Z');
  assert.deepEqual(tabsOf({ missions: [] }).map(t => t.key), ['daily', 'weekly', 'first', 'lifetime']);
  assert.deepEqual(tabsOf({ missions: [EV] }).map(t => t.key), ['event', 'daily', 'weekly', 'first', 'lifetime']);
  assert.equal(openEvent({ missions: [EV] }), EV);
  assert.equal(openEvent({ missions: [{ ...EV, claimed: true }] }), null);
  const [r] = rowsOf({ missions: [EV] }, 'event');
  assert.deepEqual([r.shards, r.mp, r.left, r.state, r.progress], [24000, 0, ['Yami Yugi', 'Seto Kaiba'], 'open', 5]);
  assert.deepEqual(stripOf({ missions: [EV] }, 'event', now), { text: '5 of 36 NPCs beaten', sub: 'Ends in 13d 12h', clock: true });
  assert.equal(stripOf({ missions: [{ ...EV, claimed: true }] }, 'event', now).text, 'Event reward claimed');
  assert.deepEqual(tabsOf({ missions: [{ ...EV, progress: 36, claimable: true }] }).map(t => t.count), [1, 0, 0, 0, 0]);
}
