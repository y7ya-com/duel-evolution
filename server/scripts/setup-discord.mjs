// The Discord bot's one-shot setup (moved here from duelforge clients/web/scripts/setup-discord.mjs). Idempotent.
//
//   DISCORD_BOT_TOKEN=... node scripts/setup-discord.mjs              # channels, webhook, intent, commands; ids into wrangler.jsonc
//   DISCORD_BOT_TOKEN=... node scripts/setup-discord.mjs --endpoint   # AFTER deploying: Discord's interactions come here
//
// With the bot token only (the guild and role ids are in wrangler.jsonc env.production.vars): checks the app's public key;
// turns on the Message Content intent (the gateway reads #general); creates #duels next to #general, where only the bot
// posts; a webhook on #general (All Chat goes out through it); re-registers /verify and /reset. It writes the channel ids
// into wrangler.jsonc and prints the webhook URL to store as the DISCORD_GENERAL_WEBHOOK_URL secret. The bot needs Manage
// Channels, Manage Roles and Manage Webhooks; a missing one is reported with the link that grants it.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const JSONC = resolve(dirname(fileURLToPath(import.meta.url)), "../wrangler.jsonc");
const ENDPOINT = "https://ygoevolution.com/api/discord/interactions";
const BOT = process.env.DISCORD_BOT_TOKEN;
if (!BOT) { console.error("Set DISCORD_BOT_TOKEN (Discord developer portal → Bot → Reset Token) and re-run."); process.exit(1); }

let jsonc = readFileSync(JSONC, "utf8");
const get = (k) => jsonc.match(new RegExp(`"${k}":\\s*"([^"]*)"`))?.[1];
const set = (k, v) => { jsonc = jsonc.replace(new RegExp(`("${k}":\\s*)"[^"]*"`), `$1"${v}"`); };
const GUILD = get("DISCORD_GUILD_ID");

const API = "https://discord.com/api/v10";
async function call(method, path, body) {
  const r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bot ${BOT}`, "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${await r.text()}`);
  return r.status === 204 ? {} : r.json();
}
const blocked = [];
async function step(label, fn) {
  try { return await fn(); } catch (e) {
    if (/Missing Permissions|Missing Access|"code": ?(50013|50001)/.test(String(e))) { blocked.push(label); console.log(`✗ ${label}: the bot lacks the permission`); return null; }
    throw e;
  }
}

if (process.argv.includes("--endpoint")) {
  await call("PATCH", "/applications/@me", { interactions_endpoint_url: ENDPOINT });
  console.log(`✓ Interactions Endpoint URL → ${ENDPOINT}`);
  process.exit(0);
}

// 1. the app: its public key (wrangler.jsonc must match) and the Message Content intent (GATEWAY_MESSAGE_CONTENT_LIMITED)
const app = await call("GET", "/applications/@me");
console.log(`• public key (the DISCORD_PUBLIC_KEY secret)  ${app.verify_key}`);
const CONTENT = 1 << 19, CONTENT_FULL = 1 << 18;
if (app.flags & (CONTENT | CONTENT_FULL)) console.log("• Message Content intent already on");
else {   // only the *_LIMITED intent flags are writable
  await call("PATCH", "/applications/@me", { flags: (app.flags & ((1 << 13) | (1 << 15))) | CONTENT });
  console.log("✓ Message Content intent on");
}
const me = await call("GET", "/users/@me");

// 2. #general (its id) and #duels beside it: everyone reads it, only the bot posts
const channels = await call("GET", `/guilds/${GUILD}/channels`);
const general = channels.find((c) => c.type === 0 && c.name === "general");
if (!general) throw new Error("no #general text channel in the server");
set("DISCORD_GENERAL_CHANNEL_ID", general.id);
console.log(`✓ #general  ${general.id}`);
const VIEW = 1024, SEND = 2048, EMBED = 16384, HISTORY = 65536, REACT = 64, THREADS = 2 ** 35 + 2 ** 36 + 2 ** 38;   // (past 32 bits: no <<)
const duels = channels.find((c) => c.type === 0 && c.name === "duels")
  ?? await step("Create #duels (needs Manage Channels)", () => call("POST", `/guilds/${GUILD}/channels`, {
    name: "duels", type: 0, parent_id: general.parent_id ?? undefined,
    topic: "Duels waiting for an opponent in Duel Evolution. Press Accept to join one: the game opens in your browser.",
    permission_overwrites: [
      { id: GUILD, type: 0, allow: "0", deny: String(SEND + REACT + THREADS) },
      { id: me.id, type: 1, allow: String(VIEW + SEND + EMBED + HISTORY), deny: "0" },
    ],
  }));
if (duels) { set("DISCORD_DUELS_CHANNEL_ID", duels.id); console.log(`✓ #duels  ${duels.id}`); }

// 3. #general's webhook for All Chat
const hooks = (await step("Read #general's webhooks (needs Manage Webhooks)", () => call("GET", `/channels/${general.id}/webhooks`))) ?? null;
let hook = hooks?.find((h) => h.name === "Duel Evolution All Chat" && h.token);
if (hooks && !hook) hook = await step("Create #general's webhook (needs Manage Webhooks)", () => call("POST", `/channels/${general.id}/webhooks`, { name: "Duel Evolution All Chat" }));
if (hook) console.log(`✓ All Chat webhook  ${hook.id}`);

// 4. /verify and /reset (the same commands duelforge registered: the bot's interactions now come here)
await step("Register /verify + /reset", () => call("PUT", `/applications/${app.id}/guilds/${GUILD}/commands`, [
  { name: "verify", description: "Link your Discord to your game account", options: [{ name: "code", description: "The code shown in the game", type: 3, required: true }] },
  { name: "reset", description: "Get a password-reset code for your game account" },
])).then((r) => r && console.log("✓ /verify and /reset registered"));

writeFileSync(JSONC, jsonc);
console.log("✓ ids written into wrangler.jsonc");
if (hook) console.log(`\nStore the webhook (secret):\n  echo '${`https://discord.com/api/webhooks/${hook.id}/${hook.token}`}' | npx wrangler secret put DISCORD_GENERAL_WEBHOOK_URL --env production`);
console.log("  npx wrangler secret put DISCORD_BOT_TOKEN --env production");
if (blocked.length) {
  const perms = 16 + 1024 + 2048 + 16384 + 65536 + 268435456 + 536870912;   // channels, view, send, embed, history, roles, webhooks
  console.log(`\n⚠ Missing permissions for: ${blocked.join(", ")}\n  https://discord.com/oauth2/authorize?client_id=${app.id}&scope=bot%20applications.commands&permissions=${perms}\nthen re-run.`);
} else console.log("\nThen deploy, and: node scripts/setup-discord.mjs --endpoint");
