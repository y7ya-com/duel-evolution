"""Builds server/gamedata/duel.json: the tables of the duel port (src/duel) that come from Konami's client, from a
YOLaucher-web checkout (read-only). Gitignored like the rest of gamedata/.

  python3.12 -I scripts/duel_gamedata.py [path/to/YOLaucher-web/tools/yo2emu]

  npc_decks  research/ia/npc_decks.json (official NPC recipes, YO2 ids): py ocg_duel.npc_deck / npcreglas.deck_npc
  cards      research/ia/cards_yo2.csv -> {yo2 id: [konami id, csv kind, limit, name]}: research/seguridad_duelo/mazo.py
"""
import csv
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "gamedata")
EMU = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser("~"), "Documents", "GitHub", "YOLaucher-web", "tools", "yo2emu")


def main():
    os.makedirs(OUT, exist_ok=True)
    decks = json.load(open(os.path.join(EMU, "research", "ia", "npc_decks.json"), encoding="utf-8"))
    out_decks = {k: {"main": list(v.get("main") or []), "extra": list(v.get("extra") or [])} for k, v in decks.items()
                 if isinstance(v, dict)}
    cards = {}
    with open(os.path.join(EMU, "research", "ia", "cards_yo2.csv"), encoding="utf-8") as f:
        for r in csv.DictReader(f):            # same parsing as research/seguridad_duelo/mazo.py cards()
            try:
                cid = int(r["yo2_id"])
            except (TypeError, ValueError):
                continue
            cards[str(cid)] = [int(r.get("konami_id") or 0) or None, int(r.get("kind") or 0), int(r.get("limit") or 3),
                               (r.get("name_es") or r.get("name_en") or "").strip()]
    with open(os.path.join(OUT, "duel.json"), "w", encoding="utf-8") as f:
        json.dump({"npc_decks": out_decks, "cards": cards}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"gamedata/duel.json: {len(out_decks)} NPC decks, {len(cards)} cards")


if __name__ == "__main__":
    main()
