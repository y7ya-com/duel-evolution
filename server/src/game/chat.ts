// One server-wide chat stream for native clients and the HTML room chat. Private audiences are decided server-side.
import type { Game } from "./game.ts";
import type { Session } from "./hub.ts";
import { W } from "../net/proto.ts";
import { isFree } from "./freemode.ts";

export type ChatChannel = "global" | "trade" | "whisper" | "team";
export type ChatMessage = { id: number; at: number; channel: ChatChannel; pid: number; name: string; text: string; targetPid?: number };
type Stored = ChatMessage & { audience: Set<string> | null };
type Stream = { next: number; messages: Stored[]; requests: Map<string, { at: number; id: number }> };
const streams = new WeakMap<Game, Stream>();
const stream = (g: Game): Stream => { let s = streams.get(g); if (!s) streams.set(g, s = { next: 0, messages: [], requests: new Map() }); return s; };
export const CHAT_TAB: Record<ChatChannel, number> = { global: 0, trade: 2, whisper: 3, team: 5 };
export const channelFor = (kind: number): ChatChannel | null => kind === 0 || kind === 1 ? "global" : kind === 2 ? "trade" : kind === 3 ? "whisper" : kind === 5 ? "team" : null;
const sessionFor = (g: Game, user: string) => g.hub.sessions.get(g.hub.acctOfUser(user));
const online = (s: Session | undefined): s is Session => !!s && s.pid !== null && s.slot !== null && !!s.lobby && !s.lobby.closed && !isFree(s);
function ignores(g: Game, receiver: Session, pid: number): boolean {
  const p = g.store.peek().accounts?.[receiver.acct]?.profiles?.[String(receiver.slot ?? 0)];
  return (p?.black ?? []).includes(pid);
}
const plain = ({ audience: _audience, ...message }: Stored): ChatMessage => message;

export function sendChat(g: Game, sender: Session, channel: ChatChannel, text: string, targetPid?: number, requestId?: string): { ok: ChatMessage } | { error: string } {
  if (!online(sender) || g.restarting) return { error: "Join the online game before chatting." };
  if (g.admin.flagsOf(sender.acct) & 0x20) return { error: "Chat is disabled for this account." };
  if (!(Object.hasOwn(CHAT_TAB, channel)) || typeof text !== "string") return { error: "Invalid chat channel." };
  text = text.replace(/\0/g, "").trim();
  if (!text || new TextEncoder().encode(text).length > 128) return { error: "Messages must contain 1–128 bytes." };
  if (!g.isGm(sender.acct)) text = text.replace(/@\d/g, "");
  if (!text.trim()) return { error: "Enter a message." };
  const log = stream(g), now = Date.now();
  for (const [key, value] of log.requests) if (now - value.at > 60000) log.requests.delete(key);
  const requestKey = requestId && /^[\w-]{8,100}$/.test(requestId) ? `${sender.acct}:${requestId}` : null;
  if (requestId && !requestKey) return { error: "Invalid message request." };
  if (requestKey && log.requests.has(requestKey)) {
    const previous = log.messages.find(m => m.id === log.requests.get(requestKey)!.id);
    return previous ? { ok: plain(previous) } : { error: "Message already sent." };
  }
  let recipients: Session[];
  if (channel === "whisper") {
    const recipient = typeof targetPid === "number" ? g.hub.byPid(targetPid) : null;
    if (!recipient || !online(recipient)) return { error: "That player is not online." };
    recipients = [sender, recipient];
  } else if (channel === "team") {
    const team = g.eq?.teamChatTargets(sender) ?? [];
    const teamInfo = g.eq?.list5Body(sender);
    if (!teamInfo || new DataView(teamInfo.buffer, teamInfo.byteOffset, teamInfo.byteLength).getUint32(0) === 0) return { error: "You are not in a team. Form one or accept an invite: Main Menu > Team List." };
    recipients = [sender, ...team];
  } else recipients = [...g.hub.sessions.values()].filter(online);
  recipients = [...new Set(recipients)].filter(s => online(s) && (s === sender || !ignores(g, s, sender.pid!)));
  const message: Stored = { id: ++log.next, at: now, channel, pid: sender.pid!, name: sender.name || "Duelist", text,
    ...(channel === "whisper" && { targetPid }), audience: new Set(recipients.map(s => s.acct)) };
  log.messages.push(message); if (log.messages.length > 300) log.messages.shift();
  if (requestKey) log.requests.set(requestKey, { at: now, id: message.id });
  while (log.requests.size > 1000) log.requests.delete(log.requests.keys().next().value!);
  // Every client gets the same canonical channel. Channel1 no longer means proximity.
  const wire = new W().u8(0).u8(CHAT_TAB[channel]).u32(sender.pid!).u32(2).s(message.name, 16).s([...text].map(c => c.charCodeAt(0) > 255 ? "?" : c).join(""), [...text].length).u8(0).bytes();
  for (const s of recipients) s.lobby!.post(0x4402, wire);
  if (channel === "global") g.discord?.chatOut(message.name, text, sender.lobby?.userId ?? null);   // All Chat is Discord's #general too
  return { ok: plain(message) };
}

/** The name for a line from a Discord account with no game account (the text is "<their Discord name>: ..."). */
export const DISCORD_NAME = "Discord";
/** The first character of a Discord line's sender name on the wire: Latin-1 ¤, which no duelist name can hold (names.ts).
 *  The HTML chat draws it as the Discord logo (htmlui screens/chat.js discordLine). */
export const DISCORD_MARK = "\xa4";
/** A #general line into All Chat (discord/bridge.ts) to everyone online, in the HTTP feed too: under `name` (marked on the
 *  wire: DISCORD_MARK) from `pid`
 *  (the speaker's game character when their Discord is linked, bridge.ts speaker), on the wire's `channel`. A receiver
 *  who ignores that pid doesn't get it. The text is already Latin-1 and short (bridge.ts gameText / gameLines). */
export function relayIn(g: Game, from: { name: string; pid: number; text: string; channel?: number }): ChatMessage | null {
  if (g.restarting) return null;
  const recipients = [...g.hub.sessions.values()].filter(s => online(s) && !(from.pid && ignores(g, s, from.pid)));
  const log = stream(g);
  const message: Stored = { id: ++log.next, at: Date.now(), channel: "global", pid: from.pid, name: from.name, text: from.text,
    audience: new Set(recipients.map(s => s.acct)) };
  log.messages.push(message); if (log.messages.length > 300) log.messages.shift();
  const wireName = (DISCORD_MARK + from.name).slice(0, 16);   // a 16-character name loses its last one
  const wire = new W().u8(0).u8(from.channel ?? CHAT_TAB.global).u32(from.pid).u32(2).s(wireName, 16).s(from.text, from.text.length).u8(0).bytes();
  for (const s of recipients) s.lobby!.post(0x4402, wire);
  return plain(message);
}

export function chatGet(g: Game, user: string, after: number = 0) {
  const session = sessionFor(g, user);
  if (!online(session)) return { error: "Join the online game before chatting." };
  const log = stream(g), reset = !Number.isSafeInteger(after) || after < 0 || after > log.next;
  const from = reset ? 0 : after;
  const messages = log.messages.filter(m => m.id > from && m.audience?.has(session.acct) && !ignores(g, session, m.pid)).slice(-100).map(plain);
  return { ok: { cursor: log.next, reset, pid: session.pid, name: session.name,
    players: [...g.hub.sessions.values()].filter(online).map(s => ({ pid: s.pid, name: s.name })), messages } };
}

export function chatSend(g: Game, user: string, body: unknown) {
  const session = sessionFor(g, user);
  if (!online(session)) return { error: "Join the online game before chatting." };
  const input = body as { channel?: unknown; text?: unknown; targetPid?: unknown; requestId?: unknown } | null;
  if (!input || typeof input.channel !== "string" || !(Object.hasOwn(CHAT_TAB, input.channel)) || typeof input.text !== "string"
    || (input.targetPid !== undefined && (!Number.isSafeInteger(input.targetPid) || Number(input.targetPid) < 0))
    || (input.requestId !== undefined && typeof input.requestId !== "string")) return { error: "Invalid chat message." };
  return sendChat(g, session, input.channel as ChatChannel, input.text, input.targetPid as number | undefined, input.requestId as string | undefined);
}
