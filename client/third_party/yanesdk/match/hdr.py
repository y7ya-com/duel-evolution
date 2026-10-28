"""Parse class declarations from yaneSDK headers and compute MSVC vtable layouts."""
import re, glob, os
import src as S


TYPEDEF = {'LONG': 'long', 'LPSTR': 'char*', 'LPCSTR': 'char*', 'LPCTSTR': 'char*', 'LPTSTR': 'char*', 'BOOL': 'int',
           'UINT': 'unsignedint', 'DWORD': 'unsignedlong', 'WORD': 'unsignedshort', 'BYTE': 'unsignedchar', 'LPVOID': 'void*',
           'LPBYTE': 'unsignedchar*', 'BYTE*': 'unsignedchar*', 'DWORD*': 'unsignedlong*', 'LONG&': 'long&', 'DWORD&': 'unsignedlong&',
           'string&': 'string&', 'LPARAM': 'long', 'WPARAM': 'unsignedint', 'LRESULT': 'long', 'HRESULT': 'long'}


def norm_params(p):
    p = re.sub(r'=[^,]*', '', p)                       # default args
    out = []
    for a in split_top(p, ','):
        a = a.strip()
        if a in ('', 'void'): continue
        a = re.sub(r'\b(const|volatile|struct|class|enum)\b', '', a)
        # drop param name: last identifier if preceded by type tokens
        toks = re.findall(r'[A-Za-z_]\w*(?:\s*<[^<>]*(?:<[^<>]*>[^<>]*)*>)?|::|[*&]|\.\.\.|\[\s*\w*\s*\]', a)
        ids = [t for t in toks if re.match(r'[A-Za-z_]', t)]
        if len(ids) >= 2 and re.match(r'[A-Za-z_]\w*$', toks[-1]) and toks[-2] != '::':
            toks = toks[:-1]
        ty = ''.join(t.replace(' ', '') for t in toks if not t.startswith('[')) + ('*' if re.search(r'\[', a) else '')
        out.append(TYPEDEF.get(ty, ty))
    return ','.join(out)


def split_top(s, ch):
    d, cur, out = 0, '', []
    for c in s:
        if c in '(<[': d += 1
        elif c in ')>]': d -= 1
        if c == ch and d == 0:
            out.append(cur); cur = ''
        else:
            cur += c
    out.append(cur)
    return out


def parse_classes(root, defs=None):
    classes = {}
    for path in glob.glob(root + '/**/*.h', recursive=True) + glob.glob(root + '/*.cpp'):
        raw = open(path, 'rb').read().replace(b'\r', b'').decode('cp932', 'replace')
        t, _ = S.blank_comments(raw)
        t = S.preprocess(t, set(S.DEFS if defs is None else defs))
        for m in re.finditer(r'(?<![\w<,])(class|struct)\s+([A-Za-z_]\w*)\s*(:[^;{()]*)?\{', t):
            pre = t[max(0, m.start() - 40):m.start()]
            if re.search(r'template\s*<[^>]*>\s*$', pre): continue
            name = m.group(2)
            bases = []
            if m.group(3):
                for b in split_top(m.group(3)[1:], ','):
                    b = re.sub(r'\b(public|protected|private|virtual)\b', '', b).strip()
                    if b: bases.append(b)
            # body
            i = m.end(); d = 1; j = i
            while j < len(t) and d:
                if t[j] == '{': d += 1
                elif t[j] == '}': d -= 1
                j += 1
            body = t[i:j - 1]
            meths = []
            # split into top-level member chunks
            k, start, dd = 0, 0, 0
            while k < len(body):
                c = body[k]
                if c == '{':
                    if dd == 0:
                        meths.append(member(body[start:k], True))
                        # skip inline body
                        e = k + 1; d2 = 1
                        while e < len(body) and d2:
                            if body[e] == '{': d2 += 1
                            elif body[e] == '}': d2 -= 1
                            e += 1
                        k = e
                        # nested class/struct/enum body: skip until ';'
                        if meths[-1] is None:
                            while k < len(body) and body[k] != ';': k += 1
                        start = k + 1 if k < len(body) and body[k] == ';' else k
                        continue
                elif c == ';' and dd == 0:
                    meths.append(member(body[start:k], False)); start = k + 1
                k += 1
            meths = [x for x in meths if x]
            if name not in classes or len(meths) > len(classes[name]['meths']):
                classes[name] = dict(name=name, bases=bases, meths=meths, file=os.path.basename(path))
    return classes


def member(chunk, has_body):
    c = re.sub(r'\b(public|protected|private)\s*:', '', chunk).strip()
    if not c or '(' not in c: return None
    if re.match(r'(typedef|friend|class|struct|enum|union|template)\b', c): return None
    virtual = bool(re.search(r'\bvirtual\b', c))
    pure = bool(re.search(r'\)\s*(const\s*)?=\s*0\s*$', c))
    k = S.top_colon_init(c)
    if k >= 0 and has_body: c = c[:k]
    m = re.search(r'\)\s*(const)?\s*(=\s*0)?\s*(throw\s*\([^)]*\))?\s*$', c)
    if not m: return None
    p = S.match_paren_back(c, m.start())
    if p <= 0: return None
    pre = c[:p].rstrip()
    m2 = re.search(r'(~?\s*[A-Za-z_]\w*|operator\s*\S+)$', pre)
    if not m2: return None
    name = re.sub(r'\s+', '', m2.group(1))
    if name in S.KW: return None
    return dict(name=name, sig=norm_params(c[p + 1:m.start()]), const=bool(m.group(1)), virtual=virtual, pure=pure,
                inline=has_body)


def vtables(classes, cname, cache=None):
    """list of vtables (primary first); each a list of slot dicts {cls, name, sig, pure, inline}"""
    cache = {} if cache is None else cache
    if cname in cache: return cache[cname]
    c = classes.get(cname)
    if not c:
        cache[cname] = None; return None
    tabs = []
    for b in c['bases']:
        bn = re.sub(r'<.*', '', b).split('::')[-1]
        bt = vtables(classes, bn, cache)
        if bt: tabs.extend([list(t) for t in bt])
    newv = []
    for m in c['meths']:
        dtor = m['name'].startswith('~')
        key = ('~',) if dtor else (m['name'], m['sig'], m['const'])
        hit = False
        for t in tabs:
            for i, s in enumerate(t):
                skey = ('~',) if s['name'].startswith('~') else (s['name'], s['sig'], s['const'])
                if skey == key:
                    t[i] = dict(s, cls=cname, name=m['name'], pure=m['pure'], inline=m['inline'], sig=m['sig'])
                    hit = True
        if not hit and m['virtual']:
            newv.append(dict(m, cls=cname))
    # MSVC: overloads of a newly introduced name are grouped at the first one's position, in reverse order
    # (position = first declaration of that name, virtual or not)
    first = {}
    for k, m in enumerate(c['meths']): first.setdefault(m['name'], k)
    grouped, seen = [], set()
    for m in sorted(newv, key=lambda x: first[x['name']]):
        if m['name'] in seen: continue
        seen.add(m['name'])
        grp = [x for x in newv if x['name'] == m['name']]
        grouped.extend(reversed(grp))
    if not tabs:
        tabs = [grouped] if grouped else []
    else:
        tabs[0] = tabs[0] + grouped
    cache[cname] = tabs
    return tabs
