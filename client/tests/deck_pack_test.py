"""Checks src/Pack (yo2CardPack.h: the pack table, CCardPack, the pack check line) against YOLaucher, deterministically:
  - the catalogue the server sells from (data/cardpack/packinfo_s.txt, the shop's reader tienda.packinfo_packs) fed
    through packTableFill: every pack id, type and deck PBIN bit lands where the client keeps it;
  - CCardPack's card lists from the real <id>.iid / <id>.ydc files, against the shop's own reader
    (tienda.shop_purchase: non-zero u16 LE ids), and the owned / completion counts against a card box;
  - the pack check list line ("@>64/<name>@>600/@2xx.x %@0");
  - the exe's field offsets (static_assert): src/Pack compiled for i686 with i686-w64-mingw32-g++.
Run: python3.12 -I tests/deck_pack_test.py   (needs c++, i686-w64-mingw32-g++ and the YOLaucher game data)
"""
import glob
import os
import struct
import subprocess
import sys
import tempfile
import types

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")
EMU = os.environ.get("YO2_EMU_DIR", os.path.expanduser("~") + "/Documents/GitHub/YOLaucher-web/tools/yo2emu")
sys.path.insert(0, EMU)
from yo2srv import rutas  # noqa: E402
from yo2srv.tienda import tienda  # noqa: E402

PACKINFO = rutas.packinfo()
PACKDIR = os.path.dirname(PACKINFO)


def compile_cli(tmp):
    srcs = sorted(glob.glob(os.path.join(SRC, "Pack", "*.cpp")))
    for s in srcs:
        subprocess.check_call(["i686-w64-mingw32-g++", "-std=c++17", "-Wall", "-Werror", "-fsyntax-only", "-I", SRC, s])
    exe = os.path.join(tmp, "deck_pack_cli")
    subprocess.check_call(["c++", "-std=c++17", "-O1", "-g", "-Wall", "-Wextra", "-Werror",
                           "-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-I", SRC,
                           os.path.join(HERE, "deck_pack_cli.cpp"), *srcs, "-o", exe])
    return exe


def catalogue():
    """packinfo_s.txt blocks: id, type, image, name, description, [ydc, bit] (as the shop reads them)"""
    t = open(PACKINFO, "rb").read().decode("cp1252").replace("\r", "")
    rows = []
    for b in t.strip().split("\n\n"):
        ln = [x.strip() for x in b.split("\n")]
        if not ln[0].isdigit():
            continue
        ln += [""] * 7
        kind = int(ln[1]) if ln[1].isdigit() else 0
        rows.append((int(ln[0]), kind, ln[2], ln[3], ln[4], "", ln[5] if kind in (1, 4) else "",
                     int(ln[6]) if ln[6].isdigit() and kind in (1, 4) else 0))
    return rows


def run(exe, tsv, owned, *cmd):
    return subprocess.run([exe, tsv, PACKDIR, ",".join(map(str, owned)), *cmd], capture_output=True, text=True,
                          check=True).stdout.splitlines()


def shop_cards(pid, ext):
    raw = open(os.path.join(PACKDIR, f"{pid}{ext}"), "rb").read()
    return [x for x in struct.unpack(f"<{len(raw) // 2}H", raw[:len(raw) // 2 * 2]) if x]


def main():
    tienda.srv = types.SimpleNamespace(PACKINFO=PACKINFO)
    shop = tienda.packinfo_packs()
    rows = catalogue()
    assert [(r[0], r[1]) for r in rows] == [(p, k) for p, k, _ in shop], "catalogue reader drifted from the shop's"
    with tempfile.TemporaryDirectory() as tmp:
        exe = compile_cli(tmp)
        tsv = os.path.join(tmp, "catalogue.tsv")
        with open(tsv, "w", encoding="utf-8") as f:
            for r in rows:
                f.write("\t".join(map(str, r)) + "\n")
        # the table: one record per pack id, decks keep their .ydc and PBIN bit, the rest only the .iid
        recs = {int(l.split()[1]): l.split() for l in run(exe, tsv, [], "table") if l.startswith("rec ")}
        assert len(rows) <= 0xc0 and set(recs) == {p for p, _, _ in shop} | ({0} if len(rows) < 0xc0 else set())
        for pid, kind, bit in shop:
            r = recs[pid]
            assert (int(r[2]), int(r[3]), r[5]) == (pid, kind, f"{pid}.iid"), r
            if kind in (1, 4):
                assert int(r[4]) == (bit or 0) and r[6] != "-", r
            else:
                assert int(r[4]) == 0 and r[6] == "-", r
        print(f"ok: pack table, {len(shop)} packs of packinfo_s.txt (ids, types, iid names, deck ydc + PBIN bits)")

        boosters = [p for p, k, _ in shop if k == 0 and os.path.exists(os.path.join(PACKDIR, f"{p}.iid"))][:3]
        decks = [p for p, k, _ in shop if k in (1, 4) and os.path.exists(os.path.join(PACKDIR, f"{p}.ydc"))][:2]
        assert boosters and decks, (boosters, decks)
        for pid in boosters + decks:
            ext = ".ydc" if pid in decks else ".iid"
            want = shop_cards(pid, ext)
            pool = shop_cards(pid, ".iid") if os.path.exists(os.path.join(PACKDIR, f"{pid}.iid")) else []
            raw = os.path.getsize(os.path.join(PACKDIR, f"{pid}.iid")) // 2 if pool or pid in boosters else 0
            owned = sorted(set(pool))[::2]   # every other distinct card of the pool
            out = run(exe, tsv, owned, "pack", str(pid))
            head = dict(f.split("=", 1) for f in out[0].split()[2:] if "=" in f)
            cards = [int(x) for x in out[1].split()[1:]]
            assert cards == want, (pid, cards[:10], want[:10])
            if pid in boosters:
                slots = struct.unpack(f"<{raw}H", open(os.path.join(PACKDIR, f"{pid}.iid"), "rb").read()[:raw * 2])
                have = sum(1 for c in slots if c in owned)
                assert (int(head["size"]), int(head["owned"])) == (raw, have), (pid, head, raw, have)
                assert abs(float(head["completion"]) - have / raw) < 1e-4, head
                name = next(r[3] for r in rows if r[0] == pid)
                assert out[2] == f"line @>64/{name}@>600/@2{have / raw * 100:.1f} %@0", out[2]
        print(f"ok: card lists of {len(boosters)} boosters (.iid) and {len(decks)} decks (.ydc) match the shop's "
              "reader; owned/completion/line against a card box")
        out = run(exe, tsv, [], "pack", "99999")
        assert out[0].startswith("assert 111 ") and any("size=0 owned=0 completion=0.0000" in l for l in out), out
        assert sum(l.count("assert 111 ") for l in out) == 1, out   # once per flag
        print("ok: an unknown pack asserts once and reads as empty (no division by zero)")


if __name__ == "__main__":
    main()
