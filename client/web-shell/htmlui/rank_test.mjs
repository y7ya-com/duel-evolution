// node client/web-shell/htmlui/rank_test.mjs: rank.js (the texts, the fit, the cache over GET /api/de/rank) and the
// screens' pure parts that find a level to put it by: Select Player's rows (screens/select.js), My Profile's LV row
// (screens/social.js), a player card's header (cardHeader). Exit 1 on the first failure.
import assert from 'node:assert/strict';

const asked = [];
let reply = () => [200, { players: [] }];
globalThis.fetch = async url => { asked.push(url); const [status, body] = reply(url); return { ok: status === 200, status, json: async () => body }; };
const R = await import('./rank.js');
const { rankText, rankShort, rankFit, rankLook, rankByPid, rankByName, rankSelf, peekRank, pidKey, SELF, clearRanks, cardHeader } = R;

const ra = { pid: 1008, name: 'Rival', known: true, placed: true, school: 'ra', division: 2, label: 'Ra Yellow II', rating: 1712, placement: null };
const ob = { ...ra, school: 'obelisk', division: 1, label: 'Obelisk Blue I', rating: 1893 };
const master = { ...ra, school: 'master', division: 0, label: 'Master', rating: 2201 };
const fresh = { pid: 1004, name: 'New', known: true, placed: false, school: 'beginner', division: 0, label: 'Unranked', rating: null, placement: { played: 2, of: 5 } };
assert.equal(rankText(ra), 'Ra Yellow II (1712)');
assert.equal(rankText(master), 'Master (2201)');
assert.equal(rankText(fresh), 'Unranked · Placement 2/5');
assert.equal(rankText({ pid: 7, known: false }), '');
assert.equal(rankText(null), '');
assert.equal(rankShort(ob), 'Obelisk I (1893)');
assert.equal(rankShort(master), 'Master (2201)');
assert.equal(rankShort(fresh), 'Placement 2/5');
// the colours: the school's, grey for unplaced (whatever school it would say)
assert.equal(rankLook(ra).fill, '#ffd21a'); assert.equal(rankLook(ob).fill, '#2a6cf0'); assert.equal(rankLook({ ...ra, school: 'slifer' }).fill, '#e0231b');
assert.equal(rankLook(fresh), R.SCHOOL.beginner);
// the fit: 8 px a character (plus the engine's 1 px each): the full form, else the short, else nothing
const w8 = s => 8 * s.length;
assert.equal(rankFit(ra, 200, 16, w8), 'Ra Yellow II (1712)');
assert.equal(rankFit(ra, 120, 16, w8), 'Ra II (1712)');
assert.equal(rankFit(ra, 40, 16, w8), '');

// the cache: one request per player per RANK_TTL, the answer kept; a failure kept briefly as null
reply = () => [200, { players: [ra] }];
assert.equal(peekRank(pidKey(1008)), undefined);
const [a, b] = await Promise.all([rankByPid(1008), rankByPid(1008)]);
assert.deepEqual(a, ra); assert.equal(b, a);
assert.deepEqual(asked, ['/api/de/rank?pid=1008']);
assert.deepEqual(peekRank(pidKey(1008)), ra);
await rankByPid(1008); assert.equal(asked.length, 1);
reply = () => [200, { players: [{ pid: null, name: 'Nobody', known: false }] }];
assert.deepEqual(await rankByName('Nobody'), { pid: null, name: 'Nobody', known: false });
assert.equal(asked.at(-1), '/api/de/rank?name=Nobody');
reply = () => [429, { error: 'rate-limited' }];
assert.equal(await rankByPid(1012), null);
assert.equal(peekRank(pidKey(1012)), null);
reply = () => [200, { players: [fresh, { ...ra, pid: 1005 }] }];
assert.equal((await rankSelf()).length, 2); assert.equal(asked.at(-1), '/api/de/rank?self=1'); assert.equal(peekRank(SELF).length, 2);
const realNow = Date.now;
Date.now = () => realNow() + R.RANK_TTL + 1;   // expired: asked again
await rankByPid(1008); assert.equal(asked.filter(u => u === '/api/de/rank?pid=1008').length, 2);
Date.now = realNow;
clearRanks(); assert.equal(peekRank(SELF), undefined);

// a card's header (yo2PlayerListMenu.cpp showInfo "%s%02d  %8s\n%s")
// (live, 2026-11-04: the Help at 8, 8 and its Text child at 0, 0)
const card = { cls: 'CPlayerListMenu', w: 336, controls: [{ id: 1, cls: 'CWindowTaskHelp', shown: true, parent: 0, x: 8, y: 8, w: 0, h: 0 },
  { id: 2, cls: 'CWindowTaskText', shown: true, parent: 1, x: 0, y: 0, w: 320, h: 36, align: 1, text: 'LV01  Rival Tester\nTeam Rocket' }] };
assert.deepEqual(cardHeader(card), { x: 8, y: 8, w: 320, align: 1, lineGap: 0, first: 'LV01  Rival Tester', team: 'Team Rocket' });
assert.deepEqual(cardHeader({ controls: [{ id: 3, shown: true, parent: 0, x: 8, y: 8, w: 100, text: 'LV12  Solo\n' }] }), { x: 8, y: 8, w: 100, align: 0, lineGap: 0, first: 'LV12  Solo', team: '' });
assert.equal(cardHeader({ controls: [{ shown: true, text: 'Title' }] }), null);

// Select Player: the rows top to bottom are slots; a slot's rank by its pid and name
const { rankRows, slotRank } = await import('./screens/select.js');
const ctl = (id, name, x, y, extra) => ({ id, cls: 'CWindowTaskText', name, parent: 0, x, y, w: 128, h: 16, shown: true, ...extra });
const sel = { cls: 'CWindowPlayerSelect', controls: [
  ctl(1, 'プレイヤ選択ボタンのLV表示文字', 288, 120, { text: 'Lv03' }), ctl(2, 'プレイヤ選択ボタンのLV表示文字', 288, 80, { text: 'Lv12' }),
  ctl(3, 'プレイヤ選択ボタン', 16, 112, { cls: 'CWindowTaskTextSwitch', label: 'Second' }), ctl(4, 'プレイヤ選択ボタン', 16, 72, { cls: 'CWindowTaskTextSwitch', label: 'First' }),
  ctl(5, 'プレイヤ選択ボタン', 16, 152, { cls: 'CWindowTaskTextSwitch', label: 'Create Player' })] };
assert.deepEqual(rankRows(sel).map(r => [r.slot, r.row.label, r.lv.text]), [[0, 'First', 'Lv12'], [1, 'Second', 'Lv03']]);
const self = [{ ...ra, pid: 1004, name: 'First' }, { ...fresh, pid: 1005, name: 'Second' }];
assert.equal(slotRank(self, 0, 'First').pid, 1004);
assert.equal(slotRank(self, 1, 'Second ').pid, 1005);
assert.equal(slotRank(self, 1, 'Renamed'), null);   // another character now: nothing rather than the wrong rank

// My Profile: only the LV row's value control, with the Name row's value as the player
const { profileLevel } = await import('./screens/social.js');
const item = (id, text, y) => ctl(id, 'プロフィールウィンドウの項目名', 16, y, { text });
const value = (id, text, y) => ctl(id, 'プロフィールウィンドウの項目の数値', 16, y, { text, align: 2 });
const prof = { cls: 'CWindowModelProfile', controls: [item(1, 'Name', 32), value(2, 'Rank Tester', 48), item(3, 'LV', 96), value(4, '23', 112), item(5, 'Wins', 160), value(6, '0', 176)] };
assert.deepEqual(profileLevel(prof, prof.controls[3]), { name: 'Rank Tester' });
assert.equal(profileLevel(prof, prof.controls[5]), null);
assert.equal(profileLevel({ ...prof, cls: 'CWindowModelFriendlist' }, prof.controls[3]), null);
console.log('rank_test: ok');
