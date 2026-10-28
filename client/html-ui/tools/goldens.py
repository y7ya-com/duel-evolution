"""Golden set from captures made with grab.py (one dir per state): golden/<state>.png (the game frame without the mouse
cursor), <state>-bg.png (the same frame read back before the dialog's first draw), <state>.json (the widget state,
read off the logged draws), <state>.draws.json (the logged draw calls themselves).

    python3 tools/goldens.py <captures dir> [login|signin] [out dir]
"""
import json, os, shutil, sys
SRC, MODE = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else 'login')
OUT = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'golden')
# where the widgets are: input rows (screen y of the field) and buttons (screen x0, y0 of their switch quads)
FIELDS = {'login': {360: 'user', 424: 'pass'}, 'signin': {376: 'user', 412: 'pass'}}[MODE]
BUTTONS = {'login': {(376, 480): 'ok', (536, 480): 'cancel'}, 'signin': {(272, 312): 'discord', (272, 438): 'signin'}}[MODE]
# what was typed before each capture (the draw log shows only glyph counts, checked below)
TYPED = {'signin': {'idle': ('', ''), 'hover-discord': ('', ''), 'press-signin': ('Duelist', 'Secret12'),
                    'typed': ('Duelist', 'Secret12'), 'focus-pass': ('Duelist', '')}}.get(MODE) or {'idle': ('', ''), 'hover-ok': ('', ''), 'hover-cancel': ('', ''), 'focus-pass': ('', ''),
         'pass-typed': ('', 'Secret12'), 'user-typed': ('Duelist', 'Secret12'), 'check-user-on': ('Duelist', 'Secret12'),
         'check-both-on': ('Duelist', 'Secret12'), 'press-cancel': ('Duelistst', 'Secret12'),
         'press-cancel-off': ('Duelistst', 'Secret12')}

def quads(dr):
    vs = dr['vs']
    for q in range(0, len(vs), 6):
        Q = vs[q:q + 6]
        yield (min(v[0] for v in Q), min(v[1] for v in Q), max(v[0] for v in Q), max(v[1] for v in Q),
               round(min(v[7] for v in Q) * dr['tw']), round(min(v[8] for v in Q) * dr['th']), Q[0][3:7])

for state, (user, pw) in TYPED.items():
    if not os.path.isdir(f'{SRC}/{state}'): continue
    d = json.load(open(f'{SRC}/{state}/draws.json'))
    s = {'user': user, 'pass': pw, 'focus': None, 'caret': False, **{b: 0 for b in BUTTONS.values()}}
    if MODE == 'login': s.update(saveUser=False, savePass=False)
    glyphs = {y: 0 for y in FIELDS}
    for dr in d['draws']:
        for x0, y0, x1, y1, u, v, col in quads(dr):
            if (dr['tw'], dr['th']) == (16, 16) and x1 - x0 == 2:            # kasoru: the caret, 0 wide when off
                s['focus'], s['caret'] = FIELDS[y0], True
            elif (dr['tw'], dr['th']) == (128, 32) and (x0, y0) in BUTTONS and u % 24 == 0:   # swich: 24 px per state
                s[BUTTONS[(x0, y0)]] = u // 24
            elif (dr['tw'], dr['th']) == (32, 16) and u == 16:              # check mark
                s['saveUser' if y0 == 384 else 'savePass'] = True
            elif (dr['tw'], dr['th']) == (256, 256) and col[:3] == [0, 0, 0] and y0 in glyphs:
                glyphs[y0] += 1
    assert list(glyphs.values()) == [len(user), len(pw)], (state, glyphs)
    snaps = os.listdir(f'{SRC}/{state}')
    # read-backs before the mouse cursor (64x64; tex ids 1/12 in the first captures) and before the window (128x32 / 21)
    cur = next(f for f in ['snap_t64x64.png', 'snap_t1.png', 'snap_t12.png'] if f in snaps)
    bg = next(f for f in ['snap_t128x32.png', 'snap_t21.png'] if f in snaps)
    os.makedirs(OUT, exist_ok=True)
    shutil.copy(f'{SRC}/{state}/{cur}', f'{OUT}/{state}.png')
    shutil.copy(f'{SRC}/{state}/{bg}', f'{OUT}/{state}-bg.png')
    shutil.copy(f'{SRC}/{state}/draws.json', f'{OUT}/{state}.draws.json')
    json.dump(s, open(f'{OUT}/{state}.json', 'w'))
    print(state, s)
