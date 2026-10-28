"""Differential-test core: each case runs once against yo2.exe's original code, once against yo2rep.dll's yo2_<addr>
export, and once against the original address with the replacement jmps patched in ("patched": what the running
game sees), each in a fresh Emu with identical inputs, then compares the case's return value, the import trace, the
arena, the heap and the exe's writable sections. Cases live in cases/<folder>.py; see harness/README.md (HOWTO).
"""
import gc
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from emu import Emu, EmuError, vtable  # noqa: E402,F401

CASES = []


def case(addr, conv="cdecl", params=(None,)):
    def deco(fn):
        CASES.append((fn.__name__, addr, conv, list(params), fn))
        return fn
    return deco


def run_side(side, addr, conv, fn, param):
    e = Emu(side)
    try:
        return e, ("ok", fn(e, e.fn(addr, conv), param))
    except (EmuError, AssertionError) as x:
        return e, ("error", f"{type(x).__name__}: {x}")


def diff(a, b):
    """First differing byte runs between two snapshots."""
    out = []
    for (base, x), (_, y) in zip(a, b):
        if x == y:
            continue
        if len(x) != len(y):   # arena/heap: one side allocated more
            out.append(f"{base:#x}: orig used {len(x):#x} bytes, rewrite {len(y):#x}")
            x, y = x[:min(len(x), len(y))], y[:min(len(x), len(y))]
        i = 0
        while i < len(x) and len(out) < 4:
            if x[i] != y[i]:
                j = i
                while j < len(x) and x[j] != y[j] and j - i < 16:
                    j += 1
                out.append(f"{base + i:#x}: orig {x[i:j].hex()} rewrite {y[i:j].hex()}")
                i = j
            else:
                i += 1
    return out


def check(name, addr, conv, params, fn):
    fails = []
    for p in params:
        eo, ro = run_side("orig", addr, conv, fn, p)
        why = [f"original failed to run: {ro[1]}"] if ro[0] == "error" else []
        for side in ("rewrite", "patched"):
            er, rr = run_side(side, addr, conv, fn, p)
            if ro != rr:
                why.append(f"{side} result: orig {ro!r:.300} {side} {rr!r:.300}")
            if eo.trace != er.trace:
                why.append(f"{side} trace: orig {eo.trace!r:.300} {side} {er.trace!r:.300}")
            why += [f"{side} {d}" for d in diff(eo.snapshot(), er.snapshot())]
        if why:
            fails.append((p, why))
        del eo, er
        gc.collect()   # an Emu's hooks close over it: without this each input's three Emus pile up (~10 MB each)
    status = "PASS" if not fails else "FAIL"
    print(f"{status} {addr:#010x} {name} ({len(params) - len(fails)}/{len(params)})")
    for p, why in fails[:3]:
        print(f"     param {p!r:.80}")
        for w in why:
            print(f"       {w}")
    return not fails
