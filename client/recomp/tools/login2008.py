"""login2008.py <shot.png>...: exit 1 if any screenshot (1024 x 768, the game's frame) shows the 2008 User ID /
Password dialog. rt/session.cpp turns that dialog into Duel Evolution's sign-in panel; this is the outside check that
it never shows as it was. The 2008 dialog's sign: its OK and Cancel buttons, two near-white boxes side by side at
(377-455, 481-503) and (537-615, 481-503); the panel has its links row there (text on the window's blue)."""
import struct, sys, zlib


def rgb(path):   # 8-bit RGB/RGBA PNG, not interlaced -> (w, h, rows of bytes, bytes per pixel)
    d = open(path, 'rb').read()
    w, h, depth, ctype = struct.unpack('>IIBB', d[16:26])
    assert depth == 8 and ctype in (2, 6), f'{path}: 8-bit RGB(A) only'
    bpp, i, z = (3 if ctype == 2 else 4), 8, b''
    while i < len(d):
        n, t = struct.unpack('>I4s', d[i:i + 8])
        if t == b'IDAT': z += d[i + 8:i + 8 + n]
        i += 12 + n
    raw, rows, prev, stride = zlib.decompress(z), [], bytearray(w * bpp), w * bpp
    for y in range(h):
        f, line = raw[y * (stride + 1)], bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            b, c = prev[x], prev[x - bpp] if x >= bpp else 0
            p = a + b - c
            pr = a if abs(p - a) <= abs(p - b) and abs(p - a) <= abs(p - c) else b if abs(p - b) <= abs(p - c) else c
            line[x] = (line[x] + (0, a, b, (a + b) // 2, pr)[f]) & 255
        rows.append(line)
        prev = line
    return w, h, rows, bpp


def white(rows, bpp, sx, sy, x0, y0, x1, y1):   # share of near-white pixels in a box given in game pixels
    n = hit = 0
    for y in range(int(y0 * sy), int(y1 * sy)):
        for x in range(int(x0 * sx), int(x1 * sx)):
            r, g, b = rows[y][x * bpp:x * bpp + 3]
            n += 1
            hit += min(r, g, b) > 225
    return hit / n


def is_2008(path):
    w, h, rows, bpp = rgb(path)
    sx, sy = w / 1024, h / 768
    return min(white(rows, bpp, sx, sy, 382, 485, 450, 499), white(rows, bpp, sx, sy, 542, 485, 610, 499)) > 0.4


if __name__ == '__main__':
    bad = [p for p in sys.argv[1:] if is_2008(p)]
    for p in bad: print('2008 login dialog in', p)
    sys.exit(1 if bad else 0)
