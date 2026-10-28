"""Run a test program with a memory ceiling: polls its RSS and kills it past the limit (default 1024 MB).

A runaway test (7 GB, under ASan) once pushed the shared 16 GB Mac to 37% free. macOS doesn't enforce RLIMIT_RSS and
RLIMIT_AS breaks ASan's shadow memory, so this watches from outside instead.

    from memcap import run_capped          # test runners: r = run_capped([exe])  -> CompletedProcess
    python3 -I tools/memcap.py [--mb N] [--timeout S] cmd args...
"""
import os
import subprocess
import sys
import time

LIMIT_MB = int(os.environ.get("YO2_TEST_RSS_MB", "1024"))


def rss_mb(pid):
    out = subprocess.run(["ps", "-o", "rss=", "-p", str(pid)], capture_output=True, text=True).stdout.strip()
    return int(out) // 1024 if out else 0


def run_capped(cmd, limit_mb=LIMIT_MB, timeout=600):
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace")
    start, killed = time.time(), None
    while True:   # communicate() with a timeout keeps draining the pipes: a chatty child never blocks on a full pipe
        try:
            out, err = p.communicate(timeout=0.2)
            break
        except subprocess.TimeoutExpired:
            pass
        mb = rss_mb(p.pid)
        if mb > limit_mb:
            killed = f"killed: {mb} MB RSS > {limit_mb} MB cap (tools/memcap.py)"
        elif time.time() - start > timeout:
            killed = f"killed: over {timeout} s (tools/memcap.py)"
        if killed:
            p.kill()
            out, err = p.communicate()
            break
    if killed:
        err += "\n" + killed
        return subprocess.CompletedProcess(cmd, -9, out, err)
    return subprocess.CompletedProcess(cmd, p.returncode, out, err)


if __name__ == "__main__":
    args = sys.argv[1:]
    mb = LIMIT_MB
    timeout = 600
    while args[:1] in (["--mb"], ["--timeout"]):
        if args[0] == "--mb":
            mb = int(args[1])
        else:
            timeout = int(args[1])   # long scripted game runs (a whole duel)
        args = args[2:]
    r = run_capped(args, mb, timeout)
    sys.stdout.write(r.stdout)
    sys.stderr.write(r.stderr)
    sys.exit(r.returncode)
