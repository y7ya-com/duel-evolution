"""Annotated disassembly: objdump of an exe range with each call/jmp target followed through its incremental-link
thunk and named (the @yo2 markers, as dc.py names them), string literals shown, padding dropped.
    python3 -I tests/game/asm.py 0xa0fd90 0xa12f40"""
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dc  # noqa: E402

EXE = os.path.join(dc.DATA, "yo2.exe")


def main():
    lo, hi = int(sys.argv[1], 16), int(sys.argv[2], 16)
    funcs, thunks, names = dc.load()
    out = subprocess.run(["i686-w64-mingw32-objdump", "-d", "-M", "intel", "--start-address=%d" % lo,
                          "--stop-address=%d" % hi, EXE], capture_output=True, text=True).stdout
    for line in out.splitlines():
        m = re.match(r"\s+([0-9a-f]+):\t[0-9a-f ]+\t(.*)", line)
        if not m:
            continue
        addr, ins = m.group(1), re.sub(r"\s+", " ", m.group(2)).strip()
        if ins in ("nop", "int3") or ins.startswith("lea ecx,[ecx+0x0]"):
            continue
        note = ""
        t = re.search(r"(?:call|jmp|j\w+) 0x([0-9a-f]+)", ins)
        if t:
            a = int(t.group(1), 16)
            a = thunks.get(a, a)
            n = names.get(a)
            note = n if n else "FUN_%08x" % a
        else:
            for v in re.findall(r"0x([0-9a-f]{6,8})", ins):
                s = dc.cstr(int(v, 16))
                if s:
                    note = '"%s"' % s[:60]
                    break
        print("%s  %-48s %s" % (addr, ins, ("; " + note) if note else ""))


if __name__ == "__main__":
    main()
