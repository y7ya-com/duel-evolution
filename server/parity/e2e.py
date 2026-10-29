"""End-to-end: the NATIVE recompiled client (yo2-decomp recomp build, read-only) against the TS server under wrangler dev.

  python3.12 -I parity/e2e.py <frames> <shots> [extra RC_INPUT after the login]

The native client speaks TCP to YO2_SERVER:5730+YO2_PORT_OFFSET and HTTP to YO2_HTTP; bridge.mjs (by-IP mode: one
client = one WebSocket peer) turns that into the gateway WebSocket. Login = the test owner (fake_client's
TEST_OWNER_LOGIN, aliased to the owner in the fixture state; the server converts its card ids, game/passcodes.ts).
GAME=<folder> takes the game from there (default client/recomp/run/game; it needs merge/data/card_passcode.bin for the
card wire). Output (client log, shots, server log): _out/e2e/.
"""
import os
import shutil
import subprocess
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run as R  # noqa: E402

# RC_INPUT pieces after the login (from yo2-recomp's recomp-scripts.md, re-timed for a client that shows the rules page;
# RC_SEED=1, fresh state):
# create a player -> My Room -> red door -> English -> Beginner's Lobby A -> close the popup -> A-lien -> duel
NPC_DUEL = ("3700:move 635 344;3720:click 635 344;4020:click 512 383;4030:text Recomp;4050:move 427 436;4060:click 427 436;"
            "5500:move 764 703;5510:click 764 703;7000:rdown 855 300;7300:rup 855 300;7500:move 504 240;7510:click 504 240;"
            "7700:move 504 214;7710:click 504 214;9090:move 511 670;9100:click 511 670;9390:move 360 60;9400:click 360 60;"
            "9690:move 362 62;9700:click 362 62;10290:move 512 170;10300:click 512 170;10450:click 512 170;10740:move 427 436;"
            "10750:click 427 436;11290:move 250 680;11300:click 250 680;12080:move 512 290;12090:click 512 290")

RECOMP = os.environ.get("RECOMP", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "client", "recomp"))
D = os.path.join(R.OUT, "e2e")


def main():
    frames, shots = sys.argv[1], sys.argv[2]
    extra = sys.argv[3] if len(sys.argv) > 3 else ""
    extra = NPC_DUEL if extra == "npc" else extra
    shutil.rmtree(D, ignore_errors=True)
    os.makedirs(D)
    snap = R.snapshot()
    R.seed_r2(snap, os.path.join(D, "wr"))
    wr = subprocess.Popen(["nice", "npx", "wrangler", "dev", "--local", "--port", str(R.WRANGLER_PORT), "--local-upstream", f"127.0.0.1:{R.WRANGLER_PORT}", "--persist-to", os.path.join(D, "wr"),
                           "--var", f"PORT_OFFSET:{R.OFFSET}", "--var", "DEV:1", "--var", "LOG:1"],
                          cwd=snap, stdout=open(os.path.join(D, "server.out"), "w"), stderr=subprocess.STDOUT, start_new_session=True)
    br = None
    try:
        R.wait_port(R.WRANGLER_PORT, wr)
        for _ in range(60):
            try:
                urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{R.WRANGLER_PORT}/__dev/state",
                                                              data=open(R.fixture_state(), "rb").read(), method="POST"), timeout=10)
                break
            except Exception:
                time.sleep(0.5)
        br = subprocess.Popen(["node", os.path.join(R.HERE, "bridge.mjs"), str(R.OFFSET), f"ws://127.0.0.1:{R.WRANGLER_PORT}/boxedwine-network",
                               str(R.CTL_PORT), "ip"], stdout=open(os.path.join(D, "bridge.out"), "w"), stderr=subprocess.STDOUT, start_new_session=True)
        R.wait_port(5730 + R.OFFSET, br)
        user, pw = R.fc.TEST_OWNER_LOGIN
        login = (f"1230:move 512 458;1240:click 512 458;2100:move 511 564;2110:click 511 564;2700:move 488 368;2710:click 488 368;"
                 f"2720:text {user};2740:move 488 432;2750:click 488 432;2760:text {pw};2790:move 415 492;2800:click 415 492")
        game = os.environ.get("GAME", os.path.join(RECOMP, "run", "game"))
        env = dict(os.environ, RC_INPUT=login + (";" + extra if extra else ""), YO2_GAME=game, YO2_EXE=os.path.join(game, "yo2.exe"),
                   YO2_PORT_OFFSET=str(R.OFFSET), YO2_SERVER="127.0.0.1", YO2_HTTP=f"127.0.0.1:{R.WRANGLER_PORT}", YO2_HIDDEN="1",
                   SDL_MAC_BACKGROUND_APP="1", SDL_AUDIODRIVER="dummy", RC_FRAMES=frames, RC_SHOT=shots, RC_SEED="1")
        rc = subprocess.call(["nice", "-n", "5", "python3", "-I", os.path.join(RECOMP, "..", "tools", "memcap.py"), "--mb", "1500",
                              "--timeout", os.environ.get("TIMEOUT", "900"), os.path.join(RECOMP, "build", "yo2rc")],
                             cwd=D, env=env, stdout=open(os.path.join(D, "log.txt"), "w"), stderr=subprocess.STDOUT)
        print("client exit", rc)
    finally:
        if br:
            R.stop(br)
        R.stop(wr)
    for f in sorted(os.listdir(D)):
        if f.startswith("shot_") and f.endswith(".bmp"):
            subprocess.call(["sips", "-s", "format", "png", os.path.join(D, f), "--out", os.path.join(D, f[:-4] + ".png")],
                            stdout=subprocess.DEVNULL)
    print("shots:", " ".join(f for f in sorted(os.listdir(D)) if f.endswith(".png")))


if __name__ == "__main__":
    import fcntl
    os.makedirs(R.OUT, exist_ok=True)
    _lock = open(os.path.join(R.OUT, ".lock"), "w")
    fcntl.flock(_lock, fcntl.LOCK_EX)
    main()
