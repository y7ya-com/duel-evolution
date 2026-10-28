"""Patch a Shift-JIS/CRLF yaneSDK file: python3 patch.py <file> <json list of [old,new]> (UTF-8 text, LF)."""
import sys, json
p = sys.argv[1]
edits = json.load(open(sys.argv[2])) if sys.argv[2].endswith('.json') else json.loads(sys.argv[2])
b = open(p, 'rb').read()
crlf = b'\r\n' in b
t = b.decode('cp932')
for old, new in edits:
    if crlf: old, new = old.replace('\n', '\r\n'), new.replace('\n', '\r\n')
    n = t.count(old)
    if n != 1: sys.exit(f'{p}: expected 1 match, got {n}: {old[:80]!r}')
    t = t.replace(old, new)
open(p, 'wb').write(t.encode('cp932'))
print('patched', p, len(edits))
