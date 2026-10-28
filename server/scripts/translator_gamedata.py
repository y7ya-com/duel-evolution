"""Builds server/gamedata/translator.json: what the duel translator (src/duel/translator) needs from Konami's client
(card_prop.bin internal ids, card names matched against cards.cdb) and from EDOPro (cards.cdb types/ATK/DEF/alias,
the chainable effects of every CardScripts c<code>.lua). Konami-derived, so gitignored.

  python3.12 -I scripts/translator_gamedata.py [path/to/YOLaucher-web/tools/yo2emu]

It reuses py's own loaders (research/traductor/cardmap.py CardMap, translator.script_info, research/ia/brain.CardDB), so
the tables are exactly what py computes at runtime.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "gamedata")
EMU = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser("~"), "Documents", "GitHub", "YOLaucher-web", "tools", "yo2emu")
for k in [k for k in os.environ if k.startswith("YO2_")]:      # vanilla profile: py's defaults, no YO2_* overrides
    del os.environ[k]
for p in (EMU, os.path.join(EMU, "research", "traductor"), os.path.join(EMU, "research", "ia")):
    sys.path.insert(0, p)

import translator as TR    # noqa: E402
from cardmap import CardMap  # noqa: E402
import brain               # noqa: E402

BIG = 1 << 53


def num(v):
    """Ints past 2**53 (setcodes) go as decimal strings; the TS side reads them as BigInt."""
    return str(v) if isinstance(v, int) and abs(v) >= BIG else v


def main():
    os.makedirs(OUT, exist_ok=True)
    cm = CardMap()
    db = brain.CardDB.shared()
    cdb = {}
    for code in sorted(cm.cdb_type):
        c = db.get(code)
        atk, df = cm.cdb_stats[code]
        cdb[str(code)] = [cm.cdb_type[code], cm.cdb_alias[code], atk, df,
                          c.race if c else 0, c.attribute if c else 0, num(c.setcode if c else 0), 1 if c else 0]
    scripts = {}
    for code in sorted(cm.cdb_type):
        info = TR.script_info(code)
        if info is not None:
            scripts[str(code)] = [[e["type"], e["code"], e["hint"][0], e["hint"][1], e["desc"]] for e in info["effects"]]
    out = {
        "internal": cm.internal,
        "y2c": {str(k): v for k, v in cm._y2c.items()},
        "c2y": {str(k): v for k, v in cm._c2y.items()},
        "int2y": {str(k): v for k, v in cm._int2y.items()},
        "placeholders": cm.placeholders,
        "cdb": cdb,             # code -> [type, alias, atk, def, race, attribute, setcode, in brain.CardDB]
        "scripts": scripts,     # code -> chainable effects [type, code, hint mine, hint opp, desc] (None fields = null)
    }
    path = os.path.join(OUT, "translator.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"gamedata/translator.json ({os.path.getsize(path) // 1024} KiB, {len(cdb)} cards, {len(scripts)} scripts)")


if __name__ == "__main__":
    main()
