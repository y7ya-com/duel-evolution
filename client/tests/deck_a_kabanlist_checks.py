"""Data checks of src/Deck/KabanWindowList.* (the deck editor's trunk list) against YOLaucher's card table,
research/ia/cards_yo2.csv (card_prop.bin of the 2008 client, decoded independently by build_ia_tables.py).
The CLI's trunk is every card of the csv with (id % 4) copies; the edited deck holds a copy of each id % 5 == 0.
  - the filter tabs (FUN_00971270) against the csv's kind *names* (normal/efecto/mágica/...);
  - the search window's queries (FUN_009716e0): ATK/DEF walks and ranges, race/attribute/level/limit/icon sets, the
    name sort;
  - the 9/11-row page (FUN_0096feb0 / FUN_009735d0).
Called by tests/deck_a_test.py with the built deck_a_cli.
"""
import csv
import os
import subprocess

EMU = os.environ.get("YO2_EMU_DIR", "/Users/y/Documents/GitHub/YOLaucher-web/tools/yo2emu")
CSV = os.path.join(EMU, "research", "ia", "cards_yo2.csv")

TABS = {   # tab -> the csv kind names on it
    0: {"normal", "token"},
    1: {"efecto", "toon", "espíritu", "unión", "géminis", "token-efecto?"},
    2: {"mágica"},
    3: {"trampa"},
    4: {"ritual", "ritual-efecto"},
    5: {"fusión", "fusión-efecto"},
}
ICONS = {"normal": 0, "contraefecto": 1, "campo": 2, "equipo": 3, "continua": 4, "rápida": 5, "ritual": 6}


def cards():
    out = {}
    for r in csv.DictReader(open(CSV, encoding="utf-8")):
        stat = lambda v: 0 if int(v) == 5110 else int(v)   # 0x1ff * 10 = "?"
        out[int(r["yo2_id"])] = dict(kid=int(r["konami_id"]), kind=r["kind_txt"], attr=int(r["attr"]),
                                     level=int(r["level"]), race=int(r["race"]), atk=stat(r["atk"]),
                                     defe=stat(r["def"]), limit=int(r["limit"]), icon=ICONS.get(r["spell_icon"], 0))
    return out


def run(exe, *args):
    out = subprocess.run([exe, "kabanlist", CSV, *map(str, args)], capture_output=True, text=True, check=True)
    return [list(map(int, l.split())) for l in out.stdout.splitlines()]


def check(exe):
    C = cards()
    ids = sorted(C)
    listed = lambda i: i % 4 >= 1 or i % 5 == 0          # no copy left, but the deck still holds one
    for tab in range(7):
        want = [i for i in ids if listed(i) and (tab == 6 or C[i]["kind"] in TABS[tab])]
        got = [r[0] for r in run(exe, "category", tab)]
        assert got == want, (tab, len(got), len(want), [x for x in got if x not in want][:5])
    base = [i for i in ids if listed(i)]
    mon = lambda i: C[i]["attr"] < 8

    def search(mode, order, lo, hi, vals=None):
        return [r[0] for r in run(exe, "search", mode, order, lo, hi, ",".join(map(str, vals)) if vals else "-")]

    for mode, key in ((1, "atk"), (2, "defe")):
        want = [i for v in range(1000, 2001, 10) for i in base if mon(i) and C[i][key] == v]
        assert search(mode, 0x1f, 1000, 2000) == want, mode
        want = [i for v in range(2500, 1499, -10) for i in base if mon(i) and C[i][key] == v]
        assert search(mode, 0x20, 2500, 1500) == want, mode
        want = [i for i in base if mon(i) and 0 <= C[i][key] <= 800]
        assert search(mode, 0, 0, 800) == want, mode
    for mode, key, vals in ((3, "race", [3, 14, 1]), (4, "attr", [5, 1]), (8, "level", [4, 8, 1]),
                            (9, "limit", [1, 2])):
        want = [i for v in vals for i in base if C[i][key] == v]
        assert search(mode, 0, 0, 0, vals) == want, (mode, key)
    plain = lambda i: C[i]["kind"] in ("mágica", "trampa") and C[i]["icon"] == 0
    want = [i for i in base if plain(i)] + [i for i in base if C[i]["icon"] == 4]
    assert search(5, 0, 0, 0, [0, 4]) == want, "icon"
    got = search(6, 0, 0, 0)
    keys = [C[i]["kid"] for i in got]
    assert sorted(got) == base and keys == sorted(keys), "name sort"
    for rows, first in ((9, 0), (9, 7), (11, len(base) - 4)):
        page = run(exe, "page", first, rows)
        assert len(page) == 11
        for k, (card, enabled) in enumerate(page):
            want = base[first + k] if first + k < len(base) else 0
            assert enabled == (k < rows) and (k >= rows or card == want), (rows, first, k, card, want)
    print(f"ok: kabanlist tabs, 13 searches and 3 pages over {len(ids)} cards of cards_yo2.csv")
