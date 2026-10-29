"""Converts the gamedata tables from the 2008 client's card ids to real passcodes (the card wire: the client's codec,
client/recomp/rt/cardwire.cpp, maps them back; the server never sees the old ids again).

  python3 -I scripts/passcode_gamedata.py [gamedata dir]

Runs after the generators (they read Konami's data and emit the old ids): the map is gamedata/cards.json
(client/tools/cardart.py: per card index its passcode, alternate arts under their own ids). Rewrites in place:
  translator.json  y2c/c2y/int2y/internal/placeholders -> wire (the client table's passcodes) + wireHash
  persist.json     valid_cards
  lobby.json       limits [card, internal, n] -> [passcode, n]
  shop.json        iid / ydc pools
  ydc.json         structure and prize decks
  duel.json        npc_decks; cards {id: [internal, kind, limit, name]} -> {passcode: [kind, limit, name]}
Each converted file gets "ids": "passcode"; a converted file is left alone, so the script can run twice.
Then, every run: translator.json's wire + wireHash from cards.json (the client's table, its new cards and moved
tokens), and the new cards (client/tools/newcards.py, "new" in cards.json) into persist.json valid_cards, duel.json's
card table, and the shop: NEW_PACKS into those packs, the rest into the single cards.
"""
import json
import os
import struct
import sys

G = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "gamedata")


def load(name):
    with open(os.path.join(G, name), encoding="utf-8") as f:
        return json.load(f)


def save(name, data):
    data["ids"] = "passcode"
    tmp = os.path.join(G, name + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, os.path.join(G, name))
    print("converted", name)


TABLE_MIN = 3256   # the 2008 table's length (card_prop.bin); moved tokens sit past it
NEW_PACKS = {"48": [71799173, 7183277, 70676581, 44178886, 79444933, 6061630, 33455338, 57844634, 6849042, 32233746]}   # Light of Destruction (+ its sneak-peek prize)


def table_hash(cards):
    """FNV-1a of the codec's table, byte for byte as cardart.py `table` writes it: the hello's hash."""
    by = {c["i"]: c for c in cards}
    n = max(TABLE_MIN, max(by) + 1)
    table = bytearray(b"YO2CARDS" + struct.pack("<IIII", n, 1, 19, 16))
    for i in range(n):
        c = by.get(i)
        table += struct.pack("<IH", c["pc"] if c else 0, c["internal"] if c else 0)
    h = 2166136261
    for b in table:
        h = ((h ^ b) * 16777619) & 0xFFFFFFFF
    return h


def add_new(cards):
    new = [c for c in cards if c.get("new")]
    tr = load("translator.json")
    tr["wire"], tr["wireHash"] = sorted(c["pc"] for c in cards), table_hash(cards)
    save("translator.json", tr)
    print(f"  {len(tr['wire'])} passcodes, table hash {tr['wireHash']:08x}")
    p = load("persist.json")
    p["valid_cards"] = sorted(set(p["valid_cards"]) | {c["pc"] for c in new})
    save("persist.json", p)
    du = load("duel.json")
    for c in new: du["cards"][str(c["pc"])] = [c["kind"], 3, c["name"]]
    save("duel.json", du)
    sh = load("shop.json")
    in_packs = {pc for pcs in NEW_PACKS.values() for pc in pcs}
    for pack, pcs in NEW_PACKS.items():
        sh["iid"][pack] = sh["iid"][pack] + [pc for pc in pcs if pc in {c["pc"] for c in new} and pc not in sh["iid"][pack]]
    single = sh.setdefault("single", [])
    single += [c["pc"] for c in new if c["pc"] not in in_packs and c["pc"] not in single]
    save("shop.json", sh)
    print(f"  {len(new)} new cards: packs {', '.join(f'{k}+{len(v)}' for k, v in NEW_PACKS.items())}, single cards +{len(single)}")


def main():
    cards = load("cards.json")
    pc = {c["i"]: c["pc"] for c in cards}
    tr = load("translator.json")
    if tr.get("ids") == "passcode":
        print("translator.json: already passcodes")
    else:
        # the codec's table, byte for byte as cardart.py `table` writes it: its FNV-1a is the hello's hash
        n = len(tr["internal"])
        ph = tr["placeholders"]
        by = {c["i"]: c for c in cards}
        table = bytearray(b"YO2CARDS" + struct.pack("<IIII", n, ph["monster"], ph["spell"], ph["trap"]))
        for i in range(n):
            c = by.get(i)
            table += struct.pack("<IH", c["pc"] if c else 0, c["internal"] if c else 0)
        h = 2166136261
        for b in table:
            h = ((h ^ b) * 16777619) & 0xFFFFFFFF
        for k in ("internal", "y2c", "c2y", "int2y", "placeholders"):
            tr.pop(k, None)
        tr["wire"] = sorted(pc.values())
        tr["wireHash"] = h
        save("translator.json", tr)
        print(f"  {len(tr['wire'])} passcodes, table hash {h:08x}")

    def conv(ids, where):
        out = []
        for y in ids:
            if y in pc: out.append(pc[y])
            elif y: print(f"  {where}: card {y} has no passcode: dropped")
        return out

    p = load("persist.json")
    if p.get("ids") != "passcode":
        p["valid_cards"] = conv(p["valid_cards"], "valid_cards")
        save("persist.json", p)
    lo = load("lobby.json")
    if lo.get("ids") != "passcode":
        lo["limits"] = [[pc[y], n] for y, _internal, n in lo["limits"] if y in pc]
        save("lobby.json", lo)
    sh = load("shop.json")
    if sh.get("ids") != "passcode":
        sh["iid"] = {k: conv(v, f"iid {k}") for k, v in sh["iid"].items()}
        sh["ydc"] = {k: conv(v, f"ydc {k}") for k, v in sh["ydc"].items()}
        save("shop.json", sh)
    yd = load("ydc.json")
    if yd.get("ids") != "passcode":
        for k, d in yd.items():
            if isinstance(d, dict):
                for part in ("main", "side", "extra"):
                    d[part] = conv(d.get(part, []), f"ydc {k}")
        save("ydc.json", yd)
    du = load("duel.json")
    if du.get("ids") != "passcode":
        for k, d in du["npc_decks"].items():
            d["main"], d["extra"] = conv(d.get("main", []), f"npc {k}"), conv(d.get("extra", []), f"npc {k}")
        du["cards"] = {str(pc[int(y)]): [kind, limit, name] for y, (_internal, kind, limit, name) in du["cards"].items()
                       if int(y) in pc}
        save("duel.json", du)
    add_new(cards)


if __name__ == "__main__":
    main()
