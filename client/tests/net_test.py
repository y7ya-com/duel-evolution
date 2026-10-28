"""Checks src/Net (gate 5730, account 5731, lobby 5732+) against YOLaucher, deterministically:
  - every request builder, byte for byte, against fake_client.py's requests / proto.W layouts, and where the server
    parses the request (personajes.py, duelpass.py, lobby.py), against what the server reads back;
  - the login blob (0x3003) and DUELPASS code (0x8101) against research/cuentas/cifrado.py (MD5 + Blowfish);
  - every parser fed with the server's OWN builders (puerta.gate_reply, personajes.*, cartera.pselect_result,
    bloques.block_player, pvp_hub.Hub list/join/state bodies), framed by proto.pack with the real sequence numbers;
  - the exe's field offsets (static_assert): src/Net compiled for i686 with i686-w64-mingw32-g++, and its named
    fields checked against the generated class headers in include/yo2 (tests/net_layout.cpp).
Run: python3.12 -I tests/net_test.py   (needs c++ and i686-w64-mingw32-g++ on PATH)
"""
import glob
import hashlib
import os
import struct
import subprocess
import sys
import tempfile
import threading
import types

HERE = os.path.dirname(os.path.abspath(__file__))
NET = os.path.join(HERE, "..", "src", "Net")
INCLUDE = os.path.join(HERE, "..", "include")
EMU = os.environ.get("YO2_EMU_DIR", os.path.expanduser("~") + "/Documents/GitHub/YOLaucher-web/tools/yo2emu")
sys.path.insert(0, EMU)
import proto  # noqa: E402
import fake_client  # noqa: E402
import pvp_hub  # noqa: E402
from yo2srv.cuentas import personajes  # noqa: E402
from yo2srv.mundo import bloques  # noqa: E402
from yo2srv.red import puerta  # noqa: E402
from yo2srv.tienda import cartera  # noqa: E402

cifrado = fake_client._cifrado()
sys.path.insert(0, os.path.join(EMU, "research", "persistencia"))
import duelpass  # noqa: E402

USER, PASS = fake_client.TEST_OWNER_LOGIN
W = proto.W


class Conn:
    """What the server builders send to: (id, data) in order."""
    def __init__(self, port=0):
        self.sent, self.port = [], port

    def send(self, mid, data=b"", pause=0):
        self.sent.append((mid, bytes(data)))


def frames(msgs, first=1):
    """Wire bytes for server messages, numbered like a real connection (the client checks param == last + 1)."""
    return b"".join(proto.pack(m, d, first + i) for i, (m, d) in enumerate(msgs)).hex()


SYSTEM = os.path.join(HERE, "..", "src", "System")
TASK_FRAMEWORK = [os.path.join(SYSTEM, f) for f in ("yo2Task.cpp", "yo2TaskPtr.cpp", "yo2EasyTask.cpp", "yo2Debug.cpp",
                                                    "yo2Element.cpp", "yo2Scene.cpp", "yo2SceneManager.cpp")] + [
    os.path.join(HERE, "..", "src", "Game", "Avatar", "yo2AvatarData.cpp")]   # Game's CAvatarData (in CPlayerInfo)
SCENES = [os.path.join(NET, "..", d) for d in ("ConnectLobby",)]   # Net-side scenes, built and checked like src/Net


class Live:
    """net_cli in live mode: one command at a time, its output back (up to the "." line)."""
    def __init__(self, exe):
        self.p = subprocess.Popen([exe, "live"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)

    def __call__(self, line):
        self.p.stdin.write(line + "\n")
        self.p.stdin.flush()
        out = []
        for l in self.p.stdout:
            l = l.rstrip("\n")
            if l == ".":
                return out
            out.append(l)
        raise RuntimeError(f"net_cli died after {line!r}: {out}")

    def close(self):
        self.p.stdin.close()
        assert self.p.wait() == 0


def compile_cli(tmp):
    srcs = sorted(glob.glob(os.path.join(NET, "*.cpp")) + [f for d in SCENES for f in glob.glob(os.path.join(d, "*.cpp"))])
    for s in srcs:   # the exe's offsets only hold on a 32-bit build
        subprocess.check_call(["i686-w64-mingw32-g++", "-std=c++17", "-Wall", "-Werror", "-fsyntax-only",
                               "-I", os.path.join(NET, ".."), s])
    subprocess.check_call(["i686-w64-mingw32-g++", "-std=c++17", "-fsyntax-only", "-I", INCLUDE, "-I", NET, "-I", os.path.join(NET, ".."),
                           os.path.join(HERE, "net_layout.cpp")])   # our named fields vs include/yo2
    exe = os.path.join(tmp, "net_cli")
    subprocess.check_call(["c++", "-std=c++17", "-O1", "-g", "-Wall", "-Wextra", "-Werror",
                           "-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-I", NET, "-I",
                           os.path.join(NET, ".."), *sorted(glob.glob(os.path.join(HERE, "net_cli*.cpp"))), *srcs,
                           *TASK_FRAMEWORK, "-o", exe])
    return exe


def run_script(exe, lines):
    out = subprocess.run([exe, "script"], input="\n".join(lines) + "\n", capture_output=True, text=True, check=True)
    return out.stdout.splitlines()


def kv(line):
    return dict(f.split("=", 1) for f in line.split()[1:] if "=" in f)


# ---------------------------------------------------------------- builders
def expected_builds():
    md5 = lambda b: hashlib.md5(b).digest()
    t = lambda sub, body=b"": (0x7000, struct.pack(">H", sub) + body)
    e = {
        "base.bye": (0x0003, b""),
        "base.ping": (0x0005, b""),
        "base.ping_recent": None,
        "gate.version": (0x2005, fake_client.VERSION),
        "acc.hello": (0x3001, b""),                                        # fake_client.account
        "acc.auth": (0x3003, cifrado.encrypt(USER, PASS)),
        "acc.auth_challenge": (0x3003, cifrado.encrypt(USER, PASS, bytes(range(16)))),
        "acc.playerlist": (0x3010, b""),
        "acc.regplayer": (0x3020, bytes([2]) + b"Amigo".ljust(16, b"\0") + b"\0"),
        "acc.regplayer_bad": None,
        "acc.delplayer": (0x3030, b"\x01"),
        "acc.trunk": (0x3100, b"\x00"),
        "acc.pbin": (0x3114, b"\x03"),
        "acc.dppurchase": (0x3110, b""),
        "lb.hello": (0x3001, b""),
        "lb.auth": (0x3003, cifrado.encrypt(USER, PASS)),
        "lb.pselect": (0x4100, bytes([5, 0])),                             # fake_client.enter_room
        "lb.pselect_deck": (0x4100, bytes([2, 3]) + struct.pack(">II", 1, 0x01020304)),
        "lb.blocklist": (0x4200, b""),
        "lb.enterblock": (0x4202, b"\0\0"),
        "lb.list1": (0x4210, b"\xff\xff\xff\xff"),                         # fake_client.block_list
        "lb.list2": (0x4214, b"\xff\xff\xff\xff"),                         # fake_client.list2
        "lb.list3": (0x4218, struct.pack(">I", 1001)),
        "lb.list4": (0x421c, struct.pack(">I", 1002)),
        "lb.list5": (0x4221, b"\xff\xff\xff\xff"),
        "lb.npcinfolist": (0x4230, b""),
        "lb.playerinfo": (0x4150, struct.pack(">I", 1001)),
        "lb.avatarinfo": (0x5320, struct.pack(">I", 1003)),
        "lb.regavatar": (0x4170, struct.pack(">I", 1) + bytes(range(16)) + bytes(4)),   # fake_client.enter_room
        "lb.comment": (0x4172, b"\x01" + b"hola-hola-hola-hola-hola-hola-ho"),
        "lb.title": (0x4174, struct.pack(">I", 5)),
        "lb.roomlist": (0x4280, bytes(4)),
        "lb.createroom": (0x4288, bytes([1, 2, 3, 1]) + md5(b"pw") + bytes([0, 4, 5, 6]) + struct.pack(">I", 1007)),
        "lb.createroom_open": (0x4288, bytes([7, 8, 9, 0]) + bytes(16) + bytes([0, 10, 11, 12]) + bytes([1, 2, 3, 4])),
        "lb.createroom_badpw": None,
        "lb.deleteroom": (0x4290, b""),
        "lb.matchreply": (0x4303, struct.pack(">I", 1)),
        "lb.automatchreply": (0x430a, struct.pack(">I", 0)),
        "lb.cancelmatch": (0x4304, b""),
        "lb.chat": (0x4400, bytes([0, 2]) + struct.pack(">III", 1, 2, 3) + b"hello"),
        "lb.watch": (0x4320, struct.pack(">I", 9)),
        "lb.chatroomlist": (0x4410, b""),
        "lb.createchatroom": (0x4424, b"sala".ljust(32, b"\0") + b"\x01" + md5(b"x")),
        "lb.exitchatroom": (0x4428, b""),
        "lb.selectpack": (0x4802, b"\x12\x34"),
        "lb.resetautowait": (0x42a0, b""),
        "lb.friend": (0x4510, struct.pack(">I", 1001)),
        "lb.friendreply": (0x4513, struct.pack(">Ii", 1001, -1)),
        "lb.pidbyname": (0x4500, b"Amigo".ljust(16, b"\0")),
        "lb.teamcreate": (0x4550, b"Equipo".ljust(16, b"\0")),
        "lb.teamdisband": (0x4552, b""),
        "lb.teamjoin": (0x4554, struct.pack(">I", 3)),
        "lb.teamjoinreply": (0x4568, struct.pack(">III", 1, 1, 2)),
        "lb.teambanish": (0x4556, struct.pack(">I", 1001)),
        "lb.teamleave": (0x4569, b""),
        "lb.teamlist": (0x4558, b""),
        "lb.mailcount": (0x4620, b""),
        "lb.rcvmail": (0x4610, b""),
        "lb.addblack": (0x4530, struct.pack(">I", 5)),
        "lb.delblack": (0x4540, struct.pack(">I", 6)),
        "lb.tradeready": t(0x7132),
        "lb.tradestart": t(0x7101),
        "lb.reqtrade": t(0x7102, struct.pack(">I", 1001)),
        "lb.tradeofferreply": t(0x7105, struct.pack(">I", 1)),
        "lb.canceltrade": t(0x7108),
        "lb.addcard": t(0x7113, struct.pack(">h", -2)),
        "lb.deletecard": t(0x7114, struct.pack(">h", 7)),
        "lb.tradestatus": t(0x7117, b"\x03"),
        "lb.tradeconfirm": t(0x7119, b"\x01" + struct.pack(">10i", *range(10)) + struct.pack(">10i", *range(10, 20))),
        "lb.tradeexit": t(0x7112),
        "lb.arrivecard": t(0x7122),
        "lb.tradeclear": t(0x7128),
        "lb.purchasepack": (0x4902, b""),
        "lb.recoverypack": (0x4901, b""),
        "lb.presentpack": (0x4904, b""),
        "lb.dpauth": (0x8101, cifrado._bf().encrypt_ecb(b"ABCD-1234".ljust(16, b"\0"))),
        "lb.dpauth_toomany": None,
        "lb.gunsling": (0x4910, b""),
        "lb.mileageitem": (0x5200, b""),
        "lb.mileageresult": (0x5202, struct.pack(">IHHH", 0x0a0b0c0d, 1, 2, 3)),
        "lb.shopresult": (0x5210, struct.pack(">IBIB", 101, 2, 202, 1)),
        "lb.tourinfo": (0x5100, b""), "lb.tourentry": (0x5107, b""), "lb.tourlist": (0x5111, b""),
        "lb.tourendresult": (0x5112, b""), "lb.tourtimer": (0x5113, b""), "lb.tourpcounter": (0x5114, b""),
        "lb.tourstatus": (0x5115, b""),
        "lb.champscard": (0x4915, b""),
        "lb.usbdpauth": (0x8203, bytes(range(0xa0, 0xb0))),
        "lb.move": (0x5300, struct.pack(">IHHBB", 1000, 300, 200, 3, 0)),   # fake_client.move
        "lb.5310": (0x5310, struct.pack(">IBB", 1000, 1, 2)),
        "lb.sdget": (0x5400, struct.pack(">HH", 1, 2)),
        "lb.tppresentinfo": (0x8301, b""),
        "lb.tpcardget": (0x8303, b"\x04" + struct.pack(">HHH", 0x1111, 0x2222, 0x3333)),
        "lb.startuppresent": (0x8401, b"\x02" + struct.pack(">HH", 0xabcd, 0x0102)),
    }
    return e


def check_builders(exe):
    lines = subprocess.check_output([exe, "build"], text=True).splitlines()
    got, extra = {}, {}
    for l in lines:
        k, _, v = l.partition(" ")
        (extra if k.endswith(".result") else got)[k] = v
    exp = expected_builds()
    assert set(exp) <= set(got), set(exp) - set(got)   # message groups register more (tests/net_test_<group>.py)
    bodies = {}
    for k, want in exp.items():
        if want is None:
            assert got[k] == "", (k, got[k])
            continue
        (msg, param, data, ok), = proto.Reader().feed(bytes.fromhex(got[k]))
        assert ok and param == 1 and (msg, data) == want, (k, hex(msg), data.hex(), want[1].hex())
        assert got[k] == proto.pack(*want, 1).hex(), k
        bodies[k] = data
    assert extra["dpauth_toomany.result"] == "-2000 2", extra
    # what the servers read back from them
    assert cifrado.decrypt(bodies["acc.auth"]).usuario == USER
    assert duelpass.norm(bodies["lb.dpauth"]) == "ABCD-1234"
    st = {"players": {}}
    srv = types.SimpleNamespace(STATE_LOCK=threading.Lock(), load_state=lambda: st, save_state=lambda s: None,
                                archive_profile=lambda *a: None, log=print)
    personajes.setup(srv)
    c = Conn()
    personajes.regplayer_0x3020(c, bodies["acc.regplayer"])
    assert st["players"] == {"2": "Amigo"} and c.sent == [(0x3022, bytes(4))]
    st["players"]["1"] = "Otro"
    personajes.delplayer_0x3030(c, bodies["acc.delplayer"])
    assert "1" not in st["players"]
    assert len(bodies["lb.createroom"]) == 28                          # lobby.py: «28 B: 4×u8, 16 B, 4×u8, u32»
    assert struct.unpack(">I", bodies["lb.regavatar"][:4])[0] == 1     # pvp_hub: u32 mundo, 16 B piezas, u32
    print(f"ok: {len(exp)} request builders match byte for byte (login/DUELPASS via cifrado.py and duelpass.py)")


# ---------------------------------------------------------------- gate
def check_gate(exe):
    hub = types.SimpleNamespace(lock=threading.Lock(), blocks={})
    srv = types.SimpleNamespace(PUBLIC_IP="203.0.113.7", GAME_PORT=5731, LOBBY_PORT=5732, GATE_PAUSE=0,
                                ROOM_KINDS=puerta.ROOM_KINDS, ROOM_PORT_BASE=5740, ROOM_LANG_PORT_BASE=5800,
                                HUB=hub, ns={}, room_lang=lambda lang: lang)
    puerta.setup(srv)
    hub.blocks[(5740, 5)] = {1: 0, 2: 0}   # two players in the first room of language 5
    c = Conn()
    puerta.gate_reply(c, 0x2005, 1, fake_client.VERSION)
    raw = b"".join(d for m, d in c.sent if m == 0x2003)
    want = [struct.unpack(">II16s15sHHBBBH", raw[i:i + 48]) for i in range(0, len(raw), 48)]
    assert [m for m, _ in c.sent].count(0x2003) > 1   # the list really spans several messages
    out = run_script(exe, ["rx gate " + frames(c.sent[:2]), "dump gate", "rx gate " + frames(c.sent[2:], 3),
                           "dump gate", "call lb.want=5,13,0", "call lb.connect", "call acc.connect"])
    mid = out.index(next(l for l in out if l.startswith("gate ")))
    assert kv(out[mid]) == {"listing": "1", "result": "0", "flag": "0", "list": "0"}, out[mid]
    assert "gateaddr 198.51.100.4 5730" in out, out   # CNetGate's constructor: the system config's gate
    end = [i for i, l in enumerate(out) if l.startswith("gate ")][1]
    assert kv(out[end]) == {"listing": "0", "result": "0", "flag": "2", "list": "1"}, out[end]
    srvs = [l.split()[1:] for l in out[end:] if l.startswith("srv ")]
    assert len(srvs) == len(want), (len(srvs), len(want))
    s8 = lambda b: b - 256 if b > 127 else b
    for g, (sid, kind, name, ip, port, n, b1, b2, b3, x) in zip(srvs, want):
        assert g == [str(sid), str(kind), name.rstrip(b"\0").decode().replace(" ", "_"), ip.rstrip(b"\0").decode(), str(port), str(n),
                     str(s8(b1)), str(s8(b2)), str(s8(b3)), str(x)], g
    assert "account_server 203.0.113.7 5731" in out
    assert "connect 203.0.113.7 5740" in out and "connect 203.0.113.7 5731" in out, out
    assert any(g[5] == "2" and g[4] == "5740" and g[6] == "5" for g in srvs)   # player count of that room
    # refused version: the client hangs up (0x0003) and keeps -121
    out = run_script(exe, ["rx gate " + frames([(0x2002, W().u32(1).bytes())]), "dump gate"])
    assert "closed 7" in out and kv(next(l for l in out if l.startswith("gate ")))["result"] == "-121", out
    # out-of-order message: -203 (FUN_0068bac0)
    out = run_script(exe, ["rx gate " + frames([(0x2004, b"")], 2)])
    assert out == ["rx 2004 -203"], out
    print(f"ok: gate 0x2002/0x2003/0x2004 from puerta.gate_reply: {len(want)} servers in "
          f"{[m for m, _ in c.sent].count(0x2003)} messages, lookups, refusal, sequence check")


# ---------------------------------------------------------------- account
def check_account(exe):
    st = {"players": {"0": "Player1", "2": "Amigo"}}
    srv = types.SimpleNamespace(STATE_LOCK=threading.Lock(), load_state=lambda: st, save_state=lambda s: None,
                                archive_profile=lambda *a: None, log=print, player_entry=personajes.player_entry)
    personajes.setup(srv)
    c = Conn()
    c.send(0x3002)                                                     # game_reply: 0x3001 -> empty 0x3002
    c.send(0x3004, W().u32(0).u32(1 | 0x20).s("ESP", 4).bytes())       # game_reply 0x3003 (same builder line)
    personajes.playerlist_0x3010(c)
    personajes.regplayer_0x3020(c, bytes([1]) + b"Nuevo".ljust(16, b"\0"))
    personajes.delplayer_0x3030(c, b"\x01")
    personajes.trunk_0x3100(c)
    c.send(0x3114, bytes(range(128)))                                  # pbin_0x3114's sizes, not its zeroes
    c.send(0x4234, bytes(range(256)) * 2)
    c.send(0x3111, W().u32(5).bytes())                                 # game_reply 0x3110
    # a full PLAYERLIST record with every field set, in player_entry's order
    rec = (W().u8(3).s("Lleno", 16).u8(42).u32(7).u32(8).u32(9).u16(10).u32(11).u16(12).u16(13).u16(14).u16(15)
           .bytes() + bytes(range(16)) + bytes(range(16, 32)))
    c.send(0x3012, W().u32(0).bytes() + rec)
    out = run_script(exe, ["rx account " + frames(c.sent[:1]), "call acc.auth", "rx account " + frames(c.sent[1:], 2),
                           "dump account"])
    tx = next(l for l in out if l.startswith("tx "))[3:]
    assert tx == proto.pack(0x3003, cifrado.encrypt(USER, PASS), 1).hex(), tx
    a = kv(next(l for l in out if l.startswith("account ")))
    assert a == {"authResult": "0", "authFlags": str(1 | 0x20), "region": "ESP", "regResult": "0", "delResult": "0",
                 "packs": "5", "challenge": "00" * 16}, a
    assert next(l for l in out if l.startswith("flags")) == "flags 2 2 2 2 2 2 2 2"
    assert next(l for l in out if l.startswith("trunk ")) == "trunk " + "03" * 0xcb8
    assert next(l for l in out if l.startswith("pbin ")) == "pbin " + bytes(range(128)).hex()
    assert next(l for l in out if l.startswith("npcbin ")) == "npcbin " + (bytes(range(256)) * 2).hex()
    slots = {l.split()[0]: kv(l) for l in out if l.startswith("slot")}
    # the last PLAYERLIST (only slot 3) resets the others
    assert [slots[f"slot{i}"]["valid"] for i in range(4)] == ["0", "0", "0", "1"], slots
    s3 = slots["slot3"]
    assert (s3["name"], s3["level"], s3["u0a8"], s3["u11c"], s3["titleId"], s3["mp"]) == \
        ("Lleno", "42", "7", "0,0,8,9", "10", "11"), s3
    assert s3["w0b0"].split(",")[:6] == ["12", "13", "0", "0", "15", "14"], s3["w0b0"]   # +0xb0, +0xb2, +0xba, +0xb8
    assert (s3["avatar0"], s3["avatar1"]) == (bytes(range(16)).hex(), bytes(range(16, 32)).hex())
    # and the server's own list, one message earlier
    out = run_script(exe, ["rx account " + frames(c.sent[:3]), "dump account"])
    slots = {l.split()[0]: kv(l) for l in out if l.startswith("slot")}
    assert (slots["slot0"]["name"], slots["slot2"]["name"], slots["slot1"]["valid"]) == ("Player1", "Amigo", "0")
    print("ok: account 0x3002/0x3004/0x3012/0x3022/0x3032/0x3101-3/0x3114/0x4234/0x3111 from personajes.py; "
          "login blob = cifrado.encrypt")


# ---------------------------------------------------------------- lobby
def check_lobby(exe):
    wallet = {"dpp": 7, "mp": 1234}
    profiles = {1001: {"lv": 12, "wins": 30, "losses": 4, "title": 9, "country": "FR"},
                1002: {"lv": 3, "wins": 1, "losses": 2, "title": 0, "country": "DE"},
                1003: {"lv": 50, "wins": 0, "losses": 0, "title": 0, "country": "IT"}}
    ctx = types.SimpleNamespace(sess=None)
    pp = types.SimpleNamespace(rec_values=lambda p: p, profile=lambda st, slot, create=False: profiles[ctx.sess.pid])
    srv = types.SimpleNamespace(my_pid=lambda: 1000, wallet=lambda: wallet, my_name=lambda: "Yo", CTX=ctx,
                                load_state=lambda: {}, my_slot=lambda st=None: 0, ns={"PP": pp}, PP=pp,
                                DEFAULT_COUNTRY="ES", log=print,
                                hub_area=lambda name, default, s: getattr(s, "ablock", default))
    cartera.setup(srv)
    bloques.setup(srv)
    hub = object.__new__(pvp_hub.Hub)
    hub.env = {"block_player": bloques.block_player}
    hub.area_list = lambda key: [3, 5, 7]
    sess = lambda pid, name, **k: types.SimpleNamespace(pid=pid, name=name, slot=0, block=None, ablock=k.get("ab", 0),
                                                        parts=k.get("parts", b""), parts_w={}, state=k.get("st", 0),
                                                        state_extra=b"", pos=k.get("pos"))
    a = sess(1001, "Amigo", parts=bytes(range(1, 17)), pos=struct.pack(">IHHB", 1001, 123, 234, 3))
    b = sess(1002, "Bea", ab=1, st=0x68, pos=struct.pack(">IHHB", 1002, 5, 6, 1))
    hub.set_state = None
    b.state_extra = pvp_hub._name16("Rival") + struct.pack(">BHHH", 9, 1, 2, 3)
    newcomer = sess(1003, "Caro", parts=b"\x05" * 16)
    team = struct.pack(">I", 77) + b"Los Duelistas".ljust(16, b"\0") + b"12345".ljust(16, b"\0")
    c = Conn()
    c.send(0x3002)
    c.send(0x3004, W().u32(0).u32(1).s("ESP", 4).bytes())
    c.send(0x4101, cartera.pselect_result())
    c.send(0x4201, hub.blocklist(None, 13))
    c.send(0x4203, W().u32(0).u8(1).u8(5).u8(0).bytes())              # lobby.py 0x4202 reply
    c.send(0x4211, W().u32(1).bytes())                                 # bloques.send_block_list
    c.send(0x4212, hub.list1_entry(a) + hub.list1_entry(b))
    c.send(0x4213)
    c.send(0x4215, W().u32(1).bytes())
    c.send(0x4216, struct.pack(">I", 1001) + hub.list2_body(a) + struct.pack(">I", 1002) + hub.list2_body(b)
           + struct.pack(">I", 4242) + hub.list2_body(a))              # an unknown pid is skipped
    c.send(0x4217)
    c.send(0x4219, W().u32(1).bytes())
    c.send(0x421a, struct.pack(">I", 1001) + b"Hola a todos".ljust(32, b"\0"))
    c.send(0x421b)
    c.send(0x421d, W().u32(1).bytes())
    c.send(0x421e, struct.pack(">I", 1001) + b"Segunda linea".ljust(32, b"\0"))
    c.send(0x421f)
    c.send(0x4222, W().u32(1).bytes())
    c.send(0x4223, struct.pack(">I", 1001) + team + struct.pack(">I", 1002) + hub.list5_body(b))
    c.send(0x4224)
    c.send(0x4171, W().u32(0).bytes())                                 # lobby.py 0x4170 reply
    c.send(0x4173, W().u32(0).bytes())
    c.send(0x4175, W().u32(3).bytes())
    c.send(0x3112, hub.join_msg(newcomer))                             # someone new enters
    c.send(0x3112, hub.state_msg(a))                                   # known + not duelling: re-announced with op 1
    c.send(0x3112, struct.pack(">IBB", 1002, 0, 0))                    # Hub.leave
    c.send(0x5300, struct.pack(">IHHBB", 1001, 400, 300, 2, 7))        # positions (fake_client.move layout)
    c.send(0x5300, struct.pack(">IHHBB", 9999, 1, 1, 1, 1))            # unknown pid: ignored, not recorded
    out = run_script(exe, ["call lb.record=1", "call lb.world=1", "rx lobby " + frames(c.sent[:1]), "call lb.auth",
                           "rx lobby " + frames(c.sent[1:], 2), "dump lobby"])
    tx = [l for l in out if l.startswith("tx ")]
    assert tx[-1][3:] == proto.pack(0x3003, cifrado.encrypt(USER, PASS), 1).hex(), tx
    assert not [l for l in out if l.startswith("rx ") and not l.endswith(" 0")], out
    lb = kv(next(l for l in out if l.startswith("lobby ")))
    assert lb == {"authResult": "0", "authOk": "1", "pselect": "0", "enterBlock": "0", "block": "1,5,0",
                  "lists": "1,1,1,1,1", "changed": "1", "avatarRes": "0", "commentRes": "0", "titleRes": "3",
                  "challenge": "00" * 16, "moves": "1"}, lb
    assert next(l for l in out if l.startswith("flags")) == "flags 2 2 2 2 2 2 2 2 2 2", out
    assert [l for l in out if l.startswith("blk ")] == ["blk 0 3 13 0", "blk 0 5 13 1", "blk 0 7 13 2"]
    me = kv(next(l for l in out if l.startswith("self ")))
    assert (me["pid"], me["mp"]) == ("1000", "1234") and "u1248 7" in out, me
    ps = {p["pid"]: p for p in (kv(l) for l in out if l.startswith("player "))}
    assert set(ps) == {"1001", "1003"}, ps                             # 1002 left
    p = ps["1001"]
    assert (p["name"], p["level"], p["wins"], p["losses"], p["titleId"], p["country"], p["block"]) == \
        ("Amigo", "12", "30", "4", "9", "FR", "0"), p
    assert (p["x"], p["y"], p["dir"], p["state"]) == ("400", "300", "2", "1"), p
    # world 1 = the second slot; the first keeps CAvatarData's default (setDefault(MALE_DM), set by the constructor)
    assert p["avatar1"] == bytes(range(1, 17)).hex() and p["avatar0"] == "0000203040607090b020000000000000", p
    assert (p["comment"], p["title"]) == ("Hola_a_todos", "Segunda_linea"), p
    assert (p["teamId"], p["teamCode"], p["teamCodeNum"]) == ("0", "", "0"), p   # 0x3112 op 1 re-sent LIST5 = no team
    n = ps["1003"]
    assert (n["name"], n["level"], n["country"], n["state"], n["avatar1"], n["comment"]) == \
        ("Caro", "50", "IT", "1", "05" * 16, ""), n
    assert [l for l in out if l.startswith("move ")] == ["move 1001 012c0190 00000702"]
    # LIST5 itself, and a duelling player's LIST2 / 0x3112 state change, before the re-announce and leave
    out = run_script(exe, ["call lb.world=1", "rx lobby " + frames(c.sent[:23]),
                           "dump lobby"])
    ps = {p["pid"]: p for p in (kv(l) for l in out if l.startswith("player "))}
    assert (ps["1001"]["teamId"], ps["1001"]["teamName"], ps["1001"]["teamCodeNum"]) == ("77", "Los_Duelistas", "12345")
    bp = ps["1002"]
    assert (bp["state"], bp["block"], bp["duelName"], bp["duelLevel"], bp["duelStats"]) == \
        ("104", "1", "Rival", "9", "1,2,3"), bp
    duel = struct.pack(">IBB", 1002, 0x69, 1) + pvp_hub._name16("Otro") + struct.pack(">BHHH", 4, 5, 6, 7)
    out = run_script(exe, ["rx lobby " + frames(c.sent[:23] + [(0x3112, duel)]), "dump lobby"])
    bp = {p["pid"]: p for p in (kv(l) for l in out if l.startswith("player "))}["1002"]
    assert (bp["state"], bp["duelName"], bp["duelLevel"], bp["duelStats"]) == ("105", "Otro", "4", "5,6,7"), bp
    print("ok: lobby login, PSELECTRESULT (cartera.py), BLOCKLIST/ENTERBLOCK, LIST1-5, 0x3112 join/state/leave, "
          "0x5300 from pvp_hub.Hub / bloques.block_player")


def check_usb(exe):
    """CNetUsb, the USB DUELPASS server (gate kind 6). YOLaucher has no such server; the formats are its notes'
    (research/lobby: 0x8202 u32 result; 0x8205 u8, s8, 3 x u16 cards -> the key object +0x108)."""
    c = Conn()
    c.send(0x8202, W().u32(0).bytes())
    c.send(0x8205, W().u8(0).u8(0xfe).u16(1234).u16(5678).u16(910).bytes())
    out = run_script(exe, ["call usb.key", "rx usb " + frames(c.sent), "dump usb"])
    tx = next(l for l in out if l.startswith("tx "))
    assert tx[3:] == proto.pack(0x8201, bytes(range(0xc0, 0xd0)), 1).hex(), tx
    assert kv(next(l for l in out if l.startswith("usb "))) == {"result": "0", "flags": "2,2", "cards": "1234,5678,910",
                                                              "cardResult": "-2"}, out
    # a failed card list leaves the key's cards alone
    c = Conn()
    c.send(0x8205, W().u8(1).u8(0).u16(1).u16(2).u16(3).bytes())
    out = run_script(exe, ["rx usb " + frames(c.sent), "dump usb"])
    assert kv(next(l for l in out if l.startswith("usb "))) == {"result": "0", "flags": "0,2", "cards": "0,0,0",
                                                              "cardResult": "0"}, out
    print("ok: CNetUsb 0x8201 key, 0x8202 result, 0x8205 card list (and a failed one)")


def main():
    with tempfile.TemporaryDirectory() as tmp:
        exe = compile_cli(tmp)
        check_builders(exe)
        check_gate(exe)
        check_account(exe)
        check_lobby(exe)
        check_usb(exe)


if __name__ == "__main__":
    main()
