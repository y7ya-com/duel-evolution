"""Writes the smoke test's Boxedwine automation script (script.txt v2) to stdout.

    python3 -I script.py USER PASSWORD             # the smoke run, gated on the checkpoint images in ref/
    python3 -I script.py USER PASSWORD --capture rules|login|charsel   # reach that screen on fixed waits, then
        block on never.bmp (script.py --never <path> writes it): after 300 s Boxedwine writes the whole guest screen
        to failed.bmp; then `script.py --crop <that bmp> <stage>` writes ref/<stage>.bmp from CHECK[stage]

Format: CMD=value per line, no blank lines or comments, WAIT < 300 s, >= 1 s between clicks/keys. Coordinates are
guest pixels (the 1024x768 Wine desktop; the game window sits at its top-left). Keys are SDL scancodes.
WHILEWAITING=secs,LBUTTON,x,y clicks while a SCREENSHOT hasn't matched yet (and keeps resetting the player's 5-minute
timeout, so run.sh's SECS is what bounds a run that never gets there).
"""
import struct
import sys

# Checkpoints: guest rectangle x, y, w, h of a static part of each screen, cropped from a capture run's failed.bmp.
CHECK = {"rules": (262, 210, 450, 20), "login": (260, 300, 420, 40), "charsel": (450, 290, 480, 30)}
ONLINE, WEITER, USER_FIELD, PASS_FIELD, OK, CHAR0 = (512, 464), (512, 568), (490, 382), (490, 444), (416, 500), (600, 358)


def click(x, y):
    return [f"MOVETO={x},{y}", "WAIT=1", f"MOUSEDOWN=0,{x},{y}", f"MOUSEUP=0,{x},{y}"]


def keys(text):   # lowercase letters and digits
    out = []
    for c in text:
        sc = 4 + ord(c) - ord("a") if c.isalpha() else 39 if c == "0" else 29 + int(c)
        out += [f"KEYDOWN={sc}", f"KEYUP={sc}"]
    return out


def check(name):
    x, y, w, h = CHECK[name]
    return f"SCREENSHOT={x},{y},{w},{h},{name}.bmp"


def login(user, password):
    return [*click(*USER_FIELD), *keys(user), *click(*PASS_FIELD), *keys(password), *click(*OK)]


def smoke(user, password):
    return ["VERSION=2",
            f"WHILEWAITING=5,LBUTTON,{ONLINE[0]},{ONLINE[1]}", check("rules"),   # click ONLINE until the rules page
            f"WHILEWAITING=5,LBUTTON,{WEITER[0]},{WEITER[1]}", check("login"),   # click Weiter until the login dialog
            "WHILEWAITING=0", *login(user, password),
            check("charsel"),                                                   # gate + account server + list
            *click(*CHAR0), "WAIT=90",                                          # trunk, PBIN, lobby
            "DONE"]


def capture(user, password, stage):
    steps = {"rules": ["WAIT=150", *click(*ONLINE), "WAIT=20"],
             "login": ["WAIT=150", *click(*ONLINE), "WAIT=20", *click(*WEITER), "WAIT=10"],
             "charsel": ["WAIT=150", *click(*ONLINE), "WAIT=20", *click(*WEITER), "WAIT=10",
                         *login(user, password), "WAIT=60"]}[stage]
    return ["VERSION=2", *steps, "SCREENSHOT=never.bmp", "DONE"]


def never_bmp(path, w=1024, h=768):
    """Solid magenta: no screen ever matches it."""
    row = b"\xff\x00\xff" * w
    data = row * h   # 1024 * 3 is already a multiple of 4: no row padding
    hdr = b"BM" + struct.pack("<IHHI", 54 + len(data), 0, 0, 54)
    hdr += struct.pack("<IiiHHIIiiII", 40, w, h, 1, 24, 0, len(data), 2835, 2835, 0, 0)
    with open(path, "wb") as f:
        f.write(hdr + data)


def crop(src, name):
    """ref/<name>.bmp = CHECK[name]'s rectangle of a capture (24-bit bottom-up BMP, as Boxedwine writes them)."""
    b = open(src, "rb").read()
    off, w, h, bpp = struct.unpack_from("<I", b, 10)[0], *struct.unpack_from("<iiHH", b, 18)[:2], struct.unpack_from("<H", b, 28)[0]
    assert bpp in (24, 32) and h > 0, (bpp, h)
    px, stride = bpp // 8, (w * bpp // 8 + 3) & ~3
    x, y, cw, ch = CHECK[name]
    rows = [b[off + (h - 1 - yy) * stride + x * px: off + (h - 1 - yy) * stride + (x + cw) * px] for yy in range(y, y + ch)]
    if px == 4:
        rows = [b"".join(r[i:i + 3] for i in range(0, len(r), 4)) for r in rows]
    pad = b"\0" * ((-cw * 3) % 4)
    data = b"".join(r + pad for r in reversed(rows))
    hdr = b"BM" + struct.pack("<IHHI", 54 + len(data), 0, 0, 54)
    hdr += struct.pack("<IiiHHIIiiII", 40, cw, ch, 1, 24, 0, len(data), 2835, 2835, 0, 0)
    out = f"{__file__.rsplit('/', 1)[0]}/ref/{name}.bmp"
    with open(out, "wb") as f:
        f.write(hdr + data)
    print(out)


if __name__ == "__main__":
    if sys.argv[1] == "--never":
        sys.exit(never_bmp(sys.argv[2]))
    if sys.argv[1] == "--crop":   # script.py --crop capture-rules.bmp rules
        sys.exit(crop(sys.argv[2], sys.argv[3]))
    user, password = sys.argv[1:3]
    lines = capture(user, password, sys.argv[4]) if sys.argv[3:4] == ["--capture"] else smoke(user, password)
    sys.stdout.write("".join(line + "\r\n" for line in lines))
