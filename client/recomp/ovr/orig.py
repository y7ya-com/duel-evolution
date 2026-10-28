"""orig.py <list> <out dir>: print a C file holding the recompiled bodies of the functions named in <list> (one hex
address per line, '#' comments) as o_XXXXXXXX, so an override of f_XXXXXXXX can still call the original. Generated
from out/ at build time (Konami-derived: never committed)."""
import glob, re, sys

want = {l.split('#')[0].strip().lower().removeprefix('0x').zfill(8) for l in open(sys.argv[1])} - {'00000000', ''}
print('#include "rc.h"\n#include "rc_funcs.h"\n')
found = set()
for path in sorted(glob.glob(f'{sys.argv[2]}/rc_[0-9]*.c')):
    lines, body = open(path).read().split('\n'), None
    for line in lines:
        if body is None:
            m = re.match(r'RC_FUNC\(f_([0-9a-f]{8})\) \{$', line)
            if m and m.group(1) in want:
                body = [f'void o_{m.group(1)}(CPU *restrict c) {{']
                found.add(m.group(1))
        else:
            body.append(line)
            if line == '}':
                print('\n'.join(body) + '\n')
                body = None
missing = want - found
if missing: sys.exit(f'orig.py: not found: {sorted(missing)}')
