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


if __name__ == "__main__":
    main()
