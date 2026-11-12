import { describe, expect, it } from 'vitest';
import { CHAT_TABS, chatCommand } from '../src/ui/htmlui/windows';

// server/src/game/chat.ts CHAT_TAB: global 0, trade 2, whisper 3, team 5; lobby.ts sends a refused line's "Notice" in
// the tab it was typed in (pid 0, that tab's channel)
describe('chat tabs follow the server protocol', () => {
  it('has no Proximity tab', () => {
    expect(CHAT_TABS.map(t => t.key)).toEqual(['all', 'trade', 'team', 'duels']);
    expect(CHAT_TABS.some(t => /proximity/i.test(t.label))).toBe(false);
  });
  it('a Notice on a channel shows in that channel\'s tab and in All Chat', () => {
    const shows = (channel: string) => CHAT_TABS.filter(t => t.shows(channel)).map(t => t.key);
    expect(shows('team')).toEqual(['all', 'team']);
    expect(shows('trade')).toEqual(['all', 'trade']);
    expect(shows('whisper')).toEqual(['all']);
    expect(shows('global')).toEqual(['all']);
  });
  it('a tab sends on its channel; /w whispers from any tab', () => {
    expect(chatCommand(0, 'hi')).toEqual({ type: 'chat', channel: 'global', text: 'hi' });
    expect(chatCommand(1, 'wts')).toEqual({ type: 'chat', channel: 'trade', text: 'wts' });
    expect(chatCommand(2, 'go')).toEqual({ type: 'chat', channel: 'team', text: 'go' });
    expect(chatCommand(2, '/w "Ann Lee" hey')).toEqual({ type: 'chat', channel: 'whisper', target: 'Ann Lee', text: 'hey' });
  });
});

describe('Discord lines keep their mark', async () => {
  const { latin1 } = await import('../src/network/codec');
  it('a 0x4402 sender name starting with DISCORD_MARK (0xA4, server chat.ts) decodes to the U+00A4 main\'s chat.js draws as the logo', () => {
    const name = latin1(Uint8Array.of(0xa4, 0x41, 0x6e, 0x6e, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0));
    expect(name.startsWith('¤Ann')).toBe(true);
  });
});

describe('the duel scene\'s chat (live: an NPC duel the lobby\'s tabs, a duel between players "Duel (n.)" too)', async () => {
  const { CHAT_TABS, chatTabsFor } = await import('../src/ui/htmlui/windows');
  it('keeps All Chat / TRADE / Team / Duels; the Duel Log lines stay off All Chat', () => {
    expect(CHAT_TABS.map(t => t.key)).toEqual(['all', 'trade', 'team', 'duels']);
    expect(CHAT_TABS[0]!.shows('duel-log')).toBe(false);
  });
  it('adds "Duel (n.)" between Trade and Team for a duel between players, the two duelists\' own lines', () => {
    const tabs = chatTabsFor(null, ['Ann', 'Bob']);
    expect([...tabs].sort((a, b) => a.x - b.x).map(t => t.label.trim())).toEqual(['All Chat', 'TRADE', 'Duel (n.)', 'Team', 'Duels']);
    const duel = tabs.find(t => t.key === 'duel')!;
    expect(duel.shows('global', 'Ann')).toBe(true); expect(duel.shows('global', 'Cid')).toBe(false); expect(duel.shows('trade', 'Ann')).toBe(false);
  });
});

describe('the trade\'s chat tab (live: "Trade Partner" between Trade and Team)', async () => {
  const { chatTabsFor, CHAT_TABS } = await import('../src/ui/htmlui/windows');
  it('is added in a trade only, after the lobby tab indexes, and shows the partner\'s whispers', () => {
    expect(chatTabsFor(null)).toBe(CHAT_TABS);
    const tabs = chatTabsFor('Sr1100');
    expect(tabs.map(t => t.key)).toEqual(['all', 'trade', 'team', 'duels', 'partner']);
    expect([...tabs].sort((a, b) => a.x - b.x).map(t => [t.label.trim(), 248 + t.x])).toEqual([['All Chat', 256], ['TRADE', 329], ['Trade Partner', 393], ['Team', 511], ['Duels', 575]]);
    const partner = tabs[4]!;
    expect(partner.shows('whisper', 'Sr1100')).toBe(true); expect(partner.shows('whisper', 'Bob')).toBe(false); expect(partner.shows('global', 'Sr1100')).toBe(false);
    expect(partner.target).toBe('Sr1100');
  });
});

// yo2WindowChat.cpp: the first tab at z = count, each next one 1 lower, the current one count + 2; main's chat.js draws
// the controls back to front in array order (live's read.js sorts them by that z), and bb0c7de: the Duels tab under
// the last game tab unless it is the current one
describe('the chat\'s tabs stack as the game stacks them', async () => {
  const { stackChatTabs } = await import('../src/ui/htmlui/windows');
  const strip = (current: number, xs = CHAT_TABS.map(t => t.x)) => {
    const controls = [{ cls: 'CWindowTaskIconbar', name: 'bar' }, ...xs.flatMap((x, i) => [
      { cls: 'CWindowTaskTab', name: `tab${i}`, x, active: i === current }, { cls: 'CWindowTaskTextlist', name: `log${i}` }]), { cls: 'CWindowTaskInput', name: 'input' }]
      .map((c, z) => ({ id: z, parent: 0, y: 0, w: 72, h: 24, z, x: 0, alpha: 1, shown: true, enabled: true, focused: false, ...c }));
    stackChatTabs(controls as never);
    return controls;
  };
  const tabOrder = (current: number, xs?: number[]) => strip(current, xs).filter(c => c.cls === 'CWindowTaskTab').map(c => c.name);
  it('each tab over the one to its right, the current one over both neighbours (back to front)', () => {
    expect(tabOrder(0)).toEqual(['tab3', 'tab2', 'tab1', 'tab0']);
    expect(tabOrder(1)).toEqual(['tab3', 'tab2', 'tab0', 'tab1']);
    expect(tabOrder(2)).toEqual(['tab3', 'tab1', 'tab0', 'tab2']);
  });
  it('the Duels tab lies under Team unless it is the current one', () => {
    expect(tabOrder(0)[0]).toBe('tab3');
    expect(tabOrder(3).at(-1)).toBe('tab3');
  });
  it('the tabs keep the slots the tabs had: logs and the rest stay where they were', () => {
    const c = strip(1);
    expect(c.map(k => k.cls === 'CWindowTaskTab' ? 'T' : k.name)).toEqual(['bar', 'T', 'log0', 'T', 'log1', 'T', 'log2', 'T', 'log3', 'input']);
  });
});
