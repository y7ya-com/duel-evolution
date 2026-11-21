"""newstyle_wu.py: new-style waist-up items (client/recomp/ovr/newstylewu.c, htmlui cosmetics/waistup.js).

The original waist-up ("wu") is the 2008 layered art: the bare body c?_bo_01 (head and arms included), a clothes strip
drawn over it, a disk strip with holes cut where the base pose's fist sits, the head layers; every strip placed by
its {wm,ww}_data.csv row. A NEW-STYLE item is instead one picture per pose (r: the avatar editor's, the disk arm up;
l: Select Player's): the whole figure below the head (outfit, arms, hands, neck) with its skin painted in a neutral
grey, so a painting need not match the bare body pixel for pixel nor leave room for disk cut-outs. At render time:

  - the skin greys become the player's skin tone through the RAMP (R = G = B = v marks a skin pixel; v is the
    luminance of the tone 1 skin colour it was; each tone is a few colour stops over v, linear between them);
  - the player's head (the bare body's head rows, the face layers, both hair layers) goes over the item's neck at
    the pose's NECK anchor (offset from the bare body's own);
  - the duel disk strip is drawn LAST, through the pose's DISK transform (rotation, scale, translation about the
    base pose's wrist: the disk follows the drawn forearm). As in the 2008 part loop, nothing goes over the disk:
    the original strips hold no hand pixels and the bare body's fist is behind them wherever they overlap, so the
    deck holder, the console and the zones always stay on top (ground truth: every shipped disk family composited
    on the bare body, both poses).

Commands (python with numpy, opencv, scipy, pillow; --wu: a folder of the game's data/avatar/wu pictures):

  ramp      --wu <dir> --out ramp.json                      the skin ramp fitted on c?_bo_01's c01 -> c0S pixel pairs
  prepare   --wu <dir> --pose r|l --out ref_<pose>.png         THE STANDARD for a new item: the pose reference (the
            bare body with its skin in the ramp's greys, on magenta, 1024 px) and its prompt (ref_<pose>.prompt.txt:
            fill in the outfit). The image model draws the item in the target format: flat magenta background, all
            skin neutral grey, a bald grey head, no other neutral grey; then convert --keyed magenta.
  convert   --wu <dir> --painting <png> --pose r|l --out body_<pose>.png [--keyed magenta] [--match <body png>]
            a painting (any square size: the 768 canvas) -> the neutral body picture (768 x 768): key, the head
            removed (the collar kept), skin -> ramp greys. --keyed magenta: a target-format painting (its greys
            matched to the ramp's v); without it, an older painting on green over the bare body (skin found by
            colour: Yami Yugi's Garms); --match: the
            other pose's body, its cloth colours matched (k-means clusters in Lab); --match-box x0,y0,x1,y1 (repeatable):
            a garment in that box matched region to region (mean and spread in Lab)
  calibrate --wu <dir> --body body_<pose>.png --pose r|l --out anchors_<pose>.json [--override <json>]
            the anchors: the disk transform (the bare body's disk arm, forearm and fist, matched as a silhouette
            against the item's skin: rotation, scale, shift searched), the neck (the bare body's, as a painting on it or in its pose keeps it; set it by --override for
            a figure drawn elsewhere). --override: a JSON whose keys replace the computed ones
            ({"disk": {"angle": 2.5}, "neck": [368, 304]}).
  pack      --dir <work dir> --code 01 [--body m] --out <dir>
            body_{r,l}.png, anchors_{r,l}.json, ramp.json -> <out>/merge/data/avatar/wu/{wm,ww}_nw_<code>.pak
  preview   --wu <dir> [<pak>] --pose r|l --look <32 hex digits> --out <png>
            the bust of a 16-byte look as the renderers draw it, new-style when a pack is given (the reference for
            the engine's and the HTML UI's output)
  check     <pak>                                           what the engine checks
  placeholder --out <pak>                                    a pack drawn from shapes, for the tests (no game art)

Pack (the chibi packs' container, client/tools/newstyle_pack.py: "YO2NSPK1", entries stored): body_r.png, body_l.png
(RGBA, the picture's box on the 768 canvas in its anchors) and
wu.txt (the anchors and the ramp, one record per line; '#' comments):

    bare <x> <y>                               where the bare body's row (c?_bo_01) sits on the canvas the records
                                               are measured on: a caller drawing the bust shifted (a 256 px tile of
                                               it) moves every layer alike, and the renderers take that shift from
                                               the bare body's layer
    ramp <v0> <v1> ... <vK-1>                 the grey stops (0 = first, 255 = last, increasing; K 2..16)
    tone <S> <r g b> x K                       skin tone S's colour at each stop (S = 1..)
    pose <r|l> <x> <y> <w> <h>                 the body picture's box on the 768 canvas
    neck <r|l> <dx> <dy>                       the head layers' offset from the bare body's
    headcut <r|l> <y>                          the bare body's rows above y (canvas) are the head
    disk <r|l> <cx> <cy> <angle> <scale> <dx> <dy>
                                               the disk strip: rotated by angle (degrees, clockwise on screen) and
                                               scaled about (cx, cy) (the base wrist, canvas px), then moved by dx, dy

The engine and the HTML UI read the same pack; anything missing or malformed leaves that outfit on its original art.
"""
import argparse
import io
import json
import os
import struct
import sys
import zlib

CANVAS = 768
BODY_Y = 112                     # c?_bo_01's row: 0, 112, 768, 656
SCALE_PRIOR = 0.5                # calibrate: score lost per unit of scale away from 1
HEAD_CUT = 306                   # the bare head: canvas rows above this (the chin's tip is at 368, 303)
NECK_BASE = (368, 304)           # the bare body's chin tip: the neck anchor of a picture painted on it
LUM = (0.299, 0.587, 0.114)
PAK_MAGIC = b'YO2NSPK1'
# The base pose's disk arm on c?_bo_01 (the male body; canvas px, traced on its line work): the wrist (where the
# disk strip's card holder meets the hand), the elbow, and the forearm-and-fist outline calibrate matches
BASE_ARM = {
    'r': {'wrist': (410, 527), 'elbow': (580, 525),
          'outline': [(312, 480), (330, 462), (365, 465), (380, 470), (413, 503), (470, 510), (520, 505), (545, 495),
                      (570, 490), (595, 520), (590, 540), (560, 548), (500, 546), (420, 550), (395, 552), (345, 556),
                      (325, 540), (312, 520)]},
    'l': {'wrist': (365, 432), 'elbow': (180, 470),
          'outline': [(168, 462), (200, 430), (250, 438), (300, 432), (340, 415), (375, 395), (395, 372), (430, 378),
                      (445, 400), (440, 430), (420, 445), (385, 450), (360, 455), (330, 470), (300, 474), (250, 482),
                      (205, 488), (185, 480)]}}


def _np():
    import numpy as np
    return np


def load_rgba(path):
    np = _np()
    from PIL import Image
    return np.asarray(Image.open(path).convert('RGBA')).copy()


def png_bytes(arr):
    from PIL import Image
    b = io.BytesIO()
    Image.fromarray(arr, 'RGBA').save(b, 'PNG', optimize=True)
    return b.getvalue()


def bare(wu, pose, skin=1, sex='wm'):
    """c?_bo_01 on the 768 canvas (uint8 RGBA)."""
    np = _np()
    c = np.zeros((CANVAS, CANVAS, 4), np.uint8)
    b = load_rgba(os.path.join(wu, f'{sex}_bo_01_c0{skin}_{pose}.png'))
    c[BODY_Y:BODY_Y + b.shape[0], :b.shape[1]] = b
    return c


def lab(rgb):
    import cv2
    np = _np()
    a = np.clip(rgb, 0, 255).astype(np.uint8).reshape(1, -1, 3)
    return cv2.cvtColor(a, cv2.COLOR_RGB2LAB)[0].astype(np.float32).reshape(np.shape(rgb))


def luminance(rgb):
    np = _np()
    return np.asarray(rgb, np.float32)[..., :3] @ np.array(LUM, np.float32)


# ---------------------------------------------------------------- the ramp

def fit_ramp(wu, stops=5, sex='wm'):
    """The skin ramp: per tone S, the mean c0S colour of the bare bodies' skin pixels at each c01 luminance (a full
    256-entry curve), then the `stops` points whose linear interpolation fits those curves best (dynamic programming,
    Lab error weighted by pixel count). -> {"stops": [v...], "tones": {"1": [[r, g, b]...], ...}, "error": {...}}"""
    import cv2
    np = _np()
    px = []
    tones = sorted(int(n[len(f'{sex}_bo_01_c0'):][0]) for n in os.listdir(wu)
                   if n.startswith(f'{sex}_bo_01_c0') and n.endswith('_r.png'))
    for pose in 'rl':
        b = [bare(wu, pose, s, sex).astype(np.float32) for s in tones]
        ok = np.all([x[..., 3] == 255 for x in b], axis=0)
        px.append(np.stack([x[..., :3][ok] for x in b], 1))
    px = np.concatenate(px)
    hsv = cv2.cvtColor(px[None, :, 0].astype(np.uint8), cv2.COLOR_RGB2HSV)[0]
    px = px[~((hsv[:, 0] > 90) & (hsv[:, 0] < 140) & (hsv[:, 1] > 60))]   # not the blue shorts
    v = np.clip(np.round(luminance(px[:, 0])), 0, 255).astype(int)
    cnt = np.bincount(v, minlength=256).astype(np.float64)
    k5 = np.ones(5)
    curve = np.zeros((len(tones), 256, 3))
    for t in range(len(tones)):
        for ch in range(3):
            s = np.convolve(np.bincount(v, weights=px[:, t, ch], minlength=256), k5, 'same')
            n = np.convolve(cnt, k5, 'same')
            y = np.where(n > 0, s / np.maximum(n, 1e-9), np.nan)
            okv = ~np.isnan(y)
            curve[t, :, ch] = np.interp(np.arange(256), np.nonzero(okv)[0], y[okv])
    LC = np.stack([lab(curve[t]) for t in range(len(tones))])
    w = cnt + 0.5
    seg = np.full((256, 256), np.inf)
    for i in range(256):
        for j in range(i + 1, 256):
            f = (np.arange(i, j + 1) - i) / (j - i)
            pred = curve[:, i][:, None] * (1 - f)[None, :, None] + curve[:, j][:, None] * f[None, :, None]
            d = np.linalg.norm(np.stack([lab(pred[t]) for t in range(len(tones))]) - LC[:, i:j + 1], axis=2)
            seg[i, j] = (d ** 2 * w[i:j + 1]).sum()
    D = np.full((stops, 256), np.inf)
    B = np.zeros((stops, 256), int)
    D[0, 0] = 0
    for k in range(1, stops):
        for j in range(1, 256):
            c = D[k - 1, :j] + seg[:j, j]
            i = int(np.argmin(c))
            D[k, j], B[k, j] = c[i], i
    st = [255]
    for k in range(stops - 1, 0, -1):
        st.append(int(B[k, st[-1]]))
    st = st[::-1]
    out = {'stops': st, 'tones': {}, 'error': {}}
    for t, s in enumerate(tones):
        cols = np.clip(np.round(curve[t][st]), 0, 255).astype(int)
        out['tones'][str(s)] = cols.tolist()
        pred = np.stack([np.interp(v, st, cols[:, ch]) for ch in range(3)], 1)
        e = np.linalg.norm(lab(pred) - lab(px[:, t]), axis=1)
        out['error'][str(s)] = {'dE_mean': round(float(e.mean()), 2), 'dE_p95': round(float(np.percentile(e, 95)), 2)}
    return out


def ramp_colour(ramp, tone, v):
    """v (array of greys) -> RGB of skin tone `tone` (float). The renderers do the same (integer-rounded)."""
    np = _np()
    st = np.array(ramp['stops'], np.float32)
    cols = np.array(ramp['tones'][str(tone)], np.float32)
    return np.stack([np.interp(v, st, cols[:, ch]) for ch in range(3)], -1)


def ramp_lut(ramp, tone):
    """The 256-entry colour table of a tone, exactly as ovr/newstylewu.c and waistup.js build it."""
    st, cols = ramp['stops'], ramp['tones'][str(tone)]
    lut = []
    for v in range(256):
        k = 0
        while k < len(st) - 2 and v > st[k + 1]:
            k += 1
        span = st[k + 1] - st[k]
        f = (v - st[k]) / span if span else 0
        lut.append([int((cols[k][c] * (1 - f) + cols[k + 1][c] * f) + 0.5) for c in range(3)])
    return lut


def swap_skin(img, ramp, tone):
    """A body picture with its skin greys in skin tone `tone` (uint8 RGBA)."""
    np = _np()
    out = img.copy()
    sk = is_skin_grey(img)
    lut = np.array(ramp_lut(ramp, tone), np.uint8)
    out[sk, :3] = lut[img[sk, 0]]
    return out


def is_skin_grey(img):
    return (img[..., 3] > 0) & (img[..., 0] == img[..., 1]) & (img[..., 1] == img[..., 2])


# ---------------------------------------------------------------- generation (the target format)

POSE_WORDS = {'r': "the left forearm raised level across the waist, its fist at the navel, the right arm hanging",
              'l': "the right forearm raised level across the chest, its fist at the breastbone, the left arm hanging"}
PROMPT = """Draw the outfit described below on the figure in the reference picture, in the art style of the
reference outfit picture (2008 Yu-Gi-Oh! Online waist-up portrait: clean black line work, cel shading with soft
gradients). Output the same canvas, the same framing and size.

Rules, all required:
- Background: flat pure magenta #FF00FF everywhere outside the figure. No shadow, no glow, no gradient on it.
- The figure keeps the reference's pose and proportions: {pose}. The arms may move a little where the clothes need
  it, but the forearm and the fist of the raised arm stay where they are.
- ALL visible skin (neck, arms, hands, any skin the outfit shows) is painted in NEUTRAL GREY only, shaded like the
  reference's grey skin: no colour at all in the skin. The head stays a plain bald grey shape (no face, no hair, no
  ears changed).
- Nothing else may be neutral grey: metal studs and buckles are a cool bluish silver, white cloth is a tinted white
  (lavender or cream). Black cloth has a coloured sheen (blue or purple), never flat grey.
- No duel disk, no cards, no accessories in the hands, no text.

The outfit: {{outfit}}
"""


# ---------------------------------------------------------------- convert a painting

# ---------------------------------------------------------------- convert a painting

def key(path, colour='green'):
    """A painting on a flat green or magenta (#FF00FF) background (any square size) -> float RGBA on the 768 canvas,
    the key colour's spill taken out of the edge pixels."""
    import cv2
    np = _np()
    from PIL import Image
    g = np.asarray(Image.open(path).convert('RGB'), np.float32) / 255
    r, gg, b = g[..., 0], g[..., 1], g[..., 2]
    if colour == 'magenta':
        k = np.minimum(r, b) - gg                      # how magenta a pixel is
    else:
        k = gg - np.maximum(r, b)
    a = np.clip(1 - (k - 0.15) / 0.35, 0, 1)
    sp = np.maximum(k, 0) * (a < 1)
    g2 = g.copy()
    if colour == 'magenta':
        g2[..., 0] -= sp
        g2[..., 2] -= sp
    else:
        g2[..., 1] -= sp
    g2 = np.clip(g2, 0, 1)
    rgba = np.dstack([g2 * a[..., None], a])
    rgba = cv2.resize(rgba, (CANVAS, CANVAS), interpolation=cv2.INTER_AREA)
    al = rgba[..., 3]
    rgb = np.where(al[..., None] > 1e-3, rgba[..., :3] / np.maximum(al[..., None], 1e-3), 0)
    return np.dstack([np.clip(rgb, 0, 1), al])


def grey_bare(wu, pose, ramp, sex='wm'):
    """The bare body as a target-format painting shows it: its skin in the neutral greys (tone 1's luminance, the
    ramp's v), the shorts kept. The pose reference for generation and the head template for convert --keyed."""
    np = _np()
    b = bare(wu, pose, 1, sex)
    out = b.copy()
    import cv2
    hsv = cv2.cvtColor(b[..., :3], cv2.COLOR_RGB2HSV)
    shorts = (hsv[..., 0] > 90) & (hsv[..., 0] < 140) & (hsv[..., 1] > 60)
    v = np.clip(np.round(luminance(b[..., :3].astype(np.float32))), 0, 255).astype(np.uint8)
    sk = (b[..., 3] > 0) & ~shorts
    for c in range(3):
        out[..., c] = np.where(sk, v, out[..., c])
    return out


def grey_skin_mask(rgb255, alpha, core_chroma=7.0, edge_chroma=14.0):
    """Skin of a target-format painting: the neutral grey pixels (Lab chroma < core_chroma, not the line work), in
    blobs of 250 px or more whose mean chroma stays under 4 and that are not bluish (a lavender or white lining
    painted almost grey), grown 3 px into the near-grey soft edge. Cloth must not be neutral grey (the prompt asks
    for tinted silver and whites); a grey stud or buckle (under 250 px) stays cloth."""
    np = _np()
    from scipy import ndimage as ndi
    L = lab(rgb255)
    ch = np.hypot(L[..., 1] - 128, L[..., 2] - 128)
    v = luminance(rgb255)
    core = (alpha > 0.5) & (ch < core_chroma) & (v >= 60)
    core = ndi.binary_opening(core, iterations=1)
    lb, n = ndi.label(core)
    if n:
        idx = range(1, n + 1)
        sz = ndi.sum(core, lb, idx)
        mc = ndi.mean(ch, lb, idx)                     # a blob's mean chroma: grey skin ~1, a tinted white ~6
        mb = ndi.mean(L[..., 2] - 128, lb, idx)        # and its blue: a lavender lining goes below -2.5
        core = np.isin(lb, [i + 1 for i in range(n) if sz[i] >= 250 and mc[i] < 4 and mb[i] > -2.5])
    out = core
    for _ in range(3):
        out = out | (ndi.binary_dilation(out) & (alpha > 0.02) & (ch < edge_chroma) & (v >= 30))
    return out | (ndi.binary_fill_holes(out) & ~out & (ch < edge_chroma * 1.5))


def skin_mask(rgb255, alpha, ramp, near=14.0, grow=34.0, floor=90):
    """Skin pixels of a painting: close (Lab dE < near) to tone 1's ramp colour at their own luminance and bright
    (luminance >= floor), in blobs of 60 px or more; then grown, 6 px at most, into the pixels within `grow` of the
    ramp (the warmer shading and the line work's soft edge). Dark cloth far from skin keeps its own colour."""
    np = _np()
    from scipy import ndimage as ndi
    v = luminance(rgb255)
    L = lab(rgb255)
    d = np.linalg.norm(L - lab(ramp_colour(ramp, 1, v)), axis=-1)
    warm = (L[..., 2] > 134) & (L[..., 1] > 131)   # red and yellow side of Lab: skin; lavender, white, grey are not
    import cv2
    hsv = cv2.cvtColor(np.clip(rgb255, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV)
    orange = (hsv[..., 0] <= 22) & (hsv[..., 1] > 50)   # skin's hue (the deep shadows go red-orange)
    core = (alpha > 0.5) & (d < near) & (v >= floor) & warm
    core = ndi.binary_opening(core, iterations=1)
    lb, n = ndi.label(core)
    if n:
        sz = ndi.sum(core, lb, range(1, n + 1))
        core = np.isin(lb, np.nonzero(sz >= 60)[0] + 1)
    cand = (alpha > 0.02) & ((d < grow) | orange) & (v >= 40) & warm
    out = core
    for _ in range(6):
        out = out | (ndi.binary_dilation(out) & cand)
    # deep shadow patches cut off from the skin by a line (an armpit): whole warm orange blobs within 12 px of skin
    deep = (alpha > 0.5) & orange & warm & (v >= 40)
    lb, n = ndi.label(deep)
    if n:
        touch = ndi.binary_dilation(out, iterations=12)
        hit = np.unique(lb[touch & deep])
        out |= np.isin(lb, hit[hit > 0])
    # one more pixel of the soft edge where skin meets a light lining (a mix of both: not yellow, not blue)
    out |= ndi.binary_dilation(out) & (alpha > 0.02) & (d < grow * 1.3) & (L[..., 2] > 126) & (v >= 40)
    # pinholes inside skin (a highlight, a speck): skin too when they are near the ramp at all
    holes = ndi.binary_fill_holes(out) & ~out & (d < grow * 1.5)
    return out | holes


def convert(wu, painting, pose, ramp, match=None, sex='wm', match_boxes=None, keyed=None):
    """-> (uint8 RGBA body picture, info). See the module docstring. keyed='magenta': a target-format painting (flat
    magenta background, skin already neutral grey: the standard for new items); otherwise a painting on green over
    the bare body, its skin found by colour and turned grey."""
    import cv2
    np = _np()
    from scipy import ndimage as ndi
    k = key(painting, keyed or 'green')
    rgb, al = k[..., :3] * 255, k[..., 3]
    if keyed:
        b = grey_bare(wu, pose, ramp, sex).astype(np.float32)
        skin = grey_skin_mask(rgb, al)
    else:
        b = bare(wu, pose, 1, sex).astype(np.float32)
        skin = skin_mask(rgb, al, ramp)
    # the head: the bare body's head rows (dilated 4 px), where the painting shows skin or reproduces the bare body
    head = np.zeros((CANVAS, CANVAS), bool)
    head[:HEAD_CUT] = b[:HEAD_CUT, :, 3] > 0
    head = ndi.binary_dilation(head, iterations=8)
    head[HEAD_CUT:] = False
    same = (b[..., 3] > 128) & (np.abs(rgb - b[..., :3]).max(-1) < 26)
    # the painted head's line work: dark pixels within 3 px of the bare head's own lines
    bare_ink = ndi.binary_dilation((luminance(b[..., :3]) < 90) & (b[..., 3] > 128), iterations=3)
    dark = head & (luminance(rgb) < 90) & (al > 0.5)
    solid = ndi.binary_dilation(ndi.binary_opening(dark, iterations=2), iterations=2)   # dark cloth, not a line
    drop = head & (skin | same | (dark & bare_ink & ~solid))
    keep_head = head & ~drop & (al > 0.5)
    keep_head = ndi.binary_opening(keep_head, iterations=2)   # line-work slivers of the painted head
    lb, n = ndi.label(keep_head)
    if n:
        sz = ndi.sum(keep_head, lb, range(1, n + 1))
        keep_head = np.isin(lb, np.nonzero(sz >= 40)[0] + 1)
    # what the line rule cut out of the collar where it crosses the neck's lines: closed back, 3 px at most
    keep_head = ndi.binary_closing(keep_head, iterations=3) & head & (al > 0.02)
    holes = ndi.binary_fill_holes(keep_head) & ~keep_head      # specks the skin rule took out of the collar
    lb, n = ndi.label(holes)
    if n:
        sz = ndi.sum(holes, lb, range(1, n + 1))
        keep_head |= np.isin(lb, np.nonzero(sz <= 40)[0] + 1)
    keep_head &= ~(skin & ~ndi.binary_erosion(keep_head, iterations=2))
    al0 = al
    al = np.where(head & ~keep_head, 0, al)
    # specks cut out of the collar right at the head cut: holes of 40 px or less in the whole picture get it back
    filled = al > 0.5
    holes = ndi.binary_fill_holes(filled) & ~filled & head
    lb, n = ndi.label(holes)
    if n:
        sz = ndi.sum(holes, lb, range(1, n + 1))
        back = np.isin(lb, np.nonzero(sz <= 40)[0] + 1)
        keep_head |= back
        al = np.where(back, al0, al)
    skin &= ~keep_head
    # thin skin slivers at the head cut's sides (the jaw's line): the bare head draws them
    out = np.zeros((CANVAS, CANVAS, 4), np.uint8)
    out[..., 3] = np.clip(np.round(al * 255), 0, 255).astype(np.uint8)
    col = np.clip(np.round(rgb), 0, 255).astype(np.uint8)
    if match is not None:
        col = match_palette(col, (out[..., 3] > 0) & ~skin, match)
        for box in match_boxes or ():
            col = match_region(col, (out[..., 3] > 230) & ~skin, match, box)
    out[..., :3] = col
    v = luminance(rgb)
    grey_check = None
    if keyed:   # the model was shown the ramp's greys: its own are used as they are; how far they drift is reported
        ref = grey_bare(wu, pose, ramp, sex)
        ref_sk = is_skin_grey(ref) & (ref[..., 3] == 255) & arm_mask(pose)
        got = skin & (al > 0.5) & arm_mask(pose)
        if got.sum() > 50:
            grey_check = {'painted_arm_median': float(np.median(v[got])), 'reference_arm_median': float(np.median(ref[..., 0][ref_sk]))}
    v = np.clip(np.round(v), 0, 255).astype(np.uint8)
    for c in range(3):
        out[..., c] = np.where(skin, v, out[..., c])
    # cloth that happens to be exactly grey would read as skin: nudge its blue by one
    grey = ~skin & (out[..., 0] == out[..., 1]) & (out[..., 1] == out[..., 2])
    out[..., 2] = np.where(grey, np.where(out[..., 2] < 255, out[..., 2] + 1, 254), out[..., 2])
    out[out[..., 3] == 0] = 0
    info = {'skin_px': int((skin & (out[..., 3] > 0)).sum()), 'opaque_px': int((out[..., 3] > 0).sum()),
            'head_kept_px': int(keep_head.sum()), **({'greys': grey_check} if grey_check else {})}
    return out, info


def match_palette(col, mask, ref_img, k=10, limit=40):
    """col's cloth colours (mask) moved onto the nearest of ref_img's cloth colour clusters (Lab k-means; soft
    assignment; a cluster with nothing within dE `limit` stays)."""
    import cv2
    np = _np()
    ref = ref_img[(ref_img[..., 3] > 230) & ~is_skin_grey(ref_img)][:, :3].astype(np.float32)
    src = col[mask].astype(np.float32)
    if len(src) < k or len(ref) < k:
        return col
    Ls, Lr = lab(src), lab(ref)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.5)
    cv2.setRNGSeed(1)
    _, _, cs = cv2.kmeans(Ls, k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    _, _, cr = cv2.kmeans(Lr, k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    shifts = []
    for i in range(k):
        dd = np.linalg.norm(cr - cs[i], axis=1)
        j = int(np.argmin(dd))
        shifts.append(cr[j] - cs[i] if dd[j] < limit else np.zeros(3, np.float32))
    shifts = np.array(shifts, np.float32)
    dist = np.linalg.norm(Ls[:, None] - cs[None], axis=2)
    w = np.exp(-(dist / 8) ** 2)
    w /= w.sum(1, keepdims=True) + 1e-6
    L2 = np.clip(Ls + w @ shifts, 0, 255).astype(np.uint8)
    out = col.copy()
    out[mask] = cv2.cvtColor(L2[None], cv2.COLOR_LAB2RGB)[0]
    return out


def match_region(col, alpha_skin, ref_img, box, chroma_min=12):
    """A garment both poses show in the same box ([x0, y0, x1, y1], e.g. the trousers below the belt) whose colour
    the global match left apart: its coloured cloth pixels (Lab chroma >= chroma_min: not the black belts or the white
    studs) moved to the reference's mean and spread there (Lab, per channel)."""
    np = _np()
    import cv2
    x0, y0, x1, y1 = box
    def sel(img_rgb, ok):
        m = np.zeros(ok.shape, bool)
        m[y0:y1, x0:x1] = ok[y0:y1, x0:x1]
        L = lab(img_rgb.astype(np.float32))
        return m & (np.hypot(L[..., 1] - 128, L[..., 2] - 128) >= chroma_min), L
    ms, Ls = sel(col, alpha_skin)
    ref_ok = (ref_img[..., 3] > 230) & ~is_skin_grey(ref_img)
    mr, Lr = sel(ref_img[..., :3], ref_ok)
    if ms.sum() < 50 or mr.sum() < 50:
        return col
    a, b = Ls[ms], Lr[mr]
    t = (a - a.mean(0)) / (a.std(0) + 1e-6) * b.std(0) + b.mean(0)
    out = col.copy()
    out[ms] = cv2.cvtColor(np.clip(t, 0, 255).astype(np.uint8)[None], cv2.COLOR_LAB2RGB)[0]
    return out


# ---------------------------------------------------------------- calibrate

def similarity(cx, cy, angle, scale, dx, dy):
    """The 2 x 3 matrix: rotate by angle (degrees, clockwise on screen) and scale about (cx, cy), then shift."""
    import math
    np = _np()
    t = math.radians(angle)
    c, s = math.cos(t) * scale, math.sin(t) * scale
    # screen coordinates (y down): clockwise on screen = the usual rotation matrix
    return np.array([[c, -s, cx - c * cx + s * cy + dx], [s, c, cy - s * cx - c * cy + dy]], np.float64)


def arm_mask(pose):
    """The base pose's disk arm (forearm and fist) as a mask."""
    import cv2
    np = _np()
    m = np.zeros((CANVAS, CANVAS), np.uint8)
    cv2.fillPoly(m, [np.array(BASE_ARM[pose]['outline'], np.int32)], 1)
    return m.astype(bool)


def calibrate(wu, body, pose, overrides=None, sex='wm'):
    """-> anchors dict. The base pose's disk arm (forearm and fist, BASE_ARM's outline)
    is matched against the item's skin as a silhouette: the transform (rotation -24..24 degrees about the base wrist,
    scale 0.88..1.12, shift +-48 px; coarse grid, then finer) that puts the most of the arm on the item's skin and the
    least of the ring round it (where the bare body has no body) on skin. Occluders on the arm (a wristband, a
    sleeve) lower every candidate alike. The best transform carries the base wrist to the drawn one, and the disk
    strip, drawn for the base pose, is carried the same way. The neck: the base anchor (the painting kept the bare
    body's head place), unless overridden."""
    import cv2
    np = _np()
    from scipy import ndimage as ndi
    base = bare(wu, pose, 1, sex)
    arm = BASE_ARM[pose]
    wx, wy = arm['wrist']
    inside = arm_mask(pose) & (base[..., 3] > 0)
    ring = ndi.binary_dilation(inside, iterations=8) & ~ndi.binary_dilation(inside, iterations=2) & (base[..., 3] == 0)
    # the item as the arm sees it: skin 1, cloth 0.5 (it may lie over the arm: a wristband, a sleeve), nothing 0;
    # the ring: skin -1 (the arm is bigger there), cloth and nothing 0
    opaque = body[..., 3] > 128
    sk = is_skin_grey(body) & opaque
    skin = cv2.GaussianBlur(np.where(sk, 1.0, np.where(opaque, 0.5, 0.0)).astype(np.float32), (0, 0), 1.5)
    ring_val = cv2.GaussianBlur(sk.astype(np.float32), (0, 0), 1.5)
    pin = np.stack(np.nonzero(inside)[::-1], 1).astype(np.float64)
    pout = np.stack(np.nonzero(ring)[::-1], 1).astype(np.float64)

    def sample(img, pts, M):
        q = pts @ M[:, :2].T + M[:, 2]
        qi = np.clip(np.round(q).astype(int), 0, CANVAS - 1)
        return img[qi[:, 1], qi[:, 0]]

    def score(angle, scale, dx, dy):
        M = similarity(wx, wy, angle, scale, dx, dy)
        s = sample(skin, pin, M).mean() - (sample(ring_val, pout, M).mean() if len(pout) else 0)
        return float(s - SCALE_PRIOR * abs(scale - 1))   # the same body: a scale away from 1 must earn its keep

    best = (-2.0, 0.0, 1.0, 0.0, 0.0)
    for angle in range(-24, 25, 4):
        for scale in (0.88, 0.94, 1.0, 1.06, 1.12):
            for dx in range(-48, 49, 6):
                for dy in range(-48, 49, 6):
                    sc = score(angle, scale, dx, dy)
                    if sc > best[0] + 1e-9 or (abs(sc - best[0]) <= 1e-9 and abs(angle) + abs(dx) + abs(dy) <
                                                abs(best[1]) + abs(best[3]) + abs(best[4])):
                        best = (sc, angle, scale, dx, dy)
    for step_a, step_s, step_t in ((2, 0.03, 3), (1, 0.015, 2), (0.5, 0.01, 1), (0.25, 0.005, 0.5)):
        improved = True
        while improved:
            improved = False
            s0, a0, sc0, dx0, dy0 = best
            for angle in (a0 - step_a, a0, a0 + step_a):
                for scale in (sc0 - step_s, sc0, sc0 + step_s):
                    for dx in (dx0 - step_t, dx0, dx0 + step_t):
                        for dy in (dy0 - step_t, dy0, dy0 + step_t):
                            sc = score(angle, scale, dx, dy)
                            if sc > best[0] + 1e-9:
                                best, improved = (sc, angle, scale, dx, dy), True
    sc, angle, scale, dx, dy = best
    disk = {'cx': wx, 'cy': wy, 'angle': round(float(angle), 2), 'scale': round(float(scale), 3),
            'dx': round(float(dx), 1), 'dy': round(float(dy), 1)}
    anchors = {'pose': pose, 'neck': list(NECK_BASE), 'headcut': HEAD_CUT, 'disk': disk,
               'match': {'score': round(sc, 3), 'identity_score': round(score(0, 1, 0, 0), 3)}}
    for k, v in (overrides or {}).items():
        if isinstance(v, dict) and isinstance(anchors.get(k), dict):
            anchors[k] = {**anchors[k], **v}
        else:
            anchors[k] = v
    return anchors


def bust_parts(body):
    """The picture's box (x, y, w, h) on the canvas and the cropped array."""
    np = _np()
    ys, xs = np.nonzero(body[..., 3] > 0)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    return (x0, y0, x1 - x0, y1 - y0), body[y0:y1, x0:x1].copy()


# ---------------------------------------------------------------- the pack

def wu_text(ramp, poses):
    """wu.txt from the ramp and {pose: (box, anchors)}."""
    lines = ['# new-style waist-up (client/tools/newstyle_wu.py; read by ovr/newstylewu.c and htmlui waistup.js)',
             f'bare 0 {BODY_Y}',
             'ramp ' + ' '.join(str(v) for v in ramp['stops'])]
    for s in sorted(ramp['tones'], key=int):
        lines.append(f'tone {s} ' + '  '.join(' '.join(str(int(c)) for c in col) for col in ramp['tones'][s]))
    for pose in 'rl':
        box, a = poses[pose]
        d = a['disk']
        lines += [f'pose {pose} ' + ' '.join(str(int(v)) for v in box),
                  f"neck {pose} {int(round(a['neck'][0] - NECK_BASE[0]))} {int(round(a['neck'][1] - NECK_BASE[1]))}",
                  f"headcut {pose} {int(a['headcut'])}",
                  f"disk {pose} {d['cx']:g} {d['cy']:g} {d['angle']:g} {d['scale']:g} {d['dx']:g} {d['dy']:g}"]
    return ('\n'.join(lines) + '\n').encode('ascii')


def parse_wu(text):
    """wu.txt -> {"stops", "tones", "pose": {p: {"box", "neck", "headcut", "disk"}}}; ValueError when anything the
    renderers need is missing or out of range (the same rules as ovr/newstylewu.c)."""
    out = {'stops': None, 'tones': {}, 'pose': {'r': {}, 'l': {}}, 'bare': None}
    for raw in text.decode('ascii').splitlines():
        t = raw.split('#', 1)[0].split()
        if not t:
            continue
        k = t[0]
        if k == 'bare':
            out['bare'] = [int(v) for v in t[1:]]
            if len(out['bare']) != 2 or not all(0 <= v < CANVAS for v in out['bare']):
                raise ValueError('bad bare')
        elif k == 'ramp':
            out['stops'] = [int(v) for v in t[1:]]
        elif k == 'tone':
            vals = [int(v) for v in t[2:]]
            out['tones'][t[1]] = [vals[i:i + 3] for i in range(0, len(vals), 3)]
        elif k in ('pose', 'neck', 'headcut', 'disk'):
            if t[1] not in 'rl' or len(t[1]) != 1:
                raise ValueError(f'bad pose in {raw!r}')
            vals = [float(v) for v in t[2:]]
            out['pose'][t[1]][{'pose': 'box'}.get(k, k)] = vals
        else:
            raise ValueError(f'unknown record {k!r}')
    if not out['bare']:
        raise ValueError('bare missing')
    st = out['stops']
    if not st or not 2 <= len(st) <= 16 or st[0] != 0 or st[-1] != 255 or any(b <= a for a, b in zip(st, st[1:])):
        raise ValueError('bad ramp')
    if not out['tones'] or any(len(c) != len(st) or any(not 0 <= x <= 255 for x in sum(c, [])) for c in out['tones'].values()):
        raise ValueError('bad tones')
    for p, a in out['pose'].items():
        need = {'box': 4, 'neck': 2, 'headcut': 1, 'disk': 6}
        for key, n in need.items():
            if len(a.get(key, [])) != n:
                raise ValueError(f'pose {p}: {key} missing')
        x, y, w, h = a['box']
        if w <= 0 or h <= 0 or x < 0 or y < 0 or x + w > CANVAS or y + h > CANVAS:
            raise ValueError(f'pose {p}: bad box')
        if abs(a['neck'][0]) > 128 or abs(a['neck'][1]) > 128 or not 0 < a['headcut'][0] <= CANVAS:
            raise ValueError(f'pose {p}: bad neck')
        if not 0.5 <= a['disk'][3] <= 2 or abs(a['disk'][2]) > 90:
            raise ValueError(f'pose {p}: bad disk transform')
    return out


def write_pak(entries):
    head, data = [PAK_MAGIC, struct.pack('<I', len(entries))], []
    for name, raw in entries:
        nb = name.encode('ascii')
        head.append(struct.pack('<B', len(nb)) + nb + struct.pack('<BIII', 0, len(raw), len(raw), zlib.crc32(raw)))
        data.append(raw)
    return b''.join(head + data)


PAK_NAMES = ('body_r.png', 'body_l.png', 'wu.txt')


def read_pak(blob):
    """The pack's entries {name: bytes} after the engine's checks (ValueError when one fails)."""
    from PIL import Image
    if blob[:8] != PAK_MAGIC or len(blob) < 12:
        raise ValueError('not a pack')
    n, = struct.unpack_from('<I', blob, 8)
    if not 0 < n <= 64:
        raise ValueError(f'{n} entries')
    at, ents = 12, []
    for _ in range(n):
        ln = blob[at]
        name = blob[at + 1:at + 1 + ln].decode('ascii', 'replace')
        method, stored, size, crc = struct.unpack_from('<BIII', blob, at + 1 + ln)
        ents.append((name, method, stored, size, crc))
        at += 1 + ln + 13
    out = {}
    for name, method, stored, size, crc in ents:
        raw = blob[at:at + stored]
        at += stored
        if method != 0 or stored != size or len(raw) != size or zlib.crc32(raw) != crc or name in out:
            raise ValueError(f'{name}: corrupt')
        out[name] = raw
    if at != len(blob):
        raise ValueError('trailing bytes')
    for name in PAK_NAMES:
        if name not in out:
            raise ValueError(f'{name} missing')
    wu = parse_wu(out['wu.txt'])
    for p in 'rl':
        x, y, w, h = (int(v) for v in wu['pose'][p]['box'])
        im = Image.open(io.BytesIO(out[f'body_{p}.png']))
        im.load()
        if im.size != (w, h) or im.mode != 'RGBA':
            raise ValueError(f'body_{p}.png: {im.size} {im.mode}, the box is {w} x {h}')
    return out


def pack(work, body='m'):
    """<work>/body_{r,l}.png + anchors_{r,l}.json + ramp.json -> the pack's bytes."""
    np = _np()
    ramp = json.load(open(os.path.join(work, 'ramp.json')))
    entries, poses = [], {}
    for pose in 'rl':
        b = load_rgba(os.path.join(work, f'body_{pose}.png'))
        a = json.load(open(os.path.join(work, f'anchors_{pose}.json')))
        box, bc = bust_parts(b)
        poses[pose] = (box, a)
        entries.append((f'body_{pose}.png', png_bytes(bc)))
    entries.append(('wu.txt', wu_text(ramp, poses)))
    order = {n: i for i, n in enumerate(PAK_NAMES)}
    blob = write_pak(sorted(entries, key=lambda e: order[e[0]]))
    read_pak(blob)
    return blob


PLACEHOLDER_RAMP = {'stops': [0, 73, 176, 230, 255],
                    'tones': {'1': [[0, 0, 0], [93, 67, 51], [248, 154, 101], [255, 224, 191], [255, 255, 252]],
                              '2': [[0, 0, 0], [93, 79, 64], [250, 199, 149], [255, 240, 211], [255, 255, 252]],
                              '3': [[0, 0, 0], [68, 37, 27], [179, 83, 56], [191, 123, 91], [241, 218, 206]]}}


def placeholder():
    """A pack drawn from shapes (no game art): the tests' (rt/nwpak_test.c, waistup_test.mjs). Per pose a 200 x 300
    box at (284, 300): a blue coat with a grey (skin) arm band across it and a grey square fist;
    the r disk turned 10 degrees and moved (6, -4), the l one scaled 1.1, the l head 3 px right."""
    np = _np()
    entries, poses = [], {}
    for pose in 'rl':
        b = np.zeros((300, 200, 4), np.uint8)
        b[:, :] = (40, 60, 160, 255)
        b[120:150, 20:180] = (200, 200, 200, 255)     # the arm (skin grey 200)
        b[100:170, 20:70] = (150, 150, 150, 255)      # the fist (skin grey 150)
        b[0:4, :] = (128, 128, 129, 255)              # a grey-looking cloth row (nudged blue: not skin)
        entries.append((f'body_{pose}.png', png_bytes(b)))
        disk = {'cx': 300, 'cy': 430, 'angle': 10 if pose == 'r' else 0, 'scale': 1 if pose == 'r' else 1.1,
                'dx': 6 if pose == 'r' else 0, 'dy': -4 if pose == 'r' else 0}
        poses[pose] = ((284, 300, 200, 300), {'neck': [NECK_BASE[0] + (3 if pose == 'l' else 0), NECK_BASE[1]],
                                              'headcut': HEAD_CUT, 'disk': disk})
    entries.append(('wu.txt', wu_text(PLACEHOLDER_RAMP, poses)))
    order = {n: i for i, n in enumerate(PAK_NAMES)}
    blob = write_pak(sorted(entries, key=lambda e: order[e[0]]))
    read_pak(blob)
    return blob


# ---------------------------------------------------------------- the reference renderer

def blend(dst, src, x, y):
    """AvatarTexMaker's blend (colour = dst (1 - a) + src a, alpha = the larger) of src at (x, y), in place."""
    np = _np()
    H, W = src.shape[:2]
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + W, CANVAS), min(y + H, CANVAS)
    if x1 <= x0 or y1 <= y0:
        return
    s = src[y0 - y:y1 - y, x0 - x:x1 - x].astype(np.float32)
    d = dst[y0:y1, x0:x1].astype(np.float32)
    a = s[..., 3:4] / 255
    d[..., :3] = d[..., :3] * (1 - a) + s[..., :3] * a
    d[..., 3] = np.maximum(d[..., 3], s[..., 3])
    dst[y0:y1, x0:x1] = np.clip(d, 0, 255).astype(np.uint8)


def warp_disk(strip, x, y, disk):
    """A disk strip (placed at x, y) through the disk transform -> a 768 x 768 RGBA (premultiplied bilinear)."""
    import cv2
    np = _np()
    full = np.zeros((CANVAS, CANVAS, 4), np.float32)
    H, W = strip.shape[:2]
    full[y:y + H, x:x + W] = strip[:CANVAS - y, :CANVAS - x]
    pm = full.copy()
    pm[..., :3] *= pm[..., 3:4] / 255
    M = similarity(*disk)
    out = cv2.warpAffine(pm, M, (CANVAS, CANVAS), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    a = out[..., 3:4]
    out[..., :3] = np.where(a > 0, out[..., :3] * 255 / np.maximum(a, 1e-6), 0)
    return np.clip(np.round(out), 0, 255).astype(np.uint8)


def parse_csv(path):
    """{wm,ww}_data.csv -> {(kind, number): (images[7], rect)} (the first row of a kind and number wins)."""
    rows = {}
    for line in open(path, encoding='latin1').read().splitlines():
        if not line or line.startswith('//'):
            continue
        t = [x for x in line.split(',') if x != '']
        if len(t) < 13:
            continue
        key = (int(t[0]), int(t[1]) & 0xff)
        rows.setdefault(key, (t[2:9], [int(v) for v in t[9:13]]))
    return rows


DEF = {0: 0x90, 2: 0, 3: 0x40, 4: 0x60, 5: 0x40, 6: 0x30, 7: 0x40, 8: 0x20, 10: 0x80, 11: 0, 12: 0xb0}
HEAD_STEPS = (0, 2, 3, 4, 5, 6, 7, 8, 9, 11)


def layers(rows, look, pose):
    """waistup.js waistUpLayers (CWaistUpAvatar's part loop): [(step, image, x, y, w, h)], bottom first."""
    sex, front, clothes = look[0], look[1], look[6]
    col = {'hair': min(look[14], 6), 'skin': min(look[13], 6), 'eye': min(look[15], 6), 'pose': 1 if pose == 'l' else 0}
    hood = clothes in ((0x75, 0x77) if sex else (0x78, 0x7c))
    bald = not hood and not sex and front == 6
    afro = not hood and not bald and front in ((5, 6, 7, 8, 9) if sex else (10, 11, 12, 13))
    out = []

    def add(step, number, colour):
        r = rows.get((step, number)) or (rows.get((step, DEF[step])) if step in DEF else None)
        if not r:
            return
        img = r[0][col[colour]] if col[colour] < len(r[0]) else '*'
        if img and img[0] != '*':
            out.append((step, img.lower(), *r[1]))
    if not hood and not bald:
        add(0, front if afro else look[7], 'hair')
    add(1, col['pose'], 'skin')
    if not hood and not bald:
        add(2, front, 'skin')
    add(3, look[4], 'skin')
    add(4, look[5], 'skin')
    add(5, look[4], 'eye')
    add(6, look[3], 'skin')
    add(7, look[4], 'hair')
    add(8, look[2], 'pose')
    if look[9] and look[9] != 0x20:
        add(9, look[9], 'pose')
    add(10, clothes, 'pose')
    if hood:
        add(11, clothes, 'hair')
    elif not bald:
        add(11, front, 'hair')
    add(12, look[8] if (12, look[8]) in rows else 0xb0, 'pose')
    return out


def render(wu, look, pose, pak=None, sex_prefix=None):
    """The bust of a 16-byte look (768 x 768 RGBA): the original part loop, or, when `pak` (a new-style pack's
    entries) is given, the new-style composition the engine and the HTML UI draw:
      the head steps at the neck offset, the bare body only above the head cut, the item's body (skin swapped) in
      the clothes step, the disk (last) through its transform."""
    np = _np()
    pre = sex_prefix or ('ww' if look[0] else 'wm')
    rows = parse_csv(os.path.join(wu, f'{pre}_data.csv'))
    canvas = np.zeros((CANVAS, CANVAS, 4), np.uint8)
    wu_txt = parse_wu(pak['wu.txt']) if pak else None
    a = wu_txt['pose'][pose] if wu_txt else None
    tone = min(look[13], 6) + 1
    for step, img, x, y, w, h in layers(rows, look, pose):
        pic = load_rgba(os.path.join(wu, img))[:h, :w]
        if not a:
            blend(canvas, pic, x, y)
            continue
        ndx, ndy = int(a['neck'][0]), int(a['neck'][1])
        if step == 1:
            cut = int(a['headcut'][0]) - y
            blend(canvas, pic[:max(cut, 0)], x + ndx, y + ndy)
        elif step in HEAD_STEPS:
            blend(canvas, pic, x + ndx, y + ndy)
        elif step == 10:
            bx, by = int(a['box'][0]), int(a['box'][1])
            body = load_png_bytes(pak[f'body_{pose}.png'])
            blend(canvas, swap_skin(body, {'stops': wu_txt['stops'], 'tones': wu_txt['tones']}, tone), bx, by)
        elif step == 12:
            blend(canvas, warp_disk(pic, x, y, a['disk']), 0, 0)
    return canvas


def load_png_bytes(raw):
    np = _np()
    from PIL import Image
    return np.asarray(Image.open(io.BytesIO(raw)).convert('RGBA')).copy()


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('cmd', choices=['ramp', 'prepare', 'convert', 'calibrate', 'pack', 'check', 'preview', 'placeholder'])
    p.add_argument('pak', nargs='?')
    p.add_argument('--keyed', choices=['magenta'], help='a target-format painting (see prepare)')
    p.add_argument('--match-box', action='append', help='x0,y0,x1,y1: a garment matched region to region')
    for a in ('--wu', '--painting', '--pose', '--out', '--match', '--body', '--override', '--dir', '--code', '--sex', '--look'):
        p.add_argument(a)
    a = p.parse_args()
    sex = a.sex or 'wm'
    if a.cmd == 'ramp':
        r = fit_ramp(a.wu, sex=sex)
        json.dump(r, open(a.out, 'w'), indent=1)
        print(json.dumps(r['error']))
    elif a.cmd == 'prepare':
        ramp = json.load(open(os.path.join(os.path.dirname(os.path.abspath(a.out)), 'ramp.json')))
        g = grey_bare(a.wu, a.pose, ramp, sex)
        np = _np()
        bg = np.zeros_like(g)
        bg[...] = (255, 0, 255, 255)
        blend(bg, g, 0, 0)
        from PIL import Image
        Image.fromarray(bg[..., :3], 'RGB').resize((1024, 1024), Image.LANCZOS).save(a.out)
        open(os.path.splitext(a.out)[0] + '.prompt.txt', 'w').write(PROMPT.format(pose=POSE_WORDS[a.pose]))
        print(a.out)
    elif a.cmd == 'convert':
        ramp = json.load(open(os.path.join(os.path.dirname(os.path.abspath(a.out)), 'ramp.json')))
        m = load_rgba(a.match) if a.match else None
        boxes = [[int(v) for v in b.split(',')] for b in (a.match_box or [])]
        img, info = convert(a.wu, a.painting, a.pose, ramp, m, sex, boxes, a.keyed)
        from PIL import Image
        Image.fromarray(img, 'RGBA').save(a.out)
        print(json.dumps(info))
    elif a.cmd == 'calibrate':
        body = load_rgba(a.body)
        ov = json.load(open(a.override)) if a.override else None
        anchors = calibrate(a.wu, body, a.pose, ov, sex)
        json.dump(anchors, open(a.out, 'w'), indent=1)
        print(json.dumps(anchors))
    elif a.cmd == 'pack':
        blob = pack(a.dir)
        pre = 'ww' if (a.body or 'm') == 'f' else 'wm'
        dest = os.path.join(a.out, 'merge/data/avatar/wu', f'{pre}_nw_{a.code}.pak')
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        open(dest, 'wb').write(blob)
        print(dest, len(blob))
    elif a.cmd == 'preview':
        look = list(bytes.fromhex(a.look))
        ents = read_pak(open(a.pak, 'rb').read()) if a.pak else None
        from PIL import Image
        Image.fromarray(render(a.wu, look, a.pose, ents), 'RGBA').save(a.out)
    elif a.cmd == 'placeholder':
        open(a.out, 'wb').write(placeholder())
    elif a.cmd == 'check':
        ents = read_pak(open(a.pak, 'rb').read())
        print('ok', {k: len(v) for k, v in ents.items()})


if __name__ == '__main__':
    main()
