"""wasmnames.py <file.wasm> <names.json>: prints the function indices (JSON list) of the names given, from the wasm's
"name" section. Stack traces show the index on every engine ("wasm-function[N]"), but WebKit drops the name of many
frames, so web/yieldguard.js checks indices."""
import json
import sys


def leb(b, i):
    r = s = 0
    while True:
        x = b[i]
        i += 1
        r |= (x & 0x7F) << s
        s += 7
        if x < 0x80:
            return r, i


wasm, want = open(sys.argv[1], "rb").read(), json.load(open(sys.argv[2]))
names, i = {}, 8
while i < len(wasm):
    sid, size = wasm[i], 0
    size, i = leb(wasm, i + 1)
    end = i + size
    if sid == 0:
        n, j = leb(wasm, i)
        if wasm[j:j + n] == b"name":
            j += n
            while j < end:
                sub, ssize = wasm[j], 0
                ssize, j = leb(wasm, j + 1)
                if sub == 1:   # function names
                    count, k = leb(wasm, j)
                    for _ in range(count):
                        idx, k = leb(wasm, k)
                        ln, k = leb(wasm, k)
                        names[wasm[k:k + ln].decode("utf-8", "replace")] = idx
                        k += ln
                j += ssize
    i = end
missing = [n for n in want if n not in names]
if missing:
    sys.exit(f"wasmnames: not in {sys.argv[1]}'s name section: {missing}")
print(json.dumps(sorted(names[n] for n in want)))
