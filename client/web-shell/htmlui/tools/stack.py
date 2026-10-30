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
# FLIP_SLOT=N (0-3): one of several stacks side by side (flip.mjs --slot): its own port 8800+10N, bridge control port
# 7020+N and local game ports (bridge.mjs listens on ~150 ports above its offset: 4600+200N)
SLOT = int(os.environ.get("FLIP_SLOT", "-1"))
if SLOT >= 0:
    os.environ["PARITY_CTL_PORT"] = str(7020 + SLOT)
os.environ.setdefault("PARITY_CTL_PORT", "7019")   # the bridge's control port: predeploy / parity runs hold 6999
sys.path.insert(0, os.path.join(ROOT, "server", "parity"))
import run as R  # noqa: E402

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
OPT = {k: v for k, v in zip(sys.argv[1:], sys.argv[2:]) if k.startswith("--")}
PORT = int(ARGS[0]) if ARGS else 8800 + 10 * SLOT if SLOT >= 0 else 8799
PLAYER, DECK = OPT.get("--player"), int(OPT.get("--deck", 8001))
LOCAL_OFFSET = 4600 + 200 * SLOT if SLOT >= 0 else 4400   # bridge.mjs's local ports (5730 + offset ...): predeploy uses 4300
ORIGIN = f"http://127.0.0.1:{PORT}"
SECRET = secrets.token_urlsafe(36)
D = os.path.join(R.OUT, f"htmlui-{PORT}")


def main():
    # every child (the d1 / r2 wrangler calls, the bridge) in this process group, killed with it on the way out, however
    # it ends (wrangler dev has its own session: stopped by `finally`); an orphan (its flip died) stops itself
    os.setpgrp()
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))   # flip.mjs stops us: let `finally` stop wrangler too
    signal.signal(signal.SIGHUP, lambda *_: sys.exit(0))
    import atexit, threading
    atexit.register(lambda: os.killpg(os.getpgrp(), signal.SIGKILL))
    parent = os.getppid()
    def watch():
        while os.getppid() == parent:
            time.sleep(2)
        os.kill(os.getpid(), signal.SIGTERM)
    threading.Thread(target=watch, daemon=True).start()
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
                           "--var", "PROGRESSION:1", "--var", "LOG:1",
                           # STACK_VARS=K:V,K:V: more server vars (e.g. DEV:1,NPC_CHALLENGE:2 for a dev NPC duel)
                           *[x for kv in os.environ.get("STACK_VARS", "").split(",") if kv for x in ("--var", kv)]],
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
    cw = os.path.join(ROOT, "client", "recomp", "build", "cardwire.mjs")   # bridge.mjs's card-wire codec
    if not os.path.exists(cw):
        subprocess.run(["make", "-C", os.path.join(ROOT, "client", "recomp"), "cardwire_js"], check=True,
                       env=dict(os.environ, EMSDK_PYTHON=os.environ.get("EMSDK_PYTHON", "/opt/homebrew/bin/python3.12")))
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
        if not DECK:   # --deck 0: no starter claimed (the starter picker opens for this character in My Room)
            return
        # the starter deck is claimed in game (the API answers 409 otherwise): into a room first, as predeploy does
        if X.enter_room() is None:
            sys.exit("stack.py: --player: could not enter a room")
        req = urllib.request.Request(ORIGIN + "/api/de/starter/claim", data=json.dumps({"id": DECK}).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "Origin": ORIGIN, "Cookie": cookie})
        with urllib.request.urlopen(req, timeout=30) as r:
            json.load(r)
    finally:
        R.BRIDGE["on"] = False
        R.stop(br)


if __name__ == "__main__":
    main()
