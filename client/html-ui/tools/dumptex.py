# dumptex.py OUT id... : raw texture readback (B,G,R,A as stored) -> RGBA PNG
import base64, json, sys, urllib.parse, urllib.request
from PIL import Image
def ev(js): return json.loads(urllib.request.urlopen('http://127.0.0.1:9400/eval?' + urllib.parse.urlencode({'js': js}), timeout=60).read())
out = sys.argv[1]
for t in sys.argv[2:]:
    r = json.loads(ev(f'JSON.stringify(__gl.dumpTex({t}))'))
    raw = base64.b64decode(r['data'])
    b = bytearray(raw); b[0::4], b[2::4] = raw[2::4], raw[0::4]   # BGRA -> RGBA
    Image.frombytes('RGBA', (r['w'], r['h']), bytes(b)).save(f'{out}/tex{t}.png')
    print(t, r['w'], r['h'])
