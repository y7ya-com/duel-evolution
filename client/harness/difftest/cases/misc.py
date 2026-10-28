# misc session differential cases (src/Deck/DeckManager.cpp, ...). Globals injected by run.py.
import random
import struct  # noqa: F401

from core import Emu, EmuError, case  # noqa: F401

DM_SIZE = 0x85CC


def deck_manager(e, seed):
    """A CDeckManager with random lists, sizes and per-card counters (ids < 0x1000), the exe's vtable at +0."""
    rnd = random.Random(seed)
    d = e.obj(DM_SIZE, cls="CDeckManager")
    body = bytearray(DM_SIZE - 4)
    for base, sizes in ((0xFE, (95, 30, 30, 80)), (0x3CE, (95, 30, 30, 80))):
        off = base
        for n in sizes:   # lists: a few distinct small ids so removes find matches
            for i in range(rnd.randrange(n + 1)):
                struct.pack_into("<H", body, off + 2 * i - 4, rnd.choice([0, 1, 2, 3, 0x123, 0xFFF]))
            off += 2 * n
    for i in range(8):
        body[0x5A4 + i - 4] = rnd.choice([0, 1, 2, 30, 79, 80, 95, 255])
    for i in range(0x5CC, DM_SIZE, 4):
        if rnd.random() < 0.01 or (i - 0x5CC) // 4 in (0, 1, 2, 3, 0x123, 0xFFF):
            body[i - 4:i] = bytes(rnd.randrange(256) for _ in range(4))
    e.write(d + 4, body)
    return d


def dm_case(addr, nargs, ret_bytes):
    def dm(e, f, seed):
        rnd = random.Random(seed * 7919 + addr)
        d = deck_manager(e, seed)
        args = [rnd.choice([0, 1, 2, 3, 0x123, 0xFFF, 0x10FFF]), rnd.choice([0, 1, 2, 5, 0x7F, 0x80, 0xFF, 0x1FF])][:nargs]
        r = f(d, *args)
        if ret_bytes == "ptr":
            return r - d
        return r & ((1 << (8 * ret_bytes)) - 1) if ret_bytes else None
    dm.__name__ = "deck_manager_%x" % addr
    return case(addr, conv="thiscall", params=range(12))(dm)


for a in (0x907970, 0x907A30, 0x907AF0, 0x907BB0):   # remove* (id, unused box): bool
    dm_case(a, 2, 1)
for a in (0x9075F0, 0x907900):   # addMissing*: bool
    dm_case(a, 1, 1)
for a in (0x9065F0, 0x906610, 0x906630, 0x906650, 0x906670, 0x906690, 0x9066B0, 0x9066D0):   # sizes
    dm_case(a, 0, 1)
dm_case(0x9066F0, 1, 1)   # copies (the exe's upper bytes are register leftovers)
for a in (0x906730, 0x9067B0, 0x9067F0, 0x906840, 0x9068C0, 0x906900, 0x906950, 0x9069D0, 0x906A10, 0x906A60,
          0x906AE0, 0x906B20):   # per-card counter setters / adders / subtracters
    dm_case(a, 2, 0)
for a in (0x906760, 0x906870, 0x906980, 0x906A90):   # per-card counters
    dm_case(a, 1, 1)
for a in (0x906790, 0x9068A0, 0x9069B0, 0x906AC0, 0x906B70, 0x906B90, 0x906BB0, 0x906BD0):   # lists
    dm_case(a, 0, "ptr")
dm_case(0x906BF0, 0, 1)   # clear
dm_case(0x906CC0, 0, 0)   # reset
dm_case(0x906D90, 0, 0)   # clearMissing


# CDeckRuleCheck: a sequence of adds and checks on each side. Its data are statics (DAT_012bdf40..0x012be046 in the
# exe, the DLL's own in the rewrite), so they're ignored and the valid() answers are compared instead.
@case(0x904E50, conv="thiscall", params=range(8))
def deck_rule_check(e, f, seed):
    rnd = random.Random(seed)
    e.ignore(0x12BDF40, 0x12BE046 - 0x12BDF40)
    obj = e.obj(4)
    clear, add_main, add_side, add_extra = (e.fn(a, "thiscall") for a in (0x904D70, 0x904DC0, 0x904DF0, 0x904E20))
    out = []
    for _ in range(4):
        clear(obj)
        m, s, x = rnd.choice([0, 39, 40, 41, 79, 80]), rnd.randrange(16), rnd.randrange(31)
        for i in range(m):
            add_main(obj, 0x10000 + i)
        for i in range(s):
            add_side(obj, i)
        for i in range(x):
            add_extra(obj, i)
        out.append(f(obj) & 0xFF)
    return out



# src/ChangeAvatar: CWindowDialogAvatarSwitch (0x9d8 bytes) and CChangeAvatarPack (0x360) members on filled objects;
# a CAvatarData is the exe's vtable + 16 bytes.
def avatar_data(e, rnd):
    a = e.obj(0x14, cls="CAvatarData")
    e.write(a + 4, bytes(rnd.randrange(256) for _ in range(16)))
    return a


@case(0x8A8C80, conv="thiscall", params=range(2))
def avatar_switch_on_main(e, f, seed):
    return f(e.obj(0x9D8, fill=bytes([seed + 1]))) & 0xFF


@case(0x8B07A0, conv="thiscall", params=range(4))
def avatar_switch_set_avatar(e, f, seed):
    rnd = random.Random(seed)
    w = e.obj(0x9D8, fill=bytes(rnd.randrange(256) for _ in range(7)))
    f(w, avatar_data(e, rnd))


@case(0x8B2C20, conv="thiscall", params=range(4))
def avatar_pack_avatar(e, f, seed):
    rnd = random.Random(seed)
    p = e.obj(0x360, fill=bytes(rnd.randrange(256) for _ in range(11)))
    out = avatar_data(e, rnd)
    f(p, seed & 1, out)


# The random face: rand() is the exe's static CRT (0xb0ab9a) on the original side and the DLL's CRT import on the
# rewrite side; both are fed the same sequence (extremes included), so the bytes written must match.
@case(0x8B2AF0, conv="thiscall", params=range(6))
def avatar_pack_randomize(e, f, seed):
    rnd = random.Random(seed)
    values = iter([0, 0x7FFF, 5, 6, 7, 41, 42] + [rnd.randrange(0x8000) for _ in range(7)])

    def rand(e):
        v = next(values)
        e.trace.append(("rand", v))
        return v
    e.on_addr(0xB0AB9A, rand, 0)
    e.on_import("rand", rand)
    a = avatar_data(e, rnd)
    for _ in range(2):
        f(e.obj(4), a)
