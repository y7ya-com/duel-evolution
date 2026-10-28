"""Decompilation progress: which yo2.exe functions have a reimplementation, by `// @yo2 0xADDR` markers in the tree.

    python3 -I tools/coverage.py [--missing <srcdir> | --assigned <owner>]
"""
import collections
import glob
import os
import re
import sys

DATA = os.environ.get("YO2_DATA", os.path.expanduser("~") + "/Documents/GitHub/yo2-decomp-data")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
MARK = re.compile(r"@yo2\s+0x([0-9a-fA-F]+)")


def main():
    done = set()
    for d in ("src", "third_party", "platform", "include"):
        for root, _, files in os.walk(os.path.join(ROOT, d)):
            for n in files:
                if n.endswith((".cpp", ".c", ".h", ".hpp", ".inl")):
                    done.update(int(m, 16) for m in MARK.findall(open(os.path.join(root, n), errors="ignore").read()))
    if len(sys.argv) > 2 and sys.argv[1] == "--assigned":   # unfinished functions in ASSIGNMENTS.tsv for an owner
        for elsewhere in [os.path.join(ROOT, "DONE_ELSEWHERE.txt")] + glob.glob(os.path.join(ROOT, "src", "*", "REIMPLEMENTED.txt")):
            done |= {int(l.split()[0], 16) for l in open(elsewhere) if l.strip() and not l.startswith("#")}
        spans = [l.split("\t") for l in open(os.path.join(ROOT, "ASSIGNMENTS.tsv")) if not l.startswith("#")]
        spans = [(int(lo, 16), int(hi, 16), folder) for lo, hi, folder, owner, *_ in spans if owner == sys.argv[2]]
        mine = lambda a, src: any(lo <= a <= hi and f in ("*", src) for lo, hi, f in spans)
        wo = os.path.join(DATA, "trace", "WORKORDER.tsv")
        if os.path.exists(wo):   # README Scope: core rows only, in work-order order
            for r in list(open(wo))[1:]:
                seq, a, layer, via, core, phase, src, size, smp, status, name, *_ = r.rstrip("\n").split("\t")
                if core == "core" and status == "todo" and int(a, 16) not in done and mine(int(a, 16), src):
                    print(f"0x{a} {int(size):6d} {src} L{layer} {phase.split()[1]} {name}")
            return
        for line in open(os.path.join(DATA, "labels.tsv")):
            a, size, label, srcdir, name = line.rstrip("\n").split("\t")
            a = int(a, 16)
            if label in ("game", "unlabeled") and a not in done and mine(a, srcdir or "?"):
                print(f"{a:#010x} {int(size):6d} {srcdir or '?'} {name}")
        return
    total, hit = collections.Counter(), collections.Counter()
    tb, hb = collections.Counter(), collections.Counter()
    missing = []
    for line in open(os.path.join(DATA, "labels.tsv")):
        a, size, label, srcdir, name = line.rstrip("\n").split("\t")
        a, size = int(a, 16), int(size)
        key = label if label != "game" else f"game/{srcdir or '?'}"
        total[key] += 1
        tb[key] += size
        if a in done:
            hit[key] += 1
            hb[key] += size
        elif len(sys.argv) > 2 and sys.argv[1] == "--missing" and srcdir == sys.argv[2]:
            missing.append((a, size, name))
    if missing:
        for a, size, name in missing:
            print(f"{a:#010x} {size:6d} {name}")
        return
    print(f"{'part':22s} {'funcs':>13s} {'bytes':>9s}")
    for k in sorted(total, key=lambda k: -tb[k]):
        print(f"{k:22s} {hit[k]:5d}/{total[k]:<6d} {100 * hb[k] / tb[k]:7.1f}%")
    g = [k for k in total if k.startswith("game") or k == "unlabeled"]
    print(f"\nGAME CODE: {sum(hit[k] for k in g)}/{sum(total[k] for k in g)} functions, "
          f"{100 * sum(hb[k] for k in g) / sum(tb[k] for k in g):.2f}% of bytes")


if __name__ == "__main__":
    main()
