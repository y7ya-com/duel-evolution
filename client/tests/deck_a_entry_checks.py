"""deckEntry.cpp data checks against YOLaucher (loaded by tests/deck_a_test.py, check(exe)):
  - the drop rules of CDeckScene::main (FUN_008df280) for every card of research/ia/cards_yo2.csv: a card may go to
    the extra deck exactly when research/seguridad_duelo/mazo.py's is_fusion() says so, and to main / side exactly
    when it doesn't;
  - filling each part one card at a time while the rule allows it stops at mazo.py's MAIN_MAX (80) and EXTRA_MAX
    (30), and at 15 for the side deck (the editor's save check, side < 0x10).
"""
import csv
import os
import subprocess
import sys

EMU = os.environ.get("YO2_EMU_DIR", "/Users/y/Documents/GitHub/YOLaucher-web/tools/yo2emu")
MAIN, SIDE, EXTRA = 0, 1, 2


def ask(exe, queries):
    out = subprocess.run([exe, "entry", "drop"], input="".join(f"{p} {c} {f}\n" for p, c, f in queries),
                         capture_output=True, text=True, check=True).stdout.split()
    assert len(out) == len(queries), (len(out), len(queries))
    return [o == "1" for o in out]


def check(exe):
    sys.path.insert(0, os.path.join(EMU, "research", "seguridad_duelo"))
    import mazo   # noqa: E402

    rows = list(csv.DictReader(open(os.path.join(EMU, "research", "ia", "cards_yo2.csv"), encoding="utf-8")))
    frame = lambda kind: (int(kind) >> 1) & 0x1F   # FUN_0073c010 = (card_prop >> 1) & 0x1f (mazo.is_fusion)
    queries = [(p, 0, frame(r["kind"])) for r in rows for p in (MAIN, SIDE, EXTRA)]
    got = ask(exe, queries)
    for i, r in enumerate(rows):
        fus = mazo.is_fusion(r["kind"])
        m, s, e = got[3 * i:3 * i + 3]
        assert (m, s, e) == (not fus, not fus, fus), (r["yo2_id"], r["kind_txt"], m, s, e)
    nfus = sum(mazo.is_fusion(r["kind"]) for r in rows)
    # the largest count each part reaches when cards are added while the rule allows it
    sizes = {}
    for part, f in ((MAIN, 0), (SIDE, 0), (EXTRA, 2)):
        ok = ask(exe, [(part, c, f) for c in range(100)])
        sizes[part] = ok.index(False)
        assert all(ok[:sizes[part]]) and not any(ok[sizes[part]:]), (part, ok)
    assert sizes[MAIN] == mazo.MAIN_MAX and sizes[EXTRA] == mazo.EXTRA_MAX and sizes[SIDE] == 15, sizes
    print(f"ok: deck drop rules over all {len(rows)} cards_yo2.csv cards ({nfus} fusions extra-only) and the "
          f"mazo.py sizes (main {mazo.MAIN_MAX}, extra {mazo.EXTRA_MAX}, side 15)")
