"""Social lobby messages (friends, black list, teams, mail, notices, trades) against YOLaucher's own server code:
research/lobby (friends, PID lookup, black list, mail, maintenance), research/equipos (teams between players),
research/intercambio (a whole two-player trade), research/torneos (EVENTINFO). The server functions run against fake
connections / HUB sessions; what each client would receive is framed with real sequence numbers and fed to src/Net.
Run: python3.12 -I tests/net_test_social.py   (after net_test.py's requirements)
"""
import importlib.util
import os
import struct
import sys
import tempfile
import threading
import types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import net_test  # noqa: E402
from net_test import EMU, W, compile_cli, frames, kv, run_script  # noqa: E402

import proto  # noqa: E402


def research(name):
    spec = importlib.util.spec_from_file_location(f"yo2_{name}", os.path.join(EMU, "research", name, "proposal.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


LP, EQ, TP, TOUR = research("lobby"), research("equipos"), research("intercambio"), research("torneos")
quiet = lambda *a: None


class Conn(net_test.Conn):
    def __init__(self, sess=None):
        super().__init__()
        self.sess = sess


class Hub:
    """The bits of pvp_hub.Hub the research modules call: sessions by pid, and posting to another client."""
    def __init__(self, *sess):
        self.lock = threading.Lock()
        self.sessions = {s.pid: s for s in sess}

    def by_pid(self, pid):
        return self.sessions.get(pid)

    def _post(self, s, mid, data=b"", pause=0):
        s.lobby.send(mid, data)

    def others(self, s):
        return []


def session(pid, name):
    s = types.SimpleNamespace(pid=pid, name=name, slot=0, state=0, lobby=None)
    s.lobby = Conn(s)
    return s


def s16(t):
    return W().s(t, 16).bytes()


def list1(pid, name):
    """A LIST1 record in bloques.block_player's layout (u32 id, name16, u8 lv, 4 x u16, u8, str4, u8 state, u8 block)."""
    return W().u32(pid).s(name, 16).u8(1).u16(0).u16(0).u16(0).u16(0).u8(0).s("ES", 4).u8(1).u8(0).bytes()


def client(exe, msgs, *calls, dumps=("social",)):
    lines = [f"call {c}" for c in calls] + ["rx lobby " + frames(msgs)] + [f"dump {d}" for d in dumps]
    out = run_script(exe, lines)
    bad = [l for l in out if l.startswith("rx ") and not l.endswith(" 0")]
    assert not bad, bad
    return out


def social(out):
    d = kv(next(l for l in out if l.startswith("social ")))
    d.update({"t_" + k: v for k, v in kv(next(l for l in out if l.startswith("trade "))).items()})
    d["flags"] = dict(x.split(":") for x in next(l for l in out if l.startswith("socflags")).split()[1:])
    d["teamname"] = next(l for l in out if l.startswith("teamname"))[9:]
    d["members"] = [l.split()[1:] for l in out if l.startswith("member ")]
    d["applies"] = [l.split()[1:] for l in out if l.startswith("apply ")]
    d["offers"] = [l.split()[1:] for l in out if l.startswith("offer ")]
    d["hooks"] = [l[5:] for l in out if l.startswith("hook ")]
    d["trunk"] = next(l for l in out if l.startswith("trunk "))[6:]
    d["limit"] = next(l for l in out if l.startswith("limit "))[6:]
    return d


def check_sendmail(exe):
    lines = subprocess_build(exe)
    (mid, param, data, ok), = proto.Reader().feed(bytes.fromhex(lines["lb.sendmail"]))
    want = W().u32(100051).bytes() + W().s("Reto", 32).bytes() + W().s("Duelo?", 512).bytes() + bytes(64)
    assert ok and mid == 0x4600 and data == want, data.hex()
    LP.install({"my_pid": lambda: 1000, "my_name": lambda: "Yo", "log": quiet})
    LP.MEM["mail"].clear()
    c = Conn()
    LP.h_sendmail(c, 0x4600, 1, data)   # the server reads it back
    m = LP.MEM["mail"][0]
    assert (m["to"], m["subject"], m["body"]) == (100051, "Reto", "Duelo?"), m


def subprocess_build(exe):
    import subprocess
    return dict(l.partition(" ")[::2] for l in subprocess.check_output([exe, "build"], text=True).splitlines())


def check_friends_mail_notices(exe):
    LP.install({"my_pid": lambda: 1000, "my_name": lambda: "Yo", "log": quiet})
    LP.FRIEND_ACCEPT_DELAY = 0
    LP.MEM.update(mail=[], black=[], friends=[])
    c = Conn()
    LP.h_reqfriend(c, 0x4510, 1, W().u32(100051).bytes())      # an NPC: accepts at once
    LP.h_getpid(c, 0x4500, 1, s16("Yugi Muto"))
    LP.h_black(c, 0x4530, 1, W().u32(5).bytes())
    LP.h_black(c, 0x4540, 1, W().u32(5).bytes())
    LP.h_sendmail(c, 0x4600, 1, W().u32(100051).bytes() + W().s("Reto", 32).bytes() + W().s("Duelo?", 512).bytes()
                  + bytes(64))
    LP.h_rcvmail(c, 0x4610, 1, b"")
    LP.h_mailcount(c, 0x4620, 1, b"")
    c.send(0x0004, W().u32(0).bytes())                           # yo2srv/lobby/lobby.py: keep-alive answer
    ids = [m for m, _ in c.sent]
    assert ids == [0x4511, 0x4515, 0x4501, 0x4531, 0x4541, 0x4601, 0x4603, 0x4611, 0x4612, 0x4613, 0x4621, 0x0004], ids
    d = social(client(exe, c.sent))
    assert (d["reqFriend"], d["friendAccepted"], d["friendPid"], d["friendName"]) == ("0", "1", "100051", "Yugi_Muto"), d
    assert "addfriend 100051 Yugi_Muto" in d["hooks"]
    assert (d["pidRes"], d["pid"], d["addBlack"], d["delBlack"]) == ("0", "100051", "0", "0"), d
    assert (d["sendMail"], d["mailList"], d["mailCount"], d["newMail"]) == ("0", "0", "0", "0"), d   # 0x4613 clears it
    f = d["flags"]
    assert all(f[k] == "2" for k in ("3d", "3e", "41", "42", "43", "44", "45", "46", "47")), f
    mail = next(h for h in d["hooks"] if h.startswith("mail "))
    m = kv("x " + mail[5:])
    assert (m["from"], m["fromName"], m["to"], m["toName"], m["subject"], m["valid"], m["read"], m["recvd"]) == \
        ("100051", "Yugi_Muto", "1000", "Yo", "Re:_Reto", "1", "0", "1"), m
    assert m["body"] == "Gracias_por_tu_carta._Te_espero_en_la_sala_de_duelo." and int(m["sent"]) > 1.7e9, m
    # name lookup miss, a pending-mail count, and the new-mail notice on its own
    c = Conn()
    LP.h_getpid(c, 0x4500, 1, s16("nadie"))
    c.send(0x4621, W().u32(3).bytes())
    d = social(client(exe, c.sent))
    assert (d["pidRes"], d["pid"], d["mailCount"], d["newMail"]) == ("1", "0", "3", "1"), d
    # player to player: A asks B; B gets FRIENDOFFER (deduped, black-listed senders dropped); B says yes / A asks again, no
    a, b = session(1000, "Ana"), session(1002, "Bea")
    hub = Hub(a, b)
    LP.install({"my_pid": lambda: 1000, "my_name": lambda: "Ana", "log": quiet, "HUB": hub})
    LP.h_reqfriend(a.lobby, 0x4510, 1, W().u32(1002).bytes())
    offer = b.lobby.sent[0]
    assert offer[0] == 0x4512 and offer[1] == W().u32(1000).bytes() + s16("Ana") + b"\0", offer
    black = (0x4512, W().u32(666).bytes() + s16("Malo") + b"\x07")   # same layout as h_reqfriend's
    d = social(client(exe, [offer, offer, black], "soc.black=666"))
    assert d["offers"] == [["1000", "Ana", "0"]] and d["flags"]["3f"] == "2", d
    LP.h_friendofferreply(b.lobby, 0x4513, 1, W().u32(1000).u32(1).bytes())
    LP.h_reqfriend(a.lobby, 0x4510, 1, W().u32(1002).bytes())
    LP.h_friendofferreply(b.lobby, 0x4513, 1, W().u32(1000).u32(0).bytes())
    notices = [m for m in a.lobby.sent if m[0] == 0x4515]
    d = social(client(exe, [m for m in a.lobby.sent if m[0] == 0x4511][:1] + notices[:1]))
    assert (d["friendAccepted"], d["friendPid"], d["friendName"]) == ("1", "1002", "Bea"), d
    d = social(client(exe, notices))
    assert (d["friendAccepted"], d["friendPid"], d["friendName"]) == ("0", "0", ""), d   # the "no" resets it
    # maintenance and events
    m = Conn()
    LP.install({"HUB": types.SimpleNamespace(lock=threading.Lock(), sessions={1: types.SimpleNamespace(lobby=m)}),
                "log": quiet})
    LP.maintenance_notice(600)
    ev = [(0x5000, TOUR.eventinfo(7, 6, 0xb)), (0x5000, TOUR.eventinfo(7, 6, 0xb)), (0x5000, TOUR.eventinfo(8, 3, 1))]
    d = social(client(exe, m.sent + ev, "soc.rgn=5"))
    assert (d["maint"], d["maintTime"], d["event"], d["flags"]["48"], d["flags"]["49"]) == ("600", "1", "7,11,1", "2", "2"), d
    assert d["hooks"] == ["maintenance", "menuevent 11", "eventeffect 1", "menuevent 11", "eventeffect 1",
                          "menuevent 1", "eventeffect 0"], d["hooks"]
    d = social(client(exe, ev, "soc.rgn=3", "soc.induel=1"))
    assert d["event"] == "0,0,0" and d["hooks"] == [] and d["flags"]["49"] == "0", d   # nothing during a duel
    d = social(client(exe, ev[2:], "soc.rgn=3"))
    assert d["event"] == "8,1,1", d                                # world 3 = our room's b1
    print("ok: friends (NPC and player to player), PID lookup, black list, mail list/count/notice, keep-alive, "
          "MAINTENOTICE, EVENTINFO from research/lobby + research/torneos")


def check_teams(exe):
    a, b, cc = session(1000, "Ana"), session(1002, "Bea"), session(1003, "Caro")
    hub = Hub(a, b, cc)
    EQ.MEM["equipos"] = {"next_id": 1, "teams": {}}
    EQ.PENDING.clear()
    EQ.install({"HUB": hub, "log": quiet})
    EQ.h_teamcreate(a.lobby, 0x4550, 1, s16("Dragones"))
    EQ.h_teamjoin(a.lobby, 0x4554, 1, W().u32(1002).bytes())
    invite = b.lobby.sent[-1]
    EQ.h_teamjoinreply(b.lobby, 0x4568, 1, W().u32(1).u32(1000).u32(1).bytes())
    EQ.h_teamjoin(a.lobby, 0x4554, 1, W().u32(1003).bytes())
    EQ.h_teamjoinreply(cc.lobby, 0x4568, 1, W().u32(1).u32(1000).u32(1).bytes())
    EQ.h_teamlist(a.lobby, 0x4558, 1, b"")
    EQ.h_teambanish(a.lobby, 0x4556, 1, W().u32(1003).bytes())
    EQ.h_teamleave(b.lobby, 0x4569, 1, b"")
    EQ.h_teamdisband(a.lobby, 0x4552, 1, b"")
    ids = [m for m, _ in a.lobby.sent]
    assert ids == [0x4551, 0x4566, 0x4571, 0x4561, 0x4561, 0x4564, 0x4559, 0x4565, 0x4562, 0x4570, 0x4553, 0x4560,
                   0x4571], [hex(i) for i in ids]
    roster = [(0x4211, W().u32(1).bytes()), (0x4212, list1(1000, "Ana") + list1(1002, "Bea") + list1(1003, "Caro")),
              (0x4213, b"")]
    # A's view, stopped right after the list
    out = client(exe, roster + a.lobby.sent[:8], "soc.ownpid=1000", dumps=("social", "lobby"))
    d = social(out)
    assert (d["teamCreate"], d["teamCreateEnd"], d["teamListEnd"], d["inTeam"], d["authority"], d["teamname"]) == \
        ("0", "0", "0", "1", "14", "Dragones"), d                  # AUTH_LEADER = 0x0e
    assert d["members"] == [["1000", "Ana", "14"], ["1002", "Bea", "0"], ["1003", "Caro", "0"]], d["members"]
    assert d["hooks"] == ["teamrefresh", "teamchat 5324 Bea", "teamchat 5324 Caro"], d["hooks"]
    assert (d["flags"]["84"], d["flags"]["88"], d["changed"]) == ("2", "2", "1"), d
    ana = kv(next(l for l in out if l.startswith("player pid=1000")))
    assert (ana["teamId"], ana["teamName"], ana["teamCode"]) == ("1", "Dragones", ""), ana
    d = social(client(exe, roster + a.lobby.sent[:10], "soc.ownpid=1000"))   # after the banish and the leave
    assert d["members"] == [["1000", "Ana", "14"]], d["members"]
    # the rest: disband, and the 0x4571 "no team" at the end
    d = social(client(exe, roster + a.lobby.sent, "soc.ownpid=1000"))
    assert d["members"] == [] and (d["teamDisband"], d["authority"], d["inTeam"], d["teamname"]) == ("0", "0", "0", ""), d
    assert d["flags"]["85"] == "105", d["flags"]                   # FUN_006bd220 writes 0x69, not 2
    assert d["hooks"][3:] == ["teamchat 5325 Caro", "teamchat 5326 Bea", "teamchat 5327 -", "teamrefresh"], d["hooks"]
    # B's view: the invitation (deduped by its second u32), joining, being in the team, leaving
    out = client(exe, roster + [invite, invite] + b.lobby.sent[1:], "soc.ownpid=1002", dumps=("social", "lobby"))
    d = social(out)
    assert d["applies"] == [["1000", "Ana", "1", "Dragones"]] and d["joinApplied"] == "1", d
    bea = kv(next(l for l in out if l.startswith("player pid=1002")))
    assert bea["teamId"] == "0" and d["inTeam"] == "0", (bea, d)   # left: 0x4571 team 0
    print("ok: teams (create, invite, join, list, banish, leave, disband) from research/equipos, both sides")


def check_trades(exe):
    a, b = session(1000, "Ana"), session(1002, "Bea")
    hub = Hub(a, b)
    ctx = types.SimpleNamespace(sess=None)
    profiles = {1000: {"trunk": {"5": 3}}, 1002: {"trunk": {"9": 2}}}

    def trunk_bytes(p):
        raw = bytearray(0xcb8)
        for k, n in p["trunk"].items():
            raw[int(k) - 1] = n
        return bytes(raw)

    def trunk_move(p, cards, sign):
        for cid in cards:
            p["trunk"][str(cid)] = p["trunk"].get(str(cid), 0) + sign

    pp = types.SimpleNamespace(profile=lambda st, slot: profiles[ctx.sess.pid], active_slot=lambda st: 0,
                               trunk_bytes=trunk_bytes, trunk_remove=lambda p, c: trunk_move(p, c, -1),
                               trunk_add=lambda p, c, src=None: trunk_move(p, c, 1))
    TP.TRADES.clear()
    TP.install({"HUB": hub, "CTX": ctx, "PP": pp, "load_state": lambda: {}, "save_state": lambda st: None, "log": quiet})
    t = lambda who, sub, body=b"": TP.h_trade(who.lobby, 0x7000, 1, struct.pack(">H", sub) + body)
    t(a, 0x7102, W().u32(1002).bytes())
    t(b, 0x7105, W().u32(1).bytes())
    t(a, 0x7132)
    t(b, 0x7132)
    t(a, 0x7101)
    t(b, 0x7101)
    t(a, 0x7113, W().u16(5).bytes())
    t(b, 0x7122)
    t(b, 0x7113, W().u16(9).bytes())
    t(a, 0x7122)
    t(b, 0x7114, W().u16(0).bytes())
    t(a, 0x7122)
    t(b, 0x7113, W().u16(9).bytes())
    t(a, 0x7122)
    t(a, 0x7117, b"\0")
    t(b, 0x7117, b"\0")
    confirm = struct.pack(">B10i10i", 1, 5, *[-1] * 9, 9, *[-1] * 9)
    t(a, 0x7119, confirm)
    t(b, 0x7119, struct.pack(">B10i10i", 1, 9, *[-1] * 9, 5, *[-1] * 9))
    assert profiles == {1000: {"trunk": {"5": 2, "9": 1}}, 1002: {"trunk": {"9": 1, "5": 1}}}, profiles
    out = client(exe, a.lobby.sent)
    d = social(out)
    assert (d["reqTrade"], d["offerReply"], d["addCard"], d["t_other"], d["t_own"], d["t_confirm"], d["t_end"]) == \
        ("0", "0", "0", "9,0,1", "0,0,1", "3", "1"), d             # last partner move: add 9; both ready
    f = d["flags"]
    assert all(f[k] == "2" for k in ("4f", "50", "52", "56", "59", "5a", "5b", "5c", "5d", "5f", "60", "62", "63")), f
    after = bytearray(0xcb8)
    after[4], after[8] = 2, 1
    assert d["trunk"] == after.hex() and d["limit"] == "00" * 0xcb8, d["trunk"][:40]
    assert d["hooks"].count("storetrunk") == 2, d["hooks"]          # the trunk before and after the trade
    d = social(client(exe, b.lobby.sent))
    assert (d["t_partner"], d["t_name"], d["t_offered"], d["t_cancelled"], d["delCard"]) == \
        ("1000", "Ana", "1", "0", "0"), d
    assert (d["flags"]["51"], d["flags"]["57"], d["t_other"]) == ("2", "2", "5,0,1"), d
    # the partner leaves mid-trade; and an offer withdrawn before the answer
    TP.TRADES.clear()
    a.lobby.sent.clear(), b.lobby.sent.clear()
    t(a, 0x7102, W().u32(1002).bytes())
    t(b, 0x7105, W().u32(1).bytes())
    t(a, 0x7112)
    assert b.lobby.sent[-1] == (0x7112, W().u32(1000).bytes()), b.lobby.sent
    d = social(client(exe, b.lobby.sent))
    assert (d["flags"]["5e"], d["t_cancelled"]) == ("2", "1"), d
    TP.TRADES.clear()
    b.lobby.sent.clear()
    t(a, 0x7102, W().u32(1002).bytes())
    t(a, 0x7108)
    d = social(client(exe, b.lobby.sent))
    assert (d["flags"]["54"], d["t_cancelled"]) == ("2", "1"), d
    # client layouts YOLaucher never sends (taken from the decompile): MOVEOWNCARD, and the empty handlers
    d = social(client(exe, [(0x7115, W().u16(7).u8(1).bytes()), (0x7107, b""), (0x7110, b""), (0x7111, b""),
                            (0x4555, b""), (0x4563, b""), (0x4521, W().u32(0).u32(1).u16(2).bytes())]))
    assert (d["t_own"], d["flags"]["58"], d["search"], d["flags"]["40"]) == ("7,1,0", "2", "0", "2"), d
    # a trunk chunk past the 7th is dropped instead of overrunning the table (ASan would flag the exe's behaviour)
    d = social(client(exe, [(0x7126, b"\x01" * 0x200)], "soc.chunk=7"))
    print("ok: a whole trade (offer, accept, trunk/limit tables, add/delete/arrive, ready, confirm, end) from "
          "research/intercambio for both players, user exit, withdrawn offer")


def main():
    with tempfile.TemporaryDirectory() as tmp:
        exe = compile_cli(tmp)
        check_sendmail(exe)
        print("ok: 0x4600 SENDMAIL byte for byte and read back by research/lobby h_sendmail")
        check_friends_mail_notices(exe)
        check_teams(exe)
        check_trades(exe)


if __name__ == "__main__":
    main()
