import { describe, expect, it } from 'vitest';
import { CHAT_TABS, chatCommand } from '../src/ui/htmlui/windows';

// server/src/game/chat.ts CHAT_TAB: global 0, trade 2, whisper 3, team 5; lobby.ts sends a refused line's "Notice" in
// the tab it was typed in (pid 0, that tab's channel)
describe('chat tabs follow the server protocol', () => {
  it('has no Proximity tab', () => {
    expect(CHAT_TABS.map(t => t.key)).toEqual(['all', 'trade', 'team']);
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
