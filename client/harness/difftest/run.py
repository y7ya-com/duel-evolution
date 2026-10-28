"""Runs every differential case in cases/*.py (see harness/README.md, HOWTO).

    harness/.venv/bin/python -I harness/difftest/run.py [filter]     # filter: substring of a case name or address
"""
import glob
import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "cases")]
from core import CASES, check  # noqa: E402


def main():
    for path in sorted(glob.glob(os.path.join(HERE, "cases", "*.py"))):
        importlib.import_module(os.path.basename(path)[:-3])
    filt = sys.argv[1].lower() if len(sys.argv) > 1 else ""
    todo = [c for c in CASES if filt in c[0] or filt in f"{c[1]:#x}"]
    ok = sum(check(*c) for c in todo)
    print(f"\n{ok}/{len(todo)} cases pass, {len({c[1] for c in todo})} functions")
    sys.exit(ok != len(todo))


if __name__ == "__main__":
    main()
