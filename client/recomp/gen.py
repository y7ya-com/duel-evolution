"""Generate C for yo2.exe: recomp/out/{rc_funcs.h, rc_NNN.c, rc_table.c}.

    .venv/bin/python gen.py [--only 0xADDR,...] [--out DIR]

Every function reachable from the known entries becomes `void f_XXXXXXXX(CPU*)` (weak, so a hand-written override
with the same name wins at link time). Output is Konami-derived and not committed: regenerate it.
"""
import argparse
import array
import collections
import hashlib
import os
import pickle
import sys
import time

from capstone import x86 as X

import cfg
import emit
import image as I
from hooks import IMM_HOOKS

ap = argparse.ArgumentParser()
ap.add_argument("--only", default="")
ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"))
ap.add_argument("--chunk", type=int, default=400_000, help="approx bytes of C per file (new chunks.txt only)")
ap.add_argument("--no-cache", action="store_true", help="ignore out/emitcache.pkl")
args = ap.parse_args()
os.makedirs(args.out, exist_ok=True)

t0 = time.time()
E = I.entries()
only = {int(x, 16) for x in args.only.split(",") if x}
FR_CACHE = os.path.join(args.out, "flagret.txt")
if os.path.exists(FR_CACHE) and os.path.getmtime(FR_CACHE) > max(os.path.getmtime(p) for p in ("cfg.py", "emit.py", "image.py")):
    flagret = {int(l, 16) for l in open(FR_CACHE)}
else:
    flagret = cfg.flag_returners(cfg.Func(a, E) for a in sorted(E))
    open(FR_CACHE, "w").write("".join(f"{a:x}\n" for a in sorted(flagret)))
print(f"{len(flagret)} functions return flags", file=sys.stderr)
# Per-function cache (out/emitcache.pkl). Valid while the global key holds: the recompiler's code (hooks.py apart), the
# exe, the entry set and the flag-returners. An entry also records the IMM_HOOKS that fall on its instructions, so a
# hook edit re-emits only the functions it touches.
HERE = os.path.dirname(os.path.abspath(__file__))
gkey = hashlib.sha256()
for p in ("cfg.py", "emit.py", "image.py"):
    gkey.update(open(os.path.join(HERE, p), "rb").read())
gkey.update(I.b)
gkey.update(array.array("I", sorted(E)).tobytes())
gkey.update(array.array("I", sorted(flagret)).tobytes())
gkey = gkey.hexdigest()
CACHE = os.path.join(args.out, "emitcache.pkl")
cache = {}
if not args.no_cache and not only and os.path.exists(CACHE):
    with open(CACHE, "rb") as fc:
        k, cache = pickle.load(fc)
    if k != gkey:
        cache = {}
hits = 0


def hooks_on(addrs):
    return {h: v for h, v in IMM_HOOKS.items() if h in addrs}


def text_reads(f):
    """.text bytes the code reads as data, as (va, n): jump tables, and the byte tables in front of two-level
    switches (`mov cl, [eax + tbl]`). The boot copies only these (rc_textdata) and never reads .text from the exe."""
    out = []
    for a, i in f.insns.items():
        for op in i.operands:
            if op.type != X.X86_OP_MEM or op.mem.base in (X.X86_REG_ESP, X.X86_REG_EBP):
                continue
            d = op.mem.disp & 0xFFFFFFFF
            if not I.in_text(d):
                continue
            if a in f.tables:   # cfg.jump_table: up to 28 bytes of negative slots before (after a neg), 2 skipped slots
                out.append((d - 28, 4 * len(f.tables[a]) + 44))
            else:   # ponytail: a register index can reach 255 elements past the table
                out.append((d, op.size * (256 if op.mem.base or op.mem.index else 1)))
    return out


work = sorted(only or E, reverse=True)
done, defined, referenced = set(), set(), set()
tdata = []
problems = collections.Counter()
prob_list = []
codes = {}


def write_if_changed(path, text):
    try:
        if open(path).read() == text:
            return
    except FileNotFoundError:
        pass
    open(path, "w").write(text)


while work:
    a = work.pop()
    if a in done:
        continue
    done.add(a)
    ent = cache.get(a)
    if ent is not None and "tdata" in ent and hooks_on(set(ent["addrs"])) == ent["hooks"]:   # cached: no decode/emit
        hits += 1
        tdata += ent["tdata"]
        for c in ent["calls"]:
            if c not in E and I.in_text(c):
                E.add(c)
            if not only and c not in done:
                work.append(c)
            referenced.add(c)
        for p in ent["eprob"]:
            problems[p[1] + " / " + p[2]] += 1
            prob_list.append(p)
        for k in ent["fprob"]:
            problems[k[0]] += 1
        defined.add(a)
        codes[a] = ent["code"]
        continue
    f = cfg.Func(a, E)
    calls = sorted(f.calls | f.tails)
    td = text_reads(f)
    tdata += td
    addrs = array.array("I", sorted(f.insns))
    for c in f.calls | f.tails:
        if c not in E and I.in_text(c):
            E.add(c)
        if not only and c not in done:
            work.append(c)
        referenced.add(c)
    name = f"f_{a:08x}"
    e = emit.Emit(f, E, name, flagret)
    code = e.run()
    for p in e.problems:
        problems[p[1] + " / " + p[2]] += 1
        prob_list.append(p)
    for k in f.problems:
        problems[k[0]] += 1
    defined.add(a)
    codes[a] = code
    if not only:
        cache[a] = {"code": code, "addrs": addrs, "hooks": hooks_on(set(addrs)), "calls": calls,
                    "eprob": list(e.problems), "fprob": [tuple(k) for k in f.problems], "tdata": td}
if not only:
    tmp = CACHE + ".tmp"
    with open(tmp, "wb") as fc:
        pickle.dump((gkey, {a: cache[a] for a in defined if a in cache}), fc, protocol=pickle.HIGHEST_PROTOCOL)
    os.replace(tmp, CACHE)

# files by address range, boundaries kept in out/chunks.txt so a change to one function rebuilds one file
CH = os.path.join(args.out, "chunks.txt")
if os.path.exists(CH) and not only:
    bounds = [int(l, 16) for l in open(CH)]
else:
    bounds, n = [], 0
    for a in sorted(codes):
        if n > args.chunk or not bounds:
            bounds.append(a)
            n = 0
        n += len(codes[a])
    if not only:
        open(CH, "w").write("".join(f"{x:x}\n" for x in bounds))
import bisect
chunks = [[] for _ in bounds]
for a in sorted(codes):
    chunks[max(0, bisect.bisect_right(bounds, a) - 1)].append(codes[a])

# functions referenced but not generated (outside .text, or --only): trap stubs
missing = sorted(referenced - defined)
hdr = ['#include "rc.h"']
allfn = sorted(defined | set(missing))
hdr += [f"void f_{a:08x}(CPU *c);" for a in allfn]
for dll_name in sorted({I.imp_name(d, n) for d, n in I.imports.values()}):
    hdr.append(f"void {dll_name}(CPU *c);")
write_if_changed(os.path.join(args.out, "rc_funcs.h"), "\n".join(hdr) + "\n")

for k, ch in enumerate(chunks):
    write_if_changed(os.path.join(args.out, f"rc_{k:03d}.c"),
                     '#include "rc_funcs.h"\n#pragma clang diagnostic ignored "-Wunused-label"\n\n' + "\n\n".join(ch) + "\n")
import glob
for p in glob.glob(os.path.join(args.out, "rc_[0-9][0-9][0-9].c")):
    if int(os.path.basename(p)[3:6]) >= len(chunks):
        os.remove(p)

import io
fo = io.StringIO()   # rc_table.c only rewritten when it changes (its object takes a while)
fo.write('#include "rc_funcs.h"\n#include "rc_table.h"\n\n')
for a in missing:
    fo.write(f'RC_FUNC(f_{a:08x}) {{ rc_trap(c, 0x{a:x}u, "no code generated"); }}\n')
# every callable guest address: entries, plus every thunk -> its target
rows = {a: a for a in allfn}
for a in list(I.thunks) + [a for a, fn in I.funcs.items() if fn.get("thunk")]:
    if I.res(a) in rows:
        rows[a] = I.res(a)
fo.write("const RcEntry rc_table[] = {\n")
for a in sorted(rows):
    fo.write(f"  {{0x{a:x}u, f_{rows[a]:08x}}},\n")
fo.write("};\nconst unsigned rc_table_n = sizeof rc_table / sizeof rc_table[0];\n")
fo.write("const RcImport rc_imports[] = {\n")
for iat, (d, n) in sorted(I.imports.items()):
    fo.write(f'  {{0x{iat:x}u, {I.imp_name(d, n)}, "{d}", "{n}"}},\n')
fo.write("};\nconst unsigned rc_imports_n = sizeof rc_imports / sizeof rc_imports[0];\n")
# weak fallbacks: a missing import logs loudly and stops (stdcall arg count unknown -> can't continue)
from winapi_args import ARGS
for d, n in sorted(set(I.imports.values())):
    s = I.imp_name(d, n)
    k = ARGS.get(n, -1)
    k = 0 if k is None else k   # cdecl: the caller pops
    fo.write(f'RC_WEAK void {s}(CPU *c) {{ rc_missing_import(c, "{d}!{n}", {k}); }}\n')
# what the boot copies into the image instead of reading the exe's .text: its headers and text_reads' ranges
tlo, thi = I.TLO, I.THI
runs = []
for va, n in sorted((max(va, tlo), min(va + n, thi) - max(va, tlo)) for va, n in tdata):
    if n <= 0:
        continue
    if runs and va <= runs[-1][0] + runs[-1][1]:
        runs[-1][1] = max(runs[-1][1], va + n - runs[-1][0])
    else:
        runs.append([va, n])
hdr = I.b[:I.off(tlo)]
blob = hdr + b"".join(I.b[I.off(va):I.off(va) + n] for va, n in runs)
fo.write(f"const RcTextData rc_textdata[] = {{\n  {{0x{I.BASE:x}u, {len(hdr)}u}},\n")
fo.write("".join(f"  {{0x{va:x}u, {n}u}},\n" for va, n in runs))
fo.write("};\nconst unsigned rc_textdata_n = sizeof rc_textdata / sizeof rc_textdata[0];\nconst uint8_t rc_textdata_bytes[] = {")
fo.write(",".join(str(x) for x in blob) + "};\n")
write_if_changed(os.path.join(args.out, "rc_table.c"), fo.getvalue())

with open(os.path.join(args.out, "problems.tsv"), "w") as fo:
    for a, mn, why in sorted(prob_list):
        fo.write(f"{a:08x}\t{mn}\t{why}\n")
print(f"{len(defined)} functions ({hits} cached), {len(chunks)} files, {len(missing)} trap stubs, {time.time() - t0:.0f}s",
      file=sys.stderr)
for k, n in problems.most_common(40):
    print(f"  {n:6} {k}", file=sys.stderr)
