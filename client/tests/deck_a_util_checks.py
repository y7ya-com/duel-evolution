"""yo2DeckUtil.cpp data checks against YOLaucher (loaded by tests/deck_a_test.py, check(exe)):
  - the structure icon's frame colour (0x00933590) for every card of research/ia/cards_yo2.csv: its card_prop type is
    the csv "kind" >> 1 (build_ia_tables.py: kind = word & 0x3f), and the colour must follow kind_txt; this also
    confirms research/seguridad_duelo/mazo.py's "fusion = card_prop 2/3 = csv kind 5/7";
  - deck-file stems (0x00932890) of the names the deck list shows.
"""
import csv
import os
import subprocess

EMU = os.environ.get("YO2_EMU_DIR", "/Users/y/Documents/GitHub/YOLaucher-web/tools/yo2emu")
FRAME = {"normal": 0, "token": 0, "fusión": 3, "fusión-efecto": 3, "ritual": 2, "ritual-efecto": 2,
         "mágica": 4, "trampa": 5}   # everything else (effect, toon, spirit, union, gemini, token-effect) is 1


def check(exe):
    rows = list(csv.DictReader(open(os.path.join(EMU, "research", "ia", "cards_yo2.csv"), encoding="utf-8")))
    types = sorted({int(r["kind"]) >> 1 for r in rows})
    got = subprocess.check_output([exe, "util", "frame", *map(str, types)], text=True).split()
    frame = dict(zip(types, map(int, got)))
    for r in rows:
        want = FRAME.get(r["kind_txt"], 1)
        assert frame[int(r["kind"]) >> 1] == want, (r["yo2_id"], r["kind"], r["kind_txt"], frame)
    assert {int(r["kind"]) >> 1 for r in rows if r["kind_txt"].startswith("fusi")} == {2, 3}
    for path, want in (("deck\\Yugi Muto.ydc", "5 Yugi Muto"), ("C:/a.b/deck.v2.ydc", "7 deck.v2"),
                       ("plain.ydc", "0 ")):
        out = subprocess.check_output([exe, "util", "stem", path], text=True).rstrip("\n")
        assert out == want, (path, out)
    print(f"ok: structure-icon frame of all {len(rows)} cards_yo2.csv cards; deck-file stems")
