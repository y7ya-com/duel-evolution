"""The 242 Flash text dumps in merge.dat (every .txt holding "SWF::Element"), extracted once into a cache directory.
Used by tests/swf/run.py and harness/difftest/cases_swf.py.

    YO2_MERGE_DAT  merge.dat of Ver.080912 (KCEJYUGI container)
    YO2_SWF_DUMPS  cache directory (default: swfdump/ next to YO2_EXE's yo2.exe)"""
import os
import struct

MERGE = os.environ.get("YO2_MERGE_DAT", "/Users/y/Documents/GitHub/duel-evolution-restore/extraction/recovery/merge.dat")
EXE = os.environ.get("YO2_EXE", "/Users/y/Documents/GitHub/yo2-decomp-data/yo2.exe")
CACHE = os.environ.get("YO2_SWF_DUMPS", os.path.join(os.path.dirname(EXE), "swfdump"))
_SWAP = bytes(((x & 15) << 4) | (x >> 4) for x in range(256))   # TOC names are nibble-swapped


def _lzss(src, size):   # Okumura LZSS: 4 KB ring from 0xFEE, flag bit 1 = literal, refs are 12-bit offset + 4-bit len
    ring, r, out, i = bytearray(4096), 0xFEE, bytearray(), 0
    while i < len(src) and len(out) < size:
        flags, i = src[i], i + 1
        for bit in range(8):
            if i >= len(src) or len(out) >= size:
                break
            if flags >> bit & 1:
                chunk, i = src[i:i + 1], i + 1
            else:
                b1, b2, i = src[i], src[i + 1], i + 2
                off = b1 | (b2 & 0xF0) << 4
                chunk = bytearray()
                for k in range((b2 & 15) + 3):
                    c = ring[(off + k) & 0xFFF]
                    chunk.append(c)
                    ring[r], r = c, (r + 1) & 0xFFF
                out += chunk
                continue
            out += chunk
            ring[r], r = chunk[0], (r + 1) & 0xFFF
    return bytes(out[:size])


def dumps():
    """Sorted paths of the extracted dumps (extracting them first if the cache is empty)."""
    if not os.path.isdir(CACHE):
        with open(MERGE, "rb") as f:
            assert f.read(8) == b"KCEJYUGI", MERGE
            n = struct.unpack("<I", f.read(4))[0]
            toc = [(struct.unpack_from("<III", rec, 256), rec[:256].translate(_SWAP).split(b"\0")[0].decode("cp932"))
                   for rec in (f.read(268) for _ in range(n))]
            for (off, size, stored), name in toc:
                if not name.lower().endswith(".txt"):
                    continue
                f.seek(off)
                data = f.read(stored)
                data = data if size == stored else _lzss(data, size)
                if b"SWF::Element" in data:
                    p = os.path.join(CACHE, *name.split("\\"))
                    os.makedirs(os.path.dirname(p), exist_ok=True)
                    with open(p, "wb") as o:
                        o.write(data)
    return sorted(os.path.join(d, f) for d, _, fs in os.walk(CACHE) for f in fs)


def lines(path):
    """yaneSDK CFile::ReadLine: lines end at CR LF only; a final CR LF does not start another line."""
    data = open(path, "rb").read()
    out = data.split(b"\r\n")
    return out[:-1] if data.endswith(b"\r\n") or not data else out


if __name__ == "__main__":
    print(len(dumps()), CACHE)
