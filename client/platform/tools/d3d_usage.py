"""Which Direct3D 8 methods, states and formats yo2.exe actually uses, read off the decompiled cache.

    python3 -I platform/tools/d3d_usage.py            # print the markdown report
    python3 -I platform/tools/d3d_usage.py --write    # also splice it into platform/DESIGN.md

The IDirect3D8 lives at *(DAT_0126f310+4) and the device at *(DAT_0126f310+8) (CD3DDevice::Initialize,
FUN_00585270). Every COM call is `(**(code **)(*OBJ + OFF))(OBJ, args)`; OBJ is typed by tracking, inside one
function, what was assigned from the device global or written by a Create*/Get* out-parameter. Only game + yaneSDK
code is scanned: the statically linked D3DX makes its own device calls.
"""
import json
import os
import re
import struct
import sys
from collections import Counter, defaultdict

DATA = os.environ.get("YO2_DATA", "/Users/y/Documents/GitHub/yo2-decomp-data")
HERE = os.path.dirname(os.path.abspath(__file__))

UNK = ["QueryInterface", "AddRef", "Release"]
RES = UNK + ["GetDevice", "SetPrivateData", "GetPrivateData", "FreePrivateData", "SetPriority", "GetPriority",
             "PreLoad", "GetType"]
VT = {
    "IDirect3D8": UNK + ["RegisterSoftwareDevice", "GetAdapterCount", "GetAdapterIdentifier",
        "GetAdapterModeCount", "EnumAdapterModes", "GetAdapterDisplayMode", "CheckDeviceType", "CheckDeviceFormat",
        "CheckDeviceMultiSampleType", "CheckDepthStencilMatch", "GetDeviceCaps", "GetAdapterMonitor",
        "CreateDevice"],
    "IDirect3DDevice8": UNK + ["TestCooperativeLevel", "GetAvailableTextureMem", "ResourceManagerDiscardBytes",
        "GetDirect3D", "GetDeviceCaps", "GetDisplayMode", "GetCreationParameters", "SetCursorProperties",
        "SetCursorPosition", "ShowCursor", "CreateAdditionalSwapChain", "Reset", "Present", "GetBackBuffer",
        "GetRasterStatus", "SetGammaRamp", "GetGammaRamp", "CreateTexture", "CreateVolumeTexture",
        "CreateCubeTexture", "CreateVertexBuffer", "CreateIndexBuffer", "CreateRenderTarget",
        "CreateDepthStencilSurface", "CreateImageSurface", "CopyRects", "UpdateTexture", "GetFrontBuffer",
        "SetRenderTarget", "GetRenderTarget", "GetDepthStencilSurface", "BeginScene", "EndScene", "Clear",
        "SetTransform", "GetTransform", "MultiplyTransform", "SetViewport", "GetViewport", "SetMaterial",
        "GetMaterial", "SetLight", "GetLight", "LightEnable", "GetLightEnable", "SetClipPlane", "GetClipPlane",
        "SetRenderState", "GetRenderState", "BeginStateBlock", "EndStateBlock", "ApplyStateBlock",
        "CaptureStateBlock", "DeleteStateBlock", "CreateStateBlock", "SetClipStatus", "GetClipStatus",
        "GetTexture", "SetTexture", "GetTextureStageState", "SetTextureStageState", "ValidateDevice", "GetInfo",
        "SetPaletteEntries", "GetPaletteEntries", "SetCurrentTexturePalette", "GetCurrentTexturePalette",
        "DrawPrimitive", "DrawIndexedPrimitive", "DrawPrimitiveUP", "DrawIndexedPrimitiveUP", "ProcessVertices",
        "CreateVertexShader", "SetVertexShader", "GetVertexShader", "DeleteVertexShader",
        "SetVertexShaderConstant", "GetVertexShaderConstant", "GetVertexShaderDeclaration",
        "GetVertexShaderFunction", "SetStreamSource", "GetStreamSource", "SetIndices", "GetIndices",
        "CreatePixelShader", "SetPixelShader", "GetPixelShader", "DeletePixelShader", "SetPixelShaderConstant",
        "GetPixelShaderConstant", "GetPixelShaderFunction", "GetPixelShaderDeclaration", "DrawRectPatch",
        "DrawTriPatch", "DeletePatch"],
    "IDirect3DTexture8": RES + ["SetLOD", "GetLOD", "GetLevelCount", "GetLevelDesc", "GetSurfaceLevel",
        "LockRect", "UnlockRect", "AddDirtyRect"],
    "IDirect3DSurface8": UNK + ["GetDevice", "SetPrivateData", "GetPrivateData", "FreePrivateData",
        "GetContainer", "GetDesc", "LockRect", "UnlockRect"],
    "IDirect3DVertexBuffer8": RES + ["Lock", "Unlock", "GetDesc"],
    "IDirect3DIndexBuffer8": RES + ["Lock", "Unlock", "GetDesc"],
}
SHORT = {"IDirect3D8": "D3D", "IDirect3DDevice8": "Dev", "IDirect3DTexture8": "Tex", "IDirect3DSurface8": "Surf",
         "IDirect3DVertexBuffer8": "VB", "IDirect3DIndexBuffer8": "IB"}
# (interface, method) -> (index of out-param among args, interface it produces)
OUT = {
    ("IDirect3D8", "CreateDevice"): (5, "IDirect3DDevice8"),
    ("IDirect3DDevice8", "GetDirect3D"): (0, "IDirect3D8"),
    ("IDirect3DDevice8", "GetBackBuffer"): (2, "IDirect3DSurface8"),
    ("IDirect3DDevice8", "CreateTexture"): (6, "IDirect3DTexture8"),
    ("IDirect3DDevice8", "CreateVertexBuffer"): (4, "IDirect3DVertexBuffer8"),
    ("IDirect3DDevice8", "CreateIndexBuffer"): (4, "IDirect3DIndexBuffer8"),
    ("IDirect3DDevice8", "CreateRenderTarget"): (5, "IDirect3DSurface8"),
    ("IDirect3DDevice8", "CreateDepthStencilSurface"): (4, "IDirect3DSurface8"),
    ("IDirect3DDevice8", "CreateImageSurface"): (3, "IDirect3DSurface8"),
    ("IDirect3DDevice8", "GetRenderTarget"): (0, "IDirect3DSurface8"),
    ("IDirect3DDevice8", "GetDepthStencilSurface"): (0, "IDirect3DSurface8"),
    ("IDirect3DDevice8", "GetTexture"): (1, "IDirect3DTexture8"),
    ("IDirect3DTexture8", "GetSurfaceLevel"): (1, "IDirect3DSurface8"),
}
# (interface, method) -> {arg index: enum name} for the value tables
ENUM_ARGS = {
    ("IDirect3DDevice8", "SetRenderState"): {0: "RS"},
    ("IDirect3DDevice8", "GetRenderState"): {0: "RS"},
    ("IDirect3DDevice8", "SetTextureStageState"): {1: "TSS"},
    ("IDirect3DDevice8", "GetTextureStageState"): {1: "TSS"},
    ("IDirect3DDevice8", "SetTransform"): {0: "TS"},
    ("IDirect3DDevice8", "GetTransform"): {0: "TS"},
    ("IDirect3DDevice8", "CreateTexture"): {4: "FMT", 5: "POOL"},
    ("IDirect3DDevice8", "CreateImageSurface"): {2: "FMT"},
    ("IDirect3DDevice8", "CreateRenderTarget"): {2: "FMT"},
    ("IDirect3DDevice8", "CreateDepthStencilSurface"): {2: "FMT"},
    ("IDirect3DDevice8", "CreateVertexBuffer"): {2: "FVF", 3: "POOL"},
    ("IDirect3DDevice8", "CreateIndexBuffer"): {2: "FMT", 3: "POOL"},
    ("IDirect3DDevice8", "SetVertexShader"): {0: "FVF"},
    ("IDirect3DDevice8", "DrawPrimitive"): {0: "PT"},
    ("IDirect3DDevice8", "DrawPrimitiveUP"): {0: "PT"},
    ("IDirect3DDevice8", "DrawIndexedPrimitive"): {0: "PT"},
    ("IDirect3DDevice8", "DrawIndexedPrimitiveUP"): {0: "PT", 4: "FMT"},
    ("IDirect3DDevice8", "Clear"): {2: "CLEAR"},
    ("IDirect3D8", "CheckDeviceFormat"): {4: "FMT"},
    ("IDirect3D8", "CreateDevice"): {3: "CREATE"},
}
RS = {7: "ZENABLE", 8: "FILLMODE", 9: "SHADEMODE", 10: "LINEPATTERN", 14: "ZWRITEENABLE", 15: "ALPHATESTENABLE",
      16: "LASTPIXEL", 19: "SRCBLEND", 20: "DESTBLEND", 22: "CULLMODE", 23: "ZFUNC", 24: "ALPHAREF",
      25: "ALPHAFUNC", 26: "DITHERENABLE", 27: "ALPHABLENDENABLE", 28: "FOGENABLE", 29: "SPECULARENABLE",
      30: "ZVISIBLE", 34: "FOGCOLOR", 35: "FOGTABLEMODE", 36: "FOGSTART", 37: "FOGEND", 38: "FOGDENSITY",
      40: "EDGEANTIALIAS", 47: "ZBIAS", 48: "RANGEFOGENABLE", 52: "STENCILENABLE", 53: "STENCILFAIL",
      54: "STENCILZFAIL", 55: "STENCILPASS", 56: "STENCILFUNC", 57: "STENCILREF", 58: "STENCILMASK",
      59: "STENCILWRITEMASK", 60: "TEXTUREFACTOR", **{128 + i: f"WRAP{i}" for i in range(8)}, 136: "CLIPPING",
      137: "LIGHTING", 139: "AMBIENT", 140: "FOGVERTEXMODE", 141: "COLORVERTEX", 142: "LOCALVIEWER",
      143: "NORMALIZENORMALS", 145: "DIFFUSEMATERIALSOURCE", 146: "SPECULARMATERIALSOURCE",
      147: "AMBIENTMATERIALSOURCE", 148: "EMISSIVEMATERIALSOURCE", 151: "VERTEXBLEND", 152: "CLIPPLANEENABLE",
      153: "SOFTWAREVERTEXPROCESSING", 154: "POINTSIZE", 155: "POINTSIZE_MIN", 156: "POINTSPRITEENABLE",
      157: "POINTSCALEENABLE", 158: "POINTSCALE_A", 159: "POINTSCALE_B", 160: "POINTSCALE_C",
      161: "MULTISAMPLEANTIALIAS", 162: "MULTISAMPLEMASK", 166: "POINTSIZE_MAX", 167: "INDEXEDVERTEXBLENDENABLE",
      168: "COLORWRITEENABLE", 170: "TWEENFACTOR", 171: "BLENDOP"}
TSS = {1: "COLOROP", 2: "COLORARG1", 3: "COLORARG2", 4: "ALPHAOP", 5: "ALPHAARG1", 6: "ALPHAARG2",
       11: "TEXCOORDINDEX", 13: "ADDRESSU", 14: "ADDRESSV", 15: "BORDERCOLOR", 16: "MAGFILTER", 17: "MINFILTER",
       18: "MIPFILTER", 19: "MIPMAPLODBIAS", 20: "MAXMIPLEVEL", 21: "MAXANISOTROPY", 24: "TEXTURETRANSFORMFLAGS",
       25: "ADDRESSW", 26: "COLORARG0", 27: "ALPHAARG0", 28: "RESULTARG"}
TS = {2: "VIEW", 3: "PROJECTION", **{16 + i: f"TEXTURE{i}" for i in range(8)}, 256: "WORLD"}
FMT = {0: "UNKNOWN", 20: "R8G8B8", 21: "A8R8G8B8", 22: "X8R8G8B8", 23: "R5G6B5", 24: "X1R5G5B5", 25: "A1R5G5B5",
       26: "A4R4G4B4", 27: "R3G3B2", 28: "A8", 29: "A8R3G3B2", 30: "X4R4G4B4", 41: "P8", 50: "L8", 51: "A8L8",
       70: "D16_LOCKABLE", 71: "D32", 73: "D15S1", 75: "D24S8", 77: "D24X8", 79: "D24X4S4", 80: "D16",
       101: "INDEX16", 102: "INDEX32", 0x31545844: "DXT1", 0x33545844: "DXT3", 0x35545844: "DXT5"}
POOL = {0: "DEFAULT", 1: "MANAGED", 2: "SYSTEMMEM", 3: "SCRATCH"}
PT = {1: "POINTLIST", 2: "LINELIST", 3: "LINESTRIP", 4: "TRIANGLELIST", 5: "TRIANGLESTRIP", 6: "TRIANGLEFAN"}
# value decoders for render-state / texture-stage-state values
TOP = {1: "DISABLE", 2: "SELECTARG1", 3: "SELECTARG2", 4: "MODULATE", 5: "MODULATE2X", 6: "MODULATE4X", 7: "ADD",
       8: "ADDSIGNED", 9: "ADDSIGNED2X", 10: "SUBTRACT", 11: "ADDSMOOTH", 12: "BLENDDIFFUSEALPHA",
       13: "BLENDTEXTUREALPHA", 14: "BLENDFACTORALPHA", 15: "BLENDTEXTUREALPHAPM", 16: "BLENDCURRENTALPHA",
       17: "PREMODULATE", 22: "BUMPENVMAP", 24: "DOTPRODUCT3", 25: "MULTIPLYADD", 26: "LERP"}
BLEND = {1: "ZERO", 2: "ONE", 3: "SRCCOLOR", 4: "INVSRCCOLOR", 5: "SRCALPHA", 6: "INVSRCALPHA", 7: "DESTALPHA",
         8: "INVDESTALPHA", 9: "DESTCOLOR", 10: "INVDESTCOLOR", 11: "SRCALPHASAT"}
CMP = {1: "NEVER", 2: "LESS", 3: "EQUAL", 4: "LESSEQUAL", 5: "GREATER", 6: "NOTEQUAL", 7: "GREATEREQUAL",
       8: "ALWAYS"}
TEXF = {0: "NONE", 1: "POINT", 2: "LINEAR", 3: "ANISOTROPIC"}
TADDR = {1: "WRAP", 2: "MIRROR", 3: "CLAMP", 4: "BORDER"}
CULL = {1: "NONE", 2: "CW", 3: "CCW"}


def ta(v):
    names = ["DIFFUSE", "CURRENT", "TEXTURE", "TFACTOR", "SPECULAR", "TEMP"]
    s = names[v & 0xf] if (v & 0xf) < len(names) else hex(v)
    return s + ("|COMPLEMENT" if v & 0x10 else "") + ("|ALPHAREPLICATE" if v & 0x20 else "")


VALUE = {("RS", 19): BLEND, ("RS", 20): BLEND, ("RS", 23): CMP, ("RS", 25): CMP, ("RS", 22): CULL,
         ("RS", 56): CMP, ("TSS", 1): TOP, ("TSS", 4): TOP, ("TSS", 16): TEXF, ("TSS", 17): TEXF,
         ("TSS", 18): TEXF, ("TSS", 13): TADDR, ("TSS", 14): TADDR,
         **{("TSS", k): "TA" for k in (2, 3, 5, 6, 26, 27, 28)}}


def fvf(v):
    pos = {0x2: "XYZ", 0x4: "XYZRHW", 0x6: "XYZB1", 0x8: "XYZB2", 0xa: "XYZB3"}.get(v & 0xe, "")
    parts = [pos] if pos else []
    parts += [n for b, n in ((0x10, "NORMAL"), (0x20, "PSIZE"), (0x40, "DIFFUSE"), (0x80, "SPECULAR")) if v & b]
    if v >> 8 & 0xf:
        parts.append(f"TEX{v >> 8 & 0xf}")
    return "|".join(parts) or hex(v)


def bits(v, table):
    return "|".join(n for b, n in table if v & b) or hex(v)


def name_enum(kind, v):
    if kind == "FVF":
        return fvf(v)
    if kind == "CLEAR":
        return bits(v, ((1, "TARGET"), (2, "ZBUFFER"), (4, "STENCIL")))
    if kind == "CREATE":
        return bits(v, ((4, "MULTITHREADED"), (0x20, "SOFTWARE_VP"), (0x40, "HARDWARE_VP"), (0x80, "MIXED_VP"),
                        (0x10, "PUREDEVICE"), (2, "FPU_PRESERVE")))
    t = {"RS": RS, "TSS": TSS, "TS": TS, "FMT": FMT, "POOL": POOL, "PT": PT}[kind]
    return t.get(v, hex(v))


def name_value(kind, state, v):
    t = VALUE.get((kind, state))
    if t == "TA":
        return ta(v)
    if t:
        return t.get(v, hex(v))
    if v == 0x3f800000:
        return "1.0f"
    return str(v) if v < 0x10000 else hex(v)


def lit(s):
    s = s.strip()
    s = re.sub(r"^\((?:u?int|undefined\d?|float|char|byte|D3D\w+)\)", "", s).strip()
    try:
        return int(s, 0)
    except ValueError:
        return int(s[:-1], 0) if re.fullmatch(r"-?(0x[0-9a-f]+|\d+)", s[:-1] or "x") else None


CAST = re.compile(r"\((?:const )?(?:struct )?[A-Za-z_]\w*(?: [A-Za-z_]\w*)?\s*\*+\)")


def norm(e):
    return re.sub(r"\s+", "", CAST.sub("", e))


def split_args(s):
    out, depth, cur = [], 0, ""
    for ch in s:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        out.append(cur.strip())
    return out


CALL = re.compile(r"\(\*\*\(code \*\*\)\((?P<obj>[^;]+?) \+ (?P<off>0x[0-9a-f]+|\d+)\)\)\s*\(")


def calls(src):
    """yield (obj pointer expr normalized, offset, [args]) for each COM-style vtable call"""
    for m in CALL.finditer(src):
        obj = norm(m.group("obj"))
        if not obj.startswith("*"):
            continue
        depth, i = 1, m.end()
        while depth and i < len(src):
            depth += {"(": 1, ")": -1}.get(src[i], 0)
            i += 1
        args = split_args(src[m.end():i - 1])
        yield obj[1:], int(m.group("off"), 0), args[1:], src.count("\n", 0, m.start())


def out_target(arg):
    a = norm(arg)
    if a.startswith("&"):
        return a[1:]
    return f"*({a})" if "+" in a else f"*{a}"


ASSIGN = re.compile(r"^\s*(\w+) = ([^;]+);", re.M)


def analyze(src):
    """type every pointer expression in one function; return [(iface, method, args, line)]"""
    types = {"*(DAT_0126f310+4)": "IDirect3D8", "*(DAT_0126f310+8)": "IDirect3DDevice8"}
    for _ in range(2):   # second sweep picks up aliases assigned before their source was typed
        for var, rhs in ASSIGN.findall(src):
            t = types.get(norm(rhs))
            if t:
                types[var] = t
        found = []
        for obj, off, args, line in calls(src):
            iface = types.get(obj)
            if not iface:
                continue
            vt = VT[iface]
            if off % 4 or off // 4 >= len(vt):
                continue
            meth = vt[off // 4]
            found.append((iface, meth, args, line))
            o = OUT.get((iface, meth))
            if o and o[0] < len(args):
                tgt = out_target(args[o[0]])
                types.setdefault(tgt, o[1])
            if meth == "SetTexture" and len(args) > 1:
                types.setdefault(norm(args[1]), "IDirect3DTexture8")
    return found


def exe_reader():
    """read(va, size) over yo2.exe's sections"""
    b = open(os.path.join(DATA, "yo2.exe"), "rb").read()
    pe = struct.unpack_from("<I", b, 0x3c)[0]
    nsec, optsz = struct.unpack_from("<H", b, pe + 6)[0], struct.unpack_from("<H", b, pe + 20)[0]
    base = struct.unpack_from("<I", b, pe + 52)[0]
    secs = [struct.unpack_from("<IIII", b, pe + 24 + optsz + 40 * i + 8) for i in range(nsec)]

    def read(va, size):
        rva = va - base
        for vsize, sva, rsize, raw in secs:
            if sva <= rva < sva + max(vsize, rsize):
                return b[raw + rva - sva:raw + rva - sva + size]
    return read


def render_modes():
    """The 12 render modes CD3DDevice switches between (FUN_00585930). FUN_00583f30 builds each from three static
    {u32 stage, u32 state, u32 value} arrays: render states, stage colour/alpha ops, stage sampler states."""
    src = open(os.path.join(DATA, "decompiled", "00583f30.c")).read()
    read = exe_reader()
    rows = []
    for i, m in enumerate(re.finditer(r"FUN_005840e0\(([^;]*)\);", src)):
        a = [x.strip().lstrip("&").replace("DAT_", "0x") for x in m.group(1).split(",")]
        lists = []
        for kind, (addr, n) in zip(("RS", "TSS", "TSS"), ((a[0], a[1]), (a[2], a[3]), (a[4], a[5]))):
            n = int(n, 0)
            recs = [struct.unpack_from("<III", read(int(addr, 16), 12 * n), 12 * j) for j in range(n)] if n else []
            lists.append(", ".join(
                (f"{name_enum(kind, st)}={name_value(kind, st, v)}{'*' if stage else ''}" if kind == "RS" else
                 f"{stage}:{name_enum(kind, st)}={name_value(kind, st, v)}") for stage, st, v in recs) or "-")
        rows.append(f"| {i} | " + " | ".join(lists) + " |")
    return ["**Render modes** (static tables at 0xc82850.., applied as diffs by FUN_00585930; mode 0 COLOROP "
            "MULTIPLYADD drops to MODULATE without the cap, FUN_00584ea0). Modes 1-11 are diffs over mode 0. `*` = flag 1: "
            "FUN_00585930 skips it on a mode switch, so TEXTUREFACTOR is only the initial value; FUN_00585a20 sets it "
            "at run time (an additive tint: 0 normally, a fade colour otherwise)", "",
            "| mode | render states | stage ops | stage samplers |", "|---|---|---|---|"] + rows + [""]


def scanned_functions():
    keep = set()
    for line in open(os.path.join(DATA, "labels.tsv")):
        a, _, label, srcdir, _ = line.rstrip("\n").split("\t")
        if label in ("game", "yaneSDK"):
            keep.add(a.lower())
    out = {}
    d = os.path.join(DATA, "decompiled")
    for fn in os.listdir(d):
        if fn.endswith(".c") and fn[:-2].lower() in keep:
            out[fn[:-2]] = open(os.path.join(d, fn), errors="replace").read()
    return out


def main():
    srcs = scanned_functions()
    methods = defaultdict(lambda: [0, set()])      # (iface, meth) -> [call sites, funcs]
    enums = defaultdict(Counter)                    # kind -> Counter(name)
    states = defaultdict(Counter)                   # (kind, state name) -> Counter(value)
    for addr, src in sorted(srcs.items()):
        for iface, meth, args, _ in analyze(src):
            m = methods[(iface, meth)]
            m[0] += 1
            m[1].add(addr)
            for idx, kind in ENUM_ARGS.get((iface, meth), {}).items():
                if idx < len(args):
                    v = lit(args[idx])
                    enums[kind][name_enum(kind, v) if v is not None else "(variable)"] += 1
            if meth in ("SetRenderState", "SetTextureStageState"):
                kind, si = ("RS", 0) if meth == "SetRenderState" else ("TSS", 1)
                if len(args) > si + 1:
                    s, v = lit(args[si]), lit(args[si + 1])
                    sname = name_enum(kind, s) if s is not None else "(variable)"
                    states[(kind, sname)][name_value(kind, s, v) if v is not None and s is not None
                                          else "(variable)"] += 1
                    if meth == "SetTextureStageState":
                        st = lit(args[0])
                        states[("STAGE", "stage")][str(st) if st is not None else "(variable)"] += 1

    total = len([l for l in open(os.path.join(DATA, "labels.tsv")) if l.split("\t")[2] in ("game", "yaneSDK")])
    done = os.path.exists(os.path.join(DATA, "decompiled", "DONE"))
    lines = [f"Generated by `platform/tools/d3d_usage.py` over {len(srcs)} of {total} game+yaneSDK functions "
             f"in the decompiled cache{'' if done else ' (cache still filling: re-run when `decompiled/DONE` exists)'}.",
             "Calls = call sites whose object is typed inside the function (device global, an alias of it, or a "
             "Create*/Get* out-parameter); funcs = distinct functions. Calls Ghidra decompiled without arguments or "
             "through an untyped field are not here: see the hand-checked list below the table.", ""]
    for iface in VT:
        rows = [(VT[iface].index(meth), meth, v) for (i, meth), v in methods.items() if i == iface]
        if not rows:
            continue
        lines += [f"**{iface}**", "", "| vtbl | method | calls | funcs | e.g. |", "|---|---|---|---|---|"]
        for idx, meth, (n, fs) in sorted(rows):
            lines.append(f"| +0x{idx * 4:03x} | {meth} | {n} | {len(fs)} | {', '.join(sorted(fs)[:3])} |")
        lines.append("")
    for kind, title in (("FMT", "Formats (CreateTexture/CreateImageSurface/... format args)"), ("POOL", "Pools"),
                        ("FVF", "FVFs (SetVertexShader / CreateVertexBuffer)"), ("PT", "Primitive types"),
                        ("TS", "Transform states"), ("CLEAR", "Clear flags"), ("CREATE", "CreateDevice flags")):
        if enums[kind]:
            lines.append(f"**{title}:** " + ", ".join(f"{k} ({n})" for k, n in enums[kind].most_common()))
            lines.append("")
    for kind, title in (("RS", "Render states (SetRenderState)"),
                        ("TSS", "Texture stage states (SetTextureStageState)")):
        rows = [f"| {s} | " + ", ".join(f"{v} ({n})" for v, n in vals.most_common()) + " |"
                for (k, s), vals in sorted(states.items(), key=lambda kv: -sum(kv[1].values())) if k == kind]
        if rows:
            lines += [f"**{title}** (direct calls)", "", "| state | values used (count) |", "|---|---|"] + rows + [""]
    lines += render_modes()
    if states[("STAGE", "stage")]:
        lines.append("**Texture stages touched:** " +
                     ", ".join(f"{v} ({n})" for v, n in states[("STAGE", "stage")].most_common()))
    report = "\n".join(lines) + "\n"
    print(report)
    if "--write" in sys.argv:
        path = os.path.join(HERE, "..", "DESIGN.md")
        doc = open(path).read()
        a, b = "<!-- d3d-usage:begin -->\n", "<!-- d3d-usage:end -->"
        doc = doc[:doc.index(a) + len(a)] + report + doc[doc.index(b):]
        open(path, "w").write(doc)


if __name__ == "__main__":
    main()
