"""The CSS for avatar.js's plates, from the game's atlases (owner's skin rule: sharp at 2x).

    python3 -I client/web-shell/htmlui/tools/plates.py <dir with the abmake_btn_*.png atlases>

Prints one rule per look of each atlas: two gradients sampled as the engine draws the 1:1 sprite (every pixel the
alpha-weighted mean of texels x-1..x, y-1..y, clamped at the cell's top / left edge): the middle column top to bottom,
sized to the span between the edge columns, and the edge columns at the middle row over it; a radius from the corner's
see-through texels. Paste the output into screens/avatar.js's CSS. Reads the atlases only (data/scene/avatarchange in
merge.dat; never in git) and writes colour numbers.
"""
import os, struct, sys, zlib

# the plates: atlas, cell width, looks (normal, hover, chosen / pressed)
ATLASES = [('abmake_btn_01_c01', 324, 3), ('abmake_btn_01_c02', 324, 3), ('abmake_btn_01_c03', 324, 3),
           ('abmake_btn_01_c04', 324, 3), ('abmake_btn_02_01', 254, 3), ('abmake_btn_03_01', 162, 3)]


def load(path):   # an 8-bit RGB / RGBA PNG -> (w, h, rows of (r, g, b, a))
    d = open(path, 'rb').read()
    i, idat = 8, b''
    while i < len(d):
        n, t = struct.unpack('>I4s', d[i:i + 8])
        c = d[i + 8:i + 8 + n]
        i += 12 + n
        if t == b'IHDR':
            w, h, depth, kind = struct.unpack('>IIBB', c[:10])
            assert depth == 8 and kind in (2, 6), path
            bp = 4 if kind == 6 else 3
        elif t == b'IDAT':
            idat += c
    raw, s, prev, rows, o = zlib.decompress(idat), w * bp, bytearray(w * bp), [], 0
    for _ in range(h):
        f, line = raw[o], bytearray(raw[o + 1:o + 1 + s])
        o += 1 + s
        for x in range(s):
            a, b, c = line[x - bp] if x >= bp else 0, prev[x], prev[x - bp] if x >= bp else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append([tuple(line[x:x + bp]) + ((255,) if bp == 3 else ()) for x in range(0, s, bp)])
        prev = line
    return w, h, rows


def colour(p):
    if p[3] < 2: return 'transparent'
    if p[3] > 253: return '#%02x%02x%02x' % tuple(round(c) for c in p[:3])
    return 'rgba(%d, %d, %d, %.2f)' % (*(round(c) for c in p[:3]), p[3] / 255)


def look(rows, cw, col):
    ox, h, mid, m = col * cw, len(rows), cw // 2, len(rows) // 2
    def px(x, y):
        ts = [rows[max(yy, 0)][ox + max(xx, 0)] for yy in (y - 1, y) for xx in (x - 1, x)]
        a = sum(t[3] for t in ts)
        return ([sum(t[i] * t[3] for t in ts) / a for i in range(3)] if a else [0, 0, 0]) + [a / 4]
    far = lambda p, q: max(abs(p[i] - q[i]) for i in range(3)) > 4
    v = ', '.join(f'{colour(px(mid, y))} {y + 0.5}px' for y in range(h))
    ref, L, R = px(mid, m), 0, 0
    while L < cw // 4 and far(px(L, m), ref): L += 1
    while R < cw // 4 and far(px(cw - 1 - R, m), ref): R += 1
    hs = [f'{colour(px(x, m))} {x + 0.5}px' for x in range(L)] + [f'transparent {L}px', f'transparent calc(100% - {R}px)'] + \
         [f'{colour(px(cw - 1 - k, m))} calc(100% - {k + 0.5}px)' for k in reversed(range(R))]
    rad = 0
    while rad < 8 and px(rad, 0)[3] < 128: rad += 1
    return rad, f"linear-gradient(to right, {', '.join(hs)}), linear-gradient(to bottom, {v}) {L}px 0 / calc(100% - {L + R}px) 100% no-repeat"


for name, cw, looks in ATLASES:
    _, _, rows = load(os.path.join(sys.argv[1], name + '.png'))
    for col in range(looks):
        rad, bg = look(rows, cw, col)
        print(f":is(#htmlui-host, body) .av-plate[data-tex={name}][data-col='{col}'] {{ border-radius: {rad}px; background: {bg}; }}")
