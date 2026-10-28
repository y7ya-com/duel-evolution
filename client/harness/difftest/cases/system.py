"""src/System test subjects (rewrites in harness/hooks/system.cpp until src/System has them)."""
import random
import struct

from core import EmuError, case


@case(0x587B80, conv="stdcall", params=[0, 1, 5, "null"])
def ucopy_pod12(e, f, n):
    """"null": the null check only guards the first element; both sides then fault writing to 0xc"""
    k = 3 if n == "null" else n
    src = e.alloc(random.Random(k).randbytes(12 * k))
    dst = 0 if n == "null" else e.alloc(12 * k + 12)
    try:
        return f(src, src + 12 * k, dst) - dst
    except EmuError as x:
        if n != "null":
            raise
        return str(x)


@case(0x59B110, params=range(12))
def hit_test(e, f, seed):
    rnd = random.Random(seed)
    n = rnd.choice([0, 1, 3, 10])
    lst = e.alloc(rnd.randbytes(0x60 + 0x4C * n))
    e.w32(lst + 0x50, n)
    for i in range(n):
        if rnd.random() < 0.5:   # integer rects: exact edges
            r = [rnd.randint(-50, 50), rnd.randint(-50, 50), rnd.randint(0, 40), rnd.randint(0, 40)]
        else:                    # fractional rects: rounding of x + w
            r = [rnd.uniform(-50, 50), rnd.uniform(-50, 50), rnd.uniform(0, 40), rnd.uniform(0, 40)]
        e.write(lst + 0x60 + 0x4C * i + 0x24, struct.pack("<4f", *r))
    hits = []
    for _ in range(60):
        r = f(lst, rnd.randint(-60, 100), rnd.randint(-60, 100))
        hits.append(r and (r - lst - 0x60) / 0x4C)
    return hits
