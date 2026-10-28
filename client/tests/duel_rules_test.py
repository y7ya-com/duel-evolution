"""Differential test of translated engine files against the decompiled originals, on randomised boards.

    python3.12 -I tests/duel_rules_test.py [--boards N] [file.cpp ...]
        files: names under src/duel (default: EngineRules2.cpp EngineRules3.cpp; also YO2_RULES_FILES=a.cpp,b.cpp)

  - every `// @yo2` function of the files is rebuilt from the decompile cache (phase2-duel-tools/dc) as compilable C
    (ref_XXXXXX). Its DAT_012cXXXX globals are macros over the same bytes as g_eng, typed as Ghidra types them (an
    element size inferred from how the code indexes each symbol, DATS below overriding); constants it reads from the
    exe's data (DAT_00bXXXXX ...) come from yo2.exe itself. Calls to functions outside the files go to the real,
    already translated helpers (ext_XXXXXX wrappers); calls inside them go to the other references;
  - functions not translated yet (eng_XXXXXX placeholders, see STUBS) are stubbed the same on both sides; any other
    placeholder returns 0 on both sides;
  - for each of many boards (real card ids, every function's own constants, nodes chained into slot and uid lists,
    flags, chains, replay scenes) each function runs on argument tuples drawn from per-parameter pools (pointer
    parameters: words of the board, output buffers, link records, predicates), and the return value, the engine
    block and every output buffer after the call must match;
  - functions whose decompile cannot run standalone (register-carried values, pointer returns, ...) are listed as
    not compared, with the reason;
  - the files compile for i686 (i686-w64-mingw32-g++ -fsyntax-only).
Debugging: YO2_KEEP=<dir> keeps the build; the CLI takes YO2_ONLY=<name> (one function, stub calls traced with
YO2_STUBTRACE=1) and YO2_TRACE=1 (progress).
Needs c++, cc, i686-w64-mingw32-g++, the dc tool, yo2.exe and the card data.
"""
import glob
import os
import re
import struct
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
from memcap import run_capped  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")
DC = os.environ.get("YO2_DC", os.path.join(HERE, "..", "..", "phase2-duel-tools", "dc"))
EXE = os.environ.get("YO2_EXE", "/Users/y/Documents/GitHub/yo2-decomp-data/yo2.exe")
CARDS = os.environ.get("YO2_CARD_BIN", "/Users/y/Documents/GitHub/duel-evolution-restore/extraction/recovery/out_2008/"
                       "CHG/merge/data/bin#")
DEFAULT_FILES = ["EngineRules2.cpp", "EngineRules3.cpp"]
BASE, SIZE = 0x012c7880, 0xb2e4

# Ghidra's element type of the globals checked so far (the rest is inferred from how the code indexes them)
DATS = {
    0x012c8880: "uint32_t", 0x012c888c: "uint32_t", 0x012c8890: "uint32_t", 0x012c8894: "uint32_t",
    0x012c889c: "uint32_t", 0x012c88b4: "uint32_t", 0x012c88c0: "uint32_t", 0x012c8918: "uint32_t",
    0x012c89a4: "uint32_t", 0x012c8f1c: "uint32_t", 0x012c9214: "uint32_t",
    0x012c88bc: "uint16_t", 0x012c88be: "uint16_t", 0x012c8920: "uint16_t", 0x012ca4c8: "uint16_t",
    0x012c88b8: "uint16_t", 0x012c88ba: "uint8_t", 0x012c88c4: "uint8_t", 0x012c898c: "uint8_t", 0x012c89a0: "uint8_t",
    0x012c950c: "uint8_t", 0x012cb8c8: "uint8_t", 0x012cb8ca: "uint8_t", 0x012cb8cc: "uint8_t", 0x012cb8d0: "uint8_t",
    0x012c8442: "uint8_t",
    0x012c8604: "int32_t", 0x012c8744: "int32_t", 0x012c8750: "uint32_t", 0x012ca4c0: "uint32_t",
    0x012cc2d0: "uint32_t", 0x012cc2d4: "uint32_t", 0x012cc338: "uint32_t", 0x012cc378: "uint32_t",
    0x012cc844: "uint32_t", 0x012cca64: "uint32_t",
}

# reference functions whose stack layout Ghidra could not express, framed by hand (same statements)
FRAMED = {
    "6f7000": """int ref_6f7000(undefined4 param_1,undefined4 param_2,undefined2 param_3,byte param_4,undefined4 param_5)
{
  ushort L[14] = {0};
  L[0] = param_3;
  L[1] = ((byte)(-(char)param_1 - 1U ^ (byte)L[1]) & 1 ^ (ushort)*(uint32_t*)(L + 1)) & 0xcfc1 | (param_4 & 0x1f) << 1;
  return ref_6f6b20((short*)L,param_1,param_2,param_5,0);
}
""",
    "6f76f0": """undefined4 ref_6f76f0(uint param_1,uint param_2)
{
  uint uVar1; ushort uVar2; ushort L[14] = {0};
  byte* b = (byte*)(L + 1);
  if (4 < (int)param_2) {
    uVar2 = ((byte)((byte)param_1 ^ b[0]) & 1 ^ (b[1] << 8 | b[0])) & 0xcfc1;
    b[0] = (byte)uVar2 | (byte)((param_2 & 0x1f) << 1);
    uVar1 = (&DAT_012c88b4)[param_2 * 5 + (param_1 & 1) * 899];
    L[0] = (ushort)(&DAT_012c88b4)[param_2 * 5 + (param_1 & 1) * 899] & 0x3fff;
    b[1] = (byte)(uVar2 >> 8);
    L[2] = L[2] ^ ((((ushort)(uVar1 >> 0xe) & 1) + ((ushort)(uVar1 >> 0x17) & 0xff) * 2) * 0x40 ^ L[2]) & 0x7fc0;
    return ext_71e6a0(L);
  }
  return 0;
}
""",
}
PATCHES = {   # (old, new) on the reference text, each must apply (each checked in the disassembly)
    "6f4110": [("iVar2 = ext_6f3040(param_1);", "iVar2 = ext_6f3040(param_1); bVar1 = 0 < iVar2;")],
    "6f45a0": [("piVar3 = (int *)&UNK_00beb7cc;", "static const int T[5] = {2, 3, 1, 4, 0}; piVar3 = (int *)T;"),
               ("(int)piVar3 < 0xbeb7e0", "piVar3 < T + 5")],
    # the word is pushed once before the branch for both calls (0x006f081e push esi); Ghidra drops it from one
    "6f07e0": [("ext_6ec6a0(param_1);", "ext_6ec6a0(param_1,param_4);")],
    "6f9680": [("ext_6ec720(*param_2 >> 0xe & 1);", "ext_6ec720(*param_2 >> 0xe & 1,param_2);")],   # 0x006f96e9 push edi
}
# not functions of their own: a label inside 0x006f7390's loop that Ghidra split off
SKIP = {"6f73bf"}

STUBS = {   # placeholder -> C++ stub (deterministic in its arguments; pointers by the bytes they point at)
    "7033d0": "int stub_7033d0(long j, long s) { int r = (int)(H(1, j, s) % 3); TR(\"7033d0 %ld %ld -> %d\\n\", j, s, r); return r; }",
    "702c90": "int stub_702c90(long j, long s) { return (int)(H(2, j, s) % 9); }",
    "703fa0": "int stub_703fa0(long j, long s) { return (int)(H(3, j, s) & 0x7f); }",
    "7040c0": "int stub_7040c0(long j, long s, long a) { return (int)(H(4, j, s, a) & 1); }",
    "702bd0": "int stub_702bd0(long j, long s) { return (int)(H(5, j, s) % 3000); }",
    "6f9870": "int stub_6f9870(long c) { return (int)(H(6, c) & 1); }",
    "703f70": "int stub_703f70(long j, long s) { return (int)(H(7, j, s) % 4); }",
    "71f380": "int stub_71f380(const void* l, long k) { uint64_t h = H(8, k, HB(l, 28)); return (int)((h % 16) << 8 | (h >> 8 & 1)); }",
    "71e6a0": "int stub_71e6a0(const void* l) { return (int)(H(9, HB(l, 28)) & 3); }",
    "6fae10": "void stub_6fae10(long j, long s, void* o) { uint32_t* w = (uint32_t*)o; uint64_t h = H(10, j, s);"
              " for (int i = 0; i < 13; i++) w[i] = (uint32_t)(H(11, j, s, i) & 0xffff); w[0] = engCardAt(j, s);"
              " w[2] = (uint32_t)(h % 9); w[6] = (uint32_t)(h >> 8) % 3000; w[12] = (uint32_t)(h >> 20) & 1; }",
}

GHIDRA = """#include <stdint.h>
#include <stdbool.h>
typedef uint8_t undefined1, byte, undefined; typedef uint16_t undefined2, ushort; typedef int16_t sshort;
typedef int8_t sbyte; typedef uint32_t undefined4, uint; typedef int64_t undefined8, longlong; typedef uint64_t ulonglong;
typedef uint32_t uint3, undefined3; typedef int code(); typedef long double float10; typedef uint32_t dword; typedef uint16_t word;
#define CONCAT11(a, b) ((uint16_t)((uint8_t)(a) << 8 | (uint8_t)(b)))
#define CONCAT12(a, b) ((uint32_t)((uint8_t)(a)) << 16 | (uint16_t)(b))
#define CONCAT21(a, b) ((uint32_t)((uint16_t)(a)) << 8 | (uint8_t)(b))
#define CONCAT22(a, b) ((uint32_t)((uint16_t)(a)) << 16 | (uint16_t)(b))
#define CONCAT31(a, b) ((uint32_t)(a) << 8 | (uint8_t)(b))
#define CONCAT13(a, b) ((uint32_t)((uint8_t)(a)) << 24 | ((uint32_t)(b) & 0xffffff))
#define CONCAT44(a, b) ((uint64_t)(uint32_t)(a) << 32 | (uint32_t)(b))
#define SUB41(x, n) ((uint8_t)((uint32_t)(x) >> ((n) * 8)))
#define SUB42(x, n) ((uint16_t)((uint32_t)(x) >> ((n) * 8)))
#define SUB21(x, n) ((uint8_t)((uint16_t)(x) >> ((n) * 8)))
#define ZEXT14(x) ((uint32_t)(uint8_t)(x))
#define ZEXT24(x) ((uint32_t)(uint16_t)(x))
#define SEXT14(x) ((int32_t)(int8_t)(x))
#define SEXT24(x) ((int32_t)(int16_t)(x))
#define SBORROW4(a, b) ((int64_t)(int32_t)(a) - (int64_t)(int32_t)(b) != (int32_t)((uint32_t)(a) - (uint32_t)(b)))
#define SCARRY4(a, b) ((int64_t)(int32_t)(a) + (int64_t)(int32_t)(b) != (int32_t)((uint32_t)(a) + (uint32_t)(b)))
#define CARRY4(a, b) ((uint32_t)(a) + (uint32_t)(b) < (uint32_t)(a))
#define POPCOUNT(x) __builtin_popcount((uint32_t)(x))
extern unsigned char* g_mem;
#define EA(a) ((long)(g_mem + ((a) - 0x%x)))
""" % BASE


# ---------------------------------------------------------------- reading the sources

def split_params(text):
    """top-level comma split (function pointer parameters keep their parentheses)"""
    out, depth, cur = [], 0, ""
    for ch in text:
        if ch == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
            continue
        depth += ch == "("
        depth -= ch == ")"
        cur += ch
    if cur.strip():
        out.append(cur.strip())
    return out


def signature(line):
    """(return type, name, [params]) of a definition / declaration line, or None"""
    m = re.match(r"(?:static )?(?:inline )?((?:const )?[\w:]+(?: ?\*)?) ?(\w+)\(", line)
    if not m:
        return None
    i, depth = m.end(), 1
    while i < len(line) and depth:
        depth += line[i] == "("
        depth -= line[i] == ")"
        i += 1
    if depth:
        return None
    return m.group(1).strip(), m.group(2), [p for p in split_params(line[m.end():i - 1]) if p != "void"]


def markers(files):
    """address -> (return, name, params, file) for every marked definition; aliases (several markers over one
    definition) map to the first"""
    out, seen = {}, set()
    for f in files:
        lines = open(f).read().split("\n")
        for i, l in enumerate(lines):
            m = re.match(r"// @yo2 0x00([0-9a-f]{6})", l)
            if not m:
                continue
            j = i + 1
            while j < len(lines) and lines[j].startswith("//"):
                j += 1
            sig = signature(lines[j]) if j < len(lines) else None
            if not sig or sig[1] in seen:
                continue
            seen.add(sig[1])
            out[m.group(1)] = sig + (os.path.basename(f),)
    return out


def ptype(p):
    """the type of a parameter declaration"""
    if "(*" in p:
        return re.sub(r"\(\*\s*\w+\)", "(*)", p)
    return re.sub(r"\s*\b\w+$", "", p) if re.search(r"[\w*]\s+\w+$", p) else p


def pname(p):
    m = re.search(r"\(\*\s*(\w+)\)", p) or re.search(r"(\w+)$", p)
    return m.group(1) if m else ""


def decls():
    """FUN address -> (return, name, [param types], variadic) of every engine function declared in the headers"""
    out = {}
    for h in ("EngineInternal.h", "CardDB.h"):
        for line in open(os.path.join(SRC, "duel", h)):
            f = re.search(r"//\s*FUN_00([0-9a-f]{6})", line)
            sig = signature(line)
            if not f or not sig:
                continue
            ret, name, params = sig
            out[f.group(1)] = (ret, name, [ptype(p) for p in params if p != "..."], "..." in params)
    return out


# ---------------------------------------------------------------- the reference C

def exe_reader():
    d = open(EXE, "rb").read()
    pe = struct.unpack_from("<I", d, 0x3c)[0]
    nsec, opt = struct.unpack_from("<H", d, pe + 6)[0], struct.unpack_from("<H", d, pe + 20)[0]
    base = struct.unpack_from("<I", d, pe + 24 + 28)[0]
    secs = []
    for i in range(nsec):
        vs, va, rs, ro = struct.unpack_from("<IIII", d, pe + 24 + opt + 40 * i + 8)
        secs.append((base + va, max(vs, rs), ro, rs))

    def read(a, n):
        for va, sz, ro, rs in secs:
            if va <= a < va + sz:
                o = a - va
                return bytes(d[ro + o + k] if o + k < rs else 0 for k in range(n))
        return None
    return read


CACHE = [os.environ.get("YO2_DATA", "/Users/y/Documents/GitHub/yo2-decomp-data") + "/decompiled",
         os.path.join(os.path.dirname(DC), "islands_decompiled")]


def infer_size(sym, text, wide=True):
    """element type Ghidra gave DAT_<sym>, from the multipliers of the index expressions (in these functions, else in
    every decompiled function that uses the symbol)"""
    a = int(sym, 16)
    if a in DATS:
        return DATS[a]
    t = infer_local(sym, text)
    if t or not wide:
        return t or "uint32_t"
    lines = subprocess.run(["grep", "-rh", "DAT_" + sym] + [c for c in CACHE if os.path.isdir(c)],
                           capture_output=True, text=True).stdout
    return infer_local(sym, lines) or "uint32_t"


def infer_local(sym, text):
    a = int(sym, 16)
    rel = a - BASE
    if 0x1000 <= rel < 0x2c18:
        strides = (0xe0c, 0x14, 4)
    elif 0x2c48 <= rel < 0x4a48:
        strides = (10,)
    elif 0xba4 <= rel < 0xd80:
        strides = (0x1c,)
    else:
        strides = ()
    cands = None
    exprs = re.findall(r"\(&DAT_%s\)\[([^\]]*)\]" % sym, text)
    for m in re.finditer(r"(\(\w+\s*\*?\)\s*)?&DAT_%s\s*\+\s*" % sym, text):
        if m.group(1):
            continue
        i, depth, e = m.end(), 0, ""   # the added expression, up to the enclosing parenthesis / , / ;
        while i < len(text) and not (depth == 0 and text[i] in ",;)"):
            depth += text[i] == "("
            depth -= text[i] == ")"
            e += text[i]
            i += 1
        exprs.append(e)
    for e in exprs:
        e = re.sub(r"\[[^\]]*\]", "", e)   # other arrays' indices are not this symbol's scale
        for k in re.findall(r"\*\s*(0x[0-9a-f]+|\d+)\b", e):
            k = int(k, 0)
            sizes = {s // k for s in strides if k and s % k == 0 and s // k in (1, 2, 4)}
            if sizes:
                cands = sizes if cands is None else (cands & sizes or cands)
    names = {1: "uint8_t", 2: "uint16_t", 4: "uint32_t"}
    if cands and len(cands) == 1:
        return names[cands.pop()]
    if re.search(r"\*\([\w ]+\*\)\(&DAT_%s\s*\+" % sym, text) and not re.search(r"\(&DAT_%s\)\[" % sym, text):
        return "uint8_t"
    if cands and 4 in cands:
        return "uint32_t"
    if cands:
        return names[min(cands)]
    if re.search(r"\(&DAT_%s\)\[|&DAT_%s\s*\+" % (sym, sym), text):
        return None   # indexed, but not by a recognisable stride
    return "uint32_t"


def frame(b):
    """lay a function's stack locals back out at their frame offsets (the suffix of Ghidra's names)"""
    decl = re.compile(r"^  ((?:undefined\d?|uint|int|ushort|short|byte|char|bool|code|float10|sbyte|uint3|undefined3|"
                      r"sshort|longlong|ulonglong)) \*?(\w*Stack_([0-9a-f]+))(?: \[(\d+)\])?;\n", re.M)
    names = [(m.group(1), m.group(2), int(m.group(3), 16), m.group(4)) for m in decl.finditer(b)]
    if not names:
        return b
    size = max(off for _, _, off, _ in names) + 0x40
    b = decl.sub("", b)
    pre, post = [], []
    for t, n, off, arr in names:
        if arr:
            pre.append("#define %s ((%s*)(FR_ + 0x%x - 0x%x))" % (n, t, size, off))
        else:
            pre.append("#define %s (*(%s*)(FR_ + 0x%x - 0x%x))" % (n, t, size, off))
        post.append("#undef %s" % n)
    b = re.sub(r"\n\{\n", "\n{\n  unsigned char FR_[0x%x] = {0};\n" % (size + 0x10), b, count=1)
    return "\n".join(pre) + "\n" + b + "\n" + "\n".join(post) + "\n"


def one_line_signature(b, a):
    """the definition's signature on one line (Ghidra wraps long ones, sometimes with the return type above)"""
    m = re.search(r"FUN_00%s\(" % a, b)
    if not m:
        return b
    start = max(b.rfind("\n\n", 0, m.start()) + 2, b.rfind("*/", 0, m.start()) + 2, 0)
    j, depth = m.end(), 1
    while j < len(b) and depth:
        depth += b[j] == "("
        depth -= b[j] == ")"
        j += 1
    sig = re.sub(r"\s+", " ", b[start:j]).strip()
    return b[:start] + sig + b[j:]


def build_ref(tmp, addrs, mine, D=None, exclude=None):
    """the reference C; returns (path, external callees, {addr: reason} of functions it cannot compare, functions
    whose return value is not comparable, [(first line, last line, addr)] of each function in the file)"""
    raw = subprocess.check_output([DC] + ["0x" + a for a in addrs], text=True)
    parts = re.split(r"^// ==== ([0-9a-f]{8})$", raw, flags=re.M)
    funcs = {parts[i][2:]: parts[i + 1] for i in range(1, len(parts), 2)}
    bad = {a: "missing in the decompile cache" for a, b in funcs.items() if "// missing" in b[:40]}
    bad.update(exclude or {})
    noret = set()
    for a in list(funcs):
        funcs[a] = one_line_signature(funcs[a], a)
        for old, new in PATCHES.get(a, []):
            old, new = old.replace("ext_", "FUN_00").replace("ref_", "FUN_00"), new.replace("ext_", "FUN_00").replace("ref_", "FUN_00")
            assert old in funcs[a], (a, old)
            funcs[a] = funcs[a].replace(old, new)
    for a, b in funcs.items():
        if a in bad:
            continue
        # a call with fewer arguments than the callee takes: Ghidra dropped a push shared by two paths
        short = []
        for m in re.finditer(r"\bFUN_00([0-9a-f]{6})\(", b):
            x = m.group(1)
            if not D or x not in D or D[x][3] or x in funcs:
                continue
            j, depth = m.end(), 1
            while depth:
                depth += b[j] == "("
                depth -= b[j] == ")"
                j += 1
            n = len([y for y in split_params(b[m.end():j - 1]) if y])
            if n < len(D[x][2]):
                short.append("FUN_00%s takes %d, given %d" % (x, len(D[x][2]), n))
        if short:
            bad[a] = "Ghidra dropped call arguments (" + "; ".join(sorted(set(short))) + ")"
            continue
        for art in ("unaff_", "in_EAX", "in_ECX", "in_EDX", "extraout_", "in_stack_", "in_FS", "halt_baddata"):
            if art in b and a not in FRAMED:
                bad[a] = "Ghidra could not attach a register value (%s)" % art
        if re.search(r"\(\*\(code \*\)", b) and a not in FRAMED and a not in bad:
            bad[a] = "indirect call through a table"
    inrange = set(funcs) - set(bad)
    alltext = "".join(funcs.values())
    ext, used, roms, uused = set(), set(), set(), set()
    protos, bodies, order = [], [], []
    read = exe_reader()
    for a in sorted(inrange):
        b = funcs[a]
        order.append(a)
        b = re.sub(r"(?:FUN|func_0x)_?00([0-9a-f]{6})",
                   lambda m: ("ref_" if m.group(1) in inrange else "ext_") + m.group(1), b)
        for x in re.findall(r"ext_([0-9a-f]{6})", b):
            ext.add(x)

        # a void function that ends in a call returns that call's EAX
        if mine.get(a) and mine[a][0] != "void":
            b = re.sub(r"^void (ref_\w+)\(", r"int \1(", b, flags=re.M)
            b = re.sub(r"\n(\s*)((?:ref|ext)_\w+\([^;]*\));\n\s*return;", r"\n\1return \2;", b)
            if re.search(r"\breturn;", b) and re.match(r"\s*(?://[^\n]*\n\s*)*void ", funcs[a]):
                b = re.sub(r"\breturn;", "return 0;", b)   # EAX at a bare return is whatever came before:
                noret.add(a)                                  # only the effects are compared
        b = re.sub(r"\((?:int|uint)\)\s*&", "(long)&", b)   # Ghidra's 32-bit address arithmetic
        b = re.sub(r"\b0x(12[cd][0-9a-f]{4})\b",
                   lambda m: "EA(0x%s)" % m.group(1) if BASE <= int(m.group(1), 16) < BASE + SIZE else m.group(0), b)
        b = re.sub(r"\((?:int|uint)\)(\w+) (<|<=|!=|==|>|>=) EA\(", r"(long)\1 \2 EA(", b)   # pointer loop ends
        b = re.sub(r"(\w+)\._(\d+)_(\d+)_",
                   lambda m: "(*(uint%d_t*)((char*)&%s + %s))" % (8 * int(m.group(3)), m.group(1), m.group(2)), b)
        if a in FRAMED:
            b = FRAMED[a]
        elif "Stack_" in b:
            b = frame(b)
        # pointer parameters Ghidra typed as 32-bit ints
        for i in [i for i, p in enumerate(mine.get(a, ("", "", []))[2]) if "*" in ptype(p)]:
            def fix(m, i=i):
                ps = m.group(2).split(",")
                if i < len(ps) and "*" not in ps[i]:
                    ps[i] = "void *param_%d" % (i + 1)
                return m.group(1) + "(" + ",".join(ps) + ")"
            b = re.sub(r"^(\w[\w ]*?\**\s*ref_%s)\(([^)]*)\)" % a, fix, b, count=1, flags=re.M)
        for d in re.findall(r"DAT_(012[cd][0-9a-f]{4})", b):
            used.add(d)
        for d in re.findall(r"\b_DAT_(012[cd][0-9a-f]{4})", b):
            uused.add(d)
        for d in re.findall(r"\b((?:DAT|UNK)_00[5-9a-c][0-9a-f]{5})\b", b):
            roms.add(d)
        m = re.search(r"^(\w[\w ]*?\**)\s*(ref_\w+)\(([^)]*)\)\s*$", b, flags=re.M)
        protos.append("%s %s(%s);" % (m.group(1), m.group(2), m.group(3)))
        bodies.append(b)
    head = [GHIDRA]
    for d in sorted(used):
        a = int(d, 16)
        if BASE <= a < BASE + SIZE:
            head.append("#define DAT_%s (*(%s*)(g_mem + 0x%x))" % (d, infer_size(d, alltext), a - BASE))
    for d in sorted(uused):   # Ghidra's "_DAT_": a 4-byte view of a global another symbol also covers
        a = int(d, 16)
        if BASE <= a < BASE + SIZE:
            head.append("#define _DAT_%s (*(uint32_t*)(g_mem + 0x%x))" % (d, a - BASE))
    for r in sorted(roms):   # read-only data of the exe
        va = int(r[-8:], 16)
        data = read(va, 0x400)
        if data is None:
            continue
        head.append("static const unsigned char rom_%x[0x400] = {%s};" % (va, ",".join(str(x) for x in data)))
        t = infer_size(r[-8:], alltext) if r.startswith("DAT") else "uint8_t"
        head.append("#define %s (*(const %s*)rom_%x)" % (r, t, va))
    head += ["int ext_%s();" % x for x in sorted(ext)]
    # calls between references with a different argument count than Ghidra gave the callee (cdecl: extra arguments
    # are ignored, missing ones read as 0)
    arity = {}
    for pr in protos:
        m = re.match(r".*?(ref_\w+)\((.*)\);$", pr)
        ps = [x for x in split_params(m.group(2)) if x and x != "void"]
        arity[m.group(1)] = len(ps)

    def fixcalls(b):
        out, i = [], 0
        for m in re.finditer(r"\b(ref_[0-9a-f]{6})\(", b):
            if m.start() < i or m.group(1) not in arity:
                continue
            j, depth = m.end(), 1
            while depth:
                depth += b[j] == "("
                depth -= b[j] == ")"
                j += 1
            args = split_params(b[m.end():j - 1])
            n = arity[m.group(1)]
            args = (args + ["0"] * n)[:n]
            out.append(b[i:m.start()] + m.group(1) + "(" + ",".join(fixcalls(x) for x in args) + ")")
            i = j
        return "".join(out) + b[i:]
    bodies = [b.split("\n", 1)[0] + "\n" + fixcalls(b.split("\n", 1)[1]) if "\n" in b else b for b in bodies]
    # loops over an exe table end on its address: compare against the same place in the copy
    bases = sorted(int(r[-8:], 16) for r in roms)

    def endcmp(m):
        v = int(m.group(3), 16)
        for b0 in bases:
            if b0 <= v <= b0 + 0x400:
                return "(long)%s %s (long)(rom_%x + 0x%x)" % (m.group(1), m.group(2), b0, v - b0)
        return m.group(0)
    bodies = [re.sub(r"\(int\)(\w+) (<|<=|!=|==) 0x([5-9a-d][0-9a-f]{5})\b", endcmp, b) for b in bodies]
    path = os.path.join(tmp, "ref.c")
    text = "\n".join(head + protos) + "\n"
    spans, line = [], text.count("\n") + 1
    for a, b in zip(order, bodies):
        n = (b + "\n").count("\n")
        spans.append((line, line + n - 1, a))
        line += n
        text += b + "\n"
    open(path, "w").write(text)
    return path, ext, bad, noret, spans


# ---------------------------------------------------------------- the cases

def kind(p):
    """how the CLI fills a parameter: "i:<name>" integers from the pool of that name, or a pointer kind"""
    t, n = ptype(p), pname(p)
    if "(*" in t:
        return "pred"
    if "*" in t:
        base = t.replace("const", "").replace("*", "").strip()
        if base == "EngStats":
            return "stats_in" if "const" in t else "stats"
        if base == "EngSlot":
            return "slotptr"
        if n == "link" or base == "uint16_t":
            return "link"
        if n in ("out", "dst", "atk", "def", "stamp"):
            return "outbuf"
        if base in ("uint32_t", "int"):
            return "wordptr"
        if n == "key" and base == "void":
            return "nodeptr"
        return None
    return "i:" + n


def main():
    args = sys.argv[1:]
    boards = 300
    if "--boards" in args:
        i = args.index("--boards")
        boards = int(args[i + 1])
        del args[i:i + 2]
    names = args or [n for n in os.environ.get("YO2_RULES_FILES", "").split(",") if n] or DEFAULT_FILES
    files = [os.path.join(SRC, "duel", n) for n in names]
    for f in files:
        subprocess.check_call(["i686-w64-mingw32-g++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-fsyntax-only",
                               "-I", SRC, f])
    mk = {a: v for a, v in markers(files).items() if a not in SKIP}
    D = decls()
    skipped = {}
    for a, (ret, name, params, _) in list(mk.items()):
        if "*" in ret:
            skipped[a] = "returns a pointer"
        elif any(kind(p) is None for p in params):
            skipped[a] = "a parameter the CLI cannot fill (%s)" % ", ".join(p for p in params if kind(p) is None)
    keep = os.environ.get("YO2_KEEP")
    with tempfile.TemporaryDirectory() as tmp:
        if keep:
            tmp = keep
            os.makedirs(tmp, exist_ok=True)
        exclude = {}
        obj = os.path.join(tmp, "ref.o")
        for attempt in range(12):   # functions whose decompile is not valid C are left out, one round at a time
            ref, ext, bad, noret, spans = build_ref(tmp, sorted(mk), mk, D, exclude)
            r = subprocess.run(["cc", "-x", "c", "-std=gnu99", "-w", "-O1", "-c", ref, "-o", obj],
                               capture_output=True, text=True)
            if not r.returncode:
                break
            found = False
            for m in re.finditer(r"ref\.c:(\d+):\d+: error: ([^\n]*)", r.stderr):
                ln = int(m.group(1))
                for lo, hi, a in spans:
                    if lo <= ln <= hi and a not in exclude:
                        exclude[a] = "its decompile is not valid C (%s)" % m.group(2)[:80]
                        found = True
            if not found:
                raise SystemExit("the reference does not compile:\n" + r.stderr[-4000:])
        else:
            raise SystemExit("the reference does not compile:\n" + r.stderr[-4000:])
        skipped.update(bad)
        tested = {a: v for a, v in mk.items() if a not in skipped}
        inc = ["#define H(...) stubHash(__VA_ARGS__)",
               "static bool g_trace = getenv(\"YO2_STUBTRACE\") != nullptr;",
               "#define TR(...) do { if (g_trace) fprintf(stderr, __VA_ARGS__); } while (0)"]
        defines = []
        stubs = {x: v for x, v in STUBS.items() if x not in D or D[x][3]}   # only while still placeholders
        for x in sorted(stubs):
            inc.append(stubs[x])
            defines.append("-Deng_%s(...)=stub_%s(__VA_ARGS__)" % (x, x))
        for x in sorted(ext):
            if x in stubs:
                sig = re.match(r"(\w+) stub_\w+\(([^)]*)\)", stubs[x])
                ps = [p.strip() for p in sig.group(2).split(",") if p.strip()]
                cps = ["%s a%d" % ("void*" if "*" in p else "int", i) for i, p in enumerate(ps)]
                call = "stub_%s(%s)" % (x, ", ".join("a%d" % i for i in range(len(ps))))
                inc.append('extern "C" int ext_%s(%s) { %s; }' % (
                    x, ", ".join(cps), ("return " + call) if sig.group(1) != "void" else call + "; return 0"))
                continue
            if x not in D or D[x][3]:
                inc.append('extern "C" int ext_%s() { return 0; }   // a placeholder: 0 on both sides' % x)
                continue
            ret, name, types, _ = D[x]
            cps, cargs = [], []
            for i, t in enumerate(types):
                cps.append(("void* a%d" if "*" in t else "int a%d") % i)
                cargs.append("(%s)a%d" % (t, i))
            call = "%s(%s)" % (name, ", ".join(cargs))
            if "*" in ret:
                body = "return (int)(long)%s" % call
            elif ret == "void":
                body = call + "; return 0"
            else:
                body = "return (int)" + call
            inc.append('extern "C" int ext_%s(%s) { %s; }' % (x, ", ".join(cps), body))
        H = open(os.path.join(SRC, "duel", "EngineInternal.h")).read()
        for x in sorted(set(re.findall(r"^int eng_([0-9a-f]{6})\(\.\.\.\);", H, flags=re.M)) - set(stubs)):
            inc.append("int eng_%s(...) { return 0; }" % x)
        # thunks: my function and the reference with the same arguments
        src = open(ref).read()
        rw, cases = [], []
        for a, (ret, name, params, fname) in sorted(tested.items()):
            m = re.search(r"^(\w[\w ]*?\**)\s*ref_%s\(([^)]*)\)\s*$" % a, src, flags=re.M)
            gps = [x.strip() for x in m.group(2).split(",") if x.strip() and x.strip() != "void"]
            diff = [i for i in range(min(len(gps), len(params)))
                    if ("*" in gps[i]) != ("*" in ptype(params[i]) or "(*" in params[i])]
            if diff:
                skipped[a] = "the signatures differ (parameter %d: %s in the exe, %s here)" % (
                    diff[0] + 1, gps[diff[0]], params[diff[0]])
                continue
            kinds = [kind(p) for p in params]
            margs, rargs, rps = [], [], []
            for i, (p, k) in enumerate(zip(params, kinds)):
                t = ptype(p)
                if k.startswith("i:"):
                    margs.append("(%s)v[%d]" % (t.replace("const ", ""), i))
                    rargs.append("(int)v[%d]" % i)
                    rps.append("int a%d" % i)
                else:
                    margs.append("(%s)pm[%d]" % (t, i))
                    rargs.append("(void*)pr[%d]" % i)
                    rps.append("void* a%d" % i)
            gret = m.group(1).strip()
            call = "ref_%s(%s)" % (a, ", ".join("a%d" % i if i < len(params) else "0" for i in range(len(gps))))
            rw.append("int refw_%s(%s) { %s; }" % (a, ", ".join(rps) or "void",
                                                     (call + "; return 0") if gret == "void" or ret == "void" or a in noret
                                                     else "return (int)" + call))
            inc.append('extern "C" int refw_%s(%s);' % (a, ", ".join(rps)))
            inc.append("%s %s(%s);" % (ret, name, ", ".join(params)))
            mcall = "%s(%s)" % (name, ", ".join(margs))
            mbody = (mcall + "; return 0L") if ret == "void" or a in noret else "return (long)(int)" + mcall
            cases.append('    {"%s", 0x%s, {%s}, %d, [](const long* v, void* const* pm) { (void)v; (void)pm; %s; },'
                         ' [](const long* v, void* const* pr) { (void)v; (void)pr; return (long)refw_%s(%s); }},' % (
                             name, a, ", ".join('"%s"' % k for k in kinds) or "nullptr", len(params), mbody, a,
                             ", ".join(rargs)))
        open(ref, "a").write("\n".join(rw) + "\n")
        inc.append("static const Case kCases[] = {\n%s\n};" % "\n".join(cases))
        consts = sorted({int(c, 16) for c in re.findall(r"\b0x(1[0-9a-f]{3}|e[0-9a-f]{2}|f[0-9a-f]{2})\b", src)
                         if 0xe00 <= int(c, 16) < 0x2000})
        inc.append("static const int kConsts[] = {%s};" % ", ".join("0x%x" % c for c in consts or [0x1000]))
        open(os.path.join(tmp, "duel_rules_cases.inc"), "w").write("\n".join(inc) + "\n")
        r = subprocess.run(["cc", "-x", "c", "-std=gnu99", "-w", "-O1", "-c", ref, "-o", obj], capture_output=True,
                           text=True)
        if r.returncode:
            raise SystemExit("the reference does not compile:\n" + r.stderr[-4000:])
        exe = os.path.join(tmp, "duel_rules_cli")
        flags = ["-std=c++17", "-O1", "-g", "-w", "-fsanitize=address,undefined", "-fno-sanitize-recover=all",
                 "-fno-sanitize=bounds", "-I", SRC, "-I", tmp, *defines, "-include",
                 os.path.join(HERE, "duel_rules_stubs.h")]
        objs = [obj]
        # the engine and Net files one by one: one another session is still writing may not compile; it is left out
        for f in [os.path.join(HERE, "duel_rules_cli.cpp")] + sorted(glob.glob(os.path.join(SRC, "duel", "*.cpp"))) + \
                sorted(glob.glob(os.path.join(SRC, "Net", "*.cpp"))):
            o = os.path.join(tmp, "o_" + os.path.basename(f) + ".o")
            r = subprocess.run(["c++", *flags, "-c", f, "-o", o], capture_output=True, text=True)
            if r.returncode:
                if f in files or f.endswith("duel_rules_cli.cpp"):
                    raise SystemExit(r.stderr[-3000:])
                print("note: %s does not compile right now, left out" % os.path.relpath(f, SRC))
                continue
            objs.append(o)
        subprocess.check_call(["c++", "-fsanitize=address,undefined", *objs, "-o", exe,
                               "-Wl,-undefined,dynamic_lookup", "-Wl,-dead_strip"])
        r = run_capped([exe, CARDS, str(boards)], timeout=1800)
    out = r.stdout.splitlines()
    badl = [l for l in out if l.startswith("bad ")]
    for a in sorted(skipped):
        print("not compared: %s 0x00%s: %s" % (mk[a][1], a, skipped[a]))
    if r.returncode or badl:
        print("\n".join(badl[:200]))
        print(r.stderr[-3000:])
        raise SystemExit(1)
    oks = [l for l in out if l.startswith("ok ")]
    tested = {a: v for a, v in tested.items() if a not in skipped}
    assert len(oks) == len(tested), (len(oks), len(tested))
    calls = sum(int(l.split()[2]) for l in oks)
    hits = sum(int(l.split()[3]) for l in oks)
    print(f"ok: {len(tested)} functions of {', '.join(names)} equal the decompiled originals on {boards} boards, "
          f"{calls:,} calls ({hits:,} with a non-zero result): return values, the engine block and the output "
          f"buffers after each call")


if __name__ == "__main__":
    main()
