"""src/shop checks: build and run every tests/ui_shop/*_test.cpp on the host (ASan + UBSan, under tools/memcap.py)
against src/shop and src/System (as archives: a test links only what it reaches), with tests/game's window and
platform stand-ins; then compile the same files for i686 (i686-w64-mingw32-g++), where the YO2_AT / YO2_SIZEOF layout
asserts are live. Run: python3 -I tests/ui_shop/run.py"""
import glob
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
GAMETESTS = os.path.join(ROOT, "tests", "game")
sys.path.insert(0, os.path.join(ROOT, "tools"))
from memcap import run_capped  # noqa: E402

SRC = sorted(glob.glob(os.path.join(ROOT, "src", "shop", "*.cpp")))
SYSTEM = sorted(glob.glob(os.path.join(ROOT, "src", "System", "**", "*.cpp"), recursive=True))
STUBS = [os.path.join(ROOT, "platform", "vfs", "vfs.cpp"), os.path.join(GAMETESTS, "platform_stubs.cpp")]
# the Game objects the shop uses directly (yo2ShopGlue.cpp's CGameMng link is stood in for by each test)
GAME = [os.path.join(ROOT, "src", "Game", n) for n in ("yo2GameData.cpp", "yo2PlayerBin.cpp")]
TESTS = sorted(glob.glob(os.path.join(HERE, "*_test.cpp")))
FLAGS = ["-std=c++17", "-Wall", "-Wextra", "-I" + os.path.join(ROOT, "src"), "-I" + os.path.join(ROOT, "platform"),
         "-I" + GAMETESTS]
HOST = ["-isystem", os.path.join(ROOT, "platform", "win32")]
SAN = ["-g", "-fsanitize=address,undefined", "-fno-sanitize-recover=all"]


def run(cmd, capped=False):
    r = run_capped(cmd) if capped else subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode or "warning" in r.stderr:
        sys.exit(f"FAILED: {cmd[0]} ... {cmd[-1]}\n" + "\n".join((r.stdout + r.stderr).splitlines()[:40]))
    return r.stdout


with tempfile.TemporaryDirectory() as tmp:
    def objs(name, srcs):
        out = []
        for n in srcs:
            o = os.path.join(tmp, name + "_" + os.path.basename(n) + ".o")
            run(["c++", *FLAGS, *HOST, *SAN, "-c", n, "-o", o])
            out.append(o)
        return out
    stubs = objs("stub", STUBS)
    shop, system = os.path.join(tmp, "libshop.a"), os.path.join(tmp, "libsystem.a")
    run(["ar", "rcs", shop, *objs("shop", SRC), *objs("game", GAME)])
    # the menu bar in System reads Game's g_helpTextMng: same archive, so the linker finds it
    run(["ar", "rcs", system, *objs("system", SYSTEM + [os.path.join(ROOT, "src", "Game", "yo2HelpText.cpp")])])
    for t in TESTS:
        exe = os.path.join(tmp, os.path.basename(t)[:-4])
        run(["c++", *FLAGS, *HOST, *SAN, t, *stubs, shop, system, "-o", exe])
        print(run([exe], capped=True).strip())
for f in SRC + TESTS:   # (the GAME files are tests/game's)
    run(["i686-w64-mingw32-g++", *FLAGS, "-fsyntax-only", f])
print(f"i686 layout ok ({len(SRC)} sources, {len(TESTS)} tests)")
