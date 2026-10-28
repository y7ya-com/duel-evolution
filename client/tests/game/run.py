"""src/Game checks: build and run every tests/game/*_test.cpp on the host (ASan + UBSan) against src/Game, src/System
and the platform's merge.dat VFS, then compile src/Game and the tests for i686 (i686-w64-mingw32-g++), where the
YO2_AT / YO2_SIZEOF layout asserts are live.
Tests that read real game data use YO2_MERGE_DAT (default: duel-evolution-restore's recovered merge.dat) and say
"skipped" when it is missing. Run: python3 -I tests/game/run.py [test-filter] [--src Avatar/,yo2Foo]   (--src: build only the src/Game files whose
path contains one of the comma-separated parts, plus yo2GameData.cpp: lets two people work on different folders)"""
import glob
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tools"))
from memcap import run_capped  # noqa: E402  (kills a test past 1 GB RSS)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
GAME = sorted(f for d in ("Game", "MyRoom", "ChangeAvatar", "PlayerSelect")
              for f in glob.glob(os.path.join(ROOT, "src", d, "**", "*.cpp"), recursive=True))
SYSTEM = sorted(glob.glob(os.path.join(ROOT, "src", "System", "**", "*.cpp"), recursive=True))
NET = sorted(glob.glob(os.path.join(ROOT, "src", "Net", "*.cpp")))
VFS = [os.path.join(ROOT, "platform", "vfs", "vfs.cpp"), os.path.join(HERE, "platform_stubs.cpp")]
args = sys.argv[1:]
if "--src" in args:
    i = args.index("--src")
    parts = args[i + 1].split(",")
    del args[i:i + 2]
    GAME = [g for g in GAME if g.endswith("yo2GameData.cpp") or any(p in g for p in parts)]
TESTS = sorted(t for t in glob.glob(os.path.join(HERE, "*_test.cpp")) if not args or args[0] in t)
HOST = ["-isystem", os.path.join(ROOT, "platform", "win32")]  # Win32/D3D8 stand-ins off Windows; i686 uses the real headers
FLAGS = ["-std=c++17", "-Wall", "-Wextra", "-I" + os.path.join(ROOT, "src"), "-I" + os.path.join(ROOT, "platform"),
         "-I" + HERE]
os.environ.setdefault("YO2_MERGE_DAT", "/Users/y/Documents/GitHub/duel-evolution-restore/extraction/recovery/merge.dat")


def run(cmd):
    r = run_capped(cmd) if not cmd[0].endswith(("c++", "g++", "ar")) else subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode or "warning" in r.stderr:
        sys.exit(f"FAILED: {cmd[0]} ... {cmd[-1]}\n" + "\n".join((r.stdout + r.stderr).splitlines()[:60]))
    return r.stdout


with tempfile.TemporaryDirectory() as tmp:
    # src/System and src/Net as archives: the linker takes only the objects Game uses (their own tests stub the rest);
    san = ["-g", "-fsanitize=address,undefined"]

    def archive(name, srcs):
        objs = []
        for n in srcs:
            o = os.path.join(tmp, name + "_" + os.path.basename(n) + ".o")
            run(["c++", *FLAGS, *HOST, *san, "-c", n, "-o", o])
            objs.append(o)
        lib = os.path.join(tmp, f"lib{name}.a")
        run(["ar", "rcs", lib, *objs])
        return lib

    # src/Game too, so a test links only the Game objects it reaches (and only their stand-ins)
    libs = [archive("game", GAME), archive("net", NET), archive("system", SYSTEM)]
    vfs = [os.path.join(tmp, "vfs_" + os.path.basename(v) + ".o") for v in VFS]
    for v, o in zip(VFS, vfs):
        run(["c++", *FLAGS, *HOST, *san, "-c", v, "-o", o])
    for t in TESTS:
        exe = os.path.join(tmp, os.path.basename(t)[:-4])
        run(["c++", *FLAGS, *HOST, *san, t, *vfs, *libs, "-o", exe])
        print(run([exe]).strip())
for f in GAME + TESTS:
    run(["i686-w64-mingw32-g++", *FLAGS, "-fsyntax-only", f])
print(f"i686 layout ok ({len(GAME)} sources, {len(TESTS)} tests)")
