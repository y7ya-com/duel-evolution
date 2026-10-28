"""Code islands in .text not covered by any Ghidra function (unreferenced functions in incremental-link padding)."""
import struct, sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from yo import *
b=open(D+'yo2.exe','rb').read()
pe=struct.unpack_from('<I',b,0x3c)[0]; nsec=struct.unpack_from('<H',b,pe+6)[0]; opt=struct.unpack_from('<H',b,pe+20)[0]; base=struct.unpack_from('<I',b,pe+24+28)[0]
secs=[(b[pe+24+opt+i*40:pe+32+opt+i*40].rstrip(b'\0'),)+struct.unpack_from('<IIII',b,pe+32+opt+i*40) for i in range(nsec)]
def va2off(v):
    for n,vsz,va,rsz,raw in secs:
        if base+va<=v<base+va+rsz: return raw+v-base-va
def islands(lo, hi):
    cov = bytearray(hi - lo)
    for a, f in F.items():
        if lo <= a < hi:
            for k in range(a - lo, min(hi - lo, a - lo + max(f['size'], 1))): cov[k] = 1
    o0 = va2off(lo); out = []; i = 0
    while i < hi - lo:
        c = b[o0 + i]
        if not cov[i] and c not in (0xcc, 0x90):
            j = i
            while j < hi - lo and not cov[j] and not (b[o0 + j] == 0xcc and b[o0 + j + 1] == 0xcc): j += 1
            # trim trailing nops
            k = j
            while k > i and b[o0 + k - 1] == 0x90: k -= 1
            out.append((lo + i, k - i))
            i = j
        else:
            i += 1
    return out
if __name__ == '__main__':
    isl = islands(0x423000, 0x585000)
    print(len(isl), sum(n for _, n in isl))
    json.dump(isl, open(os.path.dirname(__file__) + '/islands.json', 'w'))
    for a, n in isl[:30]: print(hex(a), n, b[va2off(a):va2off(a)+min(n,16)].hex())
