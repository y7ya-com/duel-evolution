"""Pre-deploy check against a local `wrangler dev` (DEPLOY.md): the sources (a clean worktree with PARITY_SRC, else
this checkout), the engine data seeded into local R2, the real session gate (no DEV). Two test users sign in through
the test sign-in (DEPLOY_ENV=staging, a throwaway TEST_SIGNIN_SECRET) and play through the bridge: gate, accounts (a
new player each), with production's PROGRESSION: each claims a free structure deck; lobby, NPC duels to the end
against NPCs 84, 51 and 54 (fake_client's auto play + surrender), back to the lobby; then a PvP match (B opens a
room, A challenges and surrenders), both back in the lobby; last, a deck with unowned cards is refused (0x649b).
The starter deck comes from the web picker's /api/de/starter (once; the old 0x8401 40-card pick is refused).

  python3.12 -I parity/predeploy.py

Prints the steps; exit 1 on the first failure.
"""
import json
import os
import secrets
import shutil
import struct
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run as R  # noqa: E402

PORT = 8798                       # beside run.py's wrangler dev (8797), so the two can run at once
BASE = ORIGIN = f"http://127.0.0.1:{PORT}"
LOCAL_OFFSET, WS_OFFSET = int(os.environ.get("PREDEPLOY_OFFSET", "4300")), 1000   # the bridge's local ports (5730+offset…)
D = os.path.join(R.OUT, "predeploy")
UA = "Mozilla/5.0 (duel-evolution predeploy check)"
SECRET = secrets.token_urlsafe(36)  # this run's test sign-in secret (local only)


def step(ok, what):
    print(("OK   " if ok else "FAIL ") + what, flush=True)
    if not ok:
        sys.exit(1)


def sign_in(who):
    """A DE test user's session cookie, from the test sign-in (POST /api/de/test-sign-in, header x-test-signin; the user
    TestStg<who> is created on first use). A 404 in production."""
    secret = SECRET
    req = urllib.request.Request(BASE + "/api/de/test-sign-in", data=json.dumps({"name": f"TestStg{who}"}).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Origin": ORIGIN, "User-Agent": UA, "x-test-signin": secret})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            st, cookies = r.status, r.headers.get_all("Set-Cookie") or []
    except urllib.error.HTTPError as e:
        st, cookies = e.code, []
    cookie = "; ".join(c.split(";")[0] for c in cookies)
    step(st == 200 and "session_token" in cookie, f"{who}: test sign-in as TestStg{who} ({st})")
    return cookie


def player(fc, X, name):
    step(X.gate(), f"{X.name}: gate (server list)")
    names = X.account(0, create_name=name)
    step(names.get(0) == name, f"{X.name}: accounts: new player {names}")
    pid = X.enter_room()
    step(pid is not None and pid >= 1000, f"{X.name}: lobby: entered a room, pid {pid}")


def prefetch(cookie):
    """GET /api/de/prefetch/duel: (status, JSON or None)."""
    h = {"User-Agent": UA, **({"Cookie": cookie} if cookie else {})}
    with urllib.request.urlopen(urllib.request.Request(BASE + "/api/de/prefetch/duel", headers=h), timeout=30) as r:
        body = r.read()
        return r.status, (json.loads(body) if body else None)


def api(path, cookie, body=None, origin=ORIGIN):
    """(status, JSON or None) of /api/de/<path>: GET, or POST with a JSON body."""
    h = {"User-Agent": UA, "Cookie": cookie, **({"Origin": origin} if origin else {}), **({"Content-Type": "application/json"} if body is not None else {})}
    req = urllib.request.Request(BASE + "/api/de/" + path, headers=h, method="POST" if body is not None else "GET",
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            st, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        st, raw = e.code, e.read()
    return st, (json.loads(raw) if raw else None)


def starter_deck(X, cookie, deck):
    """PROGRESSION (production's setting): a new character owns nothing; the 40-card Startup Present (0x8401) is
    refused, and it claims one free structure deck through the web picker's endpoints, once."""
    n = len(X.room.msgs)
    X.room.send(0x8401, struct.pack(">BH", 1, 1))
    d = X.room.wait(0x8402, start=n, timeout=15)
    step(d is not None and struct.unpack(">i", d[:4])[0] == 1, f"{X.name}: progression: the old Startup Present pick is refused (0x8402 s32 1)")
    st, info = api("starter", cookie)
    step(st == 200 and info["claimable"] and len(info["decks"]) == 9 and all(len(x["cards"]) for x in info["decks"]),
         f"{X.name}: GET /api/de/starter: claimable, {len(info['decks']) if info and info.get('decks') else 0} decks ({st})")
    step(api("starter/claim", cookie, {"id": deck}, origin=None)[0] == 403, f"{X.name}: a claim without our Origin is refused (403)")
    st, out = api("starter/claim", cookie, {"id": deck})
    step(st == 200 and out["cards"] == 40, f"{X.name}: claims structure deck {deck} ({st} {out})")
    st, out = api("starter/claim", cookie, {"id": deck})
    st2, info = api("starter", cookie)
    step(st == 409 and info == {"claimable": False, "reason": "claimed"}, f"{X.name}: a second claim is refused ({st} {out}; {info})")


def npc_duel(fc, A, cookies=None, npc=84):
    na = len(A.room.msgs)
    A.room.send(0x4288, fc.room_msg(npc))
    step(A.room.wait(0x43a0, start=na, timeout=15) is not None, f"NPC {npc}: challenge (0x43a0)")
    if cookies:
        npc_prefetch(cookies)
    return _npc_duel_rest(fc, A)


def npc_refused(fc, A, deck, npc=84):
    """A deck with cards A doesn't own: the duel never starts, 0x649b code 1 at 0x6100 (the real client goes to the map)."""
    na = len(A.room.msgs)
    A.room.send(0x4288, fc.room_msg(npc))
    step(A.room.wait(0x43a0, start=na, timeout=15) is not None, f"NPC {npc}: challenge (0x43a0)")
    step(fc.duel_link(A, deck), "duel port: booked check (0x6007)")
    A.duel.wait(0x600c, timeout=15)
    n = len(A.duel.msgs)
    A.duel.send(0x6100)
    d = A.duel.wait(0x649b, start=n, timeout=15)
    step(d is not None and d[0] == 1, f"progression: a deck with unowned cards is refused before the duel (0x649b {d and d.hex()})")
    A.duel.send(0x0003)


def npc_prefetch(cookies):
    st, body = prefetch(cookies["A"])
    step(st == 200 and body["npc"] == 84 and len(body["cards"]) >= 20 and set(body["fields"]) <= set(body["cards"]),
         f"art prefetch: A's NPC duel deck ({st}, npc {body and body['npc']}, {body and len(body['cards'])} cards, fields {body and body['fields']})")
    step(prefetch(cookies["B"])[0] == 204 and prefetch(None)[0] == 204, "art prefetch: 204 for B (no NPC duel) and without a session")


def _npc_duel_rest(fc, A):
    step(fc.duel_link(A, fc.npc_deck_ids(51)), "duel port: booked check (0x6007)")
    A.duel.wait(0x600c, timeout=15)
    for mid, data in ((0x6100, b""), (0x6101, b"\0"), (0x6102, b""), (0x6103, b"\0")):
        n = len(A.duel.msgs)
        A.duel.send(mid, data)
        A.duel.wait(mid, start=n, timeout=15)
    start, nl = len(A.duel.msgs), len(A.room.msgs)
    A.duel.send(0x61fe, b"\1")
    out = {}
    fc.auto_loop(A.duel, start, out, surrender=True, timeout=240)
    end = [d for mid, _, d in A.duel.msgs[start:] if mid == 0x6202 and fc._t6202(d)[0] == 0x4d]
    step(bool(end), f"NPC duel played to the end ({len(A.duel.msgs) - start} duel messages, {out})")
    step(A.room.wait(0x4140, start=nl, timeout=20) is not None, "results back in the lobby (0x4140)")
    A.duel.send(0x0003)


def pvp_duel(fc, A, B):
    """B opens a duel room, A challenges, B accepts; both duel, A surrenders (fake_client's run_pvp "rendición")."""
    res = []
    ok, rid = fc.pvp_open_room(B, A)
    step(ok and rid, f"PvP: B opens a room (rid {rid})")
    off, early, na, nb = fc.pvp_challenge(A, B, rid or 0)
    step(off is not None, "PvP: A's challenge reaches B (0x4302)")
    B.room.send(0x4303, struct.pack(">i", 1))
    step(A.room.wait(0x4306, start=na, timeout=15) is not None and B.room.wait(0x4306, start=nb, timeout=15) is not None,
         "PvP: B accepts, both get the duel ticket (0x4306)")
    la, lb = len(A.room.msgs), len(B.room.msgs)
    sa, sb = fc.pvp_start_duel(res, A, B, "PvP")
    step(all(ok for _, ok in res), "PvP: both linked, rock-paper-scissors, first player")
    oa, ob = {}, {}
    ta = threading.Thread(target=fc.auto_loop, args=(A.duel, sa, oa, True, 240))
    tb = threading.Thread(target=fc.auto_loop, args=(B.duel, sb, ob, False, 240))
    ta.start(); tb.start(); ta.join(); tb.join()
    step(oa.get("res") == 2 and ob.get("res") == 1, f"PvP: A surrenders, A loses and B wins (A {oa}, B {ob})")
    step(A.room.wait(0x4140, start=la, timeout=20) is not None and B.room.wait(0x4140, start=lb, timeout=20) is not None,
         "PvP: both back in the lobby with results (0x4140)")


def main():
    shutil.rmtree(D, ignore_errors=True)
    os.makedirs(D)
    snap = R.snapshot()
    R.seed_r2(snap, os.path.join(D, "wr"))
    subprocess.run(["nice", "npx", "wrangler", "d1", "migrations", "apply", "duel-evolution", "--local", "--persist-to", os.path.join(D, "wr")],
                   cwd=snap, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    wr = subprocess.Popen(["nice", "npx", "wrangler", "dev", "--local", "--port", str(PORT), "--persist-to", os.path.join(D, "wr"),
                           "--var", f"PUBLIC_ORIGIN:{ORIGIN}", "--var", f"TEST_SIGNIN_SECRET:{SECRET}",
                           "--var", f"BETTER_AUTH_SECRET:{secrets.token_urlsafe(48)}", "--var", "DEPLOY_ENV:staging",
                           "--var", "PROGRESSION:1"],
                          cwd=snap, stdout=open(os.path.join(D, "server.out"), "w"), stderr=subprocess.STDOUT, start_new_session=True)
    br = None
    try:
        R.wait_port(PORT, wr)
        cookies = {who: sign_in(who) for who in ("A", "B")}
        br = subprocess.Popen(["node", os.path.join(R.HERE, "bridge.mjs"), str(LOCAL_OFFSET), f"ws://127.0.0.1:{PORT}/net", str(R.CTL_PORT)],
                              env=dict(os.environ, BRIDGE_COOKIES=json.dumps(cookies), BRIDGE_ORIGIN=ORIGIN, BRIDGE_WS_OFFSET=str(WS_OFFSET)),
                              stdout=open(os.path.join(D, "bridge.out"), "w"), stderr=subprocess.STDOUT, start_new_session=True)
        R.wait_port(5730 + LOCAL_OFFSET, br)
        R.BRIDGE["on"] = True
        fc = R.fc
        A = fc.FakeClient("A", bytes(range(32)), "127.0.0.1", LOCAL_OFFSET)
        B = fc.FakeClient("B", bytes([0xA5] * 16 + list(range(16))), "127.0.0.1", LOCAL_OFFSET)
        for X in (A, B):
            X.wait_s = 15.0
        player(fc, A, "Predeploy")
        player(fc, B, "Predeploy B")
        # fake_client duels with NPC 51's and 54's decks, which the players don't own (and the 2008 list refuses): the
        # players claim structure deck 8001 (40 legal cards as sold) as their free starter deck and duel with it
        unowned = fc.npc_deck_ids(51)
        sd = json.load(open(os.path.join(R.SERVER, "gamedata", "ydc.json")))["8001"]
        fc.npc_deck_ids = lambda nid: (sd["main"], sd["extra"])
        for X, who in ((A, "A"), (B, "B")):
            starter_deck(X, cookies[who], 8001)
        npc_duel(fc, A, cookies)
        for npc in (51, 54):   # their own decks break the list: only the player's deck is checked
            npc_duel(fc, A, npc=npc)
        pvp_duel(fc, A, B)
        npc_refused(fc, A, unowned)
        errs = A.errors + B.errors
        step(not errs, "message numbering: " + ("; ".join(errs[:3]) or "ok"))
    finally:
        R.BRIDGE["on"] = False
        if br:
            R.stop(br)
        R.stop(wr)
    print("pre-deploy check passed")

if __name__ == "__main__":
    main()
