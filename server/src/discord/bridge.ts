// The Discord side of the game, inside the WorldDO (one per world, like the game it serves):
// - All Chat <-> #general. Out: every All Chat line through #general's webhook, under its player's name. In: #general's
//   messages over the Discord gateway (an outbound WebSocket, intents GUILD_MESSAGES + MESSAGE_CONTENT), into All Chat
//   as "[Discord] author: text" (chat.ts relayIn). The gateway is up only while someone is in the game: with nobody to
//   read it, a line has nowhere to go.
// - #duels: one message per open duel (lobby.ts openDuels: created in the game, nobody joined yet), with its Accept
//   button (custom_id duel_join:<room id>, discord/interactions.ts). Each message goes when its duel does, so the channel
//   is the live list. A restart forgets the messages, so the bot's old ones are swept at boot.
// Everything here is best effort: Discord down, slow or unconfigured never touches the game.
import type { Game } from "../game/game.ts";
import { DISCORD_NAME, relayIn } from "../game/chat.ts";
import { SANCTION_CHAT } from "../game/lobby.ts";
import type { OpenDuel } from "../game/lobby.ts";
import { rest, webhook, type DiscordEnv } from "./rest.ts";

const GATEWAY = "https://gateway.discord.gg/?v=10&encoding=json";
const INTENTS = (1 << 9) | (1 << 15);   // GUILD_MESSAGES, MESSAGE_CONTENT (privileged: the app's Message Content intent)
/** Close codes after which reconnecting can't help (bad token, disallowed intents...): logged, and the gateway stays off. */
const FATAL = new Set([4004, 4010, 4011, 4012, 4013, 4014]);
/** Nobody in the game this long: the gateway closes (a player's next connection opens it again). */
const IDLE_MS = 10 * 60_000;
/** Lines of one Discord message in All Chat (the game's line is 128 bytes, as a player's). */
const LINE_MAX = 128, LINES_MAX = 3;
const OUT_QUEUE_MAX = 100;
const SUPPRESS_EMBEDS = 1 << 2;

/** A Discord message as All Chat can show it: mentions and custom emoji as names, attachments as [image] / [file], one
 *  line, Latin-1 only (emoji dropped, typographic punctuation made plain), no game colour tags ("@1"). "" = nothing. */
export function gameText(m: { content?: string; mentions?: { id: string; username?: string; global_name?: string | null }[];
  attachments?: { content_type?: string }[]; sticker_items?: unknown[] }): string {
  const who = new Map((m.mentions ?? []).map((u) => [u.id, u.global_name || u.username || "someone"]));
  let t = (m.content ?? "")
    .replace(/<@!?(\d+)>/g, (_, id) => `@${who.get(id) ?? "someone"}`)
    .replace(/<@&\d+>/g, "@role").replace(/<#\d+>/g, "#channel")
    .replace(/<a?:(\w+):\d+>/g, ":$1:").replace(/<t:(\d+)(:\w)?>/g, (_, s) => new Date(Number(s) * 1000).toUTCString())
    .replace(/(\*\*|__|~~|\|\||`{1,3})/g, "");
  for (const a of m.attachments ?? []) t += a.content_type?.startsWith("image/") ? " [image]" : " [file]";
  if (m.sticker_items?.length) t += " [sticker]";
  t = t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...")
    .normalize("NFKC").replace(/\p{Extended_Pictographic}|[\u{FE00}-\u{FE0F}\u{200D}]/gu, "")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, (c) => /\s/.test(c) ? " " : "?")
    .replace(/[@＠](\d)/g, "@ $1").replace(/\s+/g, " ").trim();
  return t;
}
/** The author as All Chat shows it: the server nickname, else the display name, else the username; Latin-1, 16 chars. */
export const gameAuthor = (m: { member?: { nick?: string | null }; author?: { username?: string; global_name?: string | null } }) =>
  gameText({ content: m.member?.nick || m.author?.global_name || m.author?.username || "?" }).slice(0, 16) || "?";

/** "author: text" cut to whole lines of LINE_MAX characters, at most LINES_MAX of them (the last ends in "..."). */
export function gameLines(author: string, text: string): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest && out.length < LINES_MAX) {
    const room = LINE_MAX - author.length - 2;
    if (rest.length <= room) { out.push(rest); break; }
    const cut = out.length === LINES_MAX - 1 ? room - 3 : room;
    let at = rest.lastIndexOf(" ", cut);
    if (at < cut / 2) at = cut;
    out.push(rest.slice(0, at).trimEnd() + (out.length === LINES_MAX - 1 ? "..." : ""));
    rest = rest.slice(at).trimStart();
  }
  return out;
}

/** A game line for Discord: markdown escaped (a backslash before any punctuation shows the character as it is). */
export const discordText = (s: string) => s.replace(/[\\*_~`|>#\[\]()<:-]/g, "\\$&");
/** A webhook's username can't hold "discord" or "clyde" (Discord refuses the message). */
export const webhookName = (s: string) => (s.replace(/discord/gi, "Disc0rd").replace(/clyde/gi, "Clyd3").trim() || "Duelist").slice(0, 80);

const MODE = (d: OpenDuel) => [d.match ? "Match (best of 3)" : "Single duel", d.timeLimit ? "time limit" : "no time limit",
  d.spectators ? "spectators allowed" : "no spectators"].join(" · ");
/** A #duels message: who, their level and the duel's rules, and the Accept button. */
export function duelMessage(d: OpenDuel) {
  return {
    embeds: [{ title: `${d.name} wants to duel`, description: `LV ${d.lv} · ${MODE(d)}`, color: 0x3b82f6,
      footer: { text: "Accept opens the game in your browser and sends the duel request." }, timestamp: new Date(d.at).toISOString() }],
    components: [{ type: 1, components: [{ type: 2, style: 3, label: "Accept duel", custom_id: `duel_join:${d.id}` }] }],
    allowed_mentions: { parse: [] },
  };
}

type Posted = { msg: string | null };
/** A player's linked Discord account (D1 account, provider discord) and its avatar, for their All Chat lines. */
type Profile = { id: string; name: string; avatar: string | null } | null;
const PROFILE_TTL_MS = 30 * 60_000;
/** The wire of a line from someone not in the game (an offline duelist, an unlinked Discord user). The engine drops any
 *  chat line from pid 0 and shows one from any other pid, known or not; channel 1 lands in the hidden Proximity log (live
 *  check, 2026-11-06). A pid no player (PID_BASE + 4 idx + slot) or NPC (FAKE_BASE + n) ever has, so no card or ignore
 *  entry matches it. */
const OFFLINE = { pid: 99_999_999, channel: 0 };

export class DiscordBridge {
  private ws: WebSocket | null = null;
  private connecting = false;
  private beat: ReturnType<typeof setInterval> | null = null;
  private idle: ReturnType<typeof setInterval> | null = null;
  private seq: number | null = null;
  private session: { id: string; url: string } | null = null;
  private acked = true;
  private fatal = false;
  private retries = 0;
  private emptySince: number | null = null;
  private outQueue: { name: string; text: string; who: Promise<Profile> }[] = [];
  private profiles = new Map<string, { at: number; p: Promise<Profile> }>();
  private linked = new Map<string, { at: number; p: Promise<string | null> }>();
  private sending = false;
  /** room id -> its #duels message (msg null while its POST is in flight) */
  private posted = new Map<number, Posted>();
  private duelOps: Promise<unknown> = Promise.resolve();
  private duelTimer: ReturnType<typeof setTimeout> | null = null;
  private botId: string | null = null;
  private swept = false;

  constructor(private env: DiscordEnv & { PUBLIC_ORIGIN?: string; DB?: D1Database }, private g: Game, private log: (s: string) => void) {
    g.duelsChanged = () => this.duelsChanged();
  }

  get chatOn() { return !!(this.env.DISCORD_BOT_TOKEN && this.env.DISCORD_GENERAL_CHANNEL_ID); }
  get duelsOn() { return !!(this.env.DISCORD_BOT_TOKEN && this.env.DISCORD_DUELS_CHANNEL_ID); }

  // ---- All Chat -> #general

  /** An All Chat line out to #general; `userId`: the sender's DE user, whose linked Discord shows with the line. */
  chatOut(name: string, text: string, userId: string | null = null) {
    if (!this.env.DISCORD_GENERAL_WEBHOOK_URL) return;
    this.outQueue.push({ name, text, who: this.profile(userId) });
    if (this.outQueue.length > OUT_QUEUE_MAX) this.outQueue.splice(0, this.outQueue.length - OUT_QUEUE_MAX);
    void this.pump();
  }
  /** The Discord account linked to a DE user, and its avatar (cached a while; null when none or unknown). */
  private profile(userId: string | null): Promise<Profile> {
    if (!userId || !this.env.DB) return Promise.resolve(null);
    const hit = this.profiles.get(userId);
    if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.p;
    const p = (async (): Promise<Profile> => {
      const row = await this.env.DB!.prepare("SELECT account_id FROM account WHERE provider_id = 'discord' AND user_id = ?").bind(userId).first<{ account_id: string }>();
      if (!row) return null;
      const u = await rest(this.env, "GET", `/users/${row.account_id}`);
      return { id: row.account_id, name: String((u.ok && (u.body?.global_name || u.body?.username)) || "Discord"), avatar: u.ok && u.body?.avatar ? `https://cdn.discordapp.com/avatars/${row.account_id}/${u.body.avatar}.png?size=128` : null };
    })().catch(() => null);
    this.profiles.set(userId, { at: Date.now(), p });
    if (this.profiles.size > 2000) this.profiles.delete(this.profiles.keys().next().value!);
    return p;
  }
  /** One webhook message at a time; a player's lines that queued up behind a rate limit go as one message. It goes under
   *  the player's name, with their Discord picture when it's linked, and nothing is added to the text: a webhook's author
   *  can't open a real profile (only a mention could, and that tags). */
  private async pump() {
    if (this.sending) return;
    this.sending = true;
    try {
      while (this.outQueue.length) {
        const first = this.outQueue[0], who = await first.who, lines: string[] = [];
        while (this.outQueue.length && this.outQueue[0].name === first.name && this.outQueue[0].who === first.who && lines.join("\n").length < 1500)
          lines.push(discordText(this.outQueue.shift()!.text));
        const avatar = who?.avatar ?? (this.env.PUBLIC_ORIGIN ? `${this.env.PUBLIC_ORIGIN}/apple-touch-icon.png` : undefined);
        const body = { username: webhookName(first.name), content: lines.join("\n"), allowed_mentions: { parse: [] },
          flags: SUPPRESS_EMBEDS, ...(avatar && { avatar_url: avatar }) };
        let r = await webhook(this.env.DISCORD_GENERAL_WEBHOOK_URL!, body);
        if (r.status === 429) { await sleep((r.retryAfter ?? 1) * 1000); r = await webhook(this.env.DISCORD_GENERAL_WEBHOOK_URL!, body); }
        if (!r.ok) this.log(`[AVISO] [discord] All Chat line not relayed: ${r.status} ${JSON.stringify(r.body)?.slice(0, 200)}`);
      }
    } finally { this.sending = false; }
  }

  // ---- #general -> All Chat (the gateway)

  /** A player connected: the gateway (re)opens if it is down. */
  wake() {
    this.emptySince = null;
    if (this.chatOn && !this.fatal && !this.ws && !this.connecting) void this.connect();
    if (this.duelsOn && !this.swept) this.duelsChanged();
  }
  private online() { for (const s of this.g.hub.sessions.values()) if (s.lobby && !s.lobby.closed) return true; return false; }

  private async connect() {
    this.connecting = true;
    try {
      const url = this.session ? this.session.url.replace(/^wss:/, "https:") + "/?v=10&encoding=json" : GATEWAY;
      const r = await fetch(url, { headers: { Upgrade: "websocket" } });
      const ws = r.webSocket;
      if (!ws) throw new Error(`no websocket (${r.status})`);
      ws.accept();
      this.ws = ws;
      ws.addEventListener("message", (e) => { try { this.onFrame(JSON.parse(typeof e.data === "string" ? e.data : new TextDecoder().decode(e.data as ArrayBuffer))); } catch (err) { this.log(`[AVISO] [discord] gateway frame: ${err}`); } });
      ws.addEventListener("close", (e) => this.onClose(ws, e.code));
      ws.addEventListener("error", () => this.onClose(ws, 1006));
      if (!this.idle) this.idle = setInterval(() => this.idleCheck(), 60_000);
    } catch (e) {
      this.log(`[AVISO] [discord] gateway connect failed: ${e}`);
      this.retry();
    } finally { this.connecting = false; }
  }
  private send(op: number, d: unknown) { try { this.ws?.send(JSON.stringify({ op, d })); } catch { /* closing */ } }
  private onFrame(f: { op: number; d: any; s: number | null; t: string | null }) {
    if (f.s != null) this.seq = f.s;
    switch (f.op) {
      case 10: {   // HELLO: heartbeat, then identify (or resume)
        const every = Number(f.d?.heartbeat_interval ?? 41250);
        this.acked = true;
        if (this.beat) clearInterval(this.beat);
        setTimeout(() => this.heartbeat(), Math.floor(every * Math.random()));
        this.beat = setInterval(() => this.heartbeat(), every);
        if (this.session) this.send(6, { token: this.env.DISCORD_BOT_TOKEN, session_id: this.session.id, seq: this.seq });
        else this.send(2, { token: this.env.DISCORD_BOT_TOKEN, intents: INTENTS, properties: { os: "cloudflare", browser: "duel-evolution", device: "duel-evolution" } });
        return;
      }
      case 11: this.acked = true; return;
      case 1: this.send(1, this.seq); return;
      case 7: this.drop(4000, true); return;                      // reconnect, resuming
      case 9: this.drop(4000, !!f.d); return;                     // invalid session: resume only if Discord says so
      case 0: break;
      default: return;
    }
    if (f.t === "READY") {
      this.session = { id: f.d.session_id, url: f.d.resume_gateway_url };
      this.botId = f.d.user?.id ?? this.botId;
      this.retries = 0;
      this.log(`[AVISO] [discord] gateway ready as ${f.d.user?.username}`);
    } else if (f.t === "RESUMED") this.retries = 0;
    else if (f.t === "MESSAGE_CREATE") this.onMessage(f.d);
  }
  private heartbeat() {
    if (!this.acked) { this.drop(4000, true); return; }   // a zombie connection: Discord's advice is to reconnect and resume
    this.acked = false;
    this.send(1, this.seq);
  }
  private onMessage(m: any) {
    if (m.channel_id !== this.env.DISCORD_GENERAL_CHANNEL_ID || m.guild_id !== this.env.DISCORD_GUILD_ID) return;
    if (m.webhook_id || m.author?.bot || (m.type !== 0 && m.type !== 19)) return;   // our own relays, bots, joins and pins
    const text = gameText(m);
    if (!text || !m.author?.id) return;
    void this.linkedUser(String(m.author.id)).then((userId) => this.g.world.run(() => {
      const who = this.speaker(userId, gameAuthor(m));
      if (!who) return;   // chat-banned in the game: not in the game's chat from Discord either
      for (const line of gameLines(who.author, text)) relayIn(this.g, who.line(line));
    }));
  }
  /** The DE user a Discord account is linked to (/verify, Discord sign-in), cached a while; null when none. */
  private linkedUser(discordId: string): Promise<string | null> {
    const hit = this.linked.get(discordId);
    if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.p;
    const p = !this.env.DB ? Promise.resolve(null) : this.env.DB.prepare("SELECT user_id FROM account WHERE provider_id = 'discord' AND account_id = ?")
      .bind(discordId).first<{ user_id: string }>().then((r) => r?.user_id ?? null, () => null);
    this.linked.set(discordId, { at: Date.now(), p });
    if (this.linked.size > 2000) this.linked.delete(this.linked.keys().next().value!);
    return p;
  }
  /** Who a #general line is from in the game. A linked account speaks as its duelist: online, its character's pid and name
   *  (its card opens from the line, ignore lists apply); offline, its active character's name. An unlinked Discord user
   *  is "[Discord] author: text". null: the account is chat-banned. `author`: the name gameLines leaves room for. */
  private speaker(userId: string | null, discordName: string): { author: string; line: (t: string) => { name: string; pid: number; text: string; channel?: number } } | null {
    const g = this.g, acct = userId ? g.store.accountOfUser(userId) : null;
    if (acct && g.admin.flagsOf(acct) & SANCTION_CHAT) return null;
    const s = acct ? g.hub.sessions.get(acct) : undefined;
    if (s && s.pid !== null && s.name) return { author: s.name, line: (t) => ({ name: s.name, pid: s.pid!, text: t }) };
    const a = acct ? g.store.peek().accounts?.[acct] as { active_slot?: number; profiles?: Record<string, { name?: string }>; players?: Record<string, string> } | undefined : undefined;
    const slot = String(Number(a?.active_slot ?? 0) & 3), name = a?.profiles?.[slot]?.name || a?.players?.[slot];
    if (name) return { author: name, line: (t) => ({ ...OFFLINE, name, text: t }) };
    return { author: `${DISCORD_NAME}:${discordName}`, line: (t) => ({ ...OFFLINE, name: DISCORD_NAME, text: `${discordName}: ${t}` }) };
  }
  /** Close this socket; reconnect (resuming if `resume`) unless the game has emptied. */
  private drop(code: number, resume: boolean) {
    const ws = this.ws;
    if (!resume) this.session = null;
    this.stop();
    try { ws?.close(code, "reconnect"); } catch { /* closed */ }
    if (this.online()) this.retry();
  }
  private onClose(ws: WebSocket, code: number) {
    if (ws !== this.ws) return;
    this.log(`[AVISO] [discord] gateway closed (${code})`);
    this.stop();
    if (FATAL.has(code)) {
      this.fatal = true;
      this.log(`[AVISO] [discord] gateway refused (close ${code}${code === 4014 ? ": enable the Message Content intent" : ""}); #general won't reach the game until a restart`);
      return;
    }
    if (code === 4007 || code === 4009) this.session = null;   // bad seq, session timed out: identify anew
    if (this.online()) this.retry();
  }
  private stop() {
    if (this.beat) clearInterval(this.beat);
    this.beat = null;
    this.ws = null;
  }
  private retry() {
    const wait = Math.min(60_000, 1000 * 2 ** this.retries++) * (0.5 + Math.random() / 2);
    setTimeout(() => { if (!this.ws && !this.connecting && !this.fatal && this.online()) void this.connect(); }, wait);
  }
  private idleCheck() {
    if (this.online()) { this.emptySince = null; return; }
    this.emptySince ??= Date.now();
    if (Date.now() - this.emptySince < IDLE_MS) return;
    const ws = this.ws;
    this.session = null;
    this.stop();
    try { ws?.close(1000, "idle"); } catch { /* closed */ }
    if (this.idle) clearInterval(this.idle);
    this.idle = null;
  }

  // ---- #duels

  /** Open duels changed: #duels catches up a moment later (a burst of changes is one pass). */
  duelsChanged() {
    if (!this.duelsOn || this.duelTimer) return;
    this.duelTimer = setTimeout(() => {
      this.duelTimer = null;
      this.duelOps = this.duelOps.then(() => this.syncDuels()).catch((e) => this.log(`[discord] #duels: ${e}`));
    }, 1000);
  }
  /** The open duels Discord lists: the online world's (Free Mode keeps to itself). */
  openDuels(): OpenDuel[] { return this.g.lp.openDuels().filter((d) => !d.free); }

  private async syncDuels() {
    const ch = this.env.DISCORD_DUELS_CHANNEL_ID!;
    if (!this.swept) await this.sweep(ch);
    let open: OpenDuel[] = [];
    await this.g.world.run(() => { open = this.openDuels(); });
    const want = new Map(open.map((d) => [d.id, d]));
    for (const [id, p] of [...this.posted]) {
      if (want.has(id)) continue;
      this.posted.delete(id);
      if (p.msg) await this.call("DELETE", `/channels/${ch}/messages/${p.msg}`);
    }
    for (const d of want.values()) {
      if (this.posted.has(d.id)) continue;
      const p: Posted = { msg: null };
      this.posted.set(d.id, p);
      const r = await this.call("POST", `/channels/${ch}/messages`, duelMessage(d));
      if (r.ok) p.msg = r.body.id;
      else this.posted.delete(d.id);
      // gone while it posted: the next pass deletes it
      if (r.ok && this.posted.get(d.id) !== p) await this.call("DELETE", `/channels/${ch}/messages/${p.msg}`);
    }
  }
  /** The bot's messages left in #duels by an earlier run (a deploy restarts the world and forgets them). */
  private async sweep(ch: string) {
    this.botId ??= (await this.call("GET", "/users/@me")).body?.id ?? null;
    if (!this.botId) return;
    const r = await this.call("GET", `/channels/${ch}/messages?limit=100`);
    if (!r.ok) return;
    this.swept = true;
    for (const m of r.body as { id: string; author?: { id: string } }[])
      if (m.author?.id === this.botId && JSON.stringify((m as any).components ?? []).includes("duel_join:")) await this.call("DELETE", `/channels/${ch}/messages/${m.id}`);
  }
  /** A REST call that waits out one rate limit. */
  private async call(method: string, path: string, body?: unknown) {
    let r = await rest(this.env, method, path, body);
    if (r.status === 429) { await sleep((r.retryAfter ?? 1) * 1000); r = await rest(this.env, method, path, body); }
    if (!r.ok && r.status !== 404) this.log(`[AVISO] [discord] ${method} ${path}: ${r.status} ${JSON.stringify(r.body)?.slice(0, 200)}`);
    return r;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
