#!/usr/bin/env python3
"""Aggregate the production economy snapshot (dump.sh) into the numbers in server/docs/ECONOMY.md.

    python3 -I server/scripts/economy/analyze.py [RAW_DIR]        (default /tmp/econ-raw)

Reads RAW_DIR/*.json (raw rows, never committed) and prints ONLY aggregates (counts, sums, quantiles); it also writes
them to RAW_DIR/aggregates.json. No account id, name or timestamp of an individual leaves this script.

Units: one "player" is one Duel Evolution user (better-auth `user`) and the game account it claimed (accounts.user_id).
An account holds up to 4 live characters, each with its own MP balance; the cosmetics wardrobe is per account.
"""
import json
import statistics
import sys
from collections import defaultdict
from datetime import datetime, timezone

RAW = sys.argv[1] if len(sys.argv) > 1 else "/tmp/econ-raw"

# persist.ts ECON (unchanged since 2026-10-28 20:46Z, cbe9596)
START_MP, FREE_STARTS = 5000, 6
NPC_WIN, NPC_LOSS, PVP_WIN, PVP_LOSS, FIRST_WIN = 150, 50, 250, 100, 300
LAUNCH = datetime(2026, 10, 28, 20, 46, tzinfo=timezone.utc)  # PROGRESSION + ECON live


def rows(name):
    with open(f"{RAW}/{name}.json") as f:
        return json.load(f)[0]["results"]


def q(xs, p):
    """Linear-interpolated quantile (p in 0..1); None for an empty list."""
    xs = sorted(xs)
    if not xs:
        return None
    k = (len(xs) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(xs) - 1)
    return round(xs[lo] + (xs[hi] - xs[lo]) * (k - lo), 1)


def dist(xs):
    xs = list(xs)
    return {"n": len(xs), "mean": round(statistics.fmean(xs), 1) if xs else None, "p10": q(xs, .1), "p25": q(xs, .25),
            "median": q(xs, .5), "p75": q(xs, .75), "p90": q(xs, .9), "max": max(xs) if xs else None,
            "sum": sum(xs)}


def day_of(ts):
    if ts is None:
        return None
    ts = ts / 1000 if ts > 1e11 else ts  # ms or s
    return datetime.fromtimestamp(ts, timezone.utc).date().isoformat()


def ts_s(ts):
    return None if ts is None else (ts / 1000 if ts > 1e11 else ts)


with open(f"{RAW}/taken_at.txt") as f:
    TAKEN = datetime.fromisoformat(f.read().strip().replace("Z", "+00:00"))
TODAY = TAKEN.date().isoformat()

chars = rows("characters")
extras = defaultdict(dict)
for r in rows("extras"):
    extras[r["path"]][r["key"]] = json.loads(r["value"])
users = {r["id"]: r for r in rows("users")}
staff_users = {r["user_id"] for r in rows("staff")}
gm_accts = {r["acct"] for r in rows("gm")}
trunk = {r["char_id"]: r for r in rows("trunk")}
npc = {r["char_id"]: r for r in rows("npc")}
deckh = {r["char_id"]: r for r in rows("deck_history")}
titles = defaultdict(set)
for r in rows("titles"):
    titles[r["char_id"]].add(r["bit"])

acct_user = {}
by_acct = defaultdict(list)
for c in chars:
    by_acct[c["acct"]].append(c)
    if c["user_id"]:
        acct_user[c["acct"]] = c["user_id"]
user_acct = {u: a for a, u in acct_user.items()}


def excluded(acct):
    return acct in gm_accts or acct_user.get(acct) in staff_users or acct == "_owner"


# ---------------------------------------------------------------- activity: the UTC days each account was seen
seen = defaultdict(set)      # acct -> days with any trace
last_seen = {}               # acct -> epoch s


def mark(acct, ts):
    t = ts_s(ts)
    if acct is None or t is None:
        return
    seen[acct].add(day_of(t))
    last_seen[acct] = max(last_seen.get(acct, 0), t)


for s in rows("sessions"):
    a = user_acct.get(s["user_id"])
    mark(a, s["created_at"]); mark(a, s["updated_at"])
for c in chars:
    e = extras[c["id"]].get("econ")
    if e:
        seen[c["acct"]].add(e["day"])
        last_seen[c["acct"]] = max(last_seen.get(c["acct"], 0),
                                   datetime.fromisoformat(e["day"]).replace(tzinfo=timezone.utc).timestamp())
    d = deckh.get(c["id"])
    if d:
        mark(c["acct"], d["first_at"]); mark(c["acct"], d["last_at"])
    mark(c["acct"], c["pvp_last_t"])
for r in rows("user_decks"):
    mark(r["char_key"].rsplit("/", 1)[0], r["updated"])
launch_day = LAUNCH.date().isoformat()
for a in seen:
    seen[a] = {d for d in seen[a] if d and d >= launch_day}

# ---------------------------------------------------------------- per-account lifetime figures
acc = {}
for a, cs in by_acct.items():
    if excluded(a):
        continue
    legacy = not a.startswith("u:")
    live = [c for c in cs if c["slot"] is not None]
    duels = sum(c["duels"] or 0 for c in cs)
    won = sum(c["duels_won"] or 0 for c in cs)
    lost = sum(c["duels_lost"] or 0 for c in cs)
    drawn = sum(c["duels_drawn"] or 0 for c in cs)
    nw = sum((npc.get(c["id"]) or {}).get("w") or 0 for c in cs)
    nl = sum((npc.get(c["id"]) or {}).get("l") or 0 for c in cs)
    nd = sum((npc.get(c["id"]) or {}).get("d") or 0 for c in cs)
    pvp_games = sum(c["pvp_n"] or 0 for c in cs)
    pw, pl = max(0, won - nw), max(0, lost - nl)
    days = sorted(seen.get(a, ()))
    win_days = min(len(days), won)  # first-win bonus: at most one per active day with a win (upper bound)
    earned_model = NPC_WIN * nw + NPC_LOSS * (nl + nd) + PVP_WIN * pw + PVP_LOSS * pl + FIRST_WIN * win_days
    grants = START_MP * min(len(cs), FREE_STARTS)
    balance = sum(c["mp"] or 0 for c in live)
    bound = 0
    for c in live:
        x = extras[c["id"]]
        w = x.get("mp_wallet", {}).get("bound") if isinstance(x.get("mp_wallet"), dict) else None
        b = w if w is not None else (x.get("mp_bound") or 0)
        bound += max(0, min(int(b), c["mp"] or 0))
    ledger_chars = sum(1 for c in live if "mp_wallet" in extras[c["id"]] or "mp_bound" in extras[c["id"]])
    u = acct_user.get(a)
    created = ts_s(users[u]["created_at"]) if u in users else None
    acc[a] = dict(legacy=legacy, live=len(live), chars=len(cs), duels=duels, won=won, lost=lost, npc_w=nw, npc_l=nl,
                  npc_d=nd, pvp_games=pvp_games, pvp_w=pw, pvp_l=pl, days=days, earned_model=earned_model,
                  grants=grants, balance=balance, bound=bound, ledger_chars=ledger_chars,
                  spent_implied=max(0, grants + earned_model - balance), created=created,
                  last_seen=last_seen.get(a), copies=sum((trunk.get(c["id"]) or {}).get("copies") or 0 for c in live),
                  distinct=max([(trunk.get(c["id"]) or {}).get("distinct_cards") or 0 for c in live] or [0]))

now = TAKEN.timestamp()


def seen_within(a, days):
    t = acc[a]["last_seen"]
    return t is not None and now - t <= days * 86400


played = [a for a in acc if acc[a]["duels"] > 0 or acc[a]["spent_implied"] > 0]
population = {
    "users": len(users), "accounts": len(by_acct), "accounts_excluded_staff_gm": sum(1 for a in by_acct if excluded(a)),
    "accounts_analysed": len(acc), "legacy_2008_accounts": sum(1 for a in acc if acc[a]["legacy"]),
    "characters_live": sum(1 for c in chars if c["slot"] is not None), "characters_archived": sum(1 for c in chars if c["slot"] is None),
    "accounts_with_a_duel": sum(1 for a in acc if acc[a]["duels"] > 0),
    "accounts_with_10_duels": sum(1 for a in acc if acc[a]["duels"] >= 10),
    "accounts_with_50_duels": sum(1 for a in acc if acc[a]["duels"] >= 50),
    "seen_last_1d": sum(1 for a in acc if seen_within(a, 1)), "seen_last_3d": sum(1 for a in acc if seen_within(a, 3)),
    "seen_last_7d": sum(1 for a in acc if seen_within(a, 7)),
    "active_7d_played": sum(1 for a in played if seen_within(a, 7)),
    "active_3d_played": sum(1 for a in played if seen_within(a, 3)),
    "signups_by_day": {d: n for d, n in sorted(
        {day_of(u["created_at"]): sum(1 for v in users.values() if day_of(v["created_at"]) == day_of(u["created_at"]))
         for u in users.values()}.items())},
    "active_days_per_played_account": dist(len(acc[a]["days"]) for a in played),
}
ACTIVE = [a for a in played if seen_within(a, 7)]

# ---------------------------------------------------------------- faucet: the day counters (p.econ) per account
# p.econ is each character's LAST UTC day with a reward or a purchase. For an account, its latest such day summed over
# its characters is one complete measured day (or today's partial one).
acct_day = {}
for a in acc:
    per = defaultdict(lambda: dict(duels=0, wins=0, earned=0, spent=0, packs=0))
    for c in by_acct[a]:
        e = extras[c["id"]].get("econ")
        if not e:
            continue
        t = per[e["day"]]
        for k in t:
            t[k] += int(e.get(k) or 0)
    if per:
        d = max(per)
        acct_day[a] = dict(day=d, **per[d])
full = [v for v in acct_day.values() if v["day"] < TODAY]
duel_days = [v for v in full if v["duels"] > 0]
faucet = {
    "measured_days_complete": len(full), "measured_days_today_partial": sum(1 for v in acct_day.values() if v["day"] == TODAY),
    "earned_per_active_day": dist(v["earned"] for v in full),
    "earned_per_duel_day": dist(v["earned"] for v in duel_days),
    "duels_per_duel_day": dist(v["duels"] for v in duel_days),
    "win_rate_on_duel_days": round(sum(v["wins"] for v in duel_days) / max(1, sum(v["duels"] for v in duel_days)), 3),
    "mp_per_duel": round(sum(v["earned"] for v in duel_days) / max(1, sum(v["duels"] for v in duel_days)), 1),
    "first_win_bonus_share_of_earned": round(FIRST_WIN * sum(1 for v in duel_days if v["wins"]) / max(1, sum(v["earned"] for v in duel_days)), 3),
    "days_at_soft_cap_40": sum(1 for v in duel_days if v["duels"] >= 40),
    "earned_per_duel_day_incl_today": dist(v["earned"] for v in acct_day.values() if v["duels"] > 0),
}
# lifetime model (new accounts only: legacy ones carry 2008/py records from before the economy)
life = [acc[a] for a in ACTIVE if not acc[a]["legacy"] and acc[a]["duels"] > 0]
faucet["lifetime_model"] = {
    "accounts": len(life),
    "earned_total": dist(x["earned_model"] for x in life),
    "earned_per_active_day": dist(round(x["earned_model"] / max(1, len(x["days"]))) for x in life),
    "earned_per_calendar_day_since_signup": dist(round(x["earned_model"] / max(1.0, (now - x["created"]) / 86400)) for x in life if x["created"]),
    "duels_total": dist(x["duels"] for x in life),
    "pvp_share_of_duels": round(sum(x["pvp_w"] + x["pvp_l"] for x in life) / max(1, sum(x["duels"] for x in life)), 3),
    "npc_vs_pvp_mp": {"npc": sum(NPC_WIN * x["npc_w"] + NPC_LOSS * (x["npc_l"] + x["npc_d"]) for x in life),
                      "pvp": sum(PVP_WIN * x["pvp_w"] + PVP_LOSS * x["pvp_l"] for x in life),
                      "first_win": sum(FIRST_WIN * min(len(x["days"]), x["won"]) for x in life)},
}

# ---------------------------------------------------------------- sinks
spend_days = [v for v in full if v["spent"] > 0]
sinks = {
    "spent_per_active_day": dist(v["spent"] for v in full),
    "spent_on_spending_days": dist(v["spent"] for v in spend_days),
    "pack_units_on_spending_days": dist(v["packs"] for v in spend_days),
    "spend_to_earn_ratio_measured_days": round(sum(v["spent"] for v in full) / max(1, sum(v["earned"] for v in full)), 2),
    "lifetime_implied_spent": dist(acc[a]["spent_implied"] for a in ACTIVE if not acc[a]["legacy"]),
    "trunk_copies_per_account": dist(acc[a]["copies"] for a in ACTIVE),
    "trunk_distinct_cards_best_character": dist(acc[a]["distinct"] for a in ACTIVE),
    "shop_prices_overrides_live": len(rows("shop_prices")), "admin_start_override": len(rows("admin_start")),
}
# avatar shop items (glasses / face mark, sold natively until boxes take them): owned bits per live character
AV_SHOP_BITS = {33, 80, 81, 82, 83, 84, 336, 337, 338, 339, 340, 341, 342}
sinks["avatar_shop_items_owned_live_characters"] = sum(len(titles[c["id"]] & AV_SHOP_BITS) for c in chars if c["slot"] is not None)
# cosmetic boxes (live since 2026-11-03 23:35Z)
cos = [v["cosmetics"] for v in extras.values() if "cosmetics" in v]
sinks["cosmetic_ledgers"] = len(cos)
sinks["cosmetic_boxes_opened"] = sum(int(c.get("sequence") or 0) for c in cos)
sinks["cosmetic_duplicate_copies_held"] = sum(sum(c.get("copies", {}).values()) for c in cos)

# ---------------------------------------------------------------- balances
live_chars = [c for c in chars if c["slot"] is not None and not excluded(c["acct"])]
bal = [c["mp"] or 0 for c in live_chars]
untouched = sum(1 for c in live_chars if (c["mp"] or 0) == START_MP and (c["duels"] or 0) == 0)
no_ledger = [c for c in live_chars if "mp_wallet" not in extras[c["id"]] and "mp_bound" not in extras[c["id"]]]
supply = sum(bal)
acct_bal = sorted((acc[a]["balance"] for a in ACTIVE), reverse=True)
top10 = acct_bal[:max(1, len(acct_bal) // 10)]
balances = {
    "per_live_character": dist(bal),
    "per_active_account": dist(acct_bal),
    "supply_total": supply,
    "supply_bound_tracked": sum(acc[a]["bound"] for a in acc),
    "characters_untouched_5000": untouched,
    "characters_without_bound_ledger": len(no_ledger),
    "mp_on_characters_without_bound_ledger": sum(c["mp"] or 0 for c in no_ledger),
    "characters_ge_1500_earned_spendable": sum(1 for c in live_chars if (c["mp"] or 0) - 0 >= 1500
                                               and "mp_wallet" not in extras[c["id"]] and "mp_bound" not in extras[c["id"]]),
    "top10pct_accounts_share_of_active_supply": round(sum(top10) / max(1, sum(acct_bal)), 3),
    "accounts_over_10000": sum(1 for x in acct_bal if x > 10000),
}
# Boxes take only earned MP (cosmetics.ts: balances.earned >= price). A character without a wallet ledger counts its
# whole balance as earned (persist.ts mpBalances), its untouched starting grant included.
def box_eligible(c):
    x = extras[c["id"]]
    w = x.get("mp_wallet")
    b = w.get("bound", 0) if isinstance(w, dict) else (x.get("mp_bound") or 0)
    return max(0, (c["mp"] or 0) - max(0, min(int(b), c["mp"] or 0)))


untouched_by_acct, untouched_mp = defaultdict(int), defaultdict(int)
for c in live_chars:
    # never duelled (so nothing of its balance was earned), nothing tracked as bound, at most the grant left
    if 0 < (c["mp"] or 0) <= START_MP and (c["duels"] or 0) == 0 and box_eligible(c) == (c["mp"] or 0):
        untouched_by_acct[c["acct"]] += 1
        untouched_mp[c["acct"]] += c["mp"] or 0
balances["box_eligible_mp_per_active_account"] = dist(sum(box_eligible(c) for c in by_acct[a] if c["slot"] is not None) for a in ACTIVE)
balances["unearned_grants_counted_as_earned"] = {
    "characters": sum(untouched_by_acct.values()), "mp": sum(untouched_mp.values()),
    "accounts": len(untouched_by_acct), "accounts_with_2plus": sum(1 for n in untouched_by_acct.values() if n >= 2),
    "active_accounts_with_one": sum(1 for a in ACTIVE if untouched_by_acct.get(a)),
}
balances["live_characters_per_account"] = dict(sorted(
    {k: sum(1 for a in acc if acc[a]["live"] == k) for k in {acc[a]["live"] for a in acc}}.items()))

grants_total = sum(acc[a]["grants"] for a in acc if not acc[a]["legacy"])
earned_total = sum(acc[a]["earned_model"] for a in acc if not acc[a]["legacy"])
supply_new = sum(acc[a]["balance"] for a in acc if not acc[a]["legacy"])
days_live = (now - LAUNCH.timestamp()) / 86400
balances["flow_since_launch_new_accounts"] = {
    "days": round(days_live, 2), "grants": grants_total, "earned_model": earned_total, "supply_now": supply_new,
    "spent_implied": grants_total + earned_total - supply_new,
    "spent_over_earned": round((grants_total + earned_total - supply_new) / max(1, earned_total), 2),
    "supply_over_grants": round(supply_new / max(1, grants_total), 2),
    "velocity_spent_per_day_over_supply": round((grants_total + earned_total - supply_new) / days_live / max(1, supply_new), 3),
}

out = {"taken_at": TAKEN.isoformat(), "population": population, "faucet": faucet, "sinks": sinks, "balances": balances}
with open(f"{RAW}/aggregates.json", "w") as f:
    json.dump(out, f, indent=1)
print(json.dumps(out, indent=1))
