"""Parity harness: the same fake_client.py scenarios against py (YOLaucher-web tools/yo2emu, read-only) and the TS
server (wrangler dev + bridge.mjs), then a packet-by-packet diff of what each client received.

  python3.12 parity/run.py base <scenario>...   py twice -> _out/<scenario>/py-{1,2}; bytes that differ between the two
                                                 py passes are masked automatically (clock, randomness py does not seed)
  python3.12 parity/run.py ts <scenario>...     TS once -> _out/<scenario>/ts, compared with py-1 (+ masks)
  python3.12 parity/run.py diff <scenario>      compare again without running

Scenarios: fake_client.py functions (dos, basura, npc, pvp, ...) or "sondeo" (paridad/sondeo.py). Both servers run in
turn on the SAME port offset (4300), from the same frozen copy of state.json, with random.seed(1) / PARITY_SEED=1 and
TZ=UTC. Never touches a live server or YOLaucher-web's own state.json.
"""
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.dirname(HERE)
EMU = os.environ.get("YO2EMU", os.path.join(os.path.expanduser("~"), "Documents", "GitHub", "YOLaucher-web", "tools", "yo2emu"))
OUT = os.path.join(HERE, "_out")
OFFSET = int(os.environ.get("PARITY_OFFSET", "4300"))   # same for base and ts runs; other sessions run test servers at +0..+1100 (and their language ports above)
WRANGLER_PORT = 8797
PY = os.environ.get("PY312", "python3.12")
sys.path.insert(0, EMU)
sys.path.insert(1, HERE)
import fake_client as fc  # noqa: E402

CTL_PORT = 6999
BRIDGE = {"on": False}
_fc_init, _link_init = fc.FakeClient.__init__, fc.Link.__init__


def _fc(self, name, key, host="127.0.0.1", offset=0, src_ip=None):
    _fc_init(self, name, key, host, offset, None)        # macOS: no 127.0.0.2/3; every client comes from 127.0.0.1


def _link(self, cli, port, seq_box=None):
    _link_init(self, cli, port, seq_box)
    if BRIDGE["on"]:                                       # tell the bridge which client owns this TCP connection
        with socket.create_connection(("127.0.0.1", CTL_PORT), timeout=3) as s:
            s.sendall(f"{self.sock.getsockname()[1]} {cli.name}\n".encode())
            s.recv(8)


fc.FakeClient.__init__, fc.Link.__init__ = _fc, _link

# py environment of a parity instance (paridad/comun.py Instancia + escenarios.json entorno_comun)
PY_ENV = dict(YO2_LOGIN_ESTRICTO="0", YO2_NO_CLIENT="1", YO2_PORT_OFFSET=str(OFFSET), YO2_BIND="127.0.0.1",
              YO2_STORAGE="json", YO2_PERFIL="vanilla", PYTHONIOENCODING="utf-8", YO2_PARIDAD_SEMILLA="1",
              PYTHONHASHSEED="0", YO2_LIMIT_LIST="1", YO2_WATCH="1", YO2_ROOM_REOPEN="1", TZ="UTC")
# scenario variants: name -> (fake_client scenario, py env, TS vars)
VARIANTS = {"dos_single": ("dos", {"YO2_SINGLE_LOBBY": "1"}, {"SINGLE_LOBBY": "1"})}
# duel scenarios: YO2_DP_COSTE=0 = py without the duel-point checks and charges (the TS server has no DP economy)
DUEL_ENV = dict(YO2_PVP_TEST="1", YO2_DUEL_PAUSE="0.002", YO2_DP_COSTE="0")
SCEN_ENV = {"npc": DUEL_ENV, "pvp": DUEL_ENV, "pvpmatch": DUEL_ENV, "npcmirar": DUEL_ENV,
            "sondeo": dict(YO2_PVP_TEST="1", YO2_DUEL_PAUSE="0.002")}
# the TS var of each py env switch that the TS config reads (src/config.ts)
TS_VAR = {"YO2_PVP_TEST": "PVP_TEST", "YO2_DUEL_PAUSE": "DUEL_PAUSE"}


def ts_vars(name):
    base = VARIANTS.get(name, (name,))[0]
    v = {TS_VAR[k]: x for k, x in SCEN_ENV.get(base, {}).items() if k in TS_VAR}
    v.update(VARIANTS.get(name, (0, {}, {}))[2])
    return v


def fixture_state():
    """Frozen copy of YOLaucher-web's state.json with the test owner's login aliased to the owner (fake_client.prep_state)."""
    dst = os.path.join(OUT, "fixture-state.json")
    if not os.path.exists(dst):
        os.makedirs(OUT, exist_ok=True)
        fc.copiar_estado(dst)
        fc.prep_state(dst)
    return dst


def wait_port(port, proc, secs=90):
    end = time.time() + secs
    while time.time() < end:
        if proc.poll() is not None:
            sys.exit(f"server exited while starting (code {proc.returncode})")
        with socket.socket() as t:
            t.settimeout(0.2)
            if t.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.3)
    sys.exit(f"port {port} never opened")


def stop(proc):
    if proc.poll() is None:
        os.killpg(proc.pid, signal.SIGTERM)
        try:
            proc.wait(10)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)


def scenario(name, tap):
    name = VARIANTS.get(name, (name,))[0]
    os.environ["YO2_TAP"] = tap
    fc._TAP["con"].clear()
    try:
        if name == "sondeo":
            sys.path.insert(0, os.path.join(EMU, "paridad"))
            import sondeo
            res = sondeo.run_sondeo(OFFSET)
        else:
            import scenarios
            res = getattr(scenarios, f"run_{name}", None) or getattr(fc, f"run_{name}")
            res = res(OFFSET)
    finally:
        with fc._TAP["lock"]:
            if fc._TAP["f"]:
                fc._TAP["f"].close()
            fc._TAP["f"] = fc._TAP["dir"] = None
        os.environ.pop("YO2_TAP", None)
    time.sleep(1.0)
    return res


def run_py(name, tag):
    d = os.path.join(OUT, name, tag)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    st = os.path.join(d, "state.json")
    shutil.copyfile(fixture_state(), st)
    env = dict(os.environ, **PY_ENV, **SCEN_ENV.get(VARIANTS.get(name, (name,))[0], {}), **VARIANTS.get(name, (0, {}))[1], YO2_STATE=st, YO2_LOGDIR=d, TEMP=d, TMP=d,
               PYTHONPATH=os.path.join(EMU, "paridad", "semilla"))
    proc = subprocess.Popen(["nice", PY, "-u", os.path.join(EMU, "run.py"), "0"], env=env, cwd=EMU,
                            stdout=open(os.path.join(d, "server.out"), "w"), stderr=subprocess.STDOUT, start_new_session=True)
    try:
        wait_port(5730 + OFFSET, proc)
        time.sleep(1.0)
        scenario(name, os.path.join(d, "tap"))
    finally:
        stop(proc)
    return d


def snapshot():
    """A copy of the server sources for wrangler dev: other sessions edit src/ while a run is going, and wrangler dev
    would hot-reload (dropping every connection) on each save. PARITY_SRC=<server dir> takes the sources from there (e.g.
    a clean `git worktree` of HEAD, without other sessions' unfinished edits)."""
    src = os.environ.get("PARITY_SRC", SERVER)
    snap = os.path.join(OUT, "snap")
    shutil.rmtree(snap, ignore_errors=True)
    os.makedirs(snap)
    for x in ("src", "static"):
        shutil.copytree(os.path.join(src, x), os.path.join(snap, x))
    for x in ("wrangler.jsonc", "package.json", "tsconfig.json"):
        shutil.copy(os.path.join(src, x), snap)
    for x in ("node_modules", "gamedata", "migrations"):
        if os.path.exists(os.path.join(SERVER, x)):
            os.symlink(os.path.join(SERVER, x), os.path.join(snap, x))
    return snap


def seed_r2(snap, persist):
    """The duel engine reads its data from R2 (src/duel/boot.ts ENGINE_PREFIX): put it in the local bucket."""
    for f in ("cards.json", "strings.json", "scripts.pack"):
        subprocess.run(["nice", "npx", "wrangler", "r2", "object", "put", f"ygo-original/duel-evolution/engine/{f}",
                        "--file", os.path.join(SERVER, "gamedata", "engine", f), "--local", "--persist-to", persist],
                       cwd=snap, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def run_ts(name):
    d = os.path.join(OUT, name, "ts")
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    snap = snapshot()
    seed_r2(snap, os.path.join(d, "wr"))
    wr = subprocess.Popen(["nice", "npx", "wrangler", "dev", "--local", "--port", str(WRANGLER_PORT), "--local-upstream", f"127.0.0.1:{WRANGLER_PORT}", "--persist-to", os.path.join(d, "wr"),
                           "--var", f"PORT_OFFSET:{OFFSET}", "--var", "DEV:1", "--var", "PARITY_SEED:1", "--var", "SEND_PACE:py", "--var", "NPC_AI:py", "--var", "PLACE_ORDER:py", "--var", "LOG:1",
                           *[a for k, v in ts_vars(name).items() for a in ("--var", f"{k}:{v}")]],
                          cwd=snap, env=dict(os.environ, TZ="UTC"), stdout=open(os.path.join(d, "server.out"), "w"),
                          stderr=subprocess.STDOUT, start_new_session=True)
    br = None
    try:
        wait_port(WRANGLER_PORT, wr)
        import urllib.request
        for _ in range(60):
            try:
                urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{WRANGLER_PORT}/__dev/state",
                                                              data=open(fixture_state(), "rb").read(), method="POST"), timeout=10)
                break
            except Exception:
                time.sleep(0.5)
        br = subprocess.Popen(["node", os.path.join(HERE, "bridge.mjs"), str(OFFSET), f"ws://127.0.0.1:{WRANGLER_PORT}/boxedwine-network", str(CTL_PORT)],
                              stdout=open(os.path.join(d, "bridge.out"), "w"), stderr=subprocess.STDOUT, start_new_session=True)
        wait_port(5730 + OFFSET, br)
        BRIDGE["on"] = True
        scenario(name, os.path.join(d, "tap"))
    finally:
        BRIDGE["on"] = False
        if br:
            stop(br)
        stop(wr)
    return d


# ------------------------------------------------------------------ diff
def load(d, tail=None):
    """{(cli, port, con): [(id, hex)]} of what each client RECEIVED, in order. tail (if a dict) gets, per connection,
    the index of the first message received after the client's last send (the part a client close can cut)."""
    out, last_tx, rx = {}, {}, {}
    tap = os.path.join(d, "tap")
    for f in sorted(os.listdir(tap)) if os.path.isdir(tap) else []:
        for line in open(os.path.join(tap, f), encoding="utf-8"):
            r = json.loads(line)
            k = (r["cli"], r["puerto"], r["con"])
            if r["dir"] == "rx":
                out.setdefault(k, []).append((r["id"], r["hex"]))
                rx.setdefault(k, []).append(r["t"])
            else:
                last_tx[k] = r["t"]
    if tail is not None:
        for k, ts in rx.items():
            tail[k] = next((i for i, t in enumerate(ts) if t > last_tx.get(k, 0)), len(ts))
    return out


# Intentional divergences from py (DESIGN.md "Deliberate changes from 2008"): message id -> (byte range, reason).
INTENTIONAL = {
    0x4101: ((8, 12), "no duel-point economy: PSELECTRESULT's balance field carries WIRE_UNUSED_DP"),
    0x4140: ((19, 23), "no duel-point economy: PLAYERDATAUPDATE's balance field carries WIRE_UNUSED_DP"),
    0x3111: ((0, 4), "no DUELPASS: the pass count carries WIRE_UNUSED_DP"),
}


# Wall-clock fields py does not seed, masked whole (the auto-masks only cover the digits that happened to differ between
# the two py passes): 0x6010 DUELLOG_HEADER title "pvpYYYYmmddHHMMSS" (bytes 4..20) and its date u32 (74..77).
WALLCLOCK = {0x6010: ((4, 21), (74, 78))}


def masks(a, b):
    """Byte positions that differ between two py passes: {(key, index): set(byte idx)} (None = whole message)."""
    m = {}
    for k in set(a) | set(b):
        xa, xb = a.get(k, []), b.get(k, [])
        for i in range(max(len(xa), len(xb))):
            if i >= len(xa) or i >= len(xb) or xa[i][0] != xb[i][0] or len(xa[i][1]) != len(xb[i][1]):
                m[(k, i)] = None
                continue
            diff = {j for j in range(0, len(xa[i][1]), 2) if xa[i][1][j:j + 2] != xb[i][1][j:j + 2]}
            if diff:
                m[(k, i)] = diff
    return m


def diff(name):
    base = os.path.join(OUT, name)
    tail = {}
    a, ts = load(os.path.join(base, "py-1"), tail), load(os.path.join(base, "ts"))
    m = masks(a, load(os.path.join(base, "py-2"))) if os.path.isdir(os.path.join(base, "py-2")) else {}
    bad = cut = 0
    for k in sorted(set(a) | set(ts), key=str):
        xa, xt = a.get(k, []), ts.get(k, [])
        if len(xt) < len(xa) and len(xt) >= tail.get(k, len(xa)):
            cut += len(xa) - len(xt)      # TS stopped inside py's after-the-last-request tail: the client closed first
            xa = xa[:len(xt)]
        for i in range(max(len(xa), len(xt))):
            mk = m.get((k, i), set())
            if mk is None:
                continue
            if i < len(xa) and xa[i][0] in WALLCLOCK:
                mk = set(mk) | {2 * b for lo, hi in WALLCLOCK[xa[i][0]] for b in range(lo, hi)}
            if i < len(xa) and xa[i][0] in INTENTIONAL:
                lo, hi = INTENTIONAL[xa[i][0]][0]
                mk = set(mk) | {2 * b for b in range(lo, hi)}
            pa = xa[i] if i < len(xa) else None
            pt = xt[i] if i < len(xt) else None
            same = pa and pt and pa[0] == pt[0] and len(pa[1]) == len(pt[1]) and all(
                pa[1][j:j + 2] == pt[1][j:j + 2] for j in range(0, len(pa[1]), 2) if j not in mk)
            if not same:
                bad += 1
                if bad <= 8:
                    fmt = lambda p: f"0x{p[0]:04x} {p[1][:160]}" if p else "(nothing)"
                    print(f"DIFF {k} #{i}\n  py {fmt(pa)}\n  ts {fmt(pt)}")
                break  # the rest of this connection is noise once it diverges
    n = sum(len(v) for v in a.values())
    print(f"{name}: {'EQUAL' if not bad else f'DIFFERENT ({bad} connections)'} — {len(a)} connections, {n} messages, "
          f"{cut} tail message(s) cut by the client's close, "
          f"{sum(1 for v in m.values() if v is None)} masked whole + {sum(len(v) for v in m.values() if v)} masked bytes")
    return not bad


if __name__ == "__main__":
    import fcntl
    os.makedirs(OUT, exist_ok=True)
    _lock = open(os.path.join(OUT, ".lock"), "w")
    fcntl.flock(_lock, fcntl.LOCK_EX)          # one run at a time: every run uses the same ports
    cmd, names = sys.argv[1], sys.argv[2:]
    ok = True
    for n in names:
        if cmd == "base":
            run_py(n, "py-1"); run_py(n, "py-2")
        elif cmd == "ts":
            run_ts(n)
        if cmd in ("ts", "diff"):
            ok &= diff(n)
    sys.exit(0 if ok else 1)
