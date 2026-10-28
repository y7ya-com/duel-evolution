"""Which merge.dat PNG is each texture? Texel-exact match of GL texture dumps (dumptex.py) against every PNG member.

    python3 tools/findsrc.py <merge.dat> <kcejyugi.py dir> tex21.png tex22.png ...
"""
import io, mmap, struct, sys
sys.path.insert(0, sys.argv[2])
import kcejyugi as K
import numpy as np
from PIL import Image
data = mmap.mmap(open(sys.argv[1], 'rb').fileno(), 0, access=mmap.ACCESS_READ)
_, mem = K.read_directory(data)
want = {p: np.array(Image.open(p).convert('RGBA')) for p in sys.argv[3:]}
for m in mem:
    if not m.name.lower().endswith('.png'): continue
    b = K.member_bytes(data, m)
    if b[:8] != b'\x89PNG\r\n\x1a\n': continue
    w, h = struct.unpack('>II', b[16:24])
    for p, a in want.items():   # a texture is the PNG top-left in a power-of-two texture
        if w <= a.shape[1] < 2 * w and h <= a.shape[0] < 2 * h:
            im = np.array(Image.open(io.BytesIO(b)).convert('RGBA'))
            if (im == a[:h, :w]).all(): print(p, '=', m.name, f'{w}x{h}')
