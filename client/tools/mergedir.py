"""mergedir.py <merge.dat> <out>: merge.dat's directory as a gzip sidecar for the web client (web/lazyfs.js).

The directory (KCEJYUGI: 12-byte header, then 268 bytes per entry, ~19k entries, mostly nibble-swapped names) is 5.2 MB
of merge.dat's first chunks, read before the title on every cold boot; gzip -9 makes it ~250 KB. lazyfs fetches
<merge.dat>.dir.gz next to merge.dat, gunzips it (DecompressionStream) and uses it only when it matches this merge.dat;
without it (or a stale one) it reads the chunks as before.

Sidecar, before gzip: b"YO2DIR1\\0", u64 merge.dat's size (LE), then merge.dat's bytes [0, 12 + count * 268).
Prints the out file's size and md5 (for the upload).
"""
import gzip
import hashlib
import struct
import sys

src, out = sys.argv[1], sys.argv[2]
with open(src, "rb") as f:
    head = f.read(12)
    assert head[:8] == b"KCEJYUGI", src
    count = struct.unpack("<I", head[8:12])[0]
    f.seek(0, 2)
    size = f.tell()
    f.seek(0)
    directory = f.read(12 + count * 268)
data = gzip.compress(b"YO2DIR1\0" + struct.pack("<Q", size) + directory, 9, mtime=0)   # mtime 0: the same bytes every run
with open(out, "wb") as f:
    f.write(data)
print(f"{out}: {len(data)} bytes, md5 {hashlib.md5(data).hexdigest()} ({count} entries, merge.dat {size} bytes)")
