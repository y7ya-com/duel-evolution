"""MSVC RTTI walk of yo2.exe: TypeDescriptor <- CompleteObjectLocator <- vtable[-1], plus
ClassHierarchyDescriptor/BaseClassArray for inheritance. Library module; gen.py drives it.

    python3 -I include/gen/rtti.py      # self-check + summary
"""
import os
import re
import struct

DATA = os.environ.get("YO2_DATA", "/Users/y/Documents/GitHub/yo2-decomp-data")


class PE:
    def __init__(self, path):
        b = self.b = open(path, "rb").read()
        pe = struct.unpack_from("<I", b, 0x3C)[0]
        nsec = struct.unpack_from("<H", b, pe + 6)[0]
        opt = struct.unpack_from("<H", b, pe + 20)[0]
        self.base = struct.unpack_from("<I", b, pe + 24 + 28)[0]
        self.secs = []
        for i in range(nsec):
            o = pe + 24 + opt + i * 40
            name = b[o:o + 8].rstrip(b"\0").decode()
            vsz, va, rsz, raw = struct.unpack_from("<IIII", b, o + 8)
            self.secs.append((name, vsz, self.base + va, rsz, raw))
        t = next(s for s in self.secs if s[0] == ".text")
        self.tlo, self.thi = t[2], t[2] + t[1]

    def off2va(self, o):
        for n, vsz, va, rsz, raw in self.secs:
            if raw <= o < raw + rsz:
                return va + o - raw

    def va2off(self, v):
        for n, vsz, va, rsz, raw in self.secs:
            if va <= v < va + min(vsz, rsz):
                return raw + v - va

    def u32(self, va):
        o = self.va2off(va)
        return None if o is None else struct.unpack_from("<I", self.b, o)[0]

    def i32(self, va):
        o = self.va2off(va)
        return None if o is None else struct.unpack_from("<i", self.b, o)[0]

    def is_text(self, v):
        return self.tlo <= v < self.thi

    def follow(self, v):
        """Resolve incremental-link thunks (jmp rel32) to the real function."""
        for _ in range(4):
            o = self.va2off(v)
            if o is None or self.b[o] != 0xE9:
                break
            v = (v + 5 + struct.unpack_from("<i", self.b, o + 1)[0]) & 0xFFFFFFFF
        return v


# --- minimal MSVC type-name demangler (enough for the 1,133 names in yo2.exe) ---
PRIM = {"C": "signed char", "D": "char", "E": "unsigned char", "F": "short", "G": "unsigned short",
        "H": "int", "I": "unsigned int", "J": "long", "K": "unsigned long", "M": "float", "N": "double",
        "_N": "bool", "X": "void", "_J": "__int64", "_K": "unsigned __int64", "_W": "wchar_t"}


class Demangler:
    def __init__(self, s):
        self.s, self.i, self.names = s, 0, []

    def peek(self):
        return self.s[self.i] if self.i < len(self.s) else ""

    def name_fragment(self):
        c = self.peek()
        if c.isdigit():
            self.i += 1
            return self.names[int(c)]
        if self.s.startswith("?$", self.i):
            self.i += 2
            saved = self.names
            self.names = []  # template args get a fresh back-reference table, seeded with the template name
            tname = self.ident(remember=True)
            args = []
            while self.peek() != "@":
                args.append(self.type())
            self.i += 1
            self.names = saved
            r = f"{tname}<{', '.join(args)}>"
            self.remember(r)
            return r
        return self.ident(remember=True)

    def ident(self, remember=False):
        j = self.s.index("@", self.i)
        r = self.s[self.i:j]
        self.i = j + 1
        if remember:
            self.remember(r)
        return r

    def remember(self, r):
        if r not in self.names and len(self.names) < 10:
            self.names.append(r)

    def qualified(self):
        parts = [self.name_fragment()]
        while self.peek() != "@":
            parts.append(self.name_fragment())
        self.i += 1
        return "::".join(reversed(parts))

    def type(self):
        c = self.peek()
        if c in "UVW":
            self.i += 2 if c == "W" else 1  # W4 = enum
            return self.qualified()
        if c in "PQ":  # pointer: P=plain, then cv A/B
            self.i += 2
            return self.type() + "*"
        if c == "$" and self.s.startswith("$0", self.i):
            self.i += 2
            return str(self.number())
        if c == "_":
            k = self.s[self.i:self.i + 2]
            self.i += 2
            return PRIM[k]
        self.i += 1
        return PRIM[c]

    def number(self):
        c = self.peek()
        neg = c == "?"
        if neg:
            self.i += 1
            c = self.peek()
        if c.isdigit():
            self.i += 1
            v = int(c) + 1
        else:
            j = self.s.index("@", self.i)
            v = 0
            for ch in self.s[self.i:j]:
                v = v * 16 + ord(ch) - ord("A")
            self.i = j + 1
        return -v if neg else v


def demangle(mangled):
    """'.?AV?$smart_ptr@VCFile@@@@' -> 'smart_ptr<CFile>'."""
    d = Demangler(mangled[4:])
    return d.qualified()


def load(path=os.path.join(DATA, "yo2.exe")):
    """Returns (pe, classes) with classes keyed by TypeDescriptor VA:
    {mangled, name, bases:[(td, mdisp, pdisp, vdisp, attrs, numContained)], vtables:{offset: (vtva, [slot VAs])}}"""
    pe = PE(path)
    b = pe.b
    tds = {}
    for m in re.finditer(rb"\.\?A[VU][A-Za-z0-9_@?$]+@@\0", b):
        td = pe.off2va(m.start()) - 8
        mg = m.group(0)[:-1].decode()
        tds[td] = {"td": td, "mangled": mg, "name": demangle(mg), "struct": mg[3] == "U",
                   "bases": [], "vtables": {}, "chd_attrs": 0}
    # index every dword in data sections by value
    idx = {}
    for n, vsz, va, rsz, raw in pe.secs:
        if n in (".rdata", ".data"):
            for o in range(raw, raw + rsz - 3, 4):
                idx.setdefault(struct.unpack_from("<I", b, o)[0], []).append(o)
    cols = {}
    for td in tds:
        for o in idx.get(td, []):
            if struct.unpack_from("<I", b, o - 12)[0] != 0:
                continue
            col = pe.off2va(o - 12)
            sig, off, cdoff, _td, chd = struct.unpack_from("<IIIII", b, o - 12)
            if pe.u32(chd) != 0 or not (pe.u32(chd + 8) or 0) or pe.u32(chd + 12) is None:
                continue
            cols[col] = (td, off, chd)
    for col, (td, off, chd) in cols.items():
        c = tds[td]
        if not c["bases"]:
            _sig, attrs, nbase, bca = (pe.u32(chd + 4 * k) for k in range(4))
            c["chd_attrs"] = attrs
            for k in range(nbase):
                bcd = pe.u32(bca + 4 * k)
                btd, ncont, mdisp, pdisp, vdisp, battrs = (pe.u32(bcd + 4 * j) for j in range(6))
                c["bases"].append((btd, struct.unpack("<i", struct.pack("<I", mdisp))[0],
                                   struct.unpack("<i", struct.pack("<I", pdisp))[0], vdisp, battrs, ncont))
        for o in idx.get(col, []):
            vt = pe.off2va(o + 4)
            slots = []
            for k in range(400):
                v = pe.u32(vt + 4 * k)
                # stop at a non-code pointer, or at a dword some other table points at (start of another table)
                if v is None or not pe.is_text(v) or (k and (vt + 4 * k) in idx):
                    break
                slots.append(v)
            c["vtables"].setdefault(off, (vt, slots))
    return pe, tds


def tree(c, tds):
    """Direct bases from the pre-order BaseClassArray: [(td, mdisp, virtual)]."""
    out, i, bases = [], 1, c["bases"]
    while i < len(bases):
        btd, mdisp, pdisp, vdisp, attrs, ncont = bases[i]
        out.append((btd, mdisp, pdisp != -1))
        i += 1 + ncont
    return out


if __name__ == "__main__":
    assert demangle(".?AV?$smart_ptr@VCFile@@@@") == "smart_ptr<CFile>"
    assert demangle(".?AUCFileInfo@CFileLoader@@") == "CFileLoader::CFileInfo"
    assert demangle(".?AV?$CCallbackM3@VCDMailTask@@HPAVCWindowTaskModel@@W4CALLBACK_MESSAGE_TYPE@@H@@") == \
        "CCallbackM3<CDMailTask, int, CWindowTaskModel*, CALLBACK_MESSAGE_TYPE, int>"
    assert demangle(".?AV?$auto_array@V?$basic_string@DU?$char_traits@D@std@@V?$allocator@D@2@@std@@@@") == \
        "auto_array<std::basic_string<char, std::char_traits<char>, std::allocator<char>>>"
    pe, tds = load()
    print(len(tds), "type descriptors;", sum(1 for c in tds.values() if c["vtables"]), "with vtables;",
          sum(1 for c in tds.values() if c["bases"]), "with hierarchy")
    bad = [c["mangled"] for c in tds.values() if "?" in c["name"] or "@" in c["name"]]
    print("undemangled:", bad[:10])
    mi = [c["name"] for c in tds.values() if len(c["vtables"]) > 1]
    print("multi-vtable classes:", len(mi), mi[:8])
    virt = [c["name"] for c in tds.values() if any(v for _, _, v in tree(c, tds))]
    print("virtual-base classes:", len(virt), virt[:8])
