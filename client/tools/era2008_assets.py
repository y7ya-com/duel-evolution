"""Build private 2008 card faces and localized descriptions from the original merge.dat.

python3 client/tools/era2008_assets.py --merge <merge.dat> --gamedata server/gamedata --out <directory>
Loose files override modern card.dat faces. Output is Konami-derived and must not be committed.
"""
import argparse
import json
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cardart import Merge
from newcards import strings


def build(merge, cards, catalog, out):
    os.makedirs(out, exist_ok=True)
    texts = {lang: strings(merge, lang)[0] for lang in ("E", "F", "G", "I", "S", "J", "K")}
    catalog = {**catalog, **{str(alias): rule for rule in catalog.values() for alias in rule.get("aliases", [])}}
    affected = [c for c in cards if str(c["pc"]) in catalog]
    missing = set(catalog) - {str(c["pc"]) for c in affected}
    if missing:
        raise ValueError(f"Legacy cards missing from card table: {sorted(missing)}")
    entries, manifest = {}, []
    for c in affected:
        if c.get("new") or not c.get("big") or c.get("noart"):
            raise ValueError(f"No original 2008 face for {c['pc']}; supply a reviewed legacy face")
        i, pc = c["i"], c["pc"]
        descs = {lang: rows[i][1].text for lang, rows in texts.items()}
        if not descs["E"].strip():
            raise ValueError(f"No original effect text for {pc}")
        entries[str(i)] = {"pc": pc, "text": descs, "face": f"merge/data/card/{pc}.png"}
        for folder, original in (("card", c["big"]), ("mini", c["mini"])):
            data = merge.read(f"data/{folder}/{original}")
            # The existing archive's card list can name either extension; decoders recognize the PNG signature.
            for ext in ("png", "jpg"):
                path = f"merge/data/{folder}/{pc}.{ext}"
                dest = os.path.join(out, path)
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with open(dest, "wb") as f:
                    f.write(data)
                manifest.append(f"{len(data)}\t{path}")
    with open(os.path.join(out, "cards.json"), "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(out, "files.txt"), "w") as f:
        f.write("\n".join(sorted(manifest)) + "\n")
    return entries


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for arg in ("--merge", "--gamedata", "--out"):
        p.add_argument(arg, required=True)
    a = p.parse_args()
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    with open(os.path.join(root, "server/src/duel/engine/era2008.json")) as f:
        catalog = json.load(f)
    with open(os.path.join(a.gamedata, "cards.json")) as f:
        cards = json.load(f)
    result = build(Merge(a.merge), cards, catalog, a.out)
    print(f"2008 card assets: {len(result)} faces and localized descriptions in {a.out}")


if __name__ == "__main__":
    main()
