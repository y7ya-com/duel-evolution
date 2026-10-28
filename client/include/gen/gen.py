"""Generate include/yo2/**.h from yo2.exe RTTI + the decompiled cache.

    python3 -I include/gen/gen.py      # rewrites include/yo2/ and include/yo2/classes.tsv, prints coverage

Regenerating overwrites include/yo2/ wholesale: hand edits belong in the generator (or in NAMES below)."""
import collections
import os
import re
import shutil
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I drops the script dir
import analyze  # noqa: E402
import rtti  # noqa: E402

INC = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
OUT = os.path.join(INC, "yo2")
YANE_TEMPLATES = {"smart_ptr", "smart_array", "auto_array", "mediator", "Factory", "PrototypeFactory", "smart_vector_ptr"}
LIB_NAMES = {"exception", "bad_cast", "bad_typeid", "__non_rtti_object"}
# non-polymorphic library bases: VC6 std::vector = allocator byte + _First/_Last/_End; yaneSDK mediator<T> = one T*
KNOWN_SIZES = {"std::vector": 16, "smart_vector_ptr": 16, "mediator": 4}


def san(name):
    return re.sub(r"_+", "_", re.sub(r"[^A-Za-z0-9]", "_", name)).strip("_")


def main():
    pe, tds = rtti.load()
    A = analyze.analyze(pe, tds)
    funcs, labels = analyze.load_funcs()
    yane = set(open(os.path.join(rtti.DATA, "yane_classes.txt")).read().split())
    anc = A["anc"]
    tree = {td: rtti.tree(c, tds) for td, c in tds.items()}
    children = collections.defaultdict(list)
    for td, bs in tree.items():
        for b, m, v in bs:
            children[b].append((td, m))

    own = collections.defaultdict(set)
    for k in ("introducer", "ctor", "dtor_of"):
        for f, td in A[k].items():
            own[td].add(f)

    def category(td):
        n = tds[td]["name"]
        if n.startswith(("std::", "mtknLib::")) or n in LIB_NAMES:
            return "lib"
        head = n.split("<")[0]
        if head in yane or head in YANE_TEMPLATES or head.split("::")[0] in yane:
            return "yane"
        lab = collections.Counter(labels.get(f, ("?", ""))[0] for f in own[td]).most_common(1)
        lab = lab[0][0] if lab else "?"
        return {"yaneSDK": "yane", "STL": "lib", "CRT": "lib", "3rd-party": "lib"}.get(lab, "game")

    cat = {td: category(td) for td in tds}

    # --- which classes get emitted: every game class, plus stand-ins for non-game bases they need ---
    emit = {td for td in tds if cat[td] == "game"}
    stack = list(emit)
    while stack:
        td = stack.pop()
        for b, m, v in tree[td]:
            if b not in emit:
                emit.add(b)
                stack.append(b)

    # --- sizes ---
    size, conf = {}, {}
    for td, n in A["sizes"].items():
        size[td], conf[td] = n, "new"
    head_of = lambda td: tds[td]["name"].split("<")[0]
    for td in tds:
        if head_of(td) in KNOWN_SIZES and td not in size:
            size[td], conf[td] = KNOWN_SIZES[head_of(td)], "known"
    problems = []
    for td, bs in tree.items():  # MI: a base ends where the next base starts
        bs = sorted(bs, key=lambda x: x[1])
        for (b, m, v), (b2, m2, v2) in zip(bs, bs[1:]):
            if v or v2:
                continue
            if b in size and size[b] != m2 - m and conf[b] != "mi":
                problems.append(f"{tds[b]['name']}: new() size {size[b]:#x} but next base in {tds[td]['name']} at +{m2 - m:#x}; using the latter")
            size[b], conf[b] = m2 - m, "mi"
    for td in tds:  # a base can't be bigger than a sized class derived from it: its new() votes were misattributed
        for d in tds:
            if d != td and td in anc[d] and conf.get(td) == "new" and conf.get(d) in ("new", "mi") and size[td] > size[d]:
                problems.append(f"{tds[td]['name']}: new() size {size[td]:#x} > derived {tds[d]['name']} ({size[d]:#x}); dropped")
                del size[td], conf[td]
                break

    fields = A["fields"]
    order = sorted(tds, key=lambda td: len(anc[td]))  # bases first

    def own_start(td):
        end = 4 if 0 in tds[td]["vtables"] else 0
        for b, m, v in tree[td]:
            if not v:
                end = max(end, m + size.get(b, 0))
        return end

    members = A["members"]

    def msize(m, el, n):  # bytes taken by a member object / member array
        return (el if el is not None else size.get(m, 0)) * n

    for td in order:
        if td not in size:
            size[td], conf[td] = 0, "min"
    for _ in range(4):  # lower bound for everything still unsized; members may hold other unsized classes
        for td in order:
            if conf[td] != "min":
                continue
            lb = own_start(td)
            for o, c in fields[td].items():
                lb = max(lb, o + max(w for w, t in c))
            for o, c in members[td].items():
                lb = max(lb, o + msize(*c.most_common(1)[0][0]))
            size[td] = (lb + 3) & ~3  # 0 = empty (a __declspec(novtable) interface or tag base)
    for td in order:  # a lower bound can't exceed what a sized derived class leaves for it
        for d, m in children[td]:
            if conf[td] == "min" and conf.get(d) in ("new", "mi") and m + size[td] > size[d]:
                problems.append(f"{tds[td]['name']}: field lower bound {size[td]:#x} overflows {tds[d]['name']} ({size[d]:#x})")
                size[td] = max(size[d] - m, own_start(td))
    # Embedded member objects bound each other: the next member starts where this one ends (or later). A run of
    # 3+ same-type members at one stride is that type's size; a single gap equal to the field lower bound pins it.
    gaps = collections.defaultdict(list)
    for x, ms in members.items():
        objs = sorted((o, c.most_common(1)[0][0][0]) for o, c in ms.items() if c.most_common(1)[0][0][1] is None)
        for (o1, m1), (o2, m2) in zip(objs, objs[1:]):
            gaps[m1].append((o2 - o1, m1 == m2))
        for i in range(len(objs) - 2):
            (o1, m1), (o2, m2), (o3, m3) = objs[i:i + 3]
            if m1 == m2 == m3 and o2 - o1 == o3 - o2 and conf.get(m1) == "min" and size[m1] <= o2 - o1:
                size[m1], conf[m1] = o2 - o1, "member"
    for m, gs in gaps.items():
        if conf[m] == "min" and size[m] and min(g for g, same in gs) == size[m]:
            conf[m] = "member"
    for x, ms in members.items():  # embedded arrays: element size from the array-iterator call
        for o, c in ms.items():
            m, el, n = c.most_common(1)[0][0]
            if m is not None and el is not None and conf.get(m) == "min" and size[m] <= el:
                size[m], conf[m] = el, "new"

    # Specialisations of one template with the same bases and vtable length share a layout (T only appears as T*).
    family = collections.defaultdict(list)
    for td, c in tds.items():
        if "<" in c["name"]:
            key = (c["name"].split("<")[0], tuple(b[0] for b in c["bases"][1:]), tuple(len(s) for o, (v, s) in sorted(c["vtables"].items())))
            family[key].append(td)
    for key, tdl in family.items():
        pinned = collections.Counter(size[td] for td in tdl if conf[td] not in ("min", "template"))
        if len(pinned) == 1:
            s = next(iter(pinned))
            for td in tdl:
                if conf[td] == "min" and size[td] <= s:
                    size[td], conf[td] = s, "template"
    # Nothing anywhere touches a field of their own: interfaces are just the vptr, derived classes just their
    # bases (medium confidence: fields only inline code in other classes touches would be missed).
    for td in order:
        if conf[td] == "min" and tds[td]["vtables"] and size[td] == own_start(td) and not fields[td] and not members[td]:
            conf[td] = "iface" if not tree[td] else "nofields"

    # MSVC6 initialises a class's members between its base's vptr store and its own, so the first offset
    # touched there is an upper bound on the base size; equal to the field lower bound = pinned.
    for td in order:
        u = A["ub"].get(td)
        if u is not None and conf[td] == "min":
            if u == size[td]:
                conf[td] = "ctor"
            elif u < size[td]:
                problems.append(f"{tds[td]['name']}: derived members start at {u:#x} below field lower bound {size[td]:#x}")
        elif u is not None and u < size[td] and conf[td] == "new":
            problems.append(f"{tds[td]['name']}: new() size {size[td]:#x} but derived members start at {u:#x}")

    # --- route every observed access down to the class whose own region holds it ---
    cand = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))

    def route(td, o, w, t, n):
        for b, m, v in tree[td]:
            if not v and m <= o and o + w <= m + size[b]:
                return route(b, o - m, w, t, n)
        if own_start(td) <= o and o + w <= size[td]:
            cand[td][o][(w, t)] += n

    for td in tds:
        for o, c in fields[td].items():
            for (w, t), n in c.items():
                route(td, o, w, t, n)
    mcand = collections.defaultdict(dict)

    def route_member(td, o, mem):
        w = msize(*mem)
        for b, m, v in tree[td]:
            if not v and m <= o and o + w <= m + size[b]:
                return route_member(b, o - m, mem)
        if w and own_start(td) <= o and o + w <= size[td]:
            mcand[td][o] = mem

    for td in tds:
        for o, c in members[td].items():
            route_member(td, o, c.most_common(1)[0][0])
    abstract = {td for td, c in tds.items() if any(pe.follow(x) in A["purecall"] for o, (v, sl) in c["vtables"].items() for x in sl)}
    member_deps = collections.defaultdict(set)

    # --- virtual slots: identity = (introducing class, index), names + signatures per identity ---
    def slot_id(td, off, k):
        for b, m, v in tree[td]:
            if not v and m <= off and (off - m) in tds[b]["vtables"] and k < len(tds[b]["vtables"][off - m][1]):
                return slot_id(b, off - m, k)
        return (td, k) if off == 0 else None  # secondary vtables never grow; longer = scan overrun

    impls = collections.defaultdict(list)
    for td, c in tds.items():
        for off, (vt, slots) in c["vtables"].items():
            for k, s in enumerate(slots):
                sid = slot_id(td, off, k)
                if sid:
                    impls[sid].append(pe.follow(s))

    def short(td):
        n = tds[td]["name"]
        return san(n.split("<")[0]) if "<" in n else san(n)

    def ctype(t):
        t = t.strip()
        if t.endswith("*"):
            return "void*"
        return {"float": "float", "double": "double", "float10": "double", "bool": "bool", "char": "char",
                "byte": "uint8_t", "undefined1": "uint8_t", "uchar": "uint8_t", "short": "int16_t",
                "ushort": "uint16_t", "undefined2": "uint16_t", "wchar_t": "uint16_t", "int": "int32_t",
                "long": "int32_t", "longlong": "int64_t", "ulonglong": "uint64_t", "undefined8": "uint64_t"
                }.get(t, "uint32_t")

    def stack_bytes(t):
        return 8 if t in ("double", "int64_t", "uint64_t") else 4

    sigs, sig_conf = {}, collections.Counter()
    for sid, fs in impls.items():
        real = [f for f in fs if f not in A["purecall"]]
        rets = collections.Counter()
        nb = collections.Counter()
        parsed = []
        for f in set(real):
            n = analyze.ret_bytes(pe, f, funcs[f]["size"]) if f in funcs else None
            if n is not None:
                nb[n] += 1
            p = analyze.parse_sig(A["texts"].get(f, ""))
            if p:
                parsed.append(p)
                rets[ctype(p["ret"]) if p["ret"] not in ("void",) else "void"] += 1
        ret = "void"
        if rets:
            ret = rets.most_common(1)[0][0]
            if "double" in rets or "float" in rets:
                ret = "float" if rets["float"] >= rets["double"] else "double"
            elif ret != "void" and any(r in rets for r in ("uint32_t", "int32_t", "void*")):
                ret = next(r for r in ("void*", "uint32_t", "int32_t") if r in rets) if ret in ("uint8_t", "char", "bool", "uint16_t", "int16_t") else ret
        nbytes = nb.most_common(1)[0][0] if nb else None
        args = None
        for p in parsed:
            stackp = p["params"][1:] if p["cc"] == "__thiscall" else p["params"][2:] if p["cc"] == "__fastcall" else p["params"]
            ts = [ctype(t) for t, n in stackp]
            if nbytes is None or sum(map(stack_bytes, ts)) == nbytes:
                args = ts
                break
        if args is None:
            args = ["uint32_t"] * ((nbytes or 0) // 4)
            sig_conf["ret-n only" if nbytes is not None else "unknown"] += 1
        else:
            sig_conf["ret-n + ghidra" if nbytes is not None else "ghidra only"] += 1
        dtor = sum(f in A["deleting"] for f in real) * 2 > len(real) > 0
        sigs[sid] = (ret, args, dtor, nbytes)

    # --- emission ---
    srcdir = {}
    for td in emit:
        if cat[td] != "game":
            srcdir[td] = cat[td] + "_stub"
            continue
        d = collections.Counter(labels.get(f, ("", ""))[1] for f in own[td] if labels.get(f, ("", ""))[1])
        srcdir[td] = san(d.most_common(1)[0][0]) if d else "misc"

    outer_of = {}
    by_name = {c["name"]: td for td, c in tds.items()}
    for td in emit:
        n = tds[td]["name"]
        if "::" in n and "<" not in n:
            outer_of[td] = n.rsplit("::", 1)[0]
    fake_outers = sorted({o for o in outer_of.values() if o not in by_name or by_name[o] not in emit})

    def header(td):
        if td in outer_of and outer_of[td] in by_name and by_name[outer_of[td]] in emit:
            return header(by_name[outer_of[td]])
        if td in outer_of:
            return f"yo2/{srcdir[td]}/{san(outer_of[td])}.h"
        return f"yo2/{srcdir[td]}/{san(decl_name(td))}.h"

    def decl_name(td):
        n = tds[td]["name"]
        if cat[td] == "lib":  # can't redeclare std:: types; stand-ins get a flat name
            return "yo2_" + san(n)
        return n.replace(">>", "> >")

    def kw(td):
        return "struct" if tds[td]["struct"] else "class"

    def body(td):
        c = tds[td]
        n = decl_name(td)
        leaf = n.split("<")[0].rsplit("::", 1)[-1]
        bases = sorted((x for x in tree[td] if not x[2]), key=lambda x: x[1])
        lines = []
        vts = ", ".join(f"{vt:#010x}@+{off:#x}" for off, (vt, s) in sorted(c["vtables"].items()))
        lines.append(f"// {c['mangled']}  size {size[td]:#x} ({conf[td]})  vtables {vts or '-'}")
        spec = "template<> " if "<" in n else ""
        inh = ", ".join(f"public {decl_name(b)}" for b, m, v in bases)
        if [x for x in tree[td] if x[2]]:
            lines.append("// NOTE: virtual bases omitted (" + ", ".join(tds[b]["name"] for b, m, v in tree[td] if v) + ")")
        lines.append(f"{spec}{kw(td)} {n}{' : ' + inh if inh else ''} {{")
        lines.append("public:")
        nested = [x for x in emit if outer_of.get(x) == c["name"]]
        for x in sorted(nested, key=lambda x: tds[x]["name"]):
            lines.append(f"    {kw(x)} {tds[x]['name'].rsplit('::', 1)[1]};")
        decls, new = [], []
        has_dtor = False
        for off, (vt, slots) in sorted(c["vtables"].items()):
            for k, s in enumerate(slots):
                sid = slot_id(td, off, k)
                if not sid:
                    continue
                f = pe.follow(s)
                inherited = None
                if sid[0] != td:
                    for b, m, v in tree[td]:
                        if not v and m <= off and (off - m) in tds[b]["vtables"] and k < len(tds[b]["vtables"][off - m][1]):
                            inherited = pe.follow(tds[b]["vtables"][off - m][1][k])
                            break
                    if inherited == f:
                        continue
                ret, args, dtor, nbytes = sigs[sid]
                pure = " = 0" if f in A["purecall"] else ""
                where = f"slot {k}" + (f" @+{off:#x}" if off else "")
                mark = f"// @yo2-decl {f:#010x} {where}" if not pure else f"// pure {where}"
                if dtor:
                    if has_dtor:
                        continue
                    has_dtor = True
                    d = f"~{leaf}(){' override' if sid[0] != td else ''}{pure};"
                    (decls if sid[0] != td else new).append((k, f"    {'virtual ' if sid[0] == td else ''}{d}", mark))
                    continue
                params = ", ".join(f"{t} a{i + 1}" for i, t in enumerate(args))
                name = f"{short(sid[0])}_vf{sid[1]:02d}"
                if sid[0] != td:
                    decls.append((k, f"    {ret} {name}({params}) override{pure};", mark))
                else:
                    new.append((k, f"    virtual {ret} {name}({params}){pure};", mark))
        for k, d, m in decls + sorted(new, key=lambda x: x[0]):
            lines.append(f"{d:<72} {m}")
        # fields: embedded member objects first, then scalar accesses that don't land inside one
        items = []
        for o, (m, el, n) in sorted(mcand[td].items()):
            w = msize(m, el, n)
            if items and o < items[-1][0] + items[-1][1]:
                continue
            arr = f"[{n:#x}]" if n > 1 or el is not None else ""
            if m is not None and m in emit and header(m) != header(td) and m not in abstract and size[m] and (el is None or el == size[m]):
                member_deps[td].add(header(m))
                items.append((o, w, f"{decl_name(m)} f_{o:#x}{arr};", ""))
            else:
                what = tds[m]["name"] if m is not None else f"{el:#x}-byte elements"
                items.append((o, w, f"uint8_t f_{o:#x}[{w:#x}];", f"  // {what}{arr}"))
        taken = [(o, o + w) for o, w, d, c in items]
        for o in sorted(cand[td]):
            (w, t), _ = cand[td][o].most_common(1)[0]
            if o + w > size[td] or any(a < o + w and o < b for a, b in taken):
                continue
            if w in (2, 4) and o % w == 0:
                ty = {2: "uint16_t", 4: "float" if t == "float" else "void*" if t.endswith("*") else "int32_t" if t == "int" else "uint32_t"}[w]
                decl = f"{ty} f_{o:#x};"
            elif w == 1:
                decl = f"uint8_t f_{o:#x};"
            else:
                decl = f"uint8_t f_{o:#x}[{w}];"
            items.append((o, w, decl, ""))
            taken.append((o, o + w))
        fl = []
        pos = own_start(td)
        for o, w, decl, comment in sorted(items):
            if o > pos:
                fl.append(f"    uint8_t _pad_{pos:#x}[{o - pos:#x}];")
            fl.append(f"    {decl}{comment}")
            pos = o + w
        if size[td] > pos:
            fl.append(f"    uint8_t _pad_{pos:#x}[{size[td] - pos:#x}];")
        lines += fl
        lines.append("};")
        return lines

    def asserts(td):
        n = decl_name(td)
        alias = n
        out = []
        if "<" in n:
            alias = "yo2_layout_" + san(n)
            out.append(f"using {alias} = {n};")
        if conf[td] in ("new", "mi", "known", "ctor", "member", "template", "iface", "nofields"):
            out.append(f"YO2_SIZE({alias}, {size[td]:#x});")
        if conf[td] in ("new", "mi", "ctor", "member", "template"):
            for line in body_cache[td]:
                m = re.match(r"    [^/]+ (f_0x[0-9a-f]+)(\[\w+\])?;", line)
                if m:
                    out.append(f"YO2_OFFSET({alias}, {m.group(1)}, {m.group(1)[2:]});")
        return out

    body_cache = {td: body(td) for td in emit}

    # files
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    files = collections.defaultdict(list)
    for td in emit:
        files[header(td)].append(td)

    def write(path, text):
        p = os.path.join(INC, path)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, "w").write(text)

    write("yo2/base.h", BASE_H)
    fwd = ["// Generated by include/gen/gen.py: forward declarations of every generated class.", "#pragma once", ""]
    tmpl = {}
    enums, plain = set(), []
    for td in sorted(emit, key=lambda td: tds[td]["name"]):
        n = decl_name(td)
        if "<" in n:
            args = rtti.Demangler(tds[td]["mangled"][4:])
            head = n.split("<")[0]
            tmpl.setdefault(head, (n.count(",") + 1 if n.count("<") == 1 else len(split_args(n)), cat[td]))
            for m in re.finditer(r"W4([A-Za-z_]\w*)@@", tds[td]["mangled"]):
                enums.add(m.group(1))
            for m in re.finditer(r"[VU]([A-Za-z_]\w*)@@", tds[td]["mangled"].split("?$", 1)[1]):
                plain.append(("struct" if m.group(0)[0] == "U" else "class", m.group(1)))
        elif "::" not in n:
            fwd.append(f"{kw(td)} {n};")
    have = {decl_name(td) for td in emit}
    fwd += sorted({f"{k} {n};" for k, n in plain if n not in have})
    fwd += [f"enum {e} : int;" for e in sorted(enums)]
    for head, (nargs, c) in sorted(tmpl.items()):
        fwd.append(f"template<{', '.join('class' for _ in range(nargs))}> class {head};")
    write("yo2/fwd.h", "\n".join(fwd) + "\n")

    for path, group in files.items():
        out = ["// Generated by include/gen/gen.py from yo2.exe RTTI + the decompiled cache. Do not hand-edit.",
               "#pragma once", '#include "yo2/base.h"', '#include "yo2/fwd.h"']
        incs = sorted(({header(b) for td in group for b, m, v in tree[td] if not v} | {h for td in group for h in member_deps[td]}) - {path})
        out += [f'#include "{i}"' for i in incs]
        stub = any(cat[td] == "yane" for td in group)
        if stub:
            out += ["", "// Stand-in for a yaneSDK class (phase 1 owns the real one under third_party/yanesdk).",
                    "#ifndef YO2_REAL_YANESDK"]
        out.append("")
        outer = next((o for o in fake_outers if any(outer_of.get(td) == o for td in group)), None)
        if outer:
            inner = [td for td in group if outer_of.get(td) == outer]
            out.append(f"// {outer} is not an RTTI class; this shell only exists to scope its nested classes.")
            out.append(f"class {outer} {{\npublic:")
            out += [f"    {kw(td)} {tds[td]['name'].rsplit('::', 1)[1]};" for td in inner]
            out += ["};", ""]
        group = sorted(group, key=lambda td: (td in outer_of, tds[td]["name"]))
        for td in group:
            out += body_cache[td]
            a = asserts(td)
            if a:
                out += ["#if YO2_ABI32"] + a + ["#endif"]
            out.append("")
        if stub:
            out.append("#endif  // YO2_REAL_YANESDK")
        write(path, "\n".join(out) + "\n")
    write("yo2/all.h", "// Generated by include/gen/gen.py: every generated header, for one-TU compile checks.\n#pragma once\n"
          + "".join(f'#include "{p}"\n' for p in sorted(files)))

    # --- references, manifest, coverage ---
    thunk_to = {}
    for a, f in funcs.items():
        if f.get("thunk"):
            thunk_to[a] = pe.follow(a)
    vt_owner = {vt: td for td, c in tds.items() for off, (vt, s) in c["vtables"].items()}
    fn_owner = {}
    for td, fs in own.items():
        for f in fs:
            fn_owner[f] = td
    refs = collections.Counter()
    for a, t in A["texts"].items():
        hit = set()
        for m in re.finditer(r"FUN_([0-9a-f]{8})|_([0-9a-f]{8});", t):
            if m.group(1):
                x = int(m.group(1), 16)
                td = fn_owner.get(thunk_to.get(x, x))
            else:
                td = vt_owner.get(int(m.group(2), 16))
            if td is not None and a not in own[td]:
                hit.add(td)
        for td in hit:
            refs[td] += 1
    for td in tds:  # a base is referenced through everything derived from it
        for b in anc[td] - {td}:
            refs[b] += 1
    game = sorted((td for td in emit if cat[td] == "game"), key=lambda td: -refs[td])
    with open(os.path.join(OUT, "classes.tsv"), "w") as w:
        w.write("rank\tclass\tcategory\tsize\tsize_source\tvslots\tfields\trefs\theader\n")
        for i, td in enumerate(game + sorted((td for td in emit if cat[td] != "game"), key=lambda td: tds[td]["name"])):
            nf = sum(1 for line in body_cache[td] if re.match(r"    [^/]+ f_0x", line))
            ns = sum(len(s) for o, (v, s) in tds[td]["vtables"].items())
            w.write(f"{i + 1 if cat[td] == 'game' else '-'}\t{tds[td]['name']}\t{cat[td]}\t{size[td]:#x}\t{conf[td]}\t{ns}\t{nf}\t{refs[td]}\t{header(td)}\n")

    def stats(group):
        c = collections.Counter(conf[td] for td in group)
        return f"{len(group)} classes: sizes {dict(c)}; vtables {sum(1 for td in group if tds[td]['vtables'])}; " \
               f"with fields {sum(1 for td in group if any(re.match(r'    [^/]+ f_0x', x) for x in body_cache[td]))}"
    print("all emitted:", stats(list(emit)))
    print("game:       ", stats(game))
    print("top 300:    ", stats(game[:300]))
    print("categories: ", dict(collections.Counter(cat.values())), "emitted stand-ins:",
          dict(collections.Counter(cat[td] for td in emit if cat[td] != "game")))
    print("signatures: ", dict(sig_conf))
    print("headers:    ", len(files))
    for p in problems:
        print("PROBLEM", p)
    for nm in ("CTask", "CWindowTaskModel", "CD3DDevice"):
        td = by_name.get(nm)
        if td:
            print(nm, f"rank {game.index(td) + 1 if td in game else '-'}", hex(size[td]), conf[td])


def split_args(n):
    inner = n[n.index("<") + 1:n.rindex(">")]
    depth, out, cur = 0, [], ""
    for ch in inner:
        if ch == "<":
            depth += 1
        elif ch == ">":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    return out + [cur]


BASE_H = """// Generated by include/gen/gen.py. Shared by every generated class header.
#pragma once
#include <stddef.h>
#include <stdint.h>

// Layout checks only mean something on the original 32-bit ABI (MSVC, or i686 MinGW which lays these out the same).
#if defined(_M_IX86) || defined(__i386__)
#define YO2_ABI32 1
#else
#define YO2_ABI32 0
#endif

#if defined(__GNUC__) || defined(__clang__)
#pragma GCC diagnostic ignored "-Winvalid-offsetof"  // offsetof on polymorphic classes: fine on every compiler we use
#endif

#define YO2_SIZE(T, n) static_assert(sizeof(T) == (n), "sizeof " #T)
#define YO2_OFFSET(T, f, n) static_assert(offsetof(T, f) == (n), "offsetof " #T "::" #f)
"""

if __name__ == "__main__":
    main()
