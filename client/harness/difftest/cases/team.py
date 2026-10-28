# src/team difftest cases . The objects are random bytes
# (only the fields a function touches may change); returned booleans are compared in AL only (the exe leaves the
# rest of EAX as it was).
import random  # noqa: F401
import struct  # noqa: F401

from core import Emu, EmuError, case  # noqa: F401

CTX = 0x70   # CTeamFlagManager's IFlagLoadContext part


def manager(e, seed):
    return e.alloc(random.Random(seed).randbytes(0xB0))


@case(0xB05330, conv="thiscall", params=range(3))
def flag_ctx_flags(e, f, seed):
    m = manager(e, seed)
    return f(m + CTX) - m


@case(0xB05350, conv="thiscall", params=range(4))
def flag_ctx_changed(e, f, seed):
    m = manager(e, seed)
    e.write(m + 0x94, bytes([seed & 1]))
    return f(m + CTX) & 0xFF


@case(0xB05370, conv="thiscall", params=[0, 1, 0x101, 0xFFFFFF00])
def flag_ctx_set_changed(e, f, on):
    m = manager(e, on)
    f(m + CTX, on)


@case(0xB05D50, conv="thiscall", params=[0, 0x12345678, 0xFFFFFFFF])
def flag_ctx_set_state(e, f, state):
    m = manager(e, state)
    return f(m + CTX, state) & 0xFF


@case(0xB06380, conv="thiscall", params=range(3))
def flag_loader_on_init(e, f, seed):
    loader = e.alloc(random.Random(seed).randbytes(0xC8))
    return f(loader) & 0xFF


@case(0xB06890, conv="thiscall", params=[(b, o, d) for b in (0, 1) for o in (0, 1) for d in (0, 1)])
def flag_loader_reset(e, f, p):
    loader = e.alloc(random.Random(sum(p)).randbytes(0xC8))
    e.write(loader + 0x78, bytes([p[2], p[0], p[1]]))   # finished, busy, ok
    f(loader)


@case(0xB05F10, conv="thiscall", params=range(2))
def flag_buffer_ctor(e, f, seed):
    b = e.alloc(random.Random(seed).randbytes(0x20))
    return f(b) - b


def stub_delete(e):
    """The exe's operator delete (orig/patched) and the DLL's free (rewrite) both just record the pointer."""
    e.on_addr(0xB08E6D, lambda e, p: e.trace.append(("delete", p)), 1)
    e.on_import("free", lambda e, p: e.trace.append(("delete", p)), 1, stdcall=False)


@case(0xB06080, conv="thiscall", params=[0, 0x21001230])
def flag_buffer_dtor(e, f, data):
    stub_delete(e)
    b = e.alloc(random.Random(data).randbytes(0x20))
    e.w32(b, data)
    f(b)
