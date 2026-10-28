"""Lobby rooms / matches / chat / packs / matching server (src/Net/NetLobby_Rooms.cpp) against YOLaucher's lobby
module (research/lobby/proposal.py: room_entry, h_roomlist, h_chat, h_playerinfo, h_packlist, _cards_result,
h_watch, h_resetautowait, h_online and the 0x4302 / 0x43a0 / 0x4306 lines), research/persistencia (0x4140 spec),
yo2srv/mundo/avatar.py (0x5340) and pvp_hub's 0x4180 / 0x4181 relays.
Run: python3.12 -I tests/net_test_rooms.py
"""
import hashlib
import importlib.util
import os
import struct
import sys
import tempfile
import threading
import types

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import net_test as T  # noqa: E402
from net_test import W, Conn, frames, kv, run_script  # noqa: E402
from yo2srv.mundo import avatar, bloques  # noqa: E402
from yo2srv.tienda import cartera  # noqa: E402


def load(name, rel):
    sp = importlib.util.spec_from_file_location(name, os.path.join(T.EMU, rel))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


LP = load("yo2_lp", "research/lobby/proposal.py")
PP = load("yo2_pp", "research/persistencia/proposal.py")


def lines(out, tag):
    return [l for l in out if l.startswith(tag + " ")]


def one(out, tag):
    (l,) = lines(out, tag)
    return kv(l)


def setup_servers():
    """Fake run.py namespaces for LP / cartera / bloques / avatar; I am pid 1000 ("Yo")."""
    ctx = types.SimpleNamespace(sess=None)
    prof = {1001: {"lv": 9, "wins": 1, "losses": 2, "title": 3, "country": "FR"},
            1003: {"lv": 4, "wins": 0, "losses": 0, "title": 0, "country": "IT"}}
    pp = types.SimpleNamespace(rec_values=lambda p: p, profile=lambda st, slot, create=False: prof[ctx.sess.pid])
    hub = types.SimpleNamespace(avatar_of=lambda pid: ("Bea", 10, 20, 3), lock=threading.Lock(),
                                by_pid=lambda pid: types.SimpleNamespace(pid=pid))
    srv = types.SimpleNamespace(my_pid=lambda: 1000, wallet=lambda: {"dpp": 7, "mp": 5}, my_name=lambda: "Yo", CTX=ctx,
                                load_state=lambda: {}, my_slot=lambda st=None: 0, ns={"PP": pp}, PP=pp,
                                DEFAULT_COUNTRY="ES", log=lambda *a: None, HUB=hub,
                                hub_area=lambda name, default, s: default)
    for m in (cartera, bloques, avatar):
        m.setup(srv)
    LP.install({"my_pid": lambda: 1000, "my_name": lambda: "Yo", "LOBBY_PORT": 5732, "log": lambda *a: None,
                "PUBLIC_IP": "203.0.113.9", "DUEL_PORT": 5760, "HUB": hub})
    sess = lambda pid, name: types.SimpleNamespace(pid=pid, name=name, slot=0)
    return [bloques.block_player(1001, "Amigo", sess(1001, "Amigo")),
            bloques.block_player(1003, "Caro", sess(1003, "Caro"))]


def check_builders(exe):
    got = dict(l.split(" ", 1) for l in __import__("subprocess").check_output([exe, "build"], text=True).splitlines())
    md5 = lambda b: hashlib.md5(b).digest()
    exp = {"lb.reqmatch": (0x4300, struct.pack(">I", 1007) + md5(b"abc")),
           "lb.reqmatch_nopw": (0x4300, struct.pack(">I", 5) + md5(b"")),
           "lb.matchfriends": (0x3603, struct.pack(">IIII", 3, 1001, 1002, 1003))}
    for k, (mid, body) in exp.items():
        assert got[k] == __import__("proto").pack(mid, body, 1).hex(), (k, got[k])
    # what the server reads back: h_reqmatch's room id, h_online's pid list
    assert struct.unpack(">I", exp["lb.reqmatch"][1][:4])[0] == 1007
    print("ok: 0x4300 REQMATCH (MD5 of the password, also of an empty one) and 0x3603 friend list")
    return exp["lb.matchfriends"][1]


def main():
    with tempfile.TemporaryDirectory() as tmp:
        exe = T.compile_cli(tmp)
        req3603 = check_builders(exe)
        list1 = setup_servers()
        c = Conn(5740)
        c.send(0x4101, cartera.pselect_result())                          # my pid = 1000
        c.send(0x4211, W().u32(1).bytes())
        c.send(0x4212, b"".join(list1))
        c.send(0x4213)
        LP.MEM["rooms"] = {1007: {"id": 1007, "p1": 1001, "p2": 0, "mstat": 0, "dstyle": 3, "wmode": 1, "pw": True,
                                  "x": (1, 2, 3)},
                           1008: {"id": 1008, "p1": 1000, "p2": 0, "mstat": 1, "dstyle": 4, "wmode": 0, "pw": False,
                                  "x": (1, 1, 1)}}
        LP.h_roomlist(c, 0x4280, 1, b"\xff\xff\xff\xff")                  # 0x4282 + 0x4284 + 0x4286
        r7 = LP.MEM["rooms"][1007]
        c.send(0x3113, LP.room_entry(dict(r7, p2=1003, mstat=2)))         # update
        c.send(0x3113, LP.room_entry(dict(r7, id=1009, p1=1003)))         # new
        c.send(0x3113, LP.room_entry(dict(r7, id=4242, p1=0, p2=0)))      # delete of an unknown room: nothing
        n_rooms = len(c.sent)
        out = run_script(exe, ["rx lobby " + frames(c.sent), "dump rooms"])
        assert not [l for l in out if l.startswith("rx ") and not l.endswith(" 0")], out
        rooms = [l.split()[1:] for l in lines(out, "room")]
        assert rooms == [["1007", "1001", "1003", "2", "3", "1", "1", "0", "1,2,3"],
                         ["1008", "1000", "0", "1", "4", "0", "0", "1", "1,1,1"],
                         ["1009", "1003", "0", "0", "3", "1", "1", "0", "1,2,3"]], rooms
        st = one(out, "rooms")
        assert (st["count"], st["total"], st["own"], st["myRoom"], st["changed"]) == ("2", "2", "1", "1008", "1"), st
        # delete 1008 (mine): myRoom must not dangle; REQMATCH to 1009 copies its owner (1003, from LIST1)
        c.send(0x3113, LP.room_entry(dict(LP.MEM["rooms"][1008], p1=0, p2=0)))
        out = run_script(exe, ["rx lobby " + frames(c.sent), "call lb.reqmatch=1009,pw", "dump rooms"])
        assert [l.split()[1] for l in lines(out, "room")] == ["1007", "1009"]
        assert one(out, "rooms")["myRoom"] == "-1"
        assert "rival_after_reqmatch pid=1003 name=Caro level=4" in out, [l for l in out if "rival" in l]
        tx = next(l for l in out if l.startswith("tx "))[3:]
        assert tx == __import__("proto").pack(0x4300, struct.pack(">I", 1009) + hashlib.md5(b"pw").digest(), 1).hex()

        # matches: offer, cancel, timeout, results, duel server, auto duel, abort
        m = Conn()
        parts = bytes(range(16))
        m.send(0x4302, W().u32(100054).bytes() + LP._s("Seto Kaiba", 16) + W().u8(0).u8(7).u16(11).u16(12).bytes()
               + parts)                                                   # proposal.py _npc_challenge (+ level 7)
        m.send(0x4301, W().u32(0).bytes())                                # h_reqmatch
        m.send(0x4306, W().s("203.0.113.9", 15).u16(5760).bytes())        # _duel_notice
        m.send(0x4309, W().u32(0).bytes())                                # h_cancelmatch
        m.send(0x428a, W().u32(0).bytes())                                # h_createroom
        m.send(0x4292, W().u32(0xfffffe00).bytes())                       # ignored: no delete pending
        out = run_script(exe, ["rx lobby " + frames(m.sent), "dump rooms"])
        st, rv = one(out, "rooms"), one(out, "rival")
        assert (rv["pid"], rv["name"], rv["level"], rv["titleId"], rv["w116"], rv["avatar0"]) == \
            ("100054", "Seto_Kaiba", "7", "11", "12", parts.hex()), rv
        assert (st["watchState"], st["match"], st["duel"], st["cancel"], st["create"], st["delete"]) == \
            ("1", "0", "203.0.113.9:5760", "0", "0", "-150"), st   # delete: still pending (the constructor's -150)
        fl = dict(f.split(":") for f in next(l for l in out if l.startswith("rflags")).split()[1:])
        assert (fl["2c"], fl["2d"], fl["30"], fl["2f"], fl["2a"], fl["2b"]) == ("2", "2", "2", "2", "2", "0"), fl
        a = Conn()
        lv_title = W().u8(33).u16(44).u16(0).bytes()
        a.send(0x43a0, W().u32(1003).bytes() + LP._s("Caro", 16) + lv_title + parts[::-1] + bytes([1]))  # _auto_pair
        a.send(0x4308)
        a.send(0x4305)
        a.send(0x4292, W().u32(0).bytes())
        a.send(0x4310, W().u32(5).bytes())
        out = run_script(exe, ["call lb.flag=0x2b,1", "rx lobby " + frames(a.sent[:1]), "dump rooms",
                               "rx lobby " + frames(a.sent[1:], 2), "dump rooms"])
        assert "autoduel 1003" in out
        rv = kv(lines(out, "rival")[0])
        assert (rv["pid"], rv["name"], rv["level"], rv["titleId"], rv["avatar0"]) == \
            ("1003", "Caro", "33", "44", parts[::-1].hex()), rv
        st0, st = (kv(l) for l in lines(out, "rooms"))
        assert (st0["watchState"], st0["autoMode"], st["abort"], st["delete"]) == ("2", "1", "5", "0"), (st0, st)
        rv = kv(lines(out, "rival")[1])                                   # 0x4305 / 0x4310 reset the card (not the pid:
        assert (rv["name"], rv["level"], rv["titleId"]) == ("", "0", "0"), rv   # the exe's reset leaves +0xc)
        fl = dict(f.split(":") for f in lines(out, "rflags")[1].split()[1:]) if lines(out, "rflags") else \
            dict(f.split(":") for f in [l for l in out if l.startswith("rflags")][1].split()[1:])
        assert (fl["3b"], fl["2e"], fl["2f"], fl["2d"], fl["2b"], fl["31"]) == ("2", "2", "2", "0", "2", "2"), fl
        w = Conn()
        LP.h_watch(w, 0x4320, 1, struct.pack(">I", 1003))                 # no PvP: s32 1, empty server
        w.send(0x4321, W().u32(0).s("198.51.100.1", 15).u16(5761).bytes())   # h_watch's success line
        LP.h_resetautowait(w, 0x42a0, 1, b"")
        out = run_script(exe, ["rx lobby " + frames(w.sent[:1]), "dump rooms", "rx lobby " + frames(w.sent[1:], 2),
                               "dump rooms"])
        st0, st = (kv(l) for l in lines(out, "rooms"))
        assert (st0["watch"], st0["duel"]) == ("1", ":0") and (st["watch"], st["duel"], st["resetRes"]) == \
            ("0", "198.51.100.1:5761", "0"), (st0, st)
        print(f"ok: rooms 0x4282/0x4284/0x4286/0x3113 from h_roomlist + room_entry ({n_rooms} msgs), REQMATCH rival, "
              "0x4301/02/05/06/08/09/10, 0x428a/0x4292, 0x43a0, 0x4321, 0x42a2")

        # chat: our own 0x4400 through h_chat; the echo 0x4402 back in, then a whisper; in My Room nothing is logged
        out = __import__("subprocess").check_output([exe, "build"], text=True).splitlines()
        chat = next(l for l in out if l.startswith("lb.chat "))[8:]
        (_, _, body, _), = __import__("proto").Reader().feed(bytes.fromhex(chat))
        h = Conn()
        LP.h_chat(h, 0x4400, 1, body)
        whisper = W().u8(0).u8(3).u32(100051).u32(0).bytes() + LP._s("Yugi Muto", 16) + b"hola" + bytes(1)
        h.send(0x4402, whisper)
        out = run_script(exe, ["call lb.prefix=3,[W]_", "rx lobby " + frames(h.sent), "dump rooms"])
        # channel 2 shows prefix 0, which CNetLobby::clear sets to L"@0" (the UI sets real prefixes later)
        assert lines(out, "chat") == ["chat 2 1000 0 @0Yo:hello", "chat 3 100051 0 [W]_Yugi_Muto:hola"], lines(out, "chat")
        out = run_script(exe, ["call lb.rank=12", "rx lobby " + frames(h.sent), "dump rooms"])
        assert lines(out, "chat") == []
        print("ok: chat 0x4400 -> h_chat -> 0x4402 echo, whisper prefix, nothing in My Room")

        # player info / data / avatar / comments
        info_vals = list(range(1, len(LP.PLAYERINFO_FMT) + 1))
        wi = W()
        for i, (f, v) in enumerate(zip(LP.PLAYERINFO_FMT, info_vals)):
            if f == "s32":
                wi.u32(0 if i == 0 else v)
            elif f == "bytes16":
                wi.s("Info", 16)
            else:
                getattr(wi, f)(v)
        p = Conn()
        p.sent += c.sent[1:4]                                             # LIST1: 1001 and 1003 in the block
        LP.h_playerinfo(p, 0x4150, 1, struct.pack(">I", 1001))            # zeros + "Jugador 1001"
        p.send(0x4160, b"\0\0\0\0" + wi.bytes()[4:])                      # every field distinct, in PLAYERINFO_FMT order
        pdu = {k: i + 1 for i, (k, t) in enumerate(PP.PDU_SPEC)}
        pdu.update(npc_index=2, npc_b0=0xa1, npc_b1=0xa2, npc_b2=0xa3, npc_b3=0xa4)
        p.send(0x4140, PP.encode(PP.PDU_SPEC, pdu))
        p.send(0x5340, avatar.avatar_info(1003))
        p.send(0x4180, struct.pack(">IB", 1001, 1) + b"segunda".ljust(32, b"\0"))   # pvp_hub on_lobby_msg relay
        p.send(0x4181, struct.pack(">II", 1001, 1) + parts)
        p.send(0x4181, struct.pack(">II", 1001, 7) + parts)               # world out of range: ignored
        out = run_script(exe, ["rx lobby " + frames(p.sent[:4]), "dump rooms", "rx lobby " + frames(p.sent[4:], 5),
                               "dump rooms"])
        i0, i1 = (kv(l) for l in lines(out, "info"))
        assert (i0["pid"], i0["name"]) == ("1001", "Jugador_1001"), i0
        # PLAYERINFO_FMT positions: 0 s32, 1 pid, 2 name, 3 u8 level, 4 u32 +0xa8, 5 u32 +0xac, 6-20 15 x u16, ...
        assert (i1["pid"], i1["name"], i1["level"], i1["u0a8"], i1["mp"]) == ("2", "Info", "4", "5", "6"), i1
        w0 = i1["w0b0"].split(",")
        assert w0 == [str(v) for v in [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 47, 18, 19, 20, 21]], w0
        assert (i1["u0d0"], i1["u10c"], i1["w110"], i1["titleId"], i1["w116"], i1["u11c"]) == \
            ("22", "42", "43", "44", "45", "0,0,46,0"), i1
        me = kv(lines(out, "self")[-1])
        rec = {k: v for k, v in pdu.items()}
        assert (me["level"], me["u0a8"], me["mp"], me["titleId"], me["w116"]) == \
            tuple(str(rec[k] & 0xff if k == "lv" else rec[k]) for k in ("lv", "score", "mp", "title", "unk_116")), me
        assert me["u11c"] == f"0,0,{rec['tp']},0" and f"u1248 {rec['dpp']}" in out, me
        assert [l for l in out if l.startswith("npcbin ")][-1] == "npcbin " + "00" * 8 + "a1a2a3a4" + "00" * 4
        st = kv(lines(out, "rooms")[-1])
        assert st["avatar"] == "1003,Bea,10,20,3", st
        pl = {q["pid"]: q for q in (kv(l) for l in lines(out, "player"))}
        assert (pl["1001"]["title"], pl["1001"]["avatar1"]) == ("segunda", parts.hex()), pl["1001"]
        print("ok: 0x4160 (PLAYERINFO_FMT, distinct values), 0x4140 (PDU_SPEC + NPCBIN), 0x5340 avatar_info, "
              "0x4180/0x4181 relays")

        # packs and matching
        k = Conn()
        LP.h_packlist(k, 0x4901, 1, b"")
        LP._cards_result(k, [1, 2, 2, 3])
        LP._friend_where = lambda s: (5, 13, 2, 4, 1)
        LP.h_online(k, 0x3603, 1, req3603)
        out = run_script(exe, ["call lb.matchfriends", "rx lobby " + frames(k.sent), "dump rooms"])
        assert next(l for l in out if l.startswith("packs")) == "packs 1 2 3 4 5 6 7 8 9 10"
        assert next(l for l in out if l.startswith("packresult")) == "packresult 1:1 2:1 2:1 3:1"
        assert "hook storetrunk" in out and "trunk1-3 1 2 1" in out, [l for l in out if "trunk" in l]
        assert lines(out, "match") == [f"match {p} 1 13,5,2,4,1" for p in (1001, 1002, 1003)], lines(out, "match")
        assert one(out, "rooms")["matchingFound"] == "3"
        print("ok: 0x4800 h_packlist, 0x4803 _cards_result (+trunk), 0x3603 -> h_online -> 0x3604")


if __name__ == "__main__":
    main()
