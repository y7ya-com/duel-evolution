"""Classify every function of yo2.exe as library vs game code, and map game code to original source dirs.

Anchors (strong evidence on single functions) are spread to unlabeled neighbours, because the MSVC linker emits one
object file's functions contiguously: an unlabeled run between two functions with the same label gets that label.
Usage: python3 -I classify.py <dir with functions.jsonl, yane_classes.txt, yolauncher_funcs.txt>
"""
import collections
import json
import re
import sys

R = sys.argv[1]
allf = [json.loads(l) for l in open(f"{R}/functions2.jsonl" if __import__("os").path.exists(f"{R}/functions2.jsonl") else f"{R}/functions.jsonl")]
allf = [f for f in allf if not f["a"].startswith("EXTERNAL")]
stubs = [f for f in allf if f["thunk"] or re.match(r"(Unwind|Catch)@", f["name"])]
funcs = [f for f in allf if not (f["thunk"] or re.match(r"(Unwind|Catch)@", f["name"]))]
print(f"all {len(allf)}: compiler stubs/thunks {len(stubs)} ({sum(f['size'] for f in stubs) / 1024:.0f} KB), real functions {len(funcs)}")
owners = collections.defaultdict(set)
for line in open(f"{R}/vtables.tsv"):
    cls, a = line.split()
    owners[a.lower()].add(cls)
funcs.sort(key=lambda f: int(f["a"], 16))
yane = set(open(f"{R}/yane_classes.txt").read().split())

STRING_RULES = [   # (label, regex over referenced strings), first match wins
    ("yaneSDK", re.compile(r"\\yaneSDK\\", re.I)),
    ("game", re.compile(r"\\client\\src\\", re.I)),
    ("libpng", re.compile(r"libpng|png_|IHDR|PLTE|tRNS|Invalid (bit depth|color type)|CRC error", re.I)),
    ("libjpeg", re.compile(r"JPEG|Huffman|quantization table|Bogus (marker|DQT|DHT)|Corrupt JPEG|SOF|DCT", re.I)),
    ("zlib", re.compile(r"incorrect header check|invalid (stored block|distance|literal|bit length)|oversubscribed|deflate|inflate", re.I)),
    ("D3DX", re.compile(r"D3DX", re.I)),
    ("CRT", re.compile(r"runtime error|R60\d\d|Microsoft Visual C\+\+|MSVCRT|_setmbcp|__GLOBAL_HEAP|SunMonTue|JanFebMar|1#(INF|QNAN|IND|SNAN)|CorExitProcess|__MSVCRT_HEAP", re.I)),
]


def anchor(f):
    ns, name = f["ns"], f["name"]
    own = owners.get(f["a"].lower().lstrip("0").rjust(8, "0"), set())
    if own:
        if any(c.split("@")[0] in yane or c in yane for c in own):
            return "yaneSDK"
        if any("std" in c for c in own):
            return "STL"
        if any("mtkn" in c.lower() for c in own):
            return "mtknLib"
        return "game"
    head = ns.split("::")[0]
    if ns.startswith("std") or "std::" in ns:
        return "STL"
    if head in yane or ns.split("::")[-1] in yane:
        return "yaneSDK"
    if "mtkn" in ns.lower():
        return "mtknLib"
    if head.startswith("CSwf") or ns.startswith("Swf"):
        return "swf"
    for label, rx in STRING_RULES:
        if any(rx.search(s) for s in f["strings"]):
            return label
    if not name.startswith("FUN_") and re.match(r"_+[a-z]", name):   # Ghidra/FID library names like __aulldiv, _memcpy
        return "CRT"
    if ns not in ("Global", "") and ns != "<EXTERNAL>":
        return "game"            # an RTTI class that is not yaneSDK/std: the game's own class
    return None


labels = [anchor(f) for f in funcs]
# range evidence (see SCOPING.md): A = yaneSDK non-virtual code (92% of its strings verbatim in yaneSDK v2 source);
# everything from the first CRT object to the end of .text is third-party (CRT, Dinkumware STL, libpng 1.0.5/1.2.10,
# libjpeg, zlib, D3DX), unless a function carries a game anchor
LIB_TAIL = 0xb06860
tail_game = 0
for i, f in enumerate(funcs):
    a = int(f["a"], 16)
    if 0x44b5c0 <= a <= 0x584ea0 and labels[i] is None:
        labels[i] = "yaneSDK"
    if a >= LIB_TAIL:
        if labels[i] == "game":
            tail_game += 1
        elif labels[i] is None:
            labels[i] = "3rd-party"
print("game anchors inside the library tail:", tail_game)
anchored = sum(l is not None for l in labels)
# fill: unlabeled run between equal labels takes that label
i = 0
while i < len(funcs):
    if labels[i] is None:
        j = i
        while j < len(funcs) and labels[j] is None:
            j += 1
        left = labels[i - 1] if i > 0 else None
        right = labels[j] if j < len(funcs) else None
        if left is not None and left == right:
            for k in range(i, j):
                labels[k] = left
        i = j
    else:
        i += 1
labels = [l or "unlabeled" for l in labels]

tot = collections.Counter()
size = collections.Counter()
for f, l in zip(funcs, labels):
    tot[l] += 1
    size[l] += f["size"]
print(f"functions (non-thunk): {len(funcs)}, anchored directly: {anchored}")
print(f"{'label':12s} {'funcs':>7s} {'KB':>8s}")
for l, n in tot.most_common():
    print(f"{l:12s} {n:7d} {size[l] / 1024:8.0f}")

# contiguous blocks, to see where libraries sit
print("\nblocks (label, first, last, funcs):")
blocks = []
for f, l in zip(funcs, labels):
    if blocks and blocks[-1][0] == l:
        blocks[-1][2] = f["a"]
        blocks[-1][3] += 1
    else:
        blocks.append([l, f["a"], f["a"], 1])
for b in blocks:
    if b[3] >= 25:
        print("  ", b)

# game code by original source dir (functions that reference a client\src path, spread over their runs)
src = [None] * len(funcs)
for i, f in enumerate(funcs):
    for s in f["strings"]:
        m = re.search(r"\\client\\src\\(.+)\\[^\\]+\.(cpp|h)", s, re.I)
        if m:
            src[i] = m.group(1).split("\\")[0]
            break
cur = None
for i in range(len(funcs)):       # forward-fill within game-labeled stretches
    if labels[i] != "game":
        cur = None
        continue
    if src[i]:
        cur = src[i]
    elif cur:
        src[i] = cur
bydir = collections.Counter(src[i] or "(unattributed)" for i in range(len(funcs)) if labels[i] == "game")
print("\ngame functions by source dir (forward-filled; approximate):")
for d, n in bydir.most_common(25):
    print(f"  {n:6d}  {d}")

# size distribution of game + unlabeled (the code to rewrite)
work = [f["size"] for f, l in zip(funcs, labels) if l in ("game", "unlabeled", "swf", "mtknLib")]
buckets = [(0, 32), (32, 128), (128, 512), (512, 2048), (2048, 8192), (8192, 10**9)]
print("\nto-rewrite size buckets (bytes):")
for lo, hi in buckets:
    n = sum(lo <= s < hi for s in work)
    print(f"  {lo:5d}-{hi if hi < 10**9 else '∞':>5}: {n:6d} funcs, {sum(s for s in work if lo <= s < hi) / 1024:7.0f} KB")

known = set(x.lower().replace("fun_", "") for x in open(f"{R}/yolauncher_funcs.txt").read().split())
addr_label = {f["a"].lower().lstrip("0"): l for f, l in zip(funcs, labels)}
kl = collections.Counter(addr_label.get(k.lstrip("0"), "not-a-function-start") for k in known)
print("\nYOLaucher-documented functions by label:", dict(kl))

with open(f"{R}/labels.tsv", "w") as w:
    for f, l, s in zip(funcs, labels, src):
        w.write(f"{f['a']}\t{f['size']}\t{l}\t{s or ''}\t{f['ns']}::{f['name']}\n")
