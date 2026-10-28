# src/Swf: the text-dump reader (yo2SwfReader.cpp), run on the real dumps from merge.dat plus edge cases.
# The objects it builds live on the heap (not compared), so each case
# returns a dump of the whole tree, walked by the tags' type fields; floats are compared as raw bits.
import os
import random  # noqa: F401
import re
import struct
import sys

from core import Emu, EmuError, case  # noqa: F401

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "tests", "swf"))
import dumps as _dumps  # noqa: E402

from unicorn.x86_const import UC_X86_REG_EAX  # noqa: E402

READ_LINE = 0x678CE0        # an exe function the reader never calls (SwfReader::load): becomes the fake ReadLine
OP_NEW, FREE = 0xB09654, 0xB08E6D
# ~1400 lines/s per side: the default (60 dumps) takes ~40 s; YO2_SWF_MAX_LINES=400000 runs all 242 (~40 min)
MAX_LINES = int(os.environ.get("YO2_SWF_MAX_LINES", 500))


class Heap:
    """malloc/free with reuse, so a few thousand lines fit in the Emu's 16 MB heap."""

    POOL = 0x800000

    def __init__(self, e):
        # one pool from the shared heap, the same size on every side, its contents not compared (the cases compare the
        # tree dump they return; the two sides allocate differently)
        self.e, self.size, self.free = e, {}, {}
        self.next = e.malloc(self.POOL)
        self.end = self.next + self.POOL
        e.ignore(self.next, self.POOL)

    def alloc(self, n):
        n = (max(n, 1) + 15) & ~15
        if self.free.get(n):
            a = self.free[n].pop()
        else:
            a, self.next = self.next, self.next + n
            assert self.next <= self.end, "swf case heap pool exhausted"
        self.e.write(a, bytes(n))
        self.size[a] = n
        return a

    def realloc(self, a, n):
        b = self.alloc(n)
        if a in self.size:
            self.e.write(b, self.e.read(a, min(n, self.size[a])))
            self.release(a)
        return b

    def release(self, a):
        n = self.size.pop(a, None)
        if n:
            self.free.setdefault(n, []).append(a)
        return 0


def _num(s, pattern):
    m = re.match(pattern, s.split(b"\0")[0].decode("latin-1"))
    return m and m.group(0)


def install(e, lines):
    heap = Heap(e)
    e.on_addr(OP_NEW, lambda e, n: heap.alloc(n), 1)
    e.on_addr(FREE, lambda e, p: heap.release(p), 1)
    e.on_import("malloc", lambda e, n: heap.alloc(n), 1, stdcall=False)
    e.on_import("free", lambda e, p: heap.release(p), 1, stdcall=False)
    e.on_import("calloc", lambda e, n, k: heap.alloc(n * k), 2, stdcall=False)
    e.on_import("realloc", lambda e, p, n: heap.realloc(p, n), 2, stdcall=False)

    def memchr(e, p, c, n):
        i = e.read(p, n).find(bytes([c & 0xFF]))
        return p + i if i >= 0 else 0
    e.on_import("memchr", memchr, 3, stdcall=False)

    # libgcc's SJLJ unwinder keeps its function-context chain in a winpthreads TLS slot (first use in any DLL
    # function with destructors): one thread, so one slot table
    tls = {}
    e.on_import("TlsAlloc", lambda e: len(tls) + 1 if tls.setdefault(len(tls) + 1, 0) is not None else 0, 0, stdcall=True)
    e.on_import("TlsGetValue", lambda e, k: tls.get(k, 0), 1, stdcall=True)
    e.on_import("TlsSetValue", lambda e, k, v: tls.__setitem__(k, v) or 1, 2, stdcall=True)
    for name, n, r in (("GetCurrentThreadId", 0, 1), ("GetCurrentThread", 0, 0xFFFFFFFE), ("GetCurrentProcess", 0, 0xFFFFFFFF),
                       ("GetLastError", 0, 0), ("SetLastError", 1, 0), ("CloseHandle", 1, 1), ("CreateEventA", 4, 0x44),
                       ("InitializeCriticalSection", 1, 0), ("EnterCriticalSection", 1, 0), ("LeaveCriticalSection", 1, 0),
                       ("DeleteCriticalSection", 1, 0), ("GetThreadPriority", 1, 0), ("CreateSemaphoreA", 4, 0x48), ("ReleaseSemaphore", 3, 1), ("WaitForSingleObject", 2, 0)):
        e.on_import(name, lambda e, *a, r=r: r, n, stdcall=True)
    e.on_import("DuplicateHandle", lambda e, sp, sh, tp, out, *a: e.w32(out, sh) or 1, 7, stdcall=True)

    def atoi(e, s):
        v = _num(e.read(s, 64), r"\s*[+-]?\d+")
        return int(v) if v else 0
    e.on_import("atoi", atoi, 1, stdcall=False)

    # atof returns in ST0: its slot runs `fld qword [scratch]; ret` after the handler fills scratch
    scratch = e.malloc(8)
    e.ignore(scratch, 8)   # the case's own atof hand-off, not game state
    def atof(e, s):
        v = _num(e.read(s, 64), r"\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?")
        e.write(scratch, struct.pack("<d", float(v) if v else 0.0))
        return e.uc.reg_read(UC_X86_REG_EAX)
    e.on_import("atof", atof, 1, stdcall=False)
    slot = e._slot("atof")
    e.write(slot, b"\xdd\x05" + struct.pack("<I", scratch) + b"\xc3")
    e._handlers[slot + 6] = (lambda e: e.uc.reg_read(UC_X86_REG_EAX), 0)

    it = iter(lines)
    def read_line(e, s):   # thiscall ReadLine(string& s): assign the next line (refcount byte 0 before the chars)
        line = next(it, None)
        if line is None:
            return 1
        buf = heap.alloc(len(line) + 2)
        e.write(buf + 1, line + b"\0")
        e.write(s + 4, struct.pack("<III", buf + 1, len(line), len(line)))
        return 0
    e.on_addr(READ_LINE, read_line, 1, callee_pops=True)
    vtbl = e.alloc(0x40)
    e.w32(vtbl + 0x34, READ_LINE)
    return e.alloc(struct.pack("<I", vtbl) + bytes(12))


# ------------------------------------------------------------------ the tree
def s(e, a):
    p, n = struct.unpack("<II", e.read(a + 4, 8))
    return e.read(p, n) if p and n else b""


def vec(e, a, size):
    first, last = struct.unpack("<II", e.read(a + 4, 8))
    return [first + size * i for i in range((last - first) // size)] if first else []


def ptrs(e, a):
    return [e.u32(p) for p in vec(e, a, 4)]


def raw(e, a, n):
    return e.read(a, n).hex()


def actions(e, arr):   # objects: vtable, then the vector
    out = []
    for r in ptrs(e, arr + 4):
        t = e.u32(r + 4)
        x = [t, s(e, r + 8)]
        if t == 0:
            x += [s(e, r + 0x18), s(e, r + 0x28), actions(e, r + 0x38)]
        elif t == 1:
            x += [[s(e, p) for p in vec(e, r + 0x18, 16)]]
        elif t == 2:
            x += [[(e.u32(d), e.u32(d + 4), s(e, d + 8), e.u32(d + 0x18), e.u32(d + 0x1C)) for d in vec(e, r + 0x18, 0x20)]]
        elif t == 13:
            x += [s(e, r + 0x18)]
        out.append(x)
    return out


def timeline(e, table):
    out = []
    for t in ptrs(e, table + 4):
        k = e.u32(t + 4)
        if k == 0:
            out.append((k, e.read(t + 8, 2).hex(), e.u32(t + 0xC), e.u32(t + 0x10), raw(e, t + 0x14, 64), s(e, t + 0x54),
                        raw(e, t + 0x64, 32)))
        elif k == 1:
            out.append((k, e.read(t + 8, 2).hex()))
        elif k == 4:
            out.append((k, actions(e, t + 8)))
        elif k == 5:
            out.append((k, s(e, t + 8)))
        else:
            out.append((k,))
    return [e.u32(table + 0x14), out]


def dictionary(e, d):
    out = []
    for c in ptrs(e, d + 4):
        k, cid = e.u32(c + 4), e.u32(c + 8)
        x = [k, cid]
        if k == 1:
            x += [e.u32(c + 0xC)]
        elif k == 2:
            x += [e.u32(c + 0xC), raw(e, c + 0x10, 24), raw(e, c + 0x28, 64)]
        elif k == 3:
            x += [e.u32(c + 0xC), timeline(e, c + 0x10), actions(e, c + 0x28)]
        elif k == 4:
            x += [[(e.read(r, 1).hex(), e.u32(r + 4), e.u32(r + 8), raw(e, r + 0xC, 64), raw(e, r + 0x4C, 32))
                   for r in vec(e, c + 0xC, 0x6C)],
                  [(e.u32(p), actions(e, p + 4)) for p in ptrs(e, c + 0x1C + 4)]]
        elif k == 5:
            x += [s(e, c + 0xC)]
        out.append(x)
    return out


def read_tags(e, f, lines):
    file = install(e, lines)
    ret, png, d, table = e.alloc(16), e.alloc(16), e.alloc(0x24), e.alloc(0x18)
    r = f(0, ret, file, png, d, table)
    assert r == ret, "returns its hidden result pointer"
    for a, n in ((ret, 16), (png, 16), (d, 0x24), (table, 0x18)):
        e.ignore(a, n)   # heap pointers (and the exe's uninitialised allocator bytes); compared through the tree below
    return [s(e, ret), [s(e, p) for p in vec(e, png, 16)], dictionary(e, d), timeline(e, table)]


_files = [p for p in _dumps.dumps() if len(_dumps.lines(p)) <= MAX_LINES] if os.path.isdir(os.path.dirname(_dumps.MERGE)) else []


@case(0x6793D0, conv="thiscall", params=[os.path.relpath(p, _dumps.CACHE) for p in _files])
def swf_read_tags(e, f, rel):
    return read_tags(e, f, _dumps.lines(os.path.join(_dumps.CACHE, rel)))


# hand-made dumps: odd brackets, unknown tags and actions, missing fields, quoting
_T = "SWF::Element::Tag::"
EDGE = {
    "empty": [],
    "header only": ["Header: (", "  Version => 6,", ")"],
    "unknown define": [f"{_T}DefineFont->new(", "  FontID => 7,", "  ID => 1,", "  ID => 9,", ")", f"{_T}DefineMorphShape->new(", "  ID => 2,", ")"],
    "unknown action": [f"{_T}DoAction->new(", "  Actions => SWF::Element::Array::ACTIONRECORDARRAY->new([",
                       "    SWF::Element::ACTIONRECORD->new(", "      Tag => 'ActionPlay',", "    ),",
                       "    SWF::Element::ACTIONRECORD->new(", "      LocalLabel => 'L1',", "      Tag => 'ActionStop',",
                       "    ),", "  ]),", ")"],
    "push data": [f"{_T}DoAction->new(", "  Actions => SWF::Element::Array::ACTIONRECORDARRAY->new([",
                  "    SWF::Element::ACTIONRECORD::ActionPush->new(",
                  "      DataList => SWF::Element::Array::ACTIONDATAARRAY->new([",
                  "        SWF::Element::ACTIONDATA::String->new('go'),", "        SWF::Element::ACTIONDATA::Integer->new(12),",
                  "        SWF::Element::ACTIONDATA::Lookup->new(3),", "      ]),", "    ),", "  ]),", ")"],
    "place defaults": [f"{_T}PlaceObject2->new(", "  Depth => 70000,", ")", f"{_T}PlaceObject2->new(", "  Depth => 3,",
                       "  Name => 'mc',", ")", f"{_T}RemoveObject2->new(", "  Depth => 3,", ")", f"{_T}ShowFrame->new(", ")",
                       f"{_T}FrameLabel->new(", "  Name => 'top',", ")", f"{_T}End->new(", ")"],
    "unbalanced close": [f"{_T}ShowFrame->new(", ")", ")", f"{_T}End->new(", ")"],
    "eof inside a tag": [f"{_T}DefineBitsLossless->new(", "  CharacterID => 1,"],
    "bracket on one line": [f"{_T}ShowFrame->new()", f"{_T}End->new(", ")"],
}


@case(0x6793D0, conv="thiscall", params=list(EDGE))
def swf_read_tags_edge(e, f, name):
    return read_tags(e, f, [line.encode() for line in EDGE[name]])
