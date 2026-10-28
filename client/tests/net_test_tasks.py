"""The Net tasks (src/Net/Net*Task.cpp) stepped frame by frame against YOLaucher's own server handlers: each packet
the task sends goes to the handler (puerta.gate_reply, ...) and whatever the handler sends back is fed in, numbered
like a real connection. UI calls (dialogs, sprite layers, app events) are stubs that print.
Run: python3.12 -I tests/net_test_tasks.py
"""
import os
import struct
import sys
import tempfile
import threading
import types

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import net_test as T  # noqa: E402
from net_test import W, Conn, kv  # noqa: E402
import proto  # noqa: E402
from yo2srv.cuentas import personajes  # noqa: E402
from yo2srv.lobby import lobby as lobby_mod  # noqa: E402
from yo2srv.mundo import bloques  # noqa: E402
from yo2srv.red import puerta  # noqa: E402
from yo2srv.tienda import cartera  # noqa: E402
from net_test_social import research  # noqa: E402

cifrado = T.cifrado
USER, PASS = T.USER, T.PASS


class Server:
    """One connection's server side: answers the client's packets with handler(conn, id, param, data)."""
    def __init__(self, live, name, handler):
        self.live, self.name, self.handler = live, name, handler
        self.conn, self.seq, self.got = Conn(), 0, []

    def frame(self):
        out = self.live("call tasks.frame")
        for l in out:
            if l.startswith("tx ") and len(l) > 3:
                for mid, param, data, ok in proto.Reader().feed(bytes.fromhex(l[3:])):
                    assert ok
                    self.got.append(mid)
                    n = len(self.conn.sent)
                    self.handler(self.conn, mid, param, data)
                    replies = self.conn.sent[n:]
                    if replies:
                        out += self.live(f"rx {self.name} " + T.frames(replies, self.seq + 1))
                        self.seq += len(replies)
        return out


def gate_server():
    hub = types.SimpleNamespace(lock=threading.Lock(), blocks={})
    puerta.setup(types.SimpleNamespace(PUBLIC_IP="203.0.113.7", GAME_PORT=5731, LOBBY_PORT=5732, GATE_PAUSE=0,
                                       ROOM_KINDS=puerta.ROOM_KINDS, ROOM_PORT_BASE=5740, ROOM_LANG_PORT_BASE=5800,
                                       HUB=hub, ns={}, room_lang=lambda lang: lang))
    return puerta.gate_reply


def state_of(out, tag="gtask"):
    return kv(next(l for l in out if l.startswith(tag + " ")))


def check_gate_task(exe):
    live = T.Live(exe)
    out = live("call gtask.spawn")
    assert "gtask spawned state=0 elm=CNetGateTask::m_elm" in out, out
    srv = Server(live, "gate", gate_server())
    states = []
    for _ in range(12):
        out = srv.frame()
        states.append(int(state_of(out)["state"]))
    assert srv.got == [0x2005, 0x0003], [hex(m) for m in srv.got]
    assert states[:6] == [2, 3, 4, 5, 9, 9], states            # connect, connected, version, list, bye, idle
    out = live("dump gate")
    g = kv(next(l for l in out if l.startswith("gate ")))
    assert (g["listing"], g["list"]) == ("0", "1") and len([l for l in out if l.startswith("srv ")]) == 90
    live.close()

    # refused version: dialog with 0x119d, OK (click) -> done
    live = T.Live(exe)
    live("call gtask.spawn")
    refuse = lambda c, mid, param, data: c.send(0x2002, W().u32(1).bytes()) if mid == 0x2005 else None
    srv = Server(live, "gate", refuse)
    seen = []
    for _ in range(5):
        out = srv.frame()
        seen += out
    assert "dialog open 352 304 fa2 text=119d" in seen, seen
    assert state_of(out)["state"] == "7"
    live("call tasks.dialog=4000")
    out = srv.frame()
    assert "sound 10000001 0" in out and state_of(out)["state"] == "8"
    out = srv.frame()
    assert state_of(out) == {"state": "9", "done": "1", "error": "119d"}
    live.close()

    # the socket never connects: 0x119c
    live = T.Live(exe)
    live("call gtask.spawn")
    srv = Server(live, "gate", lambda *a: None)
    live("call tasks.connstate=1")                # still connecting when the first frame looks
    srv.frame()
    live("call tasks.connstate=-1")
    out = srv.frame() + srv.frame()
    assert "dialog open 352 304 fa2 text=119c" in out, out
    live.close()
    print("ok: CNetGateTask against puerta.gate_reply (0x2005 -> list -> 0x0003), refused version, connect failure")


def account_server(st, users):
    """personajes.game_reply with a HUB whose login checks the 0x3003 blob like pvp_hub (cifrado.verify)."""
    def login(c, data):
        u = cifrado.decrypt(data)
        if users.get(u.usuario) is None or cifrado.resumen(u.usuario, users[u.usuario]) != u.resumen:
            c.send(0x3004, W().u32(-240 & 0xffffffff).u32(0).s("", 4).bytes())
            c.closed = True                         # like pvp_hub.Hub.reject: refused and closed
            return None
        c.sess = types.SimpleNamespace(user=u.usuario)
        return c.sess
    srv = types.SimpleNamespace(HUB=types.SimpleNamespace(login=login), CTX=types.SimpleNamespace(sess=None), PH=None,
                                PH_GAME={}, GAME_PORT=5731, load_state=lambda: st, save_state=lambda s: None,
                                STATE_LOCK=threading.Lock(), archive_profile=lambda *a: None,
                                player_entry=personajes.player_entry, sync_player_id=lambda: None,
                                auto_reply=lambda c, mid: False, log=lambda *a: None,
                                pvp_hub=types.SimpleNamespace(AUTH_SERVER_FULL=-200))
    for k in ("playerlist_0x3010", "regplayer_0x3020", "delplayer_0x3030", "trunk_0x3100", "pbin_0x3114"):
        setattr(srv, k, getattr(personajes, k))
    personajes.setup(srv)
    return personajes.game_reply


def run_until(srv, live, tag, cond, frames=40):
    """Frames until cond(state dict); returns (state, all output)."""
    seen = []
    for _ in range(frames):
        out = srv.frame()
        seen += out
        st = state_of(out, tag)
        if cond(st):
            return st, seen
    raise AssertionError(f"{tag} never got there: {seen[-6:]}")


def with_gate_list(live):
    """The account task connects to the gate list's account server: give the gate puerta's list first."""
    g = Conn()
    gate_server()(g, 0x2005, 1, b"Ver.080912.00")
    live("rx gate " + T.frames(g.sent))


def check_account_task(exe):
    st = {"players": {"0": "Player1"}}
    live = T.Live(exe)
    with_gate_list(live)
    assert live("call atask.spawn")[0] == "atask spawned 1"
    srv = Server(live, "account", account_server(st, {USER: PASS}))
    srv.conn.port = 5731
    run_until(srv, live, "atask", lambda s: s["busy"] == "0")     # START -> IDLE
    assert live(f"call atask.login={USER},{PASS}")[0] == "accepted 1"
    done, _ = run_until(srv, live, "atask", lambda s: s["busy"] == "2")
    assert srv.got == [0x3001, 0x3003, 0x3010], [hex(m) for m in srv.got]
    out = live("dump account")
    assert kv(next(l for l in out if l.startswith("slot0")))["name"] == "Player1"
    assert live("call atask.login=x,y")[0] == "accepted 0"          # still busy (done) for this one frame
    run_until(srv, live, "atask", lambda s: s["busy"] == "0")

    # create a character in slot 2: a name of 3 characters is refused, 5 is sent
    assert live("call atask.create=2")[0] == "accepted 1"
    _, seen = run_until(srv, live, "atask", lambda s: s["state"] == "22")
    assert "input open 344 312 mode=1 text=c28" in seen, seen
    live("call tasks.input=4002,abc")
    srv.frame()
    live("call tasks.input=4002,Nuevo")
    done, _ = run_until(srv, live, "atask", lambda s: s["busy"] in ("2", "3"))
    assert done["busy"] == "2" and st["players"]["2"] == "Nuevo" and srv.got[-1] == 0x3020, (done, st)
    run_until(srv, live, "atask", lambda s: s["busy"] == "0")

    # delete slot 2: wrong password -> 0xc27 and failure; right one -> yes -> 0x3030 -> "deleted" -> done
    assert live("call atask.delete=2")[0] == "accepted 1"
    _, seen = run_until(srv, live, "atask", lambda s: s["state"] == "13")
    assert "input open 332 324 mode=4 text=c26" in seen
    live("call tasks.input=4002,mala")
    _, seen = run_until(srv, live, "atask", lambda s: s["state"] == "30")
    assert "sound 10000001 0" in seen and "dialog open 344 312 fa2 text=c27" in seen, seen
    live("call tasks.dialog=4000")
    done, _ = run_until(srv, live, "atask", lambda s: s["busy"] in ("2", "3"))
    assert done["busy"] == "3", done
    run_until(srv, live, "atask", lambda s: s["busy"] == "0")
    assert live("call atask.delete=2")[0] == "accepted 1"
    run_until(srv, live, "atask", lambda s: s["state"] == "13")
    live(f"call tasks.input=4002,{PASS}")
    _, seen = run_until(srv, live, "atask", lambda s: s["state"] == "15")
    assert "yesno open 332 324 text=c1c" in seen
    live("call tasks.dialog=4000")
    _, seen = run_until(srv, live, "atask", lambda s: s["state"] == "20")
    assert "dialog open 344 312 fa2 text=c1e" in seen and srv.got[-1] == 0x3030 and "2" not in st["players"], seen
    live("call tasks.dialog=4000")
    done, _ = run_until(srv, live, "atask", lambda s: s["busy"] in ("2", "3"))
    assert done["busy"] == "2"
    run_until(srv, live, "atask", lambda s: s["busy"] == "0")

    # trunk and PBIN for slot 0
    for verb, mid in (("trunk", 0x3100), ("pbin=0", 0x3114)):
        assert live(f"call atask.{verb}")[0] == "accepted 1"
        done, _ = run_until(srv, live, "atask", lambda s: s["busy"] in ("2", "3"))
        assert done["busy"] == "2" and srv.got[-1] == mid, (verb, done, [hex(m) for m in srv.got])
        run_until(srv, live, "atask", lambda s: s["busy"] == "0")
    out = live("dump account")
    assert next(l for l in out if l.startswith("trunk ")) == "trunk " + "03" * 0xcb8
    # CNetAccountTaskReqDuellpass150 over the same connection: 0x3110 -> 0x3111 (game_reply: 0 packs)
    live("call dptask.spawn")
    dp, _ = run_until(srv, live, "dptask", lambda s: s["state"] == "3")
    assert srv.got[-1] == 0x3110
    live.close()

    # a wrong password at login: 0x3004 -240 -> text 0xc23 -> failed
    live = T.Live(exe)
    with_gate_list(live)
    live("call atask.spawn")
    srv = Server(live, "account", account_server(st, {USER: "otra-clave"}))
    srv.conn.port = 5731
    run_until(srv, live, "atask", lambda s: s["busy"] == "0")
    live(f"call atask.login={USER},{PASS}")
    _, seen = run_until(srv, live, "atask", lambda s: s["state"] == "30")
    assert "dialog open 344 312 fa2 text=c23" in seen, seen
    live("call tasks.dialog=4000")
    done, _ = run_until(srv, live, "atask", lambda s: s["busy"] in ("2", "3"))
    assert done["busy"] == "3" and done["result"] == "-240", done
    assert live("call atask.errortext=-12345")[0] == "errortext 1198"
    live.close()
    print("ok: CNetAccountTask against personajes.game_reply: login, create (name check), delete (password, yes/no), "
          "trunk, PBIN, refused login; ReqDuellpass150")


def lobby_server(st):
    """lobby.lobby_reply as run.py wires it: login through personajes.game_reply, research/lobby as LP (friends, black
    list, mail, room list, trades), cartera's PSELECTRESULT, bloques' LIST1; everything else stubbed out."""
    game_reply = account_server(st, {USER: PASS})
    hub = types.SimpleNamespace(select=lambda *a: None, on_lobby_msg=lambda *a: None, enter=lambda *a: None,
                                list_chunks=lambda c, mid: [], list1_entry=lambda o: b"")
    srv = types.SimpleNamespace(
        game_reply=game_reply, dp_npc_gate=lambda c, d: False, HUB=hub, _admin_ev=lambda *a: None, log=lambda *a: None,
        AV_STATE={}, PH=None, PH_LOBBY=lobby_mod.PH_LOBBY, EMPTY_LISTS=lobby_mod.EMPTY_LISTS,
        on_conn_closed=lambda *a: None, STATE_LOCK=threading.Lock(), load_state=lambda: st, save_state=lambda s: None,
        sync_player_id=lambda: None, my_pid=lambda: 1000, my_name=lambda: "Yo", my_slot=lambda st=None: 0,
        wallet=lambda: {"dpp": 7, "mp": 1234}, block_type=lambda c: (0, c.rank), block_key=lambda c: None,
        hub_area=lambda name, default, *a: default, LOBBY_PORT=5732, ACAD_AREA=5, DOMINO_AREA=0, ACAD_KINDS=(13,),
        block_others=lambda c: [], myroom_self_avatar=lambda c, d: None, NPCS=[], DEFAULT_COUNTRY="ES",
        CTX=types.SimpleNamespace(sess=None), PP=None, ns={})
    srv.block_player = bloques.block_player
    srv.send_block_list = bloques.send_block_list
    srv.pselect_result = cartera.pselect_result
    cartera.setup(srv)
    bloques.setup(srv)
    LP = research("lobby")
    LP.install({"load_state": lambda: st, "save_state": lambda s: None, "my_pid": lambda: 1000, "my_name": lambda: "Yo",
                "log": lambda *a: None, "LOBBY_PORT": 5732})
    srv.LP = LP
    lobby_mod.setup(srv)
    return lobby_mod.lobby_reply


def check_lobby_task(exe):
    st = {"players": {"0": "Player1"}}
    live = T.Live(exe)
    with_gate_list(live)
    assert live("call ltask.spawn")[0] == "ltask spawned CNetLobbyTask"
    srv = Server(live, "lobby", lobby_server(st))
    srv.conn.port, srv.conn.rank = 5732, 12

    # My Room: the gate list's only My Room lobby (area 0); both worlds' avatars are registered, the other one first
    assert live("call ltask.myroom")[0] == "accepted 1"
    done, seen = run_until(srv, live, "ltask", lambda s: s["busy"] in ("2", "3"))
    assert done["busy"] == "2", (done, seen[-8:])
    assert srv.got == [0x3001, 0x3003, 0x4100, 0x4200, 0x4202, 0x4170, 0x4170], [hex(m) for m in srv.got]
    assert "connect 203.0.113.7 5732" in seen, seen
    run_until(srv, live, "ltask", lambda s: s["busy"] == "0")
    out = live("dump lobby")
    lb = kv(next(l for l in out if l.startswith("lobby ")))
    # the task took AUTHRESULT and ENTERBLOCKRESULT (back to -150 = pending); PSELECTRESULT is left for the UI
    assert (lb["authResult"], lb["pselect"], lb["enterBlock"], lb["block"]) == ("-150", "0", "-150", "0,12,0"), lb

    # the lists after entering: LIST1-5, the room list (research/lobby h_roomlist), the NPC info list
    assert live("call ltask.lists")[0] == "accepted 1"
    done, seen = run_until(srv, live, "ltask", lambda s: s["busy"] in ("2", "3"))
    assert done["busy"] == "2", (done, seen[-8:])
    assert srv.got[7:] == [0x4210, 0x4214, 0x4218, 0x421c, 0x4221, 0x4280, 0x4230], [hex(m) for m in srv.got]
    run_until(srv, live, "ltask", lambda s: s["busy"] == "0")

    # one request each, through research/lobby: a friend request to someone not online (0x4511 1 = failed), the
    # black list, a PID lookup of my own name (found), the mail count
    for verb, mid, want in (("friend=1001", 0x4510, ("3", "1")), ("addblack=1002", 0x4530, ("2", "0")),
                            ("pidbyname=Yo", 0x4500, ("2", "0")), ("mailcount", 0x4620, ("2", "0"))):
        assert live(f"call ltask.{verb}")[0] == "accepted 1"
        assert live("call ltask.lists")[0] == "accepted 0"                 # busy
        done, _ = run_until(srv, live, "ltask", lambda s: s["busy"] in ("2", "3"))
        assert srv.got[-1] == mid and (done["busy"], done["result"]) == want, (verb, done, hex(srv.got[-1]))
        run_until(srv, live, "ltask", lambda s: s["busy"] == "0")
    live.close()
    print("ok: CNetLobbyTask against lobby.lobby_reply: My Room connect (hello, auth, PSELECT, blocks, 2 x avatar), "
          "LIST1-5 + rooms + NPC info, friend / black list / PID / mail requests")


def check_lobby_task_duel(exe):
    """The duel steps against the duel stand-in (net_cli_tasks.cpp) after a normal room connect."""
    st = {"players": {"0": "Player1"}}
    live = T.Live(exe)
    with_gate_list(live)
    live("call ltask.spawn")
    srv = Server(live, "lobby", lobby_server(st))
    srv.conn.port, srv.conn.rank = 5740, 13
    assert live("call ltask.connect=5,13,0")[0] == "accepted 1"
    done, seen = run_until(srv, live, "ltask", lambda s: s["busy"] in ("2", "3"))
    assert done["busy"] == "2" and srv.got.count(0x4170) == 1, (done, [hex(m) for m in srv.got], seen[-6:])
    run_until(srv, live, "ltask", lambda s: s["busy"] == "0")

    # duel: connect to duelIp:duelPort, booked check with my pid, then deck + prepare
    assert live("call ltask.duel")[0] == "accepted 1"
    _, seen = run_until(srv, live, "ltask", lambda s: s["state"] == "79")    # DUEL_WAIT_BOOKED
    assert "duel bookedcheck 1000" in seen and any(l.startswith("duel connect ") for l in seen), seen
    live("call ltask.duelanswer=0")
    _, seen = run_until(srv, live, "ltask", lambda s: s["state"] == "81")    # DUEL_WAIT_DECK
    assert "duel deck" in seen and "duel prepare" in seen, seen
    live("call ltask.duelanswer=1")
    done, _ = run_until(srv, live, "ltask", lambda s: s["busy"] in ("2", "3"))
    assert done["busy"] == "2", done
    run_until(srv, live, "ltask", lambda s: s["busy"] == "0")

    # watching, refused by the duel server (0x649b code 4): -630 and failed
    assert live("call ltask.watchduel")[0] == "accepted 1"
    _, seen = run_until(srv, live, "ltask", lambda s: s["state"] == "85")    # WATCH_WAIT
    assert "duel watch" in seen
    live("call ltask.duelcode=4")
    done, _ = run_until(srv, live, "ltask", lambda s: s["busy"] in ("2", "3"))
    assert (done["busy"], done["result"]) == ("3", "-630"), done
    live.close()
    print("ok: CNetLobbyTask room connect (one avatar), duel (booked check, deck, prepare), watch refused (-630)")


def check_disconnect_task(exe):
    live = T.Live(exe)
    live("call tasks.stale=fresh")
    live("call cdtask.spawn")
    out = live("call tasks.frame") + live("call tasks.frame")
    assert state_of(out, "cdtask") == {"state": "0", "text": "0", "delay": "4", "hb": "1,0"}, out
    # the lobby hasn't heard from its server for 200 s: hung up (bye, close), then the box with 0x11bf
    live("call tasks.stale=lobby")
    seen = []
    for _ in range(3):
        seen += live("call tasks.frame")
    assert "closed 7" in seen and "dialog open 0 0 fa2 text=11bf" in seen, seen
    assert state_of(seen[-3:], "cdtask") == {"state": "2", "text": "11bf", "delay": "4", "hb": "1,0"}, seen
    out = live("call tasks.frame")
    assert state_of(out, "cdtask")["state"] == "2"             # -1 = still open
    live("call tasks.dialog=4000")
    seen = live("call tasks.frame") + live("call tasks.frame") + live("call tasks.frame")
    assert "marked disconnected" in seen and "fade out 10 ee4c" in seen and state_of(seen[-3:], "cdtask")["state"] == "0"
    # the app's own flag, reason 2: 0x11a5 and delay 10, cleared again after OK
    live("call cdtask.flag=2")
    seen = live("call tasks.frame") + live("call tasks.frame")
    assert "dialog open 0 0 fa2 text=11a5" in seen and state_of(seen[-3:], "cdtask")["delay"] == "10", seen
    live("call tasks.dialog=0")
    seen = live("call tasks.frame") + live("call tasks.frame") + live("call tasks.frame") + live("call tasks.frame")
    out = live("call tasks.frame")
    assert state_of(out, "cdtask")["state"] == "0" and "dialog open" not in "".join(out), out
    live.close()
    print("ok: CCheckHeartBeatTask hangs up a silent lobby; CCheckDisconnectTask box (0x11bf, app reason 2 = 0x11a5), "
          "OK -> fade out")


def check_connect_lobby(exe):
    # the gate: connect, version, list, bye (puerta.gate_reply)
    live = T.Live(exe)
    live("call cltask.spawn")
    srv = Server(live, "gate", gate_server())
    assert live("call cltask.gate")[0] == "accepted 1"
    st, seen = run_until(srv, live, "cltask", lambda s: s["mode"] == "0")
    assert st["result"] == "2" and srv.got == [0x2005, 0x0003], (st, [hex(m) for m in srv.got])
    live.close()

    # a room lobby through its own CNetLobbyTask, then block 0: ENTERBLOCK goes out twice, as YOLaucher notes
    live = T.Live(exe)
    with_gate_list(live)
    live("call cltask.spawn")
    srv = Server(live, "lobby", lobby_server({"players": {"0": "Player1"}}))
    srv.conn.port, srv.conn.rank = 5740, 13
    assert live("call cltask.lobby=5,13,0")[0] == "accepted 1"
    st, seen = run_until(srv, live, "cltask", lambda s: s["mode"] == "0", frames=60)
    assert st["result"] == "2", (st, seen[-6:])
    lobby_ids = [m for m in srv.got if m != 0x0003]                 # the gate's bye is in the same tx stream
    assert lobby_ids == [0x3001, 0x3003, 0x4100, 0x4200, 0x4202, 0x4170, 0x4202, 0x4170], [hex(m) for m in srv.got]
    assert "world for rank 13" in seen and "duel deck prepared" in seen
    live.close()
    print("ok: CConnectLobby: gate (version + list + bye), lobby (CNetLobbyTask connect, then enterBlock(0, 0))")


def check_connect_lobby_scene(exe):
    """CConnectLobbyScene under System's real CSceneMng: My Room connect, then push SCENE_MY_ROOM (10)."""
    live = T.Live(exe)
    with_gate_list(live)
    live("call scene.connectlobby")
    srv = Server(live, "lobby", lobby_server({"players": {"0": "Player1"}}))
    srv.conn.port, srv.conn.rank = 5732, 12
    seen = []
    for _ in range(40):
        seen += srv.frame()
        if "my room scene" in seen:
            break
    assert "bg 29 0" in seen and "my room scene" in seen, seen[-10:]
    assert srv.got == [0x3001, 0x3003, 0x4100, 0x4200, 0x4202, 0x4170, 0x4170], [hex(m) for m in srv.got]
    assert live("call scene.mng")[0] == "scenemng now=10 next=44 depth=1"   # 44 = SCENE_NONE
    live.close()
    print("ok: CConnectLobbyScene (System's CSceneMng): My Room connect through its CNetLobbyTask, push My Room")


def main():
    with tempfile.TemporaryDirectory() as tmp:
        exe = T.compile_cli(tmp)
        check_gate_task(exe)
        check_account_task(exe)
        check_lobby_task(exe)
        check_lobby_task_duel(exe)
        check_disconnect_task(exe)
        check_connect_lobby(exe)
        check_connect_lobby_scene(exe)


if __name__ == "__main__":
    main()
