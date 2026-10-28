"""Global order-preserving alignment: yaneSDK v1.65 source functions (sorted .cpp order, definition order)
vs exe functions in [LO,HI) (address order). Writes match.json."""
import sys, os, re, json, math, collections
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from yo import *
import src as S

LO, HI = 0x423110, 0x585000
SRC = WT
import anchors as _AN0
import hdr as _H0
OVR = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'overrides.json')))
skip_files = set(a for a in sys.argv[1:] if a.endswith('.cpp')) | set(OVR['exclude_files'])

# ---- source
sf = []
for p in S.files(SRC):
    b = os.path.basename(p)
    if b in skip_files: continue
    for f in S.parse(p, _AN0.DEFS):
        f['file'] = b
        if [f['name'], _H0.norm_params(f['params'])] in OVR.get('exclude_funcs', []): continue   # not in the exe
        sf.append(f)

# ---- exe
ef = [a for a in REAL if LO <= a < HI]
IGN = re.compile(r'^(FUN_|thunk_|CONCAT|CARRY|SCARRY|SBORROW|SUB\d|ZEXT|SEXT|LAB_|DAT_|PTR_|POPCOUNT|LZCOUNT|code|if|while|for|switch|return|sizeof)')
def exe_calls(t):
    return {m.group(1) for m in re.finditer(r'\b([A-Za-z_]\w*)\s*\(', t) if not IGN.match(m.group(1))}
def nums(t):
    out = []
    for m in re.finditer(r'(?<![\w.])(0x[0-9a-fA-F]+|\d+)(?![\w.])', t):
        v = int(m.group(1), 16) if m.group(1).startswith('0x') else int(m.group(1))
        out.append(v)
    return out
srcvocab = set(a for f in sf for a in f['apis'])
def exe_sig(t):
    m = re.search(r'^\s*(\S[^\n]*?)\s*\n?\s*([^\s(]*)\s*(FUN_[0-9a-f]+)\(([^)]*)\)', t, re.M)
    hdrl = t.split('{', 1)[0]
    mm = re.search(r'(\w[\w *]*?)\s+(__thiscall|__stdcall|__cdecl|__fastcall)?\s*(FUN_[0-9a-f]+)\s*\(([^)]*)\)', hdrl, re.S)
    if not mm: return None
    ret, cc, args = mm.group(1).strip(), mm.group(2) or '', mm.group(4).strip()
    n = 0 if args in ('', 'void') else args.count(',') + 1
    if cc in ('__thiscall', '__fastcall'): n -= 1
    return dict(void=ret == 'void', this=cc == '__thiscall', n=n)
E = []
for a in ef:
    t = dec(a) or ''
    body = t.split('{', 1)[1] if '{' in t else ''
    calls = set()
    for c in exe_calls(body):
        if c[-1] in 'AW' and c[:-1] in srcvocab: c = c[:-1]
        calls.add(c)
    own = set()
    for c, v in VT.items():
        if a in v: own.add(c.split('@')[0])
    E.append(dict(a=a, size=F[a]['size'], calls=calls, strings=set(F[a]['strings']),
                  consts={v for v in nums(body) if 0x100 <= v < 0x400000}, own=own,
                  esig=exe_sig(t),
                  ncall=len(F[a]['callees']), rets={int(x) for x in re.findall(r'return\s+(-?\d+)\s*;', body)}))

def unesc(s):
    return re.sub(r'\\(.)', lambda m: {'n': '\n', 't': '\t', 'r': '\r', '0': '\0'}.get(m.group(1), m.group(1)), s)
for f in sf:
    f['sset'] = {unesc(s) for s in f['strings'] if len(s) >= 2}
    f['cset'] = {v for v in f['consts'] if 0x100 <= v < 0x400000}
    f['rets'] = {int(x) for x in re.findall(r'return\s*\(?\s*(-?\d+)\s*\)?\s*;', f['text'])}
    if re.search(r'return\s+(true)\s*;', f['text']): f['rets'].add(1)
    if re.search(r'return\s+(false)\s*;', f['text']): f['rets'].add(0)

# features: api calls shared vocab
exevocab = set().union(*[e['calls'] for e in E])
V_api = sorted(srcvocab & exevocab)
V_str = sorted(set().union(*[f['sset'] for f in sf]) & set().union(*[e['strings'] for e in E]))
V_con = sorted(set().union(*[f['cset'] for f in sf]) & set().union(*[e['consts'] for e in E]))
V_ret = sorted(set().union(*[f['rets'] for f in sf]) | set().union(*[e['rets'] for e in E]))
print('vocab api/str/const', len(V_api), len(V_str), len(V_con), file=sys.stderr)

def mat(items, key, vocab, idf):
    ix = {v: i for i, v in enumerate(vocab)}
    M = np.zeros((len(items), len(vocab)), np.float32)
    for r, it in enumerate(items):
        for v in it[key]:
            if v in ix: M[r, ix[v]] = idf[ix[v]]
    return M
def idf_of(vocab, sets):
    c = collections.Counter(v for s in sets for v in s)
    return np.array([1.0 + math.log(len(sets) / (1 + c[v])) for v in vocab], np.float32)

nS, nE = len(sf), len(E)
score = np.zeros((nS, nE), np.float32)
for key_s, key_e, vocab, w, wmiss in (('apis', 'calls', V_api, 2.0, 0.6), ('sset', 'strings', V_str, 6.0, 1.5), ('cset', 'consts', V_con, 1.0, 0.0), ('rets', 'rets', V_ret, 0.8, 0.3)):
    idf = idf_of(vocab, [set(f[key_s]) for f in sf])
    A = mat(sf, key_s, vocab, idf)
    B = mat(E, key_e, vocab, idf)
    Ab, Bb = (A > 0).astype(np.float32), (B > 0).astype(np.float32)
    shared = Ab @ B.T  # sum idf of shared
    sa = A.sum(1)[:, None]; sb = B.sum(1)[None, :]
    score += w * shared - wmiss * ((sa - shared) + (sb - shared))

feat_part = score.copy()
# signature compatibility
import hdr as _H
for i, f in enumerate(sf):
    f['sig'] = _H.norm_params(f['params'])
    n = 0 if not f['sig'] else f['sig'].count(',') + 1
    head = f['text'][:f['text'].find(f['name'].split('::')[0])] if f['name'] in f['text'] else ''
    svoid = bool(re.search(r'\bvoid\s*$', head)) or '::~' in f['name'] or (f['name'].split('::')[-1] == f['name'].split('::')[-2] if '::' in f['name'] else False)
    f['n'] = n; f['svoid'] = svoid
    for j, e in enumerate(E):
        es = e['esig']
        if not es: continue
        score[i, j] += 1.2 if es['n'] == n else -1.2
        if es['void'] and not svoid: score[i, j] -= 0.8
# size compatibility: calibrated ratio exe bytes / source chars ~ k
sl = np.array([max(f['len'], 4) for f in sf], np.float32)
es = np.array([max(e['size'], 4) for e in E], np.float32)
K = float(os.environ.get('K', '0.45'))
lr = np.abs(np.log((es[None, :] / sl[:, None]) / K))
score += 1.0 - 0.8 * lr

# vtable ownership
ownmask = np.array([bool(e['own']) for e in E])
for i, f in enumerate(sf):
    cls = f['cls'].split('::')[-1]
    for j in np.nonzero(ownmask)[0]:
        score[i, j] += 4.0 if cls in E[j]['own'] else -3.0

nofeat_col = score - feat_part
# ---- vtable anchors (hard constraints)
import anchors as AN, hdr
ANC, _good, _C = AN.build()
for f in sf: f['sig'] = hdr.norm_params(f['params'])
byname = collections.defaultdict(list)
for i, f in enumerate(sf): byname[f['name']].append(i)
anchored_src = {}
HELD = {}
for j, e in enumerate(E):
    ident = ANC.get(e['a'])
    if not ident: continue
    if ident[0] == '??_G' or ident[4]:
        score[:, j] -= 8.0            # compiler-generated deleting dtor or header-inline: no .cpp counterpart
        e['anchor'] = ident
        continue
    cls, name, sig = ident[:3]
    cand = byname.get(cls + '::' + name, [])
    exact = [i for i in cand if sf[i]['sig'] == sig]
    use = exact or (cand if len(cand) == 1 else [])
    if len(use) == 1:
        if os.environ.get('HOLD') and (e['a'] * 2654435761 >> 7) % 3 == 0:
            HELD[j] = use[0]; continue
        score[:, j] -= 8.0
        score[use[0], j] += 60.0
        e['anchor'] = ident
        anchored_src[use[0]] = j
# compiler-generated: deleting dtors not in a vtable list, dynamic initializers / atexit stubs (FUN_00b08e2c = atexit)
STUB = re.compile(r'^\s*(?:if \(\(DAT_\w+ & \d+\) == 0\) \{\s*DAT_\w+ = DAT_\w+ \| \d+;\s*(?:\w+\(\);\s*)?(?:return;\s*)?\}\s*)?FUN_00b08e2c\(&?\w+\);\s*return;\s*$', re.S)
nstub = 0
for j, e in enumerate(E):
    t = dec(e['a']) or ''
    body = t.split('{', 1)[1].rsplit('}', 1)[0] if '{' in t else ''
    if (e['size'] < 64 and STUB.match(body)) or (not e.get('anchor') and re.search(r'& [12]\) != 0', t) and 'b08e6d' in t and e['size'] < 64):
        score[:, j] -= 8.0; e['stub'] = True; nstub += 1
print('anchors applied', len(anchored_src), 'stubs', nstub, file=sys.stderr)
eix = {e['a']: j for j, e in enumerate(E)}
novr = 0
for name, sig, a2, *lab in OVR.get('forbid', []):
    j = eix.get(int(a2, 16))
    for i, f in enumerate(sf):
        if j is not None and f['name'] == name and hdr.norm_params(f['params']) == sig: score[i, j] -= 50.0
for name, sig, addr, *lab in OVR['pairs']:
    j = eix.get(int(addr, 16))
    cand = [i for i, f in enumerate(sf) if f['name'] == name and (sig is None or hdr.norm_params(f['params']) == sig)]
    if j is None or len(cand) != 1:
        print('override not applied', name, sig, addr, 'exe' if j is None else len(cand), file=sys.stderr); continue
    score[cand[0], :] -= 20.0; score[:, j] -= 20.0; score[cand[0], j] += 100.0; E[j]['anchor'] = ('override', lab[0] if lab else 'manual'); anchored_src[cand[0]] = j; novr += 1
print('overrides', novr, file=sys.stderr)
base_score = score.copy()
NOFEAT = {}
if os.environ.get('NOFEAT'):
    ref = {int(p['a'], 16): (p['file'], p['name'], p['sig']) for p in json.load(open(os.path.dirname(__file__) + '/match_full.json'))['pairs'] if p['conf'] in ('feat', 'cg')}
    for j, e in enumerate(E):
        if e['a'] in ref and (e['a'] * 2654435761 >> 9) % 3 == 0 and not e.get('anchor'):
            NOFEAT[j] = ref[e['a']]
    # recompute this column's score without api/str/const/ret features: keep size+sig+vtable terms only
    for j in NOFEAT:
        score[:, j] = nofeat_col[:, j]
    base_score = score.copy()
ITERS = int(os.environ.get('ITERS', '3'))
eidx = {e['a']: j for j, e in enumerate(E)}
ecallee = [set(res(int(c, 16)) for c in F[e['a']]['callees'] if not c.startswith('EXT')) for e in E]
ecaller = [set() for _ in E]
for j, cs in enumerate(ecallee):
    for c in cs:
        if c in eidx: ecaller[eidx[c]].add(E[j]['a'])
short = lambda n: n.split('::')[-1]
scalls = [set(f['calls']) for f in sf]


def run_dp(score):
    GS, GE = -1.5, -0.4   # skip source fn, skip exe fn
    H = np.full(nE + 1, 0.0, np.float32)
    H[1:] = GE * np.arange(1, nE + 1)
    ptr = np.zeros((nS + 1, nE + 1), np.int8)  # 1 diag 2 up 3 left
    lptr = np.zeros((nS + 1, nE + 1), np.int32)
    jj = np.arange(nE + 1)
    for i in range(1, nS + 1):
        diag = np.full(nE + 1, -1e9, np.float32)
        diag[1:] = H[:-1] + score[i - 1]
        up = H + GS
        T = np.maximum(diag, up)
        tp = np.where(diag >= up, 1, 2).astype(np.int8)
        vals = T - GE * jj
        acc = np.maximum.accumulate(vals)
        src_idx = np.maximum.accumulate(np.where(vals >= acc, jj, 0))
        Hn = acc + GE * jj
        left = src_idx != jj
        p = np.where(left, 3, tp).astype(np.int8)
        ptr[i] = p; lptr[i] = src_idx
        H = Hn
    # traceback
    i, j = nS, nE
    pairs = []
    while i > 0:
        p = ptr[i, j]
        if j == 0: p = 2
        if p == 1:
            pairs.append((i - 1, j - 1)); i -= 1; j -= 1
        elif p == 2:
            i -= 1
        else:
            j = lptr[i, j]
    pairs.reverse()
    return pairs

def cg_bonus(pairs):
    """call-graph agreement for every (src, exe) cell given current confident matches"""
    conf = [(si, ej) for si, ej in pairs if base_score[si, ej] >= 3.0]
    name2e = collections.defaultdict(set)   # short name -> exe addrs of matched src fns
    e2name = {}
    for si, ej in conf:
        name2e[short(sf[si]['name'])].add(E[ej]['a']); e2name[E[ej]['a']] = short(sf[si]['name'])
    # source callers by short name
    callers_of = collections.defaultdict(set)
    for i, f in enumerate(sf):
        for c in scalls[i]: callers_of[c].add(short(f['name']))
    B = np.zeros_like(base_score)
    for j in range(nE):
        dn = {e2name[c] for c in ecallee[j] if c in e2name}      # names of known callees of exe fn
        up = {e2name[c] for c in ecaller[j] if c in e2name}      # names of known callers
        if not dn and not up: continue
        for i in range(nS):
            k = len(dn & scalls[i]) - 0.5 * len(dn - scalls[i])
            k += len(up & callers_of[short(sf[i]['name'])]) - 0.5 * len(up - callers_of[short(sf[i]['name'])])
            if k: B[i, j] = 1.5 * k
    return B
pairs = run_dp(score)
for it in range(ITERS):
    score = base_score + cg_bonus(pairs)
    pairs = run_dp(score)
    print('iter', it, len(pairs), file=sys.stderr)

# ---- confidence
final_cg = cg_bonus(pairs) if ITERS else np.zeros_like(base_score)
conf = {}
pos = {si: k for k, (si, ej) in enumerate(pairs)}
for k, (si, ej) in enumerate(pairs):
    e, f = E[ej], sf[si]
    if e.get('anchor') and si in anchored_src and anchored_src[si] == ej: c = e['anchor'][1] if e['anchor'][0] == 'override' else 'vt'
    elif (set(f['apis']) & e['calls']) or (f['sset'] & e['strings']):
        c = 'feat' if base_score[si, ej] >= 4 else 'weak'
    elif final_cg[si, ej] >= 1.5 and len(byname[f['name']]) == 1: c = 'cg'   # call graph uses names: no overloads
    else: c = 'order'
    conf[(si, ej)] = c
# tight order: neighbours confident, and no unmatched exe / skipped src between them
strong = {'vt', 'feat', 'cg'}
for k, (si, ej) in enumerate(pairs):
    if conf[(si, ej)] not in ('order', 'weak'): continue
    if 0 < k < len(pairs) - 1:
        (ps, pe), (ns, ne) = pairs[k - 1], pairs[k + 1]
        if conf[(ps, pe)] in strong and conf[(ns, ne)] in strong and ps == si - 1 and ns == si + 1 and pe == ej - 1 and ne == ej + 1 \
                and sf[ps]['file'] == sf[si]['file'] == sf[ns]['file']:
            conf[(si, ej)] = 'tight'
print('conf', collections.Counter(conf.values()), file=sys.stderr)
if HELD:
    pm2 = dict((ej, si) for si, ej in pairs)
    cc = collections.Counter()
    for j, i in HELD.items():
        if j in pm2:
            c0 = conf[(pm2[j], j)]
            if c0 == 'order': c0 += '+' if score[pm2[j], j] >= float(os.environ.get('OT', '2.5')) else '-'
            cc[(c0, pm2[j] == i)] += 1
    print('holdout by conf', sorted(cc.items()), file=sys.stderr)

out = []
for si, ej in pairs:
    f, e = sf[si], E[ej]
    out.append(dict(file=f['file'], name=f['name'], line=f['line'], a='%08x' % e['a'], size=e['size'], slen=f['len'],
                    score=float(score[si, ej]),
                    api=sorted(set(f['apis']) & e['calls']), str=sorted(f['sset'] & e['strings']),
                    xs_api=sorted(e['calls'] - set(f['apis'])), xs_str=sorted(e['strings'] - f['sset']),
                    own=sorted(e['own']), anchor=bool(e.get('anchor')), conf=conf[(si, ej)], sig=f['sig']))
json.dump(dict(pairs=out, nS=nS, nE=nE), open(os.path.dirname(__file__) + '/match.json', 'w'), indent=0)
if NOFEAT:
    pm3 = dict((ej, (sf[si]['file'], sf[si]['name'], sf[si]['sig'])) for si, ej in pairs)
    cc = collections.Counter((conf.get((dict((b, a) for a, b in pairs).get(j), j), '-'), pm3.get(j) == r) for j, r in NOFEAT.items())
    print('NOFEAT holdout', len(NOFEAT), sorted(cc.items()), file=sys.stderr)
    for j, r in NOFEAT.items():
        if pm3.get(j) not in (None, r): print('  wrong', hex(E[j]['a']), r[1], '->', pm3[j][1], file=sys.stderr)
if HELD:
    pm = dict((ej, si) for si, ej in pairs)
    ok = sum(pm.get(j) == i for j, i in HELD.items()); miss = sum(j not in pm for j in HELD)
    print('HOLDOUT', len(HELD), 'correct', ok, 'unmatched', miss, 'wrong', len(HELD) - ok - miss, file=sys.stderr)
    for j, i in HELD.items():
        if pm.get(j) is not None and pm[j] != i: print('  wrong', hex(E[j]['a']), sf[i]['name'], '->', sf[pm[j]]['name'], file=sys.stderr)
print('matched', len(out), 'of src', nS, 'exe', nE, file=sys.stderr)
