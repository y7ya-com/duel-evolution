"""src/System checks: build and run every tests/system/*_test.cpp on the host (ASan + UBSan), then compile src/System
and the tests for i686 (i686-w64-mingw32-g++), where the YO2_AT / YO2_SIZEOF layout asserts are live.
Run: python3 -I tests/system/run.py"""
import glob
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tools"))
from memcap import run_capped  # noqa: E402  (kills a test past 1 GB RSS)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
SRC = sorted(glob.glob(os.path.join(ROOT, "src", "System", "*.cpp")))
TESTS = sorted(glob.glob(os.path.join(HERE, "*_test.cpp")))
STUBS = sorted(set(glob.glob(os.path.join(HERE, "*.cpp"))) - set(TESTS))  # other folders' functions System calls
FLAGS = ["-std=c++17", "-Wall", "-Wextra", "-I" + os.path.join(ROOT, "src"), "-I" + os.path.join(ROOT, "platform")]


def run(cmd):
    r = run_capped(cmd) if not cmd[0].endswith(("c++", "g++", "ar")) else subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode or "warning" in r.stderr:
        sys.exit(f"FAILED: {cmd[0]} ... {cmd[-1]}\n" + "\n".join((r.stdout + r.stderr).splitlines()[:40]))
    return r.stdout


with tempfile.TemporaryDirectory() as tmp:
    for t in TESTS:
        exe = os.path.join(tmp, os.path.basename(t)[:-4])
        run(["c++", *FLAGS, "-isystem", os.path.join(ROOT, "platform", "win32"), "-g", "-fsanitize=address,undefined", t, *SRC, *STUBS, "-o", exe])
        print(run([exe]).strip())
for f in SRC + TESTS + STUBS:
    run(["i686-w64-mingw32-g++", *FLAGS, "-fsyntax-only", f])
print(f"i686 layout ok ({len(SRC)} sources, {len(TESTS)} tests)")
