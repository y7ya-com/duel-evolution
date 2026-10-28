"""src/duel cases (the duel session's file).

The engine works on the exe's own block at 0x012c7880 (g_eng in the i686 build), so a case writes a board there, calls
the function on each side and the tester compares the block with the rest of .data. The card tables are the CBinFile
objects FUN_0073b640 fills; a case points them at the real 2008 card_prop.bin / card_intid.bin.
"""
import os
import random
import struct

from core import case

CARDS = os.environ.get("YO2_CARD_BIN", "/Users/y/Documents/GitHub/duel-evolution-restore/extraction/recovery/out_2008/"
                       "CHG/merge/data/bin#")
_PROP = open(os.path.join(CARDS, "card_prop.bin"), "rb").read()
_INTID = open(os.path.join(CARDS, "card_intid.bin"), "rb").read()
_GENRE = open(os.path.join(CARDS, "card_genre.bin"), "rb").read()
IDS = [3000 + i for i in range(len(_INTID) // 2) if struct.unpack_from("<H", _INTID, i * 2)[0]]

PL, PSZ = 0x012C8880, 0xE0C                     # EngPlayer j at PL + j * PSZ
PILES = {"hand": (0x0C, 0x124, 160), "deck": (0x10, 0x3A4, 160), "grave": (0x14, 0x69C, 190),
         "extra": (0x18, 0x624, 30), "banish": (0x1C, 0x994, 190)}   # count offset, array offset, capacity
APP = 0x012711AC                                 # the app object: +0xc6c scene, +0xc70 CNetDuel


def card_db(e):
    for obj, data in ((0x012A1140, _PROP), (0x012A1100, _INTID), (0x012A10C0, _GENRE)):
        e.w32(obj + 0x18, e.alloc(data))
        e.w32(obj + 0x1C, len(data))
        e.write(obj + 0x34, b"\0")


def app(e):
    """a zeroed app object with a scene and a CNetDuel (not replaying: ndLogScene() = -1)"""
    a = e.alloc(0x1000)
    e.w32(APP, a)
    e.w32(a + 0xC6C, e.alloc(0xA00))
    e.w32(a + 0xC70, e.alloc(0xD800))


def board(e, seed, fill=1.0):
    """a random board: both players' piles (unique serials), field slots with positions / flags, no effect nodes"""
    rnd = random.Random(seed)
    card_db(e)
    app(e)
    words = {}
    for j in (0, 1):
        base, serial = PL + j * PSZ, 1
        e.w32(base, rnd.choice((0, 100, 4000, 8000)))
        for name, (cnt, arr, cap) in PILES.items():
            n = rnd.randint(0, int(min(cap, 12 if name != "deck" else 30) * fill))
            ws = []
            for _ in range(n):
                w = rnd.choice(IDS) | j << 14 | (serial & 0xFF) << 23 | (0x400000 if rnd.random() < 0.15 else 0)
                serial += 1
                ws.append(w)
            e.write(base + arr, b"".join(struct.pack("<I", w) for w in ws))
            e.w32(base + cnt, n)
            words[j, name] = ws
            if name == "banish":
                e.write(base + 0xC8C, bytes(rnd.choice((0, 0x40, 0x80, 0xC0)) for _ in range(2 * n)))
        for s in range(11):
            if rnd.random() < 0.5 * fill:
                w = rnd.choice(IDS) | j << 14 | (serial & 0xFF) << 23
                serial += 1
                e.write(base + 0x34 + s * 0x14, struct.pack("<IHHHHII", w, rnd.randint(1, 60), rnd.randint(0, 1),
                                                            rnd.randint(0, 1), 0, rnd.randint(0, 3),
                                                            rnd.choice((0, 0, 4, 8, 0x40, 0x80, 0x100))))
        e.w32(base + 4, serial)
        e.w32(base + 8, serial - 1)
    return rnd, words


# ---- card database
for _addr in (0x73B600, 0x73BBE0, 0x73BF20, 0x73BF80, 0x73BFB0, 0x73BFE0, 0x73C010, 0x73C040, 0x73C080, 0x73C0C0,
              0x73C100):
    @case(_addr, params=[0, 1, 2])
    def card_field(e, f, part):
        card_db(e)
        ids = IDS[part::3] + ([0, 1, 2999, 3000, 0x13FB, 0x1B77, 0xF56, 0x3FFF] if part == 0 else [])
        return [f(i) for i in ids]


@case(0x73BC50, params=[0, 1])
def card_prop_id(e, f, part):
    card_db(e)
    return [f(k) for k in range(part * 1000, part * 1000 + 1000)]


@case(0x73BF50, params=[0])
def card_prop(e, f, _):
    card_db(e)
    base = e.u32(0x012A1140 + 0x18)
    return [f(i) - base for i in IDS[:400] + [0, 2999]]


@case(0x73C140, params=list(range(0, 64, 7)) + [-1, -33])
def card_bit(e, f, bit):
    card_db(e)
    return [f(i, bit) for i in IDS[::5]]


# ---- text (narrow): pointers only (ids need the DLG tables)
def _cstr(e, a):
    n = 0
    while e.read(a + n, 1) != b"\0":
        n += 1
    return e.read(a, n)


def _crt_strings(e):
    """the rewrite's strcpy / strcat (the exe inlines its own); same results on both sides"""
    def strcpy(e, d, s):
        e.write(d, _cstr(e, s) + b"\0")
        return d

    def strcat(e, d, s):
        e.write(d + len(_cstr(e, d)), _cstr(e, s) + b"\0")
        return d
    e.on_import("strcpy", strcpy, 2)
    e.on_import("strcat", strcat, 2)


def _str(e, s):
    _crt_strings(e)
    return e.alloc(s.encode("latin1") + b"\0" * 8)


@case(0x745E50, params=["", "abc", "@3x@0y"])
def text_copy(e, f, s):
    d = e.alloc(64)
    f(d, _str(e, s))
    return e.read(d, 64)


@case(0x745EA0, params=["", "tail"])
def text_append(e, f, s):
    d = _str(e, "head" + "\0" * 40)
    f(d, _str(e, s))
    return e.read(d, 48)


@case(0x745F10, params=[("x %s y", "MID"), ("no marker", "M"), ("%s", ""), ("a%sb%s", "Q")])
def text_format_s(e, f, p):
    d = e.alloc(64)
    f(d, _str(e, p[0]), _str(e, p[1]))
    return e.read(d, 64)


@case(0x746130, params=[("LP %d", 8000), ("%d", 0), ("x%dy", -1500), ("none", 5), ("%d%d", 123456789)])
def text_format_d(e, f, p):
    d = e.alloc(64)
    f(d, _str(e, p[0]), p[1])
    return e.read(d, 64)


@case(0x7461B0, params=[0, 7, 10, 99999, -5, -12345])
def text_append_int(e, f, n):
    d = _str(e, "n=" + "\0" * 30)
    f(d, n)
    return e.read(d, 32)


@case(0x746230, params=["@3Summon@0 this", "plain", "@x@9@", "@"])
def text_strip(e, f, s):
    d = e.alloc(64)
    f(d, _str(e, s))
    return e.read(d, 64)


# ---- engine primitives on random boards
@case(0x6EAF00, params=[(0, 5), (1, 0xFF), (0, 0x100), (1, 1)])
def next_serial(e, f, p):
    j, start = p
    board(e, 7)
    e.w32(PL + (j & 1) * PSZ + 4, start)
    return [f(j) for _ in range(3)]


def _pile_case(addr, name, kind):
    @case(addr, params=list(range(8)))
    def pile(e, f, seed):
        rnd, words = board(e, seed)
        out = []
        for j in (0, 1, 2, 3):   # j & 1, as the exe masks
            ws = words[j & 1, name]
            if kind == "index":
                for i in (0, len(ws) - 1, len(ws), 200):
                    out.append(f(j, i & 0xFFFFFFFF))
            elif kind == "word":
                pick = ws[rnd.randrange(len(ws))] if ws else 0x1234
                p = e.alloc(struct.pack("<I", pick))
                out.append(f(j, p))
                out.append(f(j, e.alloc(struct.pack("<I", 0xDEAD))))
            else:   # uid; the to-top functions are void (EAX is left over): only the pile is compared
                uid = (ws[rnd.randrange(len(ws))] >> 14 & 1) + (ws[rnd.randrange(len(ws))] >> 23 & 0xFF) * 2 if ws else 9
                f(j, uid)
        return out


_pile_case(0x6F7AD0, "grave", "index")
_pile_case(0x6F7B70, "grave", "word")
_pile_case(0x6F7C10, "grave", "uid")
_pile_case(0x6F7D20, "banish", "uid")
_pile_case(0x6F82D0, "banish", "index")
_pile_case(0x6F83B0, "banish", "word")
_pile_case(0x6F9750, "hand", "word")


for _addr in (0x6F8520, 0x6F9E90, 0x6F8C00):   # graveyard / hand / banished monsters
    @case(_addr, params=list(range(6)))
    def per_player(e, f, seed):
        board(e, seed)
        return [f(j) for j in (0, 1)]


@case(0x704F20, params=list(range(4)))
def deck_forget(e, f, seed):   # void: EAX is whatever the loop left; the deck words are compared with the block
    board(e, seed)
    for j in (0, 1, 2):
        f(j)


for _addr in (0x6F9AD0, 0x6F9B70):   # hand cards of race / attribute k
    @case(_addr, params=list(range(4)))
    def hand_count(e, f, seed):
        board(e, seed)
        return [f(j, k) for j in (0, 1) for k in range(0, 24, 3)]


@case(0x720850, params=[0, 1, 0x7FFFFFFF])
def rand(e, f, seed):
    e.w32(0x012CC2C8, seed)
    return [f() for _ in range(8)]


@case(0x720890, params=[1, 2, 40, 0x10000])
def rand_n(e, f, n):
    e.w32(0x012CC2C8, 12345)
    return [f(n) for _ in range(8)]


@case(0x704100, params=[0])
def boost_icon(e, f, _):
    return [f(c) for c in range(0x10E0, 0x1E00, 3)]


@case(0x6FA3C0, params=[0x172F, 0xEA9, 0x1472, 0x1636, 0x1809, 0x1ACA, 0x1000])
def token_stats(e, f, card):
    st = e.alloc(b"\x5a" * 0x34)
    f(card, st)
    return e.read(st, 0x34)


# ---- effective numbers
STAT_KEYS = [int(k, 16) for k in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "duel_stat_keys.txt"))
             .read().split()]


def nodes(e, rnd, n=250):
    """effect nodes (0x012cb8c8, 10 B each: key, kind, b3, value, stamp, next) chained onto random slots: keys from
    the cards engStats / the boosts know, kinds 1..12 (some with a turn count in the high nibble), slot-tied keys
    (slot << 8 | player) for the field / equip kinds"""
    NODE, SLOT = 0x012CB8C8, lambda j, s: PL + j * PSZ + 0x34 + s * 0x14
    heads = {}
    for i in range(1, n + 1):
        kind = rnd.choice((1, 2, 3, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 12)) | (rnd.choice((0, 0, 0x10, 0x20)) & 0xF0)
        if kind & 0xF in (6, 7, 8, 9, 10, 11, 12) and rnd.random() < 0.7:
            key = rnd.randint(0, 1) | rnd.randint(0, 10) << 8
        else:
            key = rnd.choice(STAT_KEYS)
        j, s = rnd.randint(0, 1), rnd.choice((0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 5, 10, 11))
        heads.setdefault((j, s), []).append(i)
        e.write(NODE + i * 10, struct.pack("<HBBHH", key, kind, 0, rnd.choice((0, 1, 2, 3, 0x12, 0x1f4, 0x7d0, 0x1234)),
                                           rnd.randint(0, 60)))
    for (j, s), ids in heads.items():
        e.write(SLOT(j, s) + 10, struct.pack("<H", ids[0]))
        for a, b in zip(ids, ids[1:] + [0]):
            e.write(NODE + a * 10 + 8, struct.pack("<H", b))


def stat_board(e, seed):
    """a board whose field cards are the ones engStats and the boosts switch on, plus effect nodes"""
    rnd, words = board(e, seed)
    for j in (0, 1):
        for s in range(11):   # every zone filled, mostly face-up and live, with the cards the code switches on
            a = PL + j * PSZ + 0x34 + s * 0x14
            w = rnd.choice(STAT_KEYS if rnd.random() < 0.7 else IDS) | j << 14 | (0x60 + s + j * 11) << 23
            e.write(a, struct.pack("<IHHHHII", w, rnd.randint(1, 60), rnd.randint(0, 1), int(rnd.random() < 0.85), 0,
                                   rnd.choice((0, 1, 2, 3, 0x12, 0x7d0)), rnd.choice((0, 0, 0, 0, 4, 8, 0x40, 0x80, 0x100))))
    nodes(e, rnd)
    e.w32(0x012CC2D4, rnd.randint(0, 9))   # turn
    e.w32(0x012CC2D0, rnd.randint(0, 1))   # turn player
    e.w32(0x012CC2DC, rnd.randint(0, 5))   # phase
    return rnd, words


@case(0x6FAE40, params=list(range(40)))
def stats_nodes(e, f, seed):
    stat_board(e, seed + 100)
    out = []
    for j in (0, 1):
        for s in range(5):
            st = e.alloc(0x34)
            f(j, s, st, seed & 3, (seed * 7) % 40)
            out.append(e.read(st, 0x34))
    return out


@case(0x6FA560, params=list(range(20)))
def base_stats_nodes(e, f, seed):
    stat_board(e, seed + 200)
    out = []
    for j in (0, 1):
        for s in range(5):
            st = e.alloc(0x34)
            f(j, s, st, seed & 2, 0)
            out.append(e.read(st, 0x34))
    return out


for _addr in (0x702CC0, 0x703400):
    @case(_addr, params=list(range(8)))
    def level_race_nodes(e, f, seed):
        stat_board(e, seed + 300)
        return [f(j, s, k) for j in (0, 1) for s in range(6) for k in (0, 1, 7)]


@case(0x703990, params=list(range(8)))
def attr_nodes(e, f, seed):
    stat_board(e, seed + 400)
    out = []
    for j in (0, 1):
        for s in range(6):
            p = e.alloc(b"\x5a" * 4)
            out.append((f(j, s, p), e.read(p, 4)))
    return out


# ---- effective numbers on boards without effect nodes (printed values, positions, flags, field-wide counts)
@case(0x6FAE40, params=list(range(10)))
def stats(e, f, seed):
    board(e, seed)
    out = []
    for j in (0, 1):
        for s in range(5):
            st = e.alloc(0x34)
            f(j, s, st, seed & 3, 0)
            out.append(e.read(st, 0x34))
    return out


@case(0x6FA560, params=list(range(6)))
def base_stats(e, f, seed):
    board(e, seed)
    out = []
    for j in (0, 1):
        for s in range(5):
            st = e.alloc(0x34)
            f(j, s, st, seed & 2, 0)
            out.append(e.read(st, 0x34))
    return out


for _addr in (0x702CC0, 0x703400):   # level (raw 0/1), race (skip stamp)
    @case(_addr, params=list(range(6)))
    def level_race(e, f, seed):
        board(e, seed)
        return [f(j, s, k) for j in (0, 1) for s in range(6) for k in (0, 1, 0xFFFFFFFF)]


@case(0x703990, params=list(range(6)))
def attr(e, f, seed):
    board(e, seed)
    out = []
    for j in (0, 1):
        for s in range(6):
            p = e.alloc(b"\x5a" * 4)
            out.append((f(j, s, p), e.read(p, 4)))
            out.append(f(j, s, 0))
    return out
