import { describe, expect, it, vi } from 'vitest';
import { Ids } from '../src/ui/htmlui/snapshot';
import { BUST_AT, DISCORD_ONLINE, discordCard, htmlUiLocal, htmlWindows } from '../src/ui/htmlui/windows';
import type { BuildContext } from '../src/ui/htmlui/windows';
import { changeAvatarAction } from '../src/ui/htmlui/avatar';
import { avatarPartName, challengeRightName, giftItemName } from '../src/npcs/gift-names';
import { RecipeCatalog } from '../src/recipes';
import type { ClientView } from '../src/ui/contracts';

const view = (patch: Partial<ClientView>): ClientView => ({ scene: 'lobby', connection: 'online', status: '', player: null, characters: [], deckEditor: null, shop: null, duel: null, social: null,
  lobby: { name: 'A · B', avatars: [], connected: true, channels: [], chat: [] }, settings: { sound: 1, music: 1, reducedMotion: false, showCardNames: true }, ...patch } as ClientView);
const duelist = { pid: 1234, name: 'Yugi', lv: 7, rank: { label: 'Gold II' }, parts: [0, 1, 32, 48, 64, 96, 128, 144, 176, 32, 0, 0, 0, 0, 0, 0] };

describe('a Discord duelist\'s card (live 4fe1425 / 2020bff)', () => {
  it('is the game\'s player card: LV and name, Status / online on Discord, Close; no duel offered', () => {
    const ui = htmlUiLocal(), rerender = vi.fn(), ctx: BuildContext = { state: view({}), ui, ids: new Ids(), send: () => {}, rerender };
    ui.discordCard = duelist;
    const spec = htmlWindows(ctx).find(s => s.win.cls === 'CPlayerListMenu')!;
    expect(spec).toBeTruthy();
    const w = spec.win, texts = w.controls.filter(c => c.shown && typeof c.text === 'string' && c.text).map(c => c.text);
    expect(texts).toContain('LV07  Yugi\n'); expect(texts).toContain('Status'); expect(texts.some(t => String(t).includes(DISCORD_ONLINE))).toBe(true);
    expect(w).toMatchObject({ x: 248, y: 608 - 1 - w.h, pid: 1234 });
    const keys = [...spec.handlers.values()].map(h => h.key);
    expect(keys).toEqual(['discord-card-close']);
    expect(w.controls.filter(c => c.cls === 'CWindowTaskTextSwitch' && c.shown).length).toBe(1);
    [...spec.handlers.values()][0]!.click!();
    expect(ui.discordCard).toBeNull(); expect(rerender).toHaveBeenCalled();
    expect(typeof spec.after).toBe('function');
  });
  it('gives way to another player\'s card, and closes off the lobby', () => {
    const ui = htmlUiLocal(); ui.discordCard = duelist;
    htmlWindows({ state: view({ scene: 'deck' }), ui, ids: new Ids(), send: () => {}, rerender: () => {} });
    expect(ui.discordCard).toBeNull();
  });
  it('the bust stands where live draws it', () => {
    expect(BUST_AT).toEqual({ x: 530, y: 0, size: 768 });
    expect(discordCard({ state: view({}), ui: htmlUiLocal(), ids: new Ids(), send: () => {}, rerender: () => {} }, duelist).win.cls).toBe('CPlayerListMenu');
  });
});

describe('Change Avatar from the game: Confirm', () => {
  const look = [1, 2, 32, 48, 64, 96, 128, 144, 176, 32, 0, 0, 0, 1, 2, 3];
  it('a body change sends the body and the whole look in one call (the other picks kept)', () => {
    expect(changeAvatarAction(look, { gender: 'male', world: 1 })).toEqual({ type: 'appearance', world: 1, parts: look, gender: 'female' });
  });
  it('the same body sends the look alone', () => {
    expect(changeAvatarAction(look, { gender: 'female', world: 0 })).toEqual({ type: 'appearance', world: 0, parts: look });
    expect(changeAvatarAction(look, null)).toEqual({ type: 'appearance', world: 0, parts: look });
  });
});

describe('gifted item names', () => {
  const cosmetics = { catalog: [{ name: 'Afro', variants: [{ bit: 300, gender: 'male', number: 11, worlds: [0, 1] }, { bit: 600, gender: 'female', number: 6, worlds: [0, 1], name: 'Afro (Large)' }] }],
    inventory: [], freeItems: [] } as never;
  it('names titles, challenge rights, recipes and avatar parts', () => {
    expect(giftItemName(229)).toBe('GUNSLINGER');
    expect(giftItemName(592)).toBe(challengeRightName(592)); expect(giftItemName(594)).toContain('Yami Marik');
    expect(giftItemName(700, { recipeName: b => b === 700 ? 'Warrior Recipe' : undefined })).toBe('Warrior Recipe');
    expect(giftItemName(300, { cosmetics })).toBe('Afro'); expect(avatarPartName(600, cosmetics)).toBe('Afro (Large)');
    expect(giftItemName(9000, { cosmetics })).toBeNull();
  });
  it('the recipe catalogue names a recipe by its bit', () => {
    const c = RecipeCatalog.fromJSON({ version: 1, deckSource: 'original-ydc', recipes: [{ id: '1', name: 'Dragon Deck', recipeBit: 547, main: [], side: [], extra: [] }] });
    expect(c.nameOfBit(547)).toBe('Dragon Deck'); expect(c.nameOfBit(548)).toBeUndefined();
  });
});
