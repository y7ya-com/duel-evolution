"""Recursive-descent CFG for one function: every instruction reachable from its entry without crossing a call.

A `jmp` to another function's entry is a tail call. Code shared between functions (a jump into another body) is
simply decoded into both: recompiled code doesn't care about duplication.
"""
from capstone import x86 as X

import image as I

NORETURN_IMPORTS = {"ExitProcess", "ExitThread", "RaiseException", "FatalAppExitA", "TerminateProcess"}


def is_jcc(i):
    return (i.group(X.X86_GRP_JUMP) and i.mnemonic != "jmp") or i.mnemonic in ("loop", "loope", "loopne", "jecxz")


def mem_op(i):
    for op in i.operands:
        if op.type == X.X86_OP_MEM:
            return op.mem
    return None


def jump_table(i):
    """`jmp [idx*4 + tbl]` with a relocated table -> list of targets, else None"""
    m = mem_op(i)
    if m is None or m.base or m.scale != 4 or m.segment:
        return None
    t, out = m.disp & 0xFFFFFFFF, []
    back = t - 4
    while back in I.fixups and t - back <= 16 and I.in_text(I.u32(back) or 0):   # CRT memcpy: negative indices
        out.append(I.u32(back))
        back -= 4
    skip = 0
    while t not in I.fixups and skip < 2 and not out:   # CRT memcpy: slot 0 unused (no relocation)
        t, skip = t + 4, skip + 1
    while t in I.fixups:
        v = I.u32(t)
        if v is None or not I.in_text(v):
            break
        out.append(v)
        t += 4
    return out or None


class Func:
    __slots__ = ("entry", "insns", "labels", "tables", "tails", "tails_at", "calls", "problems")

    def __init__(self, entry, entries):
        self.entry = entry
        self.insns = {}      # addr -> capstone insn (dropped after emitting)
        self.labels = {entry}
        self.tables = {}     # jmp addr -> [targets]
        self.tails = set()   # functions reached by jmp
        self.tails_at = set()   # addresses of those jmps
        self.calls = set()
        self.problems = []
        work = [entry]
        while work:
            a = work.pop()
            while a not in self.insns:
                if not I.in_text(a):
                    self.problems.append(("outside", a))
                    break
                i = I.decode(a)
                if i is None:
                    self.problems.append(("undecodable", a))
                    break
                self.insns[a] = i
                nxt = a + i.size
                mn = i.mnemonic
                if mn in ("ret", "retf", "iretd", "hlt", "int3", "ud2"):
                    break
                if mn == "jmp":
                    op = i.operands[0]
                    if op.type == X.X86_OP_IMM:
                        t = I.res(op.imm & 0xFFFFFFFF)
                        if t in entries and t != entry:
                            self.tails.add(t)
                            self.tails_at.add(a)
                        else:
                            self.labels.add(t)
                            work.append(t)
                    else:
                        tab = jump_table(i)
                        if tab:
                            self.tables[a] = tab
                            for t in tab:
                                self.labels.add(t)
                                work.append(t)
                    break
                if is_jcc(i):
                    t = i.operands[0].imm & 0xFFFFFFFF
                    self.labels.add(t)
                    self.labels.add(nxt)
                    work.append(t)
                elif mn == "call":
                    op = i.operands[0]
                    if op.type == X.X86_OP_IMM:
                        self.calls.add(I.res(op.imm & 0xFFFFFFFF))
                    else:
                        m = mem_op(i)
                        if m is not None and not m.base and not m.index and \
                                I.imports.get(m.disp & 0xFFFFFFFF, ("", ""))[1] in NORETURN_IMPORTS:
                            break
                a = nxt


def flag_returners(funcs_iter):
    """Functions whose callers read the flags they return (CRT asm: `call _isnan_helper; je ...`).
    funcs_iter yields Func objects; returns the set of entries that must export flags at `ret`."""
    import emit
    direct, edges = set(), []
    for f in funcs_iter:
        for a, i in f.insns.items():
            if i.mnemonic == "jmp" and a in f.tails_at:
                edges.append((f.entry, I.res(i.operands[0].imm & 0xFFFFFFFF)))
            if i.mnemonic != "call" or i.operands[0].type != X.X86_OP_IMM:
                continue
            g = I.res(i.operands[0].imm & 0xFFFFFFFF)
            x, n = a + i.size, 0
            while x in f.insns and n < 12:
                j = f.insns[x]
                u, d, cond = emit.flag_info(j)
                if u:
                    direct.add(g)
                    break
                if (d == emit.ALL and not cond) or j.mnemonic in ("call",):
                    break
                if j.mnemonic == "ret":
                    edges.append((f.entry, g))
                    break
                if j.mnemonic == "jmp" and j.operands[0].type == X.X86_OP_IMM:
                    x = j.operands[0].imm & 0xFFFFFFFF
                elif is_jcc(j) or j.mnemonic == "jmp":
                    break
                else:
                    x += j.size
                n += 1
    out = set(direct)
    changed = True
    while changed:
        changed = False
        for f, g in edges:
            if f in out and g not in out:
                out.add(g)
                changed = True
    return out
