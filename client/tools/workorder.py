"""Work order from the execution trace: every game-code function, layered by how the played game reaches it.

    python3 -I tools/workorder.py            # writes $YO2_DATA/trace/WORKORDER.tsv + WORKORDER.md

Layers (a function takes the first that reaches it; the fixpoint repeats 2/3/5i until nothing new is live):
  1   ran in the trace (trace/executed.tsv; an island = code Ghidra never made a function, found from trace blocks)
  2   called (transitively) by live code but never ran: error paths, rare branches
  3   virtual method of a live class (its vftable address is loaded by live code)
  5i  only reached through a function pointer that live code holds: an absolute address (.reloc) inside live code,
      or an entry of a data table that has a live entry or whose address live code loads
  4   referenced only by non-live code (calls, vtables of dead classes, pointers): unplayed features
  5d  no reference at all: dead
Core = 1, 2, 3, 5i. Order: core first, then by play phase (boot, title, login, My Room, lobby, shop, deck, duel),
folder, address. A non-ran function inherits the earliest phase of the live code that reaches it.
"""
import bisect
import collections
import glob
import json
import os
import re
import struct

DATA = os.environ.get("YO2_DATA", "/Users/y/Documents/GitHub/yo2-decomp-data")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
T = os.path.join(DATA, "trace")
# trace phase -> play order: 1 boot+title, 2 login, 3 My Room, 5 lobby, 6 NPC dialog, 7 shop, 4 deck editor, 8 duel
RANK = {1: 1, 2: 2, 3: 3, 5: 4, 6: 5, 7: 6, 4: 7, 8: 8}
SKIP = {"Test", "Patcher"}   # README Scope: not rebuilt, stubbed
# Compiler/header boilerplate copied into every object file; rows with these bodies are status "hdr", owned by the
# header owner as marker lists (they come for free from the declarations): call/jmp initializer stub, guarded local
# static, its atexit callback, jmp initializer stub, atexit registration, scalar deleting destructor.
HDR_REPS = [0x615bc0, 0x615ac0, 0x615af0, 0x615b10, 0x615c00, 0x618b20]

b = open(os.path.join(DATA, "yo2.exe"), "rb").read()
pe = struct.unpack_from("<I", b, 0x3c)[0]
opt = struct.unpack_from("<H", b, pe + 20)[0]
BASE = struct.unpack_from("<I", b, pe + 52)[0]
secs = []
for i in range(struct.unpack_from("<H", b, pe + 6)[0]):
    o = pe + 24 + opt + i * 40
    vsz, va, rsz, raw = struct.unpack_from("<IIII", b, o + 8)
    secs.append((b[o:o + 8].rstrip(b"\0").decode(), BASE + va, vsz, raw, rsz))


def sec(va):
    for n, lo, vsz, raw, rsz in secs:
        if lo <= va < lo + vsz:
            return n, raw + va - lo if va - lo < rsz else None
    return None, None


def u32(va):
    _, o = sec(va)
    return struct.unpack_from("<I", b, o)[0] if o is not None else None


# --- functions, thunks, labels
funcs = {}
for l in open(os.path.join(DATA, "functions2.jsonl")):
    f = json.loads(l)
    if not f["a"].startswith("EXT"):
        funcs[int(f["a"], 16)] = f
labels = {}
for l in open(os.path.join(DATA, "labels.tsv")):
    a, size, kind, src, name = l.rstrip("\n").split("\t")
    labels[int(a, 16)] = (kind, src or "-", name, int(size))


def res(a, hops=4):
    """follow incremental-link thunks (jmp rel32) to the real function."""
    while hops and a in funcs and funcs[a].get("thunk"):
        _, o = sec(a)
        if o is None or b[o] != 0xE9:
            break
        a = (a + 5 + struct.unpack_from("<i", b, o + 1)[0]) & 0xFFFFFFFF
        hops -= 1
    return a


starts = sorted(funcs)
GAME = {a for a, v in labels.items() if v[0] in ("game", "unlabeled")}


def owner(x):
    i = bisect.bisect_right(starts, x) - 1
    for j in range(i, max(i - 64, -1), -1):
        a = starts[j]
        if x < a + max(funcs[a]["size"], 1):
            return a
    return None


# --- the trace: ran functions (+ islands: trace blocks outside every function, inside game code)
phase, samples = {}, {}
for l in list(open(os.path.join(T, "executed.tsv")))[1:]:
    a, name, kind, src, fp, blocks, smp = l.rstrip("\n").split("\t")[:7]
    a = res(int(a, 16))
    p = int(fp.split()[0])
    phase[a] = min(phase.get(a, 9), p)
    samples[a] = samples.get(a, 0) + int(smp or 0)
seen = {}
for path in glob.glob(os.path.join(T, "raw", "blocks*.txt")):
    for pair in open(path).read().strip().strip('"').split(","):
        a, p = (int(v, 16) for v in pair.split(":"))
        seen[a] = min(seen.get(a, 9), p)
game_lo = min(GAME)
game_hi = max(a + labels[a][3] for a in GAME)
islands = {}
for a, p in seen.items():
    if owner(a) is not None:
        continue
    i = bisect.bisect_right(starts, a) - 1
    prev_end = starts[i] + funcs[starts[i]]["size"] if i >= 0 else a
    q = a & ~15
    while q > prev_end and b[sec(q)[1] - 1] != 0xCC:   # incremental link: each function 16-aligned after 0xCC padding
        q -= 16
    q = max(q, (prev_end + 15) & ~15)
    if q > a:
        q = a
    nb = labels.get(starts[i]) if i >= 0 else None
    if nb is None or nb[0] not in ("game", "unlabeled"):
        continue   # islands in yaneSDK / library ranges are not ours to rewrite
    isl = islands.setdefault(q, [nb[1], 9])
    isl[1] = min(isl[1], p)
for q, (src, p) in islands.items():
    nxt = starts[bisect.bisect_right(starts, q)]
    later = [x for x in islands if q < x < nxt]
    end = min(later + [nxt])
    _, o = sec(q)
    size = end - q
    while size > 1 and b[o + size - 1] == 0xCC:
        size -= 1
    labels[q] = ("game", src, f"island_{q:08x}", size)
    GAME.add(q)
    phase[q] = min(phase.get(q, 9), p)
    cs = [q + k + 5 + struct.unpack_from("<i", b, o + k + 1)[0] for k in range(size - 4) if b[o + k] == 0xE8]
    funcs[q] = {"a": f"{q:08x}", "size": size, "callees": [f"{c & 0xFFFFFFFF:08x}" for c in cs], "thunk": False}
starts = sorted(funcs)

# --- static graph: calls, absolute references (.reloc), vtables
calls = collections.defaultdict(set)
for a, f in funcs.items():
    if not f.get("thunk"):
        calls[a].update(res(int(c, 16)) for c in f["callees"] if not c.startswith("EXT") and int(c, 16) in funcs)
rel = next(s for s in secs if s[0] == ".reloc")
rlo, rsz = rel[3], rel[2]
fixups = []
o = rlo
while o < rlo + rsz:
    page, size = struct.unpack_from("<II", b, o)
    if size < 8:
        break
    for k in range(8, size, 2):
        e = struct.unpack_from("<H", b, o + k)[0]
        if e >> 12 == 3:
            fixups.append(BASE + page + (e & 0xFFF))
    o += size
ptr_code = collections.defaultdict(set)     # function -> functions whose address it loads
data_ref = collections.defaultdict(set)     # function -> data addresses it loads
data_ptr = {}                                # data location -> function it holds
text = next(s for s in secs if s[0] == ".text")
for loc in fixups:
    v = u32(loc)
    if v is None:
        continue
    in_text = text[1] <= loc < text[1] + text[2]
    tgt = res(v) if v in funcs else None
    if in_text:
        f = owner(loc)
        if f is None:
            continue
        if tgt is not None and tgt != f:
            ptr_code[f].add(tgt)
        elif sec(v)[0] in (".rdata", ".data"):
            data_ref[f].add(v)
    elif tgt is not None:
        data_ptr[loc] = tgt

# vftables from RTTI (as tools/vtables.py): COL at vftable[-1]
tds = {}
for m in re.finditer(rb"\.\?A[VU][A-Za-z0-9_@?$]+@@\0", b):
    for n, lo, vsz, raw, rsz in secs:
        if raw <= m.start() < raw + rsz:
            tds[lo + m.start() - raw - 8] = m.group(0)[4:-3].decode()
by_val = collections.defaultdict(list)
for loc in fixups:
    v = u32(loc)
    if v is not None:
        by_val[v].append(loc)
cols = {}
for td, name in tds.items():
    for loc in by_val.get(td, []):
        if u32(loc - 12) == 0:
            cols[loc - 12] = name
vtables = {}   # vftable va -> (class, [targets])
vslots = set()
for col, name in cols.items():
    for loc in by_val.get(col, []):
        vt, slots = loc + 4, []
        while len(slots) < 400:
            v = u32(vt + 4 * len(slots))
            if v is None or not (text[1] <= v < text[1] + text[2]) or (slots and v in cols):
                break
            vslots.add(vt + 4 * len(slots))
            slots.append(res(v))
        vtables[vt] = (name, slots)

# function-pointer tables in data: runs of pointer slots at most 16 bytes apart, vftables excluded
tables = []
for loc in sorted(l for l in data_ptr if l not in vslots):
    if tables and loc - tables[-1][1] <= 16:
        tables[-1][1] = loc
        tables[-1][2].append(loc)
    else:
        tables.append([loc, loc, [loc]])
table_of = {}
for t in tables:
    for loc in t[2]:
        table_of[loc] = t

# --- layers: one hop from code that ran (transitive closure through never-run code is layer 4: unplayed features)
ran = set(phase)
layer = {a: "1" for a in ran}
via = {a: "ran" for a in ran}
dkeys_ran = sorted(v for f in ran for v in data_ref.get(f, ()))


def loaded(lo, hi):
    """does code that ran load a data address in [lo, hi]?"""
    i = bisect.bisect_left(dkeys_ran, lo)
    return i < len(dkeys_ran) and dkeys_ran[i] <= hi


def put(a, L, how):
    if a not in layer:
        layer[a], via[a] = L, how


for f in ran:
    for c in calls.get(f, ()):
        put(c, "2", "call")
live_vt = {vt for vt in vtables if loaded(vt, vt)}
for vt in live_vt:
    for x in vtables[vt][1]:
        put(x, "3", "vtable")
for f in ran:
    for t in ptr_code.get(f, ()):
        put(t, "5i", "pointer")
live_tables = {t[0] for t in tables if any(data_ptr[l] in ran for l in t[2]) or loaded(t[0] - 32, t[1])}
for t in tables:
    if t[0] in live_tables:
        for l in t[2]:
            put(data_ptr[l], "5i", "table")
live = set(layer)
called, pointed, virt = set(), set(), set()
for f in funcs:
    called |= calls.get(f, set())
    pointed |= ptr_code.get(f, set())
pointed |= set(data_ptr.values())
for vt, (name, slots) in vtables.items():
    virt.update(slots)
for a in GAME:
    if a not in layer:
        how = "call" if a in called else "vtable" if a in virt else "pointer" if a in pointed else None
        layer[a], via[a] = ("4", how) if how else ("5d", "-")
for q in islands:
    if q in set(data_ptr.values()):
        via[q] = "init"   # dynamic initializer of a global (CRT __xc table): becomes a C++ global definition

# --- phases for layers 2/3/5i: earliest phase of the ran code that reaches them
rank = {a: RANK[p] for a, p in phase.items() if p in RANK}
rev = collections.defaultdict(set)
for f in ran:
    for c in calls.get(f, set()) | ptr_code.get(f, set()):
        rev[c].add(f)
dref = sorted((v, f) for f in ran for v in data_ref.get(f, ()))
dkeys = [v for v, _ in dref]


def loaders(lo, hi):
    return [f for _, f in dref[bisect.bisect_left(dkeys, lo):bisect.bisect_right(dkeys, hi)]]


for vt in live_vt:
    refs = loaders(vt, vt)
    for x in vtables[vt][1]:
        rev[x].update(refs)
for t in tables:
    if t[0] in live_tables:
        ents = [data_ptr[l] for l in t[2]]
        refs = loaders(t[0] - 32, t[1]) + [e for e in ents if e in rank]
        for e in ents:
            rev[e].update(refs)
for f in live - ran:
    r = min((rank[g] for g in rev.get(f, ()) if g in rank), default=None)
    if r is not None:
        rank[f] = r

# --- done: markers in the tree + DONE_ELSEWHERE
done = set()
mark = re.compile(r"@yo2\s+0x([0-9a-fA-F]+)")
for d in ("src", "third_party", "platform"):
    for r, _, fs in os.walk(os.path.join(ROOT, d)):
        for n in fs:
            if n.endswith((".cpp", ".c", ".h", ".hpp", ".inl")):
                done.update(int(m, 16) for m in mark.findall(open(os.path.join(r, n), errors="ignore").read()))
# DONE_ELSEWHERE.txt (unmerged branches) and src/<Folder>/REIMPLEMENTED.txt (replaced wholesale, e.g. Swf): one address per line
for el in [os.path.join(ROOT, "DONE_ELSEWHERE.txt")] + glob.glob(os.path.join(ROOT, "src", "*", "REIMPLEMENTED.txt")):
    done |= {int(l.split()[0], 16) for l in open(el) if l.strip() and not l.startswith("#")}

def body_hash(a, n):
    """body with rel32 call/jmp targets and absolute image addresses masked (as tools/dedupe.py)"""
    _, o = sec(a)
    c = bytearray(b[o:o + n])
    i = 0
    while i < len(c) - 4:
        if c[i] in (0xE8, 0xE9):
            c[i + 1:i + 5] = bytes(4)
            i += 5
        elif 0x400000 <= struct.unpack_from("<I", c, i)[0] < 0x1400000:
            c[i:i + 4] = bytes(4)
            i += 4
        else:
            i += 1
    return bytes(c)


HDR = {body_hash(a, labels[a][3]) for a in HDR_REPS}
PH = ["", "boot+title", "login", "MyRoom", "lobby", "NPCdialog", "shop", "deck", "duel", "-"]
ORDER = {"1": 0, "2": 0, "3": 0, "5i": 0, "4": 1, "5d": 2}
rows = []
for a in GAME:
    kind, src, name, size = labels[a]
    L = layer[a]
    status = "skip" if src in SKIP else "done" if a in done else "hdr" if body_hash(a, size) in HDR else "todo"
    core = ORDER[L] == 0 and src not in SKIP
    rows.append((0 if core else 1, ORDER[L], rank.get(a, 9), src, a, L, size, samples.get(a, 0), status, name, via[a]))
rows.sort()
with open(os.path.join(T, "WORKORDER.tsv"), "w") as out:
    out.write("seq\taddr\tlayer\tvia\tcore\tphase\tfolder\tsize\tsamples\tstatus\tname\n")
    for i, (c, _, r, src, a, L, size, smp, status, name, how) in enumerate(rows):
        out.write(f"{i}\t{a:08x}\t{L}\t{how}\t{'core' if c == 0 else 'later'}\t{r} {PH[r]}\t{src}\t{size}\t{smp}\t{status}\t{name}\n")

# --- summary
cnt = collections.Counter((r[5]) for r in rows)
lines = [f"# Work order (tools/workorder.py)\n",
         f"Game-code functions: {len(rows)} (incl. {len(islands)} ran islands Ghidra never made functions). "
         f"Data tables with function pointers: {len(tables)} ({len(live_tables)} live). "
         f"Live vftables: {len(live_vt)} of {len(vtables)}.\n",
         "| layer | functions | todo | bytes todo |", "|---|---|---|---|"]
for L in ("1", "2", "3", "5i", "4", "5d"):
    rs = [r for r in rows if r[5] == L]
    td = [r for r in rs if r[8] == "todo"]
    lines.append(f"| {L} | {len(rs)} | {len(td)} | {sum(r[6] for r in td)} |")
core = [r for r in rows if r[0] == 0]
lines += ["", "Core (1+2+3+5i, minus Test/Patcher) by phase:", "", "| phase | functions | todo | bytes todo |", "|---|---|---|---|"]
for r in range(1, 10):
    rs = [x for x in core if x[2] == r]
    td = [x for x in rs if x[8] == "todo"]
    if rs:
        lines.append(f"| {r} {PH[r]} | {len(rs)} | {len(td)} | {sum(x[6] for x in td)} |")
lines += ["", "Core todo by folder:", "", "| folder | todo | bytes |", "|---|---|---|"]
fc = collections.Counter(); fb = collections.Counter()
for x in core:
    if x[8] == "todo":
        fc[x[3]] += 1; fb[x[3]] += x[6]
for k, v in fc.most_common():
    lines.append(f"| {k} | {v} | {fb[k]} |")
open(os.path.join(T, "WORKORDER.md"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))

