"""Copy the login dialog's textures out of merge.dat byte for byte (the game's own PNGs).

    python3 tools/extract_assets.py <merge.dat> <kcejyugi.py dir>

Which files: logged from the web build's draw calls (tools/hook.js) and matched texel for texel against every PNG in
merge.dat (the GL textures are these PNGs, top-left in a power-of-two texture).
"""
import os, sys
sys.path.insert(0, sys.argv[2])
import kcejyugi as K   # duel-evolution-restore/extraction/tools: KCEJYUGI directory + LZSS

FILES = ['data\\common\\window\\window_base_01_c01.png',   # window frame + input field (96x24)
         'data\\common\\window\\swich_01_c00.png',         # buttons: normal / hover / pressed / two yellow (120x24)
         'data\\common\\window\\check_01_c00.png',         # checkbox box + check mark (32x16)
         'data\\common\\window\\kasoru_01_c00.png']        # text caret (16x16, 2 px used)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
data = open(sys.argv[1], 'rb').read()
_, members = K.read_directory(data)
by = {m.name.lower(): m for m in members}
# the game cursor's art (htmlui/cursor.js builds the CSS cursor from it, no clamp copies): the hand
# (CHandCursorTask's CSwfEngine animations, data/common/m_cursor) and the arrow (CArrowCursorTask)
CURSOR = sorted(n for n in by if n.startswith('data\\common\\m_cursor\\') and n.endswith('.png')) \
    + ['data\\common\\window\\mausuk_01_c00.png']
for f in FILES + CURSOR:
    b = K.member_bytes(data, by[f.lower()])
    open(os.path.join(out, f.rsplit('\\', 1)[1]), 'wb').write(b)
    print(f, len(b), 'bytes')

# The game samples every LINEAR sprite half a texel up-left (D3D8 pixel centres; the recomp's vertex shader keeps
# that), so a tile on the atlas's top or left edge reads the CLAMP_TO_EDGE texel beyond it. assets/clamp/<name>.png is
# the PNG with that clamp written out: its top row and left column repeated once (ui.js draws through them).
# GL filters the texels unpremultiplied (a transparent texel's RGB, often white, bleeds into the colour); Chrome
# filters premultiplied. <name>.rgb.png is the same texels made opaque: drawn masked by <name>.png (CSS mask-image),
# Chrome then computes filtered RGB x filtered alpha + dst x (1 - alpha), the game's blend.
from PIL import Image
os.makedirs(os.path.join(out, 'clamp'), exist_ok=True)
for f in FILES:
    n = f.rsplit('\\', 1)[1]
    im = Image.open(os.path.join(out, n)).convert('RGBA')
    p = Image.new('RGBA', (im.width + 1, im.height + 1))
    p.paste(im, (1, 1)); p.paste(im.crop((0, 0, im.width, 1)), (1, 0)); p.paste(p.crop((1, 0, 2, im.height + 1)), (0, 0))
    p.save(os.path.join(out, 'clamp', n))
    rgb = p.copy(); rgb.putalpha(255)
    rgb.save(os.path.join(out, 'clamp', n[:-4] + '.rgb.png'))
