"""newstyle_pack.py: one new-style chibi outfit (client/recomp/ovr/newstyle.c) as the engine's checked packs.

    python3 -I newstyle_pack.py --render <dir> --merge <merge.dat> --code 01 [--body m] --out <dir>
    python3 -I newstyle_pack.py --check <pak> [--code 01]          (what the engine checks, from the command line)

--render is a renderer's output (the chibi3d renderer: ~/.cache/de-scratch/chibi3d tools/yugi3d.py): per clip (stand,
walk, gesture, duel), engine facing (s sw w nw n ne e se) and frame k, <clip>_<dir>_<kk>.png (the body only, 128 x 128
RGBA), skin_<clip>_<dir>_<kk>.png (its skin pixels) and anchors.json ({"anchors": {clip: {dir: [[x, y], ...]}}}: the
body's neck point per frame, a whole pixel).

Writes <out>/merge/data/avatar/chibi/c?_nb_<code>_c0S.pak for skin tones S = 1..3 (the legacy c?_bo_01_c0S bodies),
each one self-contained:
  - the outfit's 56 motion dumps, c?_nb_<code>_<motion><facing>.txt (newstyle_motions.py's writer, crop 'trim'):
    the same in every skin tone's pack;
  - its body frames, c?_nb_<code>_c0S_<code><facing>_<frame>.png: n (stand, 1), w (walk, 8), g (gesture, 8), d (duel
    stance, 6, facing 01 only, as the engine shows it); facings 01..08 = engine dirs 0..7, 06..08 stored flipped (the
    engine mirrors them back). Skin tones 2 / 3 recolour the skin pixels with an affine colour map fitted on the legacy
    bodies' c01 -> c0S pixel pairs;
  - one trimmed head per body frame, c?_nb_<code>_c0S_hs<code><facing>_<frame>.png: the player's legacy bald head (rows
    above the chin of c?_bo_01_c0S_n0F_01, F the legacy facing) minus its neck strip where the body's collar rises
    under it (~/.cache/de-scratch/chibi3d/out/slifer_opus/NECKFIX.md: skin pixels of the neck columns, in the skin run
    up from the cut row, at most 2 rows above the neck anchor, under the body's alpha; decided on skin tone 1 and the
    same pixels cut in every tone). The body is then cleared under the TRIMMED head only (clearing under the whole
    head would leave holes where the trim shows the collar).
The dumps name the template pictures cm_nb_00_c01_*; the engine renames them to the player's c?_nb_<code>_c0S_*.

Pack format (PAK_MAGIC; ovr/newstyle.c reads it, read_pak below is the same check): "YO2NSPK1", u32 count, then per
entry u8 name length, name (lower case [a-z0-9_.]), u8 method (0 stored, 1 zlib), u32 stored size, u32 size, u32
CRC-32 of the content; then the entries' data in that order. Little endian. The .txt dumps are zlib'd (~12x), the
PNGs stored.
"""
import argparse
import io
import json
import os
import re
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import newstyle_motions as NM   # noqa: E402

PAK_MAGIC = b'YO2NSPK1'
DIRS = ['s', 'sw', 'w', 'nw', 'n', 'ne', 'e', 'se']        # engine facings 1..8
LF = [1, 2, 3, 4, 5, 4, 3, 2]                               # their legacy facing (6..8: 4..2 mirrored)
CLIPS = {'n': 'stand', 'w': 'walk', 'g': 'gesture', 'd': 'duel'}
NECK_REF = NM.NECK_REF
HEAD_ROWS = {'cm': 53, 'cw': 55}    # the legacy bald head: rows above the chin (the female neck sits 2 rows lower)
# The legacy head's own neck point per legacy facing (rig-yugi legacy.head_layers on c?_n0F.txt frame 0: the chin
# row of c?_bo_01 and the neck's centre column, as the legacy movie places it): a frame's dump anchor is the body's
# neck point minus this plus NECK_REF, so the legacy chin lands on the new body's neck.
LEGACY_NECK = {
    'cm': {1: (63.5, 53.0), 2: (66.0, 53.0), 3: (65.5, 53.0), 4: (66.0, 51.0), 5: (64.5, 53.0)},
    'cw': {1: (63.5, 54.0), 2: (64.5, 55.0), 3: (64.5, 54.0), 4: (64.5, 53.0), 5: (63.5, 54.0)},
}
TRIM_ROWS = 2
NAME = re.compile(r'^[a-z0-9_.]{1,63}$')


# ---------------------------------------------------------------- the pack file

def write_pak(entries):
    """entries: [(name, bytes)] -> the pack's bytes."""
    head, data = [PAK_MAGIC, struct.pack('<I', len(entries))], []
    seen = set()
    for name, raw in entries:
        assert NAME.match(name) and name not in seen, name
        seen.add(name)
        method, stored = (1, zlib.compress(raw, 9)) if name.endswith('.txt') else (0, raw)
        nb = name.encode('ascii')
        head.append(struct.pack('<B', len(nb)) + nb + struct.pack('<BIII', method, len(stored), len(raw), zlib.crc32(raw)))
        data.append(stored)
    return b''.join(head + data)


def read_pak(blob):
    """The pack's {name: bytes}, every entry checked (its CRC, a PNG decodes as 128 x 128 RGBA); ValueError if not."""
    if blob[:8] != PAK_MAGIC or len(blob) < 12:
        raise ValueError('not a new-style pack')
    n, = struct.unpack_from('<I', blob, 8)
    if not 0 < n <= 4096:
        raise ValueError(f'{n} entries')
    at, ents = 12, []
    for _ in range(n):
        ln = blob[at]
        name = blob[at + 1:at + 1 + ln].decode('ascii', 'replace')
        method, stored, size, crc = struct.unpack_from('<BIII', blob, at + 1 + ln)
        if not NAME.match(name) or method > 1:
            raise ValueError(f'bad entry {name!r}')
        ents.append((name, method, stored, size, crc))
        at += 1 + ln + 13
    out = {}
    for name, method, stored, size, crc in ents:
        raw = blob[at:at + stored]
        at += stored
        if len(raw) != stored:
            raise ValueError(f'{name}: truncated')
        if method:
            raw = zlib.decompress(raw)
        if len(raw) != size or zlib.crc32(raw) != crc:
            raise ValueError(f'{name}: corrupt')
        if name in out:
            raise ValueError(f'{name}: twice')
        if name.endswith('.png'):
            from PIL import Image
            im = Image.open(io.BytesIO(raw))
            im.load()
            if im.size != (128, 128) or im.mode != 'RGBA':
                raise ValueError(f'{name}: {im.size} {im.mode}')
        out[name] = raw
    if at != len(blob):
        raise ValueError('trailing bytes')
    return out


def required(pre, code, skin):
    """Every name the engine needs in skin tone `skin`'s pack (ovr/newstyle.c checks the same list)."""
    names = [f'{pre}_nb_{code}_{n}' for n in NM.motion_files('m', stem='')]
    for c, count in NM.BODY_FRAMES.items():
        for f in (range(1, 9) if c != 'd' else (1,)):
            for k in range(1, count + 1):
                names += [f'{pre}_nb_{code}_c0{skin}_{c}{f:02d}_{k:02d}.png', f'{pre}_nb_{code}_c0{skin}_hs{c}{f:02d}_{k:02d}.png']
    return names


# ---------------------------------------------------------------- the pictures

def _png(arr):
    from PIL import Image
    b = io.BytesIO()
    Image.fromarray(arr, 'RGBA').save(b, 'PNG', optimize=True)
    return b.getvalue()


def _skin(a):
    r, g, b = (a[..., i].astype(int) for i in range(3))
    return (r > 150) & (r - g > 15) & (r - g < 120) & (g - b > 8) & (g > 95)


def shift(a, dx, dy):
    """a moved by (dx, dy) on its own canvas (what falls off is lost)."""
    import numpy as np
    out = np.zeros_like(a)
    H, W = a.shape[:2]
    ys, yd = (slice(0, H - dy), slice(dy, H)) if dy >= 0 else (slice(-dy, H), slice(0, H + dy))
    xs, xd = (slice(0, W - dx), slice(dx, W)) if dx >= 0 else (slice(-dx, W), slice(0, W + dx))
    out[yd, xd] = a[ys, xs]
    return out


def neck_trim_mask(hs, body, ay):
    """hs, body: placed 128 x 128 RGBA arrays; ay: the frame's neck anchor row. The hs pixels to drop: in the columns
    where hs reaches its cut row (the neck; elsewhere its bottom edge is the jaw), the skin run upward from that row,
    at most TRIM_ROWS above the anchor and under the body (NECKFIX.md)."""
    import numpy as np
    a = hs[..., 3] >= 128
    sk = a & _skin(hs)
    run = np.zeros_like(a)
    rows = np.nonzero(a.any(1))[0]
    if not len(rows):
        return run
    cut = rows.max()
    for x in np.nonzero(a[cut])[0]:
        y = cut
        while y >= 0 and sk[y, x]:
            run[y, x] = True
            y -= 1
    return run & (np.arange(128)[:, None] >= ay - TRIM_ROWS) & (body[..., 3] >= 128)


def skin_maps(chibi, pre):
    """{2: A, 3: A}: the affine map (4 x 3) from a c01 skin colour to tone S, fitted on the legacy body pictures' pixel
    pairs (the most frequent target colour per source colour)."""
    import numpy as np
    out = {}
    names = [n for n in chibi.names() if n.startswith(f'{pre}_bo_01_c01_') and n.endswith('.png')]
    for s in (2, 3):
        pairs = {}
        for name in names:
            other = name.replace('_c01_', f'_c0{s}_')
            if not chibi.has(other):
                continue
            a, b = chibi.rgba(name).reshape(-1, 4), chibi.rgba(other).reshape(-1, 4)
            ok = (a[:, 3] == 255) & (b[:, 3] == 255)
            for x, y in zip(map(tuple, a[ok, :3]), map(tuple, b[ok, :3])):
                d = pairs.setdefault(x, {})
                d[y] = d.get(y, 0) + 1
        keys = np.array(list(pairs), float)
        vals = np.array([max(v.items(), key=lambda kv: kv[1])[0] for v in pairs.values()], float)
        A, *_ = np.linalg.lstsq(np.c_[keys, np.ones(len(keys))], vals, rcond=None)
        out[s] = A
    return out


def recolour(img, mask, A):
    import numpy as np
    out = img.copy()
    px = img[mask][:, :3].astype(float)
    if len(px):
        out[mask, :3] = np.clip(np.c_[px, np.ones(len(px))] @ A, 0, 255).round().astype(np.uint8)
    return out


class Chibi:
    """The legacy chibi pictures, from merge.dat (--merge) or a folder of them (--chibi)."""

    def __init__(self, merge=None, folder=None):
        self.merge, self.folder = merge, folder

    def names(self):
        if self.folder:
            return sorted(os.listdir(self.folder))
        p = 'data/avatar/chibi/'
        return sorted(n[len(p):] for n in self.merge.toc if n.startswith(p))

    def has(self, name):
        return os.path.exists(os.path.join(self.folder, name)) if self.folder else f'data/avatar/chibi/{name}' in self.merge.toc

    def rgba(self, name):
        import numpy as np
        from PIL import Image
        if self.folder:
            im = Image.open(os.path.join(self.folder, name))
        else:
            im = Image.open(io.BytesIO(self.merge.read(f'data/avatar/chibi/{name}')))
        return np.asarray(im.convert('RGBA')).copy()


def pack(render, chibi, code, body='m'):
    """{skin tone: [(name, bytes)]}: the three packs' entries."""
    import numpy as np
    from PIL import Image
    pre = 'cw' if body == 'f' else 'cm'
    meta = json.load(open(os.path.join(render, 'anchors.json')))['anchors']
    maps = skin_maps(chibi, pre)
    heads = {(lf, s): chibi.rgba(f'{pre}_bo_01_c0{s}_n0{lf}_01.png') for lf in range(1, 6) for s in (1, 2, 3)}
    for h in heads.values():
        h[HEAD_ROWS[pre]:] = 0
    entries = {1: [], 2: [], 3: []}
    anchors = {}
    for c, clip in CLIPS.items():
        count = NM.BODY_FRAMES[c]
        rows = []
        for fi, d in enumerate(DIRS, 1):
            lf, mir = LF[fi - 1], fi >= 6
            got = meta[clip][d]
            if len(got) < count and clip != 'stand':
                raise ValueError(f'{clip} {d}: {len(got)} frames, {count} needed')
            fr = []
            for k in range(count):
                ax, ay = got[k if clip != 'stand' else 0]
                if mir:
                    ax = 127 - ax        # the stored picture is flipped
                hx, hy = LEGACY_NECK[pre][lf]
                dx, dy = int(round(ax - hx)), int(round(ay - hy))
                fr.append([NECK_REF[0] + dx, NECK_REF[1] + dy])
                if c == 'd' and fi != 1:
                    continue
                src = f'{clip}_{d}_{k if clip != "stand" else 0:02d}.png'
                img = np.asarray(Image.open(os.path.join(render, src)).convert('RGBA')).copy()
                skin = np.asarray(Image.open(os.path.join(render, 'skin_' + src))) > 127
                if img.shape != (128, 128, 4) or skin.shape != (128, 128):
                    raise ValueError(f'{src}: {img.shape}')
                if mir:
                    img, skin = img[:, ::-1].copy(), skin[:, ::-1].copy()
                cut = neck_trim_mask(shift(heads[lf, 1], dx, dy), img, ay)
                cut_own = shift(cut, -dx, -dy)            # the same pixels on the unplaced head
                for s in (1, 2, 3):
                    hs = heads[lf, s].copy()
                    hs[cut_own] = 0
                    im = img if s == 1 else recolour(img, skin, maps[s])
                    im = im.copy()
                    im[shift(hs[..., 3] > 0, dx, dy)] = 0  # nothing of the body above the trimmed head
                    entries[s].append((f'{pre}_nb_{code}_c0{s}_{c}{fi:02d}_{k + 1:02d}.png', _png(im)))
                    entries[s].append((f'{pre}_nb_{code}_c0{s}_hs{c}{fi:02d}_{k + 1:02d}.png', _png(hs)))
            rows.append(fr)
        anchors[c] = rows
    dumps = [(name, NM.motion_dump(m, f, anchors, 'trim'))
             for name, (m, f) in NM.motion_files(body, stem=f'{pre}_nb_{code}_').items()]
    return {s: dumps + e for s, e in entries.items()}, anchors


def placeholder_entries(code='99', skin=1):
    """A pack's entries with newstyle_motions.py's placeholder body (no game art): for the tests."""
    import tempfile
    import numpy as np
    from PIL import Image
    with tempfile.TemporaryDirectory() as tmp:
        anchors = NM.default_anchors()
        NM.placeholder(tmp, 'm', anchors)
        ents = [(name, NM.motion_dump(m, f, anchors, 'trim'))
                for name, (m, f) in NM.motion_files('m', stem=f'cm_nb_{code}_').items()]
        head = np.zeros((128, 128, 4), np.uint8)
        head[20:52, 48:80] = (255, 210, 180, 255)
        for f in sorted(os.listdir(tmp)):
            if f.startswith('cm_nb_00_c01_'):
                rest = f[len('cm_nb_00_c01_'):]
                ents.append((f'cm_nb_{code}_c0{skin}_{rest}', open(os.path.join(tmp, f), 'rb').read()))
                ents.append((f'cm_nb_{code}_c0{skin}_hs{rest}', _png(head)))
    return ents


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--render')
    ap.add_argument('--merge')
    ap.add_argument('--chibi', help='a folder of the legacy chibi pictures instead of --merge')
    ap.add_argument('--code', default='01')
    ap.add_argument('--body', default='m', choices=('m', 'f'))
    ap.add_argument('--out')
    ap.add_argument('--check')
    ap.add_argument('--placeholder', help='write a placeholder pack (no game art) to this file, for the engine tests')
    a = ap.parse_args()
    if a.placeholder:
        open(a.placeholder, 'wb').write(write_pak(placeholder_entries()))
        return
    if a.check:
        got = read_pak(open(a.check, 'rb').read())
        m = re.search(r'(c[mw])_nb_(\d\d)_c0(\d)\.pak$', a.check)
        missing = [n for n in required(*m.groups()) if n not in got] if m else []
        print(f'{a.check}: {len(got)} entries ok' + (f', MISSING {missing[:5]}' if missing else ''))
        sys.exit(1 if missing else 0)
    if not (a.render and a.out and (a.merge or a.chibi)):
        ap.error('--render, --out and --merge (or --chibi) are required')
    merge = None
    if a.merge:
        from cardart import Merge
        merge = Merge(a.merge)
    packs, anchors = pack(a.render, Chibi(merge, a.chibi), a.code, a.body)
    pre = 'cw' if a.body == 'f' else 'cm'
    dest = os.path.join(a.out, 'merge', 'data', 'avatar', 'chibi')
    os.makedirs(dest, exist_ok=True)
    for s, ents in packs.items():
        blob = write_pak(ents)
        got = read_pak(blob)
        missing = [n for n in required(pre, a.code, s) if n not in got]
        if missing:
            raise SystemExit(f'pack c0{s}: missing {missing[:5]}')
        p = os.path.join(dest, f'{pre}_nb_{a.code}_c0{s}.pak')
        open(p, 'wb').write(blob)
        print(f'{p}: {len(ents)} entries, {len(blob)} bytes')


if __name__ == '__main__':
    main()
