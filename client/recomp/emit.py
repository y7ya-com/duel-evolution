"""x86-32 -> C for one function (see recomp/README.md for the model).

Registers live in `CPU *restrict c`; guest memory is `m + addr` (m = rc_mem, a local so stores can't alias it).
Flags are C locals, computed only where a reader needs them: a reader whose flags all come from one cmp/sub/test/...
(a "fusable" producer) computes its condition straight from the producer's saved operands; everything else falls back
to eager flag locals (cf zf sf of pf) set by the producers that reach it.
"""
from capstone import x86 as X

import cfg
import image as I

C_, Z_, S_, O_, P_ = 1, 2, 4, 8, 16
ALL = 31
FUSABLE = {"add", "sub", "cmp", "and", "or", "xor", "test", "inc", "dec", "neg"}
CC = {  # condition -> flags read
    "o": O_, "no": O_, "b": C_, "ae": C_, "e": Z_, "ne": Z_, "be": C_ | Z_, "a": C_ | Z_,
    "s": S_, "ns": S_, "p": P_, "np": P_, "l": S_ | O_, "ge": S_ | O_, "le": Z_ | S_ | O_, "g": Z_ | S_ | O_}
ALIAS = {"c": "b", "nae": "b", "nc": "ae", "nb": "ae", "z": "e", "nz": "ne", "na": "be", "nbe": "a", "pe": "p",
         "po": "np", "nge": "l", "nl": "ge", "ng": "le", "nle": "g"}
T = {1: "uint8_t", 2: "uint16_t", 4: "uint32_t", 8: "uint64_t"}
ST = {1: "int8_t", 2: "int16_t", 4: "int32_t", 8: "int64_t"}
SIGN = {1: "0x80u", 2: "0x8000u", 4: "0x80000000u"}
MASK = {1: "0xffu", 2: "0xffffu", 4: "0xffffffffu"}

R32 = {"eax", "ecx", "edx", "ebx", "esp", "ebp", "esi", "edi"}
R16 = {"ax": "eax", "cx": "ecx", "dx": "edx", "bx": "ebx", "sp": "esp", "bp": "ebp", "si": "esi", "di": "edi"}
R8L = {"al": "eax", "cl": "ecx", "dl": "edx", "bl": "ebx"}
R8H = {"ah": "eax", "ch": "ecx", "dh": "edx", "bh": "ebx"}

STRING_OPS = {0xA4: "movs", 0xA5: "movs", 0xAA: "stos", 0xAB: "stos", 0xAC: "lods", 0xAD: "lods",
              0xAE: "scas", 0xAF: "scas", 0xA6: "cmps", 0xA7: "cmps"}
PREFIXES = {0xF0, 0xF2, 0xF3, 0x2E, 0x36, 0x3E, 0x26, 0x64, 0x65, 0x66, 0x67}


def cond_of(mn, prefix):
    c = mn[len(prefix):]
    return ALIAS.get(c, c)


def opbytes(i):
    bs = bytes(i.bytes)
    k = 0
    while bs[k] in PREFIXES:
        k += 1
    return bs[:k], bs[k:]


class Unsupported(Exception):
    pass


def base_mn(i):
    mn = i.mnemonic
    for p in ("lock ", "rep ", "repe ", "repne ", "repz ", "repnz "):
        if mn.startswith(p):
            mn = mn[len(p):]
    return mn


def flag_info(i):
    """(uses, defs, conditional_def) for flag dataflow"""
    pre, ob = opbytes(i)
    op0 = ob[0]
    if op0 in STRING_OPS:
        k = STRING_OPS[op0]
        if k in ("scas", "cmps"):
            return (0, ALL, any(p in (0xF2, 0xF3) for p in pre))
        return (0, 0, False)
    if 0xD8 <= op0 <= 0xDF:
        return (0, 0, False)
    mn = base_mn(i)
    if mn in ("add", "sub", "cmp", "and", "or", "xor", "test", "neg", "shld", "shrd", "imul", "mul", "div", "idiv"):
        return (0, ALL, False)
    if mn in ("adc", "sbb"):
        return (C_, ALL, False)
    if mn in ("inc", "dec"):
        return (0, Z_ | S_ | O_ | P_, False)
    if mn in ("shl", "sal", "shr", "sar", "rol", "ror", "rcl", "rcr"):
        d = ALL if mn in ("shl", "sal", "shr", "sar") else C_ | O_
        u = C_ if mn in ("rcl", "rcr") else 0
        n = i.operands[1]
        if n.type == X.X86_OP_IMM:
            return (u, d, False) if n.imm & 31 else (u, 0, False)
        return (u | d, d, True)
    if mn in ("bt", "bts", "btr", "btc", "stc", "clc"):
        return (0, C_, False)
    if mn == "cmc":
        return (C_, C_, False)
    if mn == "sahf":
        return (0, C_ | Z_ | S_ | P_, False)
    if mn == "popfd":
        return (0, ALL, False)
    if mn in ("pushfd", "lahf"):
        return (ALL, 0, False)
    if mn.startswith("set"):
        return (CC[cond_of(mn, "set")], 0, False)
    if mn.startswith("cmov"):
        return (CC[cond_of(mn, "cmov")], 0, False)
    if mn in ("loope", "loopne"):
        return (Z_, 0, False)
    if mn.startswith("j") and mn not in ("jmp", "jecxz"):
        return (CC[cond_of(mn, "j")], 0, False)
    if mn == "call":
        return (0, ALL, False)
    return (0, 0, False)


from hooks import IMM_HOOKS   # noqa: E402 (hooks.py: per-function cache key)


class Emit:
    def __init__(self, f, entries, fname, flagret=frozenset()):
        self.f, self.entries, self.fname = f, entries, fname
        self.flagret = f.entry in flagret   # callers read flags this function returns
        self.out = []
        self.decl = set()
        self.order = sorted(f.insns)
        self.problems = []

    # ---------- operands
    def addr(self, op):
        m = op.mem
        parts = []
        if m.base:
            parts.append(self.reg32(m.base))
        if m.index:
            r = self.reg32(m.index)
            parts.append(f"{r}*{m.scale}" if m.scale != 1 else r)
        if m.disp or not parts:
            parts.append(f"0x{m.disp & 0xFFFFFFFF:x}u")
        e = " + ".join(parts)
        if m.segment == X.X86_REG_FS:
            e = f"c->fs_base + {e}"
        elif m.segment not in (0, X.X86_REG_DS, X.X86_REG_SS, X.X86_REG_ES, X.X86_REG_CS):
            raise Unsupported("segment")
        return f"(uint32_t)({e})"

    def reg32(self, r):
        n = self.i.reg_name(r)
        if n not in R32:
            raise Unsupported("addr reg " + n)
        return f"c->{n}"

    def rd(self, op, size=None):
        if op.type == X.X86_OP_IMM:
            s = size or op.size
            return f"0x{op.imm & ((1 << (8 * s)) - 1):x}u"
        if op.type == X.X86_OP_REG:
            n = self.i.reg_name(op.reg)
            if n in R32:
                return f"c->{n}"
            if n in R16:
                return f"(uint16_t)c->{R16[n]}"
            if n in R8L:
                return f"(uint8_t)c->{R8L[n]}"
            if n in R8H:
                return f"(uint8_t)(c->{R8H[n]} >> 8)"
            raise Unsupported("reg " + n)
        if op.type == X.X86_OP_MEM:
            if op.size not in (1, 2, 4, 8):
                raise Unsupported(f"{op.size}-byte operand")
            return f"RD{op.size * 8}({self.addr(op)})"
        raise Unsupported("op")

    def wr(self, op, v):
        if op.type == X.X86_OP_REG:
            n = self.i.reg_name(op.reg)
            if n in R32:
                return f"c->{n} = {v};"
            if n in R16:
                r = R16[n]
                return f"c->{r} = (c->{r} & 0xffff0000u) | (uint16_t)({v});"
            if n in R8L:
                r = R8L[n]
                return f"c->{r} = (c->{r} & 0xffffff00u) | (uint8_t)({v});"
            if n in R8H:
                r = R8H[n]
                return f"c->{r} = (c->{r} & 0xffff00ffu) | ((uint32_t)(uint8_t)({v}) << 8);"
            raise Unsupported("reg " + n)
        if op.type == X.X86_OP_MEM:
            if op.size not in (1, 2, 4, 8):
                raise Unsupported(f"{op.size}-byte operand")
            return f"WR{op.size * 8}({self.addr(op)}, {v});"
        raise Unsupported("wr")

    # ---------- flags
    def tmp(self, name, ty="uint32_t"):
        self.decl.add((ty, name))
        return name

    def flag_exprs(self, kind, a, b, r, s):
        """C expressions for each flag after `kind` with operands a, b, result r (all masked, size s)"""
        sg, N = SIGN[s], 8 * s
        e = {Z_: f"({r} == 0)", S_: f"(({r} & {sg}) != 0)", P_: f"rc_parity({r})"}
        if kind in ("add", "inc"):
            e[C_] = f"({r} < {a})"
            e[O_] = f"(((({a} ^ {r}) & ({b} ^ {r})) & {sg}) != 0)"
        elif kind in ("sub", "cmp", "dec", "neg"):
            e[C_] = f"({a} < {b})"
            e[O_] = f"(((({a} ^ {b}) & ({a} ^ {r})) & {sg}) != 0)"
        else:  # logic
            e[C_] = "0"
            e[O_] = "0"
        return e

    def cond_expr(self, cc, fl):
        """condition from flag expressions (dict) -- also used with the eager locals"""
        C, Z, S, O, P = fl[C_], fl[Z_], fl[S_], fl[O_], fl[P_]
        return {"o": O, "no": f"!{O}", "b": C, "ae": f"!{C}", "e": Z, "ne": f"!{Z}", "be": f"({C} || {Z})",
                "a": f"(!{C} && !{Z})", "s": S, "ns": f"!{S}", "p": P, "np": f"!{P}", "l": f"({S} != {O})",
                "ge": f"({S} == {O})", "le": f"({Z} || {S} != {O})", "g": f"(!{Z} && {S} == {O})"}[cc]

    def fused_cond(self, p, cc):
        kind, s = self.fuse_info[p]
        a, b, r = f"fa_{p:x}", f"fb_{p:x}", f"fr_{p:x}"
        st, t = ST[s], T[s]
        if kind in ("cmp", "sub"):
            d = {"e": f"{a} == {b}", "ne": f"{a} != {b}", "b": f"{a} < {b}", "ae": f"{a} >= {b}",
                 "be": f"{a} <= {b}", "a": f"{a} > {b}", "l": f"({st}){a} < ({st}){b}",
                 "ge": f"({st}){a} >= ({st}){b}", "le": f"({st}){a} <= ({st}){b}", "g": f"({st}){a} > ({st}){b}"}
            if cc in d:
                return f"({d[cc]})"
        if kind in ("and", "or", "xor", "test"):
            d = {"e": f"{r} == 0", "ne": f"{r} != 0", "s": f"({st}){r} < 0", "ns": f"({st}){r} >= 0",
                 "l": f"({st}){r} < 0", "ge": f"({st}){r} >= 0", "le": f"({st}){r} <= 0", "g": f"({st}){r} > 0",
                 "b": "0", "ae": "1", "be": f"{r} == 0", "a": f"{r} != 0"}
            if cc in d:
                return f"({d[cc]})"
        return self.cond_expr(cc, self.flag_exprs(kind, a, b, r, s))

    def cond(self, cc):
        """condition for the current instruction (a flag reader)"""
        p = self.fused.get(self.i.address)
        if p is not None:
            return self.fused_cond(p, cc)
        return self.cond_expr(cc, {C_: "c->cf", Z_: "c->zf", S_: "c->sf", O_: "c->of", P_: "c->pf"})

    def set_flags(self, kind, a, b, r, s, need=None):
        """producer: save fusion temps and/or eager flags"""
        x = self.i.address
        need = self.eager.get(x, 0) if need is None else need
        L = []
        if x in self.fuse_info:
            t = T[s]
            for n, v in (("fa", a), ("fb", b), ("fr", r)):
                L.append(f"{self.tmp(f'{n}_{x:x}', t)} = {v};")
            a, b, r = f"fa_{x:x}", f"fb_{x:x}", f"fr_{x:x}"
        if need:
            e = self.flag_exprs(kind, a, b, r, s)
            for bit, nm in ((C_, "c->cf"), (Z_, "c->zf"), (S_, "c->sf"), (O_, "c->of"), (P_, "c->pf")):
                if need & bit:
                    L.append(f"{nm} = {e[bit]};")
        return L

    def eager_set(self, d):
        """set eager flags from explicit expressions {bit: expr}, only those needed"""
        need = self.eager.get(self.i.address, 0)
        return [f"{nm} = {d[bit]};" for bit, nm in ((C_, "c->cf"), (Z_, "c->zf"), (S_, "c->sf"), (O_, "c->of"), (P_, "c->pf"))
                if need & bit and bit in d]

    # ---------- dataflow
    def analyse(self):
        f, order = self.f, self.order
        info = {a: flag_info(f.insns[a]) for a in order}
        if self.flagret:
            for a in order:
                if base_mn(f.insns[a]) == "ret" or a in f.tails_at:
                    info[a] = (ALL, info[a][1], info[a][2])
        succ = {}
        for a in order:
            i = f.insns[a]
            mn = base_mn(i)
            nxt = a + i.size
            s = []
            if mn in ("ret", "retf", "iretd", "hlt", "int3", "ud2"):
                pass
            elif mn == "jmp":
                op = i.operands[0]
                if op.type == X.X86_OP_IMM:
                    t = I.res(op.imm & 0xFFFFFFFF)
                    if t in f.insns and t not in f.tails:
                        s = [t]
                elif a in f.tables:
                    s = list(f.tables[a])
            elif cfg.is_jcc(i):
                s = [i.operands[0].imm & 0xFFFFFFFF, nxt]
            elif nxt in f.insns:
                s = [nxt]
            succ[a] = [t for t in s if t in f.insns]
        pred = {a: [] for a in order}
        for a, ss in succ.items():
            for t in ss:
                pred[t].append(a)
        # reaching producers: per flag a frozenset of producer addrs (-1 = unknown: entry/call)
        UNK = frozenset([-1])
        reach_in = {}
        state = {}
        work = list(order)
        inset = set(work)
        entry = f.entry
        while work:
            a = work.pop(0)
            inset.discard(a)
            if a == entry or not pred[a]:
                cur = [UNK] * 5
            else:
                cur = None
            for p in pred[a]:
                if p in state:
                    ps = state[p]
                    cur = list(ps) if cur is None else [cur[k] | ps[k] for k in range(5)]
            if cur is None:
                cur = [UNK] * 5
            if a == entry and pred[a]:
                cur = [cur[k] | UNK for k in range(5)]
            reach_in[a] = cur
            u, d, cond = info[a]
            out = list(cur)
            for k in range(5):
                if d >> k & 1:
                    me = UNK if base_mn(f.insns[a]) == "call" else frozenset([a])
                    out[k] = (cur[k] | me) if cond else me
            out = tuple(out)
            if state.get(a) != out:
                state[a] = out
                for t in succ[a]:
                    if t not in inset:
                        work.append(t)
                        inset.add(t)
        self.fused, self.eager, self.fuse_info = {}, {}, {}
        for a in order:
            u = info[a][0]
            if not u:
                continue
            i = f.insns[a]
            rs = [reach_in[a][k] for k in range(5) if u >> k & 1]
            srcs = frozenset().union(*rs)
            mn = base_mn(i)
            fusable_reader = mn.startswith(("j", "set", "cmov")) and mn not in ("jmp", "jecxz")
            if fusable_reader and len(srcs) == 1 and all(len(r) == 1 for r in rs):
                p = next(iter(srcs))
                if p != -1 and base_mn(f.insns[p]) in FUSABLE and not f.insns[p].mnemonic.startswith("lock"):
                    self.fused[a] = p
                    pi = f.insns[p]
                    self.fuse_info[p] = (base_mn(pi), pi.operands[0].size)
                    continue
            for k in range(5):
                if u >> k & 1:
                    for p in reach_in[a][k]:
                        if p != -1:
                            self.eager[p] = self.eager.get(p, 0) | (1 << k)
        self.succ = succ

    # ---------- main
    def run(self):
        self.analyse()
        body = []
        prev_fall = None
        for a in self.order:
            if prev_fall is not None and prev_fall != a:
                body.append(f"  goto L_{prev_fall:x};")
            body.append(f"L_{a:x}:")
            self.i = i = self.f.insns[a]
            try:
                lines = self.insn(i)
                if i.mnemonic.startswith("lock "):   # one runtime mutex around the read-modify-write (CRT counters)
                    lines = ["{ extern void rc_atomic(int); rc_atomic(1); }"] + lines + ["{ extern void rc_atomic(int); rc_atomic(0); }"]
                if a in IMM_HOOKS:   # a runtime value in place of one immediate
                    imm, expr = IMM_HOOKS[a]
                    assert any(imm in l for l in lines), (hex(a), lines)
                    decl = f"uint32_t {expr[:-2]}(void)" if expr.endswith("()") else f"uint32_t {expr}"   # a variable or a call
                    lines = [f"extern {decl};"] + [l.replace(imm, expr) for l in lines]
            except Unsupported as e:
                self.problems.append((a, i.mnemonic, str(e)))
                self.fall = None
                lines = [f'rc_trap(c, 0x{a:x}u, "{i.mnemonic} {i.op_str}: {e}"); return;']
            body.append(f"  /* {a:08x} {i.mnemonic} {i.op_str} */")
            body.extend("  " + l for l in lines)
            prev_fall = self.fall
        if prev_fall is not None:
            body.append(f'  rc_trap(c, 0x{prev_fall:x}u, "fell off decoded code"); return;')
        import re
        used = set(re.findall(r"goto L_([0-9a-f]+);", "\n".join(body)))
        if self.order and self.order[0] != self.f.entry:   # code below the entry (CRT strchr's shared exit): start at the entry
            used.add(f"{self.f.entry:x}")
        body = [l for l in body if not (l.startswith("L_") and l[2:-1] not in used)]
        head = [f"RC_FUNC({self.fname}) {{", "  RC_LOCALS;"]
        for ty, n in sorted(self.decl, key=lambda x: x[1]):
            head.append(f"  {ty} {n};")
        if f"{self.f.entry:x}" in used:
            head.append(f"  goto L_{self.f.entry:x};")
        return "\n".join(head + body + ["}"])

    def go(self, t):
        if t in self.f.insns:
            return f"goto L_{t:x};"
        return f'{{ rc_trap(c, 0x{self.i.address:x}u, "jump to undecoded {t:x}"); return; }}'

    def target_call(self, t):
        """C statement calling guest address t (resolved statically)"""
        t = I.res(t)
        return f"f_{t:08x}(c);"

    def insn(self, i):
        a, nxt = i.address, i.address + i.size
        self.fall = nxt if nxt in self.f.insns else None
        pre, ob = opbytes(i)
        if ob[0] in STRING_OPS:
            return self.string_op(pre, ob)
        if 0xD8 <= ob[0] <= 0xDF:
            return self.x87(i, ob)
        mn = base_mn(i)
        ops = i.operands
        h = getattr(self, "i_" + mn, None)
        if h is not None:
            return h(i, ops)
        for p in ("j", "set", "cmov"):
            if mn.startswith(p) and cond_of(mn, p) in CC:
                return getattr(self, "c_" + p)(i, ops, cond_of(mn, p))
        raise Unsupported("mnemonic")

    # control flow
    def c_j(self, i, ops, cc):
        t = ops[0].imm & 0xFFFFFFFF
        return [f"if ({self.cond(cc)}) {self.go(t)}"]

    def c_set(self, i, ops, cc):
        return [self.wr(ops[0], f"({self.cond(cc)}) ? 1 : 0")]

    def c_cmov(self, i, ops, cc):
        return [f"if ({self.cond(cc)}) {self.wr(ops[0], self.rd(ops[1]))}"]

    def i_jmp(self, i, ops):
        self.fall = None
        op = ops[0]
        if op.type == X.X86_OP_IMM:
            t = I.res(op.imm & 0xFFFFFFFF)
            if t in self.f.tails:
                return [self.target_call(t), "return;"]
            return [self.go(t)]
        if i.address in self.f.tables:
            L = [f"{{ uint32_t t = {self.rd(op)}; switch (t) {{"]
            for t in sorted(set(self.f.tables[i.address])):
                L.append(f"  case 0x{t:x}u: {self.go(t)}")
            L.append(f"  default: rc_ijmp(c, t); return; }} }}")
            return L
        if op.type == X.X86_OP_MEM and not op.mem.base and not op.mem.index and (op.mem.disp & 0xFFFFFFFF) in I.imports:
            return [f"{self.imp_call(op.mem.disp & 0xFFFFFFFF)} return;"]
        return [f"rc_ijmp(c, {self.rd(op)}); return;"]

    def imp_call(self, iat):
        dll, name = I.imports[iat]
        return f"{I.imp_name(dll, name)}(c);"

    def i_call(self, i, ops):
        op = ops[0]
        ret = f"0x{i.address + i.size:x}u"
        chk = f"if (c->ret_to != {ret}) return;"   # the callee returned past us (pop of its return address)
        if op.type == X.X86_OP_IMM:
            return [f"PUSH({ret}); {self.target_call(op.imm & 0xFFFFFFFF)} {chk}"]
        if op.type == X.X86_OP_MEM and not op.mem.base and not op.mem.index and (op.mem.disp & 0xFFFFFFFF) in I.imports:
            dll, name = I.imports[op.mem.disp & 0xFFFFFFFF]
            L = [f"PUSH({ret}); {self.imp_call(op.mem.disp & 0xFFFFFFFF)}"]
            if name in cfg.NORETURN_IMPORTS:   # RaiseException may leave through a catch continuation
                self.fall = None
                L.append(f"if (c->ret_to != {ret}) return;")
                L.append(f'rc_trap(c, 0x{i.address:x}u, "noreturn import returned"); return;')
            return L
        return [f"{{ uint32_t t = {self.rd(op)}; PUSH({ret}); rc_icall(c, t); }} {chk}"]

    def i_ret(self, i, ops):
        self.fall = None
        n = ops[0].imm if ops else 0
        return [f"c->ret_to = RD32(c->esp); c->esp += {4 + n}; return;"]

    def i_int3(self, i, ops):
        self.fall = None
        return [f'rc_trap(c, 0x{i.address:x}u, "int3"); return;']

    def i_hlt(self, i, ops):
        return self.i_int3(i, ops)

    def i_ud2(self, i, ops):
        return self.i_int3(i, ops)

    def i_loop(self, i, ops, cc=None):
        t = ops[0].imm & 0xFFFFFFFF
        c = f"--c->ecx != 0"
        if cc:
            c = f"--c->ecx != 0 && {'' if cc == 'e' else '!'}({self.cond('e')})"
        return [f"if ({c}) {self.go(t)}"]

    def i_loope(self, i, ops):
        return self.i_loop(i, ops, "e")

    def i_loopne(self, i, ops):
        return self.i_loop(i, ops, "ne")

    def i_jecxz(self, i, ops):
        return [f"if (c->ecx == 0) {self.go(ops[0].imm & 0xFFFFFFFF)}"]

    # data movement
    def i_mov(self, i, ops):
        if ops[0].type == X.X86_OP_REG and i.reg_name(ops[0].reg) not in R32 | set(R16) | set(R8L) | set(R8H):
            raise Unsupported("segment mov")
        if ops[1].type == X.X86_OP_REG and i.reg_name(ops[1].reg) not in R32 | set(R16) | set(R8L) | set(R8H):
            raise Unsupported("segment mov")
        return [self.wr(ops[0], self.rd(ops[1], ops[0].size))]

    def i_movzx(self, i, ops):
        return [self.wr(ops[0], self.rd(ops[1]))]

    def i_movsx(self, i, ops):
        return [self.wr(ops[0], f"(uint32_t)({ST[ops[1].size]}){self.rd(ops[1])}")]

    def i_lea(self, i, ops):
        m = ops[1]
        if m.mem.segment == X.X86_REG_FS:
            raise Unsupported("lea fs")
        return [self.wr(ops[0], self.addr(m))]

    def i_push(self, i, ops):
        op = ops[0]
        if op.type == X.X86_OP_IMM:
            return [f"PUSH(0x{op.imm & 0xFFFFFFFF:x}u);"]
        if op.type == X.X86_OP_REG and i.reg_name(op.reg) not in R32:
            raise Unsupported("push " + i.reg_name(op.reg))
        if op.size == 2:
            return [f"{{ uint16_t v = {self.rd(op)}; c->esp -= 2; WR16(c->esp, v); }}"]
        return [f"{{ uint32_t v = {self.rd(op)}; PUSH(v); }}"]

    def i_pop(self, i, ops):
        op = ops[0]
        if op.type == X.X86_OP_REG and i.reg_name(op.reg) not in R32:
            raise Unsupported("pop " + i.reg_name(op.reg))
        if op.size == 2:
            return [f"{{ uint16_t v = RD16(c->esp); c->esp += 2; {self.wr(op, 'v')} }}"]
        return [f"{{ uint32_t v = RD32(c->esp); c->esp += 4; {self.wr(op, 'v')} }}"]

    def i_pushal(self, i, ops):
        return ["{ uint32_t s = c->esp; PUSH(c->eax); PUSH(c->ecx); PUSH(c->edx); PUSH(c->ebx); PUSH(s); "
                "PUSH(c->ebp); PUSH(c->esi); PUSH(c->edi); }"]

    def i_popal(self, i, ops):
        return ["c->edi = POP(); c->esi = POP(); c->ebp = POP(); (void)POP(); c->ebx = POP(); c->edx = POP(); "
                "c->ecx = POP(); c->eax = POP();"]

    def i_pushfd(self, i, ops):
        return ["PUSH(rc_eflags(c, c->cf, c->zf, c->sf, c->of, c->pf));"]

    def i_popfd(self, i, ops):
        return ["{ uint32_t v = POP(); c->cf = v & 1; c->pf = (v >> 2) & 1; c->zf = (v >> 6) & 1; c->sf = (v >> 7) & 1; "
                "c->of = (v >> 11) & 1; c->df = (v >> 10) & 1; }"]

    def i_lahf(self, i, ops):
        return ["c->eax = (c->eax & 0xffff00ffu) | ((rc_eflags(c, c->cf, c->zf, c->sf, c->of, c->pf) & 0xff) << 8);"]

    def i_sahf(self, i, ops):
        return self.eager_set({C_: "(c->eax >> 8) & 1", P_: "(c->eax >> 10) & 1", Z_: "(c->eax >> 14) & 1",
                               S_: "(c->eax >> 15) & 1"})

    def i_xchg(self, i, ops):
        a, b = ops
        return [f"{{ {T[a.size]} t = {self.rd(a)}; {self.wr(a, self.rd(b))} {self.wr(b, 't')} }}"]

    def i_bswap(self, i, ops):
        return [self.wr(ops[0], f"__builtin_bswap32({self.rd(ops[0])})")]

    def i_leave(self, i, ops):
        return ["c->esp = c->ebp; c->ebp = POP();"]

    def i_cdq(self, i, ops):
        return ["c->edx = (uint32_t)((int32_t)c->eax >> 31);"]

    def i_cwde(self, i, ops):
        return ["c->eax = (uint32_t)(int16_t)c->eax;"]

    def i_cbw(self, i, ops):
        return ["c->eax = (c->eax & 0xffff0000u) | (uint16_t)(int8_t)c->eax;"]

    def i_cwd(self, i, ops):
        return ["c->edx = (c->edx & 0xffff0000u) | (uint16_t)((int16_t)c->eax >> 15);"]

    def i_nop(self, i, ops):
        return []

    def i_wait(self, i, ops):
        return []

    def i_cld(self, i, ops):
        return ["c->df = 0;"]

    def i_std(self, i, ops):
        return ["c->df = 1;"]

    def i_stc(self, i, ops):
        return self.eager_set({C_: "1"})

    def i_clc(self, i, ops):
        return self.eager_set({C_: "0"})

    def i_cmc(self, i, ops):
        return self.eager_set({C_: "!c->cf"})

    def i_cpuid(self, i, ops):
        return ["rc_cpuid(c);"]

    def i_rdtsc(self, i, ops):
        return ["rc_rdtsc(c);"]

    def i_xlatb(self, i, ops):
        return ["c->eax = (c->eax & 0xffffff00u) | RD8(c->ebx + (uint8_t)c->eax);"]

    # arithmetic
    def arith(self, i, ops, kind, write=True):
        d, s = ops[0], ops[1]
        sz = d.size
        t = T[sz]
        av, bv = self.rd(d), self.rd(s, sz)
        if kind in ("add", "sub", "cmp"):
            op = "+" if kind == "add" else "-"
            body = [f"{t} a = {av}, b = {bv}, r = a {op} b;"]
        else:
            op = {"and": "&", "or": "|", "xor": "^", "test": "&"}[kind]
            if kind == "xor" and d.type == X.X86_OP_REG and s.type == X.X86_OP_REG and d.reg == s.reg:
                body = [f"{t} a = 0, b = 0, r = 0;"]
            else:
                body = [f"{t} a = {av}, b = {bv}, r = a {op} b;"]
        body += self.set_flags(kind, "a", "b", "r", sz)
        if write and kind not in ("cmp", "test"):
            body.append(self.wr(d, "r"))
        return ["{ " + " ".join(body) + " }"]

    def i_add(self, i, ops):
        return self.arith(i, ops, "add")

    def i_sub(self, i, ops):
        return self.arith(i, ops, "sub")

    def i_cmp(self, i, ops):
        return self.arith(i, ops, "cmp")

    def i_and(self, i, ops):
        return self.arith(i, ops, "and")

    def i_or(self, i, ops):
        return self.arith(i, ops, "or")

    def i_xor(self, i, ops):
        return self.arith(i, ops, "xor")

    def i_test(self, i, ops):
        return self.arith(i, ops, "test")

    def i_inc(self, i, ops, kind="inc"):
        d = ops[0]
        t = T[d.size]
        op = "+" if kind == "inc" else "-"
        body = [f"{t} a = {self.rd(d)}, b = 1, r = a {op} b;"]
        need = self.eager.get(i.address, 0) & ~C_
        body += self.set_flags(kind, "a", "b", "r", d.size, need)
        body.append(self.wr(d, "r"))
        return ["{ " + " ".join(body) + " }"]

    def i_dec(self, i, ops):
        return self.i_inc(i, ops, "dec")

    def i_neg(self, i, ops):
        d = ops[0]
        t = T[d.size]
        body = [f"{t} a = 0, b = {self.rd(d)}, r = a - b;"]
        body += self.set_flags("neg", "a", "b", "r", d.size)
        body.append(self.wr(d, "r"))
        return ["{ " + " ".join(body) + " }"]

    def i_not(self, i, ops):
        return [self.wr(ops[0], f"~{self.rd(ops[0])}")]

    def i_adc(self, i, ops, sub=False):
        d, s = ops
        sz, t = d.size, T[d.size]
        sg = SIGN[sz]
        if sub:
            body = [f"{t} a = {self.rd(d)}, b = {self.rd(s, sz)}, r = a - b - c->cf;",
                    *self.eager_set({C_: "((uint64_t)a < (uint64_t)b + c->cf)", Z_: "(r == 0)",
                                     S_: f"((r & {sg}) != 0)", O_: f"((((a ^ b) & (a ^ r)) & {sg}) != 0)",
                                     P_: "rc_parity(r)"})]
        else:
            body = [f"{t} a = {self.rd(d)}, b = {self.rd(s, sz)}, r = a + b + c->cf;",
                    *self.eager_set({C_: f"((uint64_t)a + b + c->cf > {MASK[sz]})", Z_: "(r == 0)",
                                     S_: f"((r & {sg}) != 0)", O_: f"((((a ^ r) & (b ^ r)) & {sg}) != 0)",
                                     P_: "rc_parity(r)"})]
        body.append(self.wr(d, "r"))
        return ["{ " + " ".join(body) + " }"]

    def i_sbb(self, i, ops):
        return self.i_adc(i, ops, True)

    def shift(self, i, ops, kind):
        d = ops[0]
        sz, t, N = d.size, T[d.size], 8 * d.size
        sg = SIGN[sz]
        n = f"({self.rd(ops[1])} & 31)" if len(ops) > 1 else "1"
        conditional = len(ops) > 1 and ops[1].type != X.X86_OP_IMM
        if len(ops) > 1 and ops[1].type == X.X86_OP_IMM and ops[1].imm & 31 == 0:
            return []
        a = self.rd(d)
        if kind in ("shl", "sal"):
            r, cfe, ofe = f"(uint32_t)a << n", f"((uint32_t)a >> ({N} - n)) & 1", f"(((r & {sg}) != 0) ^ c->cf)"
        elif kind == "shr":
            r, cfe, ofe = "a >> n", "(a >> (n - 1)) & 1", f"((a & {sg}) != 0)"
        elif kind == "sar":
            r, cfe, ofe = f"(uint32_t)(({ST[sz]})a >> n)", f"(({ST[sz]})a >> (n - 1)) & 1", "0"
        elif kind in ("rol", "ror"):
            if kind == "rol":
                r = f"(n % {N}) ? (({t})(a << (n % {N})) | (a >> ({N} - n % {N}))) : a"
                cfe = "r & 1"
                ofe = f"(((r & {sg}) != 0) ^ (r & 1))"
            else:
                r = f"(n % {N}) ? ((a >> (n % {N})) | ({t})(a << ({N} - n % {N}))) : a"
                cfe = f"(r & {sg}) != 0"
                ofe = f"(((r ^ (r << 1)) & {sg}) != 0)"
            fl = self.eager_set({C_: cfe, O_: ofe})
            L = [f"{{ {t} a = {a}; uint32_t n = {n}; {t} r = {r};", *fl, self.wr(d, "r"), "}"]
            if conditional:
                L = [f"{{ {t} a = {a}; uint32_t n = {n}; if (n) {{ {t} r = {r};", *fl, self.wr(d, "r"), "} }"]
            return [" ".join(L)]
        elif kind in ("rcl", "rcr"):
            if sz != 4:
                raise Unsupported("rcl/rcr size")
            fn = "rc_rcl32" if kind == "rcl" else "rc_rcr32"
            return [f"{{ uint32_t n = {n}; if (n) {{ uint8_t cc = c->cf; {t} r = {fn}({a}, n, &cc); c->cf = cc; "
                    f"{self.wr(d, 'r')} }} }}"]
        fl = []
        need = self.eager.get(i.address, 0)
        ex = {C_: cfe, O_: ofe, Z_: "(r == 0)", S_: f"((r & {sg}) != 0)", P_: "rc_parity(r)"}
        for bit, nm in ((C_, "c->cf"), (Z_, "c->zf"), (S_, "c->sf"), (P_, "c->pf"), (O_, "c->of")):  # of after cf (shl uses cf)
            if need & bit or (bit == C_ and need & O_ and kind in ("shl", "sal")):
                fl.append(f"{nm} = {ex[bit]};")
        if conditional:
            return [f"{{ {t} a = {a}; uint32_t n = {n}; if (n) {{ {t} r = ({t})({r}); {' '.join(fl)} "
                    f"{self.wr(d, 'r')} }} }}"]
        return [f"{{ {t} a = {a}; uint32_t n = {n}; {t} r = ({t})({r}); {' '.join(fl)} {self.wr(d, 'r')} }}"]

    def i_shl(self, i, ops):
        return self.shift(i, ops, "shl")

    def i_sal(self, i, ops):
        return self.shift(i, ops, "shl")

    def i_shr(self, i, ops):
        return self.shift(i, ops, "shr")

    def i_sar(self, i, ops):
        return self.shift(i, ops, "sar")

    def i_rol(self, i, ops):
        return self.shift(i, ops, "rol")

    def i_ror(self, i, ops):
        return self.shift(i, ops, "ror")

    def i_rcl(self, i, ops):
        return self.shift(i, ops, "rcl")

    def i_rcr(self, i, ops):
        return self.shift(i, ops, "rcr")

    def i_shld(self, i, ops, right=False):
        d, s, cnt = ops
        if d.size != 4:
            raise Unsupported("shld size")
        n = f"({self.rd(cnt)} & 31)"
        if right:
            r, cfe = "(a >> n) | (b << (32 - n))", "(a >> (n - 1)) & 1"
        else:
            r, cfe = "(a << n) | (b >> (32 - n))", "(a >> (32 - n)) & 1"
        fl = self.eager_set({C_: cfe, Z_: "(r == 0)", S_: "(r >> 31)", O_: "0", P_: "rc_parity(r)"})
        return [f"{{ uint32_t a = {self.rd(d)}, b = {self.rd(s)}, n = {n}; if (n) {{ uint32_t r = {r}; "
                f"{' '.join(fl)} {self.wr(d, 'r')} }} }}"]

    def i_shrd(self, i, ops):
        return self.i_shld(i, ops, True)

    def i_imul(self, i, ops):
        if len(ops) == 1:
            s = ops[0]
            if s.size == 4:
                return [f"{{ int64_t r = (int64_t)(int32_t)c->eax * (int32_t){self.rd(s)}; c->eax = (uint32_t)r; "
                        "c->edx = (uint32_t)(r >> 32); " +
                        " ".join(self.eager_set({C_: "(r != (int32_t)r)", O_: "(r != (int32_t)r)"})) + " }"]
            if s.size == 1:
                return [f"{{ int16_t r = (int16_t)(int8_t)c->eax * (int8_t){self.rd(s)}; "
                        "c->eax = (c->eax & 0xffff0000u) | (uint16_t)r; " +
                        " ".join(self.eager_set({C_: "(r != (int8_t)r)", O_: "(r != (int8_t)r)"})) + " }"]
            raise Unsupported("imul16")
        d = ops[0]
        a, b = (self.rd(ops[1]), self.rd(ops[2], d.size)) if len(ops) == 3 else (self.rd(d), self.rd(ops[1], d.size))
        st = ST[d.size]
        return [f"{{ int64_t r = (int64_t)({st}){a} * ({st}){b}; " +
                " ".join(self.eager_set({C_: f"(r != ({st})r)", O_: f"(r != ({st})r)", Z_: "0", S_: "0", P_: "0"})) +
                f" {self.wr(d, f'({T[d.size]})r')} }}"]

    def i_mul(self, i, ops):
        s = ops[0]
        if s.size == 4:
            return [f"{{ uint64_t r = (uint64_t)c->eax * {self.rd(s)}; c->eax = (uint32_t)r; c->edx = (uint32_t)(r >> 32); " +
                    " ".join(self.eager_set({C_: "(c->edx != 0)", O_: "(c->edx != 0)"})) + " }"]
        if s.size == 1:
            return [f"{{ uint16_t r = (uint16_t)((uint8_t)c->eax * {self.rd(s)}); c->eax = (c->eax & 0xffff0000u) | r; " +
                    " ".join(self.eager_set({C_: "(r > 0xff)", O_: "(r > 0xff)"})) + " }"]
        raise Unsupported("mul16")

    def i_div(self, i, ops, signed=False):
        s = ops[0]
        if s.size == 4:
            if signed:
                return [f"{{ int64_t n = (int64_t)(((uint64_t)c->edx << 32) | c->eax); int32_t d = (int32_t){self.rd(s)}; "
                        f"if (d == 0) rc_trap(c, 0x{i.address:x}u, \"idiv by zero\"); "
                        "c->eax = (uint32_t)(int32_t)(n / d); c->edx = (uint32_t)(int32_t)(n % d); }"]
            return [f"{{ uint64_t n = ((uint64_t)c->edx << 32) | c->eax; uint32_t d = {self.rd(s)}; "
                    f"if (d == 0) rc_trap(c, 0x{i.address:x}u, \"div by zero\"); "
                    "c->eax = (uint32_t)(n / d); c->edx = (uint32_t)(n % d); }"]
        if s.size == 1:
            if signed:
                return [f"{{ int16_t n = (int16_t)c->eax; int8_t d = (int8_t){self.rd(s)}; "
                        f"if (d == 0) rc_trap(c, 0x{i.address:x}u, \"idiv by zero\"); "
                        "c->eax = (c->eax & 0xffff0000u) | (uint8_t)(n / d) | ((uint32_t)(uint8_t)(n % d) << 8); }"]
            return [f"{{ uint16_t n = (uint16_t)c->eax; uint8_t d = {self.rd(s)}; "
                    f"if (d == 0) rc_trap(c, 0x{i.address:x}u, \"div by zero\"); "
                    "c->eax = (c->eax & 0xffff0000u) | (uint8_t)(n / d) | ((uint32_t)(uint8_t)(n % d) << 8); }"]
        if s.size == 2:
            st, t = ("int32_t", "int16_t") if signed else ("uint32_t", "uint16_t")
            return [f"{{ {st} n = ({st})(((uint32_t)(uint16_t)c->edx << 16) | (uint16_t)c->eax); {t} d = ({t}){self.rd(s)}; "
                    f"if (d == 0) rc_trap(c, 0x{i.address:x}u, \"div by zero\"); "
                    "c->eax = (c->eax & 0xffff0000u) | (uint16_t)(n / d); c->edx = (c->edx & 0xffff0000u) | (uint16_t)(n % d); }"]
        raise Unsupported("div size")

    def i_idiv(self, i, ops):
        return self.i_div(i, ops, True)

    def i_bt(self, i, ops, op=None):
        d, s = ops
        if d.size != 4:
            raise Unsupported("bt size")
        if d.type == X.X86_OP_MEM and s.type == X.X86_OP_REG:   # bit string: offset may leave the dword
            A = self.addr(d)
            L = [f"{{ int32_t o = (int32_t){self.rd(s)}; uint32_t ad = {A} + (uint32_t)((o >> 5) * 4), "
                 f"v = RD32(ad), n = (uint32_t)o & 31;", *self.eager_set({C_: "(v >> n) & 1"})]
            if op:
                L.append(f"WR32(ad, {({'bts': 'v | (1u << n)', 'btr': 'v & ~(1u << n)', 'btc': 'v ^ (1u << n)'})[op]});")
            return [" ".join(L + ["}"])]
        L = [f"{{ uint32_t v = {self.rd(d)}, n = {self.rd(s)} & 31;", *self.eager_set({C_: "(v >> n) & 1"})]
        if op:
            L.append(self.wr(d, {"bts": "v | (1u << n)", "btr": "v & ~(1u << n)", "btc": "v ^ (1u << n)"}[op]))
        return [" ".join(L + ["}"])]

    def i_bts(self, i, ops):
        return self.i_bt(i, ops, "bts")

    def i_btr(self, i, ops):
        return self.i_bt(i, ops, "btr")

    def i_btc(self, i, ops):
        return self.i_bt(i, ops, "btc")

    # string ops (by opcode byte: capstone's movsd/cmpsd collide with SSE)
    def string_op(self, pre, ob):
        k = STRING_OPS[ob[0]]
        sz = 1 if ob[0] in (0xA4, 0xAA, 0xAC, 0xAE, 0xA6) else (2 if 0x66 in pre else 4)
        rep = "repne" if 0xF2 in pre else ("rep" if 0xF3 in pre else "")
        if k in ("scas", "cmps"):
            # flags from the last comparison: eager zf/cf/... via a helper that returns a,b of last compare
            need = self.eager.get(self.i.address, 0)
            fn = f"rc_{k}{sz}"
            L = [f"{{ uint32_t a, b; int did = {fn}(c, {'2' if rep == 'repne' else '1' if rep else '0'}, &a, &b);"]
            if need:
                e = self.flag_exprs("cmp", f"({T[sz]})a", f"({T[sz]})b", f"({T[sz]})(a - b)", sz)
                for bit, nm in ((C_, "c->cf"), (Z_, "c->zf"), (S_, "c->sf"), (O_, "c->of"), (P_, "c->pf")):
                    if need & bit:
                        L.append(f"if (did) {nm} = {e[bit]};")
            return [" ".join(L) + " }"]
        return [f"rc_{k}{sz}(c, {1 if rep else 0});"]

    # ---------- x87 (decoded from opcode bytes: capstone's fsub/fsubr register forms are unreliable)
    def x87(self, i, ob):
        op, modrm = ob[0], ob[1]
        reg, rm = (modrm >> 3) & 7, modrm & 7
        if modrm < 0xC0:
            mo = next(o for o in i.operands if o.type == X.X86_OP_MEM)
            A = self.addr(mo)
            arith = ["fadd", "fmul", "fcom", "fcomp", "fsub", "fsubr", "fdiv", "fdivr"]
            if op in (0xD8, 0xDC, 0xDA, 0xDE):
                v = {0xD8: f"RDF32({A})", 0xDC: f"RDF64({A})", 0xDA: f"(double)(int32_t)RD32({A})",
                     0xDE: f"(double)(int16_t)RD16({A})"}[op]
                return [self.farith(arith[reg], "ST(0)", v, store="ST(0)")]
            tbl = {
                (0xD9, 0): f"FPUSH(RDF32({A}));", (0xD9, 2): f"WRF32({A}, ST(0));",
                (0xD9, 3): f"WRF32({A}, ST(0)); FPOP();", (0xD9, 5): f"c->fcw = RD16({A});",
                (0xD9, 7): f"WR16({A}, c->fcw);",
                (0xDB, 0): f"FPUSH((double)(int32_t)RD32({A}));",
                (0xDB, 2): f"WR32({A}, (uint32_t)rc_fist32(c, ST(0)));",
                (0xDB, 3): f"WR32({A}, (uint32_t)rc_fist32(c, ST(0))); FPOP();",
                (0xDB, 5): f"FPUSH(rc_ld80(m + {A}));", (0xDB, 7): f"rc_st80(m + {A}, ST(0)); FPOP();",
                (0xDD, 0): f"FPUSH(RDF64({A}));", (0xDD, 2): f"WRF64({A}, ST(0));",
                (0xDD, 3): f"WRF64({A}, ST(0)); FPOP();", (0xDD, 7): f"WR16({A}, rc_fsw(c));",
                (0xDD, 4): f"rc_frstor(c, {A});", (0xDD, 6): f"rc_fsave(c, {A});",
                (0xD9, 4): f"rc_fldenv(c, {A});", (0xD9, 6): f"rc_fstenv(c, {A});",
                (0xDF, 0): f"FPUSH((double)(int16_t)RD16({A}));",
                (0xDF, 2): f"WR16({A}, (uint16_t)rc_fist16(c, ST(0)));",
                (0xDF, 3): f"WR16({A}, (uint16_t)rc_fist16(c, ST(0))); FPOP();",
                (0xDF, 5): f"FPUSH((double)(int64_t)RD64({A}));",
                (0xDF, 7): f"WR64({A}, (uint64_t)rc_fist64(c, ST(0))); FPOP();",
            }
            if (op, reg) in tbl:
                return [tbl[(op, reg)]]
            raise Unsupported("x87 mem")
        if op == 0xD8:
            arith = ["fadd", "fmul", "fcom", "fcomp", "fsub", "fsubr", "fdiv", "fdivr"]
            return [self.farith(arith[reg], "ST(0)", f"ST({rm})", store="ST(0)")]
        if op in (0xDC, 0xDE):
            # DC: st(i) = st(i) op st(0); note DC E0 = fsubr st(i) (st(i) = st0 - st(i)) per Intel
            names = {0: "fadd", 1: "fmul", 4: "fsubr", 5: "fsub", 6: "fdivr", 7: "fdiv"}
            if op == 0xDE and modrm == 0xD9:
                return ["rc_fcom(c, ST(0), ST(1)); FPOP(); FPOP();"]
            if reg in (2, 3) and op == 0xDC:
                return [self.farith("fcom" if reg == 2 else "fcomp", "ST(0)", f"ST({rm})")]
            if reg not in names:
                raise Unsupported("x87 dc/de")
            n = names[reg]
            # for DC/DE the destination is st(i) and source st(0): x = st(i), y = st(0)
            ex = {"fadd": f"ST({rm}) + ST(0)", "fmul": f"ST({rm}) * ST(0)", "fsub": f"ST({rm}) - ST(0)",
                  "fsubr": f"ST(0) - ST({rm})", "fdiv": f"ST({rm}) / ST(0)", "fdivr": f"ST(0) / ST({rm})"}[n]
            return [f"ST({rm}) = {ex};" + (" FPOP();" if op == 0xDE else "")]
        if op == 0xD9:
            if reg == 0:
                return [f"{{ double v = ST({rm}); FPUSH(v); }}"]
            if reg == 1:
                return [f"{{ double v = ST(0); ST(0) = ST({rm}); ST({rm}) = v; }}"]
            one = {0xD0: "", 0xE0: "ST(0) = -ST(0);", 0xE1: "ST(0) = fabs(ST(0));", 0xE4: "rc_fcom(c, ST(0), 0.0);",
                   0xE5: "rc_fxam(c);", 0xE8: "FPUSH(1.0);", 0xE9: "FPUSH(M_LN10 / M_LN2);",
                   0xEA: "FPUSH(M_LOG2E);", 0xEB: "FPUSH(M_PI);", 0xEC: "FPUSH(M_LN2 / M_LN10);",
                   0xED: "FPUSH(M_LN2);", 0xEE: "FPUSH(0.0);",
                   0xF0: "ST(0) = exp2(ST(0)) - 1.0;", 0xF1: "ST(1) = ST(1) * log2(ST(0)); FPOP();",
                   0xF2: "ST(0) = tan(ST(0)); FPUSH(1.0); c->fsw &= ~0x400;",
                   0xF3: "ST(1) = atan2(ST(1), ST(0)); FPOP();", 0xF8: "ST(0) = fmod(ST(0), ST(1)); c->fsw &= ~0x400;",
                   0xF5: "ST(0) = remainder(ST(0), ST(1)); c->fsw &= ~0x400;",
                   0xF9: "ST(1) = ST(1) * log2(ST(0) + 1.0); FPOP();",
                   0xFA: "ST(0) = sqrt(ST(0));", 0xFB: "{ double v = ST(0); ST(0) = sin(v); FPUSH(cos(v)); c->fsw &= ~0x400; }",
                   0xFC: "ST(0) = rc_fround(c, ST(0));", 0xFD: "ST(0) = ldexp(ST(0), (int)trunc(ST(1)));",
                   0xFE: "ST(0) = sin(ST(0)); c->fsw &= ~0x400;", 0xFF: "ST(0) = cos(ST(0)); c->fsw &= ~0x400;",
                   0xF6: "c->ftop = (c->ftop - 1) & 7;", 0xF7: "c->ftop = (c->ftop + 1) & 7;"}
            if modrm in one:
                return [one[modrm]]
            raise Unsupported("x87 d9")
        if op == 0xDA and modrm == 0xE9:
            return ["rc_fcom(c, ST(0), ST(1)); FPOP(); FPOP();"]
        if op == 0xDB:
            if modrm in (0xE2, 0xE0, 0xE1, 0xE4):
                return ["c->fsw &= 0x7f00u;" if modrm == 0xE2 else ""]
            if modrm == 0xE3:
                return ["rc_finit(c);"]
            raise Unsupported("x87 db")
        if op == 0xDD:
            if reg == 0:
                return []  # ffree: tags not modelled
            if reg == 2:
                return [f"ST({rm}) = ST(0);"]
            if reg == 3:
                return [f"ST({rm}) = ST(0); FPOP();"]
            if reg in (4, 5):
                return [f"rc_fcom(c, ST(0), ST({rm}));" + (" FPOP();" if reg == 5 else "")]
            raise Unsupported("x87 dd")
        if op == 0xDF and modrm == 0xE0:
            return ["c->eax = (c->eax & 0xffff0000u) | rc_fsw(c);"]
        raise Unsupported("x87")

    def farith(self, n, x, y, store=None):
        if n in ("fcom", "fcomp"):
            return f"rc_fcom(c, {x}, {y});" + (" FPOP();" if n == "fcomp" else "")
        ex = {"fadd": f"{x} + {y}", "fmul": f"{x} * {y}", "fsub": f"{x} - {y}", "fsubr": f"{y} - {x}",
              "fdiv": f"{x} / {y}", "fdivr": f"{y} / {x}"}[n]
        return f"{store} = {ex};"
