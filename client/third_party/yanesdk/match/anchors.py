"""Vtable-slot anchors: exe address -> source identity (cls, name, sig), from header vtable layouts that match the exe."""
import sys, os, json, re, collections
sys.path.insert(0, os.path.dirname(__file__))
from yo import *
import hdr, src as S

KONAMI_OFF = {'USE_DirectDraw', 'USE_SAVER', 'USE_MovieDS', 'USE_MovieAVI', 'USE_MIDIOutputMCI', 'USE_MIDIOutputDM', 'USE_YANE_NEWDELETE'}
DEFS = set(S.DEFS) - KONAMI_OFF
PURE = 0xb09662
DELETE = 0xb08e6d


def real_dtor(a):
    """a is a scalar/vector deleting dtor -> address of the real dtor it calls (or None)"""
    t = dec(a) or ''
    if not re.search(r'& [12]\) != 0', t): return None
    cs = [res(int(c, 16)) for c in F[a]['callees'] if not c.startswith('EXT')]
    cs = [c for c in cs if c != DELETE and c < 0xb00000]
    return cs[0] if len(cs) == 1 else None


def is_deleting(a):
    t = dec(a) or ''
    return bool(re.search(r'& [12]\) != 0', t)) and any(res(int(c, 16)) == DELETE for c in F[a]['callees'] if not c.startswith('EXT'))


def build(root=WT):
    C = hdr.parse_classes(root, DEFS)
    V = json.load(open(os.path.dirname(__file__) + '/vt2.json'))
    cache = {}
    anc = collections.defaultdict(set)
    good = []
    for cn, vts in V.items():
        if '@' in cn or cn not in C: continue
        mine = hdr.vtables(C, cn, cache) or []
        ex = sorted(vts)
        if [len(t) for t in mine] != [len(x[2]) for x in ex]: continue
        good.append(cn)
        for t, (off, va, tg) in zip(mine, ex):
            for s, a in zip(t, tg):
                a = res(a)
                if a == PURE: continue
                ident = (s['cls'], s['name'], s['sig'], s.get('const', False), bool(s.get('inline')))
                if s['name'].startswith('~'):
                    anc[a].add(('??_G',) + ident)
                    d = real_dtor(a)
                    if d: anc[d].add(ident)
                else:
                    anc[a].add(ident)
    out = {}
    for a, ids in anc.items():
        if len(ids) == 1:
            out[a] = next(iter(ids))
        else:
            # same function inherited: identical (cls,name,sig) is fine; conflicting -> drop
            k = {i[:4] for i in ids}
            if len(k) == 1: out[a] = next(iter(ids))
    return out, good, C


if __name__ == '__main__':
    out, good, C = build()
    print(len(good), 'classes;', len(out), 'anchored exe fns;', sum(1 for v in out.values() if v[0] == '??_G'), 'deleting dtors')
    for a in sorted(out)[:30]: print(hex(a), out[a])
