# src/Result difftest cases .
import random  # noqa: F401
import struct  # noqa: F401

from core import Emu, EmuError, case  # noqa: F401


# CD3DTextTexture::setFont (inline): (width, height) into the LOGFONT, outline dirty; texture dirty when the size
# differs from the one last rendered (+0x120 height, +0x124 width).
@case(0x8C8A00, conv="thiscall", params=[(0, 24, 0, 24), (0, 16, 0, 24), (3, 24, 0, 24), (0, 24, 5, 24),
                                         (-1, 0x7FFFFFFF, 0, 0), (7, 9, 7, 9), "random"])
def text_set_font(e, f, p):
    rnd = random.Random(1)
    if p == "random":
        p = (rnd.randint(-3, 3), rnd.randint(0, 40), rnd.randint(-3, 3), rnd.randint(0, 40))
    w, h, curw, curh = p
    t = e.alloc(rnd.randbytes(0x12C))    # every other byte must stay as it was
    e.write(t + 0x6C, b"\0")
    e.write(t + 0xE4, b"\0")
    e.w32(t + 0x120, curh)
    e.w32(t + 0x124, curw)
    f(t, w, h)
