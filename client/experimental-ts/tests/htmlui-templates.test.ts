import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { slim, TEMPLATES } from '../tools/htmlui-templates.mjs';
import type { WindowSpec } from '../src/ui/htmlui/snapshot';
import type { ClientView } from '../src/ui/contracts';

// src/ui/htmlui/templates/*.json: main's captures (client/web-shell/htmlui/mock) cut to what the windows read
// (tools/htmlui-templates.mjs). The windows built from them must be the windows built from the captures themselves.
const capture = (name: string) => JSON.parse(readFileSync(new URL(`../../web-shell/htmlui/mock/${name}.json`, import.meta.url), 'utf8'));
const template = (name: string) => JSON.parse(readFileSync(new URL(`../src/ui/htmlui/templates/${name}.json`, import.meta.url), 'utf8'));

/** Every window the templates feed, in a few states each, as the snapshots main's renderer draws (undefined fields
 * kept: a renderer can tell a missing field from an undefined one). */
async function build(): Promise<string> {
  const { Ids } = await import('../src/ui/htmlui/snapshot');
  const W = await import('../src/ui/htmlui/windows'), L = await import('../src/ui/htmlui/lobby'), O = await import('../src/ui/htmlui/options');
  const state = {
    scene: 'lobby', busy: false, mode: 'world', connection: 'online', settings: { sound: 1, music: 1, reducedMotion: false, showCardNames: true },
    player: { id: 1, name: 'Ann' }, characters: [{ slot: 0, name: 'Ann', level: 3 }, { slot: 2, name: 'Bob', level: 12 }],
    lobby: { name: 'Duel Academy', connected: true, chat: [], channels: [], avatars: [{ id: 1, name: 'Ann', self: true, x: 10, y: 10 }, { id: 2, name: 'Cy', x: 20, y: 20 }],
      rooms: [{ id: 7, owner: 2, style: 3 }], npcs: [{ id: 51, name: 'Yami Yugi' }], areas: [{ area: 3, block: 1, kind: 0, population: 2 }, { area: 5, block: 2, kind: 1, population: 9 }] },
    profileDetail: { selfPid: 1, selectedPid: 2, summary: { name: 'Cy', level: 4, wins: 3, losses: 1 }, details: null, comments: ['Hi', ''], pending: null },
  } as unknown as ClientView;
  const out: unknown[] = [];
  const ctx = (patch: Record<string, unknown> = {}, ui: Record<string, unknown> = {}) => ({ state: { ...state, ...patch } as ClientView, ui: { ...W.htmlUiLocal(), ...ui }, ids: new Ids(), send: () => {}, rerender: () => {} });
  const push = (s: WindowSpec | WindowSpec[] | null | undefined) => { for (const x of [s ?? []].flat()) out.push({ win: x.win, keys: [...x.handlers.values()].map(h => h.key ?? '') }); };
  // Select Player (playerselect-live), its Create Player name (dialog-input1)
  push(W.playerSelect(ctx({ scene: 'characters' }))); push(W.playerSelect(ctx({ scene: 'characters', characters: [] })));
  push(W.htmlWindows(ctx({ scene: 'characters' }, { dialog: { kind: 'create', slot: 1, name: 'Dee' } })));
  // the player card (lobby-card): one, two and three keys, a trade sanction; a Discord duelist's card
  for (const actions of [{ friend: () => {} }, { trade: () => {}, friend: () => {} }, { duel: () => {}, trade: () => {}, friend: () => {}, whisper: () => {} }]) push(W.playerCard(ctx(), actions));
  push(W.playerCard(ctx({ sanctions: { chat: false, trade: true } }), { trade: () => {} }));
  push(W.discordCard(ctx(), { pid: 9, name: 'Dis', lv: 7 } as Parameters<typeof W.discordCard>[1]));
  // the stock dialogs (dialog-yesno, dialog-ok, dialog-error)
  for (const kind of ['yesno', 'ok', 'error'] as const) push(W.stockDialog({ ids: new Ids() }, `d-${kind}`, kind, 'A message long enough to wrap onto a second line of the dialog box.', [{ from: kind === 'yesno' ? 'Yes' : 'OK', key: 'k', click: () => {} }]));
  // the lobby's windows: the Duel menu, Auto Duel, Create Duel, Move (duelsetup-*), the search (findmenu), Join
  // (dialog-input1), the cancel prompt (dialog-yesno)
  for (const open of ['duel', 'find', 'wait', 'move'] as const) push(L.lobbyWindows(ctx(), { ui: { ...L.lobbyLocal(), open }, friends: [] }));
  push(L.lobbyWindows(ctx(), { ui: { ...L.lobbyLocal(), searching: true }, friends: [] }));
  push(L.lobbyWindows(ctx(), { ui: { ...L.lobbyLocal(), join: { roomId: 7, password: '' } }, friends: [] }));
  // the player list (duelsetup-plist): the lobby's and the plain one, and the windows of the lobby's HTML layer
  push(L.lobbyList(ctx(), { ui: L.lobbyLocal(), friends: [] }, () => {})); push(L.lobbyList(ctx(), { ui: { ...L.lobbyLocal(), search: 'all' }, friends: [] }, () => {}));
  push(W.playerList(ctx(), () => {}));
  push(W.htmlWindows(ctx()));
  // DUEL OPTIONS (duelsetup-config), its choices hovered
  for (const hover of [null, 'track-off', 'act-1']) push(O.duelConfigWindow(new Ids(), { kind: 'options', hover }, { settings: state.settings, set: () => {}, close: () => {}, rerender: () => {} }));
  return JSON.stringify(out, (_k, v) => v === undefined ? '«undefined»' : v);
}

afterEach(() => { vi.resetModules(); for (const name of TEMPLATES) vi.doUnmock(`../src/ui/htmlui/templates/${name}.json`); });

describe('the htmlui templates (main\'s captures cut to what the windows read)', () => {
  it('are current: tools/htmlui-templates.mjs writes them from main\'s captures as committed', () => {
    for (const name of TEMPLATES) expect(template(name), name).toEqual(slim(name, capture(name)));
  });
  it('are smaller than the captures', () => {
    const size = (o: unknown) => JSON.stringify(o).length;
    const before = TEMPLATES.reduce((n, t) => n + size(capture(t)), 0), after = TEMPLATES.reduce((n, t) => n + size(template(t)), 0);
    expect(after).toBeLessThan(before * 0.7);
  });
  it('build the very windows the captures build', async () => {
    const slimmed = await build();
    vi.resetModules();
    for (const name of TEMPLATES) vi.doMock(`../src/ui/htmlui/templates/${name}.json`, () => ({ default: capture(name) }));
    const captured = await build();
    // every template's window is among them
    for (const name of TEMPLATES) expect(slimmed, name).toContain(`"cls":"${capture(name).windows[0].cls}"`);
    expect(slimmed).toBe(captured);
  });
});
