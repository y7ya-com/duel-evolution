"""Records seeded duels through py's REAL translator (research/traductor/translator.py YO2Duel) for the TS parity test
(test/duel-translator.test.ts). Fixtures go to server/gamedata/fixtures/translator/*.json.gz (Konami-derived: gitignored).

  nice python3.12 -I scripts/translator_record.py [path/to/YOLaucher-web/tools/yo2emu] [name ...]

The host side copies ocg_duel.OcgSession (NPC: the NPC brain decides player 1) and ocg_duel.PvpSession (two views,
mirror()/mirror_state()/unmirror_response()) step by step, with the startup patch of yo2srv/arranque.py (TR.comid_field
wrapped with research/duelfin surrender_masks) and translator DEFAULT_CFG as the vanilla profile runs it (no YO2_* env).
The engine is duelcore (ocgcore in a node subprocess, duelcore/duelcore.py). Player 0 (and both players in PvP) is a
deterministic "client": it reads what the translator is asking (YO2Duel.state / waiting) and answers with the bytes the
YO2 client would send (0x6350, 0x6351, 0x002e, 0x6423, 0x6426, 0x6432) through on_client. The module-level `random` is
seeded per duel (py shares one `random`; the TS side gets one PyRandom). The translator's clock (turn timer) is a fake
whose values are recorded.

Every step is recorded: the events fed in (raw duelcore events; the TS host mirrors them for PvP view 1), every
translator output, the client messages, the commands/responses the translator returns (and what reached duelcore after
unmirror_response), the query results and clock values the translator consumed.
"""
import gzip
import json
import os
import random
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "gamedata", "fixtures", "translator")
args = sys.argv[1:]
EMU = args.pop(0) if args and os.path.isdir(args[0]) else os.path.join(
    os.path.expanduser("~"), "Documents", "GitHub", "YOLaucher-web", "tools", "yo2emu")
COVER = "--cov" in args                    # line coverage of translator.py (sys.settrace) -> fixtures/py_coverage.txt
args = [a for a in args if a != "--cov"]
ONLY = set(args)
for k in [k for k in os.environ if k.startswith("YO2_")]:      # vanilla profile: no YO2_* overrides
    del os.environ[k]
for p in (EMU, os.path.join(EMU, "duelcore"), os.path.join(EMU, "research", "traductor"), os.path.join(EMU, "research", "ia")):
    sys.path.insert(0, p)

import ocg_duel as OCG      # noqa: E402
from yo2srv import compat  # noqa: E402

TR = OCG.TR
DFM = compat.cargar("duelfin")
# yo2srv/arranque.py: «Rendirse» también con ocgcore (the server wraps the translator's comid_field at startup)
_tcf = TR.comid_field
TR.comid_field = lambda masks=None, extra=None, tail=None: _tcf(DFM.surrender_masks(masks), extra, tail)
TR._surrender_patched = True

BIG = 1 << 53


def big(v):
    """JSON for JS: ints past 2**53 (ANNOUNCE_CARD opcodes) become "#big:<n>" strings (the TS loader revives BigInt)."""
    if isinstance(v, bool) or v is None:
        return v
    if isinstance(v, int):
        return f"#big:{v}" if abs(v) >= BIG else v
    if isinstance(v, list):
        return [big(x) for x in v]
    if isinstance(v, tuple):
        return [big(x) for x in v]
    if isinstance(v, dict):
        return {k: big(x) for k, x in v.items()}
    return v


def msgs(lst):
    """Translator output -> [[msg id, hex]] (a bare bytes item is a 0x6202, as Sender.put does)."""
    out = []
    for m in lst or []:
        mid, data = m if isinstance(m, tuple) else (0x6202, m)
        out.append([mid, bytes(data).hex()])
    return out


class FakeClock:
    """Deterministic monotonic clock (seconds); every value handed out is recorded in the current step."""

    def __init__(self, rec, t=1000.0, step=0.37):
        self.rec, self.t, self.step = rec, t, step

    def __call__(self):
        v = self.t
        self.t = round(self.t + self.step, 6)
        self.rec.note("clk", v)
        return v


class Rec:
    def __init__(self, name, kind, seed):
        self.doc = {"name": name, "kind": kind, "seed": seed, "steps": []}
        self.cur = None

    def step(self, op, **kw):
        s = {"op": op, **kw}
        self.doc["steps"].append(s)
        return s

    def begin(self, op, v, **kw):
        self.cur = self.step(op, v=v, **kw)
        return self.cur

    def end(self, out=None):
        s, self.cur = self.cur, None
        if out is not None:
            s["out"] = msgs(out)
        return s

    def note(self, k, v):
        if self.cur is None:
            raise RuntimeError(f"{k} outside a step")
        self.cur.setdefault(k, []).append(big(v))


# ================================================================================================ the "client" ======
PH_BATTLE, PH_MAIN2, PH_END = 3, 4, 5


def m6350(p, z, i, cmd):
    return 0x6350, struct.pack(">4I", p, z, i, cmd & 0xffffffff)


def m6423(v):
    return 0x6423, struct.pack(">I", v & 0xffffffff)


class Client:
    """Deterministic player for one view: decides from what the translator asks (state/waiting) and returns the next
    client message. Its own random.Random (never the module-level one, that one is the translator's)."""

    def __init__(self, seed, surrender_at=None, style="normal"):
        self.style = style                    # "normal" | "lazy" (passes every turn: hand-limit discards)
        self.r = random.Random(seed)
        self.turn = None
        self.actions = 0
        self.bp = False
        self.surrender_at = surrender_at      # (turn, "no"|"yes") list
        self.pending = []                     # queued messages of a multi-message answer (lists)
        self.n_same = 0
        self.last_wait = None

    def chance(self, p):
        return self.r.random() < p

    def next(self, d):
        """-> ("msg", id, bytes) | ("surrender", "no"|"yes")."""
        w = d.waiting
        if w is not self.last_wait:
            self.last_wait, self.n_same, self.pending = w, 0, []
        self.n_same += 1
        if self.n_same > 60:
            raise RuntimeError(f"client stuck on {w.get('type')} mode {(d.state or {}).get('mode')}")
        if self.pending:
            mid, data = self.pending.pop(0)
            return "msg", mid, data
        st = d.state or {}
        mode = st.get("mode")
        if w.get("turn") != self.turn:
            self.turn, self.actions, self.bp = w.get("turn"), 0, False
        fn = getattr(self, "_" + str(mode), None)
        if fn is None:
            raise RuntimeError(f"client: no policy for mode {mode} ({w.get('type')})")
        r = fn(d, st, w)
        if r[0] == "msg" or r[0] == "surrender":
            return r
        seq = r[1]
        self.pending = seq[1:]
        return ("msg",) + seq[0]

    # --- noise that only makes the translator resend (B02-style paths) -----------------------------------------
    def _noise(self, d):
        x = self.r.random()
        if x < 0.03 and d.side[0].grave:
            return ("seq", [m6350(0, 0x0e, 0, 1), m6423(0)])         # «Ver detalles» on the grave, close it
        if x < 0.05 and d.side[1].grave:
            return ("seq", [m6350(1, 0x0e, 0, 1), m6423(0)])
        if x < 0.06:
            return ("msg",) + m6350(0, 0, 0, -1)                       # menu closed without a choice
        if x < 0.07:
            return ("msg", 0x6351, b"")                                 # right click with nothing to cancel
        if x < 0.075:
            return ("msg",) + m6350(0, 3, 0, 9)                         # a click that matches no option
        return None

    def _idle(self, d, st, w):
        if self.surrender_at and self.turn is not None and self.turn >= self.surrender_at[0][0]:
            return ("surrender", self.surrender_at.pop(0)[1])
        n = self._noise(d)
        if n:
            return n
        opts, btn = st["options"], st["buttons"]
        self.actions += 1
        pick = None
        if self.style == "lazy" and opts and self.chance(0.85):
            opts = []
        if opts and self.actions <= 7:
            pref = [o for o in opts if o[4] == "SELECT_SUMMON"] or \
                   [o for o in opts if o[4] == "SELECT_ACTIVATE" and o[1] == 0x0b and self.actions <= 4] or \
                   [o for o in opts if o[4] == "SELECT_MONSTER_SET"]
            if self.chance(0.35):
                pick = self.r.choice(opts)
            elif pref:
                pick = pref[0]
        if pick is not None:
            return ("msg",) + m6350(pick[0], pick[1], pick[2], pick[3])
        for b, a in sorted(btn.items()):
            if a == "TO_BP" and not self.bp:
                self.bp = True
                return ("msg", 0x002e, struct.pack(">I", b))
        for b, a in sorted(btn.items()):
            if a == "TO_EP":
                return ("msg", 0x002e, struct.pack(">I", b))
        if btn:
            return ("msg", 0x002e, struct.pack(">I", sorted(btn)[0]))
        o = opts[0]
        return ("msg",) + m6350(o[0], o[1], o[2], o[3])

    def _battle(self, d, st, w):
        n = self._noise(d)
        if n:
            return n
        opts, btn = st["options"], st["buttons"]
        self.actions += 1
        att = [o for o in opts if o[4] == "SELECT_BATTLE"]
        if opts and self.actions <= 9 and (att or self.chance(0.3)):
            o = att[0] if att and not self.chance(0.2) else self.r.choice(opts)
            return ("msg",) + m6350(o[0], o[1], o[2], o[3])
        for want in ("TO_M2", "TO_EP") if self.chance(0.5) else ("TO_EP", "TO_M2"):
            for b, a in btn.items():
                if a == want:
                    return ("msg", 0x002e, struct.pack(">I", b))
        o = opts[0]
        return ("msg",) + m6350(o[0], o[1], o[2], o[3])

    def _chain_ask(self, d, st, w):
        return ("msg",) + m6423(1 if self.chance(0.45) else 0)

    def _chain(self, d, st, w):
        if not st.get("forced") and self.chance(0.25):
            return ("msg", 0x6351, b"")
        o = self.r.choice(st["options"])
        return ("msg",) + m6350(o[0], o[1], o[2], o[3])

    def _chain_none(self, d, st, w):
        return ("msg",) + m6423(self.r.choice((0, 1)))

    def _yesno(self, d, st, w):
        if self.chance(0.08):
            return ("msg", 0x6351, b"")
        return ("msg",) + m6423(1 if self.chance(0.7) else 0)

    def _card(self, d, st, w):
        left = [c for c in st["cands"] if c[3] not in st["chosen"]]
        n = len(st["chosen"])
        if st.get("aim") and st.get("can_cancel") and not n and self.chance(0.15):
            return ("msg", 0x6351, b"")                                 # attack cancelled with the sword out
        if left and n < st["max"] and (n < st["min"] or not n or self.chance(0.5)):
            if self.chance(0.04):
                return ("msg",) + m6350(0, 3, 4, 11)                    # a click on nothing pickable
            c = self.r.choice(left)
            return ("msg",) + m6350(c[0], c[1], c[2], st["bit"])
        return ("msg", 0x6351, b"")

    _tribute = _card

    def _unselect(self, d, st, w):
        if st.get("can_cancel") and self.chance(0.4):
            return ("msg", 0x6351, b"")
        c = self.r.choice(st["cands"])
        return ("msg",) + m6350(c[0], c[1], c[2], st["bit"])

    def _list(self, d, st, w):
        n = len(st["items"])
        idx = list(range(n))
        self.r.shuffle(idx)
        if st.get("sort"):
            k = n - 1 if self.chance(0.15) else n                      # closed incomplete: the list reopens
            seq = [(0x6432, struct.pack(">II", i, j + 1)) for j, i in enumerate(idx[:k])]
            return ("seq", seq + [m6423(k)])
        if not st.get("can_cancel") and self.chance(0.06):
            return ("msg",) + m6423(0)                                 # closed empty: the list reopens
        lo, hi = st["min"], st["max"]
        if hi == 1 and self.chance(0.6):
            return ("seq", [(0x6426, struct.pack(">I", idx[0])), m6423(1)])
        k = self.r.randint(max(lo, 1), max(min(hi, n), 1))
        if st.get("can_cancel") and self.chance(0.1):
            k = 0
        seq = [(0x6432, struct.pack(">II", i, j + 1)) for j, i in enumerate(idx[:k])]
        if k > 1 and self.chance(0.3):
            seq += [(0x6432, struct.pack(">II", idx[0], 0)), (0x6432, struct.pack(">II", idx[0], k + 1))]
        return ("seq", seq + [m6423(k)])

    def _sum(self, d, st, w):
        ok = d._sum_open()
        cs = [c for c in st["cands"] if c["i"] in ok]
        c = self.r.choice(cs)
        p, z, i = c["loc"]
        return ("msg",) + m6350(p, z, i, 11)

    def _sum_list(self, d, st, w):
        n = len(st.get("list_order") or ())
        if self.chance(0.08):
            return ("msg",) + m6423(0)                                 # closed without a card: reopens
        if self.chance(0.5):
            return ("seq", [(0x6432, struct.pack(">II", self.r.randrange(n), 1)), m6423(1)])
        return ("seq", [(0x6426, struct.pack(">I", self.r.randrange(n))), m6423(1)])

    def _place(self, d, st, w):
        if self.chance(0.08):
            bad = [(p, z) for p in (0, 1) for z in range(10) if (p, z) not in st["cands"]]
            if bad:
                p, slot = self.r.choice(bad)
                return ("msg",) + m6350(p, slot, 0, 11)                # a zone that is not free: asked again
        p, slot = self.r.choice(sorted(st["cands"]))
        return ("msg",) + m6350(p, slot, 0, 11)

    def _position(self, d, st, w):
        return ("msg",) + m6423(self.r.choice((0, 1)))

    def _race(self, d, st, w):
        if self.chance(0.05):
            return ("msg",) + m6423(0)                                 # no race: bot.ts decides
        av = int(w.get("available", 0))
        ok = [i for i, b in sorted(TR.YO2_RACE.items()) if av & b]
        return ("msg",) + m6423(self.r.choice(ok))

    def _attrib(self, d, st, w):
        av = int(w.get("available", 0))
        ok = [i for i, b in sorted(TR.YO2_ATTR.items()) if av & b]
        pick = self.r.sample(ok, st["count"])
        return ("msg",) + m6423(sum(1 << i for i in pick))

    def _number(self, d, st, w):
        vals = [o // st["scale"] for o in st["opts"] if o % st["scale"] == 0]
        if self.chance(0.1):
            bad = [v for v in range(0, 0x100) if v not in vals]
            return ("msg",) + m6423(self.r.choice(bad))                # not one of the options: asked again
        return ("msg",) + m6423(self.r.choice(vals))

    def _option(self, d, st, w):
        if self.chance(0.05):
            return ("msg",) + m6423(st["n"])                           # impossible: bot.ts decides
        return ("msg",) + m6423(self.r.randrange(st["n"]))

    def _option_yn(self, d, st, w):
        return ("msg",) + m6423(self.r.choice((0, 1)))

    def _counter(self, d, st, w):
        if self.chance(0.1):
            return ("msg",) + m6423(st["hi"] + 1)
        return ("msg",) + m6423(self.r.randint(st["lo"], st["hi"]))

    def _announce(self, d, st, w):
        ops = w.get("opcodes", [])
        if not hasattr(self, "_ann"):
            self._ann = sorted(d.cm._y2c)
        if self.chance(0.1):
            return ("msg",) + m6423(1)                                 # closed without a card: reopens
        if self.chance(0.1):
            for _ in range(400):
                y = self.r.choice(self._ann)
                code = d.cm.yo2_to_code(y)
                if code and not TR._declarable(code, ops):
                    return ("seq", [m6423(d.cm.yo2_to_internal(y)), m6423(1)])   # not declarable: reopens
        for _ in range(400):
            y = self.r.choice(self._ann)
            code = d.cm.yo2_to_code(y)
            if code and TR._declarable(code, ops):
                return ("seq", [m6423(d.cm.yo2_to_internal(y)), (0x6432, struct.pack(">II", 0, 1)), m6423(1)])
        return ("seq", [m6423(d.cm.yo2_to_internal(self._ann[0])), m6423(1)])


# ================================================================================================ the hosts ======
def corrupt(host, resp):
    """Host-side fault injection (not something the server does): now and then an illegal answer reaches duelcore, so
    the next select comes back with retry=True and the translator's RETRY handling (retry_n / retry_auto) runs."""
    c = getattr(host, "corrupt_p", 0)
    if c and resp.get("type") in ("SELECT_IDLECMD", "SELECT_BATTLECMD") and host.crng.random() < c:
        return {"type": resp["type"], "action": "SELECT_SUMMON" if resp["type"] == "SELECT_IDLECMD" else "SELECT_BATTLE",
                "index": 77}
    return resp


class NpcHost:
    """ocg_duel.OcgSession, step by step, with recording."""

    def __init__(self, dc, name, did, seed, player_deck, npc_id, first, place_manual=False, surrender_at=None,
                 max_turn=120, style="normal", corrupt=0, cfg=None):
        self.dc, self.id, self.first, self.npc_id = dc, did, first, npc_id
        self.cfg = cfg                          # flags changed like the server's admin panel / profile would (trcfg)
        self.corrupt_p, self.crng = corrupt, random.Random(seed * 13 + 5)
        self.rec = Rec(name, "npc", seed)
        self.seed = seed
        self.player = player_deck
        if isinstance(npc_id, list):
            self.npc, npc_id = npc_deck_of(npc_id), 1
        else:
            self.npc = OCG.npc_deck(npc_id) or {"main": list(player_deck["main"]), "extra": list(player_deck["extra"])}
        self.npc_id = npc_id
        self.place_manual = place_manual
        self.client = Client(seed * 7 + 1, surrender_at, style)
        self.max_turn = max_turn
        self.over = False
        self.ended = None
        self.npc_decisions = 0

    def log(self, s):
        pass

    def query(self):
        st = self.dc.query(self.id)
        self.rec.note("q", st)
        return st

    def run(self):
        random.seed(self.seed)
        rec = self.rec
        decks = [{"main": OCG.to_codes(self.player["main"]), "extra": OCG.to_codes(self.player["extra"])},
                 {"main": OCG.to_codes(self.npc["main"]), "extra": OCG.to_codes(self.npc["extra"])}]
        rec.step("new", v=0, decks=decks, first=self.first, cfg=self.cfg)
        d = self.d = TR.YO2Duel(decks, first=self.first, cardmap=OCG.cardmap(), cfg=self.cfg, log=self.log)
        d.clock = FakeClock(rec)
        d.place_manual = bool(self.place_manual)
        rec.step("set", v=0, k="place_manual", val=d.place_manual)
        d.query = self.query
        rec.begin("start", 0)
        rec.end(d.start())
        seed = random.randrange(1 << 30)
        rec.step("rng", fn="randrange", args=[1 << 30], val=seed)
        rule = OCG.duel_rule()
        auto_chain = not d.cfg.get("chain_none_prompt")
        self.brain = OCG.NpcBrain(OCG.load_npc_profile(self.npc_id), player=1, seed=seed)
        self.dc.new(self.id, decks, first=self.first, seed=seed, shuffle=True, brain="python", rule=rule,
                    auto_chain=auto_chain)
        self.pump()
        while not self.over:
            self.client_turn()
        self.finish()
        return rec.doc

    def feed(self, evs):
        self.rec.begin("feed", 0, evs=big(evs))
        return self.rec.end(self.d.feed_many(evs))

    def pump(self):
        d, dc, rec = self.d, self.dc, self.rec
        while not self.over:
            evs = dc.wait(self.id)
            last = evs[-1]
            for e in evs:
                if e.get("ev") == "msg":
                    self.brain.observe(e)
            if (last.get("ev") == "select" and last.get("player") == 1 and last.get("type") == "SELECT_CHAIN"
                    and not last.get("selects") and not last.get("forced") and not last.get("retry")):
                self.feed(evs[:-1])
                dc.respond(self.id, {"type": "SELECT_CHAIN", "index": None}, player=1)
                continue
            if last.get("ev") == "select" and last.get("player") == 1:
                self.feed(evs[:-1])
                self.npc_decisions += 1
                if self.npc_decisions > OCG.MAX_NPC_DECISIONS or (last.get("turn") or 0) > self.max_turn:
                    dc.end(self.id)
                    self.over, self.ended = True, "cut"
                    return
                if last.get("retry"):
                    dc.auto(self.id)
                else:
                    r = self.brain.choose(last)
                    if r is None:
                        dc.auto(self.id)
                    else:
                        dc.respond(self.id, r, player=1)
                continue
            if last.get("ev") == "end":
                d.query = None
                rec.step("query_none", v=0)
                self.feed(evs[:-1])
                d.finished = True
                rec.step("finished", v=0)
                self.over, self.ended = True, ["end", last.get("winner"), last.get("reason"), last.get("turns")]
                return
            self.feed(evs)
            if last.get("ev") == "select" and last.get("player", 0) == 0:
                st = dc.query(self.id)
                rec.begin("sync", 0, state=big(st))
                rec.end(d.sync_stats(st))
            if last.get("ev") == "error":
                raise RuntimeError(f"duelcore error: {last.get('error')}")
            na = d.needs_auto()
            rec.step("needs_auto", v=0, val=na)
            if na:
                rec.begin("auto_response", 0)
                cmd = d.auto_response()
                rec.end()["val"] = cmd
                self.cmd(cmd)
                continue
            if (last.get("turn") or 0) > self.max_turn:
                dc.end(self.id)
                self.over, self.ended = True, "cut"
            return

    def cmd(self, cmd):
        if cmd.get("cmd") == "auto":
            self.dc.auto(self.id)
        else:
            self.dc.respond(self.id, corrupt(self, cmd["response"]))

    def client_turn(self):
        d, rec = self.d, self.rec
        a = self.client.next(d)
        if a[0] == "surrender":
            # duelfin h_6350: «¿Te rindes?»; NO -> s.out.put(s.d._resend()); SÍ -> s.surrender() (dc.end, no more translator)
            if a[1] == "no":
                rec.begin("resend", 0)
                rec.end(d._resend())
                return
            rec.step("surrender", v=0)
            self.dc.end(self.id)
            self.over, self.ended = True, "surrender"
            return
        _, mid, data = a
        s = rec.begin("client", 0, id=mid, data=data.hex())
        try:
            cmd, back = d.on_client(mid, data)
        except Exception as e:                        # noqa: BLE001  OcgSession.on_client B02: resend
            s["exc"] = repr(e)
            rec.end()
            rec.begin("resend", 0)
            rec.end(d._resend())
            return
        s["cmd"] = cmd
        rec.end(back)
        if cmd:
            self.cmd(cmd)
            self.pump()

    def finish(self):
        d = self.d
        self.rec.doc["final"] = [final(d)]
        self.rec.doc["ended"] = self.ended


def final(d):
    return {"warns": list(d.unknown), "lp": list(d.lp), "finished": d.finished, "unknown": len(d.unknown), "lp_desync_n": d.lp_desync_n,
            "waiting": d.waiting is not None, "mode": (d.state or {}).get("mode"), "hud": d.hud,
            "chain": [list(x) for x in d.chain], "next_serial": list(d.next_serial)}


class PvpHost:
    """ocg_duel.PvpSession (without its clock/stats, which live outside the translator), step by step."""

    def __init__(self, dc, name, did, seed, decks, first, place_manual=(False, False), max_turn=120,
                 style=("normal", "normal"), corrupt=0, cfg=None):
        self.dc, self.id, self.first = dc, did, first
        self.xcfg = cfg or {}
        self.corrupt_p, self.crng = corrupt, random.Random(seed * 13 + 5)
        self.rec = Rec(name, "pvp", seed)
        self.seed = seed
        self.decks = decks
        self.place_manual = place_manual
        self.clients = [Client(seed * 7 + 1, style=style[0]), Client(seed * 7 + 2, style=style[1])]
        self.max_turn = max_turn
        self.over = False
        self.decider = None
        self.ended = None

    def log(self, s):
        pass

    def qraw(self):
        st = self.dc.query(self.id)
        self.rec.note("q", st)
        return st

    def run(self):
        random.seed(self.seed)
        rec = self.rec
        codes = [{"main": OCG.to_codes(d.get("main", [])), "extra": OCG.to_codes(d.get("extra", []))} for d in self.decks]
        cfg = {"npc_phrases": False, "turn_timer": 0}         # PvpMatch with the time limit on (vanilla turn_limit)
        cfg.update(self.xcfg)
        self.views = [None, None]
        rec.step("new", v=0, decks=[codes[0], codes[1]], first=self.first, cfg=cfg)
        self.views[0] = TR.YO2Duel([codes[0], codes[1]], first=self.first, cardmap=OCG.cardmap(), cfg=cfg, log=self.log)
        rec.step("new", v=1, decks=[codes[1], codes[0]], first=1 - self.first, cfg=cfg)
        self.views[1] = TR.YO2Duel([codes[1], codes[0]], first=1 - self.first, cardmap=OCG.cardmap(), cfg=cfg, log=self.log)
        for i in (0, 1):
            self.views[i].clock = FakeClock(rec, t=1000.0 + 500 * i)
            self.views[i].place_manual = bool(self.place_manual[i])
            rec.step("set", v=i, k="place_manual", val=self.views[i].place_manual)
        self.views[0].query = self.qraw
        self.views[1].query = lambda: OCG.mirror_state(self.qraw())
        for i in (0, 1):
            rec.begin("start", i)
            rec.end(self.views[i].start())
        seed = random.randrange(1 << 30)
        rec.step("rng", fn="randrange", args=[1 << 30], val=seed)
        self.dc.new(self.id, codes, first=self.first, seed=seed, shuffle=True, bot=(False, False), rule=OCG.duel_rule(),
                    auto_chain=not self.views[0].cfg.get("chain_none_prompt"))
        self.pump()
        while not self.over:
            self.client_turn()
        rec.doc["final"] = [final(v) for v in self.views]
        rec.doc["ended"] = self.ended
        return rec.doc

    def feed(self, i, evs):
        """views[i].feed_many(ev_for(i, evs)); the RAW events are recorded (the TS host mirrors view 1's)."""
        self.rec.begin("feed", i, evs=big(evs))
        return self.rec.end(self.views[i].feed_many(evs if i == 0 else [OCG.mirror(e) for e in evs]))

    def pump(self):
        dc, rec = self.dc, self.rec
        while not self.over:
            evs = dc.wait(self.id)
            last = evs[-1]
            kind = last.get("ev")
            if kind == "end":
                for i in (0, 1):
                    v = self.views[i]
                    v.query = None
                    rec.step("query_none", v=i)
                    self.feed(i, evs[:-1])
                    v.finished = True
                    rec.step("finished", v=i)
                self.over, self.decider = True, None
                self.ended = ["end", last.get("winner"), last.get("reason"), last.get("turns")]
                return
            if kind == "select":
                p = last.get("player", 0)
                p = p if p in (0, 1) else 0
                o = 1 - p
                if not OCG.ritual_sum_ok():
                    raise RuntimeError("ritual_sum_ok() is False: not the vanilla server")
                self.feed(o, evs[:-1])
                v = self.views[p]
                self.feed(p, evs)
                st = dc.query(self.id)                         # v.sync_stats(v.query()): the raw state is recorded
                rec.begin("sync", p, state=big(st))
                rec.end(v.sync_stats(st if p == 0 else OCG.mirror_state(st)))
                na = v.needs_auto()
                rec.step("needs_auto", v=p, val=na)
                if na:
                    rec.begin("auto_response", p)
                    cmd = v.auto_response()
                    s = rec.end()
                    s["val"] = cmd
                    self.cmd(p, cmd, s)
                    continue
                if (last.get("turn") or 0) > self.max_turn:
                    dc.end(self.id)
                    self.over, self.ended = True, "cut"
                    return
                self.decider = p
                return
            for i in (0, 1):
                self.feed(i, evs)
            if kind == "error":
                raise RuntimeError(f"duelcore error: {last.get('error')}")
            return

    def cmd(self, p, cmd, s):
        self.decider = None
        if cmd is None or cmd.get("cmd") == "auto":
            self.dc.auto(self.id)
        else:
            resp = OCG.unmirror_response(p, cmd["response"])
            s["sent"] = resp                                    # what PvpSession sends (before the fault injection)
            self.dc.respond(self.id, corrupt(self, resp), player=p)

    def client_turn(self):
        i = self.decider
        v, rec = self.views[i], self.rec
        a = self.clients[i].next(v)
        _, mid, data = a
        s = rec.begin("client", i, id=mid, data=data.hex())
        try:
            cmd, back = v.on_client(mid, data)
        except Exception as e:                        # noqa: BLE001  PvpSession.on_client B02
            s["exc"] = repr(e)
            rec.end()
            rec.begin("resend", i)
            rec.end(v._resend())
            return
        s["cmd"] = cmd
        rec.end(back)
        if cmd:
            self.cmd(i, cmd, s)
            self.pump()


class UnitHost(NpcHost):
    """Scripted event batches (no duelcore) for what the recorded duels never reach: UNEQUIP / CANCEL_TARGET (duelcore
    does not emit them), SELECT_COUNTER, SELECT_SUM from the deck. Same recording and the same client; the commands the
    translator returns go nowhere (there is no engine), the next batch just follows."""

    def __init__(self, name, seed, decks, batches):
        self.rec = Rec(name, "unit", seed)
        self.seed, self.decks, self.batches = seed, decks, batches
        self.client = Client(seed * 7 + 1)
        self.over, self.ended = False, "script"

    def run(self):
        random.seed(self.seed)
        rec = self.rec
        rec.step("new", v=0, decks=self.decks, first=0, cfg=None)
        d = self.d = TR.YO2Duel(self.decks, first=0, cardmap=OCG.cardmap(), log=self.log)
        d.clock = FakeClock(rec)
        rec.begin("start", 0)
        rec.end(d.start())
        rec.step("rng", fn="randrange", args=[1 << 30], val=random.randrange(1 << 30))
        batches = list(self.batches)
        while batches:
            evs = batches.pop(0)
            self.feed(evs)
            while batches and isinstance(batches[0], tuple):   # ("sync", state): the host's sync_stats(query)
                rec.begin("sync", 0, state=big(batches[0][1]))
                rec.end(d.sync_stats(batches.pop(0)[1]))
            last = evs[-1]
            if last.get("ev") != "select" or last.get("player") != 0:
                continue
            na = d.needs_auto()
            rec.step("needs_auto", v=0, val=na)
            if na:
                rec.begin("auto_response", 0)
                rec.end()["val"] = d.auto_response()
                continue
            while d.waiting is not None:
                _, mid, data = self.client.next(d)
                s = rec.begin("client", 0, id=mid, data=data.hex())
                cmd, back = d.on_client(mid, data)
                s["cmd"] = cmd
                rec.end(back)
        self.finish()
        return rec.doc


def _m(t, **kw):
    return {"ev": "msg", "type": t, **kw}


def _sel(t, **kw):
    return {"ev": "select", "type": t, "player": 0, "retry": False, "turn": 1, "turn_player": 0, **kw}


def _at(p, loc_, seq, pos=0, **kw):
    return {"controller": p, "location": loc_, "sequence": seq, "position": pos, **kw}


GAMMA, AXE, CIRCLE, LIBRARY, BREAKER, VORSE = 11549357, 40619825, 18807108, 70791313, 71413901, 14898066
UNIT_DECK0 = [GAMMA, AXE, CIRCLE, LIBRARY, BREAKER] + [VORSE] * 30 + [GAMMA] * 5
UNIT_DECK1 = [VORSE] * 40


def unit_links():
    """summon, equip (Axe), re-target (Circle), UNEQUIP, CANCEL_TARGET, counters, SELECT_COUNTER, SELECT_SUM from the deck."""
    idle = _sel("SELECT_IDLECMD", summons=[], special_summons=[], pos_changes=[], monster_sets=[], spell_sets=[],
                activates=[], to_bp=False, to_ep=True)
    b = [
        [_m("NEW_TURN", player=0), _m("NEW_PHASE", phase=1),
         _m("DRAW", player=0, drawn=[{"code": c, "position": 10} for c in UNIT_DECK0[:5]]), _m("NEW_PHASE", phase=4),
         _m("MOVE", card=GAMMA, **{"from": _at(0, 2, 0, 10), "to": _at(0, 4, 0, 1)}),
         _m("SUMMONING", code=GAMMA, controller=0, location=4, sequence=0, position=1), _m("SUMMONED"),
         _m("MOVE", card=AXE, **{"from": _at(0, 2, 0, 10), "to": _at(0, 8, 0, 5)}),
         _m("CHAINING", code=AXE, controller=0, location=8, sequence=0, position=5, chain_size=1, description=0),
         _m("CHAIN_SOLVING", chain_size=1), _m("EQUIP", card=_at(0, 8, 0, 5), target=_at(0, 4, 0, 1)),
         _m("CHAIN_SOLVED", chain_size=1), _m("CHAIN_END"),
         _m("MOVE", card=CIRCLE, **{"from": _at(0, 2, 0, 10), "to": _at(0, 8, 1, 5)}),
         _m("CHAINING", code=CIRCLE, controller=0, location=8, sequence=1, position=5, chain_size=1, description=0),
         _m("CARD_TARGET", card=_at(0, 8, 1, 5), target=_at(0, 4, 0, 1)), _m("CHAIN_END"),
         _m("MOVE", card=LIBRARY, **{"from": _at(0, 2, 0, 10), "to": _at(0, 4, 1, 1)}),
         _m("SUMMONING", code=LIBRARY, controller=0, location=4, sequence=1, position=1), _m("SUMMONED"),
         _m("ADD_COUNTER", counter_type=1, controller=0, location=4, sequence=1, count=3),
         _m("REMOVE_COUNTER", counter_type=1, controller=0, location=4, sequence=1, count=1),
         _m("ADD_COUNTER", counter_type=0x77, controller=0, location=4, sequence=1, count=1),
         idle],
        [_m("UNEQUIP", card=_at(0, 8, 0, 5)), _m("CANCEL_TARGET", card=_at(0, 8, 1, 5), target=_at(0, 4, 0, 1)),
         _sel("SELECT_COUNTER", counter_type=1, count=3,
              cards=[{"code": LIBRARY, "controller": 0, "location": 4, "sequence": 1, "count": 2},
                     {"code": GAMMA, "controller": 0, "location": 4, "sequence": 0, "count": 3}])],
        [_sel("SELECT_COUNTER", counter_type=1, count=2,
              cards=[{"code": LIBRARY, "controller": 0, "location": 4, "sequence": 1, "count": 2}])],
        [_m("HINT", hint_type=3, hint=509, player=0),
         _sel("SELECT_SUM", select_max=0, amount=8, min=0, max=0, selects_must=[],
              selects=[{"code": VORSE, "controller": 0, "location": 1, "sequence": 30 - k, "position": 10, "amount": 4}
                       for k in range(3)] + [{"code": BREAKER, "controller": 0, "location": 2, "sequence": 0,
                                               "position": 10, "amount": 4}])],
        [_sel("SELECT_SUM", select_max=1, amount=7, min=0, max=0, selects_must=[{"amount": 4}],
              selects=[{"code": VORSE, "controller": 0, "location": 1, "sequence": 20 - k, "position": 10,
                        "amount": 4 | (3 << 16)} for k in range(3)])],
        [_m("MOVE", card=AXE, **{"from": _at(0, 8, 0, 5), "to": _at(0, 16, 0, 5)}),
         _m("MOVE", card=GAMMA, **{"from": _at(0, 4, 0, 1), "to": _at(0, 16, 1, 5)}), idle],
    ]
    return [{"main": UNIT_DECK0, "extra": []}, {"main": UNIT_DECK1, "extra": []}], b


def unit_desync():
    """The safety nets: a select whose LP differ from the mirror (§24 lp_reconcile: 0x27 + 0x26) and a query whose
    position differs from the client (sync_board: 0x34 + the pending request again)."""
    idle = _sel("SELECT_IDLECMD", summons=[], special_summons=[], pos_changes=[], monster_sets=[], spell_sets=[],
                activates=[], to_bp=False, to_ep=True)
    st = {"players": [{"mzone": [{"code": GAMMA, "position": 4, "attack": 1500, "defense": 1800}, None, None, None, None],
                       "szone": [None] * 6},
                      {"mzone": [None] * 5, "szone": [None] * 6}]}
    b = [
        [_m("NEW_TURN", player=0), _m("NEW_PHASE", phase=1),
         _m("DRAW", player=0, drawn=[{"code": c, "position": 10} for c in UNIT_DECK0[:5]]), _m("NEW_PHASE", phase=4),
         _m("MOVE", card=GAMMA, **{"from": _at(0, 2, 0, 10), "to": _at(0, 4, 0, 1)}),
         _m("SUMMONING", code=GAMMA, controller=0, location=4, sequence=0, position=1), _m("SUMMONED"),
         _m("DAMAGE", player=1, amount=700), dict(idle, lp=[7000, 8000])],
        ("sync", st),
        ("sync", st),
        [_m("LPUPDATE", player=0, lp=5000), _m("RECOVER", player=1, amount=300), _m("LPUPDATE", player=1, lp=9000), idle],
    ]
    return [{"main": UNIT_DECK0, "extra": []}, {"main": UNIT_DECK1, "extra": []}], b


UNITS = [("unit_links", 5001, unit_links), ("unit_links2", 5002, unit_links), ("unit_desync", 5003, unit_desync)]


# ================================================================================================ the duels ======
def npc_deck_of(npc_id):
    if isinstance(npc_id, list):                              # a themed deck of passcodes (below)
        cm = OCG.cardmap()
        return {"main": [cm.code_to_yo2(c) for c in npc_id], "extra": []}
    d = OCG.npc_deck(npc_id)
    return {"main": list(d["main"]), "extra": list(d["extra"])}


_FILL = [14898066, 11091375, 11549357, 91152256, 43096270, 69247929]      # 4-star normal monsters
# themed decks (passcodes; all exist in YO2): the translator's dialogs, control/reveal cards, rituals
DIALOGS = ([98045062] * 2 + [76922029, 37390589, 76754619, 80161395, 58074572, 45653036] + [85087012] * 2
           + [58577036, 3280747, 74701381, 56769674, 43711255] + [15800838] * 2
           + [69296555, 1525329, 10352095, 14087893, 29843091, 73915051, 74137509, 126218, 71625222, 31036355])
DIALOGS += _FILL * 3
DIALOGS = DIALOGS[:40]
CONTROL = ([64697231] * 2 + [42829885] * 2 + [17375316, 57728570] + [81210420] * 2 + [18807108] * 2
           + [4031928, 87910978, 45986603, 65169794, 40619825, 72302403, 58775978, 95308449, 75500286, 44656491,
              82432018, 24874630, 70791313, 71413901, 28553439, 99789342, 17178486, 36468556, 72892473])
CONTROL += _FILL * 3
CONTROL = CONTROL[:40]
RITUAL = ([55761792] * 2 + [5405694] * 3 + [46052429] * 2 + [69035382] * 2 + [83764718, 70828912, 97077563, 53582587,
           44095762, 56120475, 4206964, 77414722, 41420027, 40640057, 4906301, 44330098, 24508238, 37742478, 83011277,
           26202165, 78010363, 31560081])
RITUAL += _FILL * 3
RITUAL = RITUAL[:40]
MISC = ([17178486] * 2 + [5990062, 57585212] + [81332143] * 2 + [16768387] * 2 + [49998907, 79106360, 34124316, 42994702,
        59237154] + [81210420] * 2 + [53112492, 70791313, 32062913, 7180418, 91070115, 37390589, 75560629, 53828396,
        21598948, 22359980, 44656491, 55256016, 21502796, 78371393, 40044918, 31829185, 94773007])
MISC += _FILL * 3
MISC = MISC[:40]


def pc_deck():
    """duelcore/pruebas_comun DECK_A as YO2 ids (what the client sends in 0x6601)."""
    import pruebas_comun as PC
    cm = OCG.cardmap()
    return {"main": [cm.code_to_yo2(c) for c in PC.DECK_A], "extra": []}


ALT_CFG = {"fusion_official": False, "lp_type_oficial": False, "battle_damage_split": False, "summon_kind_fx": False,
           "field_move_3d": False, "chain_reveal": False, "activate_flash": True, "yesno_texts": False, "hand_open": False,
           "token_vanish": False, "lp_set_direct": False, "lp_resync": True, "npc_phrases": True, "tribute_mark": True,
           "pick_panel": True, "chain_card_name": True, "link_target_anim": False, "chain_dialog": 2, "attack_aim": False,
           "chain_priority": None, "summon_done": False, "stat_sync_turn": False, "yesno_card": False}
NODLG_CFG = {"yesno": "auto", "chain_dialog": "pass", "position_dialog": False, "announce_dialogs": False,
             "option_dialog": False, "list_picks": False, "ritual_sum": False, "turn_timer": 0, "stat_sync": False,
             "lp_reconcile": False, "retry_auto": 0, "hide_npc": False, "sort_list": False, "counter_dialog": False,
             "hand_limit_dialog": False, "opp_hand_pick": False, "card_link": False, "target_lockon": False,
             "counters": False, "swap_cmd": False, "monst_shuffle": False, "toss_anim": False, "field_change": False,
             "pile_look": False, "turn_counter": False, "declare_hint": False}

DUELS = [
    # name, kind, seed, player deck (npc id or "pc"), npc id, first, extra
    ("npc_first0", "npc", 101, "pc", 4, 0, {}),
    ("npc_first1", "npc", 202, 60, 51, 1, {}),
    ("npc_manual", "npc", 303, 61, 36, 0, {"place_manual": True}),
    ("npc_surrender", "npc", 404, 52, 68, 1, {"surrender_at": [(3, "no"), (7, "yes")]}),
    ("npc_fusion", "npc", 505, 84, 57, 0, {}),
    ("npc_ritual", "npc", 606, 97, 83, 1, {"place_manual": True}),
    ("npc_long", "npc", 707, 62, 63, 0, {}),
    ("npc_mix", "npc", 808, 55, 60, 1, {}),
    ("pvp_first0", "pvp", 909, 51, 4, 0, {}),
    ("pvp_first1", "pvp", 1010, 54, 66, 1, {"place_manual": (True, False)}),
    ("npc_surrender2", "npc", 1111, 1, 2, 0, {"surrender_at": [(2, "no"), (2, "no"), (4, "yes")]}),
]
DUELS += [
    ("npc_dialogs", "npc", 3001, DIALOGS, 30, 0, {}),
    ("npc_control", "npc", 3002, CONTROL, 51, 1, {"place_manual": True}),
    ("npc_ritual2", "npc", 3003, RITUAL, 4, 0, {}),
    ("npc_lazy", "npc", 3004, 33, 12, 1, {"style": "lazy"}),
    ("npc_vs_dialogs", "npc", 3005, 63, DIALOGS, 0, {}),
    ("npc_vs_control", "npc", 3006, 57, CONTROL, 1, {}),
    ("pvp_dialogs", "pvp", 3007, DIALOGS, CONTROL, 0, {}),
    ("pvp_control", "pvp", 3008, CONTROL, RITUAL, 1, {"place_manual": (True, True)}),
    ("pvp_ritual", "pvp", 3009, RITUAL, DIALOGS, 0, {"style": ("normal", "lazy")}),
    ("pvp_lazy", "pvp", 3010, DIALOGS, DIALOGS, 1, {"style": ("lazy", "normal")}),
    ("npc_misc", "npc", 3011, MISC, 40, 0, {"corrupt": 0.15}),
    ("npc_vs_misc", "npc", 3012, 66, MISC, 1, {"corrupt": 0.1}),
    ("pvp_misc", "pvp", 3013, MISC, DIALOGS, 0, {"corrupt": 0.1}),
    ("pvp_misc2", "pvp", 3014, CONTROL, MISC, 1, {"place_manual": (True, True)}),
    ("npc_misc_manual", "npc", 3015, MISC, CONTROL, 1, {"place_manual": True}),
    ("pvp_misc3", "pvp", 3016, MISC, MISC, 0, {"style": ("normal", "lazy"), "corrupt": 0.05}),
    # flags as the "enhanced" profile / the admin panel can set them (not vanilla)
    ("npc_enhanced", "npc", 4001, DIALOGS, 60, 0, {"cfg": {"chain_one_name": True}}),
    ("npc_chain_none", "npc", 4002, CONTROL, 57, 1, {"cfg": {"chain_none_prompt": True}}),
    ("pvp_chain_none", "pvp", 4003, RITUAL, MISC, 0, {"cfg": {"chain_none_prompt": True, "chain_one_name": True}}),
    ("npc_alt", "npc", 4004, MISC, 61, 0, {"cfg": ALT_CFG}),
    ("pvp_alt", "pvp", 4005, CONTROL, DIALOGS, 1, {"cfg": ALT_CFG}),
    ("npc_nodialogs", "npc", 4006, DIALOGS, 52, 1, {"cfg": NODLG_CFG}),
    ("npc_alt2", "npc", 4007, 60, 84, 1, {"cfg": dict(ALT_CFG, chain_dialog=0, chain_priority=None)}),
    ("npc_evento", "npc", 4008, RITUAL, 68, 0, {"cfg": {"chain_priority": "evento"}}),
    ("npc_spe", "npc", 4009, MISC, CONTROL, 1, {"cfg": {"chain_priority": "spe", "chain_event_text": False}}),
]
_DECKED = [k for k in (1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 16, 17, 20, 21, 24, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
                       38, 40, 43, 44, 49, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70,
                       71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 96, 97, 98)]
_g = random.Random(20261028)
for _k in range(36):                       # more seeded duels, deck pairs drawn from the official NPC decks
    _kind = "pvp" if _k % 4 == 3 else "npc"
    DUELS.append((f"{_kind}_r{_k:02d}", _kind, 2000 + _k, _g.choice(_DECKED), _g.choice(_DECKED), _k % 2,
                  {"place_manual": (_k % 3 == 0) if _kind == "npc" else (_k % 3 == 0, _k % 5 == 0)}))


COV = {k: {} for k in ("msg", "select", "mode", "engine", "settype", "netmsg", "client")}


def _bump(k, v):
    COV[k][v] = COV[k].get(v, 0) + 1


def coverage(doc):
    for s in doc["steps"]:
        for e in s.get("evs", []):
            if e.get("ev") == "msg":
                _bump("msg", e.get("type"))
            elif e.get("ev") == "select" and (doc["kind"] == "pvp" or e.get("player") == 0):
                _bump("select", e.get("type"))
        if s["op"] == "client":
            _bump("client", hex(s["id"]))
        for mid, h in s.get("out", []):
            _bump("netmsg", hex(mid))
            if mid == 0x6202:
                b = bytes.fromhex(h)
                t, bb = struct.unpack(">II", b[:8])
                if t & 0xff == 0:
                    _bump("engine", hex(bb & 0xfff))
                else:
                    _bump("settype", hex(t & 0xff) + (f"/{bb:#x}" if t & 0xff == 0x1b else ""))


HIT = set()


def _tracer(frame, event, arg):
    if frame.f_code.co_filename != TR.__file__:
        return None
    HIT.add(frame.f_lineno)
    return _local


def _local(frame, event, arg):
    if event == "line":
        HIT.add(frame.f_lineno)
    return _local


def cover_report():
    """Per function of translator.py: executable lines hit / total, and the lines never run."""
    import ast
    import dis
    src = open(TR.__file__, encoding="utf-8").read()
    tree = ast.parse(src)
    code = compile(src, TR.__file__, "exec")
    lines = set()

    def walk(co):
        for _, _, ln in co.co_lines():
            if ln:
                lines.add(ln)
        for c in co.co_consts:
            if hasattr(c, "co_lines"):
                walk(c)
    walk(code)
    rows = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            body = {ln for ln in lines if node.body[0].lineno <= ln <= node.end_lineno}
            if not body:
                continue
            miss = sorted(body - HIT)
            rows.append((node.lineno, node.name, len(body) - len(miss), len(body), miss))
    rows.sort()
    tot = sum(r[3] for r in rows)
    hit = sum(r[2] for r in rows)
    out = [f"translator.py: {hit}/{tot} executable lines in functions run ({100 * hit / tot:.1f}%)"]
    for ln, name, h, n, miss in rows:
        out.append(f"{ln:5d} {name:32s} {h:4d}/{n:<4d} miss {miss if len(miss) < 40 else miss[:40] + ['...']}")
    path = os.path.join(OUT, "py_coverage.txt")
    open(path, "w").write("\n".join(out) + "\n")
    print(out[0], "->", path)


def main():
    os.makedirs(OUT, exist_ok=True)
    if COVER:
        sys.settrace(_tracer)
    from duelcore import DuelCore
    dc = DuelCore()
    try:
        for name, seed, fn in UNITS:
            if ONLY and name not in ONLY:
                continue
            decks, batches = fn()
            doc = UnitHost(name, seed, decks, batches).run()
            coverage(doc)
            with gzip.open(os.path.join(OUT, name + ".json.gz"), "wt", encoding="utf-8") as f:
                json.dump(doc, f, separators=(",", ":"))
            print(f"{name}: {len(doc['steps'])} steps (scripted)", flush=True)
        for k, (name, kind, seed, pdeck, npc, first, extra) in enumerate(DUELS):
            if ONLY and name not in ONLY:
                continue
            did = f"rec{seed}"
            pd = pc_deck() if pdeck == "pc" else npc_deck_of(pdeck)
            if kind == "npc":
                h = NpcHost(dc, name, did, seed, pd, npc, first, **extra)
            else:
                h = PvpHost(dc, name, did, seed, [pd, npc_deck_of(npc)], first, **extra)
            doc = h.run()
            coverage(doc)
            path = os.path.join(OUT, name + ".json.gz")
            with gzip.open(path, "wt", encoding="utf-8") as f:
                json.dump(doc, f, separators=(",", ":"))
            steps = doc["steps"]
            nout = sum(len(s.get("out", [])) for s in steps)
            ops = {}
            for s in steps:
                ops[s["op"]] = ops.get(s["op"], 0) + 1
            print(f"{name}: {len(steps)} steps, {nout} outputs, ended {doc['ended']}, {ops}", flush=True)
    finally:
        dc.close()
    with open(os.path.join(OUT, "coverage.json"), "w", encoding="utf-8") as f:
        json.dump({k: dict(sorted(v.items(), key=lambda x: str(x[0]))) for k, v in COV.items()}, f, indent=1)
    for k, v in COV.items():
        print(k, len(v), dict(sorted(v.items(), key=lambda x: str(x[0]))))
    if COVER:
        sys.settrace(None)
        cover_report()


if __name__ == "__main__":
    main()
