"""The lobby's one-request tasks (src/Net/NetLobbyRequests.cpp) stepped frame by frame against YOLaucher's
lobby.lobby_reply with research/lobby (rooms, matches, mail, PID lookup) and research/lobby's trade table.
Run: python3.12 -I tests/net_test_lobbyreq.py
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import net_test as T  # noqa: E402
from net_test import kv  # noqa: E402
from net_test_tasks import Server, lobby_server  # noqa: E402


class Frames:
    """Server steps 'call tasks.frame'; these tasks run under their own root, stepped by 'call lr.frame'."""
    def __init__(self, live):
        self.live = live

    def __call__(self, cmd):
        return self.live("call lr.frame" if cmd == "call tasks.frame" else cmd)


def lr(out):
    return kv(next(l for l in out if l.startswith("lr create=")))


def run(srv, task, cond, frames=20):
    seen = []
    for _ in range(frames):
        out = srv.frame()
        seen += out
        st = lr(out)[task].split(",")
        if cond(st):
            return st, seen
    raise AssertionError(f"{task} never got there: {seen[-4:]}")


def finished(st):
    return st[1] in ("2", "3")


def check(exe):
    live = T.Live(exe)
    out = live("call lr.spawn")
    assert out[0] == "lr spawned CNetLobby_CreateRoom CNetLobby_RecvMail CNetLobbyTask", out   # TradeCancel's own name
    frames = Frames(live)
    srv = Server(frames, "lobby", lobby_server({"players": {"0": "Player1"}}))
    srv.conn.port, srv.conn.rank = 5740, 13
    st = lr(frames("call lr.frame"))
    assert all(v.split(",")[:2] == ["1", "0"] for v in st.values()), st             # all idle

    # create a room (unlocked, not auto): 0x4288 -> 0x428a 0 + 0x3113 (the room arrives in the list)
    assert frames("call lr.create=3,0,0,")[0] == "accepted 1"
    assert frames("call lr.create=3,0,0,")[0] == "accepted 0"                       # busy
    st, _ = run(srv, "create", finished)
    assert st[1:] == ["2", "0"] and srv.got[-1] == 0x4288, (st, [hex(m) for m in srv.got])
    out = live("dump rooms")
    room = next(l for l in out if l.startswith("room ")).split()
    assert room[2] == "1000", room                                                   # p1 = me
    rid = int(room[1])
    run(srv, "create", lambda s: s[1] == "0")

    # offer: a pid with no listed room fails at once (-495) without sending; my own room is refused by the server
    # (h_reqmatch: not another player's room nor an NPC's -> 0x4301 1), and that is still "done" (the scene reads
    # matchResult)
    n = len(srv.got)
    assert frames("call lr.offer=4242,7")[0] == "accepted 1"
    st, _ = run(srv, "offer", finished)
    assert st[1:3] == ["3", "-495"] and len(srv.got) == n, st
    run(srv, "offer", lambda s: s[1] == "0")
    assert frames(f"call lr.offer=1000,{rid},abc")[0] == "accepted 1"
    st, _ = run(srv, "offer", finished)
    assert st[1:] == ["2", "1", "1"] and srv.got[-1] == 0x4300, st
    run(srv, "offer", lambda s: s[1] == "0")

    # cancel the challenge (0x4304 -> 0x4309 0), answer one (0x4303, no reply: done next frame)
    for verb, task, mid in (("offercancel", "ocancel", 0x4304), ("reply=1", "reply", 0x4303)):
        assert frames(f"call lr.{verb}")[0] == "accepted 1"
        st, _ = run(srv, task, finished)
        assert st[1:] == ["2", "0"] and srv.got[-1] == mid, (verb, st)
        run(srv, task, lambda s: s[1] == "0")

    # delete my room: 0x4290 -> 0x4292 0 (+ 0x3113 with p1 = p2 = 0): no room of mine any more
    assert frames("call lr.delete")[0] == "accepted 1"
    st, _ = run(srv, "delete", finished)
    assert st[1:] == ["2", "0"] and srv.got[-1] == 0x4290, st
    out = live("dump rooms")
    r = kv(next(l for l in out if l.startswith("rooms ")))
    assert (r["own"], r["myRoom"]) == ("0", "-1"), r
    run(srv, "delete", lambda s: s[1] == "0")

    # the mail window: my own name (found), the mail count, receive mail
    for verb, mid in (("pidbyname=Yo", 0x4500), ("mailcount", 0x4620), ("rcvmail", 0x4610)):
        assert frames(f"call lr.{verb}")[0] == "accepted 1"
        st, _ = run(srv, "mail", finished)
        assert st[1:] == ["2", "0"] and srv.got[-1] == mid, (verb, st)
        run(srv, "mail", lambda s: s[1] == "0")
    # the friend search sends nothing (an empty builder in the exe) and waits for request byte 0x40
    n = len(srv.got)
    assert frames("call lr.searchfriends")[0] == "accepted 1"
    for _ in range(3):
        srv.frame()
    assert len(srv.got) == n and lr(frames("call lr.frame"))["mail"].split(",")[:2] == ["3", "1"]
    frames("call lb.flag=0x40,2")
    st, _ = run(srv, "mail", finished)
    assert st[1] == "2", st                                                          # results[0x24] pending = 0

    # the trade-offer cancel (0x7000/0x7108): research/lobby answers 0x7109
    assert frames("call lr.tradecancel")[0] == "accepted 1"
    st, _ = run(srv, "tcancel", finished)
    assert st[1:] == ["2", "0"] and srv.got[-1] == 0x7000, st

    # answered(k): only the bytes in each table
    frames("call lb.flag=0x2f,2")                                                   # 0x1c + 0x13
    assert frames("call lr.answered=offer,0x13")[0] == "answered 0"
    assert frames("call lr.answered=tcancel,0x13")[0] == "answered 1"
    frames("call lb.flag=0x48,2")                                                   # 0x1c + 0x2c
    assert frames("call lr.answered=delete,0x2c")[0] == "answered 1"
    assert frames("call lr.answered=delete,0x2c")[0] == "answered 0"                # cleared
    live.close()
    print("ok: CNetLobby_CreateRoom / DeleteRoom / OfferRoom (-495 / server refusal) / OfferCancel / ReplyDuel / RecvMail / "
          "TradeCancel against lobby.lobby_reply + research/lobby; answered(k) tables")


def main():
    with tempfile.TemporaryDirectory() as tmp:
        check(T.compile_cli(tmp))


if __name__ == "__main__":
    main()
