"""Checks for the misc session's rewrites (src/Misc, src/login, src/Deck/DeckManager, ...). Each tests/misc/*_test.cpp
names the src files it needs on a `// sources:` line (globs under src/, space separated); it is built with them on the
host (ASan + UBSan) and run under tools/memcap.py, then the test and its sources are compiled for i686
(i686-w64-mingw32-g++ -fsyntax-only), where the YO2_AT / YO2_SIZEOF layout asserts are live.
Run: python3 -I tests/misc/run.py [filter]"""
import glob
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from memcap import run_capped  # noqa: E402

FLAGS = ["-std=c++17", "-Wall", "-Wextra", "-I" + os.path.join(ROOT, "src"), "-I" + os.path.join(ROOT, "platform"),
         "-I" + HERE]
HOST = ["-isystem", os.path.join(ROOT, "platform", "win32"), "-g", "-fsanitize=address,undefined"]
TESTS = sorted(t for t in glob.glob(os.path.join(HERE, "*_test.cpp")) if len(sys.argv) < 2 or sys.argv[1] in t)


def run(cmd, capped=False):
    r = run_capped(cmd) if capped else subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode or "warning" in r.stderr:
        sys.exit(f"FAILED: {cmd[0]} ... {cmd[-1]}\n" + "\n".join((r.stdout + r.stderr).splitlines()[:60]))
    return r.stdout


with tempfile.TemporaryDirectory() as tmp:
    # mingw has the real d3d8.h but no d3dx8.h: platform/win32's declarations, as tests/system/run.py does
    with open(os.path.join(ROOT, "platform", "win32", "d3dx8.h")) as f:
        d3dx = f.read().replace('#include "d3d8.h"', "#include <d3d8.h>")
    with open(os.path.join(tmp, "d3dx8.h"), "w") as f:
        f.write(d3dx)
    for t in TESTS:
        m = re.search(r"^// sources:(.*)$", open(t).read(), re.M)
        srcs = sorted(f for s in (m.group(1).split() if m else []) for f in glob.glob(os.path.join(ROOT, "src", s)))
        srcs.append(os.path.join(HERE, "codepage_stubs.cpp"))   # System's code-page seams (platform's in the game)
        srcs.append(os.path.join(ROOT, "src", "Game", "yo2HelpText.cpp"))   # the menu bar reads HelpTextMng (Game)
        exe = os.path.join(tmp, os.path.basename(t)[:-4])
        objs = []   # the sources as an archive: the linker takes only what the test reaches
        for i, f in enumerate(srcs):
            objs.append(os.path.join(tmp, f"{os.path.basename(t)}.{i}.o"))
            run(["c++", *FLAGS, *HOST, "-c", f, "-o", objs[-1]])
        lib = [os.path.join(tmp, os.path.basename(t) + ".a")] if objs else []
        if objs:
            run(["ar", "rcs", lib[0], *objs])
        run(["c++", *FLAGS, *HOST, t, *lib, "-o", exe])
        print(run([exe], capped=True).strip())
        for f in [t, *srcs]:
            run(["i686-w64-mingw32-g++", *FLAGS, "-idirafter", tmp, "-fsyntax-only", f])
print(f"misc: {len(TESTS)} tests, i686 layout ok")
