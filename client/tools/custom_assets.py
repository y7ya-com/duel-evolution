"""Authored items' game files (client/custom-assets/<pack>/) as loose merge/data files for the shipped game folder.

python3 client/tools/custom_assets.py --merge <merge.dat> --packs client/custom-assets --out <directory> [--allow-placeholders]
python3 client/tools/custom_assets.py --rehash client/custom-assets/<pack>   (new art: its sha256s into pack.json)

Each pack has a pack.json (committed: what the item is, the sha256 of every art file) and its art under
<pack>/art/merge/data/... (Konami-derived: drawn on the game's own parts; never committed, carried by
infra/fetch-private.sh like html-ui/assets). This writes into <out>:
  - every art file, checked against its sha256 (a missing or different file stops the ship). A file that exists in
    merge.dat must be listed in the pack's "replaces" (it overrides the original for every player on this client, e.g.
    new waist-up art for an existing outfit), and a file listed there must exist in merge.dat: no accidental override;
  - files listed in "placeholder" (stand-ins until the real art lands) stop the ship unless --allow-placeholders
    (ship-client.sh passes it for DRY=1 test pages only);
  - new-style chibi outfits ("newstyle": [[body, clothes hex, code]]: client/recomp/ovr/newstyle.c,
    client/tools/newstyle_pack.py): the pack must carry its three skin tones' packs, merge/data/avatar/chibi/
    c?_nb_<code>_c0{1,2,3}.pak, and merge/data/avatar/chibi/newstyle.txt (the engine's table) is written from all packs;
  - merge/data/common/yo2pbinmap.dat and merge/data/avatar/wu/{wm,ww}_data.csv, merge.dat's own with the packs' rows:
    "pbin" (new part rows: a PBIN row must be vacant in the original), "waistup" (a new part's waist-up row, which must
    not exist yet), "waistupRows" ({"wm": {"<category>,<number>": [x, y, w, h]}}: an existing row's rectangle, for
    replaced waist-up art of another size). A table is written only when some pack changes it;
  - files.txt (lazyfs.js's manifest): these files added to the folder's (era2008_assets.py's card faces).
The exe prefers loose merge/data files to merge.dat's (CFile::Open), and lazyfs.js mounts this folder over game/, so
the client sees them like its own; cosmetics/art.js reads the same loose files for the HTML UI (lazyfs looseEntry).
An older client never reads newstyle.txt or the packs, so it keeps the legacy look of a new-style outfit.
"""
import argparse
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

PBIN = "data/common/yo2pbinmap.dat"
WU = "data/avatar/wu/{body}_data.csv"
NEWSTYLE = "merge/data/avatar/chibi/newstyle.txt"
CATEGORY = {"dueldisk": 12}   # the waist-up layer's category (wm_data.csv column 1)
SLOT = {"dueldisk": 8}


def load_packs(packs_dir):
    out = []
    for name in sorted(os.listdir(packs_dir)):
        p = os.path.join(packs_dir, name, "pack.json")
        if os.path.isfile(p):
            with open(p, encoding="utf-8") as f:
                pack = json.load(f)
            pack["dir"] = os.path.join(packs_dir, name)
            out.append(pack)
    return out


def _lines(data):
    text = data.decode("cp932")
    eol = "\r\n" if "\r\n" in text else "\n"
    return text.split(eol)[:-1] if text.endswith(eol) else text.split(eol), eol


def patch_pbin(data, packs):
    """yo2pbinmap.dat: "bit,number,initial,kind (1 male, 2 female),slot,text,name,series" per bit 0..1023."""
    rows, eol = _lines(data)
    at = {int(r.split(",")[0]): i for i, r in enumerate(rows) if r and not r.startswith("//")}
    if len(at) != 1024:
        raise ValueError(f"{PBIN}: expected 1024 rows, found {len(at)}")
    for pack in packs:
        for kind, bit in enumerate(pack.get("pbin", []), 1):
            old = rows[at[bit]].split(",")
            if old[1:6] != [str(pack["part"]), "0", "0", "0", "0"]:
                raise ValueError(f"{PBIN}: bit {bit} is not vacant ({rows[at[bit]]})")
            rows[at[bit]] = f"{bit},{pack['part']},0,{kind},{SLOT[pack['kind']]},{pack['text']},{pack['name']},1"
    return (eol.join(rows) + eol).encode("cp932")


def patch_waistup(data, body, packs):
    """{wm,ww}_data.csv: "category,number,file1..file7,x,y,w,h". A new part's row ("waistup": a disk's files are its
    _r and _l poses), or an existing row's rectangle ("waistupRows")."""
    rows, eol = _lines(data)
    for pack in packs:
        for key, rect in pack.get("waistupRows", {}).get(body, {}).items():
            hit = [i for i, r in enumerate(rows) if r.startswith(key + ",")]
            if len(hit) != 1:
                raise ValueError(f"{WU.format(body=body)}: row {key} found {len(hit)} times")
            cols = rows[hit[0]].split(",")
            rows[hit[0]] = ",".join(cols[:-4] + [str(v) for v in rect])
        if "waistup" not in pack:
            continue
        cat, part, art = CATEGORY[pack["kind"]], pack["part"], pack["art"]
        if any(r.startswith(f"{cat},{part},") for r in rows):
            raise ValueError(f"{WU.format(body=body)}: row {cat},{part} exists already")
        x, y, w, h = pack["waistup"][body]
        rows.append(",".join(map(str, [cat, part, f"{body}_{art}_r.png", f"{body}_{art}_l.png", *["****"] * 5, x, y, w, h])))
    return (eol.join(rows) + eol).encode("cp932")


def newstyle_table(packs):
    """newstyle.txt (ovr/newstyle.c): one line per new-style outfit, "<m|f> <clothes hex> <code>"; a body + clothes or a
    body + code may appear once."""
    lines, seen = [], set()
    for pack in packs:
        for body, clothes, code in pack.get("newstyle", []):
            if body not in "mf" or not re.fullmatch(r"[0-9a-f]{2}", clothes) or not re.fullmatch(r"\d\d", code) or code == "00":
                raise ValueError(f"{pack['id']}: bad newstyle row {body} {clothes} {code}")
            for key in ((body, clothes), (body, "code", code)):
                if key in seen:
                    raise ValueError(f"{pack['id']}: newstyle {key} twice")
                seen.add(key)
            lines.append(f"{body} {clothes} {code}  # {pack['id']}")
    return ("# body clothes(hex) code: client/recomp/ovr/newstyle.c (written by client/tools/custom_assets.py)\n"
            + "".join(line + "\n" for line in lines)).encode("ascii") if lines else None


def build(merge, packs, out, allow_placeholders=False):
    """Write the packs' files into out (see the module docstring). -> the relative paths written."""
    written = []

    def put(rel, data):
        dest = os.path.join(out, rel)
        if os.path.exists(dest):
            raise ValueError(f"{rel}: already in {out}")
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as f:
            f.write(data)
        written.append(rel)

    def in_archive(rel):
        try:
            merge.read(rel[len("merge/"):])
            return True
        except KeyError:
            return False

    for pack in packs:
        replaces, holders = set(pack.get("replaces", [])), set(pack.get("placeholder", []))
        if holders and not allow_placeholders:
            raise ValueError(f"{pack['id']}: placeholder art not replaced yet: {sorted(holders)}")
        for body, _, code in pack.get("newstyle", []):
            pre = "cw" if body == "f" else "cm"
            for s in (1, 2, 3):
                rel = f"merge/data/avatar/chibi/{pre}_nb_{code}_c0{s}.pak"
                if rel not in pack["files"]:
                    raise ValueError(f"{pack['id']}: no {rel} (client/tools/newstyle_pack.py makes it)")
        for rel, digest in sorted(pack["files"].items()):
            if not rel.startswith("merge/data/") or rel == NEWSTYLE:
                raise ValueError(f"{pack['id']}: {rel} is not a game file this tool ships")
            src = os.path.join(pack["dir"], "art", rel)
            if not os.path.isfile(src):
                raise FileNotFoundError(f"{pack['id']}: no {src} (infra/fetch-private.sh brings the art)")
            with open(src, "rb") as f:
                data = f.read()
            if hashlib.sha256(data).hexdigest() != digest:
                raise ValueError(f"{pack['id']}: {rel} is not the art pack.json names (sha256)")
            if in_archive(rel) != (rel in replaces):
                raise ValueError(f"{pack['id']}: {rel} " + ("overrides merge.dat's file: list it in \"replaces\"" if rel not in replaces
                                                             else "is in \"replaces\" but merge.dat has no such file"))
            put(rel, data)
        missing = replaces - set(pack["files"])
        if missing:
            raise ValueError(f"{pack['id']}: \"replaces\" names files the pack doesn't have: {sorted(missing)}")
    if any(p.get("pbin") for p in packs):
        put("merge/" + PBIN, patch_pbin(merge.read(PBIN), packs))
    if any(p.get("waistup") or p.get("waistupRows") for p in packs):
        for body in ("wm", "ww"):
            put("merge/" + WU.format(body=body), patch_waistup(merge.read(WU.format(body=body)), body, packs))
    table = newstyle_table(packs)
    if table:
        if in_archive(NEWSTYLE):
            raise ValueError(f"{NEWSTYLE}: merge.dat has one")
        put(NEWSTYLE, table)
    return written


def write_manifest(out, written):
    """files.txt: the lines already there (era2008_assets.py's card faces) and the written files', sorted."""
    p = os.path.join(out, "files.txt")
    lines = open(p).read().splitlines() if os.path.exists(p) else []
    lines += [f"{os.path.getsize(os.path.join(out, r))}\t{r}" for r in written]
    with open(p, "w") as f:
        f.write("".join(line + "\n" for line in sorted(set(lines), key=lambda line: line.split("\t", 1)[1])))


def rehash(pack_dir):
    """pack.json's "files": every file under <pack>/art, with its sha256."""
    art, p = os.path.join(pack_dir, "art"), os.path.join(pack_dir, "pack.json")
    with open(p, encoding="utf-8") as f:
        pack = json.load(f)
    def digest(path):
        with open(path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    pack["files"] = {os.path.relpath(os.path.join(d, n), art).replace(os.sep, "/"): digest(os.path.join(d, n))
                     for d, _, fs in sorted(os.walk(art)) for n in sorted(fs)}
    with open(p, "w", encoding="utf-8") as f:
        # number and string lists on one line: [0, 360, 768, 344], ["m", "79", "01"]
        f.write(re.sub(r"\[[\d,\s]+\]|\[\s*(\"[^\"\n]*\"(,\s*)?)+\s*\]", lambda m: json.dumps(json.loads(m.group(0))),
                       json.dumps(pack, indent=2, ensure_ascii=False)) + "\n")
    return pack


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--rehash")
    for arg in ("--merge", "--packs", "--out"):
        p.add_argument(arg)
    p.add_argument("--allow-placeholders", action="store_true")
    a = p.parse_args()
    if a.rehash:
        print(f"{a.rehash}: {len(rehash(a.rehash)['files'])} files")
        return
    if not (a.merge and a.packs and a.out):
        p.error("--merge, --packs and --out are required")
    from cardart import Merge   # numpy: YO2_ASSET_PYTHON in ship-client.sh, as era2008_assets.py
    packs = load_packs(a.packs)
    m = Merge(a.merge)
    try:
        written = build(m, packs, a.out, a.allow_placeholders)
    finally:
        m.f.close()
    write_manifest(a.out, written)
    print(f"custom assets: {len(packs)} items, {len(written)} files in {a.out}")


if __name__ == "__main__":
    main()
