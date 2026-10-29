// The game's D1 tables: py's state.json, relationally (see db/project.ts for the mapping and its exact round trip),
// plus the admin data py keeps in files next to state.json (db/admin.ts).
//
// Identity: a character's id is the JSON path of its profile inside state.json ("/profiles/0" for the owner, whose
// keys live at the root; "/accounts/<acct>/profiles/<slot>"; an archived one is ".../profiles_borrados/<i>/perfil").
// Child rows of a character key off that id. The owner's account row uses acct = "_owner" (py storage/ did the same).
// List items carry `pos` (their index); maps with integer-like keys (trunk, npcbin, slots, team ids) need no order
// column because a JS object always iterates those in ascending order.
//
// No foreign keys between game tables: every row is written by the projection, which keeps them consistent, and a
// write is a batch of upserts/deletes in any order. The one FK is accounts.user_id -> user.id (better-auth).
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema.ts";

const int = (name: string) => integer(name);
const bool = (name: string) => integer(name, { mode: "boolean" });

/** state.json `rec` keys, in the order py's blank_profile writes them (the player record, persist.ts REC). */
export const REC_KEYS = [
  "player_id", "lv", "score", "mp", "unk_b0", "wins", "unk_b4", "unk_b6", "unk_b8", "losses", "match_wins", "match_losses",
  "single_wins", "single_losses", "duels", "unk_c6", "duels_won", "duels_lost", "duels_drawn", "duels_void", "turns",
  "surrender_me", "surrender_opp", "lp_total", "side_swaps", "tribute1", "tribute2", "tribute3", "fusions", "ss_grave",
  "ss_total", "trap_me", "trap_opp", "spell_me", "spell_opp", "effect_me", "effect_opp", "comeback_wins", "comeback_losses",
  "unk_108", "unk_10c", "unk_110", "title", "unk_116", "recovery_flags", "champ_pending", "tp", "tp_rank",
] as const;

// ---------------------------------------------------------------- accounts and logins

/** One row per account: state.accounts[acct], and acct = "_owner" for the owner's keys at the root of state.json.
 *  The account key is accounts.acct (py's 16-hex account id, or "u:<userId>" for an account a signed-in user made).
 *  user_id = state.accounts[acct].user_id, the Duel Evolution user who claimed it (NULL = unclaimed; the owner's root
 *  account never has one). de-auth claims with UPDATE accounts SET user_id = ? WHERE acct = ? AND user_id IS NULL. */
export const accounts = sqliteTable("accounts", {
  acct: text("acct").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  isOwner: bool("is_owner").notNull(),
  idx: int("idx"),
  activeSlot: int("active_slot"),
  walletMp: int("wallet_mp"),          // legacy `wallet` {mp} (tienda/cartera.py)
}, (t) => [index("accounts_user_id_idx").on(t.userId)]);

/** accounts[acct].players: slot -> character name (what PLAYERLIST shows before a profile exists). */
export const accountPlayers = sqliteTable("account_players", {
  acct: text("acct").notNull(),
  slot: text("slot").notNull(),
  name: text("name"),
}, (t) => [primaryKey({ columns: [t.acct, t.slot] })]);

/** state.logins.usuarios: account -> panel user name. */
export const logins = sqliteTable("logins", {
  acct: text("acct").primaryKey(),
  user: text("user"),
});

/** state.logins.alias: password alias (login id hash) -> account. */
export const loginAliases = sqliteTable("login_aliases", {
  alias: text("alias").primaryKey(),
  acct: text("acct"),
});

// ---------------------------------------------------------------- characters

/** A profile: py profiles[slot] (or an archived one). Every `rec` stat is a column named like its state.json key. */
export const characters = sqliteTable("characters", {
  id: text("id").primaryKey(),         // JSON path of the profile (see the top of this file)
  acct: text("acct").notNull(),
  slot: text("slot"),                  // null for an archived profile (archived_characters has its old slot)
  name: text("name"),
  country: text("country"),
  avatarA: text("avatar_a"),           // 16 B hex, Duel Academy look
  avatarB: text("avatar_b"),           // 16 B hex, Domino look
  team: int("team"),                   // equipos team id (py EQ profile_set)
  pvpN: int("pvp_n"),                  // pvp.n: PvP games played (XP)
  pvpLastResult: int("pvp_last_result"), // pvp.last {result, t}: the last PvP game (py pvp_match.pvp_record)
  pvpLastT: int("pvp_last_t"),
  lastNpc: int("last_npc"),            // last_npc_end {npc, result, present}
  lastResult: text("last_result"),
  lastPresent: int("last_present"),
  playerId: int("player_id"), lv: int("lv"), score: int("score"), mp: int("mp"), unkB0: int("unk_b0"), wins: int("wins"),
  unkB4: int("unk_b4"), unkB6: int("unk_b6"), unkB8: int("unk_b8"), losses: int("losses"), matchWins: int("match_wins"),
  matchLosses: int("match_losses"), singleWins: int("single_wins"), singleLosses: int("single_losses"), duels: int("duels"),
  unkC6: int("unk_c6"), duelsWon: int("duels_won"), duelsLost: int("duels_lost"), duelsDrawn: int("duels_drawn"),
  duelsVoid: int("duels_void"), turns: int("turns"), surrenderMe: int("surrender_me"), surrenderOpp: int("surrender_opp"),
  lpTotal: int("lp_total"), sideSwaps: int("side_swaps"), tribute1: int("tribute1"), tribute2: int("tribute2"),
  tribute3: int("tribute3"), fusions: int("fusions"), ssGrave: int("ss_grave"), ssTotal: int("ss_total"),
  trapMe: int("trap_me"), trapOpp: int("trap_opp"), spellMe: int("spell_me"), spellOpp: int("spell_opp"),
  effectMe: int("effect_me"), effectOpp: int("effect_opp"), comebackWins: int("comeback_wins"),
  comebackLosses: int("comeback_losses"), unk108: int("unk_108"), unk10c: int("unk_10c"), unk110: int("unk_110"),
  title: int("title"), unk116: int("unk_116"), recoveryFlags: int("recovery_flags"), champPending: int("champ_pending"),
  tp: int("tp"), tpRank: int("tp_rank"),
}, (t) => [index("characters_acct_idx").on(t.acct, t.slot)]);

/** The trunk: card -> copies. */
export const trunkCards = sqliteTable("trunk_cards", {
  charId: text("char_id").notNull(),
  card: int("card").notNull(),
  qty: int("qty"),
}, (t) => [primaryKey({ columns: [t.charId, t.card] })]);

/** PBIN bits that are set (titles, rights, recipes): py keeps them as a sorted list. */
export const titles = sqliteTable("titles", {
  charId: text("char_id").notNull(),
  bit: int("bit").notNull(),
}, (t) => [primaryKey({ columns: [t.charId, t.bit] })]);

/** NPCBIN: npc -> [b0 wins, b1 losses, b2 draws, b3 chain step]. */
export const npcProgress = sqliteTable("npc_progress", {
  charId: text("char_id").notNull(),
  npc: int("npc").notNull(),
  b0: int("b0"), b1: int("b1"), b2: int("b2"), b3: int("b3"),
}, (t) => [primaryKey({ columns: [t.charId, t.npc] })]);

/** claims: ["sd", deck id, right bit] per structure deck taken (SD_GET). */
export const claims = sqliteTable("claims", {
  charId: text("char_id").notNull(),
  pos: int("pos").notNull(),
  kind: text("kind"),
  deck: int("deck"),
  bit: int("bit"),
}, (t) => [primaryKey({ columns: [t.charId, t.pos] })]);

/** The prize queue (B09): pending packages {bits, cards, via, src}. */
export const pendingItems = sqliteTable("pending_items", {
  charId: text("char_id").notNull(),
  pos: int("pos").notNull(),
  via: text("via"),
  src: text("src"),
}, (t) => [primaryKey({ columns: [t.charId, t.pos] })]);

export const pendingItemBits = sqliteTable("pending_item_bits", {
  charId: text("char_id").notNull(),
  itemPos: int("item_pos").notNull(),
  pos: int("pos").notNull(),
  bit: int("bit"),
}, (t) => [primaryKey({ columns: [t.charId, t.itemPos, t.pos] })]);

export const pendingItemCards = sqliteTable("pending_item_cards", {
  charId: text("char_id").notNull(),
  itemPos: int("item_pos").notNull(),
  pos: int("pos").notNull(),
  card: int("card"),
}, (t) => [primaryKey({ columns: [t.charId, t.itemPos, t.pos] })]);

/** pvp_card_due: the card owed after a PvP (§14), {packs, n, t}. */
export const pvpCardDues = sqliteTable("pvp_card_dues", {
  charId: text("char_id").notNull(),
  pos: int("pos").notNull(),
  n: int("n"),
  t: int("t"),
}, (t) => [primaryKey({ columns: [t.charId, t.pos] })]);

export const pvpCardDuePacks = sqliteTable("pvp_card_due_packs", {
  charId: text("char_id").notNull(),
  duePos: int("due_pos").notNull(),
  pos: int("pos").notNull(),
  pack: int("pack"),
}, (t) => [primaryKey({ columns: [t.charId, t.duePos, t.pos] })]);

/** npc_card_due (NPC_RULES_2008): packs owed one card each. */
export const npcCardDues = sqliteTable("npc_card_dues", {
  charId: text("char_id").notNull(),
  pos: int("pos").notNull(),
  pack: int("pack"),
}, (t) => [primaryKey({ columns: [t.charId, t.pos] })]);

/** The profile's friends list (player ids, in the order they were added). */
export const characterFriends = sqliteTable("character_friends", {
  charId: text("char_id").notNull(),
  pos: int("pos").notNull(),
  pid: int("pid"),
}, (t) => [primaryKey({ columns: [t.charId, t.pos] })]);

// ---- decks: decks.last_duel (the deck of the last duel) and decks.historial (research/seguridad_duelo)

export const lastDuelDecks = sqliteTable("last_duel_decks", {
  charId: text("char_id").primaryKey(),
  sideCount: int("side_count"),
});

/** zone = "main" | "extra". */
export const lastDuelCards = sqliteTable("last_duel_cards", {
  charId: text("char_id").notNull(),
  zone: text("zone").notNull(),
  pos: int("pos").notNull(),
  card: int("card"),
}, (t) => [primaryKey({ columns: [t.charId, t.zone, t.pos] })]);

/** last_duel.missing: card -> copies the trunk lacked. */
export const lastDuelMissing = sqliteTable("last_duel_missing", {
  charId: text("char_id").notNull(),
  card: int("card").notNull(),
  n: int("n"),
}, (t) => [primaryKey({ columns: [t.charId, t.card] })]);

/** last_duel.bad_ids: card ids without art (B05). */
export const lastDuelBadIds = sqliteTable("last_duel_bad_ids", {
  charId: text("char_id").notNull(),
  pos: int("pos").notNull(),
  card: int("card"),
}, (t) => [primaryKey({ columns: [t.charId, t.pos] })]);

/** decks.historial: {hash, main, extra, primera, duelos, ultima, valido, problemas}, the latest last. */
export const deckHistory = sqliteTable("deck_history", {
  charId: text("char_id").notNull(),
  pos: int("pos").notNull(),
  hash: text("hash"),
  firstAt: int("first_at"),            // primera (epoch s)
  duels: int("duels"),                 // duelos
  lastAt: int("last_at"),              // ultima
  valid: bool("valid"),                // valido
}, (t) => [primaryKey({ columns: [t.charId, t.pos] })]);

export const deckHistoryCards = sqliteTable("deck_history_cards", {
  charId: text("char_id").notNull(),
  histPos: int("hist_pos").notNull(),
  zone: text("zone").notNull(),
  pos: int("pos").notNull(),
  card: int("card"),
}, (t) => [primaryKey({ columns: [t.charId, t.histPos, t.zone, t.pos] })]);

/** historial[i].problemas: {regla, id, nombre, usa, tiene, max, min?, zona?, texto?} (mazo.check). */
export const deckHistoryProblems = sqliteTable("deck_history_problems", {
  charId: text("char_id").notNull(),
  histPos: int("hist_pos").notNull(),
  pos: int("pos").notNull(),
  rule: text("rule"),                  // regla
  card: int("card"),                   // id
  cardName: text("card_name"),         // nombre
  uses: int("uses"),                   // usa
  has: int("has"),                     // tiene
  max: int("max"),
  min: int("min"),
  zone: text("zone"),                  // zona
  text: text("text"),                  // texto
}, (t) => [primaryKey({ columns: [t.charId, t.histPos, t.pos] })]);

/** profiles_borrados: {slot, motivo, fecha, perfil}; the profile itself is a characters row with id = char_id. */
export const archivedCharacters = sqliteTable("archived_characters", {
  acct: text("acct").notNull(),
  pos: int("pos").notNull(),
  slot: text("slot"),
  reason: text("reason"),              // motivo ("crear" / "borrar")
  archivedAt: text("archived_at"),     // fecha, py strftime
  charId: text("char_id").notNull(),
}, (t) => [primaryKey({ columns: [t.acct, t.pos] })]);

// ---------------------------------------------------------------- lobby, teams, misc root keys

/** The misc root keys and the scalars of state.lobby / state.equipos (a single row, id = 1). */
export const world = sqliteTable("world", {
  id: int("id").primaryKey(),
  ownerAcct: text("owner_acct"),
  schema: int("schema"),               // st.schema (persistencia SCHEMA)
  lobbyNextMail: int("lobby_next_mail"),
  lobbyTeam: int("lobby_team"),        // lobby.team: null when absent, 0 = null, 1 = a team (the columns below)
  lobbyTeamId: int("lobby_team_id"),
  lobbyTeamName: text("lobby_team_name"),
  equiposNextId: int("equipos_next_id"),
});

/** state.lobby.mail, in order. */
export const mail = sqliteTable("mail", {
  pos: int("pos").primaryKey(),
  id: int("id"),
  fromPid: int("from_pid"),
  fromName: text("from_name"),
  toPid: int("to_pid"),
  toName: text("to_name"),
  subject: text("subject"),
  body: text("body"),
  sentAt: int("sent_at"),              // t
  extra: text("extra"),
  read: bool("read"),
});

export const lobbyFriends = sqliteTable("lobby_friends", {
  pos: int("pos").primaryKey(),
  pid: int("pid"),
});

export const lobbyBlack = sqliteTable("lobby_black", {
  pos: int("pos").primaryKey(),
  pid: int("pid"),
});

/** lobby.team.members: [pid, name]. */
export const lobbyTeamMembers = sqliteTable("lobby_team_members", {
  pos: int("pos").primaryKey(),
  pid: int("pid"),
  name: text("name"),
});

/** state.equipos.teams: key (str(id)) -> {id, name, flag, leader, members, created}. */
export const teams = sqliteTable("teams", {
  key: text("key").primaryKey(),
  id: int("id"),
  name: text("name"),
  flag: text("flag"),                  // 16 B hex
  leader: int("leader"),
  created: int("created"),
});

/** teams[key].members: [pid, name, auth]. */
export const teamMembers = sqliteTable("team_members", {
  teamKey: text("team_key").notNull(),
  pos: int("pos").notNull(),
  pid: int("pid"),
  name: text("name"),
  auth: int("auth"),
}, (t) => [primaryKey({ columns: [t.teamKey, t.pos] })]);

// ---------------------------------------------------------------- exact round trip (db/project.ts)

/** Key order of an object, only when it is not the default one (the root's is always stored). keys = JSON array of
 *  key names: this is shape metadata, not data. */
export const stateShapes = sqliteTable("state_shapes", {
  path: text("path").primaryKey(),
  keys: text("keys").notNull(),
});

/** Values the tables above do not model: an unknown key some module added, or a value of an unexpected type (a
 *  float where an integer goes, a list with a hole...). JSON text. Empty for every state.json seen so far; it is there
 *  so that nothing a py-shaped handler writes is ever dropped. */
export const stateExtras = sqliteTable("state_extras", {
  path: text("path").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
}, (t) => [primaryKey({ columns: [t.path, t.key] })]);

// ---------------------------------------------------------------- admin data (py files next to state.json; db/admin.ts)

/** py admin_vetados.json: banned accounts. */
export const adminBans = sqliteTable("admin_bans", {
  acct: text("acct").primaryKey(),
  reason: text("reason").notNull().default(""),
  since: text("since").notNull().default(""),
});

/** py gm_cuentas.json: GM accounts. */
export const adminGm = sqliteTable("admin_gm", {
  acct: text("acct").primaryKey(),
  note: text("note").notNull().default(""),
  since: text("since").notNull().default(""),
});

/** Sanction bits per account sent in 0x3004 (0x20 chat, 0x40 trade). */
export const adminFlags = sqliteTable("admin_flags", {
  acct: text("acct").primaryKey(),
  flags: int("flags").notNull().default(0),
});

/** py admin_regalos.json: what a new character starts with (a single row, id = 1). */
export const adminStart = sqliteTable("admin_start", {
  id: int("id").primaryKey(),
  mp: int("mp"),
  trunk: text("trunk"),                // baul: trunk start mode
});

/** py admin_tienda.json precios + sobres (merged, as py's shop_prices does): key -> MP. */
export const shopPrices = sqliteTable("shop_prices", {
  key: text("key").primaryKey(),
  mp: int("mp").notNull(),
});

// ---- the player's own decks (game/decks.ts, the web client's Deck folder sync). Not part of the state (no
// projection, never in the WorldDO's memory): read and written per request. char_key = "<acct>/<slot>".
// main/side/extra: JSON arrays of passcodes in the .ydc's order. deleted = 1: a tombstone (another device mustn't
// upload it again).
export const userDecks = sqliteTable("user_decks", {
  charKey: text("char_key").notNull(),
  name: text("name").notNull(),
  main: text("main").notNull(),
  side: text("side").notNull(),
  extra: text("extra").notNull(),
  updated: int("updated").notNull(),
  deleted: int("deleted").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.charKey, t.name] })]);

/** mode = "world" | "free": each keeps its own current deck (an unowned Free deck never becomes the World's). */
export const userDeckCurrent = sqliteTable("user_deck_current", {
  charKey: text("char_key").notNull(),
  mode: text("mode").notNull(),
  name: text("name").notNull(),
  updated: int("updated").notNull(),
}, (t) => [primaryKey({ columns: [t.charKey, t.mode] })]);
