"""Writes a logging stub for every function the rewrite calls that nobody has written yet, so yo2native links.

    python3 -I native/gen_stubs.py [build dir]      (default: build; run after building yo2core)

Loop: link yo2native; read ld's "Undefined symbols" (with the objects that reference each one); write stubs into
<build>/native/stubs/; link again, until it links or makes no progress.

- Typed stubs, one file per calling source: that source's #includes, then for each symbol a definition whose return
  type is decltype() of the same call, so no signature is written by hand. Each logs once and returns zero/empty.
- What won't compile that way (templates, a base class without a default constructor, a declaration inside the
  .cpp) becomes a raw stub: an asm-named function that logs and returns 0, or a zeroed blob for a variable.
- Each stub carries the exe address from the comment at its declaration (FUN_xxxxxxxx / 0x00xxxxxx), its kind
  (stubhit.h: todo / glue / noaddr) and the owner of that address (ASSIGNMENTS.tsv).
The list of stubs is also written to <build>/native/stubs/stubs.tsv.
"""
import glob
import os
import re
import subprocess
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
BUILD = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "build"))
OUT = os.path.join(BUILD, "native", "stubs")
ADDR_RE = re.compile(r"(?:FUN_|0x)(00[0-9a-fA-F]{6})\b")


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


# ------------------------------------------------------------------ the source tree
SOURCES = {os.path.basename(p): p for p in glob.glob(os.path.join(ROOT, "src", "**", "*.cpp"), recursive=True)}
SOURCES["main.cpp"] = os.path.join(ROOT, "native", "main.cpp")
TEXT = {}


def text(path):
    if path not in TEXT:
        try:
            TEXT[path] = open(path, encoding="utf-8", errors="replace").read().split("\n")
        except OSError:
            TEXT[path] = []
    return TEXT[path]


def includes(path):
    """(line, resolved path or None) for each #include of a file; quoted ones resolved like the compiler would."""
    out = []
    for line in text(path):
        m = re.match(r'\s*#\s*include\s*([<"])([^>"]+)[>"]', line)
        if not m:
            continue
        rel, found = m.group(2), None
        if m.group(1) == '"':
            for base in (os.path.dirname(path), os.path.join(ROOT, "src"), os.path.join(ROOT, "platform"),
                         os.path.join(ROOT, "include"), os.path.join(ROOT, "native")):
                if os.path.exists(os.path.join(base, rel)):
                    found = os.path.normpath(os.path.join(base, rel))
                    break
        out.append((line.strip(), found))
    return out


def headerClosure(path):
    seen, todo = [], [path]
    while todo:
        p = todo.pop(0)
        if p in seen:
            continue
        seen.append(p)
        todo += [f for _, f in includes(p) if f and f.startswith(os.path.join(ROOT, "src"))]
    return seen


CLASSES = set()
for p in glob.glob(os.path.join(ROOT, "src", "**", "*.*"), recursive=True) + [os.path.join(ROOT, "platform", "win32", "windows.h")]:
    if p.endswith((".h", ".cpp")):
        for line in text(p):
            for m in re.finditer(r"\b(?:class|struct)\s+(?:alignas\([^)]*\)\s*)?(\w+)", line):
                CLASSES.add(m.group(1))

MARKED = set()
for p in glob.glob(os.path.join(ROOT, "src", "**", "*.*"), recursive=True):
    for line in text(p):
        MARKED.update(a.lower() for a in re.findall(r"@yo2 0x([0-9a-fA-F]{8})", line))
for line in text(os.path.join(ROOT, "third_party", "yanesdk", "match", "markers.tsv")):
    if line:
        MARKED.add(line.split("\t")[0].lower())

RANGES = []
for line in text(os.path.join(ROOT, "ASSIGNMENTS.tsv")):
    f = line.split("\t")
    if len(f) >= 4 and f[0].startswith("0x"):
        RANGES.append((int(f[0], 16), int(f[1], 16), f[3]))


def owner(addr):
    if not addr:
        return "-"
    a = int(addr, 16)
    for lo, hi, o in RANGES:
        if lo <= a <= hi:
            return o
    return "yaneSDK" if a < 0x580000 else "crt" if a >= 0xb00000 else "-"


def findAddr(ident, sources):
    """The exe address noted at the declaration of `ident` in the given files: on the declaration's line, or in the
    comment lines right above it. Only declaration-like lines count (type tokens before the name), not calls."""
    pat = re.compile(r"^\s*(?:(?:[\w:<>,*&]+|const|virtual|static|inline|extern)\s+)*[*&]*\s*(?:\w+::)*~?"
                     + re.escape(ident) + r"\s*[\(\[;{=]")
    for p in sources:
        lines = text(p)
        for i, line in enumerate(lines):
            if not pat.match(line) or "@yo2 " in line or "return " in line:
                continue
            m = ADDR_RE.search(line.split("//", 1)[1]) if "//" in line else None
            j = i - 1
            while not m and j >= 0 and i - j <= 3 and lines[j].lstrip().startswith("//"):
                m = ADDR_RE.search(lines[j])
                j -= 1
            if m:
                return m.group(1).lower()
    return ""


# ------------------------------------------------------------------ demangled names
def splitTop(s, sep):
    parts, depth, cur, i = [], 0, "", 0
    while i < len(s):
        c = s[i]
        if c in "<([":
            depth += 1
        elif c in ">)]":
            depth -= 1
        if depth == 0 and s.startswith(sep, i):
            parts.append(cur)
            cur = ""
            i += len(sep)
            continue
        cur += c
        i += 1
    parts.append(cur)
    return parts


def parse(dem):
    """-> dict(kind=func|ctor|dtor|var|other, qual=[...], name, params=[...], const) or None if not stubbable typed"""
    if dem.startswith(("vtable for ", "typeinfo for ", "typeinfo name for ", "VTT for ", "guard variable for ")):
        return {"kind": "other"}
    s, const = dem, False
    if s.endswith(" const"):
        s, const = s[:-6], True
    if not s.endswith(")"):
        q = splitTop(s, "::")
        return {"kind": "var", "qual": q[:-1], "name": q[-1], "params": [], "const": False} if "<" not in s else None
    depth = 0
    for i in range(len(s) - 1, -1, -1):
        depth += s[i] == ")"
        depth -= s[i] == "("
        if depth == 0:
            break
    name, params = s[:i], s[i + 1:-1]
    if "<" in name or " " in name.replace("operator ", "operator_"):   # templates, return types in the name
        return None
    q = splitTop(name, "::")
    ps = [p.strip() for p in splitTop(params, ",")] if params.strip() not in ("", "void") else []
    if any("..." in p for p in ps):
        return None
    last, cls = q[-1], (q[-2] if len(q) > 1 else None)
    kind = "ctor" if last == cls else "dtor" if cls and last == "~" + cls else "func"
    if last.startswith("operator") and not re.match(r"operator\W", last):
        return None   # conversion operators
    member = bool(cls) and cls in CLASSES
    return {"kind": kind, "qual": q[:-1], "name": last, "params": ps, "const": const, "member": member}


def typed(p, call):
    """C++ text of a typed stub for parsed name p; `call` is the yo2StubHit(...) statement"""
    qual = "::".join(p["qual"])
    full = (qual + "::" if qual else "") + p["name"]
    sig = ", ".join(p["params"])
    if p["kind"] == "ctor":
        return f"{full}({sig}) {{ {call} }}\n"
    if p["kind"] == "dtor":
        return f"{full}() {{ {call} }}\n"
    if p["kind"] == "var":
        return f"decltype({full}) {full}{{}};\n"
    args = ", ".join(f"std::declval<{t}>()" for t in p["params"])
    if p["member"]:
        expr = f"std::declval<{'const ' if p['const'] else ''}{qual}&>().{p['name']}({args})"
    else:
        expr = f"{full}({args})"
    ret = f"decltype({expr})"
    return (f"auto {full}({sig}){' const' if p['const'] else ''} -> {ret} {{\n    {call}\n"
            f"    return yo2StubRet<{ret}>();\n}}\n")


def cstr(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


# ------------------------------------------------------------------ link and read ld's report
def link():
    r = sh(["cmake", "--build", BUILD, "--target", "yo2native", "-j2"])
    out = r.stdout + r.stderr
    undef, cur = {}, None
    for line in out.split("\n"):
        m = re.match(r'  "(.*)", referenced from:', line)
        if m:
            cur = m.group(1)
            undef[cur] = []
            continue
        m = re.match(r"\s+.* in (?:.*\()?([\w.+-]+\.cpp)\.o\)?$", line)
        if cur and m:
            undef[cur].append(m.group(1))
    ok = r.returncode == 0
    if not ok and not undef:
        sys.exit("yo2native failed to build for another reason:\n" + "\n".join(out.split("\n")[-40:]))
    return ok, undef


def mangledNames():
    """demangled -> symbol as the object files spell it, for every undefined reference in yo2core and main.o"""
    objs = [os.path.join(BUILD, "libyo2core.a")] + glob.glob(os.path.join(BUILD, "native", "CMakeFiles", "yo2native.dir", "**", "*.o"), recursive=True)
    syms = sorted({l.split()[-1] for l in sh(["nm", "-u"] + objs).stdout.split("\n") if l.strip() and ":" not in l})
    dem = sh(["c++filt"], input="\n".join(syms)).stdout.split("\n")
    return {d: s for s, d in zip(syms, dem)}


def flags():
    f = {}
    for line in text(os.path.join(BUILD, "CMakeFiles", "yo2core.dir", "flags.make")):
        if " = " in line:
            k, v = line.split(" = ", 1)
            f[k.strip()] = v
    return (f.get("CXX_DEFINES", "") + " " + f.get("CXX_INCLUDES", "") + " " + f.get("CXX_FLAGS", "")).split() + \
        ["-I" + os.path.join(ROOT, "native"), "-w"]


# ------------------------------------------------------------------ generate
def main():
    os.makedirs(OUT, exist_ok=True)
    for old in glob.glob(os.path.join(OUT, "*")):
        os.remove(old)
    sh(["cmake", "-S", ROOT, "-B", BUILD])
    stubs = {}   # demangled -> dict(addr, kind, owner, caller, raw, mangled)
    cflags = flags()
    for rnd in range(6):
        ok, undef = link()
        print(f"round {rnd}: {'linked' if ok else str(len(undef)) + ' undefined'}")
        if ok:
            break
        mangled = mangledNames()
        for d in list(undef):   # a thunk comes with its function: stub the function instead
            for pre in ("non-virtual thunk to ", "virtual thunk to "):
                if d.startswith(pre):
                    undef.setdefault(d[len(pre):], undef[d])
                    del undef[d]
        new = [d for d in undef if d not in stubs]
        functions = [d for d in new if not d.startswith(("vtable for ", "typeinfo"))]
        new = functions or new   # vtables / typeinfo only once no function stub could still emit them
        if not new:
            sys.exit("no progress; still undefined:\n" + "\n".join(sorted(undef)[:40]))
        for d in new:
            callers = [SOURCES[c] for c in undef[d] if c in SOURCES] or [SOURCES["main.cpp"]]
            p = parse(d)
            ident = p["name"] if p and p.get("name") else re.split(r"[\s:(]", d.split("(")[0])[-1]
            files = [f for c in callers for f in headerClosure(c)]
            addr = findAddr(ident.lstrip("~"), files)
            kind = "glue" if addr in MARKED else "todo" if addr else "noaddr"
            stubs[d] = {"addr": addr, "kind": kind, "owner": owner(addr), "caller": os.path.relpath(callers[0], ROOT),
                        "parsed": p, "raw": p is None or p["kind"] == "other",
                        "mangled": mangled.get(d, d if not d.startswith(("vtable", "typeinfo")) else None)}
        write(stubs, cflags)
    with open(os.path.join(OUT, "stubs.tsv"), "w") as f:
        f.write("addr\tkind\towner\traw\tname\tcaller\n")
        for d, s in sorted(stubs.items(), key=lambda kv: kv[1]["addr"] or "~"):
            f.write(f"{s['addr'] or '-'}\t{s['kind']}\t{s['owner']}\t{int(s['raw'])}\t{d}\t{s['caller']}\n")
    raws = sum(s["raw"] for s in stubs.values())
    print(f"{len(stubs)} stubs ({len(stubs) - raws} typed, {raws} raw), "
          f"{sum(s['kind'] == 'glue' for s in stubs.values())} glue, {sum(s['kind'] == 'noaddr' for s in stubs.values())} without an address")


def write(stubs, cflags):
    byCaller = {}
    for d, s in stubs.items():
        if not s["raw"]:
            byCaller.setdefault(s["caller"], []).append(d)
    for caller, names in sorted(byCaller.items()):
        while names:   # compile; anything that errors goes raw; again until the file is clean
            path = os.path.join(OUT, os.path.basename(caller).replace(".cpp", "_stubs.cpp"))
            lines, spans = ["// generated by native/gen_stubs.py: do not edit", "#include <utility>"], []
            for inc, found in includes(os.path.join(ROOT, caller)):
                lines.append(f'#include "{found}"' if found else inc)
            lines.append('#include "stubhit.h"')
            for d in names:
                s = stubs[d]
                call = (f"yo2StubHit(0x{s['addr'] or '0'}, {cstr(s['kind'])}, {cstr(s['owner'])}, {cstr(d)}, "
                        f"{cstr(s['caller'])});")
                start = len(lines) + 1
                lines += typed(s["parsed"], call).rstrip("\n").split("\n")
                spans.append((start, len(lines), d))
            open(path, "w").write("\n".join(lines) + "\n")
            r = sh(["c++", "-fsyntax-only", "-ferror-limit=0"] + cflags + [path])
            bad = set()
            for m in re.finditer(re.escape(path) + r":(\d+):\d+: error", r.stderr):
                ln = int(m.group(1))
                bad |= {d for a, b, d in spans if a <= ln <= b}
            if r.returncode and not bad:   # an error outside the stubs (an include): all of this caller goes raw
                bad = set(names)
            for d in bad:
                stubs[d]["raw"] = True
            names = [d for d in names if d not in bad]
            if not bad:
                break
        else:
            path = os.path.join(OUT, os.path.basename(caller).replace(".cpp", "_stubs.cpp"))
            if os.path.exists(path):
                os.remove(path)
    raw = ["// generated by native/gen_stubs.py: raw stubs (asm-named), for what wouldn't compile typed",
           '#include "stubhit.h"', ""]
    for i, (d, s) in enumerate(sorted(stubs.items())):
        if not s["raw"] or not s["mangled"]:
            continue
        p = s["parsed"]
        if p and p["kind"] == "var" or (not p and "(" not in d):
            raw.append(f"alignas(16) unsigned char yo2rawv_{i}[1 << 16] __asm__({cstr(s['mangled'])});   // {d}")
        else:
            raw.append(f"extern \"C\" long yo2raw_{i}() __asm__({cstr(s['mangled'])});   // {d}")
            raw.append(f"extern \"C\" long yo2raw_{i}() {{ yo2StubHit(0x{s['addr'] or '0'}, {cstr(s['kind'])}, "
                       f"{cstr(s['owner'])}, {cstr(d)}, {cstr(s['caller'])}); return 0; }}")
    open(os.path.join(OUT, "zz_raw_stubs.cpp"), "w").write("\n".join(raw) + "\n")


if __name__ == "__main__":
    main()
