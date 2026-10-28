"""Records NPC brain fixtures for test/duel-brain.test.ts: seeded duels played through py's duelcore (a node subprocess)
in brain mode with py's own research/ia/brain.py, logging every observe(ev) input and every choose(sel) input and
output. The TS NpcBrain (src/duel/brain) replays them with the same profile and seed and must answer the same.

  nice python3.12 -I scripts/brain_record.py [path/to/YOLaucher-web/tools/yo2emu] [--duels-per-npc N]

Two kinds of duel, driven like py ocg_duel.OcgSession (rule MR1, seed = randrange(1 << 30), NpcBrain(load_npc_profile(npc),
player=1, seed=seed); a retried select or a None answer goes to bot.ts with `auto`):
  - "npc": bot.ts plays the human side (player 0, a deterministic bot seeded by the duel seed), the brain player 1;
  - "bvb": brain against brain (players 0 and 1), to cover player=0 and the fixed PERFILES too.
Output: server/gamedata/fixtures/brain/*.jsonl.gz (gitignored: the duels carry Konami-derived decks and profiles).
Line 1 = header; then {"o": ev} (observe, every brain), {"c": player, "sel": sel, "r": answer} or {..., "x": error}.
"""
import gzip
import json
import os
import random
import sys
import time
from dataclasses import asdict

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "gamedata", "fixtures", "brain")
args = [a for a in sys.argv[1:] if not a.startswith("--")]
EMU = args[0] if args else os.path.join(os.path.expanduser("~"), "Documents", "GitHub", "YOLaucher-web", "tools", "yo2emu")
PER_NPC = int(next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--duels-per-npc=")), "2"))
for p in (os.path.join(EMU, "duelcore"), os.path.join(EMU, "research", "ia"), EMU):
    sys.path.insert(0, p)

from duelcore import DuelCore  # noqa: E402
import brain as B  # noqa: E402

MAX_DECISIONS = 3000          # py ocg_duel MAX_NPC_DECISIONS
RULE = "MR1"                  # py ocg_duel DUEL_RULE


def load_json(rel):
    with open(os.path.join(EMU, "research", "ia", rel), encoding="utf-8") as f:
        return json.load(f)


DECKS = load_json("npc_decks.json")
PROFILES = load_json("npc_profiles.json")


def deck(npc):
    d = DECKS[str(npc)]
    return {"main": [c for c in d["main_passcodes"] if c][:80], "extra": [c for c in d.get("extra_passcodes") or [] if c][:18]}


def pick_npcs():
    """Every NPC with a deck in the client (npc_decks.json), by id."""
    return sorted(int(k) for k in PROFILES if DECKS.get(k, {}).get("main_passcodes"))


def op(name):
    v = B.OP[name]
    return str(v)          # duelcore sends bigints that do not fit in 53 bits as strings


def synthetic(base, me, hand_codes):
    """Rare selects (seldom seen in real duels) built on a real select's board, to cover the brain's other rules."""
    def mk(t, **kw):
        s = {k: base[k] for k in ("ev", "id", "player", "retry", "turn", "turn_player", "phase", "lp", "view") if k in base}
        s.update(type=t, **kw)
        return s
    cards = [{"code": c, "controller": me, "location": 2, "sequence": i} for i, c in enumerate(hand_codes[:6])]
    lv = lambda c: (B.CardDB.shared().get(c["code"]).level if B.CardDB.shared().get(c["code"]) else 1) or 1  # noqa: E731
    out = [
        mk("ANNOUNCE_CARD", opcodes=[1, op("ISTYPE")]),
        mk("ANNOUNCE_CARD", opcodes=[4, op("ISTYPE"), 0x3b, op("ISSETCARD"), op("OR")]),
        mk("ANNOUNCE_CARD", opcodes=[46986414, op("ISCODE"), op("NOT"), op("GETATTRIBUTE"), 32, op("BAND"), op("AND"),
                                     op("ALLOW_ALIASES")]),
        mk("ANNOUNCE_CARD", opcodes=[op("GETCODE"), 7, op("DIV"), 3, op("SUB"), op("NEG"), 1000, op("LSHIFT"), 0, op("BXOR")]),
        mk("ANNOUNCE_CARD", opcodes=[op("GETRACE"), op("GETTYPE"), op("MUL"), op("BNOT"), 2, op("RSHIFT"), op("GETSETCARD"),
                                     op("BOR"), op("ALLOW_TOKENS")]),
        mk("ANNOUNCE_CARD", opcodes=[1, 2]),
        mk("ANNOUNCE_RACE", available=0xffffff, count=1),
        mk("ANNOUNCE_RACE", available=0x80000041, count=2),
        mk("ANNOUNCE_ATTRIB", available=0x7f, count=1),
        mk("ANNOUNCE_NUMBER", options=list(range(1, 13))),
        mk("ANNOUNCE_NUMBER", options=[1000, 2000, 3000, 4000]),
        mk("ANNOUNCE_NUMBER", options=[100, 200]),
        mk("ANNOUNCE_NUMBER", options=[]),
        mk("SELECT_SUM", amount=8, select_max=0, selects_must=[],
           selects=[dict(c, amount=lv(c)) for c in cards]),
        mk("SELECT_SUM", amount=6, select_max=1, selects_must=[dict(cards[0], amount=2)] if cards else [],
           selects=[dict(c, amount=lv(c) + (lv(c) + 1) * 0x10000) for c in cards[1:]]),
        mk("SELECT_SUM", amount=99, select_max=0, selects_must=[], selects=[dict(c, amount=1) for c in cards]),
        mk("SELECT_COUNTER", count=3, cards=[{"code": 1, "count": 2}, {"code": 2, "count": 5}]),
        mk("SELECT_DISFIELD", field_mask=0x00e000e0 | 0x1f1f, count=2),
        mk("SELECT_PLACE", field_mask=0xffffffff, count=1),
        mk("SELECT_PLACE", field_mask=0x60606060, count=3),
        mk("ROCK_PAPER_SCISSORS"), mk("ROCK_PAPER_SCISSORS"),
        mk("SORT_CARD", cards=cards), mk("SORT_CHAIN", cards=cards),
        mk("SELECT_FOO"),
        mk("SELECT_OPTION", options=[1, 2, 3], options_text=["Gain LP", None, "Special Summon it"]),
        mk("SELECT_CARD", min=1, max=2, selects=cards),
        mk("SELECT_TRIBUTE", min=2, selects=[dict(c, release_param=r) for c, r in zip(cards, (1, 0, 2, 1, 1, 1))]),
        mk("SELECT_UNSELECT_CARD", can_finish=False, select_cards=[], unselect_cards=cards[:1]),
        mk("SELECT_UNSELECT_CARD", can_finish=False, select_cards=cards, unselect_cards=[]),
        mk("SELECT_YESNO", description=1234), mk("SELECT_EFFECTYN", code=hand_codes[0] if hand_codes else 0),
    ]
    return out


def record(f, brain, p, sel, want=False):
    rec = {"c": p, "sel": sel}
    try:
        r = brain.choose(sel)
        rec["r"] = r
    except Exception as e:  # noqa: BLE001  (py's session would close the duel; here bot.ts carries on)
        r = None
        rec["x"] = repr(e)
    f.write(json.dumps(rec, separators=(",", ":")) + "\n")
    return r if want else 1


def play(dc, did, kind, brains, decks, seed, first, f):
    """brains: {player: NpcBrain}. Returns (choices, observes, end event)."""
    bot = [False, False] if kind == "bvb" else [True, False]
    dc.new(did, decks, first=first, seed=seed, shuffle=True, rule=RULE, bot=bot, brain=[p in brains for p in (0, 1)])
    n_c = n_o = decisions = errors = 0
    last_sel = {}
    while True:
        evs = dc.wait(did, timeout=300)
        last = evs[-1]
        for e in evs:
            if e.get("ev") == "msg":
                f.write(json.dumps({"o": e}, separators=(",", ":")) + "\n")
                n_o += 1
                for b in brains.values():
                    b.observe(e)
        ev = last.get("ev")
        if ev == "end":
            for p, sel in sorted(last_sel.items()):
                for syn in synthetic(sel, p, decks[p]["main"]):
                    n_c += record(f, brains[p], p, syn)
            return n_c, n_o, last
        if ev == "error":
            errors += 1
            if errors > 1:
                dc.end(did)
                while dc.wait(did, timeout=300)[-1].get("ev") != "end":
                    pass
                return n_c, n_o, last
            dc.auto(did)
            continue
        errors = 0
        p = last.get("player")
        if ev != "select" or p not in brains:
            dc.auto(did)
            continue
        decisions += 1
        if decisions > MAX_DECISIONS:
            dc.end(did)
            while dc.wait(did, timeout=300)[-1].get("ev") != "end":
                pass
            return n_c, n_o, {"ev": "end", "reason": "loop"}
        if last.get("retry"):
            dc.auto(did)
            continue
        last_sel[p] = last
        r = record(f, brains[p], p, last, want=True)
        n_c += 1
        if r is None:
            dc.auto(did)
        else:
            dc.respond(did, r, player=p)


def main():
    os.makedirs(OUT, exist_ok=True)
    for old in os.listdir(OUT):
        if old.endswith(".jsonl.gz"):
            os.remove(os.path.join(OUT, old))
    rng = random.Random(20261028)
    npcs = pick_npcs()
    plan = []   # (kind, {player: profile source}, [deck0 npc, deck1 npc])
    for k, n in enumerate(npcs):
        for _ in range(PER_NPC):
            plan.append(("npc", {1: {"npc": n}}, [npcs[(k + 5 + _) % len(npcs)], n]))
    plan.append(("npc", {1: {"npc": 999}}, [npcs[0], npcs[-1]]))        # no entry: por_nivel(2)
    for k, (a, b) in enumerate([("facil", "dificil"), ("normal", "facil"), ("dificil", "normal")]):
        plan.append(("bvb", {0: {"name": a}, 1: {"name": b}}, [npcs[k], npcs[-1 - k]]))
    for k in range(12):
        a, b = npcs[(7 * k + 1) % len(npcs)], npcs[(11 * k + 8) % len(npcs)]
        plan.append(("bvb", {0: {"npc": a}, 1: {"npc": b}}, [a, b]))
    tot_c = tot_o = 0
    t0 = time.time()
    with DuelCore() as dc:
        for i, (kind, srcs, dn) in enumerate(plan):
            seed = rng.randrange(1 << 30)
            first = i % 2
            brains, profs, seeds = {}, {}, {}
            for p, src in srcs.items():
                prof = B.load_npc_profile(src["npc"]) if "npc" in src else B.PERFILES[src["name"]]
                s = seed if p == 1 else seed ^ 0x5A5A5A5
                brains[p] = B.NpcBrain(prof if "npc" in src else src["name"], player=p, seed=s)
                profs[str(p)] = dict(src, perfil=asdict(prof))
                seeds[str(p)] = s
            name = f"{i:02d}_{kind}_" + "_".join(str(src.get("npc", src.get("name"))) for src in srcs.values())
            with gzip.open(os.path.join(OUT, name + ".jsonl.gz"), "wt", encoding="utf-8") as f:
                f.write(json.dumps({"kind": kind, "seed": seed, "first": first, "rule": RULE, "decks_of": dn,
                                    "brains": profs, "seeds": seeds}) + "\n")
                n_c, n_o, end = play(dc, i + 1, kind, brains, [deck(dn[0]), deck(dn[1])], seed, first, f)
            tot_c += n_c
            tot_o += n_o
            print(f"{name}: {n_c} choices, {n_o} msgs, end winner={end.get('winner')} reason={end.get('reason')} "
                  f"turns={end.get('turns')} ({time.time() - t0:.0f}s)", flush=True)
    print(f"{len(plan)} duels, {tot_c} choices, {tot_o} observes -> {OUT}")


if __name__ == "__main__":
    main()
