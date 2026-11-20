"""newstyle_motions.py: the SWF motion dumps of a new-style chibi body (client/recomp/ovr/newstyle.c), and a
placeholder body to test them with.

    python3 -I newstyle_motions.py <out folder> [--rig rig.json] [--placeholder] [--crop png|shape|trim]

A real outfit is packed by newstyle_pack.py (its own 56 dumps, its body frames and trimmed heads per skin tone, in one
checked .pak per skin tone); this file is the dump writer it uses, and the placeholder body for engine tests.

writes, for each body in the rig (m, f):
  <out>/nm_{n,w,g,t}01..08.txt, nm_d01_01..03.txt   (female nw_*): the 56 motion files ovr/newstyle.c loads, in the
      game's own dump format (Perl SWF::File text + PngFileTable, CRLF; src/Swf/yo2SwfReader.cpp reads it)
  <out>/c?_nb_00_c01_<motion><dir>_<frame>.png        with --placeholder: a test body per frame (facing, frame number
      and an arrow showing the facing drawn on it)
  <out>/newstyle.txt                                   with --placeholder: the outfit table (body, clothes, code)

The motion files only reference PNG names; no game art is copied. The player's own head comes from the legacy template
names (cm_h1_01_c01_n0F_01, ...), which the exe's applyMaleParts / applyFemaleParts rewrite into the player's parts,
and from the head of the body picture cm_bo_01_c01_n0F_01 (rows 0..HEAD_ROWS-1: the bald head in the player's skin
colour). --crop shape (default) draws that head through a DefineShape whose bounds cover only those rows (no new
files); --crop png names a pre-cut head picture cm_hs_01_c01_n0F_01 instead (made from the archive at pack time);
--crop trim names one pre-cut head per body frame (newstyle_pack.py: its neck strip trimmed under the collar).

Rig (JSON; the defaults below are the placeholder's): per body motion code (n stand, w walk, g gesture, d duel; the
frame counts are MOTIONS') and per facing (1..8, engine dirs 0..7: 1 front, 3 facing left, 5 back, 7 facing right) and frame
the neck anchor [x, y] in the 128 x 128 body picture's pixels. Body frames of facings 6..8 are stored mirrored (the
engine mirrors facings 6..8 as a whole, and their head is the legacy 4..2 art mirrored, as for a legacy avatar).
"""
import argparse, json, math, os, sys

# legacy facing (1..5) and its draw order for each engine facing 1..8 (6..8 use 4..2: the engine mirrors them)
LEGACY_FACING = [1, 2, 3, 4, 5, 4, 3, 2]
# The draw order, bottom first, per legacy facing (rig-yugi pack.py HEAD_OVER_BODY): the player's legacy head is always
# drawn over the new-style body (the legacy movies drew the body over the bald head, so a new body's collar cut into
# the chin); among the head layers the legacy order stays: the back hair behind the head where the legacy movie has it
# there (facings 1, 2: under the body too), over the head from the side and the back.
ORDER = {
    1: ['h2', 'body', 'hs', 'mo', 'ey', 'a1', 'a2', 'h1'],
    2: ['h2', 'body', 'hs', 'mo', 'ey', 'a1', 'a2', 'h1'],
    3: ['body', 'hs', 'h2', 'mo', 'ey', 'a1', 'a2', 'h1'],
    4: ['body', 'hs', 'mo', 'ey', 'a1', 'a2', 'h2', 'h1'],
    5: ['body', 'hs', 'h1', 'h2'],
}
BODY_AT = (-18, 8)          # where every legacy 128 x 128 body layer is placed (stage px)
FACE_AT = (14, 8)           # the 64 x 64 face layers (mo, ey, a1, a2)
HAIR_AT = (-18, -20)        # the 128 x 128 hair layers (h1, h2)
DISK_AT = (14, 52)          # the duel disk (dd_01_c01_d01_0N, 64 x 64)
NECK_REF = (64, 52)         # the legacy standing head's chin in its body picture: the head is placed so this point
HEAD_ROWS = 53              # sits on the new frame's neck anchor; rows 0..52 of bo_01 are the head (chin at ~52)
SIZE = {'body': 128, 'hs': 128, 'h1': 128, 'h2': 128, 'mo': 64, 'ey': 64, 'a1': 64, 'a2': 64, 'dd': 64}

# name: (body frames, SWF frames in all, the body frames' motion code). The SWF frame counts are the legacy dumps'
# (cm_n01 1, cm_g01 23, cm_t01 12, cm_d01_01..03 35 / 30 / 12) except the walk: 8 drawings x 3 (legacy 20), which
# loops. Body frame k of SWF frame t is t * frames // total. t (the idle blink) shows the stand frame.
MOTIONS = {
    'n': (1, 1, 'n'), 'w': (8, 24, 'w'), 'g': (8, 23, 'g'), 't': (1, 12, 'n'),
    'd01_01': (6, 35, 'd'), 'd01_02': (6, 30, 'd'), 'd01_03': (6, 12, 'd'),
}
BODY_FRAMES = {code: count for count, _, code in MOTIONS.values()}   # n 1, w 8, g 8, d 6


def default_anchors():
    """The placeholder's neck anchors: the walk bobs (2 px) and sways on the side facings, the gesture and duel
    breathe (1 px)."""
    a = {}
    for code, count in BODY_FRAMES.items():
        rows = []
        for f in range(1, 9):
            side = 0 if f in (1, 5) else 1
            fr = []
            for k in range(count):
                if code == 'w':
                    ph = k / count * 2 * math.pi
                    fr.append([NECK_REF[0] + round(side * math.sin(ph)), NECK_REF[1] + 1 - round(1.5 * abs(math.sin(ph)) + 0.5)])
                elif code in ('g', 'd'):
                    fr.append([NECK_REF[0], NECK_REF[1] + (1 if k % 4 in (1, 2) else 0)])
                else:
                    fr.append(list(NECK_REF))
            rows.append(fr)
        a[code] = rows
    return a


# ---------------------------------------------------------------- the dump writer

class Dump:
    def __init__(self):
        self.pngs, self.out, self.next_id, self.chars = [], [], 1, {}

    def w(self, s=''):
        self.out.append(s)

    def png(self, name):
        if name not in self.pngs:
            self.pngs.append(name)
        return self.pngs.index(name)

    def char(self, name, size, rows=None):
        """The sprite character showing picture `name` (size x size), rows: only its first `rows` rows."""
        key = (name, rows)
        if key in self.chars:
            return self.chars[key]
        fn = self.png(name)
        sw, sh = size if isinstance(size, tuple) else (size, size)
        bid, sid, spid = self.next_id, self.next_id + 1, self.next_id + 2
        self.next_id += 3
        tw, th = sw * 20, (rows or sh) * 20
        w = self.w
        w('SWF::Element::Tag::DefineBitsLossless->new(')
        w(f'    CharacterID => {bid},'); w(f'    FileName => {fn},'); w('    BitmapFormat => 5,')
        w(f'    BitmapWidth => {sw},'); w(f'    BitmapHeight => {sh},'); w(')')
        w('SWF::Element::Tag::DefineShape->new(')
        w(f'    ShapeID => {sid},')
        w('    ShapeBounds => SWF::Element::RECT->new(')
        w('        Xmin => 0,'); w('        Ymin => 0,'); w(f'        Xmax => {tw},'); w(f'        Ymax => {th},'); w('    ),')
        w('    Shapes => SWF::Element::SHAPEWITHSTYLE1->new(')
        w('        FillStyles => SWF::Element::Array::FILLSTYLEARRAY1->new([')
        w('            SWF::Element::FILLSTYLE1->new(')
        w('                FillStyleType => 65,'); w(f'                BitmapID => {bid},')
        w('                BitmapMatrix => SWF::Element::MATRIX->new(')
        for k, v in (('ScaleX', 20), ('ScaleY', 20), ('RotateSkew0', 0), ('RotateSkew1', 0), ('TranslateX', 0), ('TranslateY', 0)):
            w(f'                    {k} => {v},')
        w('                ),'); w('            ),\t\t\t# 0'); w('        ]),')
        w('        ShapeRecords => SWF::Element::Array::SHAPERECORDARRAY1->new([')
        w('            SWF::Element::SHAPERECORD1::STYLECHANGERECORD->new('); w('                FillStyle1 => 1,'); w('            ),\t\t\t# 0')
        for i, (dx, dy) in enumerate(((tw, 0), (0, th), (-tw, 0), (0, -th)), 1):
            w('            SWF::Element::SHAPERECORDn::STRAIGHTEDGERECORD->new(')
            w(f'                DeltaX => {dx},'); w(f'                DeltaY => {dy},'); w(f'            ),\t\t\t# {i}')
        w('        ]),'); w('    ),'); w(')')
        w('SWF::Element::Tag::DefineSprite->new(')
        w(f'    SpriteID => {spid},'); w('    FrameCount => 1,')
        w('    ControlTags => SWF::Element::Array::TAGARRAY->new([')
        w('        SWF::Element::Tag::PlaceObject2->new(')
        w('            Flags => 6,'); w('            Depth => 1,'); w(f'            CharacterID => {sid},')
        w('            Matrix => SWF::Element::MATRIX->new(')
        for k, v in (('ScaleX', 1), ('ScaleY', 1), ('RotateSkew0', 0), ('RotateSkew1', 0), ('TranslateX', 0), ('TranslateY', 0)):
            w(f'                {k} => {v},')
        w('            ),'); w('        ),\t\t\t# 0')
        w('        SWF::Element::Tag::ShowFrame->new('); w('        ),\t\t\t# 1')
        w('        SWF::Element::Tag::End->new('); w('        ),\t\t\t# 2')
        w('    ]),'); w(')')
        self.chars[key] = spid
        return spid

    def place(self, depth, cid, x, y, name=None):
        w = self.w
        w('SWF::Element::Tag::PlaceObject2->new(')
        w(f'    Flags => {38 if name else 6},'); w(f'    Depth => {depth},'); w(f'    CharacterID => {cid},')
        w('    Matrix => SWF::Element::MATRIX->new(')
        for k, v in (('ScaleX', 1), ('ScaleY', 1), ('RotateSkew0', 0), ('RotateSkew1', 0), ('TranslateX', round(x * 20)), ('TranslateY', round(y * 20))):
            w(f'        {k} => {v},')
        w('    ),')
        if name:
            w(f'    Name => "{name}",')
        w(')')

    def remove(self, depth):
        self.w('SWF::Element::Tag::RemoveObject2->new('); self.w(f'    Depth => {depth},'); self.w(')')

    def text(self, frames):
        head = ['PngFileTable = {'] + [f'\tpng => {p},' for p in self.pngs] + [')', '', 'Header:', 'SIGNATURE = CWS',
                'VERSION = 7', 'File length = 0', 'Rect size = (0, 0)-(1840, 2720)', 'Frame rate = 30',
                f'Frame count = {frames}', '']
        return '\r\n'.join(head + self.out + ['SWF::Element::Tag::End->new(', ')', '']).encode('ascii')


def motion_dump(motion, facing, anchors, crop, body_prefix='nb_00_c01'):
    """The dump of `motion` ('n', 'w', ..., 'd01_02') for engine facing 1..8 (all frames of a d motion face front).
    crop: how the bald head is drawn: 'shape' (cm_bo_01 clipped to its head rows), 'png' (the pre-cut head
    cm_hs_01_c01_n0F_01) or 'trim' (a pre-cut head per body frame, its neck strip trimmed where the body's collar
    rises under it: cm_<body_prefix>_hs<code><facing>_<frame>.png, renamed with the body frames)."""
    count, total, code = MOTIONS[motion]
    if code == 'd':
        facing = 1
    lf = LEGACY_FACING[facing - 1]
    order = ORDER[lf] + (['dd'] if code == 'd' else [])
    d = Dump()
    d.place(1, d.char('cm_atari_01.png', (48, 24)), 22, 104, name='cm_atari_01_mc')   # the hit area the lobby clicks
    d.place(3, d.char('cm_sh_01_c01_n01_01.png', 64), 14, 84)
    shown = {}
    anc = anchors[code][facing - 1]
    for t in range(total):
        k = t * count // total
        ax, ay = anc[k % len(anc)]
        dx, dy = ax - NECK_REF[0], ay - NECK_REF[1]
        frame = k % len(anc) + 1
        layers = {}
        for i, kind in enumerate(order):
            depth = 5 + 2 * i
            if kind == 'body':
                layers[depth] = (f'cm_{body_prefix}_{code}{facing:02d}_{frame:02d}.png', 128, None, *BODY_AT)
            elif kind == 'hs':
                if crop == 'trim':
                    layers[depth] = (f'cm_{body_prefix}_hs{code}{facing:02d}_{frame:02d}.png', 128, None, BODY_AT[0] + dx, BODY_AT[1] + dy)
                elif crop == 'png':
                    layers[depth] = (f'cm_hs_01_c01_n{lf:02d}_01.png', 128, None, BODY_AT[0] + dx, BODY_AT[1] + dy)
                else:
                    layers[depth] = (f'cm_bo_01_c01_n{lf:02d}_01.png', 128, HEAD_ROWS, BODY_AT[0] + dx, BODY_AT[1] + dy)
            elif kind in ('h1', 'h2'):
                pic = f'n{lf:02d}_01'
                if kind == 'h2' and code == 'w':   # the back hair sways: legacy w0F_01 / _02 by quarter of the cycle
                    pic = f'w{lf:02d}_{1 + (k * 4 // count) % 2:02d}'
                layers[depth] = (f'cm_{kind}_01_c01_{pic}.png', 128, None, HAIR_AT[0] + dx, HAIR_AT[1] + dy)
            elif kind == 'dd':
                if motion == 'd01_01':
                    n = None if t < 6 else 1 if t < 10 else 2 if t < 14 else 3 if t < 18 else 4
                else:
                    n = 4 if motion == 'd01_02' else 2
                if n:
                    layers[depth] = (f'cm_dd_01_c01_d01_{n:02d}.png', 64, None, *DISK_AT)
            else:
                pic = f'n{lf:02d}_01'
                if kind == 'ey' and motion == 't':   # the blink: legacy t0F's eye frames
                    pic = f'n{lf:02d}_{2 if t < 4 or t >= 8 else 3:02d}'
                layers[depth] = (f'cm_{kind}_01_c01_{pic}.png', 64, None, FACE_AT[0] + dx, FACE_AT[1] + dy)
        for depth in sorted(set(shown) | set(layers)):
            if shown.get(depth) == layers.get(depth):
                continue
            if depth in shown:
                d.remove(depth)
            if depth in layers:
                name, size, rows, x, y = layers[depth]
                d.place(depth, d.char(name, size, rows), x, y)
        shown = layers
        d.w('SWF::Element::Tag::ShowFrame->new('); d.w(')')
    return d.text(total)


def motion_files(body, stem=None):
    """{file name: (motion, facing)} for the 56 engines (ovr/newstyle.c motion_file). stem: the name before the
    motion, default nm_ / nw_ (the prototype's shared set); one outfit's own set is "cm_nb_<code>_"."""
    p = stem if stem is not None else ('nm_' if body == 'm' else 'nw_')
    out = {}
    for m in 'nwgt':
        for f in range(1, 9):
            out[f'{p}{m}{f:02d}.txt'] = (m, f)
    for i in (1, 2, 3):
        out[f'{p}d01_{i:02d}.txt'] = (f'd01_{i:02d}', 1)
    return out


# ---------------------------------------------------------------- the placeholder body

def placeholder(out, body, anchors):
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.load_default()
    pre = 'cm' if body == 'm' else 'cw'
    hues = [(220, 60, 60), (230, 140, 40), (200, 190, 40), (70, 170, 70), (60, 150, 210), (90, 90, 220), (160, 80, 200), (210, 80, 150)]
    made = 0
    for code, count in BODY_FRAMES.items():
        for f in range(1, 9):
            if code == 'd' and f != 1:
                continue
            for k in range(count):
                mirrored = f >= 6
                ax, ay = anchors[code][f - 1][k]
                if mirrored:   # the anchor as drawn (the file is flipped after)
                    ax = 127 - ax
                im = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
                g = ImageDraw.Draw(im)
                col = hues[f - 1] if body == 'm' else tuple(min(255, c + 40) for c in hues[f - 1][::-1])
                dark = tuple(c // 2 for c in col) + (255,)
                ph = k / count * 2 * math.pi if code == 'w' else 0
                # legs: planted at y 116, swinging by the walk phase
                for side, sgn in ((-7, 1), (7, -1)):
                    fx = 64 + side + round(sgn * 6 * math.sin(ph))
                    g.line([(ax + side // 2, ay + 38), (fx, 114)], fill=dark, width=7)
                    g.ellipse([fx - 6, 111, fx + 6, 118], fill=(60, 60, 70, 255))
                # neck and torso, hung from the anchor
                g.rectangle([ax - 3, ay - 2, ax + 3, ay + 4], fill=(255, 210, 180, 255), outline=(90, 60, 50, 255))
                g.rounded_rectangle([ax - 16, ay + 3, ax + 16, ay + 42], radius=6, fill=col + (255,), outline=dark, width=2)
                # arms swing against the legs
                for side, sgn in ((-19, -1), (19, 1)):
                    hx = ax + side + round(sgn * 4 * math.sin(ph))
                    g.line([(ax + side * 0.85, ay + 6), (hx, ay + 32)], fill=col + (255,), width=6)
                # facing arrow in screen terms (engine dir f-1: 0 = toward the viewer, turning through -x)
                a = (f - 1) * math.pi / 4
                vx, vy = -math.sin(a), math.cos(a)
                cx, cy = ax, ay + 30
                g.line([(cx - vx * 9, cy - vy * 5), (cx + vx * 9, cy + vy * 5)], fill=(255, 255, 255, 255), width=3)
                g.ellipse([cx + vx * 9 - 3, cy + vy * 5 - 3, cx + vx * 9 + 3, cy + vy * 5 + 3], fill=(255, 255, 255, 255))
                # drawn the way it shows; a facing 6..8 picture is flipped whole, and the engine flips it back
                g.text((ax, ay + 14), f'{f} {"w" if code == "w" else "i" if code == "n" else "d"}{k + 1}', fill=(255, 255, 255, 255), font=font, anchor='mm')
                if mirrored:
                    im = im.transpose(Image.FLIP_LEFT_RIGHT)
                im.save(os.path.join(out, f'{pre}_nb_00_c01_{code}{f:02d}_{k + 1:02d}.png'))
                made += 1
    return made


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('out')
    ap.add_argument('--rig', help='rig JSON: {"anchors": {"n": [8 facings x frames x [x, y]], "w": ..., "d": ...}}')
    ap.add_argument('--placeholder', action='store_true', help='also write the test body frames and newstyle.txt')
    ap.add_argument('--crop', choices=('shape', 'png', 'trim'), default='shape')
    ap.add_argument('--bodies', default='mf')
    ap.add_argument('--table', default='m 6f 00', help='newstyle.txt lines (";"-separated) with --placeholder')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    anchors = json.load(open(a.rig))['anchors'] if a.rig else default_anchors()
    n = 0
    for body in a.bodies:
        for name, (m, f) in motion_files(body).items():
            open(os.path.join(a.out, name), 'wb').write(motion_dump(m, f, anchors, a.crop))
            n += 1
        if a.placeholder:
            n += placeholder(a.out, body, anchors)
    if a.placeholder:
        open(os.path.join(a.out, 'newstyle.txt'), 'w').write('# body clothes(hex) code: ovr/newstyle.c\n' + '\n'.join(a.table.split(';')) + '\n')
    print(f'newstyle_motions: {n} files in {a.out}', file=sys.stderr)


if __name__ == '__main__':
    main()
