"""Everything known about one yo2.exe function, from the shared cache (no Ghidra run).

    python3 -I tools/decomp.py 0x689ea0          # metadata + cached decompiled C
    python3 -I tools/decomp.py --class CDuelScene  # functions in a class's vtable(s)
"""
import json
import os
import sys

DATA = os.environ.get("YO2_DATA", "/Users/y/Documents/GitHub/yo2-decomp-data")


def load():
    funcs = {}
    for line in open(os.path.join(DATA, "functions2.jsonl")):
        f = json.loads(line)
        if not f["a"].startswith("EXT"):
            funcs[int(f["a"], 16)] = f
    labels = {}
    for line in open(os.path.join(DATA, "labels.tsv")):
        a, size, label, srcdir, name = line.rstrip("\n").split("\t")
        labels[int(a, 16)] = (label, srcdir)
    owners = {}
    for line in open(os.path.join(DATA, "vtables.tsv")):
        cls, a = line.split()
        owners.setdefault(int(a, 16), set()).add(cls)
    return funcs, labels, owners


def show(a, funcs, labels, owners):
    f = funcs.get(a)
    if not f:
        print(f"no function starts at {a:#x}")
        return
    label, srcdir = labels.get(a, ("stub/thunk", ""))
    name = lambda x: funcs[int(x, 16)]["name"] if int(x, 16) in funcs else x
    print(f"{a:#010x} {f['ns']}::{f['name']}  {f['size']} B  label={label} srcdir={srcdir or '?'}")
    print(f"  vtable owners: {sorted(owners.get(a, [])) or '-'}   callers: {f['callers']}")
    print(f"  callees: {', '.join(name(c) + '@' + c for c in f['callees'][:30])}")
    print(f"  strings: {f['strings']}")
    path = os.path.join(DATA, "decompiled", f"{a:08x}.c")
    print(open(path).read() if os.path.exists(path) else "  (not in decompiled cache yet)")


def main():
    funcs, labels, owners = load()
    if sys.argv[1] == "--class":
        for a in sorted(x for x, cs in owners.items() if sys.argv[2] in cs):
            f = funcs.get(a)
            print(f"{a:#010x} {f['size'] if f else '?':>6} {f['name'] if f else ''}")
        return
    for arg in sys.argv[1:]:
        show(int(arg, 16), funcs, labels, owners)


if __name__ == "__main__":
    main()
