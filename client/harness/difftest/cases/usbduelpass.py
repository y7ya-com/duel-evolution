# src/UsbDuelpass differential cases (globals injected by run.py: case, Emu, EmuError, random, struct).
import random  # noqa: F401
import struct  # noqa: F401

from core import Emu, EmuError, case  # noqa: F401


def usb_key_env(e, platform, major, code, payload):
    def get_version(e, p):
        e.trace.append(("GetVersionExA", e.u32(p)))   # the size field the caller set; the buffer itself is a stack local
        e.w32(p + 4, major)
        e.w32(p + 16, platform)
        return 1

    def get_code(e, buf, n):
        e.trace.append(("GetDuelPassCode", n))
        e.write(buf, payload)
        return code
    e.on_import("GetVersionExA", get_version, nargs=1, stdcall=True)
    e.on_import("?GetDuelPassCode@@YA?AW4MagicKeyStatusCode@@PADI@Z", get_code, nargs=2, stdcall=False)


# (enabled, platform id, major version, MagicKey result). Result 0 ("buffer too small") is the assert path: the exe's
# assertion box vs ours, not comparable here.
USB_PARAMS = [(en, pl, mj, r) for en in (0, 1) for pl, mj in ((1, 4), (2, 3), (2, 4), (2, 5), (2, 6), (3, 5))
              for r in (1, -1)] + [(1, 2, 5, r) for r in (-6, -5, -2, 2, 7, -7, -100)] + [(0x100, 2, 5, 1)]


@case(0x8CDC70, conv="thiscall", params=USB_PARAMS)
def usb_key_read(e, f, param):
    enabled, platform, major, code = param
    usb_key_env(e, platform, major, code, bytes((i * 37 + 5) & 0xFF for i in range(0x100)))
    key = e.alloc(random.Random(code).randbytes(0x18))
    f(key, enabled)   # 0x100: only the low byte counts (0 = disabled)
    return e.read(key, 0x18).hex()
