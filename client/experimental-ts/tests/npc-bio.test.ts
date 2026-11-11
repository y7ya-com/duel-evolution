import { describe, expect, it } from 'vitest';
import { NpcDialogueCatalog, npcBioTextId } from '../src/npcs/dialogue';
import { NpcController } from '../src/features/npc';

describe('the NPC card text (CNpcListMenu::conditionText)', () => {
  it('maps three NPCs per text from 0x33 to 0x5f and none outside', () => {
    expect([0x32, 0x33, 0x35, 0x36, 0x5f, 0x60].map(npcBioTextId)).toEqual([undefined, 0x22c6, 0x22c6, 0x22c5, 0x22d5, undefined]);
  });
  it('reads the bios from the data and puts the NPC\'s on its talk', () => {
    const c = new NpcDialogueCatalog(); c.install({ version: 1, lines: {}, bios: { [0x22c6]: 'Synthetic bio' } });
    expect(c.bio(51)).toBe('Synthetic bio'); expect(c.bio(54)).toBeNull();
    expect(() => c.install({ version: 1, lines: {}, bios: { 1: 'x' } })).toThrow();
    const n = new NpcController({ send: () => {}, onStartDuel: () => {}, resolveBio: id => c.bio(id) });
    n.open({ id: 51, name: 'NPC' }, 0); expect(n.state.bio).toBe('Synthetic bio');
  });
});
