"""Differential test of recompiled functions against the original code under Unicorn.

    .venv/bin/python difftest.py [N | 0xADDR,...] [--seed S] [--bin build/rcdiff]

Picks functions (random sample, or the given ones), gives each several random inputs (registers, stack args that are
small ints or pointers into a 4 KB random arena), runs the original in Unicorn and keeps the cases that return
without touching an import or unmapped memory. The same cases go to `rcdiff` (recompiled code); registers, esp
delta, x87 ST0/depth, arena bytes and .data writes must match.
"""
import argparse
import os
import random
import struct
import subprocess
import sys

from unicorn import (UC_ARCH_X86, UC_MODE_32, UC_PROT_ALL, Uc, UcError, UC_HOOK_CODE)
from unicorn.x86_const import *

import image as I

ap = argparse.ArgumentParser()
ap.add_argument("what", nargs="?", default="300")
ap.add_argument("--seed", type=int, default=1)
ap.add_argument("--per", type=int, default=6, help="inputs per function")
ap.add_argument("--bin", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "build/rcdiff"))
ap.add_argument("-v", action="store_true")
ap.add_argument("--mn", default="", help="only functions using one of these mnemonics (comma list)")
args = ap.parse_args()
rnd = random.Random(args.seed)

ARENA, ARENA_N = 0x20000000, 4096
DATA_LO, DATA_N = 0xc7c000, 0x658d84
RET = 0x7f000000
STACK_TOP = 0x30100000
TEB = 0x7ffd0000

img = bytearray(I.SIZE)
img[:0x1000] = I.b[:0x1000]
for n, va, vsz, raw, rsz in I.secs:
    img[va - I.BASE: va - I.BASE + min(vsz, rsz)] = I.b[raw: raw + min(vsz, rsz)]
img = bytes(img)
DATA0 = img[DATA_LO - I.BASE: DATA_LO - I.BASE + DATA_N]


def ext80(t):
    mant, exp = t
    if exp & 0x7fff == 0 and mant == 0:
        return 0.0
    import math
    s = -1.0 if exp & 0x8000 else 1.0
    return s * math.ldexp(mant, (exp & 0x7fff) - 16383 - 63)


def run_orig(fn, regs, sargs, arena):
    u = Uc(UC_ARCH_X86, UC_MODE_32)
    u.mem_map(I.BASE, (I.SIZE + 0xfff) & ~0xfff)
    u.mem_write(I.BASE, img)
    u.mem_map(ARENA, 0x1000)
    u.mem_write(ARENA, arena)
    u.mem_map(STACK_TOP - 0x100000, 0x100000)
    u.mem_map(TEB, 0x1000)
    u.mem_write(TEB, struct.pack("<III", 0xffffffff, STACK_TOP, STACK_TOP - 0x100000))
    u.mem_map(RET, 0x1000)
    # fs base via unicorn's MSR (FS_BASE)
    u.msr_write(0xC0000100, TEB)
    for k, r in zip(("eax", "ecx", "edx", "ebx", "ebp", "esi", "edi"), (UC_X86_REG_EAX, UC_X86_REG_ECX,
                    UC_X86_REG_EDX, UC_X86_REG_EBX, UC_X86_REG_EBP, UC_X86_REG_ESI, UC_X86_REG_EDI)):
        u.reg_write(r, regs[k])
    sp = STACK_TOP - 0x100
    for a in reversed(sargs):
        sp -= 4
        u.mem_write(sp, struct.pack("<I", a))
    sp -= 4
    u.mem_write(sp, struct.pack("<I", RET))
    u.reg_write(UC_X86_REG_ESP, sp)
    u.reg_write(UC_X86_REG_FPCW, 0x27f)
    try:
        u.emu_start(fn, RET, count=2_000_000)
    except UcError:
        return None
    if u.reg_read(UC_X86_REG_EIP) != RET:
        return None
    fsw = u.reg_read(UC_X86_REG_FPSW)
    top = (fsw >> 11) & 7
    depth = (8 - top) & 7
    st0 = ext80(u.reg_read(UC_X86_REG_FP0 + top)) if depth else 0.0
    out = [u.reg_read(r) for r in (UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_EBX)]
    out.append(u.reg_read(UC_X86_REG_ESP) - sp)
    out += [u.reg_read(r) for r in (UC_X86_REG_EBP, UC_X86_REG_ESI, UC_X86_REG_EDI)]
    a2 = bytes(u.mem_read(ARENA, ARENA_N))
    d2 = bytes(u.mem_read(DATA_LO, DATA_N))
    return out, st0, depth, diffs(arena, a2, ARENA), diffs(DATA0, d2, DATA_LO) if d2 != DATA0 else ""


def diffs(a, b, base):
    s, i, n = [], 0, len(a)
    while i < n:
        if a[i:i + 4096] == b[i:i + 4096]:
            i += 4096
            continue
        end = min(n, i + 4096)
        while i < end:
            if a[i] == b[i]:
                i += 1
                continue
            j = i
            while j < n and a[j] != b[j]:
                j += 1
            s.append(f" {base + i:x}:{b[i:j].hex()}")
            i = j
    return "".join(s)


def make_input():
    arena = bytearray(rnd.getrandbits(8) for _ in range(ARENA_N))
    # sprinkle arena-internal pointers so `this->ptr->x` chains stay mapped
    for k in range(0, ARENA_N, 16):
        if rnd.random() < 0.35:
            arena[k:k + 4] = struct.pack("<I", ARENA + rnd.randrange(0, ARENA_N - 64) & ~3)
    def val():
        r = rnd.random()
        return (ARENA + rnd.randrange(0, ARENA_N - 256) & ~3) if r < 0.5 else (rnd.randrange(0, 64) if r < 0.85
                                                                                 else rnd.getrandbits(32))
    regs = {k: val() for k in ("eax", "ecx", "edx", "ebx", "ebp", "esi", "edi")}
    return regs, [val() for _ in range(16)], bytes(arena)


E = sorted(I.entries())
if args.what.startswith("0x"):
    fns = [int(x, 16) for x in args.what.split(",")]
elif args.mn:
    import cfg
    want = set(args.mn.split(","))
    fns = []
    for a in rnd.sample(E, len(E)):
        f = cfg.Func(a, set(E))
        if any(i.mnemonic.split()[-1] in want for i in f.insns.values()):
            fns.append(a)
            if len(fns) >= int(args.what):
                break
else:
    fns = rnd.sample(E, int(args.what))

cases, expect = [], []
for fn in fns:
    for _ in range(args.per):
        regs, sargs, arena = make_input()
        r = run_orig(fn, regs, sargs, arena)
        if r is None:
            continue
        cases.append(struct.pack("<26I", fn, regs["eax"], regs["ecx"], regs["edx"], regs["ebx"], 0, regs["ebp"],
                                 regs["esi"], regs["edi"], 16, *sargs) + arena)
        expect.append(r)
print(f"{len(fns)} functions, {len(cases)} runnable cases ({len({c[:4] for c in cases})} functions)", file=sys.stderr)

path = os.path.join(os.path.dirname(args.bin), "cases.bin")
start, results = 0, []
while start < len(cases):
    open(path, "wb").write(b"".join(cases[start:]))
    p = subprocess.run([args.bin, path], capture_output=True, text=True)
    lines = p.stdout.splitlines()
    results += lines
    start += len(lines)
    if start < len(cases):   # crashed on case `start`
        fn = struct.unpack_from("<I", cases[start])[0]
        results.append(f"CRASH {p.stderr.strip()[-400:]}")
        print(f"crash in {fn:08x}: {p.stderr.strip()[-300:]}", file=sys.stderr)
        start += 1

bad, badfn = 0, set()
for case, exp, line in zip(cases, expect, results):
    fn = struct.unpack_from("<I", case)[0]
    out, st0, depth, ad, dd = exp
    want = "%x %x %x %x %x %d %x %x %x" % (fn, *out[:4], out[4] if out[4] < 2**31 else out[4] - 2**32, *out[5:])
    ok = False
    if not line.startswith("CRASH"):
        head, a_got, d_got = line.split("|")
        h = head.split()
        got_regs = " ".join(h[:9])
        st_ok = int(h[10]) == depth and (depth == 0 or abs(float(h[9]) - st0) <= 1e-9 * max(1.0, abs(st0)))
        ok = got_regs == want and st_ok and a_got.strip() == ad.strip() and d_got.strip() == dd.strip()
    if not ok:
        bad += 1
        if fn not in badfn and (args.v or len(badfn) < 15):
            print(f"MISMATCH {fn:08x}\n  want {want} st0={st0} depth={depth} |{ad[:200]} |{dd[:200]}\n  got  {line[:600]}")
        badfn.add(fn)
print(f"{len(cases) - bad}/{len(cases)} cases pass; {len(badfn)} functions mismatch: "
      + " ".join(f"{a:08x}" for a in sorted(badfn)[:40]))
