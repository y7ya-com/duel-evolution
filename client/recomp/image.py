"""yo2.exe as the recompiler sees it: sections, relocations, imports, function entries, decoded instructions.

Konami-derived output: everything this produces stays local (never commit it).
"""
import glob
import json
import os
import struct

import capstone
from capstone import x86 as X

DATA = os.environ.get("YO2_DATA", "/Users/y/Documents/GitHub/yo2-decomp-data")
EXE = os.path.join(DATA, "yo2.exe")

b = open(EXE, "rb").read()
_pe = struct.unpack_from("<I", b, 0x3c)[0]
_opt = struct.unpack_from("<H", b, _pe + 20)[0]
BASE = struct.unpack_from("<I", b, _pe + 52)[0]
ENTRY = BASE + struct.unpack_from("<I", b, _pe + 40)[0]
SIZE = struct.unpack_from("<I", b, _pe + 80)[0]
secs = []   # (name, va, vsize, raw, rsize)
for i in range(struct.unpack_from("<H", b, _pe + 6)[0]):
    o = _pe + 24 + _opt + i * 40
    vsz, va, rsz, raw = struct.unpack_from("<IIII", b, o + 8)
    secs.append((b[o:o + 8].rstrip(b"\0").decode(), BASE + va, vsz, raw, rsz))
TEXT = next(s for s in secs if s[0] == ".text")
TLO, THI = TEXT[1], TEXT[1] + TEXT[2]


def off(va):
    for n, lo, vsz, raw, rsz in secs:
        if lo <= va < lo + vsz:
            return raw + va - lo if va - lo < rsz else None
    return None


def u32(va):
    o = off(va)
    return struct.unpack_from("<I", b, o)[0] if o is not None else None


def in_text(va):
    return TLO <= va < THI


# --- relocations: every absolute address in the image
fixups = set()
_rel = next(s for s in secs if s[0] == ".reloc")
_o = _rel[3]
while _o < _rel[3] + _rel[2]:
    page, size = struct.unpack_from("<II", b, _o)
    if size < 8:
        break
    for k in range(8, size, 2):
        e = struct.unpack_from("<H", b, _o + k)[0]
        if e >> 12 == 3:
            fixups.add(BASE + page + (e & 0xFFF))
    _o += size

# --- imports: IAT slot va -> (dll, name)
imports = {}
_idir = BASE + struct.unpack_from("<I", b, _pe + 24 + 96 + 8)[0]
_d = _idir
while True:
    oft, _, _, name, ft = struct.unpack_from("<IIIII", b, off(_d))
    if not name:
        break
    dll = b[off(BASE + name):].split(b"\0")[0].decode()
    k = 0
    while True:
        t = u32(BASE + (oft or ft) + 4 * k)
        if not t:
            break
        sym = f"#{t & 0xFFFF}" if t & 0x80000000 else b[off(BASE + t + 2):].split(b"\0")[0].decode()
        imports[BASE + ft + 4 * k] = (dll, sym)
        k += 1
    _d += 20

# --- functions: Ghidra + RTTI virtuals, thunks, islands, reloc'd code pointers in data
funcs = {}
for l in open(os.path.join(DATA, "functions2.jsonl")):
    f = json.loads(l)
    if not f["a"].startswith("EXT"):
        funcs[int(f["a"], 16)] = f


def imp_name(dll, name):
    import re
    return f"imp_{dll.split('.')[0].upper()}_" + re.sub(r"\W", "_", name.replace("#", "ord"))


# the incremental-link thunk table: `jmp rel32` every 5 bytes from 0x401005 (14,797; Ghidra listed 13,082)
thunks = {}
_a = TLO + 5
while b[off(_a)] == 0xE9:
    thunks[_a] = (_a + 5 + struct.unpack_from("<i", b, off(_a) + 1)[0]) & 0xFFFFFFFF
    _a += 5


def thunk_target(a):
    """incremental-link thunk `jmp rel32` -> target, else None"""
    t = thunks.get(a)
    if t is not None:
        return t
    o = off(a)
    if o is not None and b[o] == 0xE9 and a in funcs and funcs[a].get("thunk"):
        return (a + 5 + struct.unpack_from("<i", b, o + 1)[0]) & 0xFFFFFFFF
    return None


def res(a, hops=8):
    while hops:
        t = thunk_target(a)
        if t is None:
            break
        a, hops = t, hops - 1
    return a


def entries():
    """every address we treat as a function entry (thunks resolved)"""
    e = {ENTRY}
    for a, f in funcs.items():
        if in_text(a):
            e.add(res(a))
    for a in thunks:
        if in_text(thunks[a]):
            e.add(res(a))
    for p in glob.glob(os.path.join(DATA, "islands", "*.c")):
        e.add(int(os.path.basename(p)[:-2], 16))
    for loc in fixups:          # code pointers held in data (vtables, __xc tables, callbacks) ...
        v = u32(loc)
        if v is None or not in_text(v):
            continue
        if not in_text(loc):
            e.add(res(v))
        elif loc - 4 not in fixups and loc + 4 not in fixups:
            # ... or written from code: `mov [eax+N], offset fn` (D3DX's libjpeg method tables), `push offset
            # callback`, a catch funclet's `mov eax, offset continuation`. Runs of relocations 4 bytes apart are
            # jump tables (labels, not entries).
            e.add(res(v))
    # setjmp return points: longjmp `jmp`s there, so they are entries too (the rest of the setjmp caller runs as
    # its own function and its `ret` unwinds the dead host frames through the call sites' ret_to checks)
    setjmp = {a for a, f in funcs.items() if f.get("name") in ("__setjmp3", "_setjmp")}
    t = b[off(TLO):off(TLO) + (THI - TLO)]
    k = t.find(b"\xe8")
    while k != -1:
        tgt = (TLO + k + 5 + struct.unpack_from("<i", t, k + 1)[0]) & 0xFFFFFFFF if k + 5 <= len(t) else 0
        if res(tgt) in setjmp:
            e.add(TLO + k + 5)
        k = t.find(b"\xe8", k + 1)
    return e


md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
md.detail = True


def decode(a):
    o = off(a)
    for i in md.disasm(b[o:o + 16], a, 1):
        return i
    return None
