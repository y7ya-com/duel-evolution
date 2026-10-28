"""Whole-exe survey: function count, coverage, mnemonics, indirect jumps, problems."""
import collections, sys, time
from capstone import x86 as X
import image as I, cfg

t0 = time.time()
E = I.entries()
print("entries", len(E), "imports", len(I.imports), "fixups", len(I.fixups), file=sys.stderr)
seen, done = set(), set()
mn = collections.Counter(); mnf = collections.defaultdict(set)
probs = collections.Counter(); ijmp = []; extra = set(); ntab = 0; nf = 0
work = sorted(E)
while work:
    a = work.pop()
    if a in done: continue
    done.add(a)
    f = cfg.Func(a, E); nf += 1
    for x, i in f.insns.items():
        if x not in seen:
            seen.add(x); mn[i.mnemonic] += 1
        mnf[i.mnemonic].add(a)
        if i.mnemonic == "jmp" and i.operands[0].type != X.X86_OP_IMM and x not in f.tables:
            m = cfg.mem_op(i)
            if not (m and not m.base and not m.index and (m.disp & 0xFFFFFFFF) in I.imports):
                ijmp.append((a, x, i.op_str))
    ntab += len(f.tables)
    for p in f.problems: probs[p[0]] += 1
    for c in f.calls:
        if c not in E and I.in_text(c):
            E.add(c); extra.add(c); work.append(c)
print(f"functions {nf} (+{len(extra)} call targets not in lists) insns {len(seen)} tables {ntab} {time.time()-t0:.0f}s")
print("problems", dict(probs))
print("indirect jmps w/o table", len(ijmp)); [print("  %08x %08x %s" % t) for t in ijmp[:30]]
print("mnemonics", len(mn))
for m, n in mn.most_common(): print(f"  {m:10} {n:8} funcs={len(mnf[m])}")
