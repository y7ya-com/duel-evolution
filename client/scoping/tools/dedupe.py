"""Count duplicate function bodies (template instances) in game code: hash each body with rel32 call/jmp targets
and absolute image addresses masked. Usage: python3 -I dedupe.py <dir with yo2.exe and labels.tsv>"""
import collections, hashlib, struct, sys

R = sys.argv[1]
b = open(f"{R}/yo2.exe", "rb").read()
pe = struct.unpack_from("<I", b, 0x3c)[0]
opt = struct.unpack_from("<H", b, pe + 20)[0]
base = struct.unpack_from("<I", b, pe + 24 + 28)[0]
vsz, va, rsz, raw = struct.unpack_from("<IIII", b, pe + 32 + opt)


def masked(a, n):
    c = bytearray(b[raw + a - base - va:raw + a - base - va + n])
    i = 0
    while i < len(c) - 4:
        if c[i] in (0xE8, 0xE9):
            c[i + 1:i + 5] = bytes(4)
            i += 5
        elif 0x400000 <= struct.unpack_from("<I", c, i)[0] < 0x1400000:
            c[i:i + 4] = bytes(4)
            i += 4
        else:
            i += 1
    return bytes(c)


game = [(int(r[0], 16), int(r[1])) for r in (l.split("\t") for l in open(f"{R}/labels.tsv")) if r[2] in ("game", "unlabeled")]
groups = collections.defaultdict(list)
for a, n in game:
    groups[hashlib.sha1(masked(a, n)).digest()].append(n)
first = [g[0] for g in groups.values()]
print(f"game functions {len(game)}, unique bodies {len(groups)}, unique bytes {sum(first) / 1024:.0f} KB")
for lo, hi in [(0, 32), (32, 128), (128, 512), (512, 2048), (2048, 8192), (8192, 1 << 30)]:
    print(f"  {lo:5d}-{hi:<10d} {sum(lo <= s < hi for s in first):6d} funcs {sum(s for s in first if lo <= s < hi) / 1024:7.0f} KB")
