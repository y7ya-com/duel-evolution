"""Checks src/Deck part A (deckEntry.cpp, yo2DeckParts.cpp, yo2DeckUtil.cpp, yo2DeckWindow.cpp, yo2KabanWindow.cpp):
  - every src/Deck part-A file compiles for i686 (i686-w64-mingw32-g++ -fsyntax-only), which fires the YO2_AT
    offset asserts of the exe's 32-bit layout;
  - the host build (ASan + UBSan) of all of them with tests/deck_a_*.cpp links, and each part's selftest passes;
  - each part's data checks against YOLaucher (research/ia/cards_yo2.csv, research/seguridad_duelo/mazo.py), in
    tests/deck_a_<part>_checks.py (a module with check(exe)), run if present;
  - every `// @yo2 0xADDR` marker in those files names a part-A function (labels.tsv, srcdir Deck, in the A ranges)
    or one of the islands Ghidra missed there, and no address is defined twice.
Run: python3.12 -I tests/deck_a_test.py   (needs c++ and i686-w64-mingw32-g++ on PATH)
"""
import glob
import importlib.util
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")
DATA = os.environ.get("YO2_DATA", os.path.expanduser("~") + "/Documents/GitHub/yo2-decomp-data")
ISLANDS = os.environ.get("YO2_ISLANDS", os.path.join(HERE, "..", "..", "phase2-duel-tools", "islands.tsv"))
RANGES = [(0x008da960, 0x008ebb40), (0x00909590, 0x00934720), (0x009354e0, 0x0097c8e0)]
# the atexit destructors of deckEntry.cpp's last string table sit just past the first range (DeckTables.h)
EXTRA = {0x008ebb60}
PARTS = ("entry", "parts", "util", "window", "kaban", "kabanlist")


PREFIXES = ("DeckCommon", "DeckEntry", "DeckParts", "DeckUtil", "DeckWindow", "KabanWindow", "DeckGlue")


def part_a_files():
    """src/Deck .cpp files of part A, by name (the other src/Deck helper owns the rest of the folder)"""
    return [f for f in sorted(glob.glob(os.path.join(SRC, "Deck", "*.cpp")))
            if os.path.basename(f).startswith(PREFIXES)]


def part_a_headers():
    return [f for f in sorted(glob.glob(os.path.join(SRC, "Deck", "*.h")))
            if os.path.basename(f).startswith(PREFIXES + ("deck_a_",))]


# part -> its source files' name prefix (kaban is KabanWindow*.cpp minus kabanlist's KabanWindowList*.cpp)
PART_PREFIX = {"entry": "DeckEntry", "parts": "DeckParts", "util": "DeckUtil", "window": "DeckWindow",
               "kaban": "KabanWindow", "kabanlist": "KabanWindowList"}
HOST = ["c++", "-std=c++17", "-O1", "-g", "-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter",
        "-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-I", SRC]


def part_files(part, srcs):
    pre = PART_PREFIX[part]
    out = [f for f in srcs if os.path.basename(f).startswith(pre)]
    if part == "kaban":
        out = [f for f in out if not os.path.basename(f).startswith(PART_PREFIX["kabanlist"])]
    return out


def compile_i686(srcs):
    for s in srcs:
        subprocess.check_call(["i686-w64-mingw32-g++", "-std=c++17", "-Wall", "-Werror", "-fsyntax-only", "-I", SRC, s])
    print(f"ok: {len(srcs)} files compile for i686 (YO2_AT layout asserts)")


def compile_part(tmp, part, srcs):
    """one CLI per part: its own weak stubs stand in for System AND for the other parts, so its selftest sees
    exactly the calls it records (two parts' stubs of one extern would otherwise shadow each other)"""
    test = os.path.join(HERE, f"deck_a_{part}.cpp")
    files = part_files(part, srcs)
    if not os.path.exists(test) or not files:
        return None
    extra = sorted(glob.glob(os.path.join(HERE, f"deck_a_{part}_*.cpp")))   # a part's extra stub/test files
    exe = os.path.join(tmp, f"deck_a_{part}")
    subprocess.check_call(HOST + [os.path.join(HERE, "deck_a_cli.cpp"), os.path.join(HERE, "deck_a_stubs.cpp"), test,
                                  *extra, *files, "-o", exe])
    return exe


def link_all(tmp, srcs):
    """every part together: no duplicate strong symbols, the real cross-part calls resolve to each other"""
    tests = [os.path.join(HERE, f"deck_a_{p}.cpp") for p in PARTS if os.path.exists(os.path.join(HERE, f"deck_a_{p}.cpp"))]
    tests += [f for p in PARTS for f in sorted(glob.glob(os.path.join(HERE, f"deck_a_{p}_*.cpp")))]
    exe = os.path.join(tmp, "deck_a_all")
    subprocess.check_call(HOST + [os.path.join(HERE, "deck_a_cli.cpp"), os.path.join(HERE, "deck_a_stubs.cpp"), *tests,
                                  *srcs, "-o", exe])
    print(f"ok: all {len(srcs)} part-A files link together")
    return exe


def check_selftest(exe, part):
    r = subprocess.run([exe, "selftest"], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"selftest {part} failed ({r.returncode}):\n{r.stdout}{r.stderr[-4000:]}")
    ok = [l.split() for l in r.stdout.split("\n") if l.startswith("ok ")]
    assert any(o[1] == part for o in ok), r.stdout
    for o in ok:   # a part may register more than one selftest (entry: entry + entrymain)
        print(f"ok: selftest {o[1]}: {o[2]} checks")


def check_markers(srcs):
    deck = {}
    for line in open(os.path.join(DATA, "labels.tsv")):
        a, size, label, srcdir, name = line.rstrip("\n").split("\t")
        a = int(a, 16)
        if srcdir == "Deck" and any(lo <= a <= hi for lo, hi in RANGES):
            deck[a] = int(size)
    islands = set()
    if os.path.exists(ISLANDS):
        for line in open(ISLANDS):
            a = int(line.split("\t")[0], 16)
            if any(lo <= a <= hi for lo, hi in RANGES) or a in EXTRA:
                islands.add(a)
    seen = {}
    for f in srcs + part_a_headers():
        for m in re.finditer(r"@yo2\s+0x([0-9a-fA-F]+)", open(f).read()):
            a = int(m.group(1), 16)
            assert a in deck or a in islands, f"{os.path.basename(f)}: {a:#010x} is not a part-A Deck function"
            assert a not in seen or seen[a] == f, f"{a:#010x} marked in {os.path.basename(seen[a])} and {os.path.basename(f)}"
            seen[a] = f
    nf = sum(1 for a in seen if a in deck)
    print(f"ok: {len(seen)} markers ({nf}/{len(deck)} labelled part-A functions, {len(seen) - nf}/{len(islands)} islands)")


def main():
    srcs = part_a_files()
    assert srcs, "no part-A sources"
    check_markers(srcs)
    compile_i686(srcs)
    with tempfile.TemporaryDirectory() as tmp:
        for p in PARTS:
            exe = compile_part(tmp, p, srcs)
            if not exe:
                print(f"skip: part {p} not present")
                continue
            check_selftest(exe, p)
            mod = os.path.join(HERE, f"deck_a_{p}_checks.py")
            if os.path.exists(mod):
                spec = importlib.util.spec_from_file_location(f"deck_a_{p}_checks", mod)
                m = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(m)
                m.check(exe)
            os.remove(exe)
        link_all(tmp, srcs)


if __name__ == "__main__":
    main()
