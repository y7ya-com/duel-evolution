# grab.py OUT [snapAt,...]: record one frame through hook.js (via drive.mjs :9400), save draws.json + snap_<i>.png
import base64, json, os, sys, time, urllib.parse, urllib.request
from PIL import Image
D = os.environ.get('DRIVE', '127.0.0.1:9400')
def ev(js):
    return json.loads(urllib.request.urlopen(f'http://{D}/eval?' + urllib.parse.urlencode({'js': js}), timeout=120).read())
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
snaps = [int(x) for x in sys.argv[2].split(',')] if len(sys.argv) > 2 and sys.argv[2] else []
ev(f'__gl.last=null;__gl.snapAt={json.dumps(snaps)};__gl.snapTex=["128x32","64x64"];__gl.arm=1')
for _ in range(100):
    time.sleep(0.1)
    if ev('__gl.last!==null'): break
last = json.loads(ev('JSON.stringify(__gl.last)'))
for k, v in last.pop('snaps').items():
    im = Image.frombytes('RGBA', (1024, 768), base64.b64decode(v))
    im.putalpha(255)
    im.convert('RGB').save(f'{out}/snap_{k}.png')
json.dump(last, open(f'{out}/draws.json', 'w'))
print(len(last['draws']), 'draws, frame', last['frame'])
