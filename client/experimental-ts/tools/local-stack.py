"""A local game server for the experimental client's browser acceptance runs: wrangler dev of a snapshot of server/
(as client/web-shell/htmlui/tools/stack.py runs it: the real session gate, staging test sign-in, production's
PROGRESSION), printing one JSON line {"origin", "secret", "forward", "log"} and running until killed.

  python3.12 -I client/experimental-ts/tools/local-stack.py [port]          # default 8899

Unlike stack.py it creates no player: tests sign in any number of test users with POST /api/de/test-sign-in
({name}, header x-test-signin: <secret>) and make their characters through the client itself.
STACK_VARS=K:V,K:V adds server vars. Needs server/node_modules and server/gamedata.
"""
import json
import os
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "server", "parity"))
import run as R  # noqa: E402

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
ORIGIN = f"http://127.0.0.1:{PORT}"
SECRET = secrets.token_urlsafe(36)
FORWARD = secrets.token_urlsafe(36)   # DE_FORWARD_SECRET: tests sign Discord /verify and /reset forwards with it
D = os.path.join(R.OUT, f"experimental-{PORT}")


def main():
    try:
        os.setpgrp()
    except PermissionError:   # already a session (and group) leader under setsid
        pass
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    signal.signal(signal.SIGHUP, lambda *_: sys.exit(0))
    import atexit
    atexit.register(lambda: os.killpg(os.getpgrp(), signal.SIGKILL))
    parent = os.getppid()

    def watch():   # an orphan (its test run died) stops itself
        while os.getppid() == parent:
            time.sleep(2)
        os.kill(os.getpid(), signal.SIGTERM)
    if os.environ.get("LOCAL_STACK_DETACHED") != "1":   # detached runs (setsid nohup) outlive the shell that started them
        threading.Thread(target=watch, daemon=True).start()
    with socket.socket() as s:
        if s.connect_ex(("127.0.0.1", PORT)) == 0:
            sys.exit(f"local-stack.py: 127.0.0.1:{PORT} is taken (a stale wrangler dev?)")
    shutil.rmtree(D, ignore_errors=True)
    os.makedirs(D)
    R.OUT = D
    snap = R.snapshot()
    # server/data (generated tables imported by src/) is not in run.py's snapshot list
    data = os.path.join(R.SERVER, "data")
    if os.path.isdir(data) and not os.path.exists(os.path.join(snap, "data")):
        os.symlink(data, os.path.join(snap, "data"))
    R.seed_r2(snap, os.path.join(D, "wr"))
    subprocess.run(["nice", "npx", "wrangler", "d1", "migrations", "apply", "duel-evolution", "--local", "--persist-to", os.path.join(D, "wr")],
                   cwd=snap, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    wr = subprocess.Popen(["nice", "npx", "wrangler", "dev", "--local", "--port", str(PORT), "--persist-to", os.path.join(D, "wr"),
                           "--var", f"PUBLIC_ORIGIN:{ORIGIN}", "--var", f"TEST_SIGNIN_SECRET:{SECRET}", "--var", f"DE_FORWARD_SECRET:{FORWARD}",
                           "--var", f"BETTER_AUTH_SECRET:{secrets.token_urlsafe(48)}", "--var", "DEPLOY_ENV:staging",
                           "--var", "PROGRESSION:" + os.environ.get("STACK_PROGRESSION", "1"), "--var", "LOG:1",
                           *[x for kv in os.environ.get("STACK_VARS", "").split(",") if kv for x in ("--var", kv)]],
                          cwd=snap, stdout=open(os.path.join(D, "server.out"), "w"), stderr=subprocess.STDOUT, start_new_session=True)
    try:
        R.wait_port(PORT, wr)
        print(json.dumps({"origin": ORIGIN, "secret": SECRET, "forward": FORWARD, "log": os.path.join(D, "server.out")}), flush=True)
        wr.wait()
    finally:
        R.stop(wr)


if __name__ == "__main__":
    main()
