"""A local game server for the htmlui tools: wrangler dev of server/ (as server/parity/predeploy.py runs it: the real
session gate, the test sign-in, production's PROGRESSION), then one test user's session cookie printed as JSON.
Runs until killed.

  python3.12 -I client/web-shell/htmlui/tools/stack.py [port] [--player NAME [--deck ID]]   # default 8799
  -> {"origin": "http://127.0.0.1:8799", "cookie": "__Secure-de.session_token=...", "player": NAME}
--player: the test user also gets a character called NAME in slot 0 (created as parity/predeploy.py's player() does:
fake_client through bridge.mjs with the session cookie), and claims structure deck ID (default 8001) as its starter
deck, so routes can go straight from Select Player row 0 to My Room.

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
os.environ.setdefault("PARITY_CTL_PORT", "7019")   # the bridge's control port: predeploy / parity runs hold 6999
sys.path.insert(0, os.path.join(ROOT, "server", "parity"))
import run as R  # noqa: E402

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
OPT = {k: v for k, v in zip(sys.argv[1:], sys.argv[2:]) if k.startswith("--")}
PORT = int(ARGS[0]) if ARGS else 8799
PLAYER, DECK = OPT.get("--player"), int(OPT.get("--deck", 8001))
LOCAL_OFFSET = 4400   # bridge.mjs's local ports (5730 + offset ...): predeploy uses 4300
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
        if PLAYER:
            make_player(cookie)
        print(json.dumps({"origin": ORIGIN, "cookie": cookie, "player": PLAYER, "log": os.path.join(D, "server.out")}), flush=True)
        wr.wait()
    finally:
        R.stop(wr)


def make_player(cookie):
    br = subprocess.Popen(["node", os.path.join(R.HERE, "bridge.mjs"), str(LOCAL_OFFSET), f"ws://127.0.0.1:{PORT}/net", str(R.CTL_PORT)],
                          env=dict(os.environ, BRIDGE_COOKIES=json.dumps({"H": cookie}), BRIDGE_ORIGIN=ORIGIN, BRIDGE_WS_OFFSET="1000"),
                          stdout=open(os.path.join(D, "bridge.out"), "w"), stderr=subprocess.STDOUT, start_new_session=True)
    try:
        R.wait_port(5730 + LOCAL_OFFSET, br)
        R.BRIDGE["on"] = True
        X = R.fc.FakeClient("H", bytes(range(32)), "127.0.0.1", LOCAL_OFFSET)
        X.wait_s = 15.0
        if not X.gate():
            sys.exit("stack.py: --player: the gate failed")
        names = X.account(0, create_name=PLAYER)
        if names.get(0) != PLAYER:
            sys.exit(f"stack.py: --player: no character made ({names})")
        req = urllib.request.Request(ORIGIN + "/api/de/starter/claim", data=json.dumps({"id": DECK}).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "Origin": ORIGIN, "Cookie": cookie})
        with urllib.request.urlopen(req, timeout=30) as r:
            json.load(r)
    finally:
        R.BRIDGE["on"] = False
        R.stop(br)


if __name__ == "__main__":
    main()
