"""vtables with COL offset: writes vt2.json {class: [[offset, vtable_va, [targets]]...]}"""
import collections, json, re, struct
import os
R=os.environ.get('YO2_DATA', '/Users/y/Documents/GitHub/yo2-decomp-data')
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
        if raw <= o < raw + rsz: return base + va + o - raw
tds = {off2va(m.start()) - 8: m.group(0)[4:-3].decode() for m in re.finditer(rb"\.\?A[VU][A-Za-z0-9_@?$]+@@\0", b)}
idx = collections.defaultdict(list)
for n, vsz, va, rsz, raw in secs:
    if n in (".rdata", ".data"):
        for o in range(raw, raw + rsz - 3, 4):
            idx[struct.unpack_from("<I", b, o)[0]].append(o)
cols = {}
for td, name in tds.items():
    for o in idx.get(td, []):
        if struct.unpack_from("<I", b, o - 12)[0] == 0:
            cols[off2va(o - 12)] = (name, struct.unpack_from("<I", b, o - 8)[0])
out = collections.defaultdict(list)
for col, (name, off) in cols.items():
    for o in idx.get(col, []):
        t = []
        for k in range(400):
            v = struct.unpack_from("<I", b, o + 4 + 4 * k)[0]
            if not (tlo <= v < thi) or (k and (v in cols)): break
            # stop if next slot is itself a COL pointer of another vtable (o+4+4k is a vtable[-1])
            if k and off2va(o + 4 + 4 * k) - 0 in []: break
            t.append(v)
        out[name].append([off, off2va(o + 4), t])
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vt2.json'), 'w'))
