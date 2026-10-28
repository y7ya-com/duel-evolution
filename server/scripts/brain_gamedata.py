"""Builds the NPC brain's data (src/duel/brain): server/gamedata/brain_cards.json and gamedata/npc_profiles.json.
Both are gitignored: brain_cards.json comes from EDOPro's cards.cdb and npc_profiles.json is Konami-derived.

  python3.12 -I scripts/brain_gamedata.py [path/to/YOLaucher-web/tools/yo2emu]

It loads py's own research/ia/brain.py and dumps its CardDB as-is (same order as py's `CardDB.cards`, which
ANNOUNCE_CARD walks), with the text-derived facts precomputed: there is no sqlite and no card text on the Worker.

brain_cards.json = {"tags": [tag names, bit i = tags[i]], "cards": [[code, type, atk, def, level, race, attribute,
alias, setcode, tags, flags], ...]}; setcode is a string when it does not fit in 53 bits; flags: 1 = is_flip,
2 = "switch" in the text, 4 = temporal (_RX_TEMPORAL), 8 = "token" in the text.
"""
import importlib.util
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "gamedata")
EMU = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser("~"), "Documents", "GitHub", "YOLaucher-web", "tools", "yo2emu")
sys.path.insert(0, EMU)


def load_brain():
    sp = importlib.util.spec_from_file_location("brain", os.path.join(EMU, "research", "ia", "brain.py"))
    m = importlib.util.module_from_spec(sp)
    sys.modules["brain"] = m
    sp.loader.exec_module(m)
    return m


def main():
    os.makedirs(OUT, exist_ok=True)
    B = load_brain()
    db = B.CardDB.shared()
    names = [t for t, _ in B._TAGS]
    rows = []
    for c in db.cards.values():
        low = c.desc.lower()
        flags = (1 if c.is_flip else 0) | (2 if "switch" in low else 0) | (4 if B._RX_TEMPORAL.search(low) else 0) \
            | (8 if "token" in low else 0)
        tags = sum(1 << names.index(t) for t in c.tags)
        sc = c.setcode if c.setcode < 2 ** 53 else str(c.setcode)
        rows.append([c.code, c.type, c.atk, c.deff, c.level, c.race, c.attribute, c.alias, sc, tags, flags])
    with open(os.path.join(OUT, "brain_cards.json"), "w", encoding="utf-8") as f:
        json.dump({"tags": names, "cards": rows}, f, separators=(",", ":"))
    print(f"gamedata/brain_cards.json ({len(rows)} cards)")
    shutil.copyfile(os.path.join(EMU, "research", "ia", "npc_profiles.json"), os.path.join(OUT, "npc_profiles.json"))
    print("gamedata/npc_profiles.json")


if __name__ == "__main__":
    main()
