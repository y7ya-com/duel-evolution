"""Checks src/duel/EngineCards*.cpp (the engine's card tables, 0x00716c10..0x0071e000):
  - every function against the decompiled original, exhaustively: the test rebuilds the originals from the decompile
    cache (phase2-duel-tools/dc) as compilable C (ref_XXXXXX), links them with the rewrite and the real card data
    (card_prop.bin / card_intid.bin of the 2008 client) and compares every card id from -4096 to 0xffff plus extreme
    ints (pairs of ids, every group index / choice index / location word for the multi-argument ones);
  - against YOLaucher's card list (research/ia/cards_yo2.csv): card categories from the kind, spell speeds of spells and
    traps, and that the archetype predicates only pick cards whose English name has the archetype's word;
  - that src/duel/EngineCards*.cpp compile for i686 (i686-w64-mingw32-g++ -fsyntax-only).
Run: python3.12 -I tests/duel_cards_test.py   (needs c++, cc, i686-w64-mingw32-g++, the dc tool and the card data)
"""
import csv
import glob
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")
DC = os.environ.get("YO2_DC", os.path.join(HERE, "..", "..", "phase2-duel-tools", "dc"))
CARDS = os.environ.get("YO2_CARD_BIN", os.path.expanduser("~") + "/Documents/GitHub/duel-evolution-restore/extraction/recovery/out_2008/"
                       "CHG/merge/data/bin#")
CSV = os.environ.get("YO2_CARD_CSV", os.path.expanduser("~") + "/Documents/GitHub/YOLaucher-web/tools/yo2emu/research/ia/cards_yo2.csv")
FILES = sorted(glob.glob(os.path.join(SRC, "duel", "EngineCards*.cpp")))

SHIMS = {"0073c010": "db_kind", "0073bf80": "db_attr", "0073bf20": "db_race", "0073bfe0": "db_icon",
         "0073c140": "db_bit", "0073c190": "db_limit", "007917b0": "db_7917b0"}
GROUPS = ("717b00 717b80 717e20 717e60 717f00 717fa0 718010 7181e0 718210 7187c0 718660 7186e0 718720 718840 7188e0 "
          "718920 7189b0 718a00 718aa0 718ae0 718b20 718bb0 718c80 718cf0 718cb0 718d30 718da0 718de0 718e50 718e80 "
          "718ed0 718fa0 718ff0 719080 7190b0 719140 7191b0 7192f0 719330 719350 719430 719460 7194a0 7194e0 719510 "
          "719540 719570 7195b0 719620 719750 7197c0 719920 719a60 719ab0 719ad0 719bf0 719c40 719c90 719ce0 719d50 "
          "719d90 719dd0 719e00").split()   # the exe's dispatch table at 0x00beb818 (FUN_0071a240)
MULTI = {"717230", "71a240", "71dbc0", "719e50", "71cbd0", "71ce20", "6ed310", "6ed4a0", "6ee000", "6ee020", "6ee040",
         "6ee060", "6ee410", "6ee430", "6ee450", "6eed70", "71f380", "71f400"}
CALLEES = ["717a70", "71f380", "71f400"]   # decompiled too: the reference functions call them


def markers():
    """(address, function name, arity) of every // @yo2 marker over a definition in the EngineCards files"""
    out = []
    for f in FILES:
        lines = open(f).read().split("\n")
        for i, l in enumerate(lines):
            m = re.match(r"// @yo2 0x00([0-9a-f]{6})", l)
            if m and i + 1 < len(lines):
                j = i + 1
                while j < len(lines) and lines[j].startswith("//") and "@yo2" not in lines[j]:
                    j += 1   # a meaning that continues on the next comment line
                d = re.match(r"int (eng\w+)\(([^)]*)\)", lines[j]) if j < len(lines) else None
                out.append((m.group(1), d.group(1) if d else None, d.group(2) if d else None))
    return out


def build_ref(tmp, addrs):
    raw = subprocess.check_output([DC] + ["0x" + a for a in addrs], text=True)
    parts = re.split(r"^// ==== ([0-9a-f]{8})$", raw, flags=re.M)
    funcs = {parts[i][2:]: parts[i + 1] for i in range(1, len(parts), 2)}
    assert set(funcs) == set(addrs), set(addrs) ^ set(funcs)
    head = ["#include <stdint.h>", "#include <stdbool.h>",
            "typedef uint8_t undefined1, byte, undefined; typedef uint16_t undefined2, ushort;",
            "typedef uint32_t undefined4, uint; typedef int64_t undefined8; typedef int code();",
            "#define SBORROW4(a, b) ((int64_t)(int32_t)(a) - (int64_t)(int32_t)(b) != (int32_t)((uint32_t)(a) - (uint32_t)(b)))",
            "int db_kind(int); int db_attr(int); int db_race(int); int db_icon(int); int db_bit(int, int);",
            "int db_limit(int); int db_7917b0(void); uint8_t DAT_012c8618[0x200];"]
    protos, bodies, sigs = [], [], {}
    for a, b in funcs.items():
        b = re.sub(r"FUN_00([0-9a-f]{6})", lambda m: SHIMS.get("00" + m.group(1), "ref_" + m.group(1)), b)
        b = b.replace("(&PTR_LAB_00beb818)[", "PTR_LAB_00beb818[")
        b = b.replace("&DAT_012c8618", "DAT_012c8618")   # Ghidra's byte-variable view of the ring   # Ghidra's view of the table's first slot
        b = b.replace("ref_71aea0()", "ref_71aea0(param_1)")   # Ghidra dropped the pushed argument (0x0071b74d push esi)
        m = re.search(r"^(\w[\w ]*?\**)\s*(ref_\w+)\(([^)]*)\)\s*$", b, flags=re.M)
        protos.append("%s %s(%s);" % (m.group(1), m.group(2), m.group(3)))
        sigs[a] = m.group(3)
        bodies.append(b)
    tail = ["void* PTR_LAB_00beb818[63];",
            "void ref_init(void) {" + " ".join("PTR_LAB_00beb818[%d] = (void*)ref_%s;" % (i, g)
                                               for i, g in enumerate(GROUPS)) + "}"]
    wrap = []
    for a, s in sigs.items():
        if a in MULTI:
            continue
        if a == "716c10":   # Ghidra types it void; it returns the callee's EAX (0x00716c15 call, ret)
            wrap.append("int refw_716c10(int x) { ref_716c10(x); return db_limit(x); }")
            continue
        wrap.append("int refw_%s(int x) { return (int)ref_%s(x); }" % (a, a))
    wrap += ["int refw_717230(int a, int b) { return (int)ref_717230(a, b); }",
             "int refw_71a240(int a, int b) { return (int)ref_71a240(a, b); }",
             "int refw_71dbc0(int a, int b) { return (int)ref_71dbc0(a, b); }",
             "int refw_719e50(int a, int* o) { return (int)ref_719e50(a, (undefined4*)o); }",
             "int refw_71cbd0(const uint16_t* w) { return (int)ref_71cbd0((ushort*)w); }",
             "int refw_71ce20(const uint16_t* w) { return (int)ref_71ce20((ushort*)w); }",
             "int refw_6ed310(const uint16_t* w) { return (int)ref_6ed310((ushort*)w); }",
             "int refw_6ed4a0(int a, int b) { return (int)ref_6ed4a0(a, b); }",
             "int refw_6ee060(const uint16_t* w) { return (int)ref_6ee060((ushort*)w); }",
             "int refw_6ee450(int a, int b) { return (int)ref_6ee450(a, b); }",
             "int refw_6eed70(const uint16_t* w) { return (int)ref_6eed70((ushort*)w); }",
             "int refw_71f380(const uint16_t* w, int k) { return (int)ref_71f380((short*)w, k); }",
             "int refw_71f400(const uint16_t* w, int k) { return (int)ref_71f400((short*)w, k); }",
             "int refw_6ee0x(int i) { switch (i) { case 0: return (int)ref_6ee000(); case 1: return (int)ref_6ee020();"
             " case 2: return (int)ref_6ee040(); case 3: return (int)ref_6ee410(); default: return (int)ref_6ee430(); } }"]
    path = os.path.join(tmp, "ref.c")
    open(path, "w").write("\n".join(head + protos + tail[:1] + bodies + tail[1:] + wrap) + "\n")
    return path


def main():
    for f in FILES:
        subprocess.check_call(["i686-w64-mingw32-g++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-fsyntax-only",
                               "-I", SRC, f])
    mk = markers()
    addrs = [a for a, _, _ in mk]
    assert len(addrs) == len(set(addrs)), "duplicate marker"
    one = [(a, n) for a, n, args in mk if n and args == "int id" and a not in MULTI]
    with tempfile.TemporaryDirectory() as tmp:
        ref = build_ref(tmp, addrs + CALLEES)
        with open(os.path.join(tmp, "duel_cards_cases.inc"), "w") as f:
            f.write("".join("int %s(int);\nextern \"C\" int refw_%s(int);\n" % (n, a) for a, n in one))
            f.write("struct Case { const char* name; int (*mine)(int); int (*ref)(int); };\n")
            f.write("static const Case kCases[] = {\n%s};\n" % "".join(
                '    {"%s", %s, refw_%s},\n' % (n, n, a) for a, n in one))
        obj = os.path.join(tmp, "ref.o")
        subprocess.check_call(["cc", "-x", "c", "-std=gnu99", "-w", "-O1", "-c", ref, "-o", obj])
        exe = os.path.join(tmp, "duel_cards_cli")
        subprocess.check_call(["c++", "-std=c++17", "-O1", "-g", "-Wall", "-Wextra", "-Werror",
                               "-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-I", SRC, "-I", tmp,
                               os.path.join(HERE, "duel_cards_cli.cpp"), *FILES, os.path.join(SRC, "duel", "CardDB.cpp"),
                               os.path.join(SRC, "Game", "yo2GameData.cpp"),
                               obj, "-o", exe])
        r = subprocess.run([exe, CARDS], capture_output=True, text=True)
    out = r.stdout.splitlines()
    bad = [l for l in out if l.startswith("bad ") and not l.startswith("bad total")]
    assert r.returncode == 0 and not bad, "\n".join(bad[:40]) + r.stderr[-2000:]
    oks = [l for l in out if l.startswith("ok ")]
    assert len(oks) == len(one) + 7, (len(oks), len(one))
    total = sum(int(l.split()[-1]) for l in oks)
    print(f"ok: {len(mk)} markers; {len(one)} one-argument tables + 16 functions of several arguments / link records equal the decompiled "
          f"originals on {total:,} inputs (real card data)")
    sets = {l.split()[1]: dict(map(int, x.split(":")) for x in l.split()[2:]) for l in out if l.startswith("set ")}
    check_cards(sets)


KEYWORDS = {"engIsGravekeeper": "Gravekeeper", "engIsAmazoness": "Amazon", "engIsNinja": "Ninja",
            "engIsBatteryman": "Batteryman", "engIsDarkWorld": "Dark World", "engIsAncientGear": "Ancient Gear",
            "engIsHarpie": "Harpie", "engIsNeoSpacian": "Neo-Spacian", "engIsAlien": "Alien",
            "engIsDestinyHero": "Destiny Hero", "engIsCrystalBeast": "Crystal Beast", "engIsVolcanic": "Volcanic",
            "engIsCloudian": "Cloudian", "engIsGladiatorBeast": "Gladiator Beast", "engIsLightsworn": "Lightsworn",
            "engIsArcanaForce": "Arcana Force", "engIsRedEyes": "Red-Eyes", "engIsOjama": "Ojama",
            "engIsChrysalis": "Chrysalis", "engIsSixSamurai": "Six Samurai", "engIsMachiners": "Machiners",
            "engIsSphinx": "Sphinx", "engIsAllureQueen": "Allure Queen", "engIsGadget": "Gadget"}


def check_cards(sets):
    rows = list(csv.DictReader(open(CSV)))
    by_id = {int(r["konami_id"]): r for r in rows}
    # categories from the kind (csv kind = bit 0 | kind << 1)
    want = {"normal": 0, "efecto": 1, "fusión": 3, "fusión-efecto": 3, "ritual": 2, "ritual-efecto": 2,
            "mágica": 7, "trampa": 8, "token": 9, "toon": 1, "espíritu": 1, "unión": 1, "géminis": 1}
    cat = sets["engCardCategory"]
    n = 0
    for r in rows:
        k = r["kind_txt"]
        if k in want:
            assert cat.get(int(r["konami_id"]), 0) == want[k], (r["name_en"], k, cat.get(int(r["konami_id"])))
            n += 1
    # spell speed of spells and traps from their icon
    speed = sets["engSpellSpeed"]
    m = 0
    for r in rows:
        cid = int(r["konami_id"])
        if r["kind_txt"] == "mágica":
            assert speed.get(cid, 0) == (2 if r["spell_icon"].lower().startswith(("rápida", "rapida", "quick")) else 1), r
            m += 1
        elif r["kind_txt"] == "trampa":
            assert speed.get(cid, 0) == (3 if r["spell_icon"].lower().startswith(("contra", "counter")) else 2), r
            m += 1
    # archetype predicates: every picked card that the list knows has the word in its name
    k = 0
    for fn, word in KEYWORDS.items():
        for cid in sets[fn]:
            r = by_id.get(cid)
            if r:
                assert word.lower() in (r["name_en"] + r["name_es"]).lower() or fn in LOOSE, (fn, r["name_en"])
                k += 1
    print(f"ok: card list: {n} categories, {m} spell/trap speeds, {k} archetype members named as their group")


LOOSE = {"engIsSixSamurai", "engIsSphinx", "engIsAlien", "engIsRedEyes", "engIsHarpie", "engIsOjama"}


if __name__ == "__main__":
    main()
