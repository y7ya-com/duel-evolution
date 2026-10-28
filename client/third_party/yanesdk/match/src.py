"""Parse yaneSDK .cpp files into an ordered list of out-of-line function definitions with features."""
import re, os, glob

DEFS = {'USE_MIDIOutputMCI', 'USE_MIDIOutputDM', 'USE_StreamSound', 'USE_DirectDraw', 'USE_DIB32', 'USE_FastDraw',
        'USE_YGA', 'USE_DIRECTX', 'USE_YANE_NEWDELETE', 'USE_DIRECTINPUT_JOYSTICK', 'USE_WIN32_JOYSTICK',
        'USE_MovieDS', 'USE_MovieAVI', 'USE_MovieAVI_DIB32', 'USE_SAVER', 'WIN32', '_WIN32', '_MSC_VER', '__cplusplus',
        'NDEBUG', '_M_IX86'}

KW = {'if', 'for', 'while', 'switch', 'return', 'sizeof', 'catch', 'else', 'do', 'new', 'delete', 'case'}


def blank_comments(t):
    """Remove comments; keep strings but remember them. Returns text with string contents replaced by '_' (same length)."""
    out = []
    i, n = 0, len(t)
    strs = []
    while i < n:
        c = t[i]
        if t.startswith('//', i):
            j = t.find('\n', i)
            j = n if j < 0 else j
            out.append(' ' * (j - i)); i = j
        elif t.startswith('/*', i):
            j = t.find('*/', i + 2)
            j = n if j < 0 else j + 2
            out.append(re.sub(r'[^\n]', ' ', t[i:j])); i = j
        elif c == '"' or c == "'":
            j = i + 1
            while j < n and t[j] != c and t[j] != '\n':
                j += 2 if t[j] == '\\' else 1
            if c == '"':
                strs.append((i, t[i + 1:j]))
            out.append(c + '_' * (j - i - 1) + (c if j < n else '')); i = j + 1
        else:
            out.append(c); i += 1
    return ''.join(out), strs


def eval_cond(expr, defs):
    e = re.sub(r'defined\s*\(\s*(\w+)\s*\)', lambda m: '1' if m.group(1) in defs else '0', expr)
    e = re.sub(r'defined\s+(\w+)', lambda m: '1' if m.group(1) in defs else '0', e)
    e = re.sub(r'\b[A-Za-z_]\w*\b', lambda m: '1' if m.group(0) in defs else '0', e)
    e = e.replace('&&', ' and ').replace('||', ' or ').replace('!', ' not ').replace(' not =', '!=')
    try:
        return bool(eval(e, {}, {}))
    except Exception:
        return False


def preprocess(t, defs):
    """Blank out lines in inactive #if branches (keeps offsets/lines). defs mutated by #define."""
    lines = t.split('\n')
    stack = []  # (active_parent, taken, active)
    active = True
    out = []
    cont = False   # inside a backslash-continued directive
    for ln in lines:
        s = ln.strip()
        if cont:
            cont = s.endswith('\\')
            out.append(' ' * len(ln)); continue
        if s.startswith('#') and s.endswith('\\'):
            cont = True
        m = re.match(r'#\s*(ifdef|ifndef|if|elif|else|endif|define|undef)\b(.*)', s)
        if m:
            d, rest = m.group(1), m.group(2).strip()
            if d in ('ifdef', 'ifndef', 'if'):
                if d == 'ifdef': c = rest.split()[0] in defs if rest else False
                elif d == 'ifndef': c = rest.split()[0] not in defs if rest else True
                else: c = eval_cond(rest, defs)
                stack.append((active, c))
                active = active and c
            elif d == 'elif':
                par, taken = stack[-1]
                c = (not taken) and eval_cond(rest, defs)
                stack[-1] = (par, taken or c)
                active = par and c
            elif d == 'else':
                par, taken = stack[-1]
                stack[-1] = (par, True)
                active = par and not taken
            elif d == 'endif':
                if stack:
                    par, _ = stack.pop()
                    active = par
            elif d == 'define' and active and rest:
                defs.add(rest.split()[0].split('(')[0])
            elif d == 'undef' and active and rest:
                defs.discard(rest.split()[0])
            out.append(' ' * len(ln))
        elif not active or s.startswith('#'):
            out.append(' ' * len(ln))
        else:
            out.append(ln)
    return '\n'.join(out)


def match_paren_back(t, j):
    """t[j]==')' -> index of matching '('."""
    d = 0
    while j >= 0:
        if t[j] == ')': d += 1
        elif t[j] == '(':
            d -= 1
            if d == 0: return j
        j -= 1
    return -1


def parse(path, defs=None):
    raw = open(path, 'rb').read().replace(b'\r', b'').decode('cp932', 'replace')
    defs = set(DEFS if defs is None else defs)
    t, strs = blank_comments(raw)
    t = preprocess(t, defs)
    funcs = []
    depth = 0
    transparent = []  # stack of bools: brace opened a namespace/extern block (transparent)
    i, n = 0, len(t)
    last_stmt_end = 0
    while i < n:
        c = t[i]
        if c == '{':
            eff = depth - sum(transparent)
            head = t[last_stmt_end:i]
            if eff == 0:
                hs = head.strip()
                if re.match(r'^(namespace\b[^;]*|extern\s+"[^"]*"\s*)$', hs):
                    transparent.append(True); depth += 1; i += 1; last_stmt_end = i; continue
                fn = func_head(hs)
                if fn:
                    # find body end
                    d, j = 1, i + 1
                    while j < n and d:
                        if t[j] == '{': d += 1
                        elif t[j] == '}': d -= 1
                        j += 1
                    start = last_stmt_end + (len(head) - len(head.lstrip()))
                    funcs.append(dict(name=fn, params=LAST[0], const=LAST[1], start=start, body=(i, j), line=raw.count('\n', 0, start) + 1))
                    i = j; last_stmt_end = j; continue
            transparent.append(False); depth += 1
        elif c == '}':
            depth -= 1
            if transparent: transparent.pop()
            last_stmt_end = i + 1
        elif c == ';' and depth - sum(transparent) == 0:
            last_stmt_end = i + 1
        i += 1
    for f in funcs:
        a, b = f['body']
        body_raw = raw[a:b]
        body = t[a:b]
        f['strings'] = [s for (p, s) in strs if a <= p < b and not err_arg(t, p)]
        f['calls'] = [m.group(1) for m in re.finditer(r'(?<![\w.>])(?:::)?\s*([A-Za-z_]\w*)\s*\(', body) if m.group(1) not in KW]
        f['apis'] = sorted({m.group(1) for m in re.finditer(r'::\s*([A-Za-z_]\w*)\s*\(', body)} |
                           {m.group(1) for m in re.finditer(r'(?<![\w.>:])([a-z_]\w*|[A-Z][a-z]\w*[A-Z]\w*)\s*\(', body)})
        f['consts'] = [int(x, 16) if x.lower().startswith('0x') else int(x) for x in
                       re.findall(r'(?<![\w.])(0[xX][0-9a-fA-F]+|\d+)(?![\w.])', body)]
        f['len'] = len(re.sub(r'\s+', '', body))
        f['text'] = raw[f['start']:b]
        f['cls'] = f['name'].rsplit('::', 1)[0] if '::' in f['name'] else ''
    return funcs


def err_arg(t, p):
    k = t.rfind('Err.Out', max(0, p - 200), p)
    return k >= 0 and t.count(';', k, p) == 0


def func_head(hs):
    """Return qualified function name if header text looks like a function definition."""
    if not hs or hs.endswith('=') or hs.endswith(']'): return None
    if re.match(r'^(class|struct|union|enum|typedef)\b', hs) and '(' not in hs.split('{')[0][:hs.find(':') if ':' in hs else None]:
        if not re.search(r'\)\s*(const)?\s*$', hs): return None
    s = hs
    # strip trailing const / throw() / init list
    k = top_colon_init(s)
    m = None if k >= 0 else re.search(r'\)\s*(const\s*)?(throw\s*\([^)]*\)\s*)?$', s)
    if not m:
        # constructor initializer list: find ')' followed by ':' at top level
        if k < 0: return None
        s = s[:k].rstrip()
        if not s.endswith(')'): return None
        j = len(s) - 1
    else:
        j = m.start()
    p = match_paren_back(s, j)
    if p <= 0: return None
    pre = s[:p].rstrip()
    m2 = re.search(r'((?:[A-Za-z_]\w*\s*(?:<[^<>]*>)?\s*::\s*)*~?\s*(?:operator\s*(?:\(\)|[^\s(]+|\s+\w+)|[A-Za-z_]\w*))$', pre)
    if not m2: return None
    name = re.sub(r'\s+', '', m2.group(1))
    if name.split('::')[-1] in KW: return None
    global LAST
    LAST = (s[p + 1:j], bool(m and m.group(1)))
    return name


def top_colon_init(s):
    d = 0
    for k, ch in enumerate(s):
        if ch == '(': d += 1
        elif ch == ')': d -= 1
        elif ch == ':' and d == 0:
            if s[k - 1:k] == ':' or s[k + 1:k + 2] == ':': continue
            if s[:k].rstrip().endswith(')'): return k
    return -1


def files(root):
    return sorted(glob.glob(root + '/*.cpp'), key=lambda p: os.path.basename(p).lower())


if __name__ == '__main__':
    import sys
    tot = 0
    for p in files(sys.argv[1]):
        fs = parse(p)
        tot += len(fs)
        print(os.path.basename(p), len(fs), [f['name'] for f in fs][:6])
    print(tot)
