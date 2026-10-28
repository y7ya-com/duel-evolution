"""src/Game cases (game-b's file)."""
import random
import struct

from core import case


def ptrs(e, vals):
    return e.alloc(struct.pack(f"<{len(vals)}I", *vals) if vals else b"\0\0\0\0")


VALS = [[], [7], [7, 9, 7], [1, 2, 3, 4, 2, 2, 9], [5] * 6]


@case(0xADAD10, params=range(len(VALS)))   # find
def avatar_find(e, f, k):
    v = VALS[k]
    a, x = ptrs(e, v), e.alloc(struct.pack("<I", 2 if k == 3 else 7))
    return f(a, a + 4 * len(v), x) - a


@case(0xADAD40, params=range(len(VALS)))   # remove_copy
def avatar_remove_copy(e, f, k):
    v = VALS[k]
    a, out = ptrs(e, v), e.alloc(bytes(4 * len(v) + 8))
    x = e.alloc(struct.pack("<I", 2 if k == 3 else 7))
    return f(a, a + 4 * len(v), out, x) - out


for _addr in (0xADAC90, 0xADACD0):   # copy
    @case(_addr, params=range(len(VALS)))
    def avatar_copy(e, f, k):
        v = VALS[k]
        a, out = ptrs(e, v), e.alloc(random.Random(k).randbytes(4 * len(v) + 8))
        return f(a, a + 4 * len(v), out) - out
