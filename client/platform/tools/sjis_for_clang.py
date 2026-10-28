"""Make Shift-JIS C/C++ sources (yaneSDK, the game) compile under clang, which has no -finput-charset.

    python3 -I sjis_for_clang.py <src_dir> <out_dir> <relative files...>

MSVC (code page 932) and GCC (-finput-charset=CP932) read these files as Shift-JIS. Clang reads bytes, so a
double-byte character whose trail byte is 0x5C ('\\', e.g. 表, 機能) turns into a line continuation at the end of a
// comment, or an escape inside a string. The output keeps the meaning MSVC gave each byte:
  - comments: decoded to UTF-8
  - "narrow" and 'c' literals: every non-ASCII byte as an octal escape, so the runtime bytes stay Shift-JIS
  - L"wide" and L'c' literals: \\uXXXX escapes, the UTF-16 MSVC would have produced
Everything else is copied byte for byte; files that are pure ASCII are copied unchanged.
"""
import os
import sys


def lead(b):
    return 0x81 <= b <= 0x9F or 0xE0 <= b <= 0xFC


def convert(data):
    if all(b < 0x80 for b in data):
        return data
    out = bytearray()
    i, n = 0, len(data)
    state = None   # None | 'line' | 'block' | ('str', quote, wide)
    while i < n:
        b = data[i]
        if state is None:
            if data.startswith(b"//", i):
                state = "line"; out += b"//"; i += 2; continue
            if data.startswith(b"/*", i):
                state = "block"; out += b"/*"; i += 2; continue
            if b in (0x22, 0x27):   # " '
                wide = i > 0 and data[i - 1:i] == b"L" and (i < 2 or not (chr(data[i - 2]).isalnum() or data[i - 2] == 0x5F))
                state = ("str", b, wide); out.append(b); i += 1; continue
            if b >= 0x80 and lead(b) and i + 1 < n:   # stray Shift-JIS in code (rare): keep the bytes
                out += data[i:i + 2]; i += 2; continue
            out.append(b); i += 1; continue
        if state in ("line", "block"):
            if state == "line" and b in (0x0D, 0x0A):
                state = None; out.append(b); i += 1; continue
            if state == "block" and data.startswith(b"*/", i):
                state = None; out += b"*/"; i += 2; continue
            if b >= 0x80:
                k = 2 if lead(b) and i + 1 < n else 1
                out += data[i:i + k].decode("cp932", "replace").encode("utf-8"); i += k; continue
            out.append(b); i += 1; continue
        _, quote, wide = state
        if b == 0x5C:   # an escape sequence: copy it as is (ASCII backslash, not a trail byte)
            out += data[i:i + 2]; i += 2; continue
        if b == quote or b in (0x0D, 0x0A):
            state = None; out.append(b); i += 1; continue
        if b >= 0x80:
            k = 2 if lead(b) and i + 1 < n else 1
            if wide:
                for ch in data[i:i + k].decode("cp932", "replace"):
                    out += b"\\u%04x" % ord(ch)
            else:
                for x in data[i:i + k]:
                    out += b"\\%03o" % x
            i += k; continue
        out.append(b); i += 1
    return bytes(out)


def main():
    src, dst, files = sys.argv[1], sys.argv[2], sys.argv[3:]
    for rel in files:
        data = open(os.path.join(src, rel), "rb").read()
        conv = convert(data)
        path = os.path.join(dst, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if os.path.exists(path) and open(path, "rb").read() == conv:
            continue   # keep the timestamp: no rebuild
        open(path, "wb").write(conv)


def selftest():
    sj = "表示".encode("cp932")   # 95 5c 8e a6: trail byte 0x5c
    src = b'a(); // ' + sj + b'\r\nb();\r\nc("' + sj + b'");\r\nd(L"' + sj + b'");\r\n'
    got = convert(src)
    assert b"b();" in got.split(b"\n")[1], got   # the comment no longer swallows the next line
    assert b'c("\\225\\134\\216\\246")' in got, got
    assert b'd(L"\\u8868\\u793a")' in got, got
    assert convert(b'e("\\n");') == b'e("\\n");'


if __name__ == "__main__":
    selftest()
    main()
