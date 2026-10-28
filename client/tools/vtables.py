"""Recover vtables from MSVC RTTI (TypeDescriptor <- CompleteObjectLocator <- vtable[-1]) and list virtual targets
Ghidra did not turn into functions. Usage: python3 -I vtables.py <dir with yo2.exe and functions.jsonl>
Writes vtables.tsv (class<TAB>target) and missing_virtuals.txt (feed to CreateFunctions.java)."""
import collections, json, re, struct, sys

R = sys.argv[1]
b = open(f"{R}/yo2.exe", "rb").read()
pe = struct.unpack_from("<I", b, 0x3c)[0]
nsec = struct.unpack_from("<H", b, pe + 6)[0]
opt = struct.unpack_from("<H", b, pe + 20)[0]
base = struct.unpack_from("<I", b, pe + 24 + 28)[0]
secs = [(b[pe + 24 + opt + i * 40:pe + 32 + opt + i * 40].rstrip(b"\0").decode(),) + struct.unpack_from("<IIII", b, pe + 32 + opt + i * 40) for i in range(nsec)]
text = next(s for s in secs if s[0] == ".text")
tlo, thi = base + text[2], base + text[2] + text[1]


def off2va(o):
    for n, vsz, va, rsz, raw in secs:
        if raw <= o < raw + rsz:
            return base + va + o - raw


starts = {int(json.loads(l)["a"], 16) for l in open(f"{R}/functions.jsonl") if not json.loads(l)["a"].startswith("EXT")}
tds = {off2va(m.start()) - 8: m.group(0)[4:-3].decode() for m in re.finditer(rb"\.\?A[VU][A-Za-z0-9_@?$]+@@\0", b)}
idx = collections.defaultdict(list)
for n, vsz, va, rsz, raw in secs:
    if n in (".rdata", ".data"):
        for o in range(raw, raw + rsz - 3, 4):
            idx[struct.unpack_from("<I", b, o)[0]].append(o)
cols = {off2va(o - 12): name for td, name in tds.items() for o in idx.get(td, []) if struct.unpack_from("<I", b, o - 12)[0] == 0}
rows, missing = [], set()
for col, name in cols.items():
    for o in idx.get(col, []):
        for k in range(400):
            v = struct.unpack_from("<I", b, o + 4 + 4 * k)[0]
            if not (tlo <= v < thi) or (k and v in cols):
                break
            rows.append((name, v))
            if v not in starts:
                missing.add(v)
with open(f"{R}/vtables.tsv", "w") as w:
    w.writelines(f"{n}\t{v:08x}\n" for n, v in rows)
open(f"{R}/missing_virtuals.txt", "w").write("\n".join(f"{v:08x}" for v in sorted(missing)))
print(f"classes with vtables {len({r[0] for r in rows})}, slots {len(rows)}, targets {len({r[1] for r in rows})}, new {len(missing)}")
