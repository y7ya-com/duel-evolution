"""src/Net: ygpacket wire codec (pilot), body fields, Blowfish, members, MD5."""
import hashlib
import random
import struct

from core import case

KEY = bytes([0x5A, 0xA5, 0x5A, 0x55])
PKT = 0x440   # sizeof(YgPacket)
WSAEWOULDBLOCK, WSAECONNRESET = 10035, 10054


def xor(b):
    return bytes(x ^ KEY[i & 3] for i, x in enumerate(b))


def wire(pid, param, data, bad_md5=False, length=None):
    h8 = struct.pack(">HHI", pid, len(data) if length is None else length, param)
    d = hashlib.md5(h8 + data).digest()
    if bad_md5:
        d = bytes([d[0] ^ 1]) + d[1:]
    return xor(h8 + d + data)


def last_error(e):
    e.on_import("WSAGetLastError", lambda e: e.state.get("err", 0))


def feed(e, stream, script):
    """recv() serving `stream`; each script item is a chunk size, "block", "reset" or "close", then unlimited."""
    st = {"pos": 0, "script": list(script)}

    def recv(e, sock, buf, n, flags):
        e.trace.append(("recv", sock, n, flags))
        act = st["script"].pop(0) if st["script"] else n
        if act in ("block", "reset"):
            e.state["err"] = WSAEWOULDBLOCK if act == "block" else WSAECONNRESET
            return -1
        k = 0 if act == "close" else min(n, act, len(stream) - st["pos"])
        e.write(buf, stream[st["pos"]:st["pos"] + k])
        st["pos"] += k
        return k
    e.on_import("recv", recv)
    last_error(e)


def drive_recv(e, f, p, sock, packets=1, max_calls=200):
    out = []
    for _ in range(packets):
        for _ in range(max_calls):
            r = f(p, sock)
            out.append((r, e.read(p, PKT).hex() if p else None))
            if r != -50:
                break
    return out


RECV_WIRE = (wire(0xFEDC, 0x89ABCDEF, bytes(range(37))) + wire(0x0102, 8, b"")
             + wire(0x7FFF, 0x01020304, bytes((i * 7) & 0xFF for i in range(0x400))))


@case(0x689EA0, params=[1, 3, 23, 24, 25, 60, 5000])
def recv_chunked(e, f, chunk):
    """three packets (37-byte body, empty body, full 0x400 body) delivered `chunk` bytes per recv()"""
    p = e.alloc(bytes(random.Random(chunk).randbytes(PKT - 4)) + bytes(4))   # garbage, state 0
    feed(e, RECV_WIRE, [chunk] * 10000)
    return drive_recv(e, f, p, 7, packets=3)


@case(0x689EA0, params=[
    ["close"], [5, "close"], ["reset"], [10, "reset"], ["block", "block", 24, "block", 100],
    [24, "close"], [24, "reset"], [30, "close"], ["bad_md5"], ["too_long"], ["sock-1"], ["null"]])
def recv_errors(e, f, script):
    stream = wire(5, 1, b"hello world, body!")
    if script == ["bad_md5"]:
        stream, script = wire(5, 1, b"hello world, body!", bad_md5=True), []
    if script == ["too_long"]:
        stream, script = wire(5, 1, b"", length=0x401), []
    p = 0 if script == ["null"] else e.alloc(PKT)
    feed(e, stream, [s for s in script if isinstance(s, int) or s in ("block", "reset", "close")])
    return drive_recv(e, f, p, -1 if script == ["sock-1"] else 9)


def sender(e, script):
    st = list(script)

    def send(e, sock, buf, n, flags):
        act = st.pop(0) if st else n
        if act in ("block", "reset"):
            e.state["err"] = WSAEWOULDBLOCK if act == "block" else WSAECONNRESET
            e.trace.append(("send", sock, flags, act))
            return -1
        k = min(n, act)
        e.trace.append(("send", sock, flags, e.read(buf, k).hex()))
        return k
    e.on_import("send", send)
    last_error(e)


@case(0x68A320, params=[(n, s) for n in (0, 1, 3, 4, 5, 63, 64, 100, 0x400) for s in ([], [7] * 300)])
def send_packet(e, f, param):
    n, script = param
    data = bytes((i * 31 + n) & 0xFF for i in range(n))
    p = e.alloc(PKT)
    e.write(p, struct.pack("<iiI", 0x2345 + n, n, 0x81828384 + n))
    e.write(p + 0x24, data)
    sender(e, script)
    r = f(p, 11)
    sent = b"".join(bytes.fromhex(t[3]) for t in e.trace)
    assert r != 0 or sent == wire(0x2345 + n, 0x81828384 + n, data), "harness wire() disagrees with the client"
    return r


@case(0x68A320, params=[["block", "block"], ["reset"], [5, "block", 3, "reset"], ["sock-1"], ["null"]])
def send_errors(e, f, script):
    p = 0 if script == ["null"] else e.alloc(PKT)
    if p:
        e.write(p, struct.pack("<iii", 9, 4, 1))
        e.write(p + 0x24, b"abcd")
    sender(e, [s for s in script if s not in ("sock-1", "null")])
    return f(p, -1 if script == ["sock-1"] else 11)


# ======================================================================== ygpacket body fields (src/Net/ygpacket.cpp)
def packet(e, got=0, length=0, seed=1):
    """A YgPacket with a recognisable body, the cursor (bodyGot, +0x438) at `got` and len (+4) = `length`."""
    p = e.alloc(PKT)
    e.write(p + 0x24, random.Random(seed).randbytes(0x400))
    e.w32(p + 4, length)
    e.w32(p + 0x438, got)
    return p


def edge_cursors(width):
    return [0, 5, 0x400 - width, 0x400 - width + 1, "nullp", "nullv"]


def put_case(addr, width):
    def put(e, f, got):
        p = 0 if got == "nullp" else packet(e, 0 if got == "nullv" else got)
        v = 0 if got == "nullv" else e.alloc(random.Random(addr).randbytes(4))
        return f(p, v)
    put.__name__ = f"put{8 * width}"
    case(addr, params=edge_cursors(width))(put)


def get_case(addr, width):
    def get(e, f, got):
        p = 0 if got == "nullp" else packet(e, 0 if got == "nullv" else got)
        v = 0 if got == "nullv" else e.alloc(4)
        return f(p, v)
    get.__name__ = f"get{8 * width}"
    case(addr, params=edge_cursors(width))(get)


for _a, _w in ((0x68A6D0, 1), (0x68A740, 1), (0x68A7B0, 2), (0x68A830, 2), (0x68A8B0, 4), (0x68A930, 4)):
    put_case(_a, _w)
for _a, _w in ((0x68AC10, 1), (0x68AC60, 1), (0x68ACB0, 2), (0x68AD20, 2), (0x68AD90, 4), (0x68AE20, 4)):
    get_case(_a, _w)


def state_case(addr, *extra):
    def state(e, f, p):
        q = 0 if p == "nullp" else e.alloc(random.Random(p).randbytes(PKT))
        f(q, *extra)
    state.__name__ = f"state_{addr:x}"
    case(addr, params=[1, 2, "nullp"])(state)


state_case(0x68A5A0)              # ygClear
state_case(0x68A5F0, 0x1234)      # ygBegin(id)
state_case(0x68A630)              # ygEnd
state_case(0x68A670)              # ygBeginRead
state_case(0x68A6A0)              # ygEndRead


@case(0x68AAF0, params=[(0, 0), (0, 1), (3, 7), (0, 0x400), (1, 0x400), (0x3F9, 7), ("nullp", 4), (0, "nulls")])
def put_bytes(e, f, param):
    got, n = param
    p = 0 if got == "nullp" else packet(e, got)
    src = 0 if n == "nulls" else e.alloc(random.Random(9).randbytes(0x400))
    return f(p, src, 4 if n == "nulls" else n)


@case(0x68B020, params=[(0, 0), (0, 1), (3, 7), (0, 0x400), (1, 0x400), (0x3F9, 7), ("nullp", 4), (0, "nulld")])
def get_bytes(e, f, param):
    got, n = param
    p = 0 if got == "nullp" else packet(e, got)
    dst = 0 if n == "nulld" else e.alloc(random.Random(8).randbytes(0x402))
    return f(p, dst, 4 if n == "nulld" else n)


@case(0x68B0B0, params=[(0, ord(",")), (2, ord(",")), (0, 0), (0x3F0, ord("|")), (0, ord("x")), "nullp", "nulld"])
def get_string(e, f, param):
    p = 0 if param == "nullp" else packet(e)
    if p:   # "ab,cd|ef\0gh" then no terminator at all up to the end of the body
        e.write(p + 0x24, b"ab,cd|ef\0gh".ljust(0x3F0, b"z") + b"qq,rr|tt" + b"w" * 8)
        e.w32(p + 0x438, 0 if isinstance(param, str) else param[0])
    dst = 0 if param == "nulld" else e.alloc(0x402)
    delim = ord(",") if isinstance(param, str) else param[1]
    return f(p, dst, delim)


@case(0x68B150, params=[(0, 0), (0, 5), (5, 5), (6, 5), (0x400, 0x400), "nullp"])
def read_pos(e, f, param):
    return f(0 if param == "nullp" else packet(e, *param))


BF_CTX = 0x1288828   # the exe's static Blowfish {uint32* P (0x48 B), uint32* S (0x1000 B)}; its ctor never runs here


@case(0x68B1B0, params=[(n, k) for n in (0, 1, 8, 9, 100, 0x3F9, 0x400) for k in (56, 16)])
def cipher_roundtrip(e, f, param):
    """set the key (0x68b180), encrypt, decrypt; the original's P/S boxes are exe state, Net's are its own static"""
    n, klen = param
    pbox, sbox = e.alloc(0x48), e.alloc(0x1000)
    e.w32(BF_CTX, pbox)
    e.w32(BF_CTX + 4, sbox)
    e.ignore(pbox, 0x48)
    e.ignore(sbox, 0x1000)
    e.fn(0x68B180)(e.alloc(random.Random(klen).randbytes(klen)), klen)
    p = packet(e, length=n, seed=n)
    f(p, 0)
    enc = e.read(p, PKT).hex()
    f(p, 1)
    f(p, 2)   # anything but 0/1 is ignored
    return enc


@case(0x68B180, params=["null"])
def cipher_key_null(e, f, _):
    f(0, 56)   # null key: nothing happens (and the original never touches its context)


# ======================================================================== src/Net members (thiscall)
@case(0x6A5BC0, conv="thiscall", params=[0, 1, 3, 4, 100])
def account_player(e, f, slot):
    """`this` is the account-data sub-object at CNetAccount+0x121c. Not tested: slot < 0, where the original returns a
    pointer below the array and Net's player() returns null (reported to Net)."""
    acc = e.obj(0x3300, fill=b"\xa5")
    r = f(acc + 0x121C, slot)
    return r and r - acc


# ======================================================================== MD5 (RFC 1321)
MD5_INIT = 0x6022B0
MD5_UPDATE = 0x6022F0
MD5_FINAL = 0x6024F0


@case(MD5_INIT)
def md5_init(e, f, _):
    ctx = e.alloc(random.Random(1).randbytes(0x58))
    f(ctx)


@case(MD5_UPDATE, params=[(n, m) for n in (0, 1, 55, 56, 63, 64, 65, 200) for m in (0, 9, 64)])
def md5_update(e, f, param):
    n, m = param
    ctx = e.alloc(0x58)
    e.fn(MD5_INIT)(ctx)
    data = e.alloc(bytes((i * 7) & 0xFF for i in range(n + m)))
    f(ctx, data, n)
    f(ctx, data + n, m)
    e.ignore(ctx + 0x10, 8)   # count: bits {lo, hi} in the original, a 64-bit byte count in Md5 (checked below)
    # Past the live (n+m)%64 bytes the buffer holds stale input: the original copies only the first partial block
    # through it and hashes whole blocks in place, Md5 copies every byte through it. Never read; not compared.
    live = (n + m) % 64
    e.ignore(ctx + 0x18 + live, 64 - live)
    lo, hi = e.u32(ctx + 0x10), e.u32(ctx + 0x14)
    return (hi << 32 | lo) // (8 if e.side == "orig" else 1)


@case(MD5_FINAL, params=[0, 1, 3, 55, 56, 64, 119, 1000])
def md5_final(e, f, n):
    data = bytes((i * 11 + 3) & 0xFF for i in range(n))
    ctx, buf, out = e.alloc(0x58), e.alloc(data), e.alloc(16)
    e.fn(MD5_INIT)(ctx)
    e.fn(MD5_UPDATE)(ctx, buf, n)
    f(out, ctx)
    # both sides wipe the context afterwards (MD5_memset)
    digest = e.read(out, 16)
    assert digest == hashlib.md5(data).digest()
    return digest.hex()


@case(0x603440, params=[0, 1, 4, 5, 8, 16, 63, 64])
def md5_encode(e, f, n):
    words = e.alloc(random.Random(n).randbytes(68))
    out = e.alloc(random.Random(n + 1).randbytes(72))   # garbage around: round-up writes must match too
    f(out, words, n)
