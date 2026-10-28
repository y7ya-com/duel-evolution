"""src/shop cases (game-b's file): the MSVC6 vector instances behind ShopVec<T> (yo2ShopVec.h)."""
import random
import struct

from core import case

ITEM, LINE = 0x14, 0x1C


def vec(e, size, n, cap, seed):
    """A vector {alloc, first, last, end} with n random elements in a heap buffer of cap (cap 0: null pointers)."""
    rnd = random.Random(seed)
    v = e.alloc(rnd.randbytes(4) + bytes(12))
    if cap:
        buf = e.malloc(cap * size)
        e.write(buf, rnd.randbytes(cap * size))
        e.write(v + 4, struct.pack("<3I", buf, buf + n * size, buf + cap * size))
    return v


def state(e, v, size):
    first, last, end = struct.unpack("<3I", e.read(v + 4, 12))
    body = e.read(first, last - first) if first else b""
    return e.read(v, 1), (last - first) // size if first else None, (end - first) // size if first else None, body


SHAPES = [(0, 0), (0, 3), (2, 2), (3, 8), (7, 7), (5, 12)]   # (size, capacity)


for _addr, _size in ((0xB01600, ITEM), (0xB014A0, LINE)):     # vector(const allocator&)
    @case(_addr, conv="thiscall", params=[0, 1])
    def vec_ctor(e, f, seed, size=_size):
        v, a = e.alloc(random.Random(seed).randbytes(16)), e.alloc(bytes([0x5A + seed]))
        return f(v, a) - v, state(e, v, size)


@case(0xB014D0, conv="thiscall", params=SHAPES)
def line_copy_ctor(e, f, shape):
    o = vec(e, LINE, shape[0], shape[1], 7)
    v = e.alloc(random.Random(8).randbytes(16))
    return f(v, o) - v, state(e, v, LINE), state(e, o, LINE)


for _addr, _size in ((0xB02A30, ITEM), (0xB029A0, LINE)):     # capacity
    @case(_addr, conv="fastcall", params=SHAPES)
    def vec_capacity(e, f, shape, size=_size):
        return f(vec(e, size, shape[0], shape[1], 3))


@case(0xB01630, conv="thiscall", params=[(3, 8, 0), (3, 8, 2), (7, 7, 6), (1, 1, 0)])
def item_at(e, f, p):
    v = vec(e, ITEM, p[0], p[1], 4)
    return f(v, p[2]) - e.u32(v + 4)


for _addr, _size in ((0xB01590, LINE), (0xB01680, ITEM)):     # clear
    @case(_addr, conv="fastcall", params=SHAPES)
    def vec_clear(e, f, shape, size=_size):
        v = vec(e, size, shape[0], shape[1], 5)
        f(v)
        return state(e, v, size)


for _addr, _size in ((0xB02A70, ITEM), (0xB029E0, LINE)):     # erase(first, last)
    @case(_addr, conv="thiscall", params=[(5, 8, 0, 5), (5, 8, 1, 3), (5, 8, 4, 5), (5, 8, 2, 2), (7, 7, 0, 1)])
    def vec_erase(e, f, p, size=_size):
        v = vec(e, size, p[0], p[1], 6)
        first = e.u32(v + 4)
        return f(v, first + p[2] * size, first + p[3] * size) - first, state(e, v, size)


# insert(pos, n, value): reallocating (capacity < size + n), n > elements after pos, n <= elements after pos
@case(0xB02BE0, conv="thiscall", params=[(0, 0, 0, 1), (0, 0, 0, 3), (3, 4, 1, 2), (3, 3, 3, 1), (5, 12, 1, 3),
                                         (5, 12, 4, 3), (5, 12, 0, 0), (5, 12, 2, 2), (6, 6, 6, 9)])
def line_insert(e, f, p):
    v = vec(e, LINE, p[0], p[1], 9)
    x = e.alloc(random.Random(10).randbytes(LINE))
    f(v, (e.u32(v + 4) + p[2] * LINE) if p[1] else 0, p[3], x)   # the return value is the exe's garbage (void)
    return state(e, v, LINE)


for _addr, _size in ((0xB03930, LINE), (0xB038E0, ITEM), (0xB03980, ITEM)):   # copy(first, last, out)
    @case(_addr, params=[0, 1, 4])
    def vec_copy(e, f, n, size=_size):
        src = e.alloc(random.Random(n).randbytes(max(n, 1) * size))
        out = e.alloc(bytes(max(n, 1) * size + 8))
        return f(src, src + n * size, out) - out
