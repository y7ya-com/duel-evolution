// The Discord bridge's game side (discord/bridge.ts): All Chat <-> #general, the open duels Discord's #duels and the chat's
// Duels tab list (Lobby.openDuels / duelJoinCheck). Discord's REST is a mocked fetch; the gateway's frames are fed in.
import { afterEach, describe, expect, it, vi } from "vitest";
import { harness, be32, cat, str, cstr, type Client, type Harness } from "./notes-harness.ts";
import { chatGet, DISCORD_NAME } from "../src/game/chat.ts";
import { DiscordBridge, discordText, duelMessage, gameAuthor, gameLines, gameText, webhookName } from "../src/discord/bridge.ts";

const u32 = (d: Uint8Array, o = 0) => new DataView(d.buffer, d.byteOffset + o, 4).getUint32(0);
/** 0x4288: duel style (3 single, 4 match), watch, mstat (1 = autoduel), a password flag and 16 bytes, then x = [surrender, time, LV limit] */
const roomReq = (o: { style?: number; mstat?: number; pw?: string; x?: number[] } = {}) => {
  const d = new Uint8Array(28);
  d[0] = o.style ?? 3; d[1] = 1; d[2] = o.mstat ?? 0;
  if (o.pw) { d[3] = 1; d.set(str(o.pw, 16), 4); }
  d.set(o.x ?? [1, 1, 0], 21);
  return d;
};
async function openRoom(X: Client, o: Parameters<typeof roomReq>[0] = {}) {
  const n = X.room!.mark();
  X.room!.send(0x4288, roomReq(o));
  return u32((await X.room!.wait(0x3113, n))!);
}
async function world(n: number): Promise<[Harness, Client[]]> {
  const h = harness();
  const cs = Array.from({ length: n }, (_, i) => h.client(`P${i}`, `p${i}`, "pw", `user-${i}`));
  for (const [i, c] of cs.entries()) await c.account(0, `Player${i}`);
  for (const c of cs) await c.enterRoom();
  return [h, cs];
}
const ENV = { DISCORD_BOT_TOKEN: "bot", DISCORD_GUILD_ID: "g1", DISCORD_GENERAL_CHANNEL_ID: "gen", DISCORD_DUELS_CHANNEL_ID: "duels",
  DISCORD_GENERAL_WEBHOOK_URL: "https://discord.com/api/webhooks/1/tok", PUBLIC_ORIGIN: "https://de.test" };

/** fetch as Discord: every call recorded; POST messages answer ids m1, m2...; GET /users/@me the bot. */
function mockDiscord() {
  const calls: { method: string; url: string; body: any }[] = [];
  let n = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, url, body });
    if (url.endsWith("/users/@me")) return Response.json({ id: "bot1" });
    if (method === "GET" && /\/messages\?/.test(url)) return Response.json([
      { id: "old1", author: { id: "bot1" }, components: [{ components: [{ custom_id: "duel_join:5" }] }] },
      { id: "old2", author: { id: "someone" } }]);
    if (method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({ id: `m${++n}` });
  });
  return calls;
}
afterEach(() => vi.restoreAllMocks());

describe("Discord text both ways", () => {
  it("a Discord message as All Chat shows it", () => {
    expect(gameText({ content: "hi <@123> look <:pog:999> **bold** in <#55>", mentions: [{ id: "123", username: "bob", global_name: "Bobby" }] }))
      .toBe("hi @Bobby look :pog: bold in #channel");
    expect(gameText({ content: "nice 🔥🔥 “quoted” — ok…" })).toBe('nice "quoted" - ok...');
    expect(gameText({ content: "", attachments: [{ content_type: "image/png" }, { content_type: "application/zip" }] })).toBe("[image] [file]");
    expect(gameText({ content: "colour @1 tag\nnew line" })).toBe("colour @ 1 tag new line");
    expect(gameText({ content: "日本語" })).toBe("???");
    expect(gameText({ content: "🔥" })).toBe("");
    expect(gameAuthor({ member: { nick: "Nick" }, author: { username: "user", global_name: "Global" } })).toBe("Nick");
    expect(gameAuthor({ author: { username: "averyveryverylongusername" } })).toBe("averyveryverylon");
  });
  it("long messages are cut into at most three 128-character lines", () => {
    const lines = gameLines("bob", "word ".repeat(200).trim());
    expect(lines).toHaveLength(3);
    for (const l of lines) expect(`bob: ${l}`.length).toBeLessThanOrEqual(128);
    expect(lines[2].endsWith("...")).toBe(true);
    expect(gameLines("bob", "short")).toEqual(["short"]);
  });
  it("a game line for Discord: markdown shown as typed, a webhook name Discord accepts", () => {
    expect(discordText("*hi* _x_ # h > q")).toBe("\\*hi\\* \\_x\\_ \\# h \\> q");
    expect(webhookName("DiscordKing")).toBe("Disc0rdKing");
    expect(webhookName("")).toBe("Duelist");
  });
});

describe("All Chat <-> #general", () => {
  it("All Chat goes out through the webhook under the player's name; other channels stay in the game", async () => {
    const calls = mockDiscord();
    const [h, [a]] = await world(2);
    h.game.discord = new DiscordBridge(ENV, h.game, () => {});
    a.room!.send(0x4400, cat([0, 0], be32(0), be32(0), be32(0), str("hello *all*", 11), [0]));
    a.room!.send(0x4400, cat([0, 2], be32(0), be32(0), be32(0), str("wts cards", 9), [0]));
    await h.tick(200);
    const out = calls.filter((c) => c.url.startsWith(ENV.DISCORD_GENERAL_WEBHOOK_URL));
    expect(out).toHaveLength(1);
    expect(out[0].url).toContain("wait=true");
    expect(out[0].body).toMatchObject({ username: "Player0", content: "hello \\*all\\*", allowed_mentions: { parse: [] }, avatar_url: "https://de.test/apple-touch-icon.png" });
  });

  it("a player with a linked Discord: their avatar, and their Discord as a mention under the line (nobody pinged)", async () => {
    const calls = mockDiscord();
    const [h, [a]] = await world(1);
    const DB = { prepare: () => ({ bind: (u: string) => ({ first: async () => (u === "user-0" ? { account_id: "777" } : null) }) }) } as unknown as D1Database;
    h.game.discord = new DiscordBridge({ ...ENV, DB }, h.game, () => {});
    (globalThis.fetch as any).mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      calls.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : null });
      return url.endsWith("/users/777") ? Response.json({ id: "777", avatar: "abc" }) : Response.json({ id: "m1" });
    });
    a.room!.send(0x4400, cat([0, 0], be32(0), be32(0), be32(0), str("hi", 2), [0]));
    await h.tick(200);
    const out = calls.filter((c) => c.url.startsWith(ENV.DISCORD_GENERAL_WEBHOOK_URL));
    expect(out[0].body).toMatchObject({ username: "Player0", content: "hi\n-# <@777>", allowed_mentions: { parse: [] },
      avatar_url: "https://cdn.discordapp.com/avatars/777/abc.png?size=128" });
  });

  it("#general messages reach everyone online as [Discord] lines; bots, webhooks and other channels don't", async () => {
    mockDiscord();
    const [h, [a, b]] = await world(2);
    const bridge = new DiscordBridge(ENV, h.game, () => {});
    const feed = (d: Record<string, unknown>) => (bridge as any).onFrame({ op: 0, t: "MESSAGE_CREATE", s: 1, d: { guild_id: "g1", channel_id: "gen", type: 0, ...d } });
    const n = b.room!.mark();
    feed({ author: { id: "1", username: "dave", global_name: "Dave" }, content: "gg everyone" });
    feed({ author: { username: "hook", bot: true }, webhook_id: "1", content: "Player0: echo" });
    feed({ author: { username: "bot", bot: true }, content: "beep" });
    feed({ author: { username: "dave" }, content: "elsewhere", channel_id: "other" });
    await h.tick(200);
    const lines = b.room!.all(0x4402, n);
    expect(lines).toHaveLength(1);
    expect(cstr(lines[0].subarray(10, 26))).toBe(DISCORD_NAME);
    expect(cstr(lines[0].subarray(26))).toBe("Dave: gg everyone");
    const r = chatGet(h.game, "user-0");
    expect("ok" in r && r.ok!.messages.map((m) => [m.pid, m.name, m.text])).toEqual([[99999999, DISCORD_NAME, "Dave: gg everyone"]]);
    void a;
  });
});

describe("#general speakers are their duelists", () => {
  /** A D1 where Discord 501 is user-0 and 502 is user-1. */
  const DB = { prepare: () => ({ bind: (d: string) => ({ first: async () => (({ "501": { user_id: "user-0" }, "502": { user_id: "user-1" } } as Record<string, unknown>)[d] ?? null) }) }) } as unknown as D1Database;
  const say = (bridge: DiscordBridge, id: string, content: string) =>
    (bridge as any).onFrame({ op: 0, t: "MESSAGE_CREATE", s: 1, d: { guild_id: "g1", channel_id: "gen", type: 0, author: { id, username: `d${id}` }, content } });
  it("online: their character's pid and name; offline: their duelist's name; unlinked: [Discord]; chat-banned: nothing", async () => {
    mockDiscord();
    const [h, [a, b]] = await world(2);
    const bridge = new DiscordBridge({ ...ENV, DB }, h.game, () => {});
    const n = b.room!.mark();
    say(bridge, "501", "from discord");
    await h.tick(200);
    let lines = b.room!.all(0x4402, n);
    expect(lines).toHaveLength(1);
    expect(u32(lines[0], 2)).toBe(a.pid);
    expect(cstr(lines[0].subarray(10, 26))).toBe("Player0");
    expect(cstr(lines[0].subarray(26))).toBe("from discord");

    a.room!.close?.(); h.game.hub.sessions.delete(h.game.hub.byPid(a.pid!)!.acct);   // Player0 leaves the game
    const m = b.room!.mark();
    say(bridge, "501", "still me");
    say(bridge, "999", "who am i");
    await h.tick(200);
    lines = b.room!.all(0x4402, m);
    expect(lines.map((l) => [u32(l, 2), cstr(l.subarray(10, 26)), cstr(l.subarray(26))])).toEqual([[99999999, "Player0", "still me"], [99999999, DISCORD_NAME, "d999: who am i"]]);

    h.game.admin.data.flags.set(h.game.store.accountOfUser("user-1")!, 0x20);   // Player1 chat-banned
    const k = b.room!.mark();
    say(bridge, "502", "banned words");
    await h.tick(200);
    expect(b.room!.all(0x4402, k)).toEqual([]);
  });
});

describe("open duels", () => {
  it("a created room is an open duel until someone takes it; autoduel searches and private invites never are", async () => {
    const [h, [a, b, c]] = await world(3);
    const lp = h.game.lp;
    const rid = await openRoom(b, { style: 4, pw: "secret", x: [0, 1, 0] });
    await openRoom(c, { mstat: 1 });   // an autoduel search
    expect(lp.openDuels()).toEqual([expect.objectContaining({ id: rid, pid: b.pid, name: "Player1", match: true, timeLimit: true, surrender: false, free: false })]);
    expect(lp.duelJoinCheck("user-1", rid)[1]).toMatchObject({ error: "self" });
    expect(lp.duelJoinCheck("user-0", 424242)[1]).toMatchObject({ error: "gone" });
    expect(lp.duelJoinCheck("user-0", rid)).toEqual([200, { ok: true, id: rid, pid: b.pid, name: "Player1" }]);
    const n = b.room!.mark();
    a.room!.send(0x4300, cat(be32(rid), new Uint8Array(16)));   // no password needed
    expect(await b.room!.wait(0x4302, n)).not.toBeNull();
    b.room!.send(0x4303, be32(1));
    await h.tick(200);
    expect(lp.openDuels()).toEqual([]);
  });

  it("joining is refused with a reason: own duel open, a different block", async () => {
    const [h, [a, b, c]] = await world(3);
    const lp = h.game.lp;
    const rid = await openRoom(b);
    await openRoom(a);
    expect(lp.duelJoinCheck("user-0", rid)[1]).toMatchObject({ error: "own-room" });
    const s = h.game.hub.byPid(c.pid!)!;
    h.game.hub.blocks.get(s.block!)!.delete(s.pid!);
    s.block = `${s.block}#2`;
    expect(lp.duelJoinCheck("user-2", rid)[1]).toMatchObject({ error: "elsewhere" });
  });

  it("#duels: old bot messages swept, one message per open duel with its Accept button, deleted when the duel goes", async () => {
    const calls = mockDiscord();
    const [h, [a, b]] = await world(2);
    h.game.discord = new DiscordBridge(ENV, h.game, () => {});
    const rid = await openRoom(b);
    await h.tick(1500);
    const del = () => calls.filter((c) => c.method === "DELETE").map((c) => c.url.split("/").pop());
    const posts = calls.filter((c) => c.method === "POST" && c.url.endsWith("/channels/duels/messages"));
    expect(del()).toEqual(["old1"]);   // only the bot's own duel messages
    expect(posts).toHaveLength(1);
    expect(posts[0].body.embeds[0].title).toBe("Player1 wants to duel");
    expect(posts[0].body.components[0].components[0]).toMatchObject({ style: 3, label: "Accept duel", custom_id: `duel_join:${rid}` });
    b.room!.send(0x4290);
    await h.tick(1500);
    expect(del()).toEqual(["old1", "m1"]);
    void a;
  });

  it("the #duels message names the rules", () => {
    const m = duelMessage({ id: 7, pid: 1, name: "Kaiba", lv: 12, match: false, timeLimit: false, surrender: true, spectators: true, at: 0, free: false });
    expect(m.embeds[0].description).toBe("LV 12 · Single duel · no time limit · spectators allowed");
  });
});
