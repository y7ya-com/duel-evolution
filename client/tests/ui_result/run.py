"""src/Result checks: build and run every tests/ui_result/*_test.cpp on the host (ASan + UBSan) against src/Result
and the slice of src/System it sits on, with stand-ins for the other folders' code (the other .cpp files here); then
compile the same files for i686 (i686-w64-mingw32-g++), where the YO2_AT / YO2_SIZEOF layout asserts are live.
Run: python3 -I tests/ui_result/run.py"""
import glob
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
FOLDER = "Result"
SYSTEM = ["yo2Task", "yo2EasyTask", "yo2TaskPtr", "yo2Element", "yo2Debug"]

SRC = sorted(glob.glob(os.path.join(ROOT, "src", FOLDER, "*.cpp")))
SYS = [os.path.join(ROOT, "src", "System", n + ".cpp") for n in SYSTEM]
TESTS = sorted(glob.glob(os.path.join(HERE, "*_test.cpp")))
STUBS = sorted(set(glob.glob(os.path.join(HERE, "*.cpp"))) - set(TESTS))
FLAGS = ["-std=c++17", "-Wall", "-Wextra", "-I" + os.path.join(ROOT, "src"), "-I" + os.path.join(ROOT, "platform")]
HOST = ["-isystem", os.path.join(ROOT, "platform", "win32")]  # Win32/D3D8 stand-ins off Windows; i686 uses the real headers


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode or "warning" in r.stderr:
        sys.exit(f"FAILED: {cmd[0]} ... {cmd[-1]}\n" + "\n".join((r.stdout + r.stderr).splitlines()[:40]))
    return r.stdout


with tempfile.TemporaryDirectory() as tmp:
    for t in TESTS:
        exe = os.path.join(tmp, os.path.basename(t)[:-4])
        run(["c++", *FLAGS, *HOST, "-g", "-fsanitize=address,undefined", "-fno-sanitize-recover=all", t, *SRC, *SYS, *STUBS,
             "-o", exe])
        print(run([exe]).strip())
for f in SRC + TESTS + STUBS:
    run(["i686-w64-mingw32-g++", *FLAGS, "-fsyntax-only", f])
print(f"i686 layout ok ({len(SRC)} sources, {len(TESTS)} tests)")
