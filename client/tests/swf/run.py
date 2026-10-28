"""src/Swf checks: tests/swf/*_test.cpp on the host (ASan + UBSan) over every Flash dump in merge.dat, then src/Swf for
i686 (-fsyntax-only), where the YO2_AT / YO2_SIZEOF layout asserts are live.
Run: python3 -I tests/swf/run.py"""
import glob
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import dumps  # noqa: E402

SRC = sorted(glob.glob(os.path.join(ROOT, "src", "Swf", "*.cpp")))
SYSTEM = [os.path.join(ROOT, "src", "System", "yo2Debug.cpp")]
TESTS = sorted(glob.glob(os.path.join(HERE, "*_test.cpp")))
FLAGS = ["-std=c++17", "-Wall", "-Wextra", "-I" + os.path.join(ROOT, "src"), "-I" + os.path.join(ROOT, "platform")]


def run(cmd, stdin=None):
    r = subprocess.run(cmd, capture_output=True, text=True, input=stdin)
    if r.returncode or "warning" in r.stderr:
        sys.exit(f"FAILED: {cmd[0]} ... {cmd[-1]}\n" + "\n".join((r.stdout + r.stderr).splitlines()[:40]))
    return r.stdout


paths = "\n".join(dumps.dumps()) + "\n"
with tempfile.TemporaryDirectory() as tmp:
    for t in TESTS:
        exe = os.path.join(tmp, os.path.basename(t)[:-4])
        run(["c++", *FLAGS, "-g", "-O1", "-fsanitize=address,undefined", t, *SRC, *SYSTEM, "-o", exe])
        print(run([exe], paths).strip())
for f in SRC + TESTS:
    run(["i686-w64-mingw32-g++", *FLAGS, "-fsyntax-only", f])
print(f"i686 layout ok ({len(SRC)} sources, {len(TESTS)} tests)")
