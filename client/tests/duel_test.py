"""Checks src/duel against YOLaucher, deterministically:
  - every CNetDuel builder, byte for byte, against the formats the duel server parses (translator.on_client's
    struct layouts, pvp_match's deck reader, fake_client's own requests);
  - every CNetDuel parser fed with the server's OWN builders (research/lockstep proposal.py: setcommand/engine,
    comid_field/hand, timeup_warning, duelsvrinfomsg, duelscore, jyanken_result; pvp_match's 0x600c/0x6006 layouts;
    translator's 0x6610 card lists), framed by proto.pack with real sequence numbers;
  - the exe's field offsets (static_assert): src/duel compiled for i686 with i686-w64-mingw32-g++.
Run: python3.12 -I tests/duel_test.py   (needs c++ and i686-w64-mingw32-g++ on PATH)
"""
import glob
import os
import struct
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")
CARDS = os.environ.get("YO2_CARD_BIN", "/Users/y/Documents/GitHub/duel-evolution-restore/extraction/recovery/out_2008/"
                       "CHG/merge/data/bin#")
EMU = os.environ.get("YO2_EMU_DIR", "/Users/y/Documents/GitHub/YOLaucher-web/tools/yo2emu")
sys.path.insert(0, EMU)
sys.path.insert(0, os.path.join(EMU, "research", "traductor"))
import proto  # noqa: E402
import translator  # noqa: E402  (loads research_lockstep = proposal.py)
import research_lockstep as LS  # noqa: E402

W = proto.W


def frames(msgs, first=1):
    return b"".join(proto.pack(m, d, first + i) for i, (m, d) in enumerate(msgs)).hex()


def compile_cli(tmp):
    srcs = [os.path.join(SRC, "duel", "NetDuel.cpp")] + [
        os.path.join(SRC, "Net", n) for n in ("MessageIO.cpp", "ygpacket.cpp")]
    for s in sorted(glob.glob(os.path.join(SRC, "duel", "*.cpp"))):   # the engine and CNetDuel must build for i686
        if os.path.basename(s).startswith("Scene"):   # (the scene files have their own test)
            continue
        subprocess.check_call(["i686-w64-mingw32-g++", "-std=c++17", "-Wall", "-Werror", "-fsyntax-only", "-I", SRC, s])
    exe = os.path.join(tmp, "duel_cli")
    subprocess.check_call(["c++", "-std=c++17", "-O1", "-g", "-Wall", "-Wextra", "-Werror",
                           "-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-I", SRC,
                           os.path.join(HERE, "duel_cli.cpp"), *srcs, "-o", exe])
    return exe


def run_script(exe, lines):
    out = subprocess.run([exe, "script"], input="\n".join(lines) + "\n", capture_output=True, text=True, check=True)
    return out.stdout.splitlines()


def kv(line):
    return dict(f.split("=", 1) for f in line.split()[1:] if "=" in f)


# ---------------------------------------------------------------- builders
def check_builders(exe):
    main, extra = [1, 0x0102, 0xfffe], [10, 11]
    exp = {
        "key": [(0x6004, bytes(range(0x10, 0x20)))],
        "booked": [(0x6001, struct.pack(">I", 1001))],
        "prepare": [(0x600b, b"")],
        "gotojanken": [(0x6100, b"")],
        "hand": [(0x6101, b"\2")],
        "gotoselectfirst": [(0x6102, b"")],
        "selectfirst": [(0x6103, b"\1")],
        "gotoduelstart": [(0x6104, b"")],
        "phase": [(0x002e, struct.pack(">I", 4))],
        "move": [(0x6350, struct.pack(">4I", 0, 0xb, 2, 4))],
        "move_none": [(0x6350, struct.pack(">4I", 0, 3, 0, 0xffffffff))],
        "pass": [(0x6351, b"")],
        "debugcard": [(0x61ff, struct.pack(">5I", 1, 2, 3, 4, 5))],
        "debug": [(0x61f0, struct.pack(">4I", 6, 7, 8, 9))],
        "ready": [(0x61fe, b"\1")],
        "number": [(0x6426, struct.pack(">I", 0xfffffffe))],
        "cardvalue": [(0x6432, struct.pack(">2I", 4007, 3))],
        "choice": [(0x6423, struct.pack(">I", 5))],
        "watch": [(0x6700, b"")],
        "watchping": [(0x6702, b"")],
        "watchping_again": [],
        "watch6703": [(0x6703, b"")],
        "6495": [(0x6495, b"\x09")],
        # fake_client.py's deck (lines 992-994), which pvp_match reads back
        "deck": [(0x6600, struct.pack(">III", len(main), 0, len(extra))),
                 (0x6601, struct.pack(">I%dH" % len(main), len(main), *main)),
                 (0x6603, struct.pack(">I%dH" % len(extra), len(extra), *extra))],
        "deck_spectator": [],
        "janken_replay": [],
        "empty": [(0x6351, b"")],
        "searchack": [(0x6013, b"\1")],
    }
    got = dict(l.split(" ", 1) if " " in l else (l, "") for l in
               subprocess.check_output([exe, "build"], text=True).splitlines())
    assert set(got) == set(exp), set(got) ^ set(exp)
    for k, want in exp.items():
        assert got[k] == frames(want), (k, got[k], frames(want))
    # the server side reads them back
    body = lambda k, i=0: exp[k][i][1]
    p, zone, idx, cmd = struct.unpack(">4I", body("move_none"))   # translator.on_client
    assert (p, zone, idx, -1 if cmd == 0xffffffff else cmd) == (0, 3, 0, -1)
    for k, mid in (("deck", 0x6601), ("deck", 0x6603)):
        data = body(k, 1 if mid == 0x6601 else 2)
        n = min(struct.unpack(">I", data[:4])[0], (len(data) - 4) // 2)   # pvp_match.py deck reader
        assert list(struct.unpack(">%dH" % n, data[4:4 + 2 * n])) == (main if mid == 0x6601 else extra)
    print(f"ok: {len(exp)} CNetDuel builders match the server's formats byte for byte")


# ---------------------------------------------------------------- parsers
def prep_600c():
    """pvp_match.preparation() layout with distinct values"""
    w = W().s("Yugi", 16).s("Kaiba", 16).u32(1001).u32(1002).u32(8000).u32(4000).bytes()
    for parts in ((b"A" * 16, b"B" * 16, bytes(16)), (b"C" * 16, b"D" * 16, b"E" * 16)):
        w += b"".join(parts)
    return w + b"JPN\0" + b"USA\0" + struct.pack(">4I", 1, 2, 3, 4)


def watch_6006():
    out = b""
    for k, (name, parts) in enumerate((("Jaden", b"P" * 32), ("Chazz", b"Q" * 32))):
        out += struct.pack(">HHB", 40 + k, 15 - k, 7 + k)
        out += name.encode().ljust(16, b"\0") + parts + bytes(16) + b"ESP\0"
    return out + bytes([3])


def check_parsers(exe):
    eng = LS.engine(LS.C_DRAW, 1, 0xffff, 5)
    req = LS.request_input(3, 1, 0)
    masks = {(0, 0): 0x10, (0, 5): 0x108, (0, 15): 0x2000, (1, 3): 1}
    reasons = {(0, 0): 4, (1, 3): 9}
    tail = {(0, 3): 1, (0, 5): 1, (1, 9): 7}
    hand = [(0, 0, 0xd8), (0, 4, 0x10), (1, 2, 0x8)]
    lists = ((0, (1, 2, 3)), (1, (9,)))
    fusion = struct.pack(">BIIII", 0, 0xfe, 0, 2, 0) + struct.pack(">4H", 0x0abc, 5, 1, 0) + \
        struct.pack(">4H", 0x3fff, 0xff, 0x1ff, 0)
    window = struct.pack(">BIIII", 1, 6, 2, 1, 3) + struct.pack(">4H", 0x123, 1, 0, 0)
    msgs = [(0x6007, struct.pack(">i", 1)), (0x600c, prep_600c()), (0x6005, struct.pack(">HH", 40, 15)),
            (0x6100, b""), (0x6101, LS.jyanken_result(0, True)), (0x6102, b""), (0x6103, LS.selectfirst_result(1)),
            (0x6104, b""), (0x6202, eng), (0x6202, req), (0x6202, LS.setcommand(0x40, 7, range(1, 9))),
            (0x6611, LS.comid_field(masks, reasons, tail)), (0x6612, LS.comid_hand(hand, lists)),
            (0x6461, LS.timeup_warning(0, 120, 0, 30)), (0x6461, LS.timeup_warning(3, 60, 1)),
            (0x649b, LS.duelsvrinfomsg(1, 1)), (0x6613, LS.duelscore((1, 2, 3, 4), (5, 6, 7, 8), 9)),
            (0x6701, b"\1\2\3"), (0x6610, fusion), (0x6610, window), (0x6016, struct.pack(">I", 3)),
            (0x6017, struct.pack(">6H", 1, 2, 3, 4, 5, 6))]
    out = run_script(exe, ["set mode=2", "set turn=0", f"rx {frames(msgs)}", "dump", "answered 0", "answered 0",
                           "clock 0 0", "clock 1 0", "clock 3 0", "set mode=1", "clock 0 0", "clock 3 0",
                           "set scene=20", "clock 3 0", "pop", "dump"])
    rx = [l for l in out if l.startswith("rx ")]
    assert rx == [f"rx {m:04x} 0" for m, _ in msgs], rx
    tx = [l for l in out if l.startswith("tx ")]
    assert tx == [f"tx {proto.pack(0x6013, b'\1', 1).hex()}{proto.pack(0x6013, b'\1', 2).hex()}"], tx
    dumps = [i for i, l in enumerate(out) if l.startswith("nd ")]
    nd = kv(out[dumps[0]])
    assert nd["flags"] == "1" and nd["first"] == "1" and nd["svr"] == "1" and nd["state"] == "3", nd
    assert nd["req"] == "2,2,2,2,2,2,0" and nd["jseen"] == "1,2,3" and nd["watch"] == "1" and nd["scoreX"] == "9", nd
    assert nd["last"] == "2" and nd["clockWho"] == "3" and nd["search"] == "3/3", nd
    s0, s1 = kv(out[dumps[0] + 1]), kv(out[dumps[0] + 2])
    assert (s0["id"], s0["name"], s0["lp"], s0["s"], s0["country"], s0["v"], s0["score"]) == \
        ("1001", "Yugi", "8000", "A" * 16 + "|" + "B" * 16 + "|", "JPN", "1,2", "1,2,3,4"), s0
    assert (s1["id"], s1["name"], s1["lp"], s1["deck"], s1["janken"], s1["s"], s1["v"]) == \
        ("1002", "Kaiba", "4000", "40,15", "1", "C" * 16 + "|" + "D" * 16 + "|" + "E" * 16, "3,4"), s1
    assert s0["clock"].split(",")[1:] == ["0", "30"] and s0["clock"].split(",")[0] in ("120", "119"), s0
    assert out[dumps[0] + 3] == "global 60 1 -1"
    cmds = [l for l in out[dumps[0]:dumps[1]] if l.startswith("cmd ")]
    assert cmds == ["cmd 0 32853 65535 5 0 0 0 0 0 0", "cmd 26 0 3 1 0 0 0 0 0 0", "cmd 64 7 1 2 3 4 5 6 7 8"], cmds
    c0 = out[dumps[0] + 4 + len(cmds)].split()
    assert c0[2] == "16/4" and c0[7] == "264/255" and c0[13] == "0/0" and c0[17] == "8192/255", c0
    assert c0[19] == "00000001000100000000" and c0[21:23] == ["0:216", "4:16"], c0
    assert c0[24].startswith("010203") and set(c0[24][6:]) == {"0"}, c0
    c1 = out[dumps[0] + 5 + len(cmds)].split()
    assert c1[5] == "1/9" and c1[19] == "00000000000000000007" and c1[21] == "2:8" and c1[23].startswith("09"), c1
    fl, wl = out[dumps[0] + 6 + len(cmds)].split(), out[dumps[0] + 7 + len(cmds)].split()
    assert fl[1:] == ["b=0", "mode=254", "x=0", "n=2", "y=0", f"{5 << 23 | 1 << 14 | 0xabc:08x}",
                      f"{0xff << 23 | 0x1ff << 14 | 0x3fff:08x}"], fl
    assert wl[1:] == ["b=1", "mode=6", "x=2", "n=1", "y=3", f"{1 << 23 | 0x123:08x}"], wl
    assert [l for l in out if l.startswith("search")] [:3] == ["search 1 2", "search 3 4", "search 5 6"]
    assert [l for l in out if l.startswith("answered")] == ["answered 0 1", "answered 0 0"]
    clocks = [l for l in out if l.startswith("clock")]
    assert clocks[:3] == ["clock 120 30", "clock -1 0", "clock 60 -1"], clocks
    assert clocks[3:6] == ["clock -1 -1", "clock -1 -1", "clock 60 -1"], clocks
    after = [l for l in out[dumps[1]:] if l.startswith("cmd ")]
    assert after == cmds[1:] and kv(out[dumps[1]])["last"] == "1", after
    print(f"ok: {len(msgs)} server messages parsed (proposal.py / pvp_match / translator builders)")


def check_guards(exe):
    """inputs the original would overflow on: they must be read and dropped, not written out of bounds"""
    big_hand = W().u16(3).u8(0).u16(79).u16(1).u8(2).u16(0).u16(2).u8(0).u16(80).u16(3).bytes() + \
        bytes([5, 1, 9, 0, 0])
    bad_clock = LS.timeup_warning(2, 10)
    full = [(0x6202, LS.engine(1))] * 513
    out = run_script(exe, [f"rx {frames([(0x6612, big_hand), (0x6461, bad_clock)] + full)}", "dump"])
    nd = kv(next(l for l in out if l.startswith("nd ")))
    assert nd["last"] == "511" and nd["clockWho"] == "0", nd
    c0 = next(l for l in out if l.startswith("comid0")).split()
    assert c0[21:] == ["79:1", "list", "00" * 80], c0
    hp = subprocess.check_output([exe, "hexpairs", "1234ABCDF0x9"], text=True).split()
    assert hp == ["4321", "dcba", "900f", "0000"], hp
    print("ok: out-of-range hand indexes, clock sides, a full queue and odd hex strings are refused safely")


def check_text(tmp):
    """src/duel/DuelText.cpp: the duel's text formatting on literal strings (tests/duel_text_cli.cpp)"""
    exe = os.path.join(tmp, "duel_text")
    subprocess.check_call(["c++", "-std=c++17", "-g", "-Wall", "-Wextra", "-Werror", "-fsanitize=address,undefined",
                           "-I", SRC, os.path.join(HERE, "duel_text_cli.cpp"), os.path.join(SRC, "duel", "DuelText.cpp"),
                           os.path.join(SRC, "duel", "CardDB.cpp"), "-o", exe])
    print(subprocess.check_output([exe, CARDS], text=True).strip())


def main():
    with tempfile.TemporaryDirectory() as tmp:
        exe = compile_cli(tmp)
        check_builders(exe)
        check_parsers(exe)
        check_guards(exe)
        check_text(tmp)


if __name__ == "__main__":
    main()
