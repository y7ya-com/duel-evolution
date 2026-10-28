"""src/Lobby checks: build and run every tests/lobby/*_test.cpp on the host (ASan + UBSan) against src/Lobby with
src/System, src/Game and src/Net as archives (a test links only the objects it reaches), then compile src/Lobby and
the tests for i686, where the YO2_AT / YO2_SIZEOF layout asserts are live.
Run: python3 -I tests/lobby/run.py [test-filter]"""
import glob
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tools"))
from memcap import run_capped  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
src = lambda *d: sorted(f for x in d for f in glob.glob(os.path.join(ROOT, "src", x, "**", "*.cpp"), recursive=True))
LOBBY, SYSTEM, GAME = src("Lobby"), src("System"), src("Game")
NET = [f for f in src("Net") if os.sep + "app" + os.sep not in f]   # src/Net/app: the game's glue, not the tests'
TESTS = sorted(t for t in glob.glob(os.path.join(HERE, "*_test.cpp")) if len(sys.argv) < 2 or sys.argv[1] in t)
# lobby_stubs.cpp (FriendBase / duel menu / error tests), platform_stubs.cpp + net_hooks_stub.cpp (the player-list
# family's), and the merge.dat VFS
STUBS = [os.path.join(HERE, f) for f in ("lobby_stubs.cpp", "platform_stubs.cpp", "net_hooks_stub.cpp")] + [
    os.path.join(ROOT, "platform", "vfs", "vfs.cpp")]
HOST = ["-isystem", os.path.join(ROOT, "platform", "win32")]
FLAGS = ["-std=c++17", "-Wall", "-Wextra", "-I" + os.path.join(ROOT, "src"), "-I" + os.path.join(ROOT, "src", "Net"),
         "-I" + os.path.join(ROOT, "platform"), "-I" + HERE, "-I" + os.path.join(ROOT, "tests", "game")]


def run(cmd):
    r = run_capped(cmd) if not cmd[0].endswith(("c++", "g++", "ar")) else subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode or "warning" in r.stderr:
        sys.exit(f"FAILED: {cmd[0]} ... {cmd[-1]}\n" + "\n".join((r.stdout + r.stderr).splitlines()[:60]))
    return r.stdout


with tempfile.TemporaryDirectory() as tmp:
    san = ["-g", "-fsanitize=address,undefined"]

    def objects(name, srcs):
        out = []
        for n in srcs:
            o = os.path.join(tmp, name + "_" + os.path.basename(n) + ".o")
            run(["c++", *FLAGS, *HOST, *san, "-c", n, "-o", o])
            out.append(o)
        return out

    def archive(name, srcs):
        lib = os.path.join(tmp, f"lib{name}.a")
        run(["ar", "rcs", lib, *objects(name, srcs)])
        return lib

    libs = [archive("lobby", LOBBY), archive("game", GAME), archive("net", NET), archive("system", SYSTEM)]
    # archives too: a test takes a stand-in from the first stub file that has it, never two copies
    stubs = [archive("stubs" + str(i), [f]) for i, f in enumerate(STUBS)]
    for t in TESTS:
        exe = os.path.join(tmp, os.path.basename(t)[:-4])
        run(["c++", *FLAGS, *HOST, *san, t, *stubs, *libs, "-o", exe])
        print(run([exe]).strip())
for f in LOBBY + TESTS:
    run(["i686-w64-mingw32-g++", *FLAGS, "-fsyntax-only", f])
print(f"i686 layout ok ({len(LOBBY)} sources, {len(TESTS)} tests)")
