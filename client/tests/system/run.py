"""src/System checks: build and run every tests/system/*_test.cpp on the host (ASan + UBSan), then compile src/System
for i686 (i686-w64-mingw32-g++), where the YO2_AT / YO2_SIZEOF layout asserts are live.
Each file is compiled once, two at a time (nice 19).
Run: python3 -I tests/system/run.py [--skip a.cpp,b.cpp]  (leave out unfinished sources and the tests using them)"""
import concurrent.futures
import glob
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tools"))
from memcap import run_capped  # noqa: E402  (kills a test past 1 GB RSS)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
SKIP = set(sys.argv[sys.argv.index("--skip") + 1].split(",")) if "--skip" in sys.argv else set()
SRC = sorted(f for f in glob.glob(os.path.join(ROOT, "src", "System", "*.cpp")) if os.path.basename(f) not in SKIP)
TESTS = sorted(f for f in glob.glob(os.path.join(HERE, "*_test.cpp")) if os.path.basename(f) not in SKIP)
WINDOW = sorted(glob.glob(os.path.join(ROOT, "src", "System", "window", "*.cpp")))  # an archive: only what System uses
STUBS = sorted(f for f in glob.glob(os.path.join(HERE, "*.cpp")) if not f.endswith("_test.cpp"))  # other folders' functions System calls
FLAGS = ["-std=c++17", "-Wall", "-Wextra", "-I" + os.path.join(ROOT, "src"), "-I" + os.path.join(ROOT, "platform")]
HOST = ["nice", "-n", "19", "c++", *FLAGS, "-isystem", os.path.join(ROOT, "platform", "win32"), "-g", "-fsanitize=address,undefined"]


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)  # compilers; tests go through run_capped
    if r.returncode or "warning" in r.stderr:
        return f"FAILED: {cmd[0]} ... {cmd[-1]}\n" + "\n".join((r.stdout + r.stderr).splitlines()[:40])
    return None


def all_ok(cmds):
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        for err in pool.map(run, cmds):
            if err:
                sys.exit(err)


with tempfile.TemporaryDirectory() as tmp:
    obj = {f: os.path.join(tmp, os.path.basename(f) + ".o") for f in SRC + STUBS + TESTS + WINDOW}
    all_ok([[*HOST, "-c", f, "-o", obj[f]] for f in obj])
    window = os.path.join(tmp, "libwindow.a")
    all_ok([["ar", "rcs", window, *(obj[f] for f in WINDOW)]])
    libs = [obj[f] for f in SRC + STUBS] + [window]
    exes = {t: os.path.join(tmp, os.path.basename(t)[:-4]) for t in TESTS}
    all_ok([["c++", "-fsanitize=address,undefined", obj[t], *libs, "-o", exes[t]] for t in TESTS])
    for t in TESTS:
        r = run_capped([exes[t]])
        if r.returncode:
            sys.exit(f"FAILED: {exes[t]}\n" + "\n".join((r.stdout + r.stderr).splitlines()[:40]))
        print(r.stdout.strip())
# mingw has the real d3d8.h but no d3dx8.h: platform/win32's declarations, on the real d3d8.h
with tempfile.TemporaryDirectory() as tmp:
    with open(os.path.join(ROOT, "platform", "win32", "d3dx8.h")) as f:
        d3dx = f.read().replace('#include "d3d8.h"', "#include <d3d8.h>")
    with open(os.path.join(tmp, "d3dx8.h"), "w") as f:
        f.write(d3dx)
    all_ok([["i686-w64-mingw32-g++", *FLAGS, "-idirafter", tmp, "-fsyntax-only", f] for f in SRC])  # (the tests read the fake device's fields)
print(f"i686 layout ok ({len(SRC)} sources)")
