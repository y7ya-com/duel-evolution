"""src/Game cases (the Game session's file)."""
import random
import struct

from core import case


# --- src/Game: CPbinDictionary (yo2PlayerBin.cpp). this = 0x70 task bytes + 1024 records of 7 dwords.
def pbin_dictionary(e, seed):
    rnd = random.Random(seed)
    return e.alloc(rnd.randbytes(0x70) + b"".join(struct.pack("<7i", *(rnd.randint(-5, 9999) for _ in range(7)))
                                                  for _ in range(0x400)))


@case(0xAD5920, conv="thiscall", params=[0, 1, 2])
def pbin_get_info(e, f, seed):
    d, out = pbin_dictionary(e, seed), e.alloc(0x1C * 3)
    # bool in AL: the original leaves EAX's upper bytes as they were
    return [f(d, pbin, out + 0x1C * k) & 0xFF for k, pbin in enumerate((0, 0x200 + seed, 0x3FF))]


for _addr in (0xAD5EB0, 0xAD6020, 0xAD6190, 0xAD6300, 0xAD6470):   # initial / kind / slot / nameText / series
    @case(_addr, conv="thiscall", params=[0, 1])
    def pbin_field(e, f, seed):
        d = pbin_dictionary(e, seed)
        return [f(d, pbin) for pbin in (0, 1, 7, 0x1FF, 0x3FE, 0x3FF)]
