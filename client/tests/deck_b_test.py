"""Checks src/Deck part B (CTradeScene + CWindowTaskTrade) against YOLaucher's trade protocol, deterministically:
  - the whole flow of research/intercambio/NOTES.md section 4, driven by setting the lobby's request bytes and trade
    block the way the 0x71xx parsers do: what the scene sends (byte for byte against proto.pack of the 0x7000
    envelope; the 0x7119 lists are read back with proposal.py's own struct format), its state after each answer,
    and what the window shows;
  - the exits: the partner leaving (0x7112), the server closing the trade (-1010), "No" in the final dialog, a
    cancelled TRADEEND, the close button;
  - the window's rows (add/remove/swap/layout/ids) and its 10-card counters;
  - the exe's field offsets (static_assert): src/Deck compiled for i686 with i686-w64-mingw32-g++.
Run: python3.12 -I tests/deck_b_test.py   (needs c++ and i686-w64-mingw32-g++ on PATH)
"""
import glob
import os
import re
import struct
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")
EMU = os.environ.get("YO2_EMU_DIR", os.path.expanduser("~") + "/Documents/GitHub/YOLaucher-web/tools/yo2emu")
sys.path.insert(0, EMU)
import proto  # noqa: E402

DECK_B = ["TradeEntry.cpp", "TradeWindow.cpp", "CardSwapEntry.cpp", "PresentEntry.cpp", "TpEntry.cpp"]


def compile_cli(tmp):
    deck = [os.path.join(SRC, "Deck", n) for n in DECK_B if os.path.exists(os.path.join(SRC, "Deck", n))]
    for s in deck:
        subprocess.check_call(["i686-w64-mingw32-g++", "-std=c++17", "-Wall", "-Werror", "-fsyntax-only", "-I", SRC, s])
    exe = os.path.join(tmp, "deck_b_cli")
    subprocess.check_call(["c++", "-std=c++17", "-O1", "-g", "-Wall", "-Wextra", "-Werror",
                           "-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-I", SRC,
                           os.path.join(HERE, "deck_b_cli.cpp"), os.path.join(HERE, "deck_b_net_hooks.cpp"), *deck,
                           os.path.join(SRC, "duel", "CardDB.cpp"),   # the limitation tables Net fills
                           os.path.join(SRC, "Game", "yo2GameData.cpp"),   # its file reader
                           os.path.join(SRC, "Game", "Avatar", "yo2AvatarData.cpp"),   # Net's CAvatarData
                           os.path.join(SRC, "System", "yo2Debug.cpp"),   # its asserts
                           # the message layer only: Net's tasks (*Task*, requests, downloads) need System and the app
                           *sorted(f for f in glob.glob(os.path.join(SRC, "Net", "*.cpp"))
                                   if not re.search(r"Task|Request|Download|ConnectLobby|CheckDisconnect|Usb", f)), "-o", exe])
    return exe


def run(exe, steps):
    out = subprocess.run([exe, "script"], input="\n".join(steps) + "\n", capture_output=True, text=True, check=True)
    return out.stdout.splitlines()


class Seq:
    """the lobby connection's send counter, to frame what we expect with proto.pack"""
    def __init__(self):
        self.n = 0

    def t(self, sub, body=b""):
        self.n += 1
        return proto.pack(0x7000, struct.pack(">H", sub) + body, self.n).hex()


def dumps(lines):
    """every dump as a dict: state, win line, tx hex, req bytes"""
    res = []
    for i, l in enumerate(lines):
        if l.startswith("scene "):
            d = dict(f.split("=", 1) for f in l.split()[1:])
            d["win"] = lines[i + 1]
            d["tx"] = lines[i + 2][3:]
            d["req"] = [int(x) for x in lines[i + 3].split()[1:]]
            d["ui"] = []
            res.append(d)
        elif l.startswith("ui ") and res:
            res[-1].setdefault("ui_after", []).append(l[3:])
    return res


def ui_between(lines, a, b):
    """ui lines between dump a and dump b (0-based dump indexes; a = -1 from the start)"""
    idx = [i for i, l in enumerate(lines) if l.startswith("scene ")]
    lo = idx[a] if a >= 0 else 0
    return [l[3:] for l in lines[lo:idx[b]] if l.startswith("ui ")]


def last_confirm_lists(body):
    """proposal.py's 0x7119 reader (h_lastconfirm): u8 + 20 x s32"""
    vals = list(struct.unpack(">20i", body[1:81]))
    return body[0], vals[:10], vals[10:]


# ---------------------------------------------------------------- the happy path
def check_flow(exe):
    s = Seq()
    steps = ["start", "trunk 1 3", "trunk 3256 1", "limit 1 1",
             "step", "dump",                                   # 0: state 1 -> 3, TRADEREADY
             "step", "dump",                                   # 1: nothing yet
             "ans 5f", "step", "dump",                         # 2: trunk -> 4
             "ans 62", "step", "dump",                         # 3: limit -> TRADESTART, 2
             "ans 4f", "step", "dump",                         # 4: 0x7133 -> 9
             "drag add 1234 400 400", "update", "dump",        # 5: my card -> ADDCARD
             "drag add 55 100 100", "update", "dump",          # 6: dropped outside: nothing
             "tb otherMove 77", "tb otherMoveKind 0", "ans 59", "step", "dump",   # 7: partner adds 77 -> ARRIVE
             "tb otherMove 88", "ans 59", "step", "dump",      # 8: partner adds 88
             "tb otherMove 0", "tb otherMoveKind 1", "ans 59", "step", "dump",    # 9: partner removes index 0
             "tb otherStatus 1", "ans 63", "step", "dump",     # 10: partner ready lamp
             "result 3a 0", "ans 56", "step", "dump",          # 11: my ADDCARD answered
             "state 10", "tb myStatus 1", "ans 5a", "step", "dump",   # 12: my ready answered -> 0xb
             "ans 5b", "step", "dump",                         # 13: all ready -> yes/no, 0xc
             "dlg yesno 4000", "update", "dump",               # 14: yes -> 0x7119 1 + lists
             "dlg yesno 0", "tb confirm 3", "ans 5c", "step", "dump",   # 15: 0x7120 3 -> 0xd + 0x7119 0
             "tb tradeEnd 1", "ans 5d", "step", "dump",        # 16: completed: rows swap, dialog
             "dlg end 4002", "update", "dump",                 # 17: dialog closed -> 0xf
             "ans 5f", "step", "dump"]                         # 18: new trunk -> decks, leave
    lines = run(exe, steps)
    d = dumps(lines)
    st = [int(x["state"]) for x in d]
    assert st == [3, 3, 4, 2, 9, 9, 9, 9, 9, 9, 9, 9, 0xb, 0xc, 0xc, 0xd, 0xe, 0xf, 0], st
    assert d[0]["tx"] == s.t(0x7132), d[0]["tx"]
    assert d[0]["req"][0] == 1   # +0x4e: TRADEREADY sent (nothing answers it in the client)
    assert all(x["tx"] == "" for x in (d[1], d[2], d[4], d[6], d[10], d[11], d[12], d[13], d[16], d[17], d[18]))
    assert d[3]["tx"] == s.t(0x7101), d[3]["tx"]
    assert "kabanload 3/1 1/0" in ui_between(lines, 2, 3)
    assert d[5]["tx"] == s.t(0x7113, struct.pack(">H", 1234)), d[5]["tx"]   # proposal: u16 card id
    assert "offer 1234 1" in ui_between(lines, 4, 5)
    assert d[7]["tx"] == s.t(0x7122) and d[8]["tx"] == s.t(0x7122)
    assert d[9]["tx"] == s.t(0x7122)
    assert "other=88@262,52,2L mine=1234@262,340,2L" in d[9]["win"], d[9]["win"]
    assert d[8]["win"].startswith("win counts=2,1"), d[8]["win"]
    assert "lamp 1 0" in ui_between(lines, 9, 10) and "lamp 2 1" in ui_between(lines, 9, 10)
    assert d[12]["win"].startswith("win counts=1,1 ready=1"), d[12]["win"]
    assert "yesno 4000 fa1" in ui_between(lines, 12, 13) and d[13]["busy"] == "1"
    assert d[13]["req"][0x5b - 0x4e] == 0
    # 0x7119 yes: my row then theirs, -1 padded; proposal.py reads them back
    want = s.t(0x7119, struct.pack(">B20i", 1, 1234, *[-1] * 9, 88, *[-1] * 9))
    assert d[14]["tx"] == want, (d[14]["tx"], want)
    body = struct.pack(">B20i", 1, 1234, *[-1] * 9, 88, *[-1] * 9)
    assert last_confirm_lists(body) == (1, [1234] + [-1] * 9, [88] + [-1] * 9)
    assert d[15]["tx"] == s.t(0x7119, struct.pack(">B20i", 0, *[-1] * 20)), d[15]["tx"]   # the reset after 0x7120
    assert "enddialog 141b" in ui_between(lines, 15, 16) and d[16]["completed"] == "1"
    assert "other=1234@262,52,2L mine=88@262,340,2L" in d[16]["win"], d[16]["win"]   # the rows traded places
    assert ui_between(lines, 17, 18) == ["applydecks", "leave"], ui_between(lines, 17, 18)
    assert d[18]["win"] == "win counts=0,1 ready=1 other= mine=", d[18]["win"]
    print(f"ok: trade flow, {len(d)} steps: TRADEREADY..TRADEEND, {s.n} messages byte for byte")


# ---------------------------------------------------------------- exits
def check_exits(exe):
    base = ["start", "step", "ans 5f", "step", "ans 62", "step", "ans 4f", "step"]
    # the partner leaves while editing (0x7112): dialog, state 0x11; its OK -> 0x10 -> leave
    lines = run(exe, base + ["win addother 5", "ans 5e", "step", "dump", "dlg left 4002", "update", "dump"])
    d = dumps(lines)
    assert d[0]["state"] == "17" and d[0]["left"] == "1" and d[0]["busy"] == "1", d[0]
    assert d[0]["win"].startswith("win counts=0,0") and "okdialog 1426" in ui_between(lines, -1, 0)
    assert d[1]["state"] == "0" and "leave" in ui_between(lines, 0, 1), d[1]
    # the server refuses my card with -1010: the scene closes
    lines = run(exe, base + ["result 3a -1010", "ans 56", "step", "dump", "step", "dump"])
    d = dumps(lines)
    assert (d[0]["state"], d[0]["closing"], d[1]["state"]) == ("16", "1", "0"), d
    # "No" in the final dialog -> 0x7119 2 with -1 lists; 0x7120 2 -> back to editing, ready off
    s = Seq()
    for _ in range(2):
        s.t(0)   # TRADEREADY, TRADESTART
    lines = run(exe, base + ["dump", "state 11", "ans 5b", "step", "dlg yesno 4001", "update", "dump",
                             "dlg yesno 0", "tb confirm 2", "ans 5c", "step", "dump"])
    d = dumps(lines)
    assert d[1]["tx"] == s.t(0x7119, struct.pack(">B20i", 2, *[-1] * 20)), d[1]["tx"]
    assert d[2]["state"] == "9" and d[2]["win"].startswith("win counts=0,0 ready=0"), d[2]
    assert d[2]["tx"] == s.t(0x7119, struct.pack(">B20i", 0, *[-1] * 20))
    # TRADEEND 0: "Trade Cancelled", no swap, then 0x10
    lines = run(exe, base + ["win addmine 7", "state 13", "tb tradeEnd 0", "ans 5d", "step", "dump",
                             "dlg end 4002", "update", "dump"])
    d = dumps(lines)
    assert "enddialog 141c" in ui_between(lines, -1, 0) and d[0]["completed"] == "0"
    # the dialog's OK sets 0x10 and the same update runs it: straight back to the lobby
    assert [x["state"] for x in d] == ["14", "0"] and "leave" in ui_between(lines, 0, 1), d
    # the close button: 0x7112 while trading, nothing once the trade is over
    s = Seq()
    s.t(0), s.t(0)
    lines = run(exe, base + ["dump", "close", "dump"])
    d = dumps(lines)
    assert d[1]["tx"] == s.t(0x7112) and d[1]["state"] == "0" and d[1]["closing"] == "1", d[1]
    lines = run(exe, base + ["dump", "state 14", "close", "dump"])
    assert dumps(lines)[1]["tx"] == ""
    # withdrawing one of my cards: dropped on the card box -> DELETECARD by index; elsewhere -> back to its slot
    s = Seq()
    s.t(0), s.t(0)
    lines = run(exe, base + ["dump", "drag add 10 400 400", "update", "drag add 11 400 400", "update", "dump",
                             "drag del 0 800 300", "update", "dump", "drag del 0 100 100", "update", "dump"])
    d = dumps(lines)
    assert d[1]["tx"] == s.t(0x7113, struct.pack(">H", 10)) + s.t(0x7113, struct.pack(">H", 11))
    assert d[2]["tx"] == s.t(0x7114, struct.pack(">H", 0)) and "mine=11@262,340,2L" in d[2]["win"], d[2]
    assert d[3]["tx"] == "" and "mine=11@262,340,2L" in d[3]["win"]
    print("ok: partner exit, -1010, final No, cancelled TRADEEND, close button, card withdrawal")


# ---------------------------------------------------------------- the window alone
def check_window(exe):
    steps = ["start"] + [f"win addmine {c}" for c in range(1, 13)] + ["win layout", "dump", "win count 3", "win ready 1", "dump",
             "win delmine 20", "win delmine 0", "dump", "win addother 900", "win addother 901", "win ids",
             "win swap", "dump", "win clear", "dump"]
    lines = run(exe, steps)
    d = dumps(lines)
    assert d[0]["win"].startswith("win counts=0,10"), d[0]["win"]   # the counter stops at 10, the row does not
    mine = re.search(r"mine=(\S*)", d[0]["win"]).group(1).split(";")
    assert len(mine) == 12 and mine[0] == "1@262,340,2" and mine[1] == "2@334,348,3" and mine[-1].endswith("L"), mine
    assert "count 1" in lines
    mine = re.search(r"mine=(\S*)", d[1]["win"]).group(1).split(";")
    assert mine[1] == "2@302,348,3", mine   # ready: step 40
    assert d[2]["win"].startswith("win counts=0,9"), d[2]["win"]
    ids = next(l for l in lines if l.startswith("ids")).split()
    assert ids[1:3] == ["900", "901"] and ids[12:15] == ["2", "3", "4"] and len(ids) == 22, ids
    assert d[3]["win"].startswith("win counts=2,9") and "other=2@" in d[3]["win"] and "mine=900@" in d[3]["win"]
    assert d[4]["win"] == "win counts=0,0 ready=1 other= mine=", d[4]["win"]
    print("ok: trade window rows, counters, layout and ids")


# ---------------------------------------------------------------- TP prize claim
def check_tp(exe):
    def claim(rank, p240, p242, cards=(4007, 12, 99)):
        steps = ["start", f"tp 3 {rank} {p240} {p242}"]
        for c in cards:
            steps += [f"drag add {c} 400 400", "tpupdate"]
        steps += ["tpdump", "tpconfirm", "dlg tp 4000", "tpupdate", "tpdump"]
        lines = run(exe, steps)
        dd = [l for l in lines if l.startswith("tp ") or l.startswith("tx ")]
        return dd, lines
    want = lambda kind, cards: proto.pack(0x8303, struct.pack(">B3H", kind, *cards), 1).hex()
    dd, lines = claim(5, 0, 0, (4007, 12, 99, 7))   # the 4th card does not fit (max 3)
    assert dd[0] == "tp busy=0 cards=4007,12,99, pbin=0,0" and dd[1] == "tx ", dd
    assert dd[3] == "tx " + want(0, (4007, 12, 99)), dd     # ranked 1..1000: kind 0
    dd, lines = claim(0, 1, 1)
    assert dd[3] == "tx " + want(1, (4007, 12, 99)) and "pbin=0,1" in dd[2], dd   # TP100 right used up
    dd, lines = claim(2000, 0, 1)
    assert dd[3] == "tx " + want(2, (4007, 12, 99)) and "pbin=0,0" in dd[2], dd   # > 1000 = unranked: TP500
    dd, lines = claim(0, 0, 0)
    assert dd[3] == "tx " and "return" in [l[3:] for l in lines if l.startswith("ui ")], dd   # nothing to claim
    print("ok: TP prize claim: REQTPCARDGET kind by ranking / PBIN 0x240 / 0x242, the window's card limit")


def main():
    with tempfile.TemporaryDirectory() as tmp:
        exe = compile_cli(tmp)
        check_flow(exe)
        check_exits(exe)
        check_window(exe)
        check_tp(exe)


if __name__ == "__main__":
    main()
