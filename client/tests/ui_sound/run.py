"""Host checks for one UI folder (the folder is this directory's name minus "ui_"): build and run every *_test.cpp
here with ASan + UBSan against src/System + src/<Folder> + the doubles in this directory (other folders' functions),
then compile src/<Folder> and the tests for i686 (i686-w64-mingw32-g++), where the YO2_AT / YO2_SIZEOF layout asserts
are live. Reuses tests/system's D3D8 and scene-layer fakes for src/System's own needs.
Run: python3 -I tests/ui_<folder>/run.py"""
import glob
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
NAME = os.path.basename(HERE)[3:]
FOLDER = next(d for d in os.listdir(os.path.join(ROOT, "src")) if d.lower() == NAME)
SRC = sorted(glob.glob(os.path.join(ROOT, "src", FOLDER, "*.cpp")))
EXTRA = [os.path.join(ROOT, "src", d, "*.cpp") for d in open(os.path.join(HERE, "deps.txt")).read().split()] \
    if os.path.exists(os.path.join(HERE, "deps.txt")) else []
SYSTEM = sorted(glob.glob(os.path.join(ROOT, "src", "System", "*.cpp")))
SYSFAKES = [os.path.join(ROOT, "tests", "system", f) for f in ("d3d8_fake.cpp", "stubs.cpp")]
TESTS = sorted(glob.glob(os.path.join(HERE, "*_test.cpp")))
STUBS = sorted(set(glob.glob(os.path.join(HERE, "*.cpp"))) - set(TESTS))
FLAGS = ["-std=c++17", "-Wall", "-Wextra", "-I" + os.path.join(ROOT, "src"), "-I" + os.path.join(ROOT, "platform")]
HOST = ["-isystem", os.path.join(ROOT, "platform", "win32")]  # Win32/D3D8 stand-ins off Windows; i686 uses the real headers
EXTRA = sorted(f for g in EXTRA for f in glob.glob(g))


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode or "warning" in r.stderr:
        sys.exit(f"FAILED: {cmd[0]} ... {cmd[-1]}\n" + "\n".join((r.stdout + r.stderr).splitlines()[:60]))
    return r.stdout


with tempfile.TemporaryDirectory() as tmp:
    objs, deps = [], []
    for f in SYSTEM + SYSFAKES + SRC + STUBS + EXTRA:   # compile once, link per test
        o = os.path.join(tmp, f"{len(objs) + len(deps)}.o")
        run(["c++", *FLAGS, *HOST, "-g", "-fsanitize=address,undefined", "-c", f, "-o", o])
        (deps if f in EXTRA else objs).append(o)
    lib = []
    if deps:   # other folders' sources (deps.txt) as an archive: only what the tests reach is linked
        lib = [os.path.join(tmp, "deps.a")]
        run(["ar", "rcs", lib[0], *deps])
    for t in TESTS:
        exe = os.path.join(tmp, os.path.basename(t)[:-4])
        run(["c++", *FLAGS, *HOST, "-g", "-fsanitize=address,undefined", t, *objs, *lib, "-o", exe])
        print(run([exe]).strip())
for f in SRC + TESTS + STUBS:
    run(["i686-w64-mingw32-g++", *FLAGS, "-fsyntax-only", f])
print(f"{FOLDER}: i686 layout ok ({len(SRC)} sources, {len(TESTS)} tests)")
