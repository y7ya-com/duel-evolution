#!/usr/bin/env bash
# Read-only snapshot of the production economy state for server/docs/ECONOMY.md.
#
#   server/scripts/economy/dump.sh [OUT_DIR]      (default /tmp/econ-raw)
#
# Every statement is a SELECT against the production D1 (duel-evolution-prod). The raw rows hold account ids, so they
# go to OUT_DIR (outside the repo) and are never committed; analyze.py reads them and prints aggregates only.
# Per-player state lives in D1 (the WorldDO projects state.json onto the tables in src/db/game-schema.ts): balances
# and records on `characters`, the MP wallet / day counters / cosmetics ledger as JSON in `state_extras`.
set -euo pipefail
OUT=${1:-/tmp/econ-raw}
HERE=$(cd "$(dirname "$0")" && pwd)
SERVER=$(cd "$HERE/../.." && pwd)
mkdir -p "$OUT"
chmod 700 "$OUT"

q() { # q NAME SQL
  local name=$1 sql=$2
  case "$(printf '%s' "$sql" | tr '[:lower:]' '[:upper:]' | sed 's/^[[:space:]]*//')" in
    SELECT*) ;;
    *) echo "refusing a non-SELECT statement for $name" >&2; exit 1 ;;
  esac
  (cd "$SERVER" && npx wrangler d1 execute duel-evolution-prod --remote --env production --json --command "$sql") \
    2>/dev/null >"$OUT/$name.json"
  python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(sys.argv[2], len(d[0]['results']), 'rows')" "$OUT/$name.json" "$name"
}

q characters "SELECT c.id, c.acct, c.slot, c.mp, c.lv, c.duels, c.duels_won, c.duels_lost, c.duels_drawn, c.duels_void,
  c.wins, c.losses, c.pvp_n, c.pvp_last_t, c.avatar_a, c.avatar_b, a.user_id, a.is_owner FROM characters c LEFT JOIN accounts a ON a.acct = c.acct"
q extras "SELECT path, key, value FROM state_extras WHERE key IN ('econ','mp_wallet','mp_bound','bound','prog','starter','cosmetics','shop_api')"
q users "SELECT id, created_at FROM user"
q sessions "SELECT user_id, created_at, updated_at, expires_at FROM session"
q staff "SELECT user_id, role FROM role_grant"
q gm "SELECT acct FROM admin_gm"
q bans "SELECT acct FROM admin_bans"
q trunk "SELECT char_id, count(*) AS distinct_cards, sum(qty) AS copies FROM trunk_cards GROUP BY char_id"
q deck_history "SELECT char_id, min(first_at) AS first_at, max(last_at) AS last_at, sum(duels) AS duels, count(*) AS decks FROM deck_history GROUP BY char_id"
q npc "SELECT char_id, sum(b0) AS w, sum(b1) AS l, sum(b2) AS d, count(*) AS npcs FROM npc_progress GROUP BY char_id"
q user_decks "SELECT char_key, max(updated) AS updated, count(*) AS n FROM user_decks GROUP BY char_key"
q titles "SELECT char_id, bit FROM titles WHERE bit < 1024"
q archived "SELECT acct, reason, archived_at, char_id FROM archived_characters"
q claims "SELECT char_id, kind, deck FROM claims"
q npc_dues "SELECT char_id, count(*) AS n FROM npc_card_dues GROUP BY char_id"
q pvp_dues "SELECT char_id, sum(n) AS n FROM pvp_card_dues GROUP BY char_id"
q shop_prices "SELECT key, mp FROM shop_prices"
q admin_start "SELECT id, mp, trunk FROM admin_start"
date -u +%Y-%m-%dT%H:%M:%SZ >"$OUT/taken_at.txt"
echo "raw snapshot in $OUT (do not commit)"
