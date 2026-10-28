"""Unicorn x86-32 machine with yo2.exe and the rewrite DLL (yo2rep.dll) mapped side by side.

Both images are mapped in every Emu. `Emu(side="orig").fn(0x689ea0)` calls the original code; `Emu(side="rewrite")
.fn(0x689ea0)` calls the DLL's `yo2_689ea0` export; `Emu(side="patched")` calls 0x689ea0 after writing the same
`jmp yo2_<addr>` patches rep/main.cpp writes in the real process (original callers then reach the rewrites). Rewrites that touch game globals use the exe's addresses directly,
so comparing the exe's writable sections after a run covers globals on both sides.

Imports of both images point at stub slots; a Python handler registered with on_import() runs there (unregistered
import = error naming it). on_addr() does the same for a function inside the exe (stub out a callee).
"""
import os
import re
import struct

import pefile
from unicorn import (UC_ARCH_X86, UC_HOOK_CODE, UC_HOOK_MEM_INVALID, UC_MEM_FETCH_UNMAPPED, UC_MEM_READ_UNMAPPED,
                     UC_MEM_WRITE_UNMAPPED, UC_MODE_32, Uc, UcError)
from unicorn.x86_const import (UC_X86_REG_EAX, UC_X86_REG_EBP, UC_X86_REG_EBX, UC_X86_REG_ECX, UC_X86_REG_EDI,
                               UC_X86_REG_EDX, UC_X86_REG_EIP, UC_X86_REG_ESI, UC_X86_REG_ESP, UC_X86_REG_FPCW,
                               UC_X86_REG_FS, UC_X86_REG_GDTR, UC_X86_REG_CS, UC_X86_REG_SS, UC_X86_REG_DS,
                               UC_X86_REG_ES, UC_X86_REG_GS)

EXE = os.environ.get("YO2_EXE", "/Users/y/Documents/GitHub/yo2-decomp-data/yo2.exe")
DLL = os.environ.get("YO2_REP", os.path.join(os.path.dirname(__file__), "../../build-i686/harness/yo2rep.dll"))

STUBS = 0x7F000000          # 8-byte slot per import / hooked name; slot 0 is the return sentinel
ARENA = (0x20000000, 0x100000)   # test inputs (compared)
HEAP = (0x21000000, 0x1000000)   # malloc/new (not compared)
STACK = (0x30000000, 0x100000)
TEB, GDT = 0x7FFD0000, 0x7FFE0000

INCLUDE = os.path.join(os.path.dirname(__file__), "../../include/yo2")
# The exe's statically linked MSVC heap is never initialised here (_heap_init doesn't run), so both of its entry points
# go to the same bump heap the DLL's CRT imports use: same allocation sequence -> same addresses on every side.
EXE_NH_MALLOC, EXE_FREE = 0xB0CDE1, 0xB097FA   # __nh_malloc(size, nhFlag) under operator new / malloc; free(p)

# stdcall imports need their arg count (callee pops); cdecl ones (CRT) pop nothing.
WINAPI_ARGS = {"recv": 4, "send": 4, "WSAGetLastError": 0,
               "TlsAlloc": 0, "TlsFree": 1, "TlsGetValue": 1, "TlsSetValue": 2,
               "EnterCriticalSection": 1, "LeaveCriticalSection": 1, "InitializeCriticalSection": 1,
               "DeleteCriticalSection": 1, "GetLastError": 0, "SetLastError": 1, "GetCurrentThreadId": 0}
REG = {"eax": UC_X86_REG_EAX, "ebx": UC_X86_REG_EBX, "ecx": UC_X86_REG_ECX, "edx": UC_X86_REG_EDX,
       "esi": UC_X86_REG_ESI, "edi": UC_X86_REG_EDI, "ebp": UC_X86_REG_EBP, "esp": UC_X86_REG_ESP}
CALLEE_SAVED = ("ebx", "esi", "edi", "ebp")


class EmuError(Exception):
    pass


_cache = {}


def _image(path):
    """(base, mapped bytes, [(iat va, import name)], {export: va}, [(va, size) writable sections])"""
    if path not in _cache:
        if not os.path.exists(path):
            raise EmuError(f"{path} missing (build it: see harness/README.md)")
        pe = pefile.PE(path, fast_load=True)
        pe.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_IMPORT"],
                                               pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_EXPORT"]])
        base = pe.OPTIONAL_HEADER.ImageBase
        imports = [(i.address, i.name.decode() if i.name else f"#{i.ordinal}")
                   for d in getattr(pe, "DIRECTORY_ENTRY_IMPORT", []) for i in d.imports]
        exports = {}
        if hasattr(pe, "DIRECTORY_ENTRY_EXPORT"):
            exports = {e.name.decode(): base + e.address for e in pe.DIRECTORY_ENTRY_EXPORT.symbols if e.name}
        writable = [(base + s.VirtualAddress, s.Misc_VirtualSize) for s in pe.sections
                    if s.Characteristics & 0x80000000 and not s.Characteristics & 0x20000000]
        _cache[path] = (base, pe.get_memory_mapped_image(), imports, exports, writable)
        pe.close()
    return _cache[path]


def _gdt_entry(base, limit, access, flags):
    e = limit & 0xFFFF | (base & 0xFFFFFF) << 16 | access << 40 | (limit >> 16 & 0xF) << 48 | flags << 52
    return struct.pack("<Q", e | (base >> 24 & 0xFF) << 56)


class Emu:
    def __init__(self, side):
        assert side in ("orig", "rewrite", "patched")
        self.side = side
        self.uc = uc = Uc(UC_ARCH_X86, UC_MODE_32)
        self.trace = []        # handlers append what the caller should see (e.g. bytes sent); compared
        self.ignored = []      # (addr, n) excluded from the memory comparison
        self.state = {}        # scratch for handlers (e.g. WSAGetLastError value)
        self._arena = ARENA[0]
        self._heap = HEAP[0]
        self._slots = {}       # name -> slot address
        self._handlers = {}    # slot or exe address -> (fn, nargs)
        self._sizes = {}       # heap block -> size, for realloc
        self.exe = _image(EXE)
        self.dll = _image(DLL)
        for base, img, imports, _, _ in (self.exe, self.dll):
            uc.mem_map(base, (len(img) + 0xFFF) & ~0xFFF)
            uc.mem_write(base, img)
            for iat, name in imports:
                uc.mem_write(iat, struct.pack("<I", self._slot(name)))
        for a, n in (ARENA, HEAP, STACK, (STUBS, 0x10000), (TEB, 0x1000), (GDT, 0x1000)):
            uc.mem_map(a, n)
        uc.mem_write(STUBS, b"\xcc" * 0x10000)
        # FS -> a TEB, for SEH frames (fs:[0]) and stack limits
        uc.mem_write(TEB, struct.pack("<7I", 0xFFFFFFFF, STACK[0] + STACK[1], STACK[0], 0, 0, 0, TEB))
        # Flat ring-0 CS/DS/SS (Unicorn checks every segment once FS is loaded from a GDT), FS = TEB.
        uc.mem_write(GDT + 8, _gdt_entry(0, 0xFFFFF, 0x9A, 0xC) + _gdt_entry(0, 0xFFFFF, 0x92, 0xC)
                     + _gdt_entry(TEB, 0xFFF, 0x92, 0x4))
        uc.reg_write(UC_X86_REG_GDTR, (0, GDT, 0x20 - 1, 0))
        for r, sel in ((UC_X86_REG_CS, 0x08), (UC_X86_REG_SS, 0x10), (UC_X86_REG_DS, 0x10), (UC_X86_REG_ES, 0x10),
                       (UC_X86_REG_GS, 0x10), (UC_X86_REG_FS, 0x18)):
            uc.reg_write(r, sel)
        uc.reg_write(UC_X86_REG_FPCW, 0x27F)   # Windows default: x87 53-bit precision, all exceptions masked
        uc.hook_add(UC_HOOK_CODE, self._on_stub, begin=STUBS, end=STUBS + 0x10000)
        uc.hook_add(UC_HOOK_MEM_INVALID, self._on_bad_mem)
        _crt(self)
        self.on_addr(EXE_NH_MALLOC, lambda e, n, flag: e.malloc(n), 2)
        self.on_addr(EXE_FREE, lambda e, ptr: 0, 1)
        if side == "patched":
            for name, va in self.dll[3].items():
                if name.startswith("yo2_"):
                    at = int(name[4:], 16)
                    self.write(at, b"\xe9" + struct.pack("<i", va - (at + 5)))

    # ------------------------------------------------------------ memory
    def read(self, a, n):
        return bytes(self.uc.mem_read(a, n))

    def write(self, a, b):
        self.uc.mem_write(a, bytes(b))

    def u32(self, a):
        return struct.unpack("<I", self.read(a, 4))[0]

    def w32(self, a, v):
        self.write(a, struct.pack("<I", v & 0xFFFFFFFF))

    def alloc(self, n_or_bytes, align=16):
        """Arena allocation: same sequence of calls -> same addresses on both sides."""
        data = bytes(n_or_bytes) if isinstance(n_or_bytes, int) else bytes(n_or_bytes)
        a = self._arena = (self._arena + align - 1) & ~(align - 1)
        self._arena += max(len(data), 1)
        if self._arena > ARENA[0] + ARENA[1]:
            raise EmuError("arena full")
        self.write(a, data)
        return a

    def obj(self, size, cls=None, fill=None):
        """Arena object of `size` bytes: zeroed, or `fill` bytes repeated/truncated; vptr at +0 = cls's exe vtable."""
        data = bytes(size) if fill is None else (bytes(fill) * (size // max(len(fill), 1) + 1))[:size]
        a = self.alloc(data)
        if cls:
            self.w32(a, vtable(cls))
        return a

    def malloc(self, n):
        """Bump heap (never reused, so it reads as zeroes, which also makes it calloc)."""
        a = self._heap = (self._heap + 15) & ~15
        self._heap += max(n, 1)
        if self._heap > HEAP[0] + HEAP[1]:
            raise EmuError("heap full")
        self._sizes[a] = n
        return a

    def ignore(self, a, n):
        self.ignored.append((a, n))

    def snapshot(self):
        """Everything compared after a run: arena, heap and the exe's writable sections, with ignored bytes zeroed."""
        regions = [(ARENA[0], self._arena - ARENA[0]), (HEAP[0], self._heap - HEAP[0])] + self.exe[4]
        out = []
        for a, n in regions:
            b = bytearray(self.read(a, n))
            for ia, ilen in self.ignored:
                lo, hi = max(ia, a), min(ia + ilen, a + n)
                if lo < hi:
                    b[lo - a:hi - a] = bytes(hi - lo)
            out.append((a, bytes(b)))
        return out

    # ------------------------------------------------------------ stubs
    def _slot(self, name):
        if name not in self._slots:
            self._slots[name] = STUBS + 8 * (len(self._slots) + 1)
        return self._slots[name]

    def on_import(self, name, fn, nargs=None, stdcall=None):
        """fn(emu, *args) -> eax. WinAPI imports are stdcall with WINAPI_ARGS[name] args; CRT ones cdecl."""
        if nargs is None:
            nargs = WINAPI_ARGS.get(name, 0)
        if stdcall is None:
            stdcall = name in WINAPI_ARGS
        slot = self._slot(name)
        self.write(slot, b"\xc2" + struct.pack("<H", 4 * nargs) if stdcall and nargs else b"\xc3")
        self._handlers[slot] = (fn, nargs)

    def on_addr(self, addr, fn, nargs, callee_pops=False):
        """Replace the exe function at addr (this Emu only) with fn(emu, *args) -> eax."""
        self.write(addr, b"\xc2" + struct.pack("<H", 4 * nargs) if callee_pops and nargs else b"\xc3")
        self._handlers[addr] = (fn, nargs)
        self.uc.hook_add(UC_HOOK_CODE, self._on_stub, begin=addr, end=addr)

    def _on_stub(self, uc, addr, size, _):
        if addr == STUBS:
            return
        h = self._handlers.get(addr)
        if not h:
            name = next((n for n, s in self._slots.items() if s == addr), hex(addr))
            raise EmuError(f"unstubbed import {name} called (register it with on_import)")
        fn, nargs = h
        esp = uc.reg_read(UC_X86_REG_ESP)
        args = struct.unpack(f"<{nargs}I", self.read(esp + 4, 4 * nargs)) if nargs else ()
        r = fn(self, *args)
        uc.reg_write(UC_X86_REG_EAX, (r or 0) & 0xFFFFFFFF)

    def _on_bad_mem(self, uc, access, addr, size, value, _):
        kind = {UC_MEM_READ_UNMAPPED: "read", UC_MEM_WRITE_UNMAPPED: "write", UC_MEM_FETCH_UNMAPPED: "fetch"}
        self.state["fault"] = (kind.get(access, access), addr, uc.reg_read(UC_X86_REG_EIP))
        return False

    # ------------------------------------------------------------ calls
    def target(self, addr):
        if self.side != "rewrite":
            return addr
        name = f"yo2_{addr:x}"
        if name not in self.dll[3]:
            raise EmuError(f"yo2rep.dll has no export {name}")
        return self.dll[3][name]

    def fn(self, addr, conv="cdecl"):
        """Callable for this side's version of the function at addr. conv: cdecl, stdcall, thiscall, fastcall."""
        return lambda *args: self.call(self.target(addr), args, conv)

    def call(self, at, args, conv="cdecl", max_insns=50_000_000):
        uc = self.uc
        args = [a & 0xFFFFFFFF for a in args]
        regs = {}
        if conv == "thiscall":
            regs["ecx"], args = args[0], args[1:]
        elif conv == "fastcall":
            regs.update(zip(("ecx", "edx"), args[:2]))
            args = args[2:]
        top = STACK[0] + STACK[1] - 0x1000
        sp = top - 4 * len(args)
        self.write(sp, struct.pack(f"<{len(args)}I", *args))
        sp -= 4
        self.w32(sp, STUBS)
        saved = {r: 0x5A5A0000 + i for i, r in enumerate(CALLEE_SAVED)}
        for r, v in {**saved, **regs, "esp": sp}.items():
            uc.reg_write(REG[r], v)
        try:
            uc.emu_start(at, STUBS, count=max_insns)
        except UcError as e:
            if "fault" in self.state:   # message is comparable across sides: no eip (kept in state["fault"])
                kind, addr, eip = self.state["fault"]
                raise EmuError(f"fault: {kind} at {addr:#x}") from None
            raise EmuError(f"{e} at eip {uc.reg_read(UC_X86_REG_EIP):#x}") from None
        if uc.reg_read(UC_X86_REG_EIP) != STUBS:
            raise EmuError(f"did not return within {max_insns} instructions (eip {uc.reg_read(UC_X86_REG_EIP):#x})")
        popped = uc.reg_read(UC_X86_REG_ESP) - (sp + 4)
        want = 0 if conv == "cdecl" else 4 * len(args)
        if popped != want:
            raise EmuError(f"ABI mismatch: callee popped {popped} bytes, {conv} with {len(args)} stack args pops {want}")
        for r, v in saved.items():
            if uc.reg_read(REG[r]) != v:
                raise EmuError(f"ABI mismatch: callee-saved {r} not restored")
        eax = uc.reg_read(UC_X86_REG_EAX)
        return eax - (1 << 32) if eax & 0x80000000 else eax


_vtables = {}


def vtable(cls):
    """The exe's primary vtable for an RTTI class name ("CNetAccount", "CTask"), from include/yo2's header comments."""
    if not _vtables:
        pat = re.compile(r"\.\?AV(\w+)@@ .*?vtables 0x([0-9a-f]+)@\+0x0")
        for root, _, files in os.walk(INCLUDE):
            for n in files:
                if n.endswith(".h"):
                    for m in pat.finditer(open(os.path.join(root, n), errors="ignore").read()):
                        _vtables.setdefault(m.group(1), int(m.group(2), 16))
    if cls not in _vtables:
        raise EmuError(f"no vtable for {cls} in include/yo2 (nested classes: use the vtables.tsv address directly)")
    return _vtables[cls]


def _crt(e):
    """The rewrite DLL imports these from the CRT (the exe has its own statically linked copies)."""
    def memcpy(e, d, s, n):
        e.write(d, e.read(s, n))
        return d

    def memset(e, d, c, n):
        e.write(d, bytes([c & 0xFF]) * n)
        return d

    def memcmp(e, a, b, n):
        x, y = e.read(a, n), e.read(b, n)
        return (x > y) - (x < y)

    def strlen(e, s):
        n = 0
        while e.read(s + n, 1) != b"\0":
            n += 1
        return n

    def malloc(e, n):
        return e.malloc(n)

    def realloc(e, ptr, n):
        new = e.malloc(n)
        if ptr:
            e.write(new, e.read(ptr, min(n, e._sizes.get(ptr, 0))))
        return new

    # kernel32 that libstdc++/libgcc reach on their own (emutls for thread-safe statics and exceptions, locks).
    # One thread, so locks are no-ops and TLS is a dict.
    tls = {}

    def tls_alloc(e):
        tls[len(tls) + 1] = 0
        return len(tls)
    e.on_import("TlsAlloc", tls_alloc)
    e.on_import("TlsFree", lambda e, i: tls.pop(i, None) is not None)
    e.on_import("TlsGetValue", lambda e, i: tls.get(i, 0))
    e.on_import("TlsSetValue", lambda e, i, v: tls.__setitem__(i, v) or 1)
    for name in ("EnterCriticalSection", "LeaveCriticalSection", "InitializeCriticalSection", "DeleteCriticalSection",
                 "SetLastError"):
        e.on_import(name, lambda e, *a: 0)
    e.on_import("GetLastError", lambda e: 0)
    e.on_import("GetCurrentThreadId", lambda e: 1)
    for name, fn, n in (("memcpy", memcpy, 3), ("memmove", memcpy, 3), ("memset", memset, 3), ("memcmp", memcmp, 3),
                        ("strlen", strlen, 1), ("malloc", malloc, 1), ("free", lambda e, p: 0, 1),
                        ("calloc", lambda e, n, size: e.malloc(n * size), 2), ("realloc", realloc, 2)):
        e.on_import(name, fn, n, stdcall=False)
