"""Lobby Shop group (src/Net/NetLobby_Shop.cpp) against YOLaucher's own server builders: pack opening (persistencia
h_pack_open / lobby.py), DUELPASS (duelpass.reply), tournaments (research/torneos: Tour + info/status/timer/
pcounter/entry/list/endresult builders), USB DUELPASS / TP present / Startup Present / limitation lists (research/lobby),
ITEMGET (persistencia.itemget_result), shop (tienda.shop_catalog + its 0x5212 line), NPC info (mundo/npc.npc_entry).
Where the server never sends a message, the layout comes from the server's own description of the client reader.
Run: python3.12 -I tests/net_test_shop.py
"""
import importlib.util
import os
import struct
import subprocess
import sys
import tempfile
import threading
import types

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from net_test import EMU, W, Conn, compile_cli, frames, kv, run_script  # noqa: E402
import duelpass  # noqa: E402
from yo2srv.mundo import npc as npcmod  # noqa: E402
from yo2srv.tienda import tienda  # noqa: E402


def load(name, rel):
    sp = importlib.util.spec_from_file_location(name, os.path.join(EMU, rel))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


T = load("yo2_torneos", "research/torneos/proposal.py")
LP = load("yo2_lobbyp", "research/lobby/proposal.py")
PERS = load("yo2_pers", "research/persistencia/proposal.py")


def dumps(out):
    """Split a script's output into one dict per "dump shop": {"shop": kv, "flags": {}, "trunk": {}, ...}."""
    res, cur = [], None
    for line in out:
        head, _, rest = line.partition(" ")
        if head == "shop":
            cur = {"shop": kv(line), "lists": {}}
            res.append(cur)
        elif cur is None:
            continue
        elif head == "shopflags":
            cur["flags"] = {int(k, 16): int(v) for k, v in (f.split(":") for f in rest.split())}
        elif head == "trunk":
            cur["trunk"] = {int(k): int(v) for k, v in (f.split(":") for f in rest.split())}
        elif head == "pbin":
            cur["pbin"] = [int(x, 16) for x in rest.split()]
        elif head == "pack":
            cur["pack"] = [tuple(int(y) for y in f.split(":")) for f in rest.split()]
        elif head == "champs":
            cur["champs"] = kv(line)
        else:
            cur["lists"].setdefault(head, []).append(rest)
    return res


def check_packs(exe):
    # 0x4903 as persistencia h_pack_open builds it: u32 0, u32 0, then (u16 card, u8 new) per card
    pack_ok = W().u32(0).u32(0).u16(10).u8(1).u16(11).u8(0).bytes()
    dp_card = duelpass.reply(duelpass.RES_OK, {"carta": 10, "dpp": 30, "mazo": 7001})
    dp_err = duelpass.reply(duelpass.RES_OK - 1 if duelpass.RES_OK else 1, None)
    dp_8999 = duelpass.reply(duelpass.RES_OK, {"carta": 0, "dpp": 5, "mazo": 8999})
    present = W().u32(0).u16(40).u8(1).bytes()            # 0x4905: 0x4903 without the second u32 (FUN_006c0070)
    msgs = [(0x4903, pack_ok), (0x8102, dp_card), (0x8102, dp_err), (0x8102, dp_8999), (0x4905, present),
            (0x4903, W().u32(1).u32(0).bytes())]          # lobby.py: no pass -> s32 1, nothing added
    lines = ["call shop.owned=10:1", "call shop.pack=7001:0x300:20,21,22", "call shop.pack=8999:0:30,31"]
    for i, m in enumerate(msgs):
        lines += ["rx lobby " + frames([m], i + 1), "dump shop"]
    d = dumps(run_script(exe, lines))
    a = d[0]
    assert (a["shop"]["packOpenResult"], a["pack"], a["trunk"]) == ("0", [(0, 10, 1), (1, 11, 0)], {10: 1, 11: 1}), a
    assert (a["shop"]["dp"], a["shop"]["mp0"], a["shop"]["packOpened"], a["pbin"]) == ("150", "50", "1", [0x302, 0x304, 0x306])
    assert a["flags"][0x64] == 2 and a["shop"]["syncs"] == "1"
    b = d[1]
    assert (b["shop"]["dpCard"], b["shop"]["dpGain"], b["shop"]["dpPack"], b["shop"]["packGot"]) == ("10", "30", "7001", "1")
    assert b["pack"] == [(0, 20, 1), (1, 21, 1), (2, 22, 1)], b["pack"]      # the deck overwrites slot 0
    assert b["trunk"] == {10: 2, 11: 1, 20: 1, 21: 1, 22: 1} and 0x301 in b["pbin"], b
    assert (b["shop"]["dp"], b["shop"]["mp0"], b["flags"][0x67]) == ("180", "60", 2)   # +30 DP, 30 DP -> +10 MP
    c = d[2]
    assert (c["shop"]["dpAuthTries"], c["shop"]["dpCard"], c["shop"]["dp"]) == ("1", "0", "180"), c["shop"]
    e = d[3]
    assert (e["trunk"][30], e["trunk"][31], e["shop"]["dpGain"], e["shop"]["dp"]) == (3, 3, "1000", "1180")
    assert 0x246 in e["pbin"]
    f = d[4]
    assert (f["shop"]["presentPackResult"], f["pack"], f["trunk"][40], f["flags"][0x66]) == ("0", [(0, 40, 1)], 1, 2)
    g = d[5]
    assert (g["shop"]["packOpenResult"], g["trunk"], g["shop"]["dp"]) == ("1", f["trunk"], "1180"), g
    print("ok: 0x4903/0x4905 (persistencia h_pack_open format), 0x8102 x3 (duelpass.reply): trunk, DP/MP, PBIN rights")


def check_tour(exe):
    t = T.Tour(serial=3, day=2, name="CHAMPIONSHIP", max_players=8, now=0)
    t.seats = [{"pid": 1001, "name": "Amigo", "wins": 2, "alive": True, "playing": True},
               {"pid": 1002, "name": "Bea", "wins": 1, "alive": False, "playing": False}]
    t.state, t.phase, t.round, t.champion, t.runner_up = T.ST_ROUND, 2, 1, 1001, 1002
    simple = W().u32(0).u32(0).u32(0).bytes()
    msgs = [(T.M_INFO, T.info_msg(t)), (T.M_START, b""), (T.M_LOTTERY, W().u32(2).u8(1).bytes()),
            (T.M_LOTRESULT, W().u8(1).bytes()), (T.M_PHASE, W().u32(2).u8(0).bytes()),
            (T.M_ROUND, W().u32(2).u32(1).u8(1).bytes()), *T.entry_msgs(t), *T.list_msgs(t),
            (T.M_TIMER, T.timer_msg(types.SimpleNamespace(seconds_left=lambda: 77))), (T.M_PCOUNTER, T.pcounter_msg(t)),
            (T.M_STATUS, T.status_msg(t)), (T.M_CHKDUELSTART, W().u8(2).bytes()), (T.M_END, b""),
            # the "simple" entry list (no server sends it): 3 x u32, then (u8 wins, u8 status); u32 phase, u8 chunk, 8 x u16
            (T.M_SENTRY_START, simple), (T.M_SENTRY_DATA, bytes([5, 1, 6, 0])), (T.M_SENTRY_END, b""),
            (T.M_SLIST, W().u32(4).u8(1).bytes() + struct.pack(">8H", 0x81, 0x42, 0, 0, 0, 0, 0, 0))]
    n_before_end = len(msgs)
    msgs.append((T.M_ENDRESULT, T.endresult_msg(t)))
    out = run_script(exe, ["rx lobby " + frames(msgs[:n_before_end]), "dump shop",
                           "rx lobby " + frames(msgs[n_before_end:], n_before_end + 1), "dump shop"])
    d, e = dumps(out)
    c = d["champs"]
    assert (c["serial"], c["name"], c["day"], c["max"], c["rounds"]) == ("3", "CHAMPIONSHIP", "2", "8", "1"), c
    assert (c["lottery"], c["lotResult"], c["phaseState"], c["roundPhase"], c["round"], c["roundState"]) == \
        ("1", "1", "2", "2", "1", "1"), c
    assert (c["timer"], c["alive"], c["entries"], c["state"], c["phase"], c["subtitle"]) == \
        ("77", "1", "2", str(T.ST_ROUND), "4", str(t.subtitle())), c     # 0x5119 left phase 4
    entries = d["lists"]["entry"]
    assert entries[0].split()[:5] == ["0", "pid=1001", "name=Amigo", "wins=5", "status=1"], entries   # simple data
    assert entries[1].split()[:5] == ["1", "pid=1002", "name=Bea", "wins=6", "status=0"], entries
    pages = d["lists"]["page"]   # page 0 from 0x5111 (side 0x80: 1 else 2, playing 0x40: 1 else 2), then 0x5119 page 40
    p0 = pages[0].split()
    side = lambda st: 1 if T.BIT80_ALIVE and st["alive"] else 2
    assert p0[:4] == ["0", "2", f"1001:{side(t.seats[0])}:1:2", f"1002:{side(t.seats[1])}:2:1"], p0
    assert p0[4:] == ["0:2:2:0"] * 6, p0                     # empty slots: bits 0
    assert pages[1].split()[:4] == ["40", "0", "0:1:2:1", "0:2:1:2"], pages
    fl = d["flags"]
    assert all(fl[k] == 2 for k in (0x69, 0x6a, 0x6b, 0x6c, 0x6d, 0x6e, 0x6f, 0x70, 0x71, 0x72, 0x73, 0x74, 0x76, 0x77, 0x78)), fl
    assert d["shop"]["tourDuelStart"] == "2"
    c = e["champs"]
    assert (c["champion"], c["runnerUp"], c["entries"], e["flags"][0x75]) == ("Amigo", "Bea", "2", 2), c
    print("ok: tournament 0x5100-0x5120 from research/torneos (Tour + its message builders)")


def check_misc(exe):
    usb_ok = (struct.pack(">ib", 0, 7) + struct.pack(">HB", 50, 1) + struct.pack(">HB", 51, 0) +
              struct.pack(">HB", 52, 1) + bytes([20]))       # research/lobby h_usbdpauth docstring layout
    mileage = W().u32(100).u16(1).u16(1).u16(30).u32(200).u16(2).u16(2).u16(10).u32(300).u16(3).u16(3).u16(20).bytes()
    srv = types.SimpleNamespace(shop_prices=lambda: {}, packinfo_packs=lambda: [(5, 0, None), (7001, 1, 0x302)],
                                SHOP_CARDS=[42], ns={}, SHOP_SELL_PRIZE_PACKS=False)
    tienda.setup(srv)
    items = tienda.shop_catalog()
    bought = W().u32(0)                                       # tienda.shop_buy's 0x5212 line
    for iid, k, card, new in [(1, 1, 60, 1), (3, 0, 42, 0), (9, 2, 0x400, 1)]:
        bought.u32(iid).u8(k).u32(card).u8(new).u8(0).u8(0).u8(0)
    c = Conn()
    LP.TPPRESENT, LP.TP_PRESENT_CARD = True, 1234
    LP.h_tppresentinfo(c, 0x8301, 1, b"")
    valid = sorted(LP._valid_cards())[:3]
    LP.h_startup_present(c, 0x8401, 1, bytes([3]) + struct.pack(">3H", *valid))
    tp_err = bytes.fromhex("00000001000000000000000000")   # research/lobby/auto_overrides.json 0x8304 (13 B)
    tp_ok = W().u32(0).u8(0).u16(70).u16(71).u16(0).u16(0).bytes()
    npcsrv = types.SimpleNamespace(npc_rule=lambda r: False, NR=None, NPCS=[])
    npcmod.setup(npcsrv)
    npcs = npcmod.npc_entry(51, "Jaden", 7, bytes(range(16))) + npcmod.npc_entry(52, "Syrus", 9)
    LP.UNRELEASED = (5, 6)
    limits = LP.limitation_msgs()
    deck = W().u32(0).bytes() + bytes(range(128)) + bytes(range(256)) * 2   # 0x4182: s32, 128 B, 512 B
    msgs = [(0x8204, struct.pack(">i", 1)), (0x8204, usb_ok), (0x5201, mileage), (0x5203, W().u32(0).bytes()),
            (0x5213, b""), (0x5209, b"".join(items)), (0x5214, b""), (0x5215, b""), (0x5212, bought.bytes()),
            (0x5216, b""), (0x5211, W().u32(0).bytes()),
            (0x5310, struct.pack(">IBB", 1001, 3, 4)), (0x5401, W().u32(0).u16(80).u16(81).bytes()),
            *c.sent, (0x8304, tp_err), (0x8304, tp_ok), (0x5205, PERS.itemget_result([0x30e, 0x3ff], [90, 91])),
            (0x4231, W().u32(2).bytes()), (0x4232, npcs), (0x4233, b""), (0x4237, W().u32(3).bytes()),
            *limits, (0x4182, deck)]
    out = run_script(exe, ["call lb.record=1", "call shop.owned=51:2", "rx lobby " + frames(msgs), "dump shop"])
    assert not [l for l in out if l.startswith("rx ") and not l.endswith(" 0")], out
    d, = dumps(out)
    s = d["shop"]
    assert (s["usbDpAuthResult"], s["dpAuthTries"], s["usbB"], s["usbCard"], s["usbNew"], s["usbGain"], s["usbPackGot"]) == \
        ("0", "1", "7", "50,51,52", "1,0,1", "20", "1"), s
    assert (s["mp0"], s["dp"]) == ("30", "20"), s     # USB: +30 MP, +DP from the message
    assert [l.split()[1] for l in d["lists"]["mileage"]] == ["200", "300", "100"], d["lists"]["mileage"]
    want_items = [struct.unpack(">IBIIBBBB", i) for i in items]
    assert [tuple(int(x) for x in l.replace(",", " ").split()) for l in d["lists"]["item"]] == want_items
    assert d["lists"]["bought"] == ["1 1 60 1 0,0,0", "3 0 42 0 0,0,0", "9 2 1024 1 0,0,0"], d["lists"]["bought"]
    assert d["lists"]["mark"] == ["1001 0403"] and s["markCount"] == "1"
    assert (s["sdGet"], s["tpVictoryCard"], s["startup"], s["tpCardGet"], s["purchaseResult"], s["shopResult"]) == \
        ("0", "1234", "0", "0", "0", "0"), s
    tr = d["trunk"]
    assert all(tr.get(k) == 1 for k in (50, 51, 52, 60, 42, 80, 81, 70, 71, 90, 91, *valid)) and 0x400 not in tr, tr
    assert 0x30e in d["pbin"] and 0x3ff in d["pbin"], d["pbin"]
    assert d["lists"]["newitem"] == ["470 782", "470 1023", "480 90", "480 91"], d["lists"]["newitem"]
    npc = d["lists"]["npc"]
    assert npc[0].split() == ["51", "Jaden", bytes(range(16)).hex(), "0", "0", "0", "0", "7", "0", "0"], npc
    assert npc[1].split()[:2] == ["52", "Syrus"] and s["npcInfoCount"] == "2" and s["npcPresentType"] == "3"
    want_lim = [struct.unpack(">IIIB", m[1][i:i + 13]) for m in limits if m[0] == 0x5600 for i in range(0, len(m[1]), 13)]
    got_lim = [tuple(int(x) for x in l.split()) for l in d["lists"]["limit"]]
    assert got_lim == sorted(want_lim), (got_lim[:3], want_lim[:3])
    want_un = [struct.unpack(">III", m[1][i:i + 12]) for m in limits if m[0] == 0x5601 for i in range(0, len(m[1]), 12)]
    assert [tuple(int(x) for x in l.split()) for l in d["lists"]["unrel"]] == want_un and len(want_un) == 2, want_un
    assert d["lists"]["limitcount"] == ["%d 2" % len(want_lim)]
    assert d["lists"]["deck"] == [bytes(range(128)).hex() + " " + (bytes(range(256)) * 2).hex()]
    fl = d["flags"]
    assert all(fl[k] == 2 for k in (0x4b, 0x4d, 0x7a, 0x7b, 0x7c, 0x7d, 0x7e, 0x7f, 0x80, 0x81, 0x82, 0x83)), fl
    print("ok: 0x8204, mileage, shop 0x5209-0x5216 (tienda), 0x5310, 0x5401, TP/Startup present (research/lobby), "
          "ITEMGET (persistencia), NPC info (npc_entry), limitation lists, SAVE_DECK")


def check_builds(exe):
    got = dict(l.partition(" ")[::2] for l in subprocess.check_output([exe, "build"], text=True).splitlines())
    import proto
    assert got["lb.itemget"] == proto.pack(0x5204, struct.pack(">HI", 1, 5), 1).hex()
    assert got["lb.itemget4"] == proto.pack(0x5204, struct.pack(">HI", 4, 5), 1).hex()
    assert got["itemget4.result"].split() == ["01000000", "1"], got["itemget4.result"]   # byte 3 set, flag untouched
    assert got["shopresult_clears.result"] == "0"
    print("ok: ITEMGET 0x5204 builder; REQSHOPRESULT empties the purchase list")


def main():
    with tempfile.TemporaryDirectory() as tmp:
        exe = compile_cli(tmp)
        check_builds(exe)
        check_packs(exe)
        check_tour(exe)
        check_misc(exe)


if __name__ == "__main__":
    main()
