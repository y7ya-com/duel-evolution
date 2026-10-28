"""Template instances (yaneGTL.h / yaneDIB32Effect.h blit templates): an unmatched exe function whose matched callers
all call exactly one template name in their source is an instance of that template. Writes tmpl.tsv
(addr, template, how); markers.py then puts one marker per instance above the template's definition."""
import sys, os, re, json, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from yo import *
import src as S, hdr, anchors
HERE = os.path.dirname(os.path.abspath(__file__))
P = json.load(open(HERE + '/match.json'))['pairs']
matched = {int(p['a'], 16): p for p in P}
CALL = re.compile(r'\b(CFastPlaneEffect|CDIB32Effect)::(\w+)\s*(?:<[^;(]*>)?\s*\(')
TMPL = {('CFastPlaneEffect', n) for n in 'Effect EffectMosaic Blt EffectDouble BltDouble Morph BltSrcXY'.split()} | \
       {('CDIB32Effect', n) for n in 'Effect EffectColorKey Blt'.split()}
srcf = {}
def calls_of(p):
    if p['file'] not in srcf:
        srcf[p['file']] = {(f['name'], hdr.norm_params(f['params'])): f for f in S.parse(WT + '/' + p['file'], anchors.DEFS)}
    f = srcf[p['file']].get((p['name'], p['sig']))
    if not f: return set()
    return {(m.group(1), m.group(2)) for m in CALL.finditer(S.blank_comments(f['text'])[0])} & TMPL
callers = collections.defaultdict(set)
for a, f in F.items():
    if f.get('thunk'): continue
    for c in f['callees']:
        if not c.startswith('EXT'): callers[res(int(c, 16))].add(a)
out = {}
for a in REAL:
    if a in matched or not (0x423110 <= a < 0x583060): continue
    sets = [calls_of(matched[c]) for c in callers.get(a, ()) if c in matched]
    sets = [s for s in sets if s]
    if not sets: continue
    common = set.intersection(*sets)
    if len(common) == 1:
        out[a] = next(iter(common))
# Blt/BltDouble and Effect/EffectDouble share dispatchers: the Double variants take two more functors and a second
# src/dst pair, so Ghidra's argument count separates them (on the instances assigned above: Blt <= 12, Effect = 4)
def nargs(a):
    h = (dec(a) or '').split('{', 1)[0]
    m = re.search(r'\(([^)]*)\)', h)
    return 0 if not m or m.group(1).strip() in ('', 'void') else m.group(1).count(',') + 1
how = {a: 'caller' for a in out}
for a in REAL:
    if a in matched or a in out or not (0x423110 <= a < 0x583060): continue
    sets = [calls_of(matched[c]) for c in callers.get(a, ()) if c in matched]
    sets = [s for s in sets if s]
    if not sets: continue
    u = {n for c, n in set.union(*sets)}; n = nargs(a)
    pick = None
    if u == {'Blt', 'BltDouble'}: pick = 'BltDouble' if n >= 13 else 'Blt' if 10 <= n <= 12 else None
    elif u == {'Effect', 'EffectDouble'}: pick = 'EffectDouble' if n >= 6 else 'Effect' if n == 4 else None
    if pick: out[a] = ('CFastPlaneEffect', pick); how[a] = 'caller+arity'
with open(HERE + '/tmpl.tsv', 'w') as o:
    for a, (c, n) in sorted(out.items()): o.write(f'{a:08x}\t{c}::{n}\t{how[a]}\n')
print('instances assigned', len(out), collections.Counter(f'{c}::{n}' for c, n in out.values()))

if __name__ == '__main__' and os.environ.get('DIAG'):
    amb = collections.Counter(); nocaller = 0
    for a in REAL:
        if a in matched or a in out or not (0x4577d0 <= a < 0x525ac0 or 0x4436c0 <= a < 0x449000): continue
        sets = [calls_of(matched[c]) for c in callers.get(a, ()) if c in matched]
        sets = [s for s in sets if s]
        if not sets: nocaller += 1; continue
        amb[tuple(sorted(f'{c}::{n}' for c, n in set.union(*sets)))] += 1
    print('no template-calling caller', nocaller); print(amb.most_common(10))
