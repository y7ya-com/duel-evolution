"""show.py <Class::Func | 0xADDR> ... : source text of the matched v1.65 function (current worktree copy) + exe decompilation.
Match data is a snapshot (match.json); functions are looked up by name+signature, so edits don't break it."""
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from yo import *
import src as S, hdr, anchors
P = json.load(open(os.path.dirname(os.path.abspath(__file__)) + '/match.json'))['pairs']
def src_text(p):
    for f in S.parse(WT + '/' + p['file'], anchors.DEFS):
        if f['name'] == p['name'] and hdr.norm_params(f['params']) == p['sig']: return f['text']
    return '(source function not found by name+sig; it may have been edited)'
for q in sys.argv[1:]:
    hit = False
    for p in P:
        if q == p['name'] or (q.startswith('0x') and int(q, 16) == int(p['a'], 16)):
            hit = True
            print(f"===== {p['file']} {p['name']}({p['sig']}) -> 0x{p['a']} size {p['size']} conf {p['conf']}")
            print(src_text(p)); print('----- exe 0x' + p['a']); print(dec(int(p['a'], 16)))
    if not hit and q.startswith('0x'):
        a = int(q, 16)
        print(f'===== 0x{a:08x} (no source match) size {F.get(a, {}).get("size")}'); print(dec(a))
    elif not hit:
        print('no match for', q)
