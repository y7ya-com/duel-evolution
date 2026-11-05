// One server-wide chat stream for native clients and the HTML room chat. Private audiences are decided server-side.
import type { Game } from "./game.ts";
import { PID_BASE, type Session } from "./hub.ts";
import { W } from "../net/proto.ts";
import { isFree } from "./freemode.ts";
import * as PP from "./persist.ts";

export type ChatChannel = "global" | "trade" | "whisper" | "team";
export type ChatMessage = { id: number; at: number; channel: ChatChannel; pid: number; name: string; text: string; targetPid?: number };
type Stored = ChatMessage & { audience: Set<string> | null };
type Stream = { next: number; messages: Stored[]; requests: Map<string, { at: number; id: number }> };
const streams = new WeakMap<Game, Stream>();
const stream = (g: Game): Stream => { let s = streams.get(g); if (!s) streams.set(g, s = { next: 0, messages: [], requests: new Map() }); return s; };
const NUMBERS: Record<ChatChannel, number> = { global: 0, trade: 2, whisper: 3, team: 5 };
export const channelFor = (kind: number): ChatChannel | null => kind === 0 || kind === 1 ? "global" : kind === 2 ? "trade" : kind === 3 ? "whisper" : kind === 5 ? "team" : null;
const sessionFor = (g: Game, user: string) => g.hub.sessions.get(g.hub.acctOfUser(user));
const online = (s: Session | undefined): s is Session => !!s && s.pid !== null && s.slot !== null && !!s.lobby && !s.lobby.closed && !isFree(s);
/** Whether the character with pid `by` has `pid` on its Ignore List (hBlack); account 0 keeps its profiles at the root. */
export function ignores(g: Game, by: number | null, pid: number | null): boolean {
  if (by === null || pid === null || by < PID_BASE) return false;
  const st = g.store.peek(), idx = (by - PID_BASE) >> 2, slot = String((by - PID_BASE) & 3);
  const a: any = idx === 0 ? st : Object.values(st.accounts ?? {}).find((x: any) => x && PP.int(x.idx ?? 0) === idx);
  const l = a?.profiles?.[slot]?.black;
  return Array.isArray(l) && l.includes(pid);
}
const plain = ({ audience: _audience, ...message }: Stored): ChatMessage => message;

export function sendChat(g: Game, sender: Session, channel: ChatChannel, text: string, targetPid?: number, requestId?: string): { ok: ChatMessage } | { error: string } {
  if (!online(sender) || g.restarting) return { error: "Join the online game before chatting." };
  if (g.admin.flagsOf(sender.acct) & 0x20) return { error: "Chat is disabled for this account." };
  if (!(Object.hasOwn(NUMBERS, channel)) || typeof text !== "string") return { error: "Invalid chat channel." };
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
    if (!teamInfo || new DataView(teamInfo.buffer, teamInfo.byteOffset, teamInfo.byteLength).getUint32(0) === 0) return { error: "Join a team to use team chat." };
    recipients = [sender, ...team];
  } else recipients = [...g.hub.sessions.values()].filter(online);
  recipients = [...new Set(recipients)].filter(s => online(s) && (s === sender || !ignores(g, s.pid, sender.pid)));
  const message: Stored = { id: ++log.next, at: now, channel, pid: sender.pid!, name: sender.name || "Duelist", text,
    ...(channel === "whisper" && { targetPid }), audience: new Set(recipients.map(s => s.acct)) };
  log.messages.push(message); if (log.messages.length > 300) log.messages.shift();
  if (requestKey) log.requests.set(requestKey, { at: now, id: message.id });
  while (log.requests.size > 1000) log.requests.delete(log.requests.keys().next().value!);
  // Every client gets the same canonical channel. Channel1 no longer means proximity.
  const wire = new W().u8(0).u8(NUMBERS[channel]).u32(sender.pid!).u32(2).s(message.name, 16).s([...text].map(c => c.charCodeAt(0) > 255 ? "?" : c).join(""), [...text].length).u8(0).bytes();
  for (const s of recipients) s.lobby!.post(0x4402, wire);
  return { ok: plain(message) };
}

export function chatGet(g: Game, user: string, after: number = 0) {
  const session = sessionFor(g, user);
  if (!online(session)) return { error: "Join the online game before chatting." };
  const log = stream(g), reset = !Number.isSafeInteger(after) || after < 0 || after > log.next;
  const from = reset ? 0 : after;
  const messages = log.messages.filter(m => m.id > from && m.audience?.has(session.acct) && !ignores(g, session.pid, m.pid)).slice(-100).map(plain);
  // now: the server's clock, so a client whose own clock is off still dates the lines (live-chat.js bubbles)
  return { ok: { cursor: log.next, reset, now: Date.now(), pid: session.pid, name: session.name,
    players: [...g.hub.sessions.values()].filter(online).map(s => ({ pid: s.pid, name: s.name })), messages } };
}

export function chatSend(g: Game, user: string, body: unknown) {
  const session = sessionFor(g, user);
  if (!online(session)) return { error: "Join the online game before chatting." };
  const input = body as { channel?: unknown; text?: unknown; targetPid?: unknown; requestId?: unknown } | null;
  if (!input || typeof input.channel !== "string" || !(Object.hasOwn(NUMBERS, input.channel)) || typeof input.text !== "string"
    || (input.targetPid !== undefined && (!Number.isSafeInteger(input.targetPid) || Number(input.targetPid) < 0))
    || (input.requestId !== undefined && typeof input.requestId !== "string")) return { error: "Invalid chat message." };
  return sendChat(g, session, input.channel as ChatChannel, input.text, input.targetPid as number | undefined, input.requestId as string | undefined);
}
