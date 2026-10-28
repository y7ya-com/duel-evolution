"""Rank an RC_PROF_DUMP tally (rt/prof.c) per scene: the guest functions by own time (innermost f_ frame), the host
leaves (runtime, libc, GL) and the biggest inclusive f_ frames, as % of the scene's busy samples.
    python3 tools/profsum.py <dump> [top=10] [names.tsv]
names.tsv (optional): "address<TAB>name" lines, e.g. from src/'s decomp names, printed next to each f_."""
import sys
from collections import defaultdict

SCENES = {0x2c: "boot", 4: "title", 6: "login", 7: "select", 10: "My Room", 12: "lobby", 0x1c: "duel", 0x1e: "janken",
          0x20: "result"}
rows = defaultdict(list)
for line in open(sys.argv[1]):
    sc, self_, gself, incl, name = line.rstrip("\n").split("\t")
    rows[int(sc, 16)].append((name, int(self_), int(gself), int(incl)))
top = int(sys.argv[2]) if len(sys.argv) > 2 else 10
names = {}
if len(sys.argv) > 3:
    for line in open(sys.argv[3]):
        a, _, n = line.rstrip("\n").partition("\t")
        names["f_%08x" % int(a, 16)] = n


def label(sc):
    base = SCENES.get(sc & 0xff, hex(sc & 0xff))
    return ("switch -> " if sc & 0x100 else "") + base


for sc in sorted(rows, key=lambda s: -sum(r[1] for r in rows[s] if r[0] == "(total)")):
    r = rows[sc]
    # the frame loop's wait (CApp::frameLoop: pump messages, Sleep(1), again) is a busy spin under RC_FASTFORWARD
    pump = sum(x[3] for x in r if x[0] == "f_0042b8a0")
    total = sum(x[1] for x in r if x[0] == "(total)") - pump
    idle = sum(x[1] for x in r if x[0] == "(idle)")
    if total < 200:
        continue
    print(f"\n## {label(sc)}: {total} busy samples (~{total} ms CPU), {idle} idle, {pump} in the frame loop's wait")
    r = [x for x in r if x[0] != "f_0042b8a0" and x[0] not in ("poll", "_kernelrpc_mach_port_insert_member_trap",
         "_kernelrpc_mach_port_extract_member_trap")]   # the wait's own leaves (sockets, SDL's event pump)
    for title, key, keep in (("guest self", 2, lambda x: x[0].startswith("f_")),
                             ("host leaf", 1, lambda x: not x[0].startswith(("f_", "("))),
                             ("inclusive f_", 3, lambda x: x[0].startswith("f_") and x[3] < 0.95 * total)):
        best = sorted((x for x in r if keep(x)), key=lambda x: -x[key])[:top]
        print(f"  {title}: " + ", ".join(f"{x[0]}{' ' + names[x[0]] if x[0] in names else ''} {100 * x[key] / total:.1f}%"
                                          for x in best))
