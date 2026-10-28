"""Run a build or test command when the machine has room for it: admitted while the CPU in use stays under ~80% of
the cores and free memory stays >= 20%, at most SLOTS at once machine-wide, at nice 5. A `make -jN` gets -j sized to
the idle cores. Waits until admitted. A command already inside a slot (YO2_BUILDSLOT set) runs straight away.

    python3 -I /Users/y/Documents/GitHub/yo2-decomp/tools/buildslot.py cmd args...

YO2_BUILDSLOT_CPU (default 0.8) and YO2_BUILDSLOT_MEM (default 20) change the thresholds.
"""
import fcntl
import os
import re
import subprocess
import sys
import time

DATA = os.environ.get("YO2_DATA", "/Users/y/Documents/GitHub/yo2-decomp-data")
SLOTS = 6                 # ponytail: a hard cap on top of the resource gate, so a burst of jobs can't all start at once
STAGGER = 3.0             # seconds between admissions machine-wide: a new job's load shows up before the next check
CPU_CAP = float(os.environ.get("YO2_BUILDSLOT_CPU", "0.8"))
MEM_MIN = int(os.environ.get("YO2_BUILDSLOT_MEM", "20"))
NCPU = os.cpu_count() or 8


def busy_cores():
    """Cores in use right now: the sum of every process's %CPU (ps), in cores."""
    out = subprocess.run(["ps", "-A", "-o", "%cpu="], capture_output=True, text=True).stdout
    return sum(float(x) for x in out.split() if x.replace(".", "", 1).isdigit()) / 100


def mem_free_pct():
    out = subprocess.run(["memory_pressure"], capture_output=True, text=True).stdout
    m = re.search(r"free percentage: (\d+)%", out)
    return int(m.group(1)) if m else 100


def with_jobs(cmd, idle):
    """make -jN -> -j sized to the idle cores (at least 1, at most N*3 so a -j2 caller isn't handed the whole box)."""
    if not cmd or os.path.basename(cmd[0]) != "make":
        return cmd
    out = []
    for a in cmd:
        m = re.fullmatch(r"-j(\d+)", a)
        out.append(f"-j{max(1, min(int(idle), int(m.group(1)) * 3))}" if m else a)
    return out


def main():
    args = sys.argv[1:]
    if os.environ.get("YO2_BUILDSLOT"):
        sys.exit(subprocess.call(["nice", "-n", "5", *args]))
    locks = [open(os.path.join(DATA, f".build.lock.{i}"), "w") for i in range(SLOTS)]
    gate = open(os.path.join(DATA, ".build.gate"), "a+")
    waited = time.time()
    while True:
        busy, mem = busy_cores(), mem_free_pct()
        idle = NCPU * CPU_CAP - busy
        if idle >= 1 and mem >= MEM_MIN:
            fcntl.flock(gate, fcntl.LOCK_EX)   # one admission at a time, STAGGER apart
            gate.seek(0)
            last = float(gate.read() or 0)
            if time.time() - last >= STAGGER:
                for i, f in enumerate(locks):
                    try:
                        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except BlockingIOError:
                        continue
                    gate.seek(0)
                    gate.truncate()
                    gate.write(str(time.time()))
                    gate.flush()
                    fcntl.flock(gate, fcntl.LOCK_UN)
                    if time.time() - waited > 5:
                        print(f"buildslot: slot {i} after {time.time() - waited:.0f} s ({busy:.1f} cores busy, "
                              f"{mem}% free)", file=sys.stderr)
                    cmd = ["nice", "-n", "5", *with_jobs(args, idle)]
                    sys.exit(subprocess.call(cmd, env={**os.environ, "YO2_BUILDSLOT": str(i)}))
            fcntl.flock(gate, fcntl.LOCK_UN)
        time.sleep(2)


if __name__ == "__main__":
    main()
