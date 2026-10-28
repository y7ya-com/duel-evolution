"""src/shop checks: build and run every tests/ui_shop/*_test.cpp on the host (ASan + UBSan, under tools/memcap.py)
against the src/shop sources that build, then compile the same files for i686 (i686-w64-mingw32-g++), where the
YO2_AT / YO2_SIZEOF layout asserts are live. Run: python3 -I tests/ui_shop/run.py"""
import glob
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from memcap import run_capped  # noqa: E402

SRC = sorted(glob.glob(os.path.join(ROOT, "src", "shop", "*.cpp")))
TESTS = sorted(glob.glob(os.path.join(HERE, "*_test.cpp")))
FLAGS = ["-std=c++17", "-Wall", "-Wextra", "-I" + os.path.join(ROOT, "src"), "-I" + os.path.join(ROOT, "platform")]
HOST = ["-isystem", os.path.join(ROOT, "platform", "win32")]


def run(cmd, capped=False):
    r = run_capped(cmd) if capped else subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode or "warning" in r.stderr:
        sys.exit(f"FAILED: {cmd[0]} ... {cmd[-1]}\n" + "\n".join((r.stdout + r.stderr).splitlines()[:40]))
    return r.stdout


with tempfile.TemporaryDirectory() as tmp:
    for t in TESTS:
        exe = os.path.join(tmp, os.path.basename(t)[:-4])
        run(["c++", *FLAGS, *HOST, "-g", "-fsanitize=address,undefined", "-fno-sanitize-recover=all", t, *SRC, "-o", exe])
        print(run([exe], capped=True).strip())
for f in SRC + TESTS:
    run(["i686-w64-mingw32-g++", *FLAGS, "-fsyntax-only", f])
print(f"i686 layout ok ({len(SRC)} sources, {len(TESTS)} tests)")
