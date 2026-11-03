// Shared public-chat policy: no proximity channel and no private/team speech bubbles.
export const CHAT_CHANNELS = [
  { id: 'global', label: 'Global' }, { id: 'trade', label: 'Trade' },
  { id: 'whisper', label: 'Whisper' }, { id: 'team', label: 'Team' },
];
export const isPublicSpeech = message => message?.channel === 'global' || message?.channel === 'trade';
export function bubbleMessages(messages, now = Date.now(), ttl = 6500) {
  const newest = new Map();
  for (const m of messages) if (isPublicSpeech(m) && Number.isSafeInteger(m.pid) && m.at <= now && now - m.at < ttl) newest.set(m.pid, m);
  return [...newest.values()].slice(-24);
}
export function visibleMessages(messages, channel) {
  return messages.filter(m => m.channel === channel);
}
