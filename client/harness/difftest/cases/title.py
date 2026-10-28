# src/title differential cases (globals injected by run.py: case, Emu, EmuError, random, struct).
import random  # noqa: F401
import struct  # noqa: F401

from core import Emu, EmuError, case  # noqa: F401


@case(0x7FB4D0, conv="thiscall", params=range(8))
def scale_color(e, f, seed):
    rnd = random.Random(seed)
    vals = [rnd.choice([0.0, 1.0, -0.5, 3.4e38, 1e-40, rnd.uniform(-10, 10)]) for _ in range(4)]
    k = rnd.choice([0.75, 0.0, -1.5, 1e30, rnd.uniform(-4, 4)])
    c = e.alloc(struct.pack("<4f", *vals))
    r = f(c, struct.unpack("<I", struct.pack("<f", k))[0])
    return r - c
