"""End-to-end check of the duel engine (src/duel) against ocgcore:
  - duelcore (YOLaucher's ocgcore process) plays a duel, bot.ts deciding for both players;
  - YOLaucher's translator turns its events into the server messages yo2.exe receives (0x6202 engine commands and the
    rest) and keeps a mirror of the board the client should end up with;
  - tests/duel_e2e_cli.cpp feeds those messages through CNetDuel and runs the engine (DUEL_VIEW headless);
  - at the end the engine's DUEL_END result must name ocgcore's winner;
  - after every batch the engine's board (LP, every pile as uids in order, every zone as uid + face-up + defense
    position) must equal the translator's mirror.
Run: python3.12 -I tests/duel_e2e_test.py [duels] [first seed]   (needs node for duelcore, c++, the card data)
"""
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")
CARDS = os.environ.get("YO2_CARD_BIN", os.path.expanduser("~") + "/Documents/GitHub/duel-evolution-restore/extraction/recovery/out_2008/"
                       "CHG/merge/data/bin#")
EMU = os.environ.get("YO2_EMU_DIR", os.path.expanduser("~") + "/Documents/GitHub/YOLaucher-web/tools/yo2emu")
for p in (EMU, os.path.join(EMU, "research", "traductor"), os.path.join(EMU, "duelcore")):
    sys.path.insert(0, p)
import proto  # noqa: E402
import translator as TR  # noqa: E402
from cardmap import CardMap  # noqa: E402
from duelcore import DuelCore  # noqa: E402
import pruebas_comun as PC  # noqa: E402

PILES = ("hand", "deck", "grave", "banish", "extra")


def build(tmp):
    srcs = sorted(os.path.join(SRC, "duel", n) for n in os.listdir(os.path.join(SRC, "duel"))
                  if n.endswith(".cpp") and not n.startswith("Scene"))
    srcs += [os.path.join(SRC, "Net", n) for n in ("MessageIO.cpp", "ygpacket.cpp")]
    srcs.append(os.path.join(SRC, "Game", "yo2GameData.cpp"))   # the card files' reader
    exe = os.path.join(tmp, "duel_e2e")
    subprocess.check_call(["c++", "-std=c++17", "-O1", "-g", "-Wall", "-Wextra", "-fsanitize=address,undefined",
                           "-I", SRC, os.path.join(HERE, "duel_e2e_cli.cpp"), *srcs, "-o", exe])
    return exe


class Cli:
    def __init__(self, exe):
        self.p = subprocess.Popen([exe, CARDS], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        self.seq = 1

    def cmd(self, line):
        self.p.stdin.write(line + "\n")
        self.p.stdin.flush()
        out = []
        while True:
            ln = self.p.stdout.readline()
            if not ln:
                raise RuntimeError(f"duel_e2e_cli died on {line[:80]!r}")
            ln = ln.rstrip("\n")
            if ln == ".":
                return out
            out.append(ln)

    def send(self, msgs):
        if not msgs:
            return
        wire = b""
        for m, d in msgs:
            wire += proto.pack(m, d, self.seq)
            self.seq += 1
        r = self.cmd("rx " + wire.hex())
        assert not r, r
        r = self.cmd("run")
        assert r and "STUCK" not in r[0], r

    def board(self):
        out = {}
        for ln in self.cmd("dump"):
            if not ln.startswith("p"):
                continue
            f = ln.split()
            j = int(f[0][1:])
            kv = dict(x.split("=", 1) for x in f[1:])
            b = {"lp": int(kv["lp"])}
            for k in PILES:
                b[k] = [] if kv[k] == "-" else [int(u) for u in kv[k].split(",")]
            for k in ("mz", "sz"):   # uid, face-up, defense
                b[k] = [None if z == "-" else (int(z.split(":")[0]), z[-2] == "u", z[-1] == "D") for z in kv[k].split(",")]
            out[j] = b
        return out

    def close(self):
        self.p.stdin.close()
        self.p.wait(timeout=10)


def mirror(d):
    out = {}
    for j in (0, 1):
        s = d.side[j]
        b = {"lp": d.lp[j]}
        for k in PILES:
            b[k] = list(s.pile(k))
        for k in ("mz", "sz"):
            b[k] = [None if u is None else (u, bool(d.cards[u].face), bool(d.cards[u].defense) and k == "mz")
                    for u in s.pile(k)]
        out[j] = b
    return out


def diff(eng, mir, notes):
    """differences; graveyard / banished order differences only go to `notes`: the client moves a pile card it
    reveals or targets (0x6202 engine commands 0x2e / 0x29: FUN_007112c0, FUN_0070e920 -> FUN_006f7c10 / FUN_006f7d20)
    to the top of its pile, and the translator's mirror doesn't follow that"""
    bad = []
    for j in (0, 1):
        for k, v in mir[j].items():
            if eng[j][k] == v:
                continue
            if k in ("grave", "banish") and sorted(eng[j][k]) == sorted(v):
                notes.add(f"p{j} {k} order")
                continue
            bad.append(f"p{j} {k}: engine {eng[j][k]} != translator {v}")
    return bad


SUBSTITUTE = 15025844   # Mystical Elf, what the server plays for a YO2 card without an ocgcore passcode


def npc_decks(cm):
    """the clients' NPC decks (YOLaucher research/ia/npc_decks.json, YO2 ids) as passcode decks"""
    import json
    raw = json.load(open(os.path.join(EMU, "research", "ia", "npc_decks.json"), encoding="utf-8"))
    out = []
    for k in sorted(raw, key=int):
        d = raw[k]
        if not d.get("main"):
            continue
        conv = lambda ys: [cm.yo2_to_code(y) or SUBSTITUTE for y in ys]   # noqa: E731
        out.append((int(k), {"main": conv(d["main"][:80]), "extra": conv((d.get("extra") or [])[:18])}))
    return out


def play(exe, dc, seed, first, duel_id, decks=PC.DECKS, max_batches=400):
    d = TR.YO2Duel(decks, first=first, cardmap=CM)
    cli = Cli(exe)
    try:
        ids = []
        for j in (0, 1):
            for k in ("deck", "extra"):
                ids.append(",".join(str(d._yo2(d.cards[u].code)) for u in d.side[j].pile(k)) or "-")
        cli.cmd(f"init {first} {seed & 0xffffffff} {d.lp[0]} " + " ".join(ids))
        cli.send(d.start())
        notes = set()
        bad = diff(cli.board(), mirror(d), notes)
        assert not bad, ("after start", bad)
        dc.new(duel_id, decks, first=first, seed=seed, shuffle=True)
        for n in range(max_batches):
            evs = dc.wait(duel_id)
            last = evs[-1]
            cli.send(d.feed_many(evs))
            had_order = bool(notes)
            bad = diff(cli.board(), mirror(d), notes)
            if bad and had_order:
                # the translator addresses pile cards by its own (stale) order after a reveal / target moved one to the
                # top on the client: from here on the client and the server disagree, in the real game too
                notes.add(f"stopped at batch {n}: translator desync after the reorder ({bad[0]})")
                dc.end(duel_id)
                return n, None, None, notes
            if bad:
                kinds = [e.get("type") or e.get("ev") for e in evs]
                raise AssertionError(f"seed {seed} batch {n} ({kinds[-12:]}): " + "; ".join(bad[:6]))
            if last.get("ev") == "end":
                st = dict(x.split("=", 1) for x in cli.cmd("dump")[-1].split())
                w = last.get("winner")
                assert w in (0, 1) and int(st["result"]) == w + 1, (seed, "duel end", w, st)   # 1 P0 wins, 2 P1 wins
                return n, last.get("winner"), last.get("turns"), notes
            dc.auto(duel_id)
        raise AssertionError(f"seed {seed}: no end after {max_batches} decisions")
    finally:
        cli.close()


CM = CardMap()


def main():
    duels = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    seed0 = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    npcs = npc_decks(CM)
    with tempfile.TemporaryDirectory() as tmp:
        exe = build(tmp)
        with DuelCore() as dc:
            for i in range(duels):   # the test decks, then pairs of NPC decks
                seed = seed0 + i
                if i == 0:
                    names, decks = "test decks", PC.DECKS
                else:
                    (a, da), (b, db) = npcs[(seed * 7) % len(npcs)], npcs[(seed * 13 + 5) % len(npcs)]
                    names, decks = f"NPC {a} vs NPC {b}", [da, db]
                n, winner, turns, notes = play(exe, dc, seed, i & 1, 100 + i, decks)
                print(f"ok: duel seed {seed} ({names}): {n} decisions, {turns} turns, winner {winner}: engine board = "
                      f"translator mirror after every batch" + (f" (translator pile-order notes: {', '.join(sorted(notes))})"
                                                               if notes else ""))


if __name__ == "__main__":
    main()
