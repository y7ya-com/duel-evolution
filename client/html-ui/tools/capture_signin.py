"""Capture the in-game sign-in panel's states from a web build (served by serve.mjs with the signed-out session) through
a CDP driver on :9400 (yo2-decomp-data web/run/drive.mjs), at the title screen already:

    python3 tools/capture_signin.py <captures dir>      then: python3 tools/goldens.py <captures dir> signin golden-signin
"""
import os, subprocess, sys, time, urllib.parse, urllib.request
D = 'http://' + os.environ.get('DRIVE', '127.0.0.1:9400')
OUT = sys.argv[1]
def get(p, **q): return urllib.request.urlopen(D + p + '?' + urllib.parse.urlencode(q), timeout=60).read()
def move(x, y): get('/move', x=x, y=y); time.sleep(0.5)
def click(x, y):   # a human-speed click: the game drops a press in the same frame as the move
    move(x, y); get('/down', x=x, y=y); time.sleep(0.2); get('/up', x=x, y=y); time.sleep(0.5)
def typ(s):
    for c in s: get('/key', k=c)
    time.sleep(0.5)
def grab(state): subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), 'grab.py'), f'{OUT}/{state}'], check=True)

click(512, 458); time.sleep(6)             # ONLINE -> the sign-in panel
move(1000, 700); grab('idle')
move(488, 324); grab('hover-discord')      # Sign in with Discord (centre 488,324)
click(488, 384); typ('Duelist')            # Username field
click(488, 420); move(1000, 700); grab('focus-pass')
typ('Secret12'); grab('typed')
move(488, 450); get('/down', x=488, y=450); time.sleep(0.6); grab('press-signin')   # held on Sign in
move(1000, 700); get('/up', x=1000, y=700)  # released off it: no click
