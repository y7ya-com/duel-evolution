"""HQ card art for every card: ygoprodeck's public full-card images in place of the 2008 client's, packed as the
folder archives the exe opens before merge.dat (merge/data/card.dat, merge/data/mini.dat).

The client draws whole card faces (baked name, text and stats): data/card 200x290, data/mini 50x72. The archives hold
the same faces at 2x (400x580, 100x144 JPEG); ovr/decode.c tells the game they are 1x and gives the GL texture the 2x
pixels when the render scale is 2 (platform/gfx). Each card's art is the ygoprodeck image closest to the art the 2008
client showed (YO2 alt arts included); with no faithful match the card keeps its 2008 image. Entries are named by
passcode; list_card.txt (inside each archive) points every card index at its file.

  python3 -I cardart.py fetch --merge <merge.dat> --gamedata server/gamedata --cache <dir>   download + resize
  python3 -I cardart.py match ...same...                         -> <gamedata>/cards.json (index, passcode, art)
  python3 -I cardart.py sheet ...same... --out <png> [--all]     contact sheet of matches to review by eye
  python3 -I cardart.py pack ...same... --out <game dir>         -> <game>/merge/data/{card,mini}.dat
  python3 -I cardart.py table ...same... --out <game dir>        -> <game>/merge/data/card_passcode.bin (rt/cardwire.cpp)

Needs Pillow and numpy. Downloads go to --cache (never the repo); cards.json is Konami-derived (server/gamedata/,
private).
"""
import argparse
import concurrent.futures
import io
import json
import os
import struct
import sys
import time
import urllib.request

import numpy as np
from PIL import Image

API = "https://db.ygoprodeck.com/api/v7/cardinfo.php"
IMG = "https://images.ygoprodeck.com/images/cards/{}.jpg"
BIG, MINI = (200, 290), (50, 72)
HQ = 2                                 # the archives' scale (decode.c's size table: 400x580, 100x144)
FAITHFUL = 0.62                        # art match score at or above which the ygoprodeck image is the same art
REVIEW = 0.80                          # below this a match is shown on the review sheet

# YO2 ids the translator can't link by name (the 2008 English name differs from today's) and the World Championship
# prize cards, which have no Konami passcode: ygoprodeck's 5010000xx ids (Armament of the Lethal Lords has none
# there; 501000005 is the gap in that run). Coordinator-approved 2026-10-28.
EXTRA = {656: 84916669, 175: 45688586, 44: 85255550, 225: 73911410, 1233: 29762407, 3036: 73333463, 3020: 11136371,
         2615: 501000000, 2617: 501000001, 2619: 501000002, 2620: 501000003, 2588: 501000004, 2589: 501000005,
         3046: 501000006, 3047: 501000007}
# Hand review of everything under REVIEW (2026-10-28): "hq" = the best match is the same illustration, recoloured
# by a later print (it scores low on colour alone); "orig" = keep the 2008 face (ygoprodeck's only image is
# watermarked "SAMPLE": Melchid the Four-Face Beast).
OVERRIDE = {i: "hq" for i in (1095, 775, 776, 777, 778, 1022, 399, 153, 1462, 625, 1968, 1376, 169, 110)}
OVERRIDE[982] = "orig"


# ---------------------------------------------------------------- KCEJYUGI archives (kcej_dat.py's format)

SWAP = bytes(((x & 15) << 4) | (x >> 4) for x in range(256))


def lzss(src, size):
    ring, r, out, i = bytearray(4096), 0xFEE, bytearray(), 0
    while i < len(src) and len(out) < size:
        flags = src[i]; i += 1
        for bit in range(8):
            if i >= len(src) or len(out) >= size: break
            if flags >> bit & 1:
                c = src[i]; i += 1; out.append(c); ring[r] = c; r = (r + 1) & 0xFFF
            else:
                off, n = src[i] | (src[i + 1] & 0xF0) << 4, (src[i + 1] & 0xF) + 3; i += 2
                for k in range(n):
                    c = ring[(off + k) & 0xFFF]; out.append(c); ring[r] = c; r = (r + 1) & 0xFFF
    return bytes(out)


class Merge:
    def __init__(self, path):
        self.f = open(path, "rb")
        head = self.f.read(12)
        assert head[:8] == b"KCEJYUGI", path
        n = struct.unpack_from("<I", head, 8)[0]
        raw = self.f.read(n * 268)
        self.toc = {}
        for k in range(n):
            rec = raw[k * 268:(k + 1) * 268]
            name = rec[:256].translate(SWAP).split(b"\0")[0].decode("cp932").replace("\\", "/").lower()
            self.toc[name] = struct.unpack_from("<III", rec, 256)

    def read(self, name):
        off, size, stored = self.toc[name.lower()]
        self.f.seek(off)
        b = self.f.read(stored)
        return b if size == stored else lzss(b, size)


def write_archive(path, entries):
    """entries: [(name, bytes)] in data order; the directory is sorted (the exe binary-searches it), stored raw."""
    names = [n.lower().encode("cp932") for n, _ in entries]
    assert len(set(names)) == len(names) and all(len(n) < 256 for n in names)
    off = 12 + 268 * len(entries)
    recs = {}
    for n, (_, b) in zip(names, entries):
        recs[n] = (off, len(b)); off += len(b)
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(b"KCEJYUGI" + struct.pack("<I", len(entries)))
        for n in sorted(names):
            o, s = recs[n]
            f.write(n.ljust(256, b"\0").translate(SWAP) + struct.pack("<III", o, s, s))
        for _, b in entries: f.write(b)
    os.replace(tmp, path)


# ---------------------------------------------------------------- the cards

def load(a):
    m = Merge(a.merge)
    prop = m.read("data/bin#/card_prop.bin")
    lists = {d: m.read(f"data/{d}/list_card.txt").decode("ascii").split("\r\n") for d in ("card", "mini")}
    y2c = {int(k): v for k, v in json.load(open(os.path.join(a.gamedata, "translator.json")))["y2c"].items()}
    y2c.update(EXTRA)
    info = os.path.join(a.cache, "cardinfo.json")
    if not os.path.exists(info):
        urllib.request.urlretrieve(API, info)
    data = json.load(open(info, encoding="utf-8"))["data"]
    card_of = {i["id"]: c for c in data for i in c["card_images"]}   # any image id -> its card
    cards = []
    for i in range(1, len(prop) // 8):
        internal = struct.unpack_from("<I", prop, i * 8)[0] & 0x3FFF
        if not internal or i not in y2c: continue
        p = y2c[i]
        c = card_of.get(p)
        cards.append(dict(i=i, internal=internal, base=p, name=c["name"] if c else None,
                          cand=[im["id"] for im in c["card_images"]] if c else [],
                          big=lists["card"][i], mini=lists["mini"][i]))
    return m, cards, lists


def cached(a, img):
    return os.path.join(a.cache, f"{img}.jpg")


def fetch(a):
    _, cards, _ = load(a)
    todo = sorted({x for c in cards for x in c["cand"] if not os.path.exists(cached(a, x))})
    print(f"{len(todo)} images to download")

    def one(img):
        for attempt in range(4):
            try:
                req = urllib.request.Request(IMG.format(img), headers={"User-Agent": "duel-evolution-cardart/1"})
                im = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=60).read())).convert("RGB")
                im.resize((BIG[0] * HQ, BIG[1] * HQ), Image.LANCZOS).save(cached(a, img), quality=95)
                return None
            except Exception as e:   # noqa: BLE001 (network: retried, then reported)
                err = e
                time.sleep(2 + 4 * attempt)
        return f"{img}: {err}"

    done = 0
    with concurrent.futures.ThreadPoolExecutor(4) as ex:   # ponytail: 4 at a time, gentle on the public CDN
        for r in ex.map(one, todo):
            done += 1
            if r: print("failed", r)
            if done % 200 == 0: print(done, "/", len(todo), flush=True)


ART = (0.14, 0.20, 0.86, 0.68)   # the artwork window of a standard card face, as fractions of its size


def unit(v):
    v = v - v.mean()
    return v / (np.linalg.norm(v) + 1e-6)


def feature(im):   # the 2008 face's artwork window, 24x24 RGB, zero mean, unit length
    w, h = im.size
    box = im.convert("RGB").crop((int(ART[0] * w), int(ART[1] * h), int(ART[2] * w), int(ART[3] * h)))
    return unit(np.asarray(box.resize((24, 24), Image.BILINEAR), dtype=np.float32).ravel())


# A scan's artwork sits a few pixels off a 2008 render's, and that alone halves a plain correlation: each ygoprodeck
# image is tried at small shifts and scales of the window, keeping the best.
SHIFTS = [(dx, dy, s) for dx in (-0.03, -0.015, 0, 0.015, 0.03) for dy in (-0.03, -0.015, 0, 0.015, 0.03)
          for s in (0.97, 1.0, 1.03)]


def features(im):
    im = im.convert("RGB").resize((200, 290), Image.BILINEAR)
    w, h = im.size
    out = []
    cx, cy, hw, hh = (ART[0] + ART[2]) / 2, (ART[1] + ART[3]) / 2, (ART[2] - ART[0]) / 2, (ART[3] - ART[1]) / 2
    for dx, dy, s in SHIFTS:
        box = ((cx + dx - hw * s) * w, (cy + dy - hh * s) * h, (cx + dx + hw * s) * w, (cy + dy + hh * s) * h)
        out.append(unit(np.asarray(im.resize((24, 24), Image.BILINEAR, box=box), dtype=np.float32).ravel()))
    return np.stack(out)


def match(a):
    m, cards, _ = load(a)
    feats = {}

    def feat_of(img):
        if img not in feats:
            p = cached(a, img)
            feats[img] = features(Image.open(p)) if os.path.exists(p) else None
        return feats[img]

    groups = {}
    for c in cards: groups.setdefault(c["base"], []).append(c)
    for base, g in groups.items():
        for c in g:
            c["noart"] = f"data/card/{c['big']}" not in m.toc   # listed, but merge.dat has no 2008 face for it
            f = None if c["noart"] else feature(Image.open(io.BytesIO(m.read(f"data/card/{c['big']}"))))
            # no 2008 art: ygoprodeck's images in their own order (the card's main image first), reviewed by eye
            c["scores"] = {x: (FAITHFUL - 0.01 * k if f is None else float((feat_of(x) @ f).max()))
                           for k, x in enumerate(c["cand"]) if feat_of(x) is not None}
        if len(g) == 1:   # one YO2 id: it keeps the translator's passcode; the art is the closest image
            c = g[0]
            c["pc"] = base
            best = max(c["scores"].items(), key=lambda kv: kv[1], default=(None, 0.0))
            c["img"], c["score"] = best
            continue
        # alt arts: distinct passcodes, each YO2 id the ygoprodeck image (= its alt-art id) closest to its own art
        free = set(c["cand"])
        pairs = sorted(((s, c["i"], x) for c in g for x, s in c["scores"].items()), reverse=True)
        byi = {c["i"]: c for c in g}
        for s, i, x in pairs:
            c = byi[i]
            if "pc" in c or x not in free: continue
            c["pc"], c["img"], c["score"] = x, x, s
            free.discard(x)
        for c in g:   # more YO2 arts than ygoprodeck images: an unused alias id, 2008 art
            if "pc" not in c:
                c["pc"] = sorted(free).pop(0) if free else None
                free.discard(c["pc"])
                c["img"], c["score"] = None, 0.0
    out = []
    for c in sorted(cards, key=lambda c: c["i"]):
        img = c["img"] if c["score"] >= FAITHFUL or (c["noart"] and c["img"]) else "orig"
        img = {"hq": c["img"], "orig": "orig"}.get(OVERRIDE.get(c["i"]), img)
        out.append(dict(i=c["i"], internal=c["internal"], pc=c["pc"], name=c["name"], art=img or "orig",
                        best=c["img"], score=round(c["score"], 3), big=c["big"], mini=c["mini"], noart=c["noart"],
                        review=c["i"] not in OVERRIDE and (c["score"] < REVIEW or c["noart"])))
    pcs = [c["pc"] for c in out]
    dup = {p for p in pcs if pcs.count(p) > 1}
    assert not dup and None not in pcs, ("passcodes not unique", sorted(dup)[:10])
    path = os.path.join(a.gamedata, "cards.json")
    json.dump(out, open(path, "w"), indent=0)
    n_orig = sum(c["art"] == "orig" for c in out)
    print(f"{path}: {len(out)} cards, {len(out) - n_orig} HQ, {n_orig} keep the 2008 art, "
          f"{sum(c['review'] for c in out)} to review")


def sheet(a):
    m, _, _ = load(a)
    cards = json.load(open(os.path.join(a.gamedata, "cards.json")))
    rows = [c for c in cards if a.all or c["review"]]
    w, h, cols = 120, 174, 6   # per card: 2008 | chosen ygoprodeck, side by side
    from PIL import ImageDraw
    img = Image.new("RGB", (cols * (2 * w + 20), ((len(rows) + cols - 1) // cols) * (h + 28)), (30, 30, 30))
    d = ImageDraw.Draw(img)
    for k, c in enumerate(rows):
        x, y = (k % cols) * (2 * w + 20), (k // cols) * (h + 28)
        if not c["noart"]:
            img.paste(Image.open(io.BytesIO(m.read(f"data/card/{c['big']}"))).convert("RGB").resize((w, h)), (x, y + 24))
        if c["best"] and os.path.exists(cached(a, c["best"])):
            img.paste(Image.open(cached(a, c["best"])).resize((w, h)), (x + w + 4, y + 24))
        d.text((x, y + 2), f"#{c['i']} {c['score']:.2f} {c['art'] if c['art'] == 'orig' else 'HQ'} {c['best']}",
               fill=(255, 220, 120) if c["art"] == "orig" else (200, 255, 200))
        d.text((x, y + 12), (c["name"] or "?")[:34], fill=(220, 220, 220))
    img.save(a.out)
    print(a.out, len(rows), "cards")


def jpeg(im, size):
    b = io.BytesIO()
    im.resize(size, Image.LANCZOS).save(b, "JPEG", quality=85, optimize=True)
    return b.getvalue()


def pack(a):
    m, _, lists = load(a)
    cards = json.load(open(os.path.join(a.gamedata, "cards.json")))
    by = {c["i"]: c for c in cards}
    big, mini = [], []
    names = {"card": list(lists["card"]), "mini": list(lists["mini"])}
    for i in range(len(lists["card"])):   # data in card-index order: a browse reads neighbouring chunks
        c = by.get(i)
        if not c or (c["art"] == "orig" and c["noart"]): continue   # no art anywhere: as before
        if c["art"] == "orig":   # the 2008 face, renamed by passcode
            names["card"][i], names["mini"][i] = f"{c['pc']}.png", f"{c['pc']}.png"
            big.append((names["card"][i], m.read(f"data/card/{c['big']}")))
            mini.append((names["mini"][i], m.read(f"data/mini/{c['mini']}")))
            continue
        im = Image.open(cached(a, c["art"])).convert("RGB")
        names["card"][i] = names["mini"][i] = f"{c['pc']}.jpg"
        big.append((names["card"][i], jpeg(im, (BIG[0] * HQ, BIG[1] * HQ))))
        mini.append((names["mini"][i], jpeg(im, (MINI[0] * HQ, MINI[1] * HQ))))
    out = os.path.join(a.out, "merge", "data")
    os.makedirs(out, exist_ok=True)
    for d, entries in (("card", big), ("mini", mini)):
        entries.insert(0, ("list_card.txt", "\r\n".join(names[d]).encode("ascii")))
        write_archive(os.path.join(out, f"{d}.dat"), entries)
        print(f"{out}/{d}.dat: {len(entries)} entries, {sum(len(b) for _, b in entries) / 1e6:.1f} MB")


def table(a):
    """The card wire's table (rt/cardwire.cpp): "YO2CARDS", u32 count, u32 placeholder index for a hidden monster /
    spell / trap (the translator's), then per card index u32 passcode + u16 Konami internal id, little-endian."""
    m = Merge(a.merge)
    prop = m.read("data/bin#/card_prop.bin")
    n = len(prop) // 8
    by = {c["i"]: c for c in json.load(open(os.path.join(a.gamedata, "cards.json")))}
    ph = json.load(open(os.path.join(a.gamedata, "translator.json")))["placeholders"]
    out = bytearray(b"YO2CARDS" + struct.pack("<IIII", n, ph["monster"], ph["spell"], ph["trap"]))
    for i in range(n):
        c = by.get(i)
        out += struct.pack("<IH", c["pc"] if c else 0, c["internal"] if c else 0)
    path = os.path.join(a.out, "merge", "data", "card_passcode.bin")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(out)
    h = 2166136261   # FNV-1a, as the codec and the server compare it
    for b in out: h = ((h ^ b) * 16777619) & 0xFFFFFFFF
    print(f"{path}: {n} cards, hash {h:08x}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("cmd", choices=["fetch", "match", "sheet", "pack", "table"])
    ap.add_argument("--merge", required=True)
    ap.add_argument("--gamedata", required=True)
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out")
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True)
    {"fetch": fetch, "match": match, "sheet": sheet, "pack": pack, "table": table}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
