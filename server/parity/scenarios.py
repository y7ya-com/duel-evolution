"""Extra parity scenarios (run.py picks them up by name), built on py's fake_client.py. They only drive the client
side; the comparison is run.py's tap diff."""
import struct
import time

import fake_client as fc


def _all(link, msgs, settle=0.6, last=None):
    """Send each (id, data); then wait for the reply `last` (the server paces 0.25 s per reply, so replies lag far
    behind the requests: the next client must not act before this one is done, or the two interleave by timing)."""
    n = len(link.msgs)
    for mid, data in msgs:
        link.send(mid, data)
        time.sleep(0.3)
    if last is not None:
        link.wait(last, start=n, timeout=60)
    time.sleep(settle)


def run_tienda(offset, host="127.0.0.1"):
    """Shop, packs, prizes, titles, avatar, mail, friends, teams and chat with two players in the same room."""
    A = fc.FakeClient("A", fc.owner_key_from_log(), host, offset)
    B = fc.FakeClient("B", bytes([0xA5] * 16 + list(range(16))), host, offset)
    for X, name in ((A, None), (B, "Amigo")):
        X.gate()
        X.account(0, create_name=name)
        X.enter_room()
    a, b = A.room, B.room
    pa, pb = A.pid, B.pid
    _all(a, [
        (0x5208, b""),                                                     # catalogue
        (0x5210, struct.pack(">IB", 1, 1) + struct.pack(">IB", 50, 2)),    # cart: pack 1 + card x2
        (0x5210, struct.pack(">IB", 3, 1)),                                # another pack
        (0x4174, struct.pack(">I", 224)),                                  # title: «Duelista principiante»
        (0x4174, struct.pack(">I", 250)),                                  # a title it doesn't own
        (0x4170, struct.pack(">I", 0) + bytes.fromhex("0000203040607090b020000000000000") + bytes(4)),
        (0x5204, struct.pack(">HI", 1, 0)),                                # ITEMGET on entering a map
        (0x5204, struct.pack(">HI", 4, 35)),                               # first talk with an NPC
        (0x5400, struct.pack(">HH", 8001, 0x302)),                         # structure deck claim
        (0x4902, b""),                                                     # DUELPASS pack without a pass
        (0x8101, b"CODIGO-FALSO".ljust(16, b"\0")),
        (0x4901, b""), (0x4802, struct.pack(">H", 4)),                     # pack list + pick a pack
        (0x4500, b"Amigo".ljust(16, b"\0")), (0x4500, b"Yami Yugi".ljust(16, b"\0")),
        (0x4600, struct.pack(">I", 100051) + b"Hola".ljust(32, b"\0") + b"Que tal".ljust(512, b"\0") + bytes(64)),
        (0x4610, b""), (0x4620, b""),
        (0x4550, b"Dragones".ljust(16, b"\0")), (0x4558, b""),
        (0x4554, struct.pack(">I", pb)),                                   # invite B
        (0x4400, bytes([0, 0]) + bytes(4) + struct.pack(">I", 0) + bytes(4) + b"@1hola a todos\0"),
        (0x4400, bytes([0, 3]) + bytes(4) + struct.pack(">I", 100051) + bytes(4) + b"hola yugi\0"),
        (0x3603, struct.pack(">III", 2, pb, 100054)),
        (0x4150, struct.pack(">I", pb)),
    ], settle=1.0, last=0x4160)
    inv = b.wait(0x4567, timeout=5)
    _all(b, [
        (0x4568, struct.pack(">I", 1) + (inv[:4] + inv[20:24] if inv else bytes(8))),   # accept the team invite
        (0x4558, b""),
        (0x4510, struct.pack(">I", pa)),                                    # friend request to A
        (0x4400, bytes([0, 5]) + bytes(12) + b"equipo!\0"),                 # team chat
        (0x5210, struct.pack(">IB", 2, 1)),
    ], settle=1.0, last=0x4140)
    _all(a, [(0x4513, struct.pack(">Ii", pb, 1)), (0x4510, struct.pack(">I", 100054))], settle=2.5, last=0x4515)   # NPC accepts at 1.5 s
    _all(b, [(0x4569, b""), (0x4558, b"")], settle=1.0, last=0x4565)        # B leaves the team
    _all(a, [(0x4552, b""), (0x4558, b"")], settle=1.0, last=0x4565)        # A disbands it
    for X in (A, B):
        X.room.send(0x0003)
        time.sleep(0.2)
        X.room.close()
    return [("tienda", True)]


def run_predeploy(offset, host="127.0.0.1"):
    """parity/predeploy.py's game part (no sign-in: DEV): two new players, an NPC duel, then a PvP match."""
    import predeploy as S
    A = fc.FakeClient("A", bytes(range(32)), host, offset)
    B = fc.FakeClient("B", bytes([0xA5] * 16 + list(range(16))), host, offset)
    S.player(fc, A, "Staging")
    S.player(fc, B, "Staging B")
    S.npc_duel(fc, A)
    S.pvp_duel(fc, A, B)
    S.step(not (A.errors + B.errors), "message numbering")
    return [("predeploy", True)]
