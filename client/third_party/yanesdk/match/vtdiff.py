import sys,json; sys.path.insert(0,'.')
from yo import *
import hdr,anchors
C=hdr.parse_classes(WT,anchors.DEFS)
V=json.load(open('vt2.json'))
P={int(p['a'],16):p for p in json.load(open('match.json'))['pairs']}
for cn in sys.argv[1:]:
    mine=hdr.vtables(C,cn) or []
    for t,(off,va,tg) in zip(mine+[[]]*5,sorted(V[cn])):
        print('==',cn,'off',off,'src',len(t),'exe',len(tg))
        for k in range(max(len(t),len(tg))):
            s=t[k] if k<len(t) else None
            a=res(tg[k]) if k<len(tg) else None
            m=P.get(a) if a else None
            print(f"  {k:2d} {(s['cls']+'::'+s['name']+'('+s['sig']+')') if s else '-':55s} {hex(a) if a else '-':10s} {F[a]['size'] if a in F else '':5} {m['name'] if m else ''}")
