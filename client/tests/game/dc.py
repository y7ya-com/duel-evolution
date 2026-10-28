"""Readable decompilation for porting: Ghidra C of one exe function with the MSVC6 idioms folded and callees named.
    python3 -I tests/game/dc.py 0xad53d0 [0x... ...]      # one or more functions
    python3 -I tests/game/dc.py --file Game/yo2PlayerBin.cpp   # every function of that .obj block, in link order
    python3 -I tests/game/dc.py --range 0x5de700 0x5e3300      # every function in an address range
Folds: strlen loops, std::string construction from a literal and its refcount release, the MSVC6 EH frame
bookkeeping, and the yo2 assert pattern (FUN_0060cff0 + exit). Names: every `// @yo2 0xADDR <note>` in src/,
third_party/ and platform/ (note's first words), known CRT functions, and thunks followed to their target.
Raw text: tools/decomp.py."""
import json
import os
import re
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DATA = os.environ.get("YO2_DATA", "/Users/y/Documents/GitHub/yo2-decomp-data")
CRT = {0xb08e6d: "operator_delete", 0xb09654: "operator_new", 0xb0c267: "atoi", 0xb0db2c: "strtok",
       0xb0ae12: "exit", 0xb0a648: "fseek", 0xb0a701: "ftell", 0xb09f60: "fclose", 0xb1c1dc: "std::_Xlen",
       0xb08e2c: "atexit", 0x60cff0: "yo2AssertFailed", 0x423a40: "string::_Tidy", 0x423ae0: "string::_Grow",
       0x423ab0: "string::_Eos", 0x4237c0: "string::assign", 0x423c70: "string::_Copy",
       0x455b50: "string::string(const_char*)", 0x4291a0: "string::assign(ptr,n)", 0xb0b20e: "__RTDynamicCast"}


def load():
    funcs = {}
    for line in open(os.path.join(DATA, "functions2.jsonl")):
        j = json.loads(line)
        if not j["a"].startswith("EXT"):
            funcs[int(j["a"], 16)] = j
    isl = os.path.join(DATA, "islands", "sizes.tsv")   # functions Ghidra never created (phase 1's island scan)
    if os.path.exists(isl):
        for line in open(isl):
            a, n = line.split()
            a, n = int(a, 16), int(n)
            if n > 0 and a % 16 == 0 and a not in funcs:
                funcs[a] = {"a": "%08x" % a, "size": n, "name": "ISL_%08x" % a, "thunk": False, "callees": [], "strings": []}
    thunks = {}
    for a, f in funcs.items():
        m = re.match(r"thunk_FUN_([0-9a-f]+)$", f["name"])
        if f["thunk"] and m:
            thunks[a] = int(m.group(1), 16)
    names = dict(CRT)
    defn = re.compile(rb"((?:\w+::)*~?\w+)\s*\(")
    for d in ("src", "third_party", "platform"):
        for root, _, files in os.walk(os.path.join(ROOT, d)):
            for n in files:
                if not n.endswith((".cpp", ".h", ".c")):
                    continue
                lines = open(os.path.join(root, n), "rb").read().split(b"\n")
                for i, l in enumerate(lines):
                    m = re.search(rb"@yo2\s+0x([0-9a-fA-F]+)[ \t]*(.*)", l)
                    if not m:
                        continue
                    a, note = int(m.group(1), 16), m.group(2).decode("latin-1").strip()
                    w = re.match(r"((?:\w+::)+~?\w+|\w+)", note)
                    if w and "::" in w.group(1):
                        names.setdefault(a, w.group(1)); continue
                    for k in range(i + 1, min(i + 40, len(lines))):   # the definition under the marker(s)
                        if b"@yo2" in lines[k] or not lines[k].strip():
                            continue
                        dm = [x for x in defn.findall(lines[k].split(b"//")[0]) if x not in (b"if", b"for", b"while", b"return", b"sizeof")]
                        if dm:
                            names.setdefault(a, dm[0].decode("latin-1") + ("<template>" if note.startswith("template") else "")); break
    return funcs, thunks, names


def dec(a):
    for p in (f"{DATA}/decompiled/{a:08x}.c", f"{DATA}/islands/{a:08x}.c"):
        if os.path.exists(p):
            return open(p, encoding="utf-8", errors="replace").read()
    return None


STR_LEN = re.compile(r"\n\s*(\w+) = 0xffffffff;\n\s*(\w+) = (s_\w+|&?DAT_\w+|\w+);\n\s*do \{\n\s*if \(\1 == 0\) break;\n"
                     r"\s*\1 = \1 (?:- 1|\+ -1);\n\s*(\w+) = \*\2;\n\s*\2 = \2 \+ 1;\n\s*\} while \(\4 != '\\0'\);\n\s*\1 = ~\1 - 1;")
RELEASE = re.compile(r"\n(\s*)if \(\(?(\w+(?: \+ -?\w+)?)\)? != (?:\(\w+ \*\))?(?:0x0|0)\) \{\n\s*(\w+) = (?:\*\(char \*\)\()?\(?\2\)?(?: \+ -1\)|\[-1\]);\n"
                     r"\s*if \(\(\3 == '\\0'\) \|\| \(\3 == -1\)\) \{\n\s*(?:FUN_00b08e6d|operator_delete)\([^;]*\);\n\s*\}\n"
                     r"\s*else \{\n[^\n]*\n\s*\}\n\s*\}")
EH = re.compile(r"\n\s*(?:uStack_4|iStack_4|puStack_8|pvStack_c|ExceptionList)\S* = [^;]*;")


def block_end(t, i):
    """t[i] == '{' -> index after the matching '}'"""
    d = 0
    for k in range(i, len(t)):
        if t[k] == "{": d += 1
        elif t[k] == "}":
            d -= 1
            if d == 0: return k + 1
    return len(t)


def fold(t):
    if "{" in t:   # drop the local-variable block (Ghidra ends it with a blank line)
        h, b = t.split("{", 1)
        parts = re.split(r"\n[ \t]*\n", b, maxsplit=1)
        if len(parts) == 2 and all(re.match(r"\s*[\w ]+[\s*]+\w+(\s*\[\w+\])?;\s*$", x) for x in parts[0].strip().split("\n") if x.strip()):
            b = parts[1]
        t = h + "{\n" + b
    t = STR_LEN.sub(lambda m: f"\n  {m.group(1)} = strlen({m.group(3)});", t)
    while True:   # string construction from a literal: _Grow(n,1) then two copy loops inside an if
        m = re.search(r"\n(\s*)(\w+) = (?:thunk_FUN_00423ae0|string::_Grow)\((\w+),1\);\n\s*if \(\2 != '\\0'\) ", t)
        if not m: break
        e = block_end(t, t.index("{", m.end() - 1))
        t = t[:m.start()] + f"\n{m.group(1)}/* string = literal (length {m.group(3)}) */" + t[e:]
    # inlined CTaskPtr<T>::operator->: dynamic cast, isValid, NULL access / Wild Task asserts, then the cast again
    pat = re.compile(r"\n(\s*)\w+ = __RTDynamicCast\(([^;]*?),0,&CTask::RTTI_Type_Descriptor,\s*&(\w+)::RTTI_Type_Descriptor,0\);"
                     r"\n\s*(\w+) = CTask::isValid\(\w+\);\n\s*if \(\4 == '\\0'\) ")
    while True:
        m = pat.search(t)
        if not m: break
        e1 = block_end(t, t.index("{", m.end() - 1))
        rest = t[e1:]
        mm = re.match(r"\s*else \{", rest)
        target = None
        if mm:
            e2 = block_end(t, e1 + rest.index("{"))
            inner = t[e1 + rest.index("{"):e2]
            a = re.search(r"(\w+) = __RTDynamicCast", inner)
            target = a.group(1) if a else None
            e1 = e2
        expr = re.sub(r"\s+", " ", m.group(2))
        t = t[:m.start()] + f"\n{m.group(1)}" + (f"{target} = " if target else "") + f"TASKPTR<{m.group(3)}>({expr});" + t[e1:]
    t = RELEASE.sub(lambda m: f"\n{m.group(1)}/* ~string({m.group(2)}) */", t)
    t = EH.sub("", t)
    t = re.sub(r"(\w+) = (?:thunk_FUN_0060cff0|yo2AssertFailed)\(&(DAT_\w+),\w+,\s*s_C__yugionline\w*(?: /\*[^*]*\*/)?,\s*(0x[0-9a-f]+|\d+)\);",
               lambda m: f"{m.group(1)} = ASSERT_BOX(flag {m.group(2)}, line {int(m.group(3), 0)});", t)
    t = re.sub(r"\n\s*/\* WARNING: Subroutine does not return \*/", "", t)
    return re.sub(r"\n\s*\n+", "\n", t)


def name_calls(t, thunks, names, funcs):
    def nm(m):
        a = int(m.group(2), 16)
        a = thunks.get(a, a)
        n = names.get(a)
        return (n.replace(" ", "_") if n else ("FUN_%08x" % a)) + "("
    return re.sub(r"\b(thunk_)?FUN_([0-9a-f]{8})\(", nm, t)


_EXE = None


def cstr(va):
    """printable NUL-terminated string at a virtual address of yo2.exe, or None"""
    global _EXE
    import struct
    if _EXE is None:
        b = open(os.path.join(DATA, "yo2.exe"), "rb").read()
        pe = struct.unpack_from("<I", b, 0x3c)[0]
        n = struct.unpack_from("<H", b, pe + 6)[0]
        o = struct.unpack_from("<H", b, pe + 20)[0]
        base = struct.unpack_from("<I", b, pe + 52)[0]
        _EXE = (b, base, [struct.unpack_from("<IIII", b, pe + 32 + o + i * 40) for i in range(n)])
    b, base, secs = _EXE
    for vsz, va0, rsz, raw in secs:
        if base + va0 <= va < base + va0 + rsz:
            off = raw + va - base - va0
            e = b.find(b"\0", off, off + 256)
            if e > off and all(32 <= c < 127 or c >= 0x80 or c in (9, 10, 13) for c in b[off:e]):
                return b[off:e].decode("cp932", "replace").replace("\n", "\\n").replace("\t", "\\t").replace("\r", "\\r")
    return None


def annotate(t):
    def rep(m):
        v = cstr(int(m.group(2), 16))
        return m.group(0) + (f' /* "{v}" */' if v is not None else "")
    return re.sub(r"(&?DAT_|s_\w*_)([0-9a-f]{8})\b", rep, t)


def show(a, funcs, thunks, names):
    t = dec(a)
    if t is None:
        print(f"===== 0x{a:08x}: no decompilation"); return
    f = funcs.get(a, {})
    print(f"===== 0x{a:08x}  {f.get('size', '?')} B  {names.get(a, '')}  strings={f.get('strings', [])[:4]}")
    print(annotate(fold(name_calls(t, thunks, names, funcs))).strip())


def main():
    funcs, thunks, names = load()
    args = sys.argv[1:]
    if args[:1] == ["--range"]:   # every function in [lo, hi)
        lo, hi = int(args[1], 16), int(args[2], 16)
        for a in sorted(a for a, f in funcs.items() if lo <= a < hi and not f["thunk"] and not re.match(r"(Unwind|Catch)@", f["name"])):
            show(a, funcs, thunks, names)
        return
    if args[:1] == ["--file"]:
        want = args[1].replace("/", "\\")
        hits = sorted(a for a, f in funcs.items() if any(want.lower() in s.lower() for s in f["strings"]))
        # the .obj block: the largest cluster of functions citing the file (another file can cite it far away)
        clusters, cur = [], [hits[0]]
        for a in hits[1:]:
            if a - cur[-1] > 0x4000:
                clusters.append(cur); cur = []
            cur.append(a)
        clusters.append(cur)
        best = max(clusters, key=len)
        lo, hi = best[0], best[-1]
        nxt = [a for a in hits if a > hi]
        # extend to the start of the next .obj (the next function citing another source file)
        other = sorted(a for a, f in funcs.items() if a > hi and any("client\\src\\" in s.lower() and want.lower() not in s.lower() for s in f["strings"]))
        hi = other[0] - 1 if other else hi
        prev = sorted(a for a, f in funcs.items() if a < lo and any("client\\src\\" in s.lower() and want.lower() not in s.lower() for s in f["strings"]))
        lo = prev[-1] + 1 if prev else lo
        # (the previous file's tail and this file's head both lack strings: the cut is a guess, check the first lines)
        print(f"# block 0x{lo:08x}..0x{hi:08x} (between the neighbouring files' path strings)")
        allf = sorted(a for a, f in funcs.items() if not f["thunk"] and not re.match(r"(Unwind|Catch)@", f["name"]))
        for a in allf:
            if lo <= a <= hi:
                show(a, funcs, thunks, names)
        return
    for x in args:
        show(int(x, 16), funcs, thunks, names)


if __name__ == "__main__":
    main()
