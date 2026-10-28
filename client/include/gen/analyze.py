"""Layout facts from the decompiled cache: which functions construct/destroy which class, object sizes
from `operator_new(N)` before a constructor, and `this`-relative field accesses. Library module for gen.py."""
import collections
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I drops the script dir
from rtti import DATA  # noqa: E402

DEC = os.path.join(DATA, "decompiled")
CALL = r"(?:thunk_)?FUN_([0-9a-f]{8})"
VTSTORE = re.compile(r"^\s*(.+?) = &PTR_\w*?_([0-9a-f]{8});")
NEW = re.compile(r"(\w+) = (?:\([^)]*\))?operator_new\((0x[0-9a-f]+|\d+)\);")
SIG = re.compile(r"^(.+?)\s*(__thiscall|__fastcall|__stdcall|__cdecl)?\s*(\w+)\((.*)\)\s*$")
VEC = re.compile(r"FUN_(00b09aa7|00b09b29)\([^,]+,(0x[0-9a-f]+|\d+),([^,]+),&?(?:thunk_FUN_|FUN_|LAB_)([0-9a-f]{8})")
VECARR = re.compile(r"FUN_(00b09aa7|00b09b29)\(([^,]+),(0x[0-9a-f]+|\d+),([^,]+),&?(?:thunk_FUN_|FUN_|LAB_)([0-9a-f]{8})")
THIS = ("param_1", "this", "in_ECX")
# width of a Ghidra type name; anything else (struct pointers etc.) is a 4-byte pointer
WIDTH = {"char": 1, "byte": 1, "undefined1": 1, "bool": 1, "uchar": 1, "short": 2, "ushort": 2, "undefined2": 2,
         "wchar_t": 2, "int": 4, "uint": 4, "undefined4": 4, "long": 4, "ulong": 4, "float": 4, "dword": 4,
         "undefined": 1, "double": 8, "undefined8": 8, "longlong": 8, "ulonglong": 8, "longdouble": 10}


def width(t):
    t = t.strip()
    return 4 if t.endswith("*") else WIDTH.get(t, 0)


def parse_sig(text):
    for line in text.splitlines():
        if line.strip() and not line.startswith(("//", "/*", " ")):
            m = SIG.match(line)
            if not m:
                return None
            params = [p.strip() for p in m.group(4).split(",")] if m.group(4).strip() not in ("", "void") else []
            ps = []
            for p in params:
                mm = re.match(r"(.+?)\s*(\w+)$", p)
                ps.append((mm.group(1).strip(), mm.group(2)) if mm else (p, ""))
            return {"ret": m.group(1).strip(), "cc": m.group(2) or "", "params": ps}
    return None


def field_accesses(text, this_type, names=None):
    """[(byte offset, width, type)] for this-relative (or `names`-relative) loads/stores."""
    out = []
    stride = 1
    if this_type.endswith("*"):
        base = this_type[:-1].strip()
        stride = 1 if base == "void" else (4 if base.endswith("*") else WIDTH.get(base, 4))
    for name in names or THIS:
        n = re.escape(name)
        # *(T *)(this + N)   *(T *)((int)this + N)
        for m in re.finditer(r"\*\(([\w ]+?\**) \*\)\(\(?(?:\(\w+\))?" + n + r"\)? \+ (0x[0-9a-f]+|\d+)\)", text):
            t, off = m.group(1), int(m.group(2), 0)
            cast = "(int)" in m.group(0) or "(uint)" in m.group(0)
            out.append((off * (1 if cast else stride), width(t), t))
        # this[N]
        if this_type.endswith("*"):
            for m in re.finditer(r"\b" + n + r"\[(0x[0-9a-f]+|\d+)\]", text):
                base = this_type[:-1].strip()
                out.append((int(m.group(1), 0) * stride, stride if base != "void" else 1, base))
    return [(o, w, t) for o, w, t in out if w and 0 < o < 0x10000]


def var_type(text, var):
    """Declared type of a Ghidra local (`  undefined4 *puVar2;` -> 'undefined4 *')."""
    m = re.search(r"^\s+([\w ]+?)\s*(\**)" + re.escape(var) + r";", text, re.M)
    return (m.group(1) + (" " + m.group(2) if m.group(2) else "")).strip() if m else "int"


def init_segments(lines, obj, obj_type, vt2, ctor_of, derived):
    """MSVC6 constructors call the base ctor, initialise the class's own members, then store its vptr (inlined
    intermediate classes may have their stores elided). So the accesses between an out-of-line base ctor call
    and the first vptr store are members of classes derived from that base, and their lowest offset is an upper
    bound on the base's size. Yields (base td, lowest offset). ctor_of(call) -> class or None."""
    called, pending = None, []
    names = (obj,) if isinstance(obj, str) else obj
    store0 = re.compile(r"\*(?:\([\w *]+\))?(" + "|".join(map(re.escape, names)) + r")")
    for line in lines:
        m = VTSTORE.match(line)
        if m and store0.fullmatch(m.group(1).strip()):
            vt = int(m.group(2), 16)
            if vt in vt2 and vt2[vt][1] == 0 and called is not None and pending:
                new = vt2[vt][0]
                if new != called and derived(new, called):
                    yield called, min(pending)
            return  # ponytail: later windows mix in inlined bases' ctor-body writes; only the first counts
        for c in re.finditer(CALL + r"\(", line):
            if ctor_of(c.group(1)) is not None:
                called, pending = ctor_of(c.group(1)), []
        if called is not None:
            pending += [o for o, w, t in field_accesses(line, obj_type, names)]


def this_offset(e, this_type):
    """Byte offset of a `this`-relative lvalue (`this[3]`, `*(T *)(this + 0xc)`) or address (`this + 3`), else None."""
    stride = 1
    if this_type.endswith("*"):
        base = this_type[:-1].strip()
        stride = 1 if base == "void" else (4 if base.endswith("*") else WIDTH.get(base, 4))
    e = re.sub(r"^\*?\([\w *]+\*\)", "", e.strip()).strip()
    m = re.fullmatch(r"(?:param_1|this|in_ECX)\[(0x[0-9a-f]+|\d+)\]", e)
    if m:
        return int(m.group(1), 0) * stride if this_type.endswith("*") else None
    m = re.fullmatch(r"\(?(\((?:int|uint)\))?(?:param_1|this|in_ECX) \+ (0x[0-9a-f]+|\d+)\)?", e)
    if m:
        return int(m.group(2), 0) * (1 if m.group(1) else stride)
    return None


def ret_bytes(pe, a, size):
    """Stack bytes popped by `ret n` at the function's end, or None."""
    o = pe.va2off(a)
    if o is None or size < 1:
        return None
    end = pe.b[o:o + size]
    if len(end) >= 3 and end[-3] == 0xC2 and end[-1] == 0:
        return end[-2]
    if end[-1] == 0xC3:
        return 0
    return None


def load_funcs():
    funcs = {}
    for line in open(os.path.join(DATA, "functions2.jsonl")):
        f = json.loads(line)
        if not f["a"].startswith("EXT"):
            funcs[int(f["a"], 16)] = f
    labels = {}
    for line in open(os.path.join(DATA, "labels.tsv")):
        a, size, label, srcdir, name = line.rstrip("\n").split("\t")
        labels[int(a, 16)] = (label, srcdir)
    return funcs, labels


def analyze(pe, tds):
    vt2 = {}  # vtable VA -> (td, col offset)
    for td, c in tds.items():
        for off, (vt, slots) in c["vtables"].items():
            vt2[vt] = (td, off)
    anc = {td: {b[0] for b in c["bases"]} | {td} for td, c in tds.items()}
    texts = {}
    for fn in os.listdir(DEC):
        if fn.endswith(".c"):
            texts[int(fn[:-2], 16)] = open(os.path.join(DEC, fn), errors="replace").read()

    def derived(a, b):  # a is b or derives from it
        return b in anc.get(a, ())

    def most_derived(cands):
        best = None
        for td in cands:
            if best is None or (td != best and derived(td, best)):
                best = td
        return best

    # 1. the class that introduces each virtual function: the one all other vtables holding it derive from
    holders = collections.defaultdict(set)
    for td, c in tds.items():
        for off, (vt, slots) in c["vtables"].items():
            for sl in slots:
                holders[pe.follow(sl)].add((td, off))
    introducer, this_off = {}, {}
    for f, hs in holders.items():
        cls = {h for h, _ in hs}
        root = [h for h in cls if all(derived(o, h) for o in cls)]
        offs = {o for h, o in hs if root and h == root[0]}
        if len(root) == 1 and len(offs) == 1:
            introducer[f] = root[0]
            this_off[f] = offs.pop()  # MSVC overriders of a secondary base's virtual get that subobject as `this`

    # 2. scalar deleting destructors -> the real destructor they call (its own vptr store is often dead-stored away)
    dtor_of, deleting = {}, set()
    for f, hs in holders.items():
        t = texts.get(f, "")
        if re.search(r"if \(\(param_2 & 1\) != 0\)", t):
            deleting.add(f)
            m = re.search(CALL + r"\(", t)
            if f in introducer and this_off[f] == 0:
                dtor_of[f] = introducer[f]
                if m:
                    dtor_of[pe.follow(int(m.group(1), 16))] = introducer[f]
    purecall = {f for f in holders if "__amsg_exit(0x19)" in texts.get(f, "")}

    # 3. constructors: functions storing a primary vptr into `this` (most derived wins), destructors excluded
    ctor = {}
    for a, t in texts.items():
        # MSVC constructors return `this` (Ghidra drops it when no caller uses EAX) and store the vptr after
        # initialising members; destructors store it first, before touching members (and often lose the store)
        if a in dtor_of:
            continue
        sig = parse_sig(t)
        cands, last = [], None
        lines = t.splitlines()
        for i, m in enumerate(map(VTSTORE.match, lines)):
            if m and re.fullmatch(r"\*(?:\([\w *]+\))?(param_1|this|in_ECX)", m.group(1).strip()):
                vt = int(m.group(2), 16)
                if vt in vt2 and vt2[vt][1] == 0:
                    cands.append(vt2[vt][0])
                    last = i
        if not cands:
            continue
        returns_this = re.search(r"return (?:\([\w *]+\))?(param_1|this|in_ECX);", t)
        tt = sig["params"][0][0] if sig and sig["params"] else None
        members_first = tt and field_accesses("\n".join(lines[:last]), tt) and not field_accesses("\n".join(lines[last + 1:]), tt)
        if returns_this:
            ctor[a] = most_derived(cands)

    # 4. sizes: operator_new(N), then constructor calls / inlined vptr stores on the result (most derived wins)
    votes = collections.defaultdict(collections.Counter)
    where = collections.defaultdict(list)
    for a, t in texts.items():
        lines = t.splitlines()
        for i, l in enumerate(lines):
            m = NEW.search(l)
            if not m:
                continue
            var, n = m.group(1), int(m.group(2), 0)
            cands, nested = [], False
            for l2 in lines[i + 1:i + 120]:
                if NEW.search(l2):
                    nested = True  # another allocation: from here on only stores/calls naming `var` count
                ms = VTSTORE.match(l2)
                if ms and re.fullmatch(r"\*(?:\([\w *]+\))?" + var, ms.group(1).strip()):
                    vt = int(ms.group(2), 16)
                    if vt in vt2 and vt2[vt][1] == 0:
                        cands.append(vt2[vt][0])
                    continue
                for mc in re.finditer(r"(=\s*(?:\([^)]*\))?\s*" + CALL + r"\(|" + CALL + r"\((?:\([^)]*\))?" + var + r"\b)", l2):
                    f = pe.follow(int(mc.group(2) or mc.group(3), 16))
                    if f in ctor and not (nested and mc.group(2)):
                        cands.append(ctor[f])
            if cands:
                td = most_derived(cands)
                votes[td][n] += 1
                where[td].append(a)
        # `eh vector constructor iterator`(p, size, n, ctor, dtor) / `vector destructor iterator`(p, size, n, dtor)
        for m in VEC.finditer(t):
            n, f = int(m.group(2), 0), pe.follow(int(m.group(4), 16))
            td = ctor.get(f) if m.group(1) == "00b09aa7" else dtor_of.get(f)
            if td is not None:
                votes[td][n] += 1
                where[td].append(a)
    sizes = {td: v.most_common(1)[0][0] for td, v in votes.items()}
    conflicts = {td: dict(v) for td, v in votes.items() if len(v) > 1}

    # 5. fields seen through `this` in each class's own functions
    cls_of = dict(ctor)
    cls_of.update(introducer)
    cls_of.update(dtor_of)
    fields = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
    for a, td in cls_of.items():
        t = texts.get(a)
        sig = parse_sig(t) if t else None
        if not sig or sig["cc"] not in ("__thiscall", "__fastcall") or not sig["params"]:
            continue
        base = this_off.get(a, 0) if a in introducer and a not in dtor_of else 0
        for off, w, ty in field_accesses(t, sig["params"][0][0]):
            fields[td][base + off][(w, ty)] += 1

    # 6. embedded member objects: a ctor/dtor of X storing class M's primary vptr at X+o (o > 0, not a base
    #    subobject), and `eh vector constructor iterator`(X+o, size, n, ctor, dtor) member arrays
    bases_at = {td: {b[1] for b in c["bases"]} for td, c in tds.items()}
    members = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
    for a, td in list(ctor.items()) + [(f, td) for f, td in dtor_of.items() if f not in deleting]:
        t = texts[a]
        sig = parse_sig(t)
        if not sig or not sig["params"]:
            continue
        tt = sig["params"][0][0]
        at = collections.defaultdict(list)
        for m in map(VTSTORE.match, t.splitlines()):
            if m:
                o, vt = this_offset(m.group(1), tt), int(m.group(2), 16)
                if o and vt in vt2 and vt2[vt][1] == 0 and o not in bases_at[td]:
                    at[o].append(vt2[vt][0])
        for o, cands in at.items():
            members[td][o][(most_derived(cands), None, 1)] += 1
        for m in VECARR.finditer(t):
            o = this_offset(m.group(2), tt)
            if o is None or not m.group(4).isdigit() and not m.group(4).startswith("0x"):
                continue
            f = pe.follow(int(m.group(5), 16))
            el = ctor.get(f) if m.group(1) == "00b09aa7" else dtor_of.get(f)
            members[td][o][(el, int(m.group(3), 0), int(m.group(4), 0))] += 1
    # 7. upper bounds on base sizes from member-initialisation windows (constructors and inlined new sites)
    def ctor_of(call):
        return ctor.get(pe.follow(int(call, 16)))
    ub = {}

    def note(segs):
        for b, o in segs:
            ub[b] = min(ub.get(b, 1 << 30), o)
    for a in ctor:
        sig = parse_sig(texts[a])
        if sig and sig["params"]:
            note(init_segments(texts[a].splitlines(), THIS, sig["params"][0][0], vt2, ctor_of, derived))
    for a, t in texts.items():
        lines = t.splitlines()
        for i, l in enumerate(lines):
            m = NEW.search(l)
            if m:
                note(init_segments(lines[i + 1:i + 120], m.group(1), var_type(t, m.group(1)), vt2, ctor_of, derived))
    return {"members": members, "ub": ub, "ctor": ctor, "dtor_of": dtor_of, "deleting": deleting, "purecall": purecall, "introducer": introducer, "sizes": sizes, "size_votes": votes,
            "size_where": where, "conflicts": conflicts, "fields": fields, "texts": texts, "anc": anc}


if __name__ == "__main__":
    import rtti
    pe, tds = rtti.load()
    r = analyze(pe, tds)
    print("decompiled", len(r["texts"]), "ctors", len(r["ctor"]), "classes with ctor", len(set(r["ctor"].values())),
          "dtors", len(r["dtor_of"]), "introduced virtuals", len(r["introducer"]))
    print("sizes", len(r["sizes"]), "conflicts", len(r["conflicts"]))
    for td, v in list(r["conflicts"].items())[:10]:
        print("  ", tds[td]["name"], v)
    for nm in ("CTask", "CWindowTaskModel", "CD3DDevice"):
        td = next((k for k, c in tds.items() if c["name"] == nm), None)
        print(nm, r["sizes"].get(td), sorted(r["fields"][td].items())[:12] if td else None)
    assert parse_sig("undefined4 __thiscall FUN_00423560(undefined4 param_1,byte param_2)")["params"][1] == ("byte", "param_2")
    assert field_accesses("  *(int *)(param_1 + 0x10) = 0;", "undefined4") == [(16, 4, "int")]
    assert field_accesses("  param_1[3] = 0;", "int *") == [(12, 4, "int")]
    assert this_offset("param_1[0x1d]", "undefined4 *") == 0x74
    assert this_offset("*(undefined ***)(param_1 + 0x74)", "int") == 0x74
    assert this_offset("(int)param_1 + 0x20", "undefined4 *") == 0x20
    assert this_offset("param_1 + 0x20", "int *") == 0x80
    td = next(k for k, c in tds.items() if c["name"] == "CSceneTask")
    print("ub", len(r["ub"]), "CEasyTask", hex(r["ub"].get(next(k for k, c in tds.items() if c["name"] == "CEasyTask"), 0)))
    print("CSceneTask members", {hex(o): {(tds[m]["name"] if m else None, s, n): k for (m, s, n), k in c.items()} for o, c in r["members"][td].items()})
