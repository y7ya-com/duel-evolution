"""Builds server/gamedata/*.json: the tables the server needs that come from Konami's client (card ids with art,
titles, yo2pbinmap.dat, structure decks, pack lists, NPC decks…). Konami-derived, so gitignored: run this on a machine
with a YOLaucher-web checkout whose game data is in place (BUILDING.md there), before `wrangler dev` / deploy.

  python3.12 -I scripts/gamedata.py [path/to/YOLaucher-web/tools/yo2emu]

It reuses py's own loaders, so the tables are exactly what py computes at runtime.
"""
import glob
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "gamedata")
EMU = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser("~"), "Documents", "GitHub", "YOLaucher-web", "tools", "yo2emu")
sys.path.insert(0, EMU)


def load(name, rel):
    sp = importlib.util.spec_from_file_location(name, os.path.join(EMU, rel))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


def dump(name, obj):
    with open(os.path.join(OUT, name + ".json"), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print(f"gamedata/{name}.json")


def main():
    os.makedirs(OUT, exist_ok=True)
    PP = load("research_persistencia", "research/persistencia/proposal.py")
    pm = PP.pbinmap()
    dump("persist", {
        "valid_cards": sorted(PP.valid_card_ids()),
        "titles": [list(t) for t in PP.titles()],
        "pbin_types": {str(b): v[1] for b, v in pm.items()},
        "default_pbin_bits": PP.default_pbin_bits(),
        "npc_prize_bits": {str(k): v for k, v in PP.npc_prize_bits().items()},
    })
    ydc = {}
    # py pack_file: merge2008 first, then the old merge
    for f in sorted(glob.glob(os.path.join(PP.DATA2008, "cardpack", "*.ydc"))) + sorted(glob.glob(os.path.join(PP.DATA_OLD, "cardpack", "*.ydc"))):
        k = os.path.basename(f)[:-4]
        if k.isdigit() and k not in ydc:
            ydc[k] = PP.read_ydc(f)
    dump("ydc", ydc)
    AV = load("research_avatar", "research/avatar/proposal.py")
    LP = load("research_lobby", "research/lobby/proposal.py")
    dump("lobby", {
        "npc_ids": json.load(open(os.path.join(EMU, "npc_ids.json"), encoding="utf-8")),
        "limits": [list(x) for x in LP.limit_entries()],
        "avatar_pbin": {str(k): list(v) for k, v in AV.PBIN.items()},
    })
    import struct
    cp = os.path.dirname(PP.DATA2008 and os.path.join(PP.DATA2008, "cardpack", "x"))
    shop = {"packs": [], "iid": {}, "ydc": {}}
    from yo2srv import rutas
    t = open(rutas.packinfo(), "rb").read().decode("cp1252").replace(chr(13), "")
    for b in t.strip().split(chr(10) * 2):                     # py tienda.packinfo_packs
        ln = [x.strip() for x in b.split(chr(10))]
        if not ln[0].isdigit():
            continue
        kind = int(ln[1]) if len(ln) > 1 and ln[1].isdigit() else 0
        shop["packs"].append([int(ln[0]), kind, int(ln[6]) if len(ln) >= 7 and ln[6].isdigit() else None])
    for f in sorted(glob.glob(os.path.join(cp, "*.iid")) + glob.glob(os.path.join(cp, "*.ydc"))):
        k, ext = os.path.splitext(os.path.basename(f))
        raw = open(f, "rb").read()
        shop[ext[1:]][k] = [x for x in struct.unpack(f"<{len(raw) // 2}H", raw[:len(raw) // 2 * 2]) if x]
    dump("shop", shop)


if __name__ == "__main__":
    main()
