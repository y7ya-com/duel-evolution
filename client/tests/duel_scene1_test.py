"""Checks the first half of the duel scene (src/duel/Scene*.cpp, 0x00750000..0x007a0000):
  - every `// @yo2 0xADDR` marker in src/duel/Scene* names a game/duel function of the range (outside the NetDuel
    accessors 0x00790530..0x007918a0, except the scene accessors the lead assigned here) or one of the islands Ghidra
    missed there; no address is marked twice, nor anywhere else under src/;
  - every Scene file compiles for the exe's target (i686-w64-mingw32-g++ -fsyntax-only: the YO2_AT layout asserts)
    and for the host;
  - the host build (ASan + UBSan) of all Scene files with tests/duel_scene1_stubs.cpp and duel_scene1_cli.cpp links,
    and its selftest passes: CCard::update / moveTo / snap (0x00758540, 0x00758210, 0x007583d0) and the match tally
    (0x00794a90) are run against the decompiled originals (dc output compiled as C, DAT_ globals mapped onto the same
    variables) on random states; the dialogs' state machines, layout math and answers, the LP verdict, the BGM pick
    and the scene accessors are checked against the decompiled formulas through the stubs, as are CNumber's digit
    strips and CCard::draw (moving / settled, the ATK / DEF easing);
  - the constant tables (summon commands DAT_00cd4a10, phase texts DAT_00cd4a48) match the exe's bytes.
Run: python3.12 -I tests/duel_scene1_test.py   (needs c++, cc, i686-w64-mingw32-g++, the dc tool and yo2.exe)
"""
import glob
import math
import os
import re
import struct
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")
INC = os.path.join(HERE, "..", "include")
DATA = os.environ.get("YO2_DATA", "/Users/y/Documents/GitHub/yo2-decomp-data")
TOOLS = os.environ.get("YO2_TOOLS", os.path.join(HERE, "..", "..", "phase2-duel-tools"))
DC = os.path.join(TOOLS, "dc")
LO, HI = 0x00750000, 0x008c6ab0   # the duel scene: all of duel from 0x751d20 on (round 2 ownership)
OWNED = (0x006E0CF0, 0x007F0000)   # the duel session's address range in the trace-ordered restart (any label)
NETDUEL = (0x00790530, 0x007918a0)
# scene accessors inside the NetDuel range that the lead moved here
# System-labelled functions at the head of yo2Dialogs.cpp: the HP / Ok dialog bases' copies of CUGDialogBase's code
TAKEN = {0x00772240, 0x00772280, 0x00772320, 0x00772430, 0x00772860, 0x007728a0, 0x007728c0, 0x00772aa0,
         # CGameObject's slots 1 and 2, emitted in other files
         0x00751cd0, 0x0076eca0,
         # CAffectIcon's deleting destructor and CBattleManager (yo2BattleManager.cpp), labelled System
         0x00751cf0, 0x00754040, 0x007541e0, 0x00754200, 0x00754270, 0x007542b0, 0x00754340, 0x00754360,
         0x00754400, 0x00754430, 0x00754460, 0x00754490, 0x007544c0, 0x007544e0, 0x00754600, 0x00754630,
         0x00754660, 0x00754790, 0x00754810, 0x00754930, 0x00754960, 0x00754980}
ASSIGNED = {0x00790590, 0x007905d0, 0x007905f0, 0x00790610, 0x00790690, 0x007906c0, 0x007906e0, 0x00790740,
            0x00790e50}
ROOT = os.path.normpath(os.path.join(HERE, ".."))
PLATFORM = os.path.join(ROOT, "platform")
HOST = ["c++", "-std=c++17", "-O1", "-g", "-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter",
        "-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-I", SRC, "-I", INC, "-I", HERE,
        "-I", PLATFORM, "-isystem", os.path.join(PLATFORM, "win32")]
SYSTEM = sorted(glob.glob(os.path.join(SRC, "System", "**", "*.cpp"), recursive=True))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from memcap import run_capped  # noqa: E402  (kills a test past 1 GB RSS)


def scene_files():
    return sorted(glob.glob(os.path.join(SRC, "duel", "Scene*.cpp")))


NOT_LINKED = {"SceneDeckList.cpp"}   # unfinished (its outside calls aren't stubbed yet): compiled, not linked


def linked_files():
    return [f for f in scene_files() if os.path.basename(f) not in NOT_LINKED]


def scene_headers():
    return sorted(glob.glob(os.path.join(SRC, "duel", "Scene*.h")))


def check_markers():
    allowed = set()
    for line in open(os.path.join(DATA, "labels.tsv")):
        p = line.rstrip("\n").split("\t")
        a = int(p[0], 16)
        if p[2] == "game" and p[3] == "duel" and LO <= a < HI and not (NETDUEL[0] <= a < NETDUEL[1]):
            allowed.add(a)
    labelled = set(allowed)
    allowed |= ASSIGNED | TAKEN
    islands = set()
    for line in open(os.path.join(TOOLS, "islands.tsv")):
        a = int(line.split("\t")[0], 16)
        if LO <= a < HI:
            islands.add(a)
    seen = {}
    for f in scene_files() + scene_headers():
        for m in re.finditer(r"@yo2\s+0x([0-9a-fA-F]+)", open(f).read()):
            a = int(m.group(1), 16)
            assert a in allowed or a in islands or OWNED[0] <= a < OWNED[1], \
                f"{os.path.basename(f)}: {a:#010x} is not a duel function"
            assert a not in seen or seen[a] == f, f"{a:#010x} marked in {seen[a]} and {f}"
            seen[a] = f
    mine = set(seen)
    for f in glob.glob(os.path.join(SRC, "**", "*.*"), recursive=True):
        if os.path.basename(f).startswith("Scene"):
            continue
        for m in re.finditer(r"@yo2\s+0x([0-9a-fA-F]+)", open(f, errors="replace").read()):
            a = int(m.group(1), 16)
            assert a not in mine, f"{a:#010x} is marked in {f} too"
    nl = sum(1 for a in seen if a in labelled)
    na = sum(1 for a in seen if a in ASSIGNED)
    ni = sum(1 for a in seen if a in islands and a not in allowed)
    print(f"ok: {len(seen)} markers ({nl}/{len(labelled)} labelled, {na}/{len(ASSIGNED)} assigned accessors, "
          f"{ni}/{len(islands)} islands)")


def compile_all():
    for s in scene_files():
        subprocess.check_call(["i686-w64-mingw32-g++", "-std=c++17", "-Wall", "-Werror", "-fsyntax-only",
                               "-I", SRC, "-I", INC, s])
        subprocess.check_call(["c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter",
                               "-fsyntax-only", "-I", SRC, "-I", INC, "-I", PLATFORM, "-isystem",
                               os.path.join(PLATFORM, "win32"), s])
    print(f"ok: {len(scene_files())} files compile for i686 (YO2_AT layout asserts) and the host")


# ---------------------------------------------------------------- the decompiled originals as C
REFS = ["758540", "758210", "7583d0", "794a90"]
DATS = {   # Ghidra global -> the variable the CLI points at
    "DAT_012cc844": "(*p_viewer)", "DAT_012a6b8c": "(*p_miniH)", "DAT_012a6b84": "(*p_cardW)",
    "DAT_0126ca10": "(*p_sin)", "_DAT_012a9088": "(*p_games)", "DAT_012a908b": "(*p_game0)",
    "DAT_012a908c": "(p_game0[1])", "DAT_012a9090": "(*p_endMode)", "DAT_00cd82d0": "(*p_result)",
}


def build_ref(tmp):
    raw = subprocess.check_output([DC] + ["0x" + a for a in REFS], text=True)
    parts = re.split(r"^// ==== ([0-9a-f]{8})$", raw, flags=re.M)
    funcs = {parts[i][2:]: parts[i + 1] for i in range(1, len(parts), 2)}
    assert set(funcs) == set(REFS), funcs.keys()
    bodies = []
    for a, b in funcs.items():
        b = re.sub(r"__fastcall |__thiscall ", "", b)
        b = re.sub(r"(FUN_00" + a + r")\(int param_1", r"\1(char *param_1", b)
        b = re.sub(r"FUN_00([0-9a-f]{6})", lambda m: ("ref_" if m.group(1) in REFS else "ext_") + m.group(1), b)
        for d, v in DATS.items():
            b = re.sub(r"\b" + d + r"\b", v, b)
        left = re.findall(r"\b_?DAT_[0-9a-f]+", b)
        assert not left, f"{a}: unmapped globals {left}"
        bodies.append(b)
    head = """#include <stdint.h>
typedef uint8_t undefined1, byte, undefined; typedef uint16_t undefined2, ushort; typedef int16_t sshort;
typedef uint32_t undefined4, uint; typedef uint64_t undefined8, ulonglong; typedef int8_t sbyte;
#define CONCAT31(a, b) ((uint32_t)(a) << 8 | (uint8_t)(b))
extern uint32_t* p_viewer; extern int32_t *p_miniH, *p_cardW, *p_sin, *p_endMode, *p_result;
extern uint8_t *p_games, *p_game0;
uint64_t ext_7bea20(unsigned p, unsigned z, unsigned i); int ext_7904f0(void);
int ref_758540(char *param_1); uint ref_758210(char *param_1, ushort *param_2); void ref_7583d0(char *param_1);
void ref_794a90(undefined4 param_1);
"""
    path = os.path.join(tmp, "ref.c")
    open(path, "w").write(head + "\n".join(bodies) + "\n")
    obj = os.path.join(tmp, "ref.o")
    subprocess.check_call(["cc", "-c", "-O1", "-w", "-fwrapv", path, "-o", obj])
    return obj


# ---------------------------------------------------------------- the exe's bytes
def exe_reader():
    exe = open(os.path.join(DATA, "yo2.exe"), "rb").read()
    pe = struct.unpack_from("<I", exe, 0x3c)[0]
    n = struct.unpack_from("<H", exe, pe + 6)[0]
    opt = struct.unpack_from("<H", exe, pe + 20)[0]
    base = struct.unpack_from("<I", exe, pe + 24 + 28)[0]
    secs = [struct.unpack_from("<IIII", exe, pe + 24 + opt + i * 40 + 8) for i in range(n)]

    def ints(addr, count):
        for vs, va, rs, raw in secs:
            if base + va <= addr < base + va + rs:
                return list(struct.unpack_from("<%di" % count, exe, raw + addr - base - va))
        raise KeyError(hex(addr))
    return ints


def check_tables(exe_cli):
    ints = exe_reader()
    out = run_capped([exe_cli, "tables"]).stdout.split("\n")
    summon = [int(x) for x in out[0].split()[1:]]
    assert summon == ints(0x00cd4a10, 14), (summon, ints(0x00cd4a10, 14))
    phase = [int(x) for x in out[1].split()[1:]]
    assert phase == ints(0x00cd4a48, 12), (phase, ints(0x00cd4a48, 12))
    assert ints(0x00cd82f8, 3) == [0x20000010, 0x20000011, 0x20000012]   # kDuelBgm in SceneDuelScene.cpp
    assert [x & 0xffffffff for x in ints(0x00cd8308, 2)] == [0x20000013, 0x20000014]   # kStoryBgm
    assert ints(0x00cd82d0, 1) == [-1]   # g_matchResult's initial value
    print("ok: summon / phase / BGM tables match the exe")


def main():
    check_markers()
    compile_all()
    keep = os.environ.get("SCENE1_KEEP")   # a directory to keep the build in (debugging)
    with tempfile.TemporaryDirectory() as tmp:
        if keep:
            os.makedirs(keep, exist_ok=True)
            tmp = keep
        ref = build_ref(tmp)
        # src/System as an archive: the linker takes only the objects the scene reaches
        objs = []
        for n in SYSTEM:
            o = os.path.join(tmp, "sys_" + os.path.basename(n) + ".o")
            subprocess.check_call(HOST + ["-Wno-error", "-w", "-c", n, "-o", o])
            objs.append(o)
        lib = os.path.join(tmp, "libsystem.a")
        subprocess.check_call(["ar", "rcs", lib, *objs])
        exe = os.path.join(tmp, "duel_scene1")
        subprocess.check_call(HOST + [os.path.join(HERE, "duel_scene1_cli.cpp"),
                                      os.path.join(HERE, "duel_scene1_stubs.cpp"), *linked_files(), ref, lib, "-o", exe])
        # DAT_0126ca10 is built at run time; a 16.16 cosine table ([0] = 0x10000) stands in for it
        sin = os.path.join(tmp, "sin.bin")
        open(sin, "wb").write(struct.pack("<512i", *[int(round(math.cos(2 * math.pi * k / 512) * 65536))
                                                     for k in range(512)]))
        r = run_capped([exe, "selftest", sin])
        if r.returncode:
            sys.exit(f"selftest failed ({r.returncode}):\n{r.stdout}{r.stderr[-6000:]}")
        print("ok: selftest " + r.stdout.strip().split()[-1] + " checks (incl. CCard and match tally vs the originals)")
        check_tables(exe)


if __name__ == "__main__":
    main()
