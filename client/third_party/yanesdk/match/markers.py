"""Insert `// @yo2 0xADDR <how>` above every source function matched to an exe function (match.json + vtable anchors
for header-inline functions). Idempotent: existing @yo2 lines directly above a definition are replaced.
Writes markers.tsv (addr, file, line, function, how) for the docs."""
import sys, os, re, json, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from yo import *
import src as S, hdr, anchors

HERE = os.path.dirname(os.path.abspath(__file__))
P = json.load(open(HERE + '/match.json'))['pairs']
ANC, _, C = anchors.build()
want = collections.defaultdict(list)   # (file, kind, key) -> [(addr, how)]

# .cpp definitions
for p in P:
    want[(p['file'], 'def', p['name'], p['sig'])].append((int(p['a'], 16), p['conf']))
matched = {int(p['a'], 16) for p in P}
# header-inline virtuals (vtable anchors not matched to a .cpp definition)
for a, ident in ANC.items():
    if a in matched or ident[0] == '??_G' or not ident[4]: continue
    cls, name, sig = ident[:3]
    c = C.get(cls)
    if c: want[(c['file'], 'inl', cls + '::' + name, sig)].append((a, 'vt'))

# blit-template instances (tmpl_markers.py): one marker per instance above the template definition
TFILE = {'CFastPlaneEffect': 'yaneGTL.h', 'CDIB32Effect': 'yaneDIB32Effect.h'}
if os.path.exists(HERE + '/tmpl.tsv'):
    for l in open(HERE + '/tmpl.tsv'):
        a, t, how = l.rstrip('\n').split('\t')
        cls, name = t.split('::')
        want[(TFILE[cls], 'tmpl', t, '')].append((int(a, 16), 'template ' + name + (' (arity)' if 'arity' in how else '')))

def lines_of(path):
    b = open(path, 'rb').read()
    return b.split(b'\r\n') if b'\r\n' in b else b.split(b'\n'), (b'\r\n' if b'\r\n' in b else b'\n')

byfile = collections.defaultdict(dict)
for (f, kind, name, sig), v in want.items(): byfile[f][(kind, name, sig)] = v

rows, missing = [], []
for f, items in sorted(byfile.items()):
    path = WT + '/' + f
    L, nl = lines_of(path)
    text = '\n'.join(l.decode('cp932') for l in L)
    targets = {}   # 0-based line index -> [(addr, how)]
    if f.endswith('.cpp'):
        for d in S.parse(path, anchors.DEFS):
            k = ('def', d['name'], hdr.norm_params(d['params']))
            if k in items: targets[d['line'] - 1] = items.pop(k)
    # header inline functions: find the declaration line inside the class body
    for (kind, name, sig), v in list(items.items()):
        if kind != 'inl': continue
        cls, fn = name.rsplit('::', 1)
        m = re.search(r'\b(class|struct)\s+' + re.escape(cls) + r'\b[^;{]*\{', text)
        if not m: continue
        start = text.count('\n', 0, m.end())
        for i in range(start, len(L)):
            s = L[i].decode('cp932')
            if re.search(r'(^|[\s*&~])' + re.escape(fn) + r'\s*\(', s) and '//' not in s.split(fn)[0]:
                j = i
                while ')' not in s.split(fn, 1)[1] and j + 1 < len(L):   # parameter list spans lines
                    j += 1; s += ' ' + re.sub(r'//.*', '', L[j].decode('cp932'))
                pm = re.search(re.escape(fn) + r'\s*\(([^)]*)\)', s)
                if pm and hdr.norm_params(pm.group(1)) == sig:
                    targets[i] = v; items.pop((kind, name, sig)); break
    for (kind, name, sig), v in list(items.items()):
        if kind != 'tmpl': continue
        cls, fn = name.split('::')
        m = re.search(r'\bclass\s+' + cls + r'\b[^;{]*\{', text)
        if not m: continue
        start = text.count('\n', 0, m.end())
        for i in range(start, len(L)):
            if re.search(r'\bstatic\s+LRESULT\s+' + fn + r'\s*\(', L[i].decode('cp932')):
                k = i
                while k > start and not L[k].decode('cp932').strip().startswith('template'): k -= 1
                targets[k] = v; items.pop((kind, name, sig)); break
    missing += [(f,) + k for k in items]
    if not targets: continue
    out = []
    for i, l in enumerate(L):
        if i in targets:
            while out and re.match(rb'\s*// @yo2\??\s+0x', out[-1]): out.pop()   # replace old markers
            ind = re.match(rb'[ \t]*', l).group(0)
            for a, how in sorted(targets[i]):
                tag = '@yo2?' if how == 'order' else '@yo2'   # unverified: not counted by tools/coverage.py
                out.append(ind + ('// %s 0x%08x %s' % (tag, a, how)).encode())
                rows.append(('%08x' % a, f, i + 1, how))
        out.append(l)
    open(path, 'wb').write(nl.join(out))
with open(HERE + '/markers.tsv', 'w') as o:
    for r in rows: o.write('\t'.join(map(str, r)) + '\n')
print('markers', len(rows), 'files', len(byfile), 'not placed', len(missing))
for m in missing[:20]: print('  not placed:', m)
