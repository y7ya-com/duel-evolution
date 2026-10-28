# src/caution differential cases (globals injected by run.py: case, Emu, EmuError, random, struct).
import random  # noqa: F401
import struct  # noqa: F401

from core import Emu, EmuError, case  # noqa: F401
from unicorn.x86_const import UC_X86_REG_ECX

RELAYOUT = 0x802130   # CWindowLogin's vtable slot 9; stubbed so the case sees the virtual call and its `this`


def window(e, seed):
    """a CWindowLogin-shaped block whose vtable slot 9 is the (stubbed) re-layout"""
    vt = e.alloc(struct.pack("<10I", *([0xdead0000] * 9 + [RELAYOUT])))
    w = e.alloc(random.Random(seed).randbytes(0x4a8))
    e.w32(w, vt)

    def relayout(e):
        e.trace.append(("relayout", e.uc.reg_read(UC_X86_REG_ECX) - w))
        return 0x12345600   # junk in EAX above AL: onMain must still return AL = 1
    e.on_addr(RELAYOUT, relayout, 0)
    return w


@case(0x7FD780, conv="thiscall", params=[0, 1, 0xFFFFFFFF])
def http_data(e, f, ptr):
    h = e.alloc(0x3C)
    e.w32(h + 0x2C, ptr)
    return f(h)


@case(0x7FDD30, conv="thiscall", params=range(3))
def login_window_on_main(e, f, seed):
    return f(window(e, seed)) & 0xFF


@case(0x7FDD50, conv="thiscall", params=[0, 1, -1, 7])
def login_window_set_mode(e, f, mode):
    w = window(e, mode)
    f(w, mode & 0xFFFFFFFF)


@case(0x7FDD80, conv="thiscall", params=range(3))
def login_window_reset_depth(e, f, seed):
    w = window(e, seed)
    e.write(w + 0x34C, struct.pack("<f", 12.5 + seed))
    f(w)
