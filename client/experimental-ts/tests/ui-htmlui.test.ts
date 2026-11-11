import { describe, expect, it, vi } from 'vitest';
import { Ids, applyPointer, hitTest } from '../src/ui/htmlui/snapshot';
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
    expect(t.sent.at(-1)).toEqual({ type: 'createCharacter', slot: 0, name: 'Bob Duelist' });
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
    expect(chat.controls.filter(c => c.cls === 'CWindowTaskTab').map(c => c.label)).toEqual(['All Chat', 'TRADE', 'Team ']);
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
    const value = (name: string) => win.controls[win.controls.findIndex(c => c.text === name && c.name.startsWith('name')) + 0]?.name.replace('name', 'value');
    expect(win.controls.find(c => c.name === value('Win%'))?.text).toBe('75.00%');
    expect(win.controls.find(c => c.name === value('Miles'))?.text).toBe('5000');
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
  it('pointer: hover and pressed looks on the control under the pointer; a modal window takes the point', () => {
    const t = context(view({ scene: 'characters' })), specs = t.windows();
    const back = hitTest(specs, 448 + 380, 256 + 250)!; expect(back.label).toBe('Back');
    applyPointer(specs, back.id, 0); expect(back.state).toBe('hover');
    applyPointer(specs, back.id, back.id); expect(back.state).toBe('pressed');
    expect(hitTest(specs, 448 + 470, 256 + 5)).toBeNull();
  });
});
