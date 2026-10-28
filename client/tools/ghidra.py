"""Run a Ghidra post-script against the shared yo2 project, one run at a time machine-wide.

    python3 -I tools/ghidra.py [--write] <Script.java> [script args...]

Holds an exclusive lock (YO2_DATA/.ghidra.lock) for the whole run, caps the JVM at 2.5 GB and refuses to start
when the machine has under 40% free memory: several sessions share one 16 GB Mac. Read-only unless --write.
Prefer the decompiled cache (tools/decomp.py) over running Ghidra at all.
"""
import fcntl
import os
import re
import subprocess
import sys

DATA = os.environ.get("YO2_DATA", os.path.expanduser("~") + "/Documents/GitHub/yo2-decomp-data")
HEADLESS = "/opt/homebrew/opt/ghidra/libexec/support/analyzeHeadless"
JAVA_HOME = "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
SCRIPTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ghidra_scripts")
MIN_FREE = 40


def free_percent():
    out = subprocess.run(["memory_pressure"], capture_output=True, text=True).stdout
    m = re.search(r"free percentage: (\d+)%", out)
    return int(m.group(1)) if m else 100


def main():
    args = sys.argv[1:]
    write = args and args[0] == "--write"
    if write:
        args = args[1:]
    if not args:
        sys.exit(__doc__)
    with open(os.path.join(DATA, ".ghidra.lock"), "w") as lock:
        print("waiting for the Ghidra lock...", file=sys.stderr, flush=True)
        fcntl.flock(lock, fcntl.LOCK_EX)
        if free_percent() < MIN_FREE:
            sys.exit(f"only {free_percent()}% memory free (< {MIN_FREE}%): not starting Ghidra")
        cmd = [HEADLESS, os.path.join(DATA, "ghidra-proj"), "yo2", "-process", "yo2.exe", "-noanalysis",
               "-scriptPath", SCRIPTS, "-postScript", *args]
        if not write:
            cmd.insert(cmd.index("-noanalysis") + 1, "-readOnly")
        env = dict(os.environ, JAVA_HOME=JAVA_HOME, GHIDRA_HEADLESS_MAXMEM="2500M")
        sys.exit(subprocess.run(cmd, env=env).returncode)


if __name__ == "__main__":
    main()
