"""D1 to real passcodes (the card wire): every card column of the game tables, from the 2008 client's card ids to
passcodes, plus the deck-history hashes (deckCheck.ts deckHash, over the cards). One SQL file, checked on a copy first.

The deploy does this itself (do.ts: game/passcodes.ts converts a schema-2 state on load and writes it back), so this is
the offline check: run it on a copy of the backup to see the conversion before the deploy, or by hand if that failed.

  npx wrangler d1 export duel-evolution-prod --env production --remote --output backup.sql   # the backup (keep it)
  sqlite3 copy.db < backup.sql
  python3 -I scripts/passcode_d1.py copy.db migrate.sql        # writes the SQL, runs it on copy.db, checks it
  npx wrangler d1 execute duel-evolution-prod --env production --remote --file migrate.sql

Refuses when a card id has no passcode (gamedata/cards.json, client/tools/cardart.py) or the database was already
migrated (world.schema 3). The map is Konami-derived: migrate.sql is never committed.
"""
import hashlib
import json
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# (table, card column, key columns): every column that holds a card id (src/db/game-schema.ts)
COLS = [("trunk_cards", "card", ("char_id",)), ("pending_item_cards", "card", ("char_id", "item_pos", "pos")),
        ("last_duel_cards", "card", ("char_id", "zone", "pos")), ("last_duel_missing", "card", ("char_id",)),
        ("last_duel_bad_ids", "card", ("char_id", "pos")), ("deck_history_cards", "card", ("char_id", "hist_pos", "zone", "pos")),
        ("deck_history_problems", "card", ("char_id", "hist_pos", "pos"))]
SCHEMA = 3   # persist.ts SCHEMA: card ids are passcodes


def deck_hash(main, extra):   # deckCheck.ts deckHash
    s = ",".join(map(str, sorted(main))) + "|" + ",".join(map(str, sorted(extra)))
    return hashlib.sha1(s.encode()).hexdigest()[:16]


def stats(db):   # what must not change: rows per table, copies per character
    out = {t: db.execute(f"select count(*) from {t}").fetchone()[0] for t, _, _ in COLS}
    out["copies"] = dict(db.execute("select char_id, sum(qty) from trunk_cards group by char_id").fetchall())
    return out


def main():
    src, out = sys.argv[1], sys.argv[2]
    pc = {c["i"]: c["pc"] for c in json.load(open(os.path.join(HERE, "gamedata", "cards.json")))}
    db = sqlite3.connect(src)
    if db.execute("select schema from world where id = 1").fetchone() == (SCHEMA,):
        sys.exit("already migrated (world.schema 3)")
    missing = {}
    for t, col, _ in COLS:
        for (v,) in db.execute(f"select distinct {col} from {t} where {col} is not null"):
            if v not in pc: missing.setdefault(t, set()).add(v)
    if missing:
        sys.exit("card ids without a passcode: " + "; ".join(f"{t}: {sorted(v)[:20]}" for t, v in missing.items()))
    sql = ["create table _cardmap (old integer primary key, pc integer not null);"]
    items = sorted(pc.items())
    for k in range(0, len(items), 400):
        sql.append("insert into _cardmap values " + ",".join(f"({a},{b})" for a, b in items[k:k + 400]) + ";")
    for t, col, _ in COLS:
        sql.append(f"update {t} set {col} = (select pc from _cardmap where old = {t}.{col}) where {col} is not null;")
    # the history's hashes, over the passcodes
    hist = {}
    for char, hpos, zone, card in db.execute("select char_id, hist_pos, zone, card from deck_history_cards where card is not null"):
        hist.setdefault((char, hpos), {"main": [], "extra": []}).setdefault(zone, []).append(pc[card])
    for (char, hpos), z in sorted(hist.items()):
        sql.append("update deck_history set hash = '%s' where char_id = '%s' and pos = %d;"
                   % (deck_hash(z.get("main", []), z.get("extra", [])), char.replace("'", "''"), hpos))
    sql += [f"update world set schema = {SCHEMA} where id = 1;", "drop table _cardmap;"]
    open(out, "w").write("\n".join(sql) + "\n")
    before = stats(db)
    db.executescript("\n".join(sql))   # the dry run, on the copy
    after = stats(db)
    assert before == after, ("rows or copies changed", before, after)
    bad = [(t, v) for t, col, _ in COLS for (v,) in db.execute(f"select distinct {col} from {t} where {col} is not null") if v in pc and v < 100000 and v not in pc.values()]
    assert not bad, ("old ids left", bad[:10])
    db.commit()
    print(f"{out}: {len(sql)} statements; on {src}: rows and per-character copies unchanged "
          f"({', '.join(f'{t} {n}' for t, n in after.items() if t != 'copies')}; {len(after['copies'])} characters)")


if __name__ == "__main__":
    main()
