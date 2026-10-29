"""The cards the 2008 client never had (the pre-Synchro cards it is missing), added as data: no exe change.

  python3 -I newcards.py --merge <merge.dat> --gamedata server/gamedata --cache <dir> --out <game dir>

Each new card takes a free card index: the 12 the 2008 tables leave empty (5 of them Konami's own reserved names, Pole
Position's and Tyler's among them), then indexes freed by moving tokens past 3255 (tokens are reached only through
their internal id: CARD_IntID -> index). Its internal id is a fresh one from 0x3801 (nothing in the exe switches on
those, so the client treats it as a plain card; the server's engine runs its rules). Writes:
  <out>/merge/data/bin#/CARD_*.bin   the card tables, whole (loose files win over merge.dat): stats and codes from
                                     EDOPro's data (codes learned from the cards both sides have), names and text from
                                     ygoprodeck (en/fr/de/it; English for the other languages), sort ranks by name
  <gamedata>/cards.json              the new cards and the moved tokens' indexes (then `cardart.py pack` / `table`)
Idempotent: cards already in cards.json keep their index and internal id. Konami-derived output: never committed.
"""
import argparse
import collections
import json
import os
import struct
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cardart as C  # noqa: E402

# the pre-Synchro cards the client is missing (2026-10-29 count: ygoprodeck dates, OCG before 2008-03-15 or a TCG
# product before 2008-08-05; Get Your Game On! has no EDOPro script). Owner: strict cutoff (the GX-themed cards released
# just after The Duelist Genesis stay out).
NEW = [22610082, 48948935, 76714458, 73578229, 68811206, 10449150,                  # GX era, OCG/TCG
       71799173, 7183277, 70676581, 44178886, 79444933, 6061630, 33455338, 57844634, 6849042, 32233746]  # LODT TCG
RESERVED = {73578229: 2066, 68811206: 2618}          # Konami's own reserved index for the card
FREE = [171, 1024, 1107, 1364, 2697, 2703, 2907, 3034, 3153, 3154]
MOVE = [3902, 3903, 3904, 3905]   # internal ids of the tokens to move, in order: Scapegoat's Sheep Tokens
FIRST_INTERNAL = 0x3801
LANGS = {"E": None, "F": "fr", "G": "de", "I": "it", "S": None, "J": None, "K": None}   # None: English (ygoprodeck's default)
B = "data/bin#/"


class Raw(bytes):
    """An entry's bytes exactly as Konami wrote them (some texts carry an extra terminator), with its text."""
    def __new__(cls, b, text):
        o = super().__new__(cls, b)
        o.text = text
        return o


def strings(m, lang):
    """A language's (name, desc) per card index, as Raw entries; R has names only."""
    ix = m.read(f"{B}card_indx_{lang}.bin")
    nm = m.read(f"{B}card_name_{lang}.bin")
    ds = m.read(f"{B}card_desc_{lang}.bin") if lang != "R" else None
    n = len(ix) // 8 - 1
    def at(buf, o):
        e = o
        while buf[e:e + 2] != b"\0\0": e += 2
        return buf[o:e].decode("utf-16le")
    out = []
    for i in range(n):
        a, b, a2, b2 = struct.unpack_from("<IIII", ix, i * 8)
        out.append((Raw(nm[a:a2], at(nm, a)), Raw(ds[b:b2], at(ds, b)) if ds is not None else None))
    return out, (ix, nm, ds)


def name_of(t): return t.text if isinstance(t, Raw) else t


def build(rows, with_desc, keep=None):
    """The indx/name/desc files: a 4-byte zero header, each string UTF-16LE + NUL padded to 4, an end entry. R (no
    desc file): `keep` = its second offset column as Konami wrote it (offsets into a file the exe never opens)."""
    def blob(texts):
        b, offs = bytearray(4), []
        for t in texts:
            offs.append(len(b))
            if isinstance(t, Raw): b += t; continue
            b += (t or "").encode("utf-16le") + b"\0\0"
            b += b"\0" * (-len(b) % 4)
        return bytes(b), offs + [len(b)]
    nm, no = blob([r[0] for r in rows])
    if with_desc:
        ds, do = blob([r[1] for r in rows])
    else:
        ds, do = None, (keep + [keep[-1]] * len(no))[:len(no)]
    ix = b"".join(struct.pack("<II", a, b) for a, b in zip(no, do))
    return ix, nm, ds


def texts(a, ids, lang):
    """ygoprodeck name + text per passcode in a language (cached; a card it has not translated falls back to English)."""
    path = os.path.join(a.cache, f"newcards_{lang or 'en'}.json")
    if not os.path.exists(path):
        url = f"{C.API}?id={','.join(map(str, ids))}" + (f"&language={lang}" if lang else "")
        req = urllib.request.Request(url, headers={"User-Agent": "duel-evolution-cardart/1"})
        try:
            data = json.load(urllib.request.urlopen(req, timeout=60))["data"]
        except urllib.error.HTTPError:   # none of them translated (English must answer)
            if not lang: raise
            data = []
        json.dump(data, open(path, "w"), ensure_ascii=False)
    out = {}
    for c in json.load(open(path, encoding="utf-8")):
        for im in c["card_images"]: out[im["id"]] = (c["name"], c["desc"])
        out[c["id"]] = (c["name"], c["desc"])
    return out


def learn(m, cards, engine):
    """YO2's kind / attribute / race / spell-trap icon codes from EDOPro's, by majority over the cards both have."""
    prop = m.read(f"{B}card_prop.bin")
    votes = collections.defaultdict(collections.Counter)
    for c in cards:
        r = engine.get(c["pc"])
        if not r: continue
        if r[1] in engine: r = engine[r[1]]
        w1 = struct.unpack_from("<I", prop, c["i"] * 8 + 4)[0]
        votes["kind", r[3]][w1 >> 1 & 31] += 1
        votes["icon", r[3]][w1 >> 14 & 7] += 1
        if r[3] & 1: votes["attr", r[5]][w1 >> 6 & 15] += 1; votes["race", r[6]][w1 >> 17 & 31] += 1
    return lambda what, v: votes[what, v].most_common(1)[0][0] if votes[what, v] else None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    for k in ("--merge", "--gamedata", "--cache", "--out"): ap.add_argument(k, required=True)
    a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True)
    m = C.Merge(a.merge)
    path = os.path.join(a.gamedata, "cards.json")
    cards = json.load(open(path))
    engine = {r[0]: r for r in json.load(open(os.path.join(a.gamedata, "engine", "cards.json")))["cards"]}
    new = NEW

    # the tables as Konami shipped them, and a check that rebuilding them unchanged gives the same bytes
    prop = bytearray(m.read(f"{B}card_prop.bin"))
    intid = bytearray(m.read(f"{B}card_intid.bin"))
    genre = bytearray(m.read(f"{B}card_genre.bin"))
    text = {}
    for L in list(LANGS) + ["R"]:
        rows, orig = strings(m, L)
        if L == "R": r_keep = list(struct.unpack(f"<{len(orig[0]) // 4}I", orig[0]))[1::2]
        assert build(rows, L != "R", r_keep if L == "R" else None) == orig, f"rebuilding CARD_*_{L} unchanged differs from merge.dat"
        text[L] = rows
    sort = {L: list(struct.unpack(f"<{len(prop) // 8}H", m.read(f"{B}card_sort_{L}.bin"))) for L in LANGS}

    # indexes: tokens moved past the end free theirs; new cards take reserved, free, then freed indexes
    by_pc = {c["pc"]: c for c in cards}
    by_int = {c["internal"]: c for c in cards}
    n = len(prop) // 8
    freed = []
    for k, internal in enumerate(MOVE[:max(0, len(new) - len(RESERVED) - len(FREE))]):
        t = by_int[internal]
        old, j = t.get("moved_from", t["i"]), n + k
        freed.append(old)
        if t["i"] != j: t["moved_from"], t["i"] = old, j
    slots = iter(FREE + freed)
    done = {c["pc"]: c for c in cards if c.get("new")}
    taken = {c["i"] for c in done.values()}
    nxt = max([FIRST_INTERNAL - 1] + [c["internal"] for c in done.values()]) + 1
    for pc in new:
        if pc in done: continue
        i = RESERVED.get(pc) or next(s for s in slots if s not in taken)
        taken.add(i)
        if pc in by_pc: sys.exit(f"{pc} is already card {by_pc[pc]['i']}")
        done[pc] = dict(i=i, internal=nxt, pc=pc, new=True, art=pc, best=pc, score=None, big=None, mini=None, noart=False, review=False)
        cards.append(done[pc]); nxt += 1
    top = max(c["i"] for c in cards) + 1

    # grow every table to the last index (moved tokens), then move the tokens' records
    prop += bytes(8 * (top - n)); genre += bytes(8 * (top - n))
    for L in text: text[L] += [("", "" if L != "R" else None)] * (top - n)
    for L in sort: sort[L] += [0] * (top - n)
    orig_text = {L: list(rows) for L, rows in text.items()}
    for c in cards:
        if "moved_from" not in c: continue
        o, j = c["moved_from"], c["i"]
        prop[j * 8:j * 8 + 8] = prop[o * 8:o * 8 + 8]
        genre[j * 8:j * 8 + 8] = genre[o * 8:o * 8 + 8]
        for L in text: text[L][j] = orig_text[L][o]
        for L in sort: sort[L][j] = sort[L][o]

    # the new cards' records
    code = learn(m, [c for c in cards if not c.get("new") and "moved_from" not in c], engine)
    tx = {lang: texts(a, new, lang) for lang in set(LANGS.values())}
    for pc in new:
        c, r = done[pc], engine.get(pc)
        if not r: sys.exit(f"{pc}: no EDOPro data")
        ty, lv, attr, race, atk, df = r[3], r[4] & 0xff, r[5], r[6], r[7], r[8]
        stat = lambda v: 0x1ff if v < 0 else v // 10
        w0 = c["internal"] | (stat(atk) << 14 if ty & 1 else 0) | (stat(df) << 23 if ty & 1 else 0)
        w1 = 1 | code("kind", ty) << 1 | (code("attr", attr) or 0) << 6 | (lv if ty & 1 else 0) << 10 | code("icon", ty) << 14 | (code("race", race) or 0) << 17
        prop[c["i"] * 8:c["i"] * 8 + 8] = struct.pack("<II", w0, w1)
        c["kind"] = w1 & 0x3f   # the server's duel.json card kind
        genre[c["i"] * 8:c["i"] * 8 + 8] = bytes(8)
        en = tx[None][pc]
        c["name"] = en[0]
        for L, lang in LANGS.items():
            text[L][c["i"]] = tx[lang].get(pc, en) if lang else en
        text["R"][c["i"]] = (en[0], None)
        for L in sort:   # the rank of the first card that sorts after it by name (ranks tie, as alt arts do)
            names = sorted((name_of(text[L][i][0]).casefold(), sort[L][i]) for i in range(top) if sort[L][i] and i != c["i"])
            after = [rk for nm, rk in names if nm >= name_of(text[L][c["i"]][0]).casefold()]
            sort[L][c["i"]] = after[0] if after else max(sort[L]) + 1

    # CARD_IntID: index per internal id from 3000, every card's (moved tokens included)
    count = max(len(intid) // 2, max(c["internal"] for c in cards) - 3000 + 1)
    ids = list(struct.unpack(f"<{len(intid) // 2}H", intid)) + [0] * (count - len(intid) // 2)
    for c in cards:
        if c.get("new") or "moved_from" in c: ids[c["internal"] - 3000] = c["i"]

    out = os.path.join(a.out, "merge", B.replace("/", os.sep))
    os.makedirs(out, exist_ok=True)
    def put(name, b): open(os.path.join(out, name), "wb").write(b)
    put("CARD_Prop.bin", bytes(prop)); put("CARD_Genre.bin", bytes(genre))
    put("CARD_IntID.bin", struct.pack(f"<{count}H", *ids))
    for L in text:
        ix, nm, ds = build(text[L], L != "R", r_keep if L == "R" else None)
        put(f"CARD_Indx_{L}.bin", ix); put(f"CARD_Name_{L}.bin", nm)
        if ds is not None: put(f"CARD_Desc_{L}.bin", ds)
    for L in sort: put(f"CARD_Sort_{L}.bin", struct.pack(f"<{top}H", *sort[L]))
    for pc in new:   # the art (cardart.py pack takes it from the cache)
        if not os.path.exists(C.cached(a, pc)) and (err := C.download(a, pc)): sys.exit(err)
    tmp = path + ".tmp"
    json.dump(sorted(cards, key=lambda c: c["i"]), open(tmp, "w"), ensure_ascii=False, indent=0)
    os.replace(tmp, path)
    for pc in new:
        c = done[pc]
        print(f"{c['i']:5} 0x{c['internal']:04x} {pc:>9} {c['name']}")
    print(f"{len(new)} new cards; {sum('moved_from' in c for c in cards)} tokens moved; tables to index {top - 1} -> {out}")


if __name__ == "__main__":
    main()
