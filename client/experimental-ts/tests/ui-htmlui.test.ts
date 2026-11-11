import { describe, expect, it, vi } from 'vitest';
import { Ids, applyPointer } from '../src/ui/htmlui/snapshot';
import { chatCommand, htmlUiLocal, htmlWindows } from '../src/ui/htmlui/windows';
import type { BuildContext } from '../src/ui/htmlui/windows';
import type { ClientView } from '../src/ui/contracts';

const view = (patch: Partial<ClientView>): ClientView => ({ scene: 'title', connection: 'online', status: '', player: null, characters: [], lobby: null, deckEditor: null, shop: null, duel: null, social: null,
  settings: { sound: 1, music: 1, reducedMotion: false, showCardNames: true }, ...patch });
function context(state: ClientView, extra: Partial<BuildContext> = {}) {
  const sent: unknown[] = [], ctx: BuildContext = { state, ui: htmlUiLocal(), ids: new Ids(), send: c => { sent.push(c); }, rerender: vi.fn(), ...extra };
  const find = (key: string) => htmlWindows(ctx).flatMap(s => [...s.handlers.values()]).find(h => h.key === key);
  return { ctx, sent, find, windows: () => htmlWindows(ctx) };
}
describe("main's HTML UI windows built from the rewrite's state", () => {
  it('Select Player: a row per slot, Create Player opens the name dialog over nothing else, OK creates', () => {
    const t = context(view({ scene: 'characters', characters: [{ slot: 1, name: 'Alice', level: 3 }] }));
    const select = t.windows()[0]!.win, rows = select.controls.filter(c => c.name === 'プレイヤ選択ボタン').sort((a, b) => a.y - b.y);
    expect(rows.map(r => r.label)).toEqual(['Create Player', 'Alice', 'Create Player', 'Create Player']);
    expect(select.controls.filter(c => c.name === 'プレイヤ選択ボタンのLV表示文字' && c.shown).map(c => c.text)).toEqual(['Lv03']);
    t.find('character-slot:1')!.click!(); expect(t.sent).toEqual([{ type: 'selectCharacter', slot: 1 }]);
    t.find('character-create:0')!.click!();
    expect(t.windows().map(s => s.win.cls)).toEqual(['CWindowModelInput1']);
    t.find('character-name')!.text!('Bob Duelist'); t.find('character-create-ok')!.click!();
    // the original's first dressing (Change Avatar, main's screens/avatar.js): a body, a hair, Confirm sends the look
    expect(t.windows().map(s => s.win.cls)).toEqual(['CWindowDialogAvatarSwitch']);
    t.find('avatar-item:0:1')!.click!(); t.find('avatar-category:1')!.click!(); t.find('avatar-item:1:2')!.click!();
    t.find('avatar-confirm')!.click!();
    expect(t.sent.at(-1)).toEqual({ type: 'createCharacter', slot: 0, name: 'Bob Duelist', appearance: [1, 2, 32, 48, 64, 96, 0x80, 144, 176, 32, 0, 0, 0, 0, 0, 0] });
    t.find('character-delete:1')!.click!();
    expect(t.windows().map(s => s.win.cls)).toEqual(['CWindowModelInput1']);
    t.find('character-delete-password')!.text!('secret'); t.find('character-delete-password-ok')!.click!();
    t.find('character-delete-yes')!.click!();
    expect(t.sent.at(-1)).toEqual({ type: 'deleteCharacter', slot: 1 });
  });
  it('chat: a log per tab (All Chat has every line), Enter sends on the tab\'s channel, /w whispers', () => {
    const lobby = { name: 'Duel Academy · Area 1', avatars: [], connected: true, channels: ['global'], chat: [{ id: '1', sender: 'A', text: 'hi', channel: 'global' }, { id: '2', sender: 'B', text: 'wts', channel: 'trade' }] };
    const t = context(view({ scene: 'lobby', lobby }));
    const chat = t.windows().find(s => s.win.cls === 'CChatWindow')!.win, logs = chat.controls.filter(c => c.cls === 'CWindowTaskTextlist');
    expect(logs.map(l => l.items)).toEqual([['@0A:hi', '@0B:wts'], ['@0B:wts'], [], ['@0No open duels. Create Duel opens one anyone here may join.']]);
    expect(chat.controls.filter(c => c.cls === 'CWindowTaskTab').map(c => c.label)).toEqual(['All Chat', 'TRADE', 'Team ', 'Duels']);
    t.find('chat-tab:trade')!.click!(); t.find('chat')!.text!('selling'); t.find('chat')!.enter!();
    expect(t.sent.at(-1)).toEqual({ type: 'chat', channel: 'trade', text: 'selling' });
    expect(chatCommand(0, '/w Bob  hello there')).toEqual({ type: 'chat', channel: 'whisper', target: 'Bob', text: 'hello there' });
    expect(chatCommand(0, '/w Ann Lee psst', ['Ann', 'Ann Lee'])).toEqual({ type: 'chat', channel: 'whisper', target: 'Ann Lee', text: 'psst' });
    expect(chatCommand(0, '/w "Ann Lee" psst')).toEqual({ type: 'chat', channel: 'whisper', target: 'Ann Lee', text: 'psst' });
  });
  it('profile: main\'s rows with the server\'s values; one\'s own comment saved line by line', () => {
    const profileDetail = { selfPid: 7, selectedPid: 7, details: { tp: 2, score: 30, mp: 5000 } as never, location: null, summary: { name: 'Me', level: 4, wins: 3, losses: 1 } as never,
      comments: ['hello', null] as [string, null], drafts: { playerId: '', comment: '', title: '' }, loading: false, pending: null, status: '', error: null };
    const t = context(view({ scene: 'lobby', profileDetail, lobby: { name: 'A · B', avatars: [], connected: true, channels: [], chat: [] } }));
    const win = t.windows().find(s => s.win.cls === 'CWindowModelProfile')!.win;
    // main's control names (social.js profileLevel: the LV row's value is where the rank goes), its value 16 below
    const item = (name: string) => win.controls.find(c => c.text === name && c.name === 'プロフィールウィンドウの項目名')!;
    const value = (name: string) => win.controls.find(c => c.name === 'プロフィールウィンドウの項目の数値' && c.y === item(name).y + 16)?.text;
    expect(value('Win%')).toBe('75.00%');
    expect(value('Miles')).toBe('5000');
    expect(value('LV')).toBe('4');
    t.ctx.ui.comment = ['hello', 'Duelist']; t.find('comment-ok')!.click!();
    expect(t.sent).toEqual([{ type: 'profileAction', action: { type: 'editDraft', field: 'title', value: 'Duelist' } }, { type: 'profileAction', action: { type: 'saveComment', line: 1 } }]);
  });
  it('a player: the list of the others here, their card with the actions the rewrite has', () => {
    const lobby = { name: 'A · B', avatars: [{ id: 7, name: 'Me', x: 0, y: 0, self: true }, { id: 9, name: 'Ann Lee', x: 0, y: 0 }], connected: true, channels: [], chat: [] };
    const profileDetail = { selfPid: 7, selectedPid: 9, details: null, location: null, summary: { name: 'Ann Lee', level: 3, wins: 2, losses: 1 } as never,
      comments: ['hi', 'Champ'] as [string, string], drafts: { playerId: '', comment: '', title: '' }, loading: false, pending: null, status: '', error: null };
    const opened: number[] = [], acted: string[] = [];
    const t = context(view({ scene: 'lobby', lobby, profileDetail }), { openPlayer: pid => opened.push(pid), cardActions: { friend: () => acted.push('friend'), duel: () => acted.push('duel') } });
    const wins = t.windows(), list = wins.find(s => s.win.cls === 'CPlayerListDlg')!.win.controls.find(c => c.cls === 'CWindowTaskActiveListbox' && !c.parent)!;
    expect(list.items).toEqual(['@0@>40/Ann Lee']);
    const plist = wins.find(s => s.win.cls === 'CPlayerListDlg')!; [...plist.handlers.values()][0]!.click!([40, plist.win.y + list.y + 8]); expect(opened).toEqual([9]);
    const card = wins.find(s => s.win.cls === 'CPlayerListMenu')!.win;
    expect(card.controls.filter(c => c.cls === 'CWindowTaskTextSwitch' && c.shown).map(c => c.label)).toEqual(['Send Duel Request', 'Send Friend Request']);
    expect(card.controls.some(c => c.cls === 'CWindowTaskText' && String(c.text).includes('LV03  Ann Lee'))).toBe(true);
    expect(card.pid).toBe(9);   // main's lobby.js cardRank asks GET /api/de/rank?pid= for it
    t.find('card-friend')!.click!(); expect(acted).toEqual(['friend']);
    expect(wins.some(s => s.win.cls === 'CWindowModelProfile')).toBe(false);
  });
  it('the Main Menu\'s lists and D-Mail: rows from the social state, a row chosen, its command', () => {
    const calls: string[] = [];
    const social = { friends: [{ pid: 2, name: 'Bo' }], ignored: [{ pid: 3, name: 'Cy' }], team: null,
      unignore: (pid: number) => calls.push(`unignore ${pid}`), formTeam: (n: string) => calls.push(`team ${n}`), leaveTeam: () => {}, disbandTeam: () => {} };
    const mailBox = { mail: [{ from: 'Bo', fromPid: 2, subject: 'Hi', body: 'Duel later?' }], send: (pid: number, subject: string, body: string) => calls.push(`mail ${pid} ${subject} ${body}`) };
    const t = context(view({ scene: 'lobby' }), { social, mailBox });
    t.ctx.ui.lists = { kind: 'ignore', selected: -1 };
    const win = () => t.windows().find(s => s.win.cls === 'CWindowModelBlacklist')!;
    expect(win().win.controls.find(c => c.cls === 'CWindowTaskListbox')!.items).toEqual(['Cy']);
    [...win().handlers.values()].find(h => h.label === 'Ignore List')!.click!([100, 282 + 32 + 8]);
    t.find('list-remove')!.click!(); expect(calls).toEqual(['unignore 3']);
    t.ctx.ui.lists = { kind: 'team', selected: -1 }; t.find('team-form')!.click!(); t.find('team-name')!.text!('Aces'); t.find('team-name-ok')!.click!();
    expect(calls.at(-1)).toBe('team Aces');
    t.ctx.ui.mail = { top: 0, selected: -1 }; t.find('mail-row:0')!.click!();
    expect(t.windows().find(s => s.win.cls === 'CWindowModelDMail')!.win.controls.find(c => c.name === 'body')!.text).toBe('Duel later?');
    t.find('mail-reply')!.click!(); t.find('compose-subject')!.text!('Re: Hi'); t.find('compose-body')!.text!('Sure'); t.find('compose-send')!.click!();
    expect(calls.at(-1)).toBe('mail 2 Re: Hi Sure');
  });
  it('the Friend List shows each friend online and where, or Offline, in the Team List\'s row columns', () => {
    const social: Record<string, unknown> = { friends: [{ pid: 2, name: 'Bo', online: true, place: 'Domino City' }, { pid: 3, name: 'C@t', online: false }, { pid: 4, name: 'Di' }], ignored: [], team: null,
      unignore: () => {}, formTeam: () => {}, leaveTeam: () => {}, disbandTeam: () => {}, removeFriend: () => {} };
    const t = context(view({ scene: 'lobby' }), { social: social as never });
    t.ctx.ui.lists = { kind: 'friends', selected: 0 };
    const items = t.windows().find(s => s.win.cls === 'CWindowModelFriendlist')!.win.controls.find(c => c.cls === 'CWindowTaskListbox')!.items;
    expect(items).toEqual(['> @>16/Bo@>230/Domino City', '@>16/C@@t@>230/Offline', 'Di']);
  });
  it('Find a Player (FriendEnum), Ignore by name (BlacklistInput) and the team confirmations: the old Friends & Mail page\'s functions', () => {
    const calls: string[] = [];
    const social: Record<string, unknown> = { friends: [{ pid: 2, name: 'Bo' }], ignored: [], team: { name: 'Aces', members: [{ pid: 7, name: 'Me' }], leader: false }, lookup: null, error: null,
      offers: [{ pid: 5, name: 'Di', level: 4 }], teamInvites: [], canTrade: true,
      unignore: () => {}, formTeam: () => {}, leaveTeam: () => calls.push('leave'), disbandTeam: () => calls.push('disband'), removeFriend: () => {},
      find: (n: string) => calls.push(`find ${n}`), inviteFriend: (pid: number) => calls.push(`friend ${pid}`), replyFriend: (pid: number, a: boolean) => calls.push(`reply ${pid} ${a}`),
      inviteTeam: (pid: number) => calls.push(`team ${pid}`), inviteTrade: (pid: number, n: string) => calls.push(`trade ${pid} ${n}`), ignore: (pid: number) => calls.push(`ignore ${pid}`),
      duel: (pid: number) => calls.push(`duel ${pid}`) };
    const mailBox = { mail: [], send: () => {}, delete: () => {} };
    const t = context(view({ scene: 'lobby' }), { social: social as never, mailBox });
    // the Friend List opens it; a name is searched, the found player acted on
    t.ctx.ui.lists = { kind: 'friends', selected: -1 }; t.find('list-find')!.click!();
    expect(t.windows().some(s => s.win.cls === 'CWindowModelFriendEnum')).toBe(true);
    t.find('find-name')!.text!('Rival'); t.find('find-search')!.click!(); expect(calls.at(-1)).toBe('find Rival');
    social.lookup = { name: 'Rival', pid: 1004 };
    const enumWin = t.windows().find(s => s.win.cls === 'CWindowModelFriendEnum')!.win;
    expect(enumWin.controls.find(c => c.name === 'result')!.text).toBe('Rival (ID 1004)');
    for (const k of ['find-friend', 'find-team', 'find-trade', 'find-duel', 'find-ignore']) t.find(k)!.click!();
    expect(calls.slice(-5)).toEqual(['friend 1004', 'team 1004', 'trade 1004 Rival', 'duel 1004', 'ignore 1004']);
    t.find('find-offer:5')!.click!(); t.find('find-accept')!.click!(); expect(calls.at(-1)).toBe('reply 5 true');
    t.find('find-mail')!.click!(); expect(t.ctx.ui.compose).toMatchObject({ toPid: 1004, toName: 'Rival' }); expect(t.ctx.ui.find).toBe(null);
    // Ignore List: Add by Name looks the name up, then ignores that player
    t.ctx.ui.lists = { kind: 'ignore', selected: -1 }; t.find('list-add')!.click!(); t.ctx.ui.lists = null;
    t.find('ignore-name')!.text!('Zed'); t.find('ignore-name-ok')!.click!(); expect(calls.at(-1)).toBe('find Zed');
    social.lookup = { name: 'Zed', pid: 77 }; t.windows(); expect(calls.at(-1)).toBe('ignore 77'); expect(t.ctx.ui.ignoreInput).toBe(null);
    // Leave Team asks first (main's YesNo)
    t.ctx.ui.compose = null; t.ctx.ui.lists = { kind: 'team', selected: -1 }; t.find('team-leave')!.click!(); expect(calls.at(-1)).not.toBe('leave');
    t.find('team-leave-yes')!.click!(); expect(calls.at(-1)).toBe('leave');
  });
  it('pointer: the hover and pressed looks go to the control whose element the pointer is on (no hit test by position)', () => {
    const t = context(view({ scene: 'characters' })), specs = t.windows();
    const back = specs.flatMap(s => s.win.controls).find(c => c.label === 'Back')!;
    expect(specs.some(s => s.handlers.get(back.id)?.hover && s.handlers.get(back.id)?.click)).toBe(true);
    applyPointer(specs, back.id, 0); expect(back.state).toBe('hover');
    applyPointer(specs, back.id, back.id); expect(back.state).toBe('pressed');
    applyPointer(specs, 0, 0); expect(back.state).toBe('normal');
  });
});
