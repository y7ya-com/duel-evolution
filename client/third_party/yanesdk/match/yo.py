import json,re,collections
import os as _o0; WT=_o0.environ.get('YANE_WT', _o0.path.join(_o0.path.dirname(_o0.path.abspath(__file__)), '..'))
D=_o0.environ.get('YO2_DATA', '/Users/y/Documents/GitHub/yo2-decomp-data') + '/'
F={}
for l in open(D+'functions2.jsonl'):
    j=json.loads(l)
    if j['a'].startswith('EXT'): continue
    F[int(j['a'],16)]=j
TH={}
for a,f in F.items():
    m=re.match(r'thunk_FUN_([0-9a-f]+)$',f['name'])
    if f['thunk'] and m: TH[a]=int(m.group(1),16)
def res(a): return TH.get(a,a)
LAB={}
for l in open(D+'labels.tsv'):
    p=l.rstrip('\n').split('\t'); LAB[int(p[0],16)]=p[2]
VT=collections.defaultdict(list)
for l in open(D+'vtables.tsv'):
    c,a=l.split(); VT[c].append(res(int(a,16)))
def dec(a):
    try: return open(D+'decompiled/%08x.c'%a,encoding='utf-8',errors='replace').read()
    except FileNotFoundError: return None
REAL=sorted(a for a,f in F.items() if not f['thunk'] and not re.match(r'(Unwind|Catch)@',f['name']))
# ---- islands: unreferenced functions Ghidra never created (decompiled read-only into ../isl/out)
import os as _os
ISL = D + 'islands'
_dec0 = dec
def dec(a):
    t = _dec0(a)
    if t is None:
        try: return open(ISL + '/%08x.c' % a, encoding='utf-8', errors='replace').read()
        except FileNotFoundError: return None
    return t
ISLSZ = {a: n for a, n in json.load(open(ISL + '/islands.json'))}
if _os.path.exists(ISL + '/sizes.tsv'):
    for l in open(ISL + '/sizes.tsv'):
        a, n = l.split(); a, n = int(a, 16), int(n)
        if a in F or a % 16: continue   # unaligned = tail of a function Ghidra cut short
        if n <= 0: n = ISLSZ.get(a, 0)  # Ghidra could not create it: keep it with the raw island size
        if n <= 0: continue
        t = dec(a) or ''
        cal = ['%08x' % int(m, 16) for m in re.findall(r'\b(?:thunk_)?FUN_([0-9a-f]{8})\b', t.split('{', 1)[-1])]
        F[a] = dict(a='%08x' % a, size=n, name='ISL_%08x' % a, ns='Global', thunk=False, callers=0, callees=cal,
                    strings=re.findall(r'"((?:[^"\\]|\\.)*)"', t), island=True)
        LAB.setdefault(a, 'island')
    REAL = sorted(a for a, f in F.items() if not f['thunk'] and not re.match(r'(Unwind|Catch)@', f['name']))
