"""Part "kaban" data checks (run by tests/deck_a_test.py): the trunk search dialogs' "all values" lists
(CWindowTaskKabanSearch::update, FUN_0095c480) cover exactly the values YOLaucher's card table (research/ia/cards_yo2.csv,
the 3243 cards of the 2008 client) has for each searchable column, for the cards that can be in a trunk
(limit 65535 = gods and tokens never are)."""
import csv
import os
import subprocess

EMU = os.environ.get("YO2_EMU_DIR", "/Users/y/Documents/GitHub/YOLaucher-web/tools/yo2emu")
KS_MATCH, KS_SORT_DOWN, KS_SORT_UP = 0x1e, 0x1f, 0x20
SPELL, TRAP = 27, 29   # csv kind of magic / trap cards


def lists(exe, field):
    out = subprocess.check_output([exe, "kaban", "all", str(field)], text=True).split("\n")
    rows = [list(map(int, l.split())) for l in out if l.strip()]
    assert len(rows) == 2 and {rows[0][0], rows[1][0]} == {KS_SORT_DOWN, KS_SORT_UP}, rows
    assert sorted(rows[0][1:]) == sorted(rows[1][1:]) and len(set(rows[0][1:])) == len(rows[0][1:]), rows
    return set(rows[0][1:])


def check(exe):
    cards = [r for r in csv.DictReader(open(os.path.join(EMU, "research", "ia", "cards_yo2.csv"), encoding="utf-8"))
             if r["limit"] != "65535"]
    monsters = [r for r in cards if int(r["kind"]) not in (SPELL, TRAP)]
    races = {int(r["race"]) for r in monsters}
    assert lists(exe, 3) == set(range(1, 21)) and races <= set(range(1, 21)), races
    # attribute 1..9 with 8 = magic, 9 = trap; 7 (divine) is listed though only the gods (never in a trunk) have it
    assert lists(exe, 4) - {int(r["attr"]) for r in cards} == {7}
    assert lists(exe, 8) == {int(r["level"]) for r in monsters}
    assert lists(exe, 9) == {int(r["limit"]) for r in cards} == {0, 1, 2, 3}
    icons = {r["spell_icon"] for r in cards if r["spell_icon"]}
    assert len(lists(exe, 5)) == len(icons) == 7, icons
    rng = lambda *a: subprocess.check_output([exe, "kaban", "range", *map(str, a)], text=True).split()
    assert rng(3000, 1200, 1, 0) == [str(KS_SORT_DOWN), "1200", "3000"] and rng(0, 0, 1, 1) == [str(KS_SORT_UP), "10000", "0"]
    print(f"ok: kaban search lists match cards_yo2.csv ({len(cards)} trunk cards: {len(races)} races, "
          f"{len(icons)} spell icons, levels, attributes, limits)")
