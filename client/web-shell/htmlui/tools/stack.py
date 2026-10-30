"""A local game server for the htmlui tools: wrangler dev of server/ (as server/parity/predeploy.py runs it: the real
session gate, the test sign-in, production's PROGRESSION), then one test user's session cookie printed as JSON.
Runs until killed.

  python3.12 -I client/web-shell/htmlui/tools/stack.py [port]      # default 8799 (predeploy holds 8798)
  -> {"origin": "http://127.0.0.1:8799", "cookie": "better-auth.session_token=..."}

Needs server/node_modules (pnpm install) and server/gamedata (infra/fetch-private.sh).
"""
import json
import os
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "server", "parity"))
import run as R  # noqa: E402

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8799
ORIGIN = f"http://127.0.0.1:{PORT}"
SECRET = secrets.token_urlsafe(36)
D = os.path.join(R.OUT, f"htmlui-{PORT}")


def main():
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))   # flip.mjs stops us: let `finally` stop wrangler too
    with socket.socket() as s:
        if s.connect_ex(("127.0.0.1", PORT)) == 0:
            sys.exit(f"stack.py: 127.0.0.1:{PORT} is taken (a stale wrangler dev?)")
    shutil.rmtree(D, ignore_errors=True)
    os.makedirs(D)
    snap = R.snapshot()
    R.seed_r2(snap, os.path.join(D, "wr"))
    subprocess.run(["nice", "npx", "wrangler", "d1", "migrations", "apply", "duel-evolution", "--local", "--persist-to", os.path.join(D, "wr")],
                   cwd=snap, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    wr = subprocess.Popen(["nice", "npx", "wrangler", "dev", "--local", "--port", str(PORT), "--persist-to", os.path.join(D, "wr"),
                           "--var", f"PUBLIC_ORIGIN:{ORIGIN}", "--var", f"TEST_SIGNIN_SECRET:{SECRET}",
                           "--var", f"BETTER_AUTH_SECRET:{secrets.token_urlsafe(48)}", "--var", "DEPLOY_ENV:staging",
                           "--var", "PROGRESSION:1", "--var", "LOG:1"],
                          cwd=snap, stdout=open(os.path.join(D, "server.out"), "w"), stderr=subprocess.STDOUT, start_new_session=True)
    try:
        R.wait_port(PORT, wr)
        req = urllib.request.Request(ORIGIN + "/api/de/test-sign-in", data=json.dumps({"name": "TestStgHtml"}).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "Origin": ORIGIN, "x-test-signin": SECRET})
        with urllib.request.urlopen(req, timeout=60) as r:
            cookie = "; ".join(c.split(";")[0] for c in r.headers.get_all("Set-Cookie") or [])
        print(json.dumps({"origin": ORIGIN, "cookie": cookie, "log": os.path.join(D, "server.out")}), flush=True)
        wr.wait()
    finally:
        R.stop(wr)


if __name__ == "__main__":
    main()
